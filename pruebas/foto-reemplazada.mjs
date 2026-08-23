// Reemplazar una foto y que falle a mitad.
//
// Subir una foto a un hueco que ya tenía una son TRES pasos: se sube el
// archivo al bucket, se aparta la ficha anterior -en esta base un DELETE no
// borra, archiva- y se mete la ficha nueva. El índice único de
// (user_id, week_key, pose) solo cuenta las no archivadas, así que apartar
// la vieja tiene que ir ANTES de meter la nueva.
//
// EL FALLO. Si la red se cae entre esos dos últimos pasos, la ficha vieja ya
// está apartada y la nueva no existe: en el servidor ese hueco quedó vacío.
// Pero la app, al fallar, repone la foto anterior EN PANTALLA. Así que dice
// «No se pudo subir» y deja la de antes a la vista, como si no se hubiera
// perdido nada... hasta que se recarga y el hueco aparece vacío.
//
// Es justo lo que esta misma app se prohíbe en otro sitio, cuando falla el
// borrado de un alimento: «la pantalla no debe mentir sobre lo que hay
// guardado».

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

// `falla`: en qué paso se cae la red. 'archivo' | 'apartar' | 'ficha' | null
function subir(falla) {
  const visto = { pasos: [] };
  const sbStorage = () => {
    visto.pasos.push('archivo');
    if (falla === 'archivo') return Promise.reject(new TypeError('Failed to fetch'));
    return Promise.resolve({ ok: true });
  };
  const sbFetch = (ruta, op) => {
    const paso = (op && op.method) === 'DELETE' ? 'apartar' : 'ficha';
    visto.pasos.push(paso);
    if (falla === paso) return Promise.reject(new TypeError('Failed to fetch'));
    return Promise.resolve([{ id: 'x' }]);
  };
  const caja = new Function('sesion', 'sbStorage', 'sbFetch', 'BUCKET', 'Date',
    FUENTE + '; return sbSubirFoto;')(
    { user: { id: 'yo' } }, sbStorage, sbFetch, 'progress-photos', Date);

  return caja('2026-W34', 'frente', { tipo: 'image/webp', blob: {}, bytes: 100, w: 10, h: 10 })
    .then(() => ({ ...visto, error: null }), (e) => ({ ...visto, error: e }));
}

// ------------------------------------------------------------------
console.log('\nLos tres pasos, en su orden');
{
  const r = await subir(null);
  ok(r.error === null, 'con red va bien');
  ok(r.pasos.join(' → ') === 'archivo → apartar → ficha',
     'primero el archivo, luego apartar la anterior, luego la ficha nueva',
     r.pasos.join(' → '));
}

// ------------------------------------------------------------------
console.log('\nY el error dice SI LA ANTERIOR YA SE APARTÓ');
{
  const pronto = await subir('archivo');
  ok(pronto.error && !pronto.error.laAnteriorSeAparto,
     'si falla subiendo el archivo, la anterior sigue donde estaba');

  const tarde = await subir('ficha');
  ok(tarde.error && tarde.error.laAnteriorSeAparto === true,
     'pero si falla al meter la ficha, la anterior YA está apartada',
     'el error no lo dice, así que la app repone en pantalla una foto que en ' +
     'el servidor ya no está: al recargar, el hueco aparece vacío');

  const medio = await subir('apartar');
  ok(medio.error && !medio.error.laAnteriorSeAparto,
     'y si falla justo al apartarla, tampoco se apartó');
}

// ------------------------------------------------------------------
console.log('\nY quien lo recoge no repone lo que ya no existe');
{
  const c = hasta("      sbSubirFoto(c, pose, res).then(function(){", "      });");
  ok(/e && e\.laAnteriorSeAparto/.test(c),
     'el catch mira si la anterior se apartó');
  ok(/if\(antes && !\(e && e\.laAnteriorSeAparto\)\)/.test(c),
     'y solo repone la de antes cuando de verdad sigue guardada',
     'reponerla siempre es decirle a la persona que no perdió nada');
  ok(/quedó apartada|se apartó/.test(c),
     'y cuando sí se perdió, se dice',
     'callarlo es peor: se entera al recargar, cuando ya no puede volver a ponerla');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
