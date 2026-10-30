// Preguntar «¿ya hay fila de hoy?» y no obtener respuesta no es «no hay».
//
// Guardar la sesión es un buscar-y-si-no-insertar escrito a mano: se mira
// si ya existe la fila del día, y si existe se actualiza. La búsqueda
// llevaba esto:
//
//     sbFetch(busca)
//       ['catch'](function(){ return null; })   // y abajo: if(!id) POST
//
// O sea que un 5xx, un token caducando o una cortada que vuelve se
// convertían en «no hay fila» y se insertaba otra. El comentario que lo
// acompañaba decía que es peor perder el entrenamiento que duplicarlo —y
// es verdad—, pero la elección era falsa: hay una tercera salida, que es
// APLAZARLO. La cola ya guarda cómo buscarse y busca antes de insertar.
//
// Y duplicar no es un empate. La pantalla se ve IGUAL con una fila que con
// dos; donde sale es en el cierre del lunes, que cuenta filas y suma
// volúmenes. Ese día saldría como dos sesiones, con el volumen contado dos
// veces y la duración media torcida. Son los números con los que se decide
// si tocar calorías.
//
// Es la misma distinción que la app ya hacía con el plan —«null es "no
// tiene" y se cree; un fallo es "no se pudo preguntar" y no se cree»— y
// que aquí no se había aplicado.
//
// LA OTRA MITAD ESTÁ EN LA BASE: `supabase/tests/una-sesion-por-dia.mjs`
// prueba el índice único, que es lo que cubre los casos que el teléfono no
// puede cubrir —dos aparatos a la vez, o uno con la versión vieja—.
//
// LO QUE SE PRUEBA SE EJECUTA: se corre el encadenado de verdad con un
// `sbFetch` de mentira, y se mira QUÉ PETICIONES SALEN.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8').replace(/\r\n/g, '\n');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

function sacar(cab) {
  const i = APP.indexOf(cab);
  if (i < 0) throw new Error('no encuentro: ' + cab);
  let n = 0, j = APP.indexOf('{', i);
  for (; j < APP.length; j++) {
    if (APP[j] === '{') n++;
    else if (APP[j] === '}') { n--; if (!n) return APP.slice(i, j + 1); }
  }
  throw new Error('llaves sin cerrar en ' + cab);
}

// ------------------------------------------------------------------
// EL GUARDADO. Se corta desde la declaración de APLAZAR hasta el final del
// `catch` que decide qué hacer cuando algo sale mal. Las dos marcas son
// código: si alguien lo reescribe, esto revienta con un mensaje claro en
// vez de pasar sin mirar nada.
const DESDE = "    var APLAZAR = new Error('no se pudo preguntar si ya había fila');";
const HASTA = "      toast('toastRutina', 'No se pudo guardar: ' + traducirError(e.message));\n    });";
const i = APP.indexOf(DESDE);
const f = APP.indexOf(HASTA, i);
if (i < 0 || f < 0) throw new Error('no encuentro el encadenado del guardado');
const GUARDADO = APP.slice(i, f + HASTA.length);

function guardar({ busca: comoResponde }) {
  const salidas = [];
  const encolados = [];
  const avisos = [];
  const sbFetch = (ruta, op) => {
    const metodo = (op && op.method) || 'GET';
    salidas.push(metodo + ' ' + ruta.split('?')[0]);
    if (metodo === 'GET') return comoResponde();
    return Promise.resolve({});
  };
  const correr = new Function(
    'sbFetch', 'sesion', 'fila', 'busca', 'encolar', 'toast', 'pararCrono',
    'sinConexion', 'esperaMejorMomento', 'traducirError', 'SESIONES', 'HISTORIAL',
    'detalle', 'palomitasAntes', 'refsAntes', 'opciones', 'total', 'fecha',
    'mil', 'pintarEjercicio', 'recalcAll', 'programarGuardado', 'diaId', 'JSON',
    'var guardandoSesion = true;\n' + GUARDADO + '\nreturn null;');
  correr(
    sbFetch, { user: { id: 'u-1' } }, { session_date: '2026-10-29' },
    '/rest/v1/workout_sessions?select=id&user_id=eq.u-1&session_date=eq.2026-10-29&limit=1',
    (x) => encolados.push(x), (c, t) => avisos.push(t), () => {},
    (e) => /sin red/.test(String(e && e.message)),
    (e) => /503/.test(String(e && e.message)),
    (m) => String(m), {}, {}, [{}], [], [], null, 21500, '2026-10-29',
    (n) => String(n), () => {}, () => {}, () => {}, null, JSON);
  // El encadenado es asíncrono: se deja correr antes de mirar.
  return new Promise((r) => setTimeout(() => r({ salidas, encolados, avisos }), 0));
}

const YA_HAY = () => Promise.resolve([{ id: 'la-de-esta-mañana' }]);
const NO_HAY = () => Promise.resolve([]);
const REVIENTA = (m) => () => Promise.reject(new Error(m));

console.log('\nCon la búsqueda contestando, lo de siempre');
{
  const r = await guardar({ busca: YA_HAY });
  ok(r.salidas.some((s) => s.startsWith('PATCH')), 'si ya hay fila, se actualiza',
     JSON.stringify(r.salidas));
  ok(!r.salidas.some((s) => s.startsWith('POST')), 'y no se inserta otra');

  const r2 = await guardar({ busca: NO_HAY });
  ok(r2.salidas.some((s) => s.startsWith('POST')), 'y si no hay, se inserta',
     JSON.stringify(r2.salidas));
}

console.log('\nY si la búsqueda NO contesta, no se inventa la respuesta');
{
  for (const [error, que] of [
    ['500 Internal Server Error', 'un 5xx del servidor'],
    ['sin red', 'una cortada'],
    ['503 Service Unavailable', 'el servidor de mal día'],
    ['Failed to fetch', 'lo que sea'],
  ]) {
    const r = await guardar({ busca: REVIENTA(error) });
    ok(!r.salidas.some((s) => s.startsWith('POST')), `con ${que}, NO se inserta`,
       'salió ' + JSON.stringify(r.salidas) + ': insertar aquí es dejar dos ' +
       'filas del mismo día, y el cierre del lunes cuenta filas');
    ok(r.encolados.length === 1, `y con ${que}, se encola`,
       'no se pierde el entrenamiento: la cola guarda cómo buscarse y busca ' +
       'antes de insertar, cuando el servidor vuelva a contestar');
    ok(r.encolados[0] && r.encolados[0].buscar,
       `y el encolado lleva CÓMO buscarse (${que})`,
       'sin `buscar` la cola inserta a ciegas y volvemos al principio');
    ok(/se sube cuando haya señal/.test(String(r.avisos[0])),
       `y se le dice a la persona (${que})`, 'dijo: ' + JSON.stringify(r.avisos));
  }
}

// ------------------------------------------------------------------
console.log('\nY la cola tampoco inserta a ciegas');
{
  const VACIAR = sacar('function vaciarCola(){');
  function vaciar(comoResponde) {
    const salidas = [];
    let COLA = [{
      ruta: '/rest/v1/workout_sessions',
      buscar: '/rest/v1/workout_sessions?select=id&user_id=eq.u-1',
      op: { method: 'POST', headers: {}, body: '{}' },
      dueno: 'u-1', tipo: 'sesion',
    }];
    const sbFetch = (ruta, op) => {
      const metodo = (op && op.method) || 'GET';
      salidas.push(metodo + ' ' + ruta.split('?')[0]);
      if (metodo === 'GET') return comoResponde();
      return Promise.resolve({});
    };
    // `vaciarCola` REASIGNA `COLA` (`COLA = COLA.filter(...)`), así que
    // mirarla desde fuera no sirve de nada: la de fuera nunca cambia y la
    // comprobación pasa siempre. Lo enseñó una mutación —tirar el apunte
    // en vez de conservarlo— que esta prueba dejaba pasar. Se devuelve
    // desde DENTRO, que es donde vive la de verdad.
    return new Function(
      'sbFetch', 'sesion', 'COLA', 'colaGuardar', 'pintarPendientes', 'avisarSubidos',
      'sinConexion', 'esperaMejorMomento',
      'var colaVaciando = false;\n' + VACIAR +
      '\nreturn vaciarCola().then(function(){ return COLA.length; });'
    )(sbFetch, { user: { id: 'u-1' } }, COLA, () => {}, () => {}, () => {},
      (e) => /sin red/.test(String(e && e.message)),
      (e) => /503/.test(String(e && e.message)))
      .then((quedan) => ({ salidas, quedan }));
  }

  const bien = await vaciar(() => Promise.resolve([{ id: 'ya-existe' }]));
  ok(bien.salidas.some((s) => s.startsWith('PATCH')) && !bien.salidas.some((s) => s.startsWith('POST')),
     'si la encuentra, la actualiza', JSON.stringify(bien.salidas));

  const roto = await vaciar(REVIENTA('500 Internal Server Error'));
  ok(!roto.salidas.some((s) => s.startsWith('POST')),
     'y si no puede preguntar, NO inserta',
     'salió ' + JSON.stringify(roto.salidas) + ': aquí decía literalmente ' +
     '«si falla, se inserta»');
  ok(roto.quedan === 1, 'y el apunte se queda en la cola para la próxima',
     'quedan ' + roto.quedan + ': tirarlo sería perder el entrenamiento, que ' +
     'es justo lo que el insertar a ciegas intentaba evitar');
}

// ------------------------------------------------------------------
console.log('\nY primero se mira si hay algo que guardar');
{
  const g = sacar('function guardarSesionAhora(opciones){');
  const iVacio = g.indexOf("if(!detalle.length)");
  const iSinSesion = g.indexOf("if(!sesion || !sesion.user){ guardandoSesion");
  ok(iVacio > 0 && iSinSesion > iVacio,
     'la rutina vacía se avisa antes de mirar con quién se guarda',
     'al revés, sin sesión se decía «Sesión guardada» y se paraba el ' +
     'cronómetro sobre una rutina sin una sola serie con peso');
}

console.log('\nY la base lo impide por su cuenta');
{
  const SQL = readFileSync(join(RAIZ, 'supabase', 'migrations',
    '0059_una_sesion_por_dia.sql'), 'utf8');
  ok(/create unique index.*uq_sesion_por_dia_de_rutina/s.test(SQL) &&
     /create unique index.*uq_sesion_por_dia_suelto/s.test(SQL),
     'hay un índice único, y cubre también el día de rutina nulo',
     'el arreglo del teléfono no vale para dos aparatos a la vez ni para ' +
     'uno con la versión vieja: eso solo lo cubre la base');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
