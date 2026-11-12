// En supabase-js, un «no» de Postgres NO LANZA.
//
// `.upsert()`, `.insert()` y `.rpc()` resuelven con `{ error }`. Así que
// un `try { await admin.from(...).upsert(...) } catch {}` no pilla el
// fallo de la base: solo pilla el de red. Y un `await` pelado, sin mirar
// nada, no pilla ninguno de los dos.
//
// Eso dejaba dos sitios diciendo que algo pasó cuando no había pasado:
//
//  1. LA COMPARACIÓN DE FOTOS. Es lo más caro que hace esta app: dos
//     pasadas del modelo, una a ciegas y otra con los números. Si el
//     `upsert` fallaba, la función contestaba `estado: 'ok'` igual, y la
//     app marca el mes EN CUANTO EL SERVIDOR CONTESTA —sea lo que sea—.
//     Resultado: esa persona la leía una vez, al reabrir la tarjeta salía
//     vacía, y no se reintentaba hasta el mes siguiente. Perdida entera y
//     sin una palabra. El propio fichero ya tenía escrita la regla buena
//     doce líneas más arriba: «sin guardar, la app no marca el mes y lo
//     vuelve a pedir la próxima vez que abra».
//
//  2. «NO GASTASTE NINGUNA CONSULTA». Cuando Anthropic está saturado se
//     devuelve la consulta, porque el tope se cobra ANTES de llamar. Pero
//     la devolución podía fallar por los dos caminos de arriba y el
//     mensaje afirmaba igual que no se había gastado. Son cinco al día.
//
// Y una tercera que se deja a propósito: la felicitación de cumpleaños SÍ
// se contesta aunque no se guarde, porque dejar a alguien sin felicitación
// el día de su cumpleaños para proteger una fila es peor. Esa se apunta en
// el registro y ya. Que la diferencia sea deliberada también se fija aquí.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const FN = readFileSync(join(RAIZ, 'supabase', 'functions', 'asistente', 'index.ts'), 'utf8');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};
const sinComentarios = (s) => s.replace(/^\s*\/\/.*$/gm, '');

// El trozo entre dos anclas del fichero, sin comentarios: lo que se mira
// es el código, no lo que el código dice de sí mismo.
// Un ancla que ya no está es en sí misma una noticia —alguien se llevó
// por delante el arreglo—, así que se cuenta como fallo y se sigue, en vez
// de reventar y dejar sin correr todo lo de abajo.
function entre(a, b) {
  const i = FN.indexOf(a);
  const j = i < 0 ? -1 : FN.indexOf(b, i);
  if (i < 0 || j < 0) {
    ok(false, 'sigue estando el trozo que empieza en «' + a.slice(0, 50) + '»',
       'sin eso no hay nada que comprobar: el arreglo no está donde estaba');
    return '';
  }
  return sinComentarios(FN.slice(i, j));
}
// Los mensajes largos van partidos en trozos concatenados para que quepan
// en la columna: `'...y no ' + 'gastaste ninguna...'`. Buscando la frase
// entera no se encuentra nunca, y la comprobación dice que falta algo que
// está escrito. Esto vuelve a pegar los trozos.
const pegado = (s) => s.replace(/' *\+\s*'/g, '');

// ------------------------------------------------------------------
console.log('\nLa comparación de fotos no se da por guardada');
{
  const bloque = entre("await admin.from('analisis_fotos').upsert({", "if (accion === 'plan')");

  ok(/const \{ error: \w+ \} = await admin\s*\r?\n?\s*\.?from\('analisis_fotos'\)\.upsert\(|const \{ error: \w+ \} = await admin\.from\('analisis_fotos'\)\.upsert\(/.test(
       sinComentarios(FN)),
     'se recoge el error del upsert',
     'un `await` pelado se traga el «no» de Postgres entero');

  ok(/if \(err\w*\) \{[\s\S]{0,400}return json\(\{[\s\S]{0,200}\}, 500\);/.test(bloque),
     'y si falló se contesta con error, no con «ok»',
     'la app marca el mes en cuanto el servidor contesta: un «ok» sin ' +
     'guardar quema el mes entero');

  // El orden importa: el `return json({ estado: 'ok' ...})` tiene que
  // venir DESPUÉS de la comprobación, o no sirve de nada.
  const iMira = bloque.indexOf('if (errGuardar)');
  const iOk = bloque.indexOf("estado: 'ok'");
  ok(iMira >= 0 && iOk > iMira,
     'y el «ok» va detrás de la comprobación',
     'mira en ' + iMira + ', ok en ' + iOk);
}

// ------------------------------------------------------------------
console.log('\nY la app sigue confiando en que contestar = guardado');
{
  // Este arreglo se apoya en cómo se comporta la app. Si mañana la app
  // marcase el mes también cuando falla, el arreglo dejaría de servir y
  // nadie se enteraría.
  const i = APP.indexOf("accion: 'fotos',");
  const bloque = sinComentarios(APP.slice(i, APP.indexOf('--- Comparador ---', i)));
  ok(/\.then\(function\(r\)\{[\s\S]{0,200}localStorage\.setItem\(CLAVE_ANALISIS, mes\)/.test(bloque),
     'el mes se marca dentro del `then`, no antes',
     'si se marcara pase lo que pase, contestar con error no evitaría nada');
  ok(/\['catch'\]\(function\(\)\{/.test(bloque) &&
     !/\['catch'\][\s\S]{0,300}setItem\(CLAVE_ANALISIS/.test(bloque),
     'y el camino del error NO lo marca',
     'es lo que hace que se reintente al abrir');
}

// ------------------------------------------------------------------
console.log('\nY «no gastaste ninguna consulta» solo se dice si es verdad');
{
  const bloque = entre('let devuelta = quedan === null;', 'El NOMBRE del error sí viaja');

  ok(/const \{ error: \w+ \} = await admin\.rpc\('devolver_consulta_ia'/.test(bloque),
     'se recoge el error de la devolución',
     '`admin.rpc()` no lanza cuando Postgres dice que no');
  ok(/devuelta = !err\w+;/.test(bloque), 'y se apunta si fue bien');
  // Esto llevaba un `||` que casaba con cualquier cosa seguida de
  // «? 'El asistente está saturado», un `true` a pelo incluido. O sea que
  // daba por buena justo la mutación que tenía que cazar. Lo que hay que
  // fijar es DE QUÉ depende el mensaje, no que haya un interrogante.
  ok(/error: devuelta\s*\r?\n?\s*\?/.test(bloque),
     'y el mensaje depende de eso, no de una constante',
     'con `error: true ?` sale siempre el texto bueno y volvemos al ' +
     'principio: afirmarle que no gastó una consulta que sí gastó');
  ok(/no gastaste ninguna consulta/.test(pegado(bloque)) &&
     /esta sí te cuenta/.test(pegado(bloque)),
     'hay las dos frases: la buena y la honesta',
     'con una sola, una de las dos situaciones se cuenta mal');

  // `quedan === null` son las acciones que NO cobran -cumple y fotos-.
  // Ahí no hay nada que devolver y la frase buena es verdad sin tocar
  // nada; si arrancara en `false`, se les diría que gastaron una consulta
  // que nunca se les cobró.
  ok(/let devuelta = quedan === null;/.test(bloque),
     'y lo que no cobra arranca ya como devuelto',
     'si no, al cumpleaños y a las fotos se les diría que gastaron una ' +
     'consulta que esas acciones no cobran');
}

// ------------------------------------------------------------------
console.log('\nY la del cumpleaños se contesta igual, a propósito');
{
  const bloque = entre("await admin.from('felicitaciones').upsert({",
                      "return json({ error: 'Acción desconocida.' }, 400);");

  ok(/const \{ error: \w+ \} = await admin\.from\('felicitaciones'\)\.upsert\(/.test(
       sinComentarios(FN)),
     'también se recoge su error');
  ok(/console\.error\('no se pudo guardar la felicitación/.test(bloque),
     'y se apunta en el registro');
  ok(!/\}, 500\);/.test(bloque),
     'pero NO se contesta con error',
     'dejar a alguien sin felicitación el día de su cumpleaños para ' +
     'proteger una fila de la base es peor que la fila que se pierde');
  ok(/estado: 'ok', anio, mensaje/.test(bloque),
     'la felicitación sale igual');
}

// ------------------------------------------------------------------
console.log('\nY no quedan escrituras mudas');
{
  // Todas las escrituras del fichero, mirando si alguien recoge su error.
  const limpio = sinComentarios(FN);
  const mudas = [];
  for (const m of limpio.matchAll(
    /(.{0,60})await admin\s*\r?\n?\s*\.?from\('([a-z_]+)'\)\s*\r?\n?\s*\.(insert|upsert|update|delete)\(/g)) {
    if (!/const \{[^}]*error/.test(m[1])) mudas.push(m[2] + '.' + m[3]);
  }
  ok(mudas.length === 0,
     'ninguna escritura se hace sin mirar si salió',
     'mudas: ' + mudas.join(', ') + '. No hace falta tratarlas todas igual ' +
     '—la del cumple se apunta y sigue— pero sí MIRARLAS');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
