// El aviso de que quedaron fotos se pisaba con el de «fue eliminado».
//
// Al borrar una cuenta, la Edge Function devuelve `sueltos`: cuántas fotos
// NO se pudieron quitar del bucket. Ese número existe por una razón muy
// concreta, escrita en la propia función: cuando el borrado de los archivos
// falla, la cuenta YA está borrada y no se puede deshacer, así que se dice
// cuántas quedaron en vez de fingir que salió todo bien.
//
// La app lo recibía y lo enseñaba… en un aviso que moría al instante:
//
//   .then(r => { if(r.sueltos) toast('toastAdmin', '…N fotos…'); })
//   .then(()  => { …; toast('toastAdmin', 'X fue eliminado.'); })
//
// Los dos usan el MISMO hueco y salen seguidos, en la misma vuelta. El
// segundo le pisa el texto al primero antes de que el navegador llegue a
// pintarlo. O sea que el único mensaje que de verdad importaba —quedaron
// fotos de una persona en un servidor después de que pidiera que no quedara
// nada suyo— no se veía nunca.
//
// Y es de los que no se descubren usando la app: solo aparece cuando falla
// el borrado del bucket, que es raro. Cuando pase, no habrá segunda
// oportunidad de enterarse: la cuenta ya no existe y con ella la lista de
// rutas.
//
// Un solo aviso, que diga las dos cosas.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const FN = readFileSync(join(RAIZ, 'supabase', 'functions', 'borrar-cuenta', 'index.ts'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

// El manejador del botón de eliminar, entero.
const manejador = (() => {
  const i = APP.indexOf("document.getElementById('usrBorrarBtn')");
  if (i < 0) throw new Error('no encuentro el botón de eliminar');
  let n = 0, j = APP.indexOf('{', APP.indexOf('function(', i));
  for (; j < APP.length; j++) {
    if (APP[j] === '{') n++;
    else if (APP[j] === '}') { n--; if (!n) return APP.slice(i, APP.indexOf(');', j) + 2); }
  }
  throw new Error('llaves sin cerrar');
})();

// Se ejecuta de verdad, con un `sbFetch` que contesta lo que se le diga.
function correr({ sueltos = 0, fotos = 0, falla = null } = {}) {
  const ctx = {
    avisos: [],
    USUARIOS: [],
    sesion: { user: { id: 'coach' } },
    cerrarFicha: () => {},
    pintarAdmin: () => {},
    traducirError: (m) => m,
    preguntar: () => Promise.resolve(true),
    confirm: () => true,
    fichaUsuario: null,
  };
  const u = { id: 'u-9', n: 'Ana' };
  ctx.USUARIOS.push(u);

  let escucha = null;
  const btn = { disabled: false, textContent: 'Eliminar esta cuenta' };
  const document = {
    getElementById: () => ({
      addEventListener: (_e, fn) => { escucha = fn; },
      get disabled() { return btn.disabled; }, set disabled(v) { btn.disabled = v; },
      get textContent() { return btn.textContent; }, set textContent(v) { btn.textContent = v; },
    }),
  };
  const sbFetch = () => (falla ? Promise.reject(new Error(falla))
                               : Promise.resolve({ ok: true, fotos, sueltos }));

  const nombres = Object.keys(ctx);
  // `usrActual` es de quién está abierta la ficha, y `prompt` la
  // confirmación por nombre que exige el borrado: se teclea el nombre bien
  // para llegar hasta donde importa.
  new Function('document', 'sbFetch', 'toast', 'usrActual', 'prompt', ...nombres,
    manejador)(document, sbFetch, (id, t) => ctx.avisos.push(t), u, () => u.n,
      ...nombres.map((k) => ctx[k]));

  if (!escucha) throw new Error('el manejador no se registró');
  return { ctx, btn, disparar: escucha, u };
}

const esperar = (ms = 30) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------
console.log('\nSi quedaron fotos, se dice en el MISMO aviso');
{
  let r;
  try { r = correr({ sueltos: 12, fotos: 40 }); }
  catch (e) { r = null; console.log('         (no se pudo montar: ' + e.message + ')'); }
  if (r) {
    r.disparar({ target: {} });
    await esperar();
    const ultimo = r.ctx.avisos[r.ctx.avisos.length - 1] || '';
    ok(/12/.test(ultimo), 'el último aviso lleva el número de fotos',
       'los dos avisos usan el mismo hueco y salen seguidos: el de «fue ' +
       'eliminado» le pisa el texto al de las fotos antes de que se pinte. ' +
       'Avisos: ' + JSON.stringify(r.ctx.avisos));
    ok(/elimin/i.test(ultimo), 'y también dice que se eliminó',
       'salió: «' + ultimo + '»');
  }
}

console.log('\nY si no quedó ninguna, no se menciona');
{
  let r;
  try { r = correr({ sueltos: 0, fotos: 40 }); } catch (e) { r = null; }
  if (r) {
    r.disparar({ target: {} });
    await esperar();
    const ultimo = r.ctx.avisos[r.ctx.avisos.length - 1] || '';
    ok(/elimin/i.test(ultimo) && !/foto/i.test(ultimo),
       'solo se dice que se eliminó', 'salió: «' + ultimo + '»');
  }
}

console.log('\nY escribir mal el nombre no borra nada');
{
  // La confirmación por nombre es lo único que separa un toque de un
  // borrado irreversible. Si dejara de comprobarse, esto lo dice.
  const ctx = { avisos: [], USUARIOS: [], sesion: { user: { id: 'coach' } },
                cerrarFicha: () => {}, pintarAdmin: () => {},
                traducirError: (m) => m, fichaUsuario: null };
  const u = { id: 'u-9', n: 'Ana' };
  let escucha = null, hubo = 0;
  const doc = { getElementById: () => ({
    addEventListener: (_e, fn) => { escucha = fn; },
    set disabled(v) {}, set textContent(v) {} }) };
  const nombres = Object.keys(ctx);
  new Function('document', 'sbFetch', 'toast', 'usrActual', 'prompt', ...nombres,
    manejador)(doc, () => { hubo++; return Promise.resolve({}); },
      (id, t) => ctx.avisos.push(t), u, () => 'Beto',
      ...nombres.map((k) => ctx[k]));
  escucha({ target: {} });
  await esperar();
  ok(hubo === 0, 'no se llama a la función de borrado',
     'se llamó ' + hubo + ' veces con el nombre equivocado');
  ok(/no coincide/i.test(ctx.avisos.join(' ')), 'y se dice por qué',
     JSON.stringify(ctx.avisos));
}

// ------------------------------------------------------------------
console.log('\nY la función sigue contando las que quedaron');
{
  ok(/sueltos/.test(FN), '`sueltos` sigue viajando en la respuesta',
     'sin ese número, unas fotos que se quedaron en el bucket no las sabría ' +
     'nadie: la cuenta ya está borrada y con ella la lista de rutas');
  ok(/rutas\.length/.test(FN), 'y se cuentan todas las que había');
  // Y que las rutas se lean ANTES del borrado, que es de lo que depende todo.
  // DENTRO DEL CUERPO, no en el fichero entero: `admin_borrar_cuenta` sale
  // antes en el comentario de cabecera, así que buscándolo a secas esta
  // comprobación medía el comentario y no el código.
  const cuerpo = FN.slice(FN.indexOf('Deno.serve('));
  const iRutas = cuerpo.indexOf("from('progress_photos')");
  const iBorra = cuerpo.indexOf('admin_borrar_cuenta');
  ok(iRutas > 0 && iBorra > 0 && iRutas < iBorra,
     'las rutas se leen antes de borrar la cuenta',
     'después de la cascada no hay filas de donde sacarlas y los archivos ' +
     'quedarían en el servidor para siempre, sin que nadie sepa cuáles');
  ok(/archivadas incluidas|archivada sigue siendo/.test(FN),
     'incluidas las archivadas',
     'una foto archivada sigue siendo una foto de esa persona en un servidor');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
