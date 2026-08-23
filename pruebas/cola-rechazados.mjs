// Lo que la cola tira, y lo que tira sin decirlo.
//
// La cola guarda en el teléfono lo que no se pudo subir y lo manda cuando
// vuelve la señal. Cuando el servidor RECHAZA un apunte, lo saca de la cola
// para no atascarla: si se reintentara para siempre, nada de lo que viniera
// detrás volvería a subir nunca. Hasta ahí, bien.
//
// DOS FALLOS.
//
// 1. Se avisaba solo `if(subidos)`. Si el servidor rechaza TODO y no sube
//    nada, los apuntes desaparecen de la cola y de la pantalla sin una
//    palabra. Es justo lo que la cabecera de la sección llama la peor
//    versión posible: la persona cree que su comida está guardada. El propio
//    avisarSubidos() dice en su comentario «los rechazados se dicen, no se
//    callan», y el sitio donde se llama no le dejaba.
//
// 2. Un 500 o un 503 no es el servidor diciendo que NO: es el servidor
//    teniendo un mal minuto. Se trataban igual que un dato inválido, así que
//    un rato malo de Supabase se llevaba por delante la comida apuntada sin
//    señal. Un 429 igual, y ese además llega solo cuando se sube mucho de
//    golpe: justo al volver de un viaje con la cola llena.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

// ---- La cola de verdad ----
const trozo = (desde, hasta) => {
  const i = APP.indexOf(desde);
  if (i < 0) throw new Error('no encuentro: ' + desde);
  return APP.slice(i, APP.indexOf(hasta, i));
};
const FUENTE =
  trozo('  function sinConexion(e){', '\n  function colaCargar') + '\n' +
  // Desde esperaMejorMomento y no desde colaVaciando: empezando ahí, esa
  // función se quedaba fuera y dentro del catch saltaba un ReferenceError,
  // que corta la vuelta igual que la falta de red. Los casos del 5xx pasaban
  // en verde por el motivo equivocado.
  trozo('  function esperaMejorMomento(e){', '\n  // Se intenta al volver la señal');

// `respuestas`: qué hace el servidor con cada apunte, en orden.
//   'ok'      -> lo acepta
//   'sinred'  -> no hay red (TypeError, como el fetch de verdad)
//   {status}  -> responde con ese código
function correr(cola, respuestas) {
  const visto = { avisos: [], guardado: 0, pintado: 0, mandados: [] };
  let n = 0;
  const sbFetch = (ruta) => {
    visto.mandados.push(ruta);
    const r = respuestas[n++] ?? 'ok';
    if (r === 'ok') return Promise.resolve({});
    if (r === 'sinred') { const e = new TypeError('Failed to fetch'); return Promise.reject(e); }
    const e = new Error(r.msg || ('Error ' + r.status));
    e.status = r.status;
    return Promise.reject(e);
  };
  const caja = new Function('COLA', 'sesion', 'sbFetch', 'navigator', 'visto', `
    function colaGuardar(){ visto.guardado++; }
    function pintarPendientes(){ visto.pintado++; }
    function avisarSubidos(s, r){ visto.avisos.push({ subidos: s, rechazados: r }); }
    ${FUENTE}
    return { vaciar: vaciarCola, cola: function(){ return COLA; } };`);
  const api = caja(cola.slice(), { user: { id: 'yo' } }, sbFetch, { onLine: true }, visto);
  return api.vaciar().then((subidos) => ({ ...visto, subidos, queda: api.cola() }));
}

const apunte = (n) => ({ ruta: '/rest/v1/diary_entries', op: { method: 'POST' },
                         fila: 'f' + n, dueno: 'yo' });
const TRES = [apunte(1), apunte(2), apunte(3)];

// ------------------------------------------------------------------
console.log('\nLo que ya funcionaba');
{
  const r = await correr(TRES, ['ok', 'ok', 'ok']);
  ok(r.queda.length === 0 && r.subidos === 3, 'los tres suben y la cola queda vacía');
  ok(r.avisos.length === 1 && r.avisos[0].subidos === 3, 'y se dice');

  const s = await correr(TRES, ['ok', 'sinred']);
  ok(s.queda.length === 2, 'sin red se para: lo que queda se queda',
     'quedan ' + s.queda.length);
  ok(s.mandados.length === 2, 'y no se sigue con los siguientes, que se adelantarían');

  const d = await correr(TRES, [{ status: 409, msg: 'duplicate key value' }, 'ok', 'ok']);
  ok(d.subidos === 3, 'un 409 es "ya estaba", no un fallo');
}

// ------------------------------------------------------------------
console.log('\n1. Si el servidor rechaza TODO, hay que decirlo');
{
  const r = await correr(TRES, [{ status: 400, msg: 'violates check constraint' },
                                { status: 400, msg: 'violates check constraint' },
                                { status: 400, msg: 'violates check constraint' }]);
  ok(r.queda.length === 0, 'la cola no se atasca: los tres se tiran');
  ok(r.avisos.length === 1,
     'pero se avisa aunque no subiera ninguno',
     'no se avisó nada: tres apuntes desaparecen de la pantalla sin una palabra');
  ok(r.avisos[0] && r.avisos[0].rechazados === 3, 'y se dice cuántos',
     JSON.stringify(r.avisos));
}

// ------------------------------------------------------------------
console.log('\n2. Un mal minuto del servidor no es un NO');
{
  for (const status of [500, 502, 503, 504, 429, 408]) {
    const r = await correr([apunte(1)], [{ status }]);
    ok(r.queda.length === 1,
       `un ${status} deja el apunte en la cola para más tarde`,
       'se tiró: un rato malo del servidor se lleva por delante la comida apuntada');
  }
  // Y se para, como con la falta de red: seguir adelantaría los siguientes.
  const s = await correr(TRES, ['ok', { status: 503 }]);
  ok(s.mandados.length === 2, 'y se corta la vuelta, no se sigue con los de detrás');
  ok(s.queda.length === 2, 'quedando los dos que faltaban');
}

// ------------------------------------------------------------------
console.log('\nY lo que SÍ es un no sigue tirándose');
{
  const r = await correr(TRES, [{ status: 400, msg: 'violates check constraint' }, 'ok', 'ok']);
  ok(r.queda.length === 0 && r.subidos === 2,
     'un dato que el servidor no acepta no se reintenta para siempre');
  const p = await correr([apunte(1)], [{ status: 403, msg: 'permission denied' }]);
  ok(p.queda.length === 0, 'ni un problema de permisos');
}

// ------------------------------------------------------------------
console.log('\nY el código lo tiene que poner sbFetch, o nada de esto sirve');
{
  // Las dos mitades del arreglo viven en sitios distintos: la cola DECIDE
  // con e.status y sbFetch es quien lo PONE. Comprobar solo la cola, con un
  // sbFetch de mentira que ya trae el código, daría verde con la app rota.
  // Así que aquí se ejecuta el sbFetch de verdad.
  const i = APP.indexOf('  function sbFetch(ruta, op, reintento){');
  const suyo = APP.slice(i, APP.indexOf('\n  }', APP.indexOf('return d;', i)) + 4);

  const conRespuesta = (status, cuerpo) => {
    const fetch = () => Promise.resolve({
      ok: status >= 200 && status < 300, status,
      text: () => Promise.resolve(cuerpo),
    });
    const caja = new Function('fetch', 'SB_URL', 'SB_KEY', 'sesion',
      'sbRefrescar', 'sesionCaducada',
      suyo + '; return sbFetch;')(fetch, 'https://x.supabase.co', 'clave', null,
        () => Promise.reject(new Error('no')), () => {});
    return caja('/rest/v1/diary_entries', { method: 'POST' });
  };

  const caido = await conRespuesta(503, '').then(() => null, (e) => e);
  ok(caido && caido.status === 503, 'un 503 llega con su código',
     'llegó con status ' + (caido && caido.status) +
     ': la cola no puede distinguirlo de un dato inválido');

  const malo = await conRespuesta(400, JSON.stringify({ message: 'violates check constraint "carbs"' }))
    .then(() => null, (e) => e);
  ok(malo && malo.status === 400, 'y un 400 también');
  ok(malo && /violates check constraint/.test(malo.message),
     'sin perder el mensaje de la base, que es lo que se le enseña a la persona');

  // Y que la cola decida mirando ESE campo y no otro inventado.
  const iCola = APP.indexOf('  function esperaMejorMomento(e){');
  ok(/e && e\.status/.test(APP.slice(iCola, iCola + 300)),
     'y la cola decide mirando ese mismo campo');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
