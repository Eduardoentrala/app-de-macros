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
// Un tope por plan, y no uno solo para todos.
//
// Con un tope único de 5 para los dos planes, quien paga 99 puede gastar
// exactamente lo mismo que quien paga 199. Con los costes reales medidos
// —$0.024 el chat, $0.046 con foto— cinco consultas con foto al día son
// unos $7 al mes. De 99 pesos quedan ~$4.75 netos: cada usuario intenso
// del plan barato daba PÉRDIDAS, y cuanto más le gustaba la app, más.
//
// Con 3 y 15 las cuentas cambian:
//   normal  3 × $0.046 × 30 = $4.14 de coste sobre $4.75  → justo, pero no pierde
//   plus   15 × $0.046 × 30 = $20.7 en el peor caso absoluto
//
// El tope de Plus es alto a propósito: nadie manda quince fotos al día
// treinta días seguidos. El uso real ronda las 3-4, y el tope está para que
// un token robado no vacíe la cuenta en una noche, no para racionar.
const TOPES = { apagada: 0, normal: 3, plus: 15 } as const;

const MODELO = 'claude-opus-5';

function json(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------
//  Las fotos que llegan con el mensaje
// ---------------------------------------------------------------------
//  Hasta cuatro. Antes era UNA, y apuntar un plato del que hacen falta dos
//  ángulos —o una comida de varios platos— obligaba a mandarlas de una en
//  una, gastando una consulta del tope por cada foto.
//
//  ACEPTA LAS DOS FORMAS, y no por gusto: la app se despliega en GitHub
//  Pages y esta función en Supabase, por separado. Entre un despliegue y el
//  otro hay minutos en que una versión vieja de la app le habla a la nueva
//  función. Si solo entendiera `imagenes`, en esos minutos las fotos
//  dejarían de funcionar sin que nadie lo notara.
//
//    · `imagen` + `tipo_imagen`  — una sola, como toda la vida
//    · `imagenes: [{ datos, tipo }]` — hasta cuatro
//
//  Devuelve la lista, o un TEXTO con el motivo si algo no cuadra. Se
//  devuelve el motivo en vez de lanzar para que cada acción conteste con su
//  propio 400 y el tope diario no se gaste en una petición mal formada.
const TOPE_FOTOS = 4;
const TIPOS_FOTO = ['image/jpeg', 'image/png', 'image/webp'];

function leerImagenes(cuerpo: Record<string, unknown>): Array<{ datos: string; tipo: string }> | string {
  const crudas: Array<{ datos: string; tipo: string }> = [];

  if (Array.isArray(cuerpo.imagenes)) {
    for (const x of cuerpo.imagenes) {
      const o = (x || {}) as Record<string, unknown>;
      const datos = typeof o.datos === 'string' ? o.datos : '';
      if (!datos) continue;
      crudas.push({ datos, tipo: String(o.tipo || 'image/jpeg') });
    }
  }
  // La forma antigua. Si vienen las dos, mandan las nuevas: una app que ya
  // sabe mandar la lista pone la primera foto también en `imagen` para no
  // romper a la función vieja, y contarla dos veces la duplicaría.
  if (!crudas.length && typeof cuerpo.imagen === 'string' && cuerpo.imagen) {
    crudas.push({ datos: cuerpo.imagen, tipo: String(cuerpo.tipo_imagen || 'image/jpeg') });
  }

  if (crudas.length > TOPE_FOTOS) {
    return `Son demasiadas fotos: ${TOPE_FOTOS} como mucho.`;
  }
  // Los topes van por foto Y por total. Cuatro de siete megas y medio cada
  // una pasarían el tope de una en una y sumarían treinta: la app las reduce
  // antes de mandarlas, pero esto no se fía de la app —cualquiera puede
  // llamar a la función por su cuenta, y los tokens son dinero—.
  let suma = 0;
  for (const f of crudas) {
    if (f.datos.length > 8_000_000) return 'La foto es demasiado grande.';
    if (!TIPOS_FOTO.includes(f.tipo)) return 'Ese formato de imagen no sirve.';
    suma += f.datos.length;
  }
  if (suma > 16_000_000) return 'Entre todas las fotos pesan demasiado.';

  return crudas;
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
    // La memoria COMPLETA reescrita, o null si no hay nada nuevo que
    // recordar. Completa y no un añadido: ver SISTEMA_MEMORIA.
    memoria: { anyOf: [{ type: 'null' }, { type: 'string' }] },
  },
  required: ['respuesta', 'alimentos', 'evento', 'memoria'],
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
2. Cómo se siente, Y DESDE CUÁNDO. Esto es lo que más se equivoca.

   Una semana suelta casi no dice nada: hambre 4 de 5 pudo ser una mala
   semana, una fiesta o un mal día. Lo que significa algo es la RACHA. Si
   te paso las semanas anteriores, míralas antes de decidir:

   - Hambre alta UNA semana → no muevas nada por eso. Anótalo y espera.
   - Hambre alta DOS O TRES seguidas → ahí sí. El déficit es demasiado
     aunque el peso vaya bien, y seguir apretando es como se abandona una
     dieta. Súbele.
   - Algo que venía mal y esta semana mejoró → dilo. Que alguien note que
     lo estás siguiendo vale más que el ajuste.

   Y ANTES DE TOCAR NADA, MIRA EL SUEÑO. Dormir mal produce exactamente
   las mismas respuestas que un déficit excesivo: hambre alta y energía
   baja. Son problemas distintos con soluciones opuestas.

   - Hambre alta + energía baja + sueño MALO → el problema es el descanso,
     no la comida. NO le muevas las calorías: no arreglan dormir cinco
     horas. Díselo tal cual, sin sermón.
   - Hambre alta + energía baja + sueño BIEN → ahora sí, el déficit es
     demasiado.

   Confundir estos dos casos es mover calorías por un problema que no está
   en la comida, y eso no se arregla nunca.
3. El peso, y la TENDENCIA, no el último número.

   Esto es lo que separa a un entrenador de una calculadora. El peso de UNA
   semana miente casi siempre: agua, sal, glucógeno y lo que uno tenga
   dentro mueven un kilo sin que haya cambiado nada de grasa. Sobre una
   semana no se puede distinguir "no bajó" de "bajó y todavía no se ve".

   Te paso las CUATRO semanas anteriores con su peso medio. Úsalas:

   - Mira el peso MEDIO de cada semana, no el último número suelto. Cuatro
     medias seguidas dicen la verdad; cuatro pesos de cuatro días, no.
   - Una semana plana dentro de un mes que baja → todo va bien. No toques
     nada y dilo, porque quien la mira sola cree que falló.
   - Tres o cuatro semanas planas seguidas → ahí sí hay estancamiento, y
     ahí sí se ajusta.
   - Si solo hay una o dos semanas de historia, DILO y sé prudente: aún no
     hay tendencia que leer y mover calorías sería adivinar.

   Lo mismo con lo que come: una semana de pocos días apuntados dentro de
   un mes bueno es un tropiezo, no un patrón. Cuatro seguidas sí lo son, y
   se dicen sin regañar.
4. El entreno, si te lo paso. Un peso plano NO significa lo mismo según lo
   que pase en el gimnasio, y confundirlo es el error más caro que puedes
   cometer aquí:

   - Peso plano y volumen SUBIENDO → está funcionando. Ganó músculo y
     perdió grasa a la vez, y la báscula no lo enseña. NO le toques nada, y
     dile por qué: mucha gente abandona justo aquí creyendo que falló.
   - Peso plano y volumen plano → ahí sí hay estancamiento de verdad.
   - Peso plano y entrenó poco o nada → no le faltan calorías, le falta
     estímulo. Ajustar aquí no arregla nada.

5. La cintura, si te la paso. Es lo único que distingue perder grasa de
   perder peso, y manda sobre la báscula cuando se contradicen.

   - Peso plano y cintura BAJANDO → está perdiendo grasa. No le toques
     nada y díselo, porque la báscula le está mintiendo y mucha gente
     abandona justo aquí creyendo que no avanza.
   - Peso bajando y cintura QUIETA → cuidado, puede estar perdiendo
     músculo o agua. No aprietes más.

   Se mide una vez al mes, así que compara meses, NUNCA dos medidas
   seguidas de días distintos: la cinta más o menos apretada ya mueve un
   centímetro, y eso es más de lo que cambia una cintura en una semana.
   Si solo hay una medida, no saques conclusiones: dilo y ya.

   Y si NO te paso ninguna cintura, o la última es de hace más de mes y
   medio, pídesela UNA vez y sin insistir. Es el único dato que distingue
   perder grasa de perder peso, y sin él estás leyendo la báscula a ciegas.

6. Las fotos. Te digo cuántas subió cada semana, NUNCA las fotos en sí: no
   las ves ni puedes opinar sobre cómo se ve nadie.

   Sirven para una sola cosa, y solo si viene a cuento: si lleva tres
   semanas o más sin subir ninguna, mencionalo UNA vez y de pasada, como
   quien echa de menos un dato útil, no como quien pasa lista. Si las sube,
   no digas nada: hacer lo que toca no necesita comentario.

   Si esa persona nunca ha subido fotos, ni lo menciones. No todo el mundo
   quiere fotografiarse, y no es asunto tuyo insistir.

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

QUÉ TIENE QUE LLEVAR EL MENSAJE, SIEMPRE

Esto lo puede leer alguien que acaba de abrir la app y no te preguntó
nada. Así que no des por hecho que se acuerda de nada. Tres cosas, en
este orden y sin encabezados:

1. EN CUÁNTAS CALORÍAS ESTÁ. El número, dicho de paso. Si no lo dices,
   la persona no sabe de qué le estás hablando.
2. SI SE MUEVEN O NO, Y POR QUÉ. El porqué importa más que la decisión:
   "no te muevo nada porque el peso bajó como debía" y "no te muevo nada
   porque no tengo con qué leer tu semana" son cosas MUY distintas y
   quien lo lee tiene que poder distinguirlas.
3. UNA COSA para la semana que entra. Una, concreta y pequeña. No una
   lista de propósitos. Si la semana fue buena, la cosa puede ser
   "sigue igual" — repetir lo que funciona también es un consejo.

REGLAS DURAS

- Las únicas cifras permitidas son las calorías: en las que está y, si
  ajustaste, en las que queda. Nada de porcentajes, gramos ni kilos.
- Nada de listas ni viñetas: se lee como algo que te dice una persona.
  Cuatro frases como mucho.
- Nunca consejo médico.
- "motivo" es aparte, para el historial: ahí sí sé concreto y técnico.
`.trim();

// El mensaje que la persona NO pidió. Va sin esquema JSON a propósito: son
// dos frases, y envolverlas en un objeto solo gasta tokens.
// ---------------------------------------------------------------------
//  LAS FOTOS, EN DOS PASOS
//
//  Paso 1: mirar. SIN peso, SIN cintura, SIN calorías, SIN saber siquiera
//  si quiere subir o bajar.
//
//  Esto no es escrúpulo, es el fallo central de hacerlo en una sola
//  llamada: si el modelo lee "bajó 1,2 kg" antes de mirar, VE en las fotos
//  lo que los números ya le dijeron y describe un cambio que no está ahí.
//  Suena coherente, encaja con los datos, y es inventado. Nadie lo
//  detectaría nunca.
//
//  Aquí solo se mira. Los números entran en el paso 2, y para entonces lo
//  que se vio ya está escrito y no se puede retocar.
// ---------------------------------------------------------------------
const SISTEMA_FOTOS_VER = `
Comparas fotos de progreso de la misma persona, tomadas con semanas de
diferencia. Te digo de cuándo es cada grupo y en qué orden vienen.

Tu único trabajo es decir QUÉ CAMBIÓ entre unas y otras. Nada más.

NO SABES NADA MÁS DE ESTA PERSONA. No sabes cuánto pesa, ni si subió o
bajó, ni qué quiere lograr, ni qué come. Es a propósito: si lo supieras
acabarías viendo en las fotos lo que los números te hubieran contado. No
lo supongas, no lo deduzcas, y no escribas como si lo supieras.

QUÉ MIRAS
- La cintura y el abdomen: ancho, y si se marca más o menos.
- La espalda y los hombros: si el contorno es más ancho o más definido.
- Las piernas y los brazos, si se ven.
- La postura, solo si cambió tanto que altera lo que se ve.

QUÉ NO HACES, NUNCA
- No des un porcentaje de grasa corporal. Ni aproximado, ni "alrededor
  de". Desde una foto eso no se puede saber: hasta con plicómetro y en
  manos expertas el error es de varios puntos. Un número inventado que
  suena preciso es peor que no decir nada, porque se lo van a creer.
- No estimes kilos.
- No hables del aspecto. Nada de "se ve mejor", "se ve bien", "se ve más
  atractivo". Describes CAMBIOS, no a la persona.
- No comentes nada que no sea el cambio físico buscado: ni la cara, ni la
  ropa, ni el cuarto, ni lunares, marcas o cualquier cosa de la piel.
- No des consejo médico ni menciones enfermedades.

LO MÁS IMPORTANTE: SI NO VES CAMBIO, DILO
Cuatro semanas son pocas. Lo normal es que no se note casi nada, y decir
que sí para quedar bien es la peor cosa que puedes hacer aquí: hace que
la persona se fíe de ti para lo siguiente, y para lo siguiente te vas a
equivocar igual.

Y ojo con la trampa de las fotos: la luz, la hora, la distancia, la
postura y lo que haya comido ese día cambian lo que se ve MÁS que cuatro
semanas de dieta. Si dos fotos se ven distintas pero puede ser por eso,
dilo así, con esas palabras.

CÓMO ESCRIBES
Español de México, seco y corto. Cuatro o cinco frases como mucho. Esto
no lo lee nadie: es una nota para ti mismo del mes que viene. Sé
concreto y sin adornos.
`.trim();

// ---------------------------------------------------------------------
//  Paso 2: contar. Aquí SÍ entran los números, y las fotos ya NO.
//
//  Lo que llega es el texto del paso 1, que ya está cerrado. El modelo
//  puede reconciliarlo con la báscula y la cintura, pero no puede volver a
//  "mirar" y cambiar lo que se vio para que cuadre.
// ---------------------------------------------------------------------
const SISTEMA_FOTOS_DECIR = `
Eres el entrenador de esta persona y le cuentas su comparación mensual de
fotos. Español de México, de tú, corto y humano.

Te paso dos cosas: lo que se vio en las fotos -escrito antes, sin conocer
ningún número- y sus números del mes. Tu trabajo es juntarlos.

NO VISTE LAS FOTOS. Lo que se vio ya está escrito y no se toca. No añadas
detalles visuales que no estén ahí, ni los adornes: si el texto dice
"apenas se aprecia diferencia", eso es lo que hay.

PARA QUÉ SIRVE ESTO
La báscula no distingue grasa de agua de músculo. La cintura sí, pero
solo en un punto. Las fotos dicen DÓNDE está cambiando el cuerpo.

Junta las tres y busca sobre todo este caso, que es el que más se lee mal:
peso plano o casi, y sin embargo espalda y hombros más marcados o cintura
más estrecha. Eso es recomposición -ganó músculo y perdió grasa a la vez-
y es cuando la gente abandona creyendo que está estancada. Si lo ves,
dilo claro y con todas las letras.

Al revés también: si el peso bajó pero en las fotos no se ve nada y la
cintura no se movió, eso es agua o lo que tenga dentro, no grasa. Dilo
sin dramatizar.

QUÉ LLEVA EL MENSAJE
Tres o cuatro frases. Sin listas, sin encabezados, sin cifras salvo la
cintura si de verdad cambió.

1. Qué cambió, o que no cambió.
2. Cómo encaja con el peso y la cintura.
3. Una frase de qué hacer, solo si hace falta. Si va bien, que va bien.

REGLAS DURAS
- Ni porcentajes de grasa, ni kilos estimados. Ni aquí ni disimulados.
- Nada sobre su aspecto: hablas de cambios, no de cómo se ve.
- Nunca consejo médico.
- Si no hubo cambio visible, dilo sin rodeos y sin consolar de más. Cuatro
  semanas son pocas y esa es la explicación entera; decirlo con
  naturalidad tranquiliza más que cualquier ánimo forzado.
- No le cambies las calorías ni se lo insinúes. Eso se decide el domingo,
  con la semana entera delante. Aquí solo se cuenta lo que se ve.
`.trim();

const SISTEMA_AVISO = `
Eres el entrenador de esta persona y le escribes tú, sin que te haya
preguntado nada. Español de México, de tú.

DOS FRASES. Como un mensaje de WhatsApp, no como una notificación de app.
Sin listas, sin cifras, sin emojis. Devuelve solo el mensaje, nada más.

Te digo el motivo y tú escribes:

ausente — Lleva días sin apuntar. Esto es lo más delicado que vas a
  escribir. NO le reclames, NO le recuerdes lo importante que es apuntar,
  NO le hagas sentir que falló. La gente deja las apps que le hacen sentir
  mal, y quien se fue unos días ya se siente bastante mal solo.
  Que sea fácil volver.
  Así: "Te vi perdido estos días. Cuando quieras retomamos, sin drama."

estancado — Quiere bajar y el peso lleva dos semanas quieto. Es información,
  no un reproche: lo normal es que el cuerpo se acomode, y para eso estás
  tú. Dile que lo viste y que lo vas a mover.
  Así: "El peso lleva dos semanas plantado. Es normal, pasa. Cuéntame cómo
  te sientes y te lo ajusto."

racha — Siete días seguidos apuntando. Díselo y ya. No lo conviertas en una
  charla motivacional ni le pidas nada más.
  Así: "Siete días seguidos. Eso es lo difícil y ya lo estás haciendo."

semana_buena — Cerró bien la semana. Corto y sincero.
  Así: "Buena semana. Se nota."

Nunca hables de enfermedades ni des consejo médico.
`.trim();

// Solo para IA Plus, igual que los eventos.
const SISTEMA_MEMORIA = `

LO QUE RECUERDAS DE ESTA PERSONA

Tienes memoria entre conversaciones. Es lo que te separa de un buscador.

Cuando aprendas algo que vaya a servirte MÁS ADELANTE, devuelve en
"memoria" la versión completa y actualizada de tus notas. Completa: no un
añadido, sino todo lo que quieres seguir sabiendo, ya reescrito. Si no hay
nada nuevo, devuelve null.

Máximo 1200 caracteres. El límite es a propósito: te obliga a quedarte con
lo que importa y a soltar lo que dejó de importar.

Sirve para recordar:
- Qué no come, y por qué (no le gusta, alergia, religión)
- Cómo vive: a qué hora entrena, si cocina o come fuera, si viaja
- Qué le funciona y qué abandona
- Lesiones o molestias que ha mencionado
- Cómo prefiere que le hables

NO sirve para:
- Lo que ya está en la base: su peso, sus macros, lo que comió ayer. Eso lo
  tienes cada vez, no lo dupliques.
- Lo de un solo día ("hoy desayunó tarde").
- COMIDAS SUELTAS. "Se comió una barbacoa", "cenó budín de pan" NO van
  aquí. Están en su diario con su fecha, y aquí acabarían sin ella.
  Esto pasó de verdad: se le mencionó en el mismo mensaje una barbacoa de
  la semana anterior y un budín de ese mismo día, como si fueran lo mismo.
  Quien lo lee nota que no te enteras de cuándo pasaron las cosas, y a
  partir de ahí ya no se fía de nada de lo que recuerdas.
- Diagnósticos. Sus condiciones de salud vienen aparte y no son cosa tuya.

ESTAS NOTAS NO TIENEN FECHA. Es la limitación que más te va a traicionar:
lo que escribas aquí lo vas a leer dentro de un mes sin saber cuándo pasó.
Así que escribe solo lo que siga siendo verdad entonces -lo que no come,
cómo vive, qué le funciona-, y si algo solo se entiende con su fecha,
ponla dentro de la frase: "en agosto de 2026 empezó a entrenar de noche".

Escríbelo en frases cortas, como apuntes para ti:
  "Vegetariana. Odia el brócoli. Entrena de noche, cena tardísimo.
   Cocina domingos y congela. Dejó dos veces por aburrirse del pollo."

Y ÚSALO. Recordar sin que se note no vale de nada:
  "Te propongo pescado, que del pollo ya te cansaste otras veces."
Sin presumir de que te acuerdas. Un entrenador no dice "según mis notas".
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

CÓMO SE DICEN LAS CANTIDADES. Esto importa más de lo que parece: de ello
depende que la persona coma lo que dice el plan y no el doble.

- EN GRAMOS todo lo que se sirve a bulto y cambia mucho según cómo se
  sirva: carne, pollo, pescado, arroz, pasta, frijol, avena, queso, nueces,
  verdura cocida. "Una taza de arroz" son 150 g o 250 g según quién la
  sirva, y esa diferencia son 150 calorías.
- EN PIEZAS lo que ya viene en unidades y nadie pesa nunca: tortilla de
  maíz, bolillo, pan de caja, huevo, fruta entera, un aguacate. Escribir
  "60 g de tortilla" es pedirle a alguien que pese tortillas; se dice "dos
  tortillas".
- Cucharadas para aceite, mantequilla, crema y azúcar: nadie pesa una
  cucharada de aceite, pero todo el mundo sabe servirla.

Cuando dudes, pregúntate si la persona lo pesaría de verdad en su cocina.
Si la respuesta es no, no lo pongas en gramos.

Reglas:
- Cada comida se describe en una o dos frases, en lenguaje de cocina:
  "dos huevos revueltos con 40 g de frijol, dos tortillas y un café".
- El total del día debe acercarse a las calorías que te dan, sin pasarte
  de un 5% ni quedarte corto de un 5%. Y los TRES macros -proteína,
  carbohidratos y grasas- deben quedar dentro de un 10% de los que te doy.
  Comprueba tus cuentas.
- Reparte la proteína entre todas las comidas, no toda en una.
- Varía: que no salgan tres comidas de pollo con arroz.
- En la nota va un consejo corto y práctico, si hace falta. No hables de
  macros ni de calorías: quien lo lee ya los tiene arriba en la pantalla.

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
//  CÓMO VA UNA PERSONA — para su entrenador, no para ella
// ---------------------------------------------------------------------
//  Esto es lo ÚNICO de la app que se escribe SOBRE alguien y no PARA
//  alguien. Lo lee su entrenador, y la tabla donde se guarda se lo esconde
//  al cliente a propósito (0042). Por eso puede decir cosas que a la cara
//  no se dicen: «lleva tres semanas sin apuntar, probablemente lo dejó».
//
//  LO QUE MÁS IMPORTA: que no invente. Le llegan números y solo números; si
//  faltan, faltan. La tentación de un modelo aquí es rellenar huecos con lo
//  que suele pasar —«seguramente está comiendo de más los fines de
//  semana»— y un entrenador que lee eso toma decisiones sobre algo que
//  nadie midió.
const ESQUEMA_CLIENTE = {
  type: 'object',
  properties: {
    mensaje: {
      type: 'string',
      description: 'El resumen para el entrenador. Máximo 900 caracteres.',
    },
  },
  required: ['mensaje'],
  additionalProperties: false,
} as const;

const SISTEMA_CLIENTE = `
Le escribes a un ENTRENADOR sobre una de las personas que lleva. No le
escribes a esa persona: ella no va a leer esto.

Te llegan sus números de los últimos 7 y 30 días. Tu trabajo es decirle al
entrenador CÓMO VA y QUÉ MIRAR, en pocas líneas y sin rodeos.

REGLAS QUE NO SE SALTAN

1. SOLO LOS NÚMEROS QUE TE DOY. Si algo no está, no está: dilo o cállatelo,
   pero no lo supongas. Nada de «seguramente los fines de semana...» ni
   «es probable que...». Un entrenador que lee una suposición escrita con
   seguridad decide sobre algo que nadie midió.

2. LO PRIMERO, SI ESTÁ APUNTANDO. Es la señal más honesta que hay: quien
   deja de apuntar suele haber dejado el plan una semana antes. Si lleva
   días sin apuntar, eso va en la primera línea y lo demás importa menos
   —porque los demás números se calculan sobre lo poco que apuntó—.

3. LAS MEDIAS DE CALORÍAS SON POR DÍA APUNTADO, no por día del calendario.
   Si apuntó 2 días de 7, esa media habla de 2 días. Dilo cuando el número
   de días sea bajo; sin eso, el entrenador la lee como media de la semana
   y le baja las calorías a alguien que en realidad come de más.

4. EL PESO DE UN DÍA NO ES UNA TENDENCIA. Dos kilos arriba o abajo son agua
   y sal. Habla de la diferencia entre semanas, y solo si se pesó lo
   bastante como para que signifique algo.

5. NO DIAGNOSTICAS NI RECETAS. Ni enfermedades, ni suplementos, ni
   calorías exactas que deba ponerle. Puedes sugerir qué revisar o qué
   preguntarle.

CÓMO ESCRIBIRLO

Español de México, de profesional a profesional. Directo. Sin emojis, sin
títulos, sin listas con viñetas: dos o tres párrafos cortos.

Empieza por lo que hay que saber, no por un resumen de todo. Si va bien,
dilo en una línea y no lo adornes. Si algo está mal, di QUÉ está mal y qué
mirar, no diez cosas a la vez.

Termina con una sola cosa concreta que el entrenador podría hacer o
preguntarle esta semana. Una, no una lista.
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

  // --- Qué pide ---
  // Se lee ANTES del tope: hay una acción que no debe gastarlo.
  let cuerpo: Record<string, unknown>;
  try { cuerpo = await req.json(); }
  catch { return json({ error: 'Petición mal formada.' }, 400); }

  const accion = String(cuerpo.accion || '');

  // --- ¿Le dejan ESTO en concreto? ---
  //
  //  `ia_habilitada` es la llave general: todo o nada. Esto es lo fino.
  //
  //  Y va aquí, ANTES del tope diario, a propósito: si algo está apagado no
  //  puede gastar una de las consultas del día. Al revés, alguien perdería
  //  sus consultas pulsando un botón que nunca le iba a contestar.
  //
  //  LAS LLAVES NO SON UNA POR ACCIÓN sino una por cosa que se apaga. Las
  //  que van siempre juntas comparten llave: apagar el chat y dejar los
  //  avisos escritos -que son el mismo modelo contestando lo mismo- sería
  //  una casilla más para no ahorrar nada.
  const LLAVE: Record<string, string> = {
    apuntar: 'foto',      // apuntar comida con foto: lo que más se usa
    chat:    'chat',
    aviso:   'chat',
    semana:  'semanal',   // el cierre de los lunes
    fotos:   'semanal',   // comparar fotos de progreso
    cliente: 'analisis',  // el resumen para el entrenador
  };
  // El plan es la excepción: la misma acción cuesta cinco veces más si es
  // la semana entera, así que son dos llaves y no una. Poder dejar los
  // planes de un día encendidos y apagar solo la semana es justo el ajuste
  // que más dinero mueve.
  const llave = accion === 'plan'
    ? (cuerpo.semana === true ? 'plan_semana' : 'plan_dia')
    : LLAVE[accion];

  if (llave) {
    // DE QUIÉN ES LA LLAVE. Casi siempre de quien pide, pero el plan y el
    // análisis los pide el ENTRENADOR sobre otra persona: mirar las llaves
    // del entrenador ahí sería mirar las de quien no las tiene apagadas.
    //
    // El `|| userId` es para la transición: si la app todavía no manda a
    // quién, se mira al que pide. Se prefiere eso a rechazar la petición y
    // dejar sin planes a quien no haya actualizado la app.
    const sobre = (accion === 'plan' || accion === 'cliente')
      ? (String(cuerpo.cliente || '') || userId)
      : userId;

    const { data: llaves } = await admin
      .from('ia_permisos').select('*').eq('user_id', sobre).maybeSingle();

    // Sin fila, todo encendido: nadie se queda sin nada porque se añadiera
    // una tabla. Y si la consulta falla, `llaves` viene vacío y se deja
    // pasar: un problema de base de datos no puede apagarle la IA a todos.
    const puede = !llaves || (llaves as Record<string, unknown>)[llave] !== false;

    if (!puede) {
      const ajeno = sobre !== userId;
      return json({
        error: ajeno
          ? 'Esa persona tiene esto apagado. Puedes encendérselo en su ficha.'
          : 'Tu entrenador desactivó esto en tu cuenta.',
        apagado: llave,
      }, 403);
    }
  }

  // --- Tope diario ---
  //
  // La comparación de fotos queda FUERA. Es mensual, la pide la app sola y
  // no la persona, y no tiene sentido que analizar sus fotos la deje sin
  // poder apuntar la cena. Su freno es otro: una vez al mes, y solo si hay
  // dos series completas separadas por semanas.
  const TOPE_DIARIO = TOPES[nivel as keyof typeof TOPES] ?? TOPES.normal;
  let quedan: number | null = null;
  if (accion !== 'fotos') {
    const { data: q, error: errTope } = await admin.rpc('gastar_consulta_ia', {
      usuario: userId,
      tope: TOPE_DIARIO,
    });
    if (errTope) return json({ error: 'No se pudo comprobar tu uso.' }, 500);
    if (q === -1) {
      return json({
        error: `Llegaste a las ${TOPE_DIARIO} consultas de hoy. Mañana se reinicia.`,
      }, 429);
    }
    quedan = q as number;
  }

  try {
    const iaCruda = new Anthropic({ apiKey: clave });

    // ---- Reintento para lo que no es culpa de nadie ----
    //
    // Anthropic devuelve 529 «Overloaded» cuando está saturado. Es un
    // tropiezo de un segundo, no una avería. Sin reintento, quien pulsaba
    // "Revisar mi semana" veía «El asistente no pudo responder» y tenía que
    // volver a pulsar; en los registros del 18 de agosto hay CUATRO 529
    // seguidos, o sea cuatro intentos a mano que se podían haber evitado.
    //
    // Se reintenta 529, 429 y los 5xx. Un 400 NO: eso es que la petición
    // está mal armada, y repetirla da el mismo error mientras se paga otra
    // vez.
    const reintentable = (e: unknown) => {
      const s = (e && typeof e === 'object' && 'status' in e)
        ? Number((e as { status: number }).status) : 0;
      return s === 529 || s === 429 || (s >= 500 && s < 600);
    };
    // ---- Apuntar lo que costó ----
    //
    // La respuesta trae los tokens exactos y se estaban tirando. Sin esto,
    // «¿cuánto me cuesta armar un plan?» solo se puede responder con una
    // estimación, y con una estimación no se decide si cambiar de modelo.
    //
    // VA AQUÍ, en el envoltorio por el que pasan las siete acciones, y no
    // en cada una: puestas siete veces, la próxima acción que se añada
    // nacería sin registrar y nadie lo notaría hasta cuadrar la factura.
    //
    // Y NO PUEDE ROMPER NADA. Es contabilidad: si el apunte falla, la
    // persona tiene que recibir su respuesta igual. Por eso va suelto, sin
    // await y con los dos caminos del `then` tapados.
    const apuntarGasto = (args: Record<string, unknown>, r: unknown) => {
      try {
        const u = (r as { usage?: Record<string, number> })?.usage;
        if (!u) return;
        admin.from('ia_gasto').insert({
          user_id: userId,
          accion: accion || 'desconocida',
          modelo: String(args.model || MODELO),
          // Los de caché se suman a la entrada: hoy no se usa caché, pero si
          // algún día se enciende, sin esto la entrada saldría a cero y
          // parecería que se abarató sola.
          entrada: (u.input_tokens || 0) +
                   (u.cache_read_input_tokens || 0) +
                   (u.cache_creation_input_tokens || 0),
          salida: u.output_tokens || 0,
        }).then(() => {}, () => {});
      } catch { /* nunca por esto */ }
    };

    const ia = {
      messages: {
        create: async (args: Record<string, unknown>) => {
          let ultimo: unknown;
          for (let i = 0; i < 3; i++) {
            try {
              const r = await iaCruda.messages.create(args as never);
              apuntarGasto(args, r);
              return r;
            }
            catch (e) {
              ultimo = e;
              if (!reintentable(e) || i === 2) throw e;
              // Se espera un poco más cada vez: si está saturado, insistir
              // al instante es parte del problema.
              await new Promise((r) => setTimeout(r, 900 * (i + 1)));
            }
          }
          throw ultimo;
        },
        // En streaming los tokens no están hasta que termina, así que se
        // apuntan al pedir el mensaje final. Se envuelve `finalMessage` en
        // vez de pedirle a cada acción que apunte: así ninguna se olvida.
        stream: (args: Record<string, unknown>) => {
          const s = iaCruda.messages.stream(args as never);
          const original = s.finalMessage.bind(s);
          (s as unknown as { finalMessage: () => Promise<unknown> }).finalMessage = async () => {
            const r = await original();
            apuntarGasto(args, r);
            return r;
          };
          return s;
        },
      },
    };

    if (accion === 'apuntar') {
      const texto = String(cuerpo.texto || '').trim().slice(0, 500);
      const fotos = leerImagenes(cuerpo);
      if (typeof fotos === 'string') return json({ error: fotos }, 400);

      if (!texto && !fotos.length) {
        return json({ error: 'Escribe qué comiste o toma una foto.' }, 400);
      }

      const partes: unknown[] = [];
      for (const f of fotos) {
        partes.push({
          type: 'image',
          source: { type: 'base64', media_type: f.tipo, data: f.datos },
        });
      }
      partes.push({
        type: 'text',
        text: texto || (fotos.length > 1
          ? 'Esto es lo que me comí, en varias fotos del MISMO plato o comida. ' +
            'No lo cuentes varias veces: son distintos ángulos de lo mismo, ' +
            'salvo que se vea claramente que son platos distintos.'
          : 'Esto es lo que me comí. Dime qué lleva y sus macros.'),
      });
      const imagen = fotos.length ? '1' : '';   // solo para decidir el esfuerzo

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
      const fotos = leerImagenes(cuerpo);
      if (typeof fotos === 'string') return json({ error: fotos }, 400);
      const imagen = fotos.length ? '1' : '';   // solo para decidir el esfuerzo

      if (!historial.length && !fotos.length) {
        return json({ error: 'Escribe algo o manda una foto.' }, 400);
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

      // Lo que ya sabe de esta persona. Se lee de la base y no de lo que
      // manda la app: la memoria la escribe el modelo y la guarda el
      // cliente, así que si viniera por el cuerpo, cualquiera podría
      // inyectar en el sistema lo que quisiera desde la consola.
      let loQueSe = '';
      if (esPlus) {
        const { data: mem } = await admin
          .from('profiles').select('memoria_ia').eq('id', userId).single();
        const texto = String(mem?.memoria_ia ?? '').trim();
        if (texto) loQueSe = `\n\nLO QUE YA SABES DE ESTA PERSONA:\n${texto.slice(0, 1200)}`;
      }

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

      if (fotos.length) {
        const ultimo = mensajes[mensajes.length - 1];
        const texto = ultimo && ultimo.role === 'user' ? ultimo.content : '';
        if (ultimo && ultimo.role === 'user') mensajes.pop();
        // Todas las fotos en el MISMO mensaje, y el texto al final. Si
        // fueran mensajes separados, el modelo las trataria como cosas
        // distintas y sumaria el plato varias veces.
        const partes: unknown[] = fotos.map((f) => ({
          type: 'image',
          source: { type: 'base64', media_type: f.tipo, data: f.datos },
        }));
        partes.push({
          type: 'text',
          text: texto || (fotos.length > 1
            ? 'Esto es lo que me comi, en varias fotos del MISMO plato o comida. ' +
              'No lo cuentes varias veces: son distintos angulos de lo mismo, ' +
              'salvo que se vea claramente que son platos distintos.'
            : 'Esto es lo que me comí.'),
        });
        mensajes.push({
          role: 'user',
          // deno-lint-ignore no-explicit-any
          content: partes as any,
        });
      }
      if (!mensajes.length) return json({ error: 'Escribe algo.' }, 400);

      const r = await ia.messages.create({
        model: MODELO,
        max_tokens: imagen ? 4000 : 2000,
        system: SISTEMA_CHAT + (esPlus ? SISTEMA_EVENTOS + SISTEMA_MEMORIA : '') +
                SISTEMA_APUNTAR_REGLAS + hoyEs + contexto + loQueSe,
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
      if (!esPlus) { salida.evento = null; salida.memoria = null; }
      // Se recorta aquí y no solo en la base: el CHECK de la columna haría
      // fallar el guardado entero por un carácter de más, y perder la
      // conversación por eso sería absurdo.
      if (typeof salida.memoria === 'string') {
        salida.memoria = salida.memoria.trim().slice(0, 1200) || null;
      }
      return json({ ...salida, quedan, nivel, tope: TOPE_DIARIO });
    }

    // ---- El asistente escribe primero ----
    //
    // El MOTIVO no se decide aquí: lo decide SQL, gratis y siempre igual.
    // Esto solo pone las palabras, que es lo que un modelo hace bien.
    //
    // Y no hace falta comprobar que el motivo sea cierto: guardar_aviso()
    // lo vuelve a verificar en Postgres antes de dejar escribir nada. Un
    // cliente que mienta aquí se gasta una consulta y no guarda nada.
    if (accion === 'aviso') {
      if (!esPlus) return json({ error: 'Esto es parte de IA Plus.', nivel }, 403);

      const motivo = String(cuerpo.motivo || '');
      if (!['ausente', 'racha', 'semana_buena', 'estancado'].includes(motivo)) {
        return json({ error: 'Motivo desconocido.' }, 400);
      }

      const { data: mem } = await admin
        .from('profiles').select('memoria_ia, full_name').eq('id', userId).single();
      const nombre = String(mem?.full_name ?? '').trim().split(' ')[0];
      const notas = String(mem?.memoria_ia ?? '').trim();

      const r = await ia.messages.create({
        model: MODELO,
        max_tokens: 600,
        system: SISTEMA_AVISO +
          (nombre ? `\n\nSe llama ${nombre}.` : '') +
          (notas ? `\n\nLO QUE SABES DE ELLA:\n${notas.slice(0, 1200)}` : ''),
        output_config: { effort: 'low' },
        messages: [{ role: 'user', content: `Motivo: ${motivo}` }],
      });

      const texto = r.content
        .filter((c: { type: string }) => c.type === 'text')
        .map((c: { text?: string }) => c.text ?? '')
        .join('').trim().slice(0, 400);

      return json({ motivo, texto, quedan, nivel });
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

      // ---- ¿Ya se las movió una persona esta semana? ----
      //
      //  Si su entrenador le bajó 200 calorías el miércoles y el lunes esto
      //  se las vuelve a mover, la decisión del entrenador dura cinco días y
      //  nadie se entera de que se deshizo. Peor todavía: el lunes se estaría
      //  juzgando una semana que se comió con OTRAS calorías.
      //
      //  Así que cuando una persona las ha tocado hace menos de siete días,
      //  la máquina no las toca. Sigue diciéndole cómo le fue —eso es lo que
      //  la persona espera del lunes— pero no decide sobre las calorías.
      const { data: aMano } = await admin
        .rpc('calorias_movidas_a_mano', { p_cliente: userId });

      // Si la migración va por detrás del despliegue, `aMano` viene nulo y
      // esto se comporta exactamente como antes.
      const movidasAMano = aMano && typeof aMano === 'object'
        ? aMano as Record<string, unknown> : null;

      const encuesta = (cuerpo.chequeo ?? {}) as Record<string, number>;
      // `unknown` y no `number`: además de los totales trae `por_semana`,
      // que es una lista. Tiparlo como números haría fallar la comprobación
      // al desplegar, y una función que no compila no arranca.
      const e = (cuerpo.entreno ?? null) as Record<string, unknown> | null;
      // Un peso plano no significa lo mismo si el volumen sube que si no se
      // movió. Sin esta línea, el modelo trata los dos casos igual y ajusta
      // calorías donde no hacía falta.
      const entreno = e
        ? `\n- Entrenó ${e.sesiones} veces (${e.sesiones_antes} la semana anterior)\n` +
          `- Volumen: ${e.volumen} kg esta semana, ${e.volumen_antes} kg la anterior`
        : '';

      // Las semanas de antes. Una semana suelta casi no dice nada: hambre 4
      // de 5 pudo ser una mala semana. Tres seguidas es otra cosa, y es
      // justo el momento en que la gente abandona. Sin esto el modelo
      // juzgaba cada semana como si fuera la primera.
      const previas = Array.isArray(cuerpo.historial)
        ? (cuerpo.historial as Record<string, unknown>[]).slice(-4) : [];
      const historial = previas.length
        ? `\nSEMANAS ANTERIORES (de la más vieja a la más reciente):\n` +
          previas.map((p) =>
            `- ${p.semana}: hambre ${p.hambre ?? '—'}, energía ${p.energia ?? '—'}, ` +
            `sueño ${p.sueno ?? '—'}` +
            (p.ajusto ? ` · se le ajustó a ${p.cal_despues} cal` : ' · no se tocó')
          ).join('\n') + `\n`
        : '';

      // La báscula no distingue grasa de agua de músculo. La cintura sí, y
      // es lo que convierte "el peso no baja" en "el peso no baja PERO está
      // perdiendo grasa", que es un mensaje completamente distinto.
      const c = Array.isArray(cuerpo.cinturas)
        ? (cuerpo.cinturas as Record<string, unknown>[]).slice(-6) : [];
      const cinturas = c.length
        ? `\nCINTURA:\n` +
          c.map((x) => `- ${x.log_date}: ${x.cintura_cm} cm`).join('\n') + `\n`
        : '';

      // Las cuatro semanas anteriores, resumidas. Una semana suelta miente:
      // el peso de siete días se mueve un kilo por agua o sal sin que haya
      // cambiado nada de grasa. Con cuatro puntos se distingue "no bajó" de
      // "bajó y todavía no se ve".
      // OJO con el nombre: cuatro líneas más arriba ya hay unas `previas`,
      // que son los CHEQUEOS anteriores. Estas son los RESÚMENES de las
      // semanas, otra cosa. Llamarlas igual dejó la función sin arrancar.
      const resumenPrevias = Array.isArray(cuerpo.semanas)
        ? (cuerpo.semanas as Record<string, unknown>[]).slice(-4) : [];
      const semanas = resumenPrevias.length
        ? `\nLAS SEMANAS ANTERIORES (de la más vieja a la más reciente):\n` +
          resumenPrevias.map((s) =>
            `- Semana del ${s.semana}: ${s.dias_apuntados} días apuntados` +
            (s.media_cal ? `, ${s.media_cal} cal de media` : ', sin datos de comida') +
            (s.peso_medio ? `, peso medio ${s.peso_medio} kg` : ', sin pesos') +
            // El NÚMERO de fotos, no las fotos. Las imágenes no viajan aquí.
            `, ${s.fotos ? `${s.fotos} fotos` : 'sin fotos'}`
          ).join('\n') + `\n`
        : '';

      // Con fecha. Sin ella, una lista de kilos no dice si son de una semana
      // o de medio año, y eso cambia por completo lo que significan.
      const listaPesos = pesos.length
        ? pesos.map((x: Record<string, unknown> | number) =>
            typeof x === 'number' ? String(x) : `${x.fecha}: ${x.kg} kg`).join(' · ')
        : 'ninguno';

      const trend = (e && Array.isArray(e.por_semana))
        ? `\nENTRENO, SEMANA A SEMANA:\n` +
          (e.por_semana as unknown as Record<string, unknown>[]).map((x) =>
            `- Semana del ${x.semana}: ${x.sesiones} sesiones, ${x.volumen} kg de volumen`
          ).join('\n') + `\n`
        : '';

      // La meta pudo cambiar A MITAD de la semana que se cierra. Entonces
      // «meta diaria» solo vale para los últimos días y el promedio mezcla
      // dos objetivos: sin avisar, esto se lee como un exceso que no hubo.
      const cambios = Array.isArray((cuerpo.datos as Record<string, unknown>)?.cambios_de_meta)
        ? ((cuerpo.datos as Record<string, unknown>).cambios_de_meta as Record<string, unknown>[])
        : [];
      const cambioMeta = cambios.length
        ? `- OJO: cambió su meta a mitad de semana (` +
          cambios.map((c) => `el ${c.fecha}, de ${c.antes} a ${c.despues} cal`).join('; ') +
          `). El promedio de arriba mezcla los dos objetivos, así que NO lo ` +
          `leas como si se hubiera pasado o quedado corto. Dilo con naturalidad ` +
          `y sé prudente: con la semana partida en dos, casi nunca hay razón ` +
          `para moverle nada otra vez.\n`
        : '';

      // El gasto MEDIDO. Sale de restar: lo que comió menos lo que cambió de
      // peso. No depende del factor de actividad que eligió al registrarse,
      // que es de donde viene el error grande de todo el cálculo.
      //
      // Llega ya filtrado por la app: si no hay semanas suficientes o el
      // número se aleja demasiado del estimado, viene con estado y sin cifra.
      // Aquí solo se dice cuando de verdad significa algo.
      const gm = (cuerpo.gasto ?? null) as Record<string, unknown> | null;
      const gastoReal = (gm && gm.estado === 'ok')
        ? `\nSU GASTO REAL, MEDIDO (no estimado):\n` +
          `- Gasta ${gm.gasto} cal al día. Sale de restar: comió una media de ` +
          `${gm.media_cal} y su peso se movió ${gm.kg_por_semana} kg por semana, ` +
          `durante ${gm.semanas} semanas y ${gm.dias} días apuntados.\n` +
          `- La fórmula del registro decía ${gm.estimado}. Manda el medido: el ` +
          `estimado sale de unos días de ejercicio que dijo al registrarse y ` +
          `que nadie ha vuelto a comprobar.\n` +
          `- Esta cifra ya absorbe que apunte de menos, si lo hace de forma ` +
          `parecida siempre. NO le sugieras que apunta mal por esto.\n` +
          `- Úsala para decidir, pero muévele igual poco: entre 100 y 200. ` +
          `Tener mejor información no es razón para dar saltos más grandes.\n`
        : '';

      const contexto =
        `\n\nLA SEMANA QUE SE CIERRA:\n` +
        `- Días que apuntó: ${diasApuntados} de 7\n` +
        `- Meta diaria actual: ${Math.round(Number(d.meta_cal) || 0)} cal\n` +
        `- Promedio de lo que comió: ${Math.round(Number(d.media_cal) || 0)} cal\n` +
        cambioMeta +
        gastoReal +
        `- Pesos (últimas 4 semanas): ${listaPesos}` +
        entreno + `\n` +
        semanas +
        trend +
        `- Hambre: ${encuesta.hambre ?? '—'}/5 · Energía: ${encuesta.energia ?? '—'}/5 · ` +
        `Sueño: ${encuesta.sueno ?? '—'}/5  (3 = normal)\n` +
        historial +
        cinturas +
        (cuerpo.nota ? `- Dice: "${String(cuerpo.nota).slice(0, 300)}"\n` : '') +
        `- ¿Hay material para ajustar?: ${hayMaterial ? 'sí' : 'NO'}\n` +
        // Se le DICE además de forzarlo abajo. Forzándolo solo, el mensaje
        // diría «te subo a 2000» y las calorías se quedarían donde estaban:
        // la persona leería una cosa y vería otra.
        (movidasAMano
          ? `- OJO: su entrenador ya le ajustó las calorías a mano hace ` +
            `menos de una semana (de ${movidasAMano.cal_antes} a ` +
            `${movidasAMano.cal_despues}` +
            (movidasAMano.motivo ? `, porque "${movidasAMano.motivo}"` : '') +
            `). NO se las muevas: son de esta semana y hay que darles ` +
            `tiempo. Dile cómo le fue y ya. Puedes mencionar el cambio si ` +
            `viene a cuento, sin juzgarlo.`
          : '');

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
      // Lo mismo, y por la misma razón: esto lo decide el código. Un modelo
      // convencido de que hace falta ajustar ajusta igual aunque se le pida
      // que no, y aquí lo que hay al otro lado es la decisión de una persona.
      if (movidasAMano) { salida.ajusto = false; salida.cal_nueva = null; }
      return json({ ...salida, quedan, nivel });
    }

    // ---------------------------------------------------------------
    //  LA COMPARACIÓN MENSUAL DE FOTOS
    //
    //  LA APP NO DICE QUÉ FOTOS. Ni rutas, ni semanas, ni identificadores.
    //  Solo dice "compara las mías". Todo lo demás sale de la base
    //  filtrando por el usuario de la sesión.
    //
    //  Es la única forma segura de hacerlo: si el cliente mandara rutas,
    //  quien tuviera un token robado podría pedir el análisis de las fotos
    //  de otra persona sin más que cambiar una cadena de texto.
    // ---------------------------------------------------------------
    if (accion === 'fotos') {
      if (!esPlus) {
        return json({ error: 'La comparación de fotos es parte de IA Plus.', nivel }, 403);
      }

      // El permiso, y que sea `=== true` de verdad. `null` es "todavía no
      // se le ha preguntado" y NO vale como sí: es exactamente la
      // suposición que la ley de datos personales no permite hacer.
      const { data: permiso } = await admin
        .from('profiles').select('fotos_ia_ok').eq('id', userId).single();
      if (permiso?.fotos_ia_ok !== true) {
        return json({ error: 'Falta tu permiso para analizar tus fotos.', motivo: 'sin_permiso' }, 403);
      }

      const { data: fotos, error: errFotos } = await admin
        .from('progress_photos')
        .select('week_key, pose, storage_path')
        .eq('user_id', userId)
        .order('week_key', { ascending: false });
      if (errFotos) return json({ error: 'No pude leer tus fotos.' }, 500);

      // Solo cuentan las series COMPLETAS: cuatro poses. Comparar tres
      // ángulos contra cuatro produce "cambió la espalda" cuando lo que
      // pasó es que la de espalda de un mes no está.
      const porSemana = new Map<string, Record<string, string>>();
      for (const f of (fotos ?? []) as Record<string, string>[]) {
        if (!porSemana.has(f.week_key)) porSemana.set(f.week_key, {});
        porSemana.get(f.week_key)![f.pose] = f.storage_path;
      }
      const POSES = ['frente', 'espalda', 'izq', 'der'];
      const completas = [...porSemana.entries()]
        .filter(([, p]) => POSES.every((x) => p[x]))
        .sort((a, b) => (a[0] < b[0] ? 1 : -1));      // la más nueva primero

      if (completas.length < 2) {
        return json({ estado: 'faltan_series', tiene: completas.length });
      }

      // La nueva es la última. La vieja tiene que estar al menos tres
      // semanas atrás: comparar dos series de semanas seguidas no enseña
      // nada y gasta lo mismo.
      const semanaNueva = completas[0][0];
      const nSem = (k: string) => Number(k.slice(0, 4)) * 52 + Number(k.slice(6));
      const vieja = completas.slice(1).find((c) => nSem(semanaNueva) - nSem(c[0]) >= 3);
      if (!vieja) return json({ estado: 'demasiado_pronto', ultima: semanaNueva });
      const semanaVieja = vieja[0];
      // Y la primera de todas, si no es ya una de las dos: contra el punto
      // de partida es donde de verdad se nota, y es lo que sostiene a
      // alguien en el mes cuatro, cuando mes contra mes no dice nada.
      const primera = completas[completas.length - 1][0];
      const semanaBase = (primera !== semanaNueva && primera !== semanaVieja) ? primera : null;

      // Uno por mes y persona. Si ya está hecho se devuelve el guardado en
      // vez de volver a pagarlo.
      // El mes en la zona de la app, NO en UTC.
      //
      // `toISOString()` va en UTC, y desde las 18:00 de México ya es el día
      // siguiente. El último día de cada mes, por la tarde, esto guardaba la
      // comparación con el mes que viene — y entonces el mes que viene salía
      // "ya está hecho" y esa persona se quedaba sin la suya.
      //
      // Se calcula aquí y no se acepta del cliente, por lo mismo que el tope
      // diario: quien pudiera decir en qué mes está, podría pedir el análisis
      // las veces que quisiera, y son ocho imágenes cada vez.
      const mes = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit',
      }).format(new Date());
      const { data: yaEsta } = await admin
        .from('analisis_fotos').select('mes, mensaje, semana_nueva, semana_vieja')
        .eq('user_id', userId).eq('mes', mes).maybeSingle();
      if (yaEsta && cuerpo.rehacer !== true) {
        return json({ estado: 'ok', ...yaEsta, guardado: true });
      }

      // Se bajan del bucket privado con la clave de servicio. Nunca pasan
      // por el navegador de nadie.
      const bajar = async (ruta: string) => {
        const { data, error } = await admin.storage.from('progress-photos').download(ruta);
        if (error || !data) return null;
        const b = new Uint8Array(await data.arrayBuffer());
        // Sin `btoa(String.fromCharCode(...b))`: con 8 imágenes eso revienta
        // la pila por el número de argumentos. A trozos no.
        let s = '';
        for (let i = 0; i < b.length; i += 8192) {
          s += String.fromCharCode(...b.subarray(i, i + 8192));
        }
        return { datos: btoa(s), tipo: data.type || 'image/jpeg' };
      };

      const armar = async (poses: Record<string, string>) => {
        const out = [];
        for (const p of POSES) {
          const img = await bajar(poses[p]);
          if (img) {
            out.push({
              type: 'image' as const,
              source: { type: 'base64' as const, media_type: img.tipo, data: img.datos },
            });
          }
        }
        return out;
      };

      const imgsNuevas = await armar(completas[0][1]);
      const imgsViejas = await armar(vieja[1]);
      if (imgsNuevas.length < 4 || imgsViejas.length < 4) {
        return json({ error: 'No pude abrir todas tus fotos.' }, 500);
      }

      // ---- PASO 1: mirar, a ciegas ----
      const verR = await ia.messages.create({
        model: MODELO,
        max_tokens: 1200,
        system: SISTEMA_FOTOS_VER,
        thinking: { type: 'adaptive' as const },
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: `GRUPO ANTIGUO (semana ${semanaVieja}), en orden: frente, espalda, izquierda, derecha.` },
            ...imgsViejas,
            { type: 'text', text: `GRUPO NUEVO (semana ${semanaNueva}), mismo orden.` },
            ...imgsNuevas,
            { type: 'text', text: '¿Qué cambió del grupo antiguo al nuevo?' },
          ],
        }],
      });
      const visto = verR.content
        .filter((b: Record<string, unknown>) => b.type === 'text')
        .map((b: Record<string, string>) => b.text).join('\n').trim();

      // ---- PASO 2: contarlo, ya con los números y SIN las fotos ----
      const p = (cuerpo.pesos ?? []) as Record<string, unknown>[];
      const c = (cuerpo.cinturas ?? []) as Record<string, unknown>[];
      // Concatenación y no plantillas: aquí van plantillas ANIDADAS dentro de
      // una plantilla, y eso es lo que más se rompe al copiar el fichero de
      // un sitio a otro. Se lee igual y no hay nada que escapar.
      const numeros =
        '\n\nLO QUE SE VIO EN LAS FOTOS (escrito sin conocer ningún número):\n' +
        '"' + visto + '"\n\n' +
        'SUS NÚMEROS:\n' +
        '- Van ' + semanaVieja + ' contra ' + semanaNueva + '.\n' +
        '- Pesos: ' + (p.length ? p.map((x) => x.fecha + ': ' + x.kg + ' kg').join(' · ') : 'no apuntó') + '\n' +
        '- Cintura: ' + (c.length ? c.map((x) => x.log_date + ': ' + x.cintura_cm + ' cm').join(' · ') : 'no la midió') + '\n' +
        (semanaBase ? '- Además tiene fotos desde ' + semanaBase + ', su primera serie.\n' : '');

      const decirR = await ia.messages.create({
        model: MODELO,
        max_tokens: 1000,
        system: SISTEMA_FOTOS_DECIR + numeros,
        thinking: { type: 'adaptive' as const },
        messages: [{ role: 'user', content: 'Cuéntame mi comparación de este mes.' }],
      });
      const mensaje = decirR.content
        .filter((b: Record<string, unknown>) => b.type === 'text')
        .map((b: Record<string, string>) => b.text).join('\n').trim();

      if (!mensaje) return json({ error: 'No pude armar tu comparación.' }, 500);

      // Se guarda el TEXTO. Nunca las imágenes ni nada que las reconstruya.
      await admin.from('analisis_fotos').upsert({
        user_id: userId,
        mes,
        semana_nueva: semanaNueva,
        semana_vieja: semanaVieja,
        semana_base: semanaBase,
        visto,
        mensaje,
      }, { onConflict: 'user_id,mes' });

      return json({
        estado: 'ok', mes, mensaje,
        semana_nueva: semanaNueva, semana_vieja: semanaVieja, nivel,
      });
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
            // LOS TRES MACROS, no solo la proteína. Antes se mandaban solo
            // calorías y proteína, así que el modelo repartía carbohidratos
            // y grasas a su gusto: dos planes de las mismas calorías podían
            // salir uno con 90 g de grasa y otro con 30, y ninguno cuadraba
            // con lo que la app le pide a esa persona.
            `Objetivo: unas ${cal} calorías ${semana ? 'AL DÍA' : 'en total'}, ` +
            `con ${Math.round(Number(cuerpo.proteina) || 0)} g de proteína, ` +
            `${Math.round(Number(cuerpo.carbos) || 0)} g de carbohidratos y ` +
            `${Math.round(Number(cuerpo.grasas) || 0)} g de grasa.\n` +
            (gustos ? `Ten en cuenta: ${gustos}\n` : '') +
            `Desayuno, comida y cena. Añade un snack solo si hace falta ` +
            `para llegar a las calorías.`,
        }],
      });

      const r = await flujo.finalMessage();
      return json({ ...leerJson(r), quedan });
    }

    // ---- Cómo va una persona, para su entrenador ----
    if (accion === 'cliente') {
      const cliente = String(cuerpo.cliente || '').trim();
      const nombre = String(cuerpo.nombre || '').trim().slice(0, 60);
      const metricas = cuerpo.metricas;

      if (!cliente || !/^[0-9a-f-]{36}$/i.test(cliente)) {
        return json({ error: 'Falta a quién.' }, 400);
      }
      if (!metricas || typeof metricas !== 'object') {
        return json({ error: 'Faltan sus números.' }, 400);
      }

      // QUIÉN PUEDE PEDIR ESTO.
      //
      // La app ya saca los números con `plan_metricas`, que comprueba
      // `puede_ver` por dentro. Pero esta función no puede fiarse de eso:
      // recibe los números por el cuerpo de la petición y cualquiera puede
      // mandar lo que quiera. Sin esta comprobación, un cliente cualquiera
      // pediría un "análisis" de otra persona con solo su id.
      //
      // Se rehace aquí la misma regla que `puede_ver`, y a mano, porque la
      // función corre con la clave de servicio: `auth.uid()` vale null ahí
      // dentro, así que llamar a `puede_ver` devolvería siempre falso.
      const { data: yo } = await admin
        .from('profiles').select('role').eq('id', userId).single();
      const rol = yo?.role || 'cliente';

      if (rol !== 'super_admin') {
        if (rol !== 'coach' && rol !== 'org_admin') {
          return json({ error: 'Esto es para entrenadores.' }, 403);
        }
        const { data: suyo } = await admin
          .from('coach_clientes')
          .select('cliente_id')
          .eq('coach_id', userId).eq('cliente_id', cliente)
          .maybeSingle();
        if (!suyo) return json({ error: 'Esa persona no es cliente tuyo.' }, 403);
      }

      // Los números van como JSON tal cual y no redactados en una frase: el
      // modelo lee mejor la estructura, y así lo que se le manda es
      // exactamente lo que la app enseña en pantalla —si el texto y las
      // tarjetas se contradicen, se sabe que el fallo está en el prompt y
      // no en una traducción a medio camino—.
      const flujo = ia.messages.stream({
        model: MODELO,
        max_tokens: 2000,
        system: SISTEMA_CLIENTE,
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: ESQUEMA_CLIENTE } },
        messages: [{
          role: 'user',
          content: `Cómo va ${nombre || 'esta persona'}. Sus números:\n\n` +
            JSON.stringify(metricas, null, 1).slice(0, 6000),
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
    const estado = (e && typeof e === 'object' && 'status' in e)
      ? Number((e as { status: number }).status) : 0;
    const saturado = estado === 529 || estado === 429 || (estado >= 500 && estado < 600);

    // NO SE LE COBRA UNA AVERÍA AJENA.
    //
    // El tope se gasta ANTES de llamar a la IA, así tiene que ser: si se
    // gastara después, mil peticiones a la vez pasarían todas el filtro. Pero
    // eso significa que cuando Anthropic falla, la consulta ya está cobrada.
    //
    // El 18 de agosto se vio en los registros: cuatro 529 seguidos, cuatro
    // consultas de las quince del día gastadas, y ni un mensaje a cambio.
    // Devolverla solo cuando el fallo es del servidor no abre ningún agujero:
    // nadie puede provocar un 529 a voluntad.
    // OJO CON ESTE `try`. Estamos DENTRO del catch general: si algo revienta
    // aquí, no hay nadie más abajo que lo recoja y la función se muere sin
    // responder. El teléfono no ve un error, ve «Load failed».
    //
    // Pasó exactamente eso: esto estaba escrito como
    //   admin.rpc(...).catch(() => {})
    // y `admin.rpc()` NO devuelve una promesa de verdad, devuelve el
    // constructor de consulta de PostgREST. No tiene `.catch()`. Lanzaba
    // «TypeError: admin.rpc(...).catch is not a function», el error se
    // escapaba del catch, y quien pulsaba "Revisar mi semana" se quedaba sin
    // respuesta ninguna. Se arregló un mensaje malo y se convirtió en nada.
    //
    // Devolver la consulta es lo MENOS importante de este bloque: si falla,
    // se pierde una consulta y ya. Lo que no puede fallar es contestar.
    if (saturado && quedan !== null) {
      try { await admin.rpc('devolver_consulta_ia', { usuario: userId }); }
      catch (e2) { console.error('no se pudo devolver la consulta:', e2); }
    }

    if (saturado) {
      return json({
        error: 'El asistente está saturado ahora mismo. No es cosa tuya y no ' +
               'gastaste ninguna consulta: espera un minuto y vuelve a intentarlo.',
      }, 503);
    }

    // El NOMBRE del error sí viaja; el detalle se queda en el registro,
    // porque un mensaje de la API puede llevar dentro trozos de la petición.
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
