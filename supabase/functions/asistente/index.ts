// =====================================================================
//  ASISTENTE — la única parte de la app que habla con Anthropic
//
//  Existe por una razón concreta: la clave de Anthropic NO puede estar en
//  la app. mockup/index.html se descarga entero en cada teléfono y el
//  repositorio es público; cualquiera sacaría la clave y gastaría la
//  cuenta. Aquí vive en el servidor, en una variable de entorno que el
//  navegador nunca ve.
//
//  Hace dos cosas:
//    apuntar → "me comí dos huevos con pan" y devuelve los alimentos
//    plan    → arma comidas sencillas que cuadren con unas calorías
//
//  Lo que NO hace: escribir en la base. Devuelve una propuesta y la app
//  la guarda por el camino de siempre, con RLS. Así esta función no
//  necesita permisos de escritura y no puede saltarse ninguna regla.
//
//  Desplegar:
//    supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//    supabase functions deploy asistente
// =====================================================================

import Anthropic from 'npm:@anthropic-ai/sdk@0.71.0';
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Tope diario por persona. Es la única defensa contra que un solo usuario
// -o un token robado- vacíe la cuenta en una noche con un bucle.
const TOPE_DIARIO = 40;

const MODELO = 'claude-opus-5';

function json(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------
//  Esquemas de salida
//
//  Van por `output_config.format`, no por "devuélveme JSON y ya": así la
//  respuesta viene garantizada con esta forma y no hay que defenderse de
//  un modelo que un día conteste con texto suelto o con un campo de más.
// ---------------------------------------------------------------------
const ESQUEMA_ALIMENTOS = {
  type: 'object',
  properties: {
    alimentos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nombre:   { type: 'string' },
          cantidad: { type: 'number' },
          unidad:   { type: 'string', enum: ['Gramos', 'Pieza', 'Taza', 'Cucharada', 'Onzas', 'Servicio'] },
          // Macros de TODA la cantidad, no de 100 g: es lo que la app apunta.
          proteina: { type: 'number' },
          carbos:   { type: 'number' },
          grasas:   { type: 'number' },
          seguridad: { type: 'string', enum: ['alta', 'media', 'baja'] },
        },
        required: ['nombre', 'cantidad', 'unidad', 'proteina', 'carbos', 'grasas', 'seguridad'],
        additionalProperties: false,
      },
    },
    // Para avisar de lo que tuvo que suponer ("no dijiste el tamaño del pan")
    nota: { type: 'string' },
  },
  required: ['alimentos', 'nota'],
  additionalProperties: false,
} as const;

const ESQUEMA_PLAN = {
  type: 'object',
  properties: {
    nombre: { type: 'string' },
    comidas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          momento: { type: 'string', enum: ['Desayuno', 'Comida', 'Cena', 'Snack'] },
          texto:   { type: 'string' },
        },
        required: ['momento', 'texto'],
        additionalProperties: false,
      },
    },
    nota: { type: 'string' },
  },
  required: ['nombre', 'comidas', 'nota'],
  additionalProperties: false,
} as const;

// ---------------------------------------------------------------------
//  Instrucciones
// ---------------------------------------------------------------------
const SISTEMA_APUNTAR = `
Conviertes en alimentos con sus macros lo que alguien comió, ya te lo
cuente por escrito, con una foto del plato, o las dos cosas a la vez.

Escribe en español de México. Da por hecho comida mexicana salvo que se
diga otra cosa: "tortilla" es de maíz, "pan" es bolillo, "queso" es fresco.

Reglas:
- Los macros son de TODA la cantidad indicada, no de 100 g. Si alguien se
  comió 2 huevos, da los macros de los 2 huevos juntos.
- Si no dicen cantidad, usa una porción normal para una persona y dilo en
  la nota. No preguntes: es mejor una estimación razonable y avisada que
  no apuntar nada.
- Separa los ingredientes que se cuentan aparte: unos huevos con tortilla
  son dos alimentos, no uno.
- "seguridad" es tu confianza en los macros. Un huevo es alta; un guisado
  casero del que no sabes la receta es baja.
- Si de plano no hay comida, devuelve la lista vacía y explica en la nota
  qué falta.

CON FOTO:
- Estima el tamaño de la porción por lo que se ve alrededor: el plato, los
  cubiertos, una mano, la lata de al lado. Di en la nota con qué lo
  comparaste.
- Lo que no puedas ver no lo inventes. El aceite del guisado, el azúcar
  del café o el relleno de algo tapado no se aprecian en una foto: si
  crees que están, dilo en la nota y marca ese alimento con seguridad
  "baja".
- Una foto casi nunca da seguridad "alta". Resérvala para lo que se
  cuenta de una mirada: dos huevos enteros, una lata cerrada con su
  etiqueta, tres tortillas.
- Si además escribieron algo, eso manda sobre lo que creas ver: quien se
  lo comió sabe mejor que tú lo que había en el plato.

Sé honesto en la nota sobre lo que tuviste que suponer. Quien la lea está
contando macros y necesita saber de qué se fía.
`.trim();

const SISTEMA_PLAN = `
Escribes planes de comida para gente que NO quiere contar nada. Abren la
app, leen qué les toca comer, y ya.

Escribe en español de México, con comida mexicana normal y corriente que
se consiga en cualquier mercado y se cocine sin complicaciones. Nada de
ingredientes raros, básculas ni porcentajes.

Reglas:
- Cada comida se describe en una o dos frases, en lenguaje de cocina:
  "dos huevos revueltos, una tortilla y un café con leche". Con medidas
  caseras -una taza, un puño, una pieza-, nunca en gramos.
- El total del día debe acercarse a las calorías que te dan, sin pasarte
  de un 5% ni quedarte corto de un 5%. Comprueba tus cuentas.
- Reparte la proteína entre todas las comidas, no toda en una.
- Varía: que no salgan tres comidas de pollo con arroz.
- En la nota va un consejo corto y práctico, si hace falta. No hables de
  macros ni de calorías: quien lo lee no quiere saber de eso.

Nunca escribas un número de calorías dentro del texto de una comida.
`.trim();

// ---------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Solo POST' }, 405);

  const clave = Deno.env.get('ANTHROPIC_API_KEY');
  if (!clave) {
    return json({ error: 'El asistente no está configurado en el servidor.' }, 503);
  }

  // --- Quién llama ---
  // Se comprueba el token de verdad contra Supabase. Sin esto la función
  // sería un endpoint abierto: cualquiera con la URL gastaría la cuenta.
  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return json({ error: 'Falta iniciar sesión.' }, 401);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const { data: quien, error: errAuth } = await admin.auth.getUser(auth.slice(7));
  if (errAuth || !quien?.user) return json({ error: 'Tu sesión caducó.' }, 401);
  const userId = quien.user.id;

  // --- ¿Le dejan usar el asistente? ---
  // El super admin puede apagárselo a alguien concreto sin suspenderle la
  // cuenta: sigue apuntando comida a mano, pero deja de gastar.
  const { data: perfil } = await admin
    .from('profiles')
    .select('ia_habilitada, activo')
    .eq('id', userId)
    .single();

  if (perfil && perfil.activo === false) {
    return json({ error: 'Tu cuenta está suspendida.' }, 403);
  }
  if (perfil && perfil.ia_habilitada === false) {
    return json({ error: 'El asistente está desactivado en tu cuenta.' }, 403);
  }

  // --- Tope diario ---
  const { data: quedan, error: errTope } = await admin.rpc('gastar_consulta_ia', {
    usuario: userId,
    tope: TOPE_DIARIO,
  });
  if (errTope) return json({ error: 'No se pudo comprobar tu uso.' }, 500);
  if (quedan === -1) {
    return json({
      error: `Llegaste a las ${TOPE_DIARIO} consultas de hoy. Mañana se reinicia.`,
    }, 429);
  }

  // --- Qué pide ---
  let cuerpo: Record<string, unknown>;
  try { cuerpo = await req.json(); }
  catch { return json({ error: 'Petición mal formada.' }, 400); }

  const accion = String(cuerpo.accion || '');

  try {
    const ia = new Anthropic({ apiKey: clave });

    if (accion === 'apuntar') {
      const texto = String(cuerpo.texto || '').trim().slice(0, 500);
      const imagen = typeof cuerpo.imagen === 'string' ? cuerpo.imagen : '';
      const tipoImagen = String(cuerpo.tipo_imagen || 'image/jpeg');

      if (!texto && !imagen) {
        return json({ error: 'Escribe qué comiste o toma una foto.' }, 400);
      }
      // La app ya reduce la foto antes de mandarla. Este tope es por si
      // alguien llama a la función por su cuenta: una imagen enorme se
      // traduce en muchos tokens, y los tokens son dinero.
      if (imagen && imagen.length > 8_000_000) {
        return json({ error: 'La foto es demasiado grande.' }, 413);
      }
      if (imagen && !['image/jpeg', 'image/png', 'image/webp'].includes(tipoImagen)) {
        return json({ error: 'Ese formato de imagen no sirve.' }, 400);
      }

      const partes: unknown[] = [];
      if (imagen) {
        partes.push({
          type: 'image',
          source: { type: 'base64', media_type: tipoImagen, data: imagen },
        });
      }
      partes.push({
        type: 'text',
        text: texto || 'Esto es lo que me comí. Dime qué lleva y sus macros.',
      });

      const r = await ia.messages.create({
        model: MODELO,
        max_tokens: 4000,
        system: SISTEMA_APUNTAR,
        // Con foto hay que mirar, calcular porciones y dudar de lo que no
        // se ve: ahí sí conviene que piense. El texto solo es extracción.
        ...(imagen ? { thinking: { type: 'adaptive' as const } } : {}),
        output_config: {
          effort: imagen ? 'medium' : 'low',
          format: { type: 'json_schema', schema: ESQUEMA_ALIMENTOS },
        },
        messages: [{ role: 'user', content: partes }],
      });

      return json({ ...leerJson(r), quedan });
    }

    if (accion === 'plan') {
      const cal = Math.round(Number(cuerpo.calorias) || 0);
      if (cal < 800 || cal > 6000) {
        return json({ error: 'Las calorías del plan no tienen sentido.' }, 400);
      }
      const nombre = String(cuerpo.nombre || '').trim().slice(0, 60);
      const gustos = String(cuerpo.gustos || '').trim().slice(0, 300);

      const r = await ia.messages.create({
        model: MODELO,
        max_tokens: 8000,
        system: SISTEMA_PLAN,
        // Cuadrar las comidas con las calorías es aritmética con criterio:
        // aquí sí conviene que piense antes de contestar.
        thinking: { type: 'adaptive' },
        output_config: {
          effort: 'medium',
          format: { type: 'json_schema', schema: ESQUEMA_PLAN },
        },
        messages: [{
          role: 'user',
          content:
            `Arma un plan de un día para ${nombre || 'esta persona'}.\n` +
            `Objetivo: unas ${cal} calorías en total, con ` +
            `${Math.round(Number(cuerpo.proteina) || 0)} g de proteína.\n` +
            (gustos ? `Ten en cuenta: ${gustos}\n` : '') +
            `Desayuno, comida y cena. Añade un snack solo si hace falta ` +
            `para llegar a las calorías.`,
        }],
      });

      return json({ ...leerJson(r), quedan });
    }

    return json({ error: 'Acción desconocida.' }, 400);

  } catch (e) {
    // El detalle real va al log de la función, no al teléfono: un mensaje
    // de error de la API puede llevar dentro trozos de la petición.
    console.error('asistente:', e);
    return json({ error: 'El asistente no pudo responder. Inténtalo de nuevo.' }, 502);
  }
});

// Con el pensamiento activado el primer bloque no es el texto, así que se
// busca por tipo en vez de dar por hecho que es content[0].
function leerJson(r: { content: Array<{ type: string; text?: string }> }) {
  const bloque = r.content.find((b) => b.type === 'text');
  if (!bloque?.text) throw new Error('respuesta sin texto');
  return JSON.parse(bloque.text);
}
