// =====================================================================
//  ASISTENTE — la única parte de la app que habla con Anthropic
//
//  Existe por una razón concreta: la clave de Anthropic NO puede estar en
//  la app. docs/index.html se descarga entero en cada teléfono y el
//  repositorio es público; cualquiera sacaría la clave y gastaría la
//  cuenta. Aquí vive en el servidor, en una variable de entorno que el
//  navegador nunca ve.
//
//  Hace tres cosas:
//    chat    → conversación: apuntar, recomendar qué comer, lista del súper
//    apuntar → la versión directa, sin conversación
//    plan    → arma comidas de un día o de una semana
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

// OJO CON ESTA LISTA. El navegador, antes de mandar la petición de
// verdad, pregunta si puede usar estas cabeceras. Si falta una sola de
// las que la app envía, la respuesta es que no y la petición real NUNCA
// sale: en el teléfono se ve un "Load failed" sin más explicación, y en
// el registro de la función no aparece ningún error, porque la petición
// no llegó.
//
// `apikey` es la que faltaba: sbFetch la manda en TODAS las llamadas.
// curl no hace esa pregunta previa, asi que probar con curl da verde
// aunque el navegador esté bloqueado. Hay que probarlo desde el navegador.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

// Tope diario por persona. Es la única defensa contra que un solo usuario
// -o un token robado- vacíe la cuenta en una noche con un bucle.
// Cinco al dia. Con 10 personas, el peor caso posible pasa de ~$12 diarios
// a ~$1.50: es lo que convierte "se me pueden ir los 5 dolares en una
// tarde" en "no puede pasar". Un uso normal no llega ni de lejos — apuntar
// un par de comidas y preguntar algo cabe de sobra.
const TOPE_DIARIO = 5;

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

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const;

const ESQUEMA_PLAN = {
  type: 'object',
  properties: {
    nombre: { type: 'string' },
    comidas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          // Sin día = plan de un día, que es como estaba. Con día = semana.
          // Así la app vieja y la nueva leen la misma columna.
          dia:     { type: 'string', enum: DIAS as unknown as string[] },
          momento: { type: 'string', enum: ['Desayuno', 'Comida', 'Cena', 'Snack'] },
          texto:   { type: 'string' },
        },
        required: ['dia', 'momento', 'texto'],
        additionalProperties: false,
      },
    },
    nota: { type: 'string' },
  },
  required: ['nombre', 'comidas', 'nota'],
  additionalProperties: false,
} as const;

// Para el plan de un solo día se reutiliza el mismo esquema sin el día.
const ESQUEMA_PLAN_DIA = {
  ...ESQUEMA_PLAN,
  properties: {
    ...ESQUEMA_PLAN.properties,
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
  },
} as const;

// Lo que se ve en el chat: un texto y, si viene al caso, alimentos que se
// pueden apuntar de un toque. Los dos campos van siempre para no tener que
// adivinar en la app si el modelo devolvió una cosa u otra.
// Un evento que la persona mencionó de pasada: "el viernes tengo cena".
//
// `falta` es lo que hace que esto sea una conversación y no un formulario.
// El modelo dice qué le queda por saber, la app no enseña nada hasta que la
// lista está vacía, y mientras tanto se pregunta como preguntaría una
// persona. Sin esto habría que sacar tres campos en pantalla, que es justo
// lo que no se quiere.
const ESQUEMA_EVENTO = {
  type: 'object',
  properties: {
    titulo:    { type: 'string' },
    fecha:     { type: 'string' },          // AAAA-MM-DD
    calorias:  { type: 'integer' },
    bebidas:   { type: 'integer' },
    prioridad: { type: 'string', enum: ['comida', 'bebida', 'ambas'] },
    falta: {
      type: 'array',
      items: { type: 'string', enum: ['calorias', 'bebidas', 'prioridad'] },
    },
  },
  required: ['titulo', 'fecha', 'calorias', 'bebidas', 'prioridad', 'falta'],
  additionalProperties: false,
} as const;

const ESQUEMA_CHAT = {
  type: 'object',
  properties: {
    respuesta: { type: 'string' },
    alimentos: ESQUEMA_ALIMENTOS.properties.alimentos,
    // null casi siempre: solo se llena cuando de verdad hay un plan futuro.
    evento: { anyOf: [{ type: 'null' }, ESQUEMA_EVENTO] },
  },
  required: ['respuesta', 'alimentos', 'evento'],
  additionalProperties: false,
} as const;

// ---------------------------------------------------------------------
//  Instrucciones
// ---------------------------------------------------------------------
// Las reglas de cómo se convierte comida en macros. Van aparte porque las
// usan los dos caminos -el de apuntar y el del chat- y duplicarlas
// garantizaría que un día se corrija una y la otra no.
const SISTEMA_APUNTAR_REGLAS = `

CÓMO SE APUNTA LA COMIDA (cuando llenes "alimentos"):

Da por hecho comida mexicana salvo que se diga otra cosa: "tortilla" es de
maíz, "pan" es bolillo, "queso" es fresco.

Reglas:
- Los macros son de TODA la cantidad indicada, no de 100 g. Si alguien se
  comió 2 huevos, da los macros de los 2 huevos juntos.
- Si no dicen cantidad, usa una porción normal para una persona y dilo.
  No preguntes: es mejor una estimación razonable y avisada que no
  apuntar nada.
- Separa los ingredientes que se cuentan aparte: unos huevos con tortilla
  son dos alimentos, no uno.
- "seguridad" es tu confianza en los macros. Un huevo es alta; un guisado
  casero del que no sabes la receta es baja.
- Si no te están contando una comida, deja la lista vacía. No hay que
  llenarla por llenarla.

CON FOTO:
- Estima el tamaño de la porción por lo que se ve alrededor: el plato, los
  cubiertos, una mano, la lata de al lado. Di con qué lo comparaste.
- Lo que no puedas ver no lo inventes. El aceite del guisado, el azúcar
  del café o el relleno de algo tapado no se aprecian en una foto: si
  crees que están, dilo y marca ese alimento con seguridad "baja".
- Una foto casi nunca da seguridad "alta". Resérvala para lo que se
  cuenta de una mirada: dos huevos enteros, una lata cerrada con su
  etiqueta, tres tortillas.
- Si además escribieron algo, eso manda sobre lo que creas ver: quien se
  lo comió sabe mejor que tú lo que había en el plato.

Sé honesto sobre lo que tuviste que suponer. Quien lo lea está contando
macros y necesita saber de qué se fía.
`;

const SISTEMA_APUNTAR = `
Conviertes en alimentos con sus macros lo que alguien comió, ya te lo
cuente por escrito, con una foto del plato, o las dos cosas a la vez.

Escribe en español de México. En "nota" va lo que tuviste que suponer.
Si de plano no hay comida, devuelve la lista vacía y explica qué falta.
` + SISTEMA_APUNTAR_REGLAS;

const SISTEMA_CHAT = `
Eres el asistente de una app de conteo de macros. Hablas español de
México, de tú, corto y sin rodeos. Nada de listas con viñetas para
responder algo simple.

Haces tres cosas:

1. APUNTAR COMIDA. Si te cuentan lo que comieron -o te mandan foto del
   plato- devuelves los alimentos en "alimentos", con las mismas reglas
   de siempre: macros de toda la cantidad, crudo o cocido según toque, y
   la confianza de cada uno. En "respuesta" pones una frase corta
   diciendo qué entendiste. NO repitas ahí los macros: ya se ven en las
   tarjetas.

2. RECOMENDAR QUÉ COMER. Con lo que les queda del día, propones opciones
   concretas y fáciles: qué, más o menos cuánto, y por qué encaja. Dos o
   tres, no diez. Si ya no les queda casi nada, dilo claro en vez de
   inventar una comida de 80 calorías.

3. LISTA DEL SÚPER. Una lista corta y agrupada por pasillo, con lo que
   necesitan para comer así una semana. Cosas de mercado y de precio
   normal. Sin cantidades exactas al gramo: "un kilo de pollo", "una
   docena de huevos".

Si te preguntan otra cosa relacionada con comer, entrena o los macros,
contesta normal y deja "alimentos" vacío. Si te preguntan algo que no
tiene nada que ver, dilo en una línea y ofrece ayudar con lo tuyo.

Nunca des consejo médico ni hables de enfermedades, medicamentos o
suplementos para tratar algo. Si te lo piden, di que eso lo ve un
profesional.

Los macros que te paso son los de HOY de esa persona. Úsalos: no es lo
mismo recomendar con 1.400 calorías libres que con 200.
`.trim();

const ESQUEMA_SEMANA = {
  type: 'object',
  properties: {
    // Lo que lee la persona. Es lo único que ve.
    mensaje:   { type: 'string' },
    ajusto:    { type: 'boolean' },
    cal_nueva: { anyOf: [{ type: 'null' }, { type: 'integer' }] },
    // Para el historial, no para la pantalla: por qué se hizo lo que se hizo.
    motivo:    { type: 'string' },
  },
  required: ['mensaje', 'ajusto', 'cal_nueva', 'motivo'],
  additionalProperties: false,
} as const;

const SISTEMA_SEMANA = `
Eres el entrenador de esta persona y estás cerrando su semana. Hablas
español de México, de tú, corto y humano.

Decides si tocarle las calorías de la semana que entra.

QUÉ MIRAS, EN ESTE ORDEN

1. Si hay material. Si te digo que NO hay material para ajustar, NO
   ajustas. Punto. Pon ajusto en false y cal_nueva en null.
2. Cómo se siente. Hambre alta y energía baja durante una semana entera
   significa que el déficit es demasiado, aunque el peso vaya bien.
   Bajarle más calorías a alguien así es como se abandona una dieta.
3. El peso, y la TENDENCIA, no el último número. Un kilo arriba de un día
   para otro es agua, no grasa.

CUÁNTO MUEVES

Poco. Entre 100 y 200 calorías. Nadie necesita saltos de 400, y una
corrección chica se puede repetir la semana que viene; una grande no se
puede deshacer.

Si todo va bien y se siente bien, no toques nada. Que algo funcione es
razón para dejarlo, no para moverlo.

CUANDO NO HAY MATERIAL

Este es el caso delicado. Esa persona apuntó dos o tres días y no hay de
dónde sacar conclusiones. Lo que NO haces:

- No la regañas. Ni un poco. Ni "recuerda que es importante apuntar".
- No le haces sentir que falló ni que te decepcionó.
- No inventas un ajuste para que parezca que hiciste algo.

Lo que haces: le dices la verdad, que es que con lo que hay no puedes
leer su semana, y que prefieres no moverle las calorías a ciegas. Eso es
cuidado, no reproche, y así tiene que sonar.

Ejemplo del tono:
  "Esta semana quedaron pocos días apuntados, así que prefiero no
   moverte nada todavía. No quiero cambiarte las calorías adivinando.
   Si la próxima me apuntas aunque sea la mayoría de los días, ya te leo
   bien y ajustamos. Seguimos."

Y si la semana fue buena, dilo. La gente necesita oírlo mucho más de lo
que necesita un número:
  "Esta semana la hiciste muy bien."

REGLAS DURAS

- "mensaje" no lleva cifras salvo las calorías nuevas, y solo si ajustaste.
- Nada de listas ni viñetas. Dos o tres frases.
- Nunca consejo médico.
- "motivo" es aparte, para el historial: ahí sí sé concreto y técnico.
`.trim();

// Solo para IA Plus. Va aparte y no dentro de SISTEMA_CHAT porque a quien
// no lo tiene contratado no se le puede ni insinuar: si el modelo lo lee,
// acaba ofreciéndolo, y prometer algo que la app va a negar después es peor
// que no ofrecerlo.
const SISTEMA_EVENTOS = `

4. EVENTOS. La gente cuenta sus planes de pasada: "el sábado hay boda",
   "el viernes salgo a cenar", "este finde me voy de viaje". Cuando pase,
   llena "evento" en vez de dejarlo en null.

   Esto NO es un fallo de nadie ni algo que haya que evitar. Una boda es
   una boda. Lo que se hace es dejarle sitio en la semana de ANTES, que es
   lo que hace cualquiera que sepa comer.

   Te faltan tres datos y los pides CONVERSANDO, uno o dos por mensaje,
   nunca los tres de golpe ni como cuestionario:
     - calorías: cuánto quiere apartar para ese día.
     - bebidas: cuántas copas o cervezas espera tomar.
     - prioridad: si prefiere gastar en comida o en bebida.

   Pon en "falta" los que todavía no sabes. Mientras "falta" tenga algo,
   la app no guarda nada: solo se ve tu pregunta.

   Si te dan una pista de cuánto ("me voy a poner morado", "solo voy a
   cenar ligero"), propón tú un número y pide que lo confirmen. Es más
   fácil decir "sí" que inventarse una cifra. Referencias: una cena fuera
   normal son unas 800 de más; una boda con barra libre, entre 1.500 y
   2.500; un asado, unas 1.200. Una copa son ~150 calorías.

   La fecha va en AAAA-MM-DD. "El viernes" es el viernes que viene, no el
   que pasó. Si no queda claro qué día es, pregúntalo: apartar calorías
   para el día equivocado es peor que no apartarlas.

   Cuando ya no falte nada, tu "respuesta" es la de un entrenador que ya
   lo resolvió, no la de un sistema que confirma una operación:
     "Listo, el viernes ya tiene su espacio."
     "No te preocupes por eso, lo acomodé en la semana."
   Nada de "he registrado el evento con 1200 calorías reservadas".

CÓMO HABLAS

Como un entrenador que lleva años con esa persona, no como una app.
Frases cortas. Sin cifras que no hagan falta: si ya reorganizaste la
semana, no hace falta enseñar la cuenta.

Bien:  "Detecté que el viernes cenarás fuera. Ya hice espacio."
       "Esta semana lo hiciste muy bien."
       "Tranquilo, seguimos avanzando."
Mal:   "Se han redistribuido 1.200 kcal entre los días 12, 13 y 14."

Nunca regañes. Nadie sigue a alguien que le hace sentir mal.
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

BARATO Y FÁCIL. Es un requisito, no un adorno:
- Ingredientes de mercado o de la tienda de la esquina: huevo, pollo,
  atún, frijol, avena, tortilla, verdura de temporada. Nada de salmón a
  diario ni de cosas que solo hay en tienda grande.
- Que se prepare en veinte minutos y con una sola sartén u olla. Quien
  usa esto no quiere cocinar, quiere comer.
- Repite ingredientes entre días a propósito: una bolsa de zanahoria
  usada tres veces sale más barata que siete verduras distintas, y sobra
  menos comida.

SI ES PARA UNA SEMANA:
- Los siete días, cada uno con su nombre. No escribas "igual que el
  lunes": repite la comida entera, porque quien lo lee ve un día a la vez.
- Varía dentro de lo razonable. Ni siete cenas de pollo, ni siete recetas
  distintas que obliguen a comprar de todo.
- Cada día cuadra con las calorías POR SÍ SOLO, no de promedio: nadie se
  come el promedio de la semana.

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
    .select('ia_habilitada, activo, nivel_ia')
    .eq('id', userId)
    .single();

  if (perfil && perfil.activo === false) {
    return json({ error: 'Tu cuenta está suspendida.' }, 403);
  }
  if (perfil && perfil.ia_habilitada === false) {
    return json({ error: 'El asistente está desactivado en tu cuenta.' }, 403);
  }

  // Tres niveles: apagada / normal / plus. Lo que sigue a partir de aquí se
  // reparte entre los dos últimos.
  //
  // El `?? 'normal'` no es pereza: si la columna todavía no existe -porque
  // la migración va por detrás del despliegue- el asistente tiene que seguir
  // funcionando como antes en vez de dejar a todo el mundo fuera.
  const nivel = String(perfil?.nivel_ia ?? 'normal');
  const esPlus = nivel === 'plus';

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

      const salida = leerJson(r);
      salida.alimentos = await afinarConCatalogo(admin, salida.alimentos || []);
      return json({ ...salida, quedan });
    }

    if (accion === 'chat') {
      const historial = Array.isArray(cuerpo.mensajes) ? cuerpo.mensajes : [];
      const imagen = typeof cuerpo.imagen === 'string' ? cuerpo.imagen : '';
      const tipoImagen = String(cuerpo.tipo_imagen || 'image/jpeg');

      if (!historial.length && !imagen) {
        return json({ error: 'Escribe algo o manda una foto.' }, 400);
      }
      if (imagen && imagen.length > 8_000_000) {
        return json({ error: 'La foto es demasiado grande.' }, 413);
      }

      // El contexto del día va en el sistema y no en el mensaje: así no se
      // repite en cada turno de la conversación ni se puede confundir con
      // algo que escribió la persona.
      const m = (cuerpo.macros ?? {}) as Record<string, number>;
      const contexto = m.meta_cal
        ? `\n\nHOY, esta persona:\n` +
          `- Meta: ${Math.round(m.meta_cal)} cal · P${Math.round(m.meta_p)} ` +
          `C${Math.round(m.meta_c)} G${Math.round(m.meta_g)}\n` +
          `- Lleva: ${Math.round(m.hoy_cal || 0)} cal · P${Math.round(m.hoy_p || 0)} ` +
          `C${Math.round(m.hoy_c || 0)} G${Math.round(m.hoy_g || 0)}\n` +
          `- Le quedan: ${Math.round((m.meta_cal || 0) - (m.hoy_cal || 0))} cal · ` +
          `P${Math.round((m.meta_p || 0) - (m.hoy_p || 0))} ` +
          `C${Math.round((m.meta_c || 0) - (m.hoy_c || 0))} ` +
          `G${Math.round((m.meta_g || 0) - (m.hoy_g || 0))}`
        : '';

      // "El viernes" no significa nada sin saber qué día es hoy, y el
      // modelo no lo sabe. La zona la manda el cliente porque el servidor
      // corre en UTC: a las 8 de la noche en México allí ya es mañana, y
      // apartar calorías para el día equivocado es peor que no apartarlas.
      let hoyEs = '';
      try {
        const zona = String(cuerpo.zona || 'America/Mexico_City');
        const f = (o: Intl.DateTimeFormatOptions) =>
          new Intl.DateTimeFormat('es-MX', { timeZone: zona, ...o }).format(new Date());
        const iso = new Intl.DateTimeFormat('en-CA', {
          timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(new Date());
        hoyEs = `\n\nHOY es ${f({ weekday: 'long' })} ${iso}.`;
      } catch {
        // Zona inválida: mejor sin fecha que reventar la conversación. El
        // modelo preguntará qué día es, que es lo correcto si no lo sabe.
        hoyEs = '';
      }

      // Solo los últimos turnos: una conversación larga se paga entera en
      // cada mensaje, y para esto no hace falta recordar más atrás.
      const mensajes = historial.slice(-12).map((x: Record<string, unknown>) => ({
        role: x.rol === 'yo' ? 'user' : 'assistant',
        content: String(x.texto || '').slice(0, 2000),
      })).filter((x) => x.content);

      if (imagen) {
        const ultimo = mensajes[mensajes.length - 1];
        const texto = ultimo && ultimo.role === 'user' ? ultimo.content : '';
        if (ultimo && ultimo.role === 'user') mensajes.pop();
        mensajes.push({
          role: 'user',
          // deno-lint-ignore no-explicit-any
          content: [
            { type: 'image', source: { type: 'base64', media_type: tipoImagen, data: imagen } },
            { type: 'text', text: texto || 'Esto es lo que me comí.' },
          ] as any,
        });
      }
      if (!mensajes.length) return json({ error: 'Escribe algo.' }, 400);

      const r = await ia.messages.create({
        model: MODELO,
        max_tokens: imagen ? 4000 : 2000,
        system: SISTEMA_CHAT + (esPlus ? SISTEMA_EVENTOS : '') +
                SISTEMA_APUNTAR_REGLAS + hoyEs + contexto,
        ...(imagen ? { thinking: { type: 'adaptive' as const } } : {}),
        output_config: {
          effort: imagen ? 'medium' : 'low',
          format: { type: 'json_schema', schema: ESQUEMA_CHAT },
        },
        messages: mensajes,
      });

      const salida = leerJson(r);
      salida.alimentos = await afinarConCatalogo(admin, salida.alimentos || []);
      // Cinturón además de tirantes: a quien no tiene Plus no se le manda
      // evento aunque el modelo se lo invente. Quitarlo aquí es una línea;
      // confiar en que el prompt siempre se respete no es una garantía.
      if (!esPlus) salida.evento = null;
      return json({ ...salida, quedan, nivel });
    }

    // ---- Ajuste semanal de calorías ----
    //
    // Lo que decide NO es el peso solo. Bajar 800 g pasando hambre y sin
    // energía no es lo mismo que bajarlos cómodo, y subir 300 g después de
    // una semana de fiesta no significa que sobren calorías.
    //
    // Y hay un caso que no es un ajuste: cuando la persona apenas registró.
    // Ahí no se toca nada. No por castigo -eso no sirve para nada- sino
    // porque con tres días apuntados no hay de dónde deducir. Decirlo sin
    // regañar es la mitad del trabajo de esta función.
    if (accion === 'semana') {
      if (!esPlus) {
        return json({
          error: 'El ajuste semanal es parte de IA Plus.',
          nivel,
        }, 403);
      }

      const d = (cuerpo.datos ?? {}) as Record<string, number>;
      const diasApuntados = Math.max(0, Math.round(Number(d.dias_apuntados) || 0));
      const pesos = Array.isArray(cuerpo.pesos) ? cuerpo.pesos.slice(-8) : [];

      // El corte está en 4 de 7 y no en 7 de 7: exigir la semana perfecta
      // dejaría a casi todo el mundo sin ajuste nunca. Con cuatro días hay
      // una media que significa algo; con menos, no.
      const hayMaterial = diasApuntados >= 4 && pesos.length >= 2;

      const encuesta = (cuerpo.chequeo ?? {}) as Record<string, number>;
      const contexto =
        `\n\nESTA SEMANA:\n` +
        `- Días que apuntó: ${diasApuntados} de 7\n` +
        `- Meta diaria actual: ${Math.round(Number(d.meta_cal) || 0)} cal\n` +
        `- Promedio de lo que comió: ${Math.round(Number(d.media_cal) || 0)} cal\n` +
        `- Pesos apuntados: ${pesos.length ? pesos.join(', ') + ' kg' : 'ninguno'}\n` +
        `- Hambre: ${encuesta.hambre ?? '—'}/5 · Energía: ${encuesta.energia ?? '—'}/5 · ` +
        `Apetito: ${encuesta.apetito ?? '—'}/5  (3 = normal)\n` +
        (cuerpo.nota ? `- Dice: "${String(cuerpo.nota).slice(0, 300)}"\n` : '') +
        `- ¿Hay material para ajustar?: ${hayMaterial ? 'sí' : 'NO'}`;

      const r = await ia.messages.create({
        model: MODELO,
        max_tokens: 2000,
        system: SISTEMA_SEMANA + contexto,
        thinking: { type: 'adaptive' as const },
        output_config: {
          effort: 'medium',
          format: { type: 'json_schema', schema: ESQUEMA_SEMANA },
        },
        messages: [{ role: 'user', content: 'Revisa mi semana.' }],
      });

      const salida = leerJson(r);
      // El "no hay material" lo decide el código, no el modelo. Un modelo
      // convencido de que puede ayudar ajusta igual, y ese es justo el
      // gasto de tokens y de confianza que se quiere evitar.
      if (!hayMaterial) { salida.ajusto = false; salida.cal_nueva = null; }
      return json({ ...salida, quedan, nivel });
    }

    if (accion === 'plan') {
      const cal = Math.round(Number(cuerpo.calorias) || 0);
      if (cal < 800 || cal > 6000) {
        return json({ error: 'Las calorías del plan no tienen sentido.' }, 400);
      }
      const nombre = String(cuerpo.nombre || '').trim().slice(0, 60);
      const gustos = String(cuerpo.gustos || '').trim().slice(0, 300);
      const semana = cuerpo.semana === true;

      // EN STREAMING, y no por capricho: una petición larga sin streaming se
      // queda esperando la respuesta entera y la conexión se corta antes de
      // llegar. Es lo que rompía "armar la semana completa" -pedía 32.000
      // tokens de una sentada- mientras que el plan de un día, mucho más
      // corto, sí llegaba. Se recogen los trozos y se devuelve el mensaje
      // completo, así que para quien llama no cambia nada.
      const flujo = ia.messages.stream({
        model: MODELO,
        // Siete días son siete veces más texto. Con el tope de un día se
        // cortaría a mitad del jueves.
        max_tokens: semana ? 24000 : 8000,
        system: SISTEMA_PLAN,
        // Cuadrar las comidas con las calorías es aritmética con criterio:
        // aquí sí conviene que piense antes de contestar.
        thinking: { type: 'adaptive' },
        output_config: {
          // Cuadrar siete días distintos con las mismas calorías cada uno
          // es bastante más trabajo que cuadrar uno.
          effort: semana ? 'high' : 'medium',
          format: {
            type: 'json_schema',
            schema: semana ? ESQUEMA_PLAN : ESQUEMA_PLAN_DIA,
          },
        },
        messages: [{
          role: 'user',
          content:
            (semana
              ? `Arma un plan de UNA SEMANA COMPLETA (lunes a domingo) para ${nombre || 'esta persona'}.\n`
              : `Arma un plan de un día para ${nombre || 'esta persona'}.\n`) +
            `Objetivo: unas ${cal} calorías ${semana ? 'AL DÍA' : 'en total'}, con ` +
            `${Math.round(Number(cuerpo.proteina) || 0)} g de proteína.\n` +
            (gustos ? `Ten en cuenta: ${gustos}\n` : '') +
            `Desayuno, comida y cena. Añade un snack solo si hace falta ` +
            `para llegar a las calorías.`,
        }],
      });

      const r = await flujo.finalMessage();
      return json({ ...leerJson(r), quedan });
    }

    return json({ error: 'Acción desconocida.' }, 400);

  } catch (e) {
    // El detalle real va al log de la función, no al teléfono: un mensaje
    // de error de la API puede llevar dentro trozos de la petición.
    //
    // Pero el NOMBRE del error sí viaja. Sin él, "no pudo responder" era lo
    // único que se veía y no había forma de saber si fue un tiempo agotado,
    // la clave, o la respuesta cortada; se perdió un rato averiguándolo.
    // El nombre no lleva datos de nadie.
    console.error('asistente:', e);
    const clase = (e && typeof e === 'object' && 'name' in e) ? String(e.name) : 'Error';
    return json({
      error: 'El asistente no pudo responder. Inténtalo de nuevo. (' + clase + ')',
    }, 502);
  }
});

// ---------------------------------------------------------------------
//  Cambiar la estimación del modelo por el dato del catálogo
//
//  El modelo es bueno reconociendo QUÉ hay y CUÁNTO hay; para los macros
//  exactos hay una tabla de USDA, y un dato medido siempre gana a uno
//  recordado. Así que se le respeta la cantidad y se le corrigen las
//  cifras.
//
//  Solo cuando el nombre coincide de verdad: si alguien apuntó "guisado
//  de la abuela", no hay entrada de catálogo que valga y se queda la
//  estimación, marcada como tal.
// ---------------------------------------------------------------------
async function afinarConCatalogo(
  admin: { rpc: (f: string, p: Record<string, unknown>) => Promise<{ data: unknown }> },
  alimentos: Array<Record<string, unknown>>,
) {
  for (const a of alimentos) {
    const nombre = String(a.nombre || '').trim();
    if (nombre.length < 3) continue;

    let filas: Array<Record<string, unknown>> = [];
    try {
      const { data } = await admin.rpc('buscar_catalogo', { p_texto: nombre, p_limite: 8 });
      filas = Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
    } catch { continue; }
    if (!filas.length) continue;

    // El modelo ya dijo si estaba crudo o cocido dentro del nombre; se
    // usa para elegir la fila correcta. Sin esto, "arroz cocido" podría
    // acabar con los macros del crudo, que son casi el triple.
    const n = nombre.toLowerCase();
    const quiereCocido = /cocid|hervid|asad|frit|guisad|a la plancha|al horno/.test(n);
    const quiereCrudo  = /crud|fresc/.test(n);

    const mejor = filas.find((f) =>
        (quiereCocido && f.estado === 'cocido') ||
        (quiereCrudo  && f.estado === 'crudo')  ||
        (!quiereCocido && !quiereCrudo && f.estado === 'unico'))
      ?? filas[0];

    // Los macros del catálogo son por 100 g. Se llevan a la cantidad que
    // dijo el modelo, traduciendo su unidad a gramos. Para piezas y tazas
    // se usa el peso de la porción que trae el propio catálogo; si no lo
    // tiene, no hay forma honesta de convertir y se deja la estimación.
    const cant = Number(a.cantidad) || 1;
    const porG = Number(mejor.porcion_g) || 0;
    const gramos = a.unidad === 'Gramos' ? cant
                 : a.unidad === 'Onzas'  ? cant * 28.35
                 : porG ? cant * porG
                 : 0;
    if (!gramos) continue;
    const k = gramos / 100;

    a.proteina = Math.round(Number(mejor.proteina) * k * 10) / 10;
    a.carbos   = Math.round(Number(mejor.carbos)   * k * 10) / 10;
    a.grasas   = Math.round(Number(mejor.grasas)   * k * 10) / 10;
    a.seguridad = 'alta';                 // ya no es estimación: es tabla
    a.catalogo  = mejor.nombre;           // para que la app lo pueda decir
  }
  return alimentos;
}

// Con el pensamiento activado el primer bloque no es el texto, así que se
// busca por tipo en vez de dar por hecho que es content[0].
function leerJson(r: { content: Array<{ type: string; text?: string }> }) {
  const bloque = r.content.find((b) => b.type === 'text');
  if (!bloque?.text) throw new Error('respuesta sin texto');
  return JSON.parse(bloque.text);
}
