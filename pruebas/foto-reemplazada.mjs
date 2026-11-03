// Reemplazar una foto y que falle a mitad.
//
// CÓMO ERA. Eran TRES pasos: subir el archivo al bucket, apartar la ficha
// anterior —en esta base un DELETE no borra, archiva— y meter la ficha
// nueva. El índice único de (user_id, week_key, pose) solo cuenta las no
// archivadas, así que apartar la vieja tenía que ir ANTES de meter la nueva.
//
// Y entre esos dos últimos pasos no había nada. Si la red se caía ahí, la
// ficha vieja ya estaba apartada y la nueva no existía: en el servidor ese
// hueco quedaba VACÍO. La app, al fallar, reponía la foto anterior en
// pantalla, así que decía «No se pudo subir» y dejaba la de antes a la
// vista, como si no se hubiera perdido nada... hasta recargar.
//
// Durante un tiempo esto se tapó con una marca —`laAnteriorSeAparto`— que
// distinguía los dos fallos para al menos no mentir en pantalla. Saberlo no
// era arreglarlo: la foto se perdía igual, y es de las que no se reponen,
// porque una foto de progreso de hace tres meses no se vuelve a tomar.
//
// CÓMO ES AHORA. Los dos pasos de base son uno: `reemplazar_foto()` los hace
// dentro de una transacción, o los dos o ninguno. El estado intermedio ya no
// existe, así que la marca sobra y la pantalla puede reponer siempre.
//
// Lo que esta prueba vigila ahora es que no vuelva a partirse en dos.

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

const hasta = (desde, fin) => {
  const i = APP.indexOf(desde);
  if (i < 0) throw new Error('no encuentro: ' + desde);
  return APP.slice(i, APP.indexOf(fin, i) + fin.length);
};

// ---- La subida de verdad ----
const FUENTE = hasta('  function sbSubirFoto(clave, pose, res){', '\n  }');

// `falla`: en qué paso se cae la red. 'archivo' | 'base' | null
function subir(falla) {
  const visto = { pasos: [], rpc: null, fetch: 0 };
  const sbStorage = () => {
    visto.pasos.push('archivo');
    if (falla === 'archivo') return Promise.reject(new TypeError('Failed to fetch'));
    return Promise.resolve({ ok: true });
  };
  // Si volviera a haber un `sbFetch` aquí dentro, es que alguien partió otra
  // vez el paso de base en dos. Se cuenta para poder decirlo.
  const sbFetch = () => { visto.fetch++; return Promise.resolve([{ id: 'x' }]); };
  const sbRpc = (nombre, args) => {
    visto.pasos.push('base');
    visto.rpc = { nombre, args };
    if (falla === 'base') return Promise.reject(new TypeError('Failed to fetch'));
    return Promise.resolve({ id: 'x' });
  };
  const caja = new Function('sesion', 'sbStorage', 'sbFetch', 'sbRpc',
    'BUCKET', 'Date', 'apuntarFallo',
    FUENTE + '; return sbSubirFoto;')(
    { user: { id: 'yo' } }, sbStorage, sbFetch, sbRpc,
    'progress-photos', Date, () => {});

  return caja('2026-W34', 'frente', { tipo: 'image/webp', blob: {}, bytes: 100, w: 10, h: 10 })
    .then(() => ({ ...visto, error: null }), (e) => ({ ...visto, error: e }));
}

// ------------------------------------------------------------------
console.log('\nDos pasos, no tres');
{
  const r = await subir(null);
  ok(r.error === null, 'con red va bien');
  ok(r.pasos.join(' → ') === 'archivo → base',
     'el archivo primero, y la base de una sola vez',
     'quedó: ' + r.pasos.join(' → '));
  ok(r.fetch === 0, 'y ni un viaje suelto a la tabla',
     'un DELETE y un INSERT por separado son el hueco por el que se perdía ' +
     'la foto: entre los dos no hay nada que los sostenga');
}

// ------------------------------------------------------------------
console.log('\nY lo que se le manda a la base es lo justo');
{
  const r = await subir(null);
  ok(r.rpc?.nombre === 'reemplazar_foto', 'se llama a `reemplazar_foto`');
  ok(r.rpc?.args.p_semana === '2026-W34' && r.rpc?.args.p_pose === 'frente',
     'con la semana y la pose', JSON.stringify(r.rpc?.args));
  ok(typeof r.rpc?.args.p_ruta === 'string' && r.rpc.args.p_ruta.includes('frente'),
     'y la ruta del archivo que acaba de subir');
  ok(!('p_user' in (r.rpc?.args || {})) &&
     !JSON.stringify(r.rpc?.args || {}).includes('"yo"'),
     'Y NO EL DUEÑO: lo pone la base con `auth.uid()`',
     'por parámetro, cambiar una cadena borraría las fotos de otra persona — ' +
     'y la función corre saltándose RLS');
}

// ------------------------------------------------------------------
console.log('\nY si falla, falla entero');
{
  const pronto = await subir('archivo');
  ok(pronto.error instanceof Error, 'si falla subiendo el archivo, falla');
  ok(pronto.pasos.join(' → ') === 'archivo',
     'y no se llega a tocar la base',
     'quedó: ' + pronto.pasos.join(' → '));

  const tarde = await subir('base');
  ok(tarde.error instanceof Error, 'y si falla la base, también');
  // LA DIFERENCIA ENTRE LOS DOS FALLOS YA NO EXISTE, que es el arreglo.
  // Antes había que distinguirlos porque uno dejaba el hueco vacío.
  ok(!tarde.error.laAnteriorSeAparto,
     'pero ya no hay un fallo «a medias» que distinguir',
     'la transacción deshace el archivado si la ficha nueva no entra: lo que ' +
     'queda guardado es exactamente lo que había antes de empezar');
}

// ------------------------------------------------------------------
console.log('\nY quien lo recoge repone lo de antes, que ahora es verdad');
{
  const c = hasta("      sbSubirFoto(c, pose, res).then(function(){", "      });");
  ok(/if\(antes\) FOTOS\[c\]\[pose\] = antes;/.test(c),
     'se repone la foto anterior sin condiciones',
     'ya no puede estar apartada en el servidor, así que reponerla no miente');
  ok(!/laAnteriorSeAparto/.test(APP),
     'y la marca del fallo a medias no queda por ningún lado',
     'una marca de un caso que ya no existe es una trampa para el que la lea ' +
     'dentro de un año');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
