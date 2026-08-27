// Guardar la sesión dos veces no puede duplicar el volumen.
//
// `workout_sessions` no tiene nada que impida dos filas con la misma fecha,
// y «Guardar sesión» hacía un POST plano cada vez que se pulsaba. Los reps y
// los pesos NO se borran al guardar —solo se apagan las palomitas—, así que
// el segundo toque leía exactamente lo mismo y mandaba una fila idéntica.
//
// Contar las VECES ya está arreglado: se cuentan días. Pero el VOLUMEN suma
// todas las filas, y eso está bien —quien entrena dos veces de verdad hizo
// el doble de trabajo—. Con una fila duplicada por un doble toque, el
// volumen de ese día salía por dos, y de ahí sale la regla más cara del
// cierre: «peso plano y volumen SUBIENDO → está funcionando, no le toques
// nada». Un volumen inflado le dice a la IA que progresaste cuando no.
//
// LA CLAVE ESTÁ EN LA PROPIA FILA. Lleva `routine_day_id`: entrenar dos
// veces de verdad en un día son dos DÍAS DE RUTINA distintos —empuje por la
// mañana, tirón por la tarde—, y eso sigue siendo dos filas. Guardar el
// MISMO día de rutina dos veces en la misma fecha es el accidente, y esa
// segunda vez tiene que actualizar la primera, no añadirse.
//
// No hace falta tocar la base ni borrar nada de lo que ya hay: se mira si la
// fila existe y se actualiza. Y un candado mientras la petición está en el
// aire, porque dos toques seguidos no dan tiempo a que la primera conteste.

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

// El guardado entero: el candado, el manejador que engancha el botón y la
// función que hace el trabajo.
//
// EL TRABAJO SALIÓ DEL MANEJADOR. Antes estaba todo dentro del
// `addEventListener` y bastaba con extraer eso. Ahora el manejador es un
// envoltorio de tres líneas —try/catch, para que un tropiezo no deje el
// candado cerrado para siempre; ver candado-de-la-sesion— y la lógica vive
// en `guardarSesionAhora`. Se extraen los tres trozos porque los tres son
// parte de lo mismo: sin el candado no se puede evaluar, y sin el envoltorio
// no hay botón que pulsar.
function manejador() {
  const decl = APP.indexOf('  var guardandoSesion = false;');
  if (decl < 0) throw new Error('no encuentro el candado `guardandoSesion`');
  const cab = '  function guardarSesionAhora(){';
  const i = APP.indexOf(cab, decl);
  if (i < 0) throw new Error('no encuentro `guardarSesionAhora`');
  let n = 0, j = APP.indexOf('{', i);
  for (; j < APP.length; j++) {
    if (APP[j] === '{') n++;
    else if (APP[j] === '}') { n--; if (!n) return APP.slice(decl, j + 1); }
  }
  throw new Error('llaves sin cerrar');
}

// ---- Un navegador de mentira, con lo justo ----
function montar({ filasQueYaHay = [], fallaLaConsulta = false,
                  fallaLaEscritura = false } = {}) {
  const peticiones = [];
  const pendientes = [];

  const sbFetch = (ruta, op) => {
    const esConsulta = /select=id/.test(ruta);
    peticiones.push({ ruta, metodo: (op && op.method) || 'GET',
                      cuerpo: op && op.body ? JSON.parse(op.body) : null });
    let resolver, rechazar;
    const p = new Promise((r, j) => { resolver = r; rechazar = j; });
    pendientes.push(() => {
      if (esConsulta && fallaLaConsulta) return rechazar(new Error('sin red'));
      if (!esConsulta && fallaLaEscritura) return rechazar(new Error('sin red'));
      resolver(esConsulta ? filasQueYaHay : null);
    });
    return p;
  };

  // Una tarjeta de ejercicio con una serie de 10×50.
  const serie = { querySelectorAll: (s) => (s === '.set-input'
    ? [{ value: '10' }, { value: '50' }] : []), querySelector: () => null };
  const tarjeta = {
    _attrs: {},
    querySelector: (s) => (s === '.ex-name'
      ? { childNodes: [{ textContent: 'Press banca' }] } : null),
    querySelectorAll: (s) => (s === '.sets-table tr' ? [serie] : []),
    getAttribute(k) { return this._attrs[k] ?? null; },
    setAttribute(k, v) { this._attrs[k] = v; },
    removeAttribute(k) { delete this._attrs[k]; },
  };
  const exList = {
    querySelectorAll: (s) => (s === '.exercise-card' ? [tarjeta] : []),
  };

  const ctx = {
    exList,
    SESIONES: {}, HISTORIAL: {},
    sesion: { user: { id: 'u1' } },
    HOY: new Date('2026-08-25T12:00:00'),
    iso: (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
                '-' + String(d.getDate()).padStart(2, '0'),
    volumenDeSerie: (reps, peso) => reps * peso,
    activeTab: () => ({ dataset: { id: 'dia-empuje' }, textContent: 'Empuje' }),
    saveCurrentDay: () => {},
    pintarEjercicio: () => {},
    recalcAll: () => {},
    programarGuardado: () => {},
    toast: (id, t) => ctx.avisos.push(t),
    mil: (n) => String(n),
    traducirError: (m) => m,
    avisos: [],
    sbFetch, peticiones,
    soltar: () => { const f = pendientes.shift(); if (f) f(); },
    soltarTodo: () => { while (pendientes.length) pendientes.shift()(); },
  };
  return ctx;
}

// Se registra el manejador con un `document` que devuelve el botón, y se
// devuelve la función que estaba escuchando el clic.
function pulsar(ctx) {
  let escucha = null;
  const document = {
    getElementById: (id) => ({
      addEventListener: (_ev, fn) => { escucha = fn; },
      set textContent(v) {}, set disabled(v) { ctx.deshabilitado = v; },
    }),
  };
  // El manejador se registra al evaluarse: el `document` de mentira se
  // queda con la función que le pasan a `addEventListener`, y esa es la que
  // se devuelve para poder «pulsar» el botón.
  const nombres = Object.keys(ctx);
  new Function('document', ...nombres, manejador())(document, ...nombres.map((k) => ctx[k]));
  if (!escucha) throw new Error('el manejador no se registró');
  return escucha;
}

// ------------------------------------------------------------------
console.log('\nDos toques seguidos mandan una sola escritura');
{
  const ctx = montar();
  const clic = pulsar(ctx);
  clic();                       // primer toque: sale la consulta
  clic();                       // segundo, con la primera aún en el aire
  // EXACTAMENTE UNA, no «dos o menos». Sin candado salen dos consultas —una
  // por toque—, y las dos contestan «no hay» y crean su fila. Con el umbral
  // en «≤ 2» la comprobación pasaba con el candado quitado; lo enseñó una
  // mutación.
  ok(ctx.peticiones.length === 1,
     'el segundo toque no dispara nada',
     'salieron ' + ctx.peticiones.length + ' peticiones: ' +
     ctx.peticiones.map((p) => p.metodo + ' ' + p.ruta.slice(0, 45)).join(' | '));
  ok(ctx.peticiones[0] && ctx.peticiones[0].metodo === 'GET',
     'y la única que sale es la de preguntar si ya hay una');
}

console.log('\nSin sesión previa de hoy, se crea una fila');
{
  const ctx = montar({ filasQueYaHay: [] });
  const clic = pulsar(ctx);
  clic();
  ctx.soltarTodo();
  await new Promise((r) => setTimeout(r, 10));
  ctx.soltarTodo();
  await new Promise((r) => setTimeout(r, 10));
  const post = ctx.peticiones.find((p) => p.metodo === 'POST');
  ok(!!post, 'sale un alta',
     'peticiones: ' + ctx.peticiones.map((p) => p.metodo).join(','));
  ok(post && post.cuerpo && post.cuerpo.total_volume === 500,
     'con el volumen de la sesión', JSON.stringify(post && post.cuerpo));
  ok(post && post.cuerpo.routine_day_id === 'dia-empuje',
     'y con el día de rutina, que es lo que la hace única');
}

console.log('\nY si ya hay una de hoy para ese mismo día, se actualiza');
{
  const ctx = montar({ filasQueYaHay: [{ id: 'fila-1' }] });
  const clic = pulsar(ctx);
  clic();
  ctx.soltarTodo();
  await new Promise((r) => setTimeout(r, 10));
  ctx.soltarTodo();
  await new Promise((r) => setTimeout(r, 10));

  const post = ctx.peticiones.find((p) => p.metodo === 'POST');
  const patch = ctx.peticiones.find((p) => p.metodo === 'PATCH');
  ok(!post, 'no se crea una segunda fila',
     'se duplicaría el volumen del día, y de ahí sale «volumen SUBIENDO → ' +
     'está funcionando, no le toques nada»');
  ok(!!patch, 'se actualiza la que ya estaba',
     'peticiones: ' + ctx.peticiones.map((p) => p.metodo).join(','));
  ok(patch && /fila-1/.test(patch.ruta), 'la de hoy, por su id',
     patch && patch.ruta);
  ok(patch && patch.cuerpo && patch.cuerpo.total_volume === 500,
     'con lo que hay en pantalla, que es el total del día');
}

console.log('\nLa consulta busca por fecha Y por día de rutina');
{
  const ctx = montar();
  const clic = pulsar(ctx);
  clic();
  const q = ctx.peticiones[0];
  ok(q && /session_date=eq\.2026-08-25/.test(q.ruta), 'por la fecha de hoy',
     q && q.ruta);
  ok(q && /routine_day_id=eq\.dia-empuje/.test(q.ruta), 'y por el día de rutina',
     'sin esto, entrenar empuje por la mañana y tirón por la tarde se ' +
     'machacarían el uno al otro: ' + (q && q.ruta));
  ok(q && /user_id=eq\.u1/.test(q.ruta), 'y solo lo suyo');
}

console.log('\nY sin día de rutina se busca la fila sin día, no cualquiera');
{
  const ctx = montar();
  ctx.activeTab = () => null;
  const clic = pulsar(ctx);
  clic();
  const q = ctx.peticiones[0];
  ok(q && /routine_day_id=is\.null/.test(q.ruta),
     'se pide la que tampoco tiene día',
     'con `eq.null` PostgREST no casa nada y siempre crearía fila nueva: ' +
     (q && q.ruta));
}

console.log('\nSi la consulta falla, se guarda igual: no se pierde la sesión');
{
  // Preguntar «¿ya hay una?» es una mejora, y no puede convertirse en un
  // motivo para perder el entrenamiento: peor un volumen duplicado que una
  // sesión que no queda registrada.
  //
  // La primera versión de esta comprobación solo miraba que la consulta
  // SALIERA —nunca la hacía fallar— y pasaba en verde con el `catch`
  // quitado. Lo enseñó una mutación.
  const ctx = montar({ fallaLaConsulta: true });
  const clic = pulsar(ctx);
  clic();
  ctx.soltarTodo();
  await new Promise((r) => setTimeout(r, 10));
  ctx.soltarTodo();
  await new Promise((r) => setTimeout(r, 10));

  const q = ctx.peticiones[0];
  ok(q && /limit=1/.test(q.ruta), 'la consulta pide una sola fila',
     'traerse el historial entero para saber si hay una es caro y lento');
  const escrituras = ctx.peticiones.filter((p) => p.metodo !== 'GET');
  ok(escrituras.length === 1, 'y aunque falle, la sesión se guarda igual',
     'salieron ' + escrituras.length + ' escrituras: con la consulta caída el ' +
     'entrenamiento no queda registrado, y eso es peor que duplicarlo');
  ok(escrituras[0] && escrituras[0].metodo === 'POST',
     'creando fila, que es lo prudente cuando no se sabe si hay una');
}

console.log('\nY si el guardado falla, se puede reintentar');
{
  // El candado tiene que soltarse también por la rama del error. Si no,
  // quien pierde la conexión no puede volver a darle sin recargar la app, y
  // encima acaba de leer «no se pudo guardar».
  const ctx = montar({ fallaLaEscritura: true });
  const clic = pulsar(ctx);
  clic();
  ctx.soltarTodo();
  await new Promise((r) => setTimeout(r, 10));
  ctx.soltarTodo();
  await new Promise((r) => setTimeout(r, 10));

  ok(ctx.avisos.some((a) => /no se pudo guardar/i.test(a)), 'se avisa del fallo',
     'avisos: ' + JSON.stringify(ctx.avisos));
  const antes = ctx.peticiones.length;
  clic();
  ok(ctx.peticiones.length > antes, 'y se puede volver a intentar',
     'el candado se quedó puesto: habría que recargar la app para reintentar');
}

console.log('\nY el candado se suelta, pase lo que pase');
{
  const ctx = montar({ filasQueYaHay: [] });
  const clic = pulsar(ctx);
  clic();
  ctx.soltarTodo();
  await new Promise((r) => setTimeout(r, 10));
  ctx.soltarTodo();
  await new Promise((r) => setTimeout(r, 10));
  const antes = ctx.peticiones.length;
  clic();                       // otro toque después de terminar
  ok(ctx.peticiones.length > antes, 'un toque posterior sí vuelve a guardar',
     'si el candado no se suelta, no se puede volver a guardar hasta ' +
     'recargar la app');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
