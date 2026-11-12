// Tecleas el peso de la última serie y bloqueas el teléfono.
//
// Cada tecla que se toca en la rutina programa un guardado a 900 ms, para
// no mandar una petición por letra. Eso está bien. Lo que faltaba era
// vaciar ese reloj ANTES de que la página se vaya.
//
// Y esto se usa en el gimnasio, de pie, entre serie y serie: escribes 60
// en el último hueco y bloqueas la pantalla. Si el navegador congela o
// mata la pestaña antes de los 900 ms, esa petición no sale nunca. Al
// volver a abrir, la pantalla se arma otra vez desde la base y los
// números que escribiste no están. Sin aviso, porque nunca hubo error:
// simplemente no se llegó a pedir nada.
//
// `guardarDia` NO encola —si falla, falla— así que la única forma de que
// no se pierda es mandarlo mientras la página sigue viva.
//
// Y hay un segundo motivo para que esto exista ahora: la recarga por
// cambio de día. Arreglar la fecha de ayer tirando las series que se
// acaban de teclear sería peor que el fallo que arregla, así que esa
// recarga vacía el pendiente antes de irse.

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

function fn(cabecera) {
  const i = APP.indexOf(cabecera);
  if (i < 0) throw new Error('no encuentro: ' + cabecera);
  let n = 0, j = APP.indexOf('(', i);
  for (; j < APP.length; j++) {
    if (APP[j] === '(') n++;
    else if (APP[j] === ')') { n--; if (!n) break; }
  }
  n = 0;
  for (let k = APP.indexOf('{', j); k < APP.length; k++) {
    if (APP[k] === '{') n++;
    else if (APP[k] === '}') { n--; if (!n) return APP.slice(i, k + 1); }
  }
  throw new Error('llaves sin cerrar: ' + cabecera);
}
function linea(exacta) {
  if (!APP.includes(exacta)) throw new Error('no encuentro la línea: ' + exacta);
  return exacta;
}

// Los cables, sacados del fichero y no escritos aquí: escribiéndolos a
// mano, quitarlos de app.js dejaba el arnés enganchándolos por su cuenta.
const CABLES = [
  "  document.addEventListener('visibilitychange', function(){\n    if(document.hidden) vaciarGuardadoPendiente();\n  });",
  "  window.addEventListener('pagehide', vaciarGuardadoPendiente);",
];
console.log('\nEl vaciado está enganchado a la app');
for (const c of CABLES) {
  ok(APP.includes(c), 'sigue puesto: ' + c.trim().split('\n')[0],
     'sin este cable la función existe y no la llama nadie');
}
if (fallan) { console.log('\n' + pasan + ' bien, ' + fallan + ' mal'); process.exit(1); }

// ------------------------------------------------------------------
// SE EJECUTA. Mirando el texto no se ve la diferencia entre vaciar el
// reloj y volver a programarlo.
function montar() {
  const guardados = [], doc = { hidden: false, _o: {},
    addEventListener(e, f) { (this._o[e] ||= []).push(f); } };
  const win = { _o: {}, addEventListener(e, f) { (this._o[e] ||= []).push(f); } };
  let relojes = 0;
  const fuente = [
    'var relojGuardado = null, tabPendiente = null;',
    'var sesion = { user: { id: 1 } };',
    fn('function programarGuardado('),
    fn('function volcarRutina('),
    fn('function vaciarGuardadoPendiente('),
    ...CABLES,
    `return {
       teclear: programarGuardado,
       hayReloj: function(){ return !!relojGuardado; },
       esconder: function(){ document.hidden = true; document._o.visibilitychange.forEach(function(f){ f(); }); },
       mostrar: function(){ document.hidden = false; document._o.visibilitychange.forEach(function(f){ f(); }); },
       cerrar: function(){ window._o.pagehide.forEach(function(f){ f(); }); }
     };`,
  ].join('\n');
  const api = new Function('document', 'window', 'activeTab', 'guardarDia',
    'clearTimeout', 'setTimeout', 'toast', 'traducirError', fuente)(
    doc, win,
    () => ({ textContent: 'Pecho' }),
    (t) => { guardados.push(t); return { catch: () => {} }; },
    () => { relojes--; },
    () => { relojes++; return 'reloj' + relojes; },
    () => {}, (m) => m);
  return { ...api, guardados };
}

// ------------------------------------------------------------------
console.log('\nTeclear programa el guardado, no lo manda');
{
  const m = montar();
  m.teclear();
  ok(m.hayReloj(), 'queda un guardado esperando');
  ok(m.guardados.length === 0, 'y todavía no se ha mandado nada',
     'los 900 ms son para no mandar una petición por tecla');
}

// ------------------------------------------------------------------
console.log('\nY esconder la app lo manda ya');
{
  const m = montar();
  m.teclear();
  m.esconder();
  ok(m.guardados.length === 1,
     'al bloquear el teléfono se manda lo pendiente',
     'sin esto, lo tecleado se queda en la pantalla y nunca llega a la base');
  ok(!m.hayReloj(), 'y no queda nada esperando');

  // Y no se manda dos veces por esconder dos veces.
  m.esconder();
  ok(m.guardados.length === 1, 'y esconder otra vez no vuelve a mandar',
     'van ' + m.guardados.length);
}

// ------------------------------------------------------------------
console.log('\nY sin nada pendiente no se manda nada');
{
  const m = montar();
  m.esconder();
  ok(m.guardados.length === 0,
     'esconder sin haber tecleado no manda una petición de nada',
     'mandar el día entero cada vez que se cambia de app es ruido ' +
     'constante contra el servidor');
  m.mostrar();
  ok(m.guardados.length === 0, 'y volver tampoco');

  // Y QUIÉN LO IMPIDE, que es lo que hay que fijar. `vaciarGuardadoPendiente`
  // llevaba además un `if(relojGuardado)` suyo, y quitarlo no cambiaba
  // nada: lo que de verdad frena es el `if(!t) return` de `volcarRutina`.
  // Dos guardias para lo mismo acaban con una diciendo que sí y la otra
  // que no, así que se quedó una. Esta.
  ok(/var t = tabPendiente; tabPendiente = null;\s*\r?\n\s*if\(!t\) return;/.test(
       fn('function volcarRutina(')),
     'y el freno está en volcarRutina, que es el único sitio',
     'sin ese `if(!t) return` se mandaría una petición vacía cada vez que ' +
     'se cambia de app');
}

// ------------------------------------------------------------------
console.log('\nY cerrar la página también lo intenta');
{
  const m = montar();
  m.teclear();
  m.cerrar();
  ok(m.guardados.length === 1,
     'al cerrar del todo se intenta mandar',
     'ahí ya es a lo que se llegue, pero intentarlo no cuesta nada y no ' +
     'intentarlo costaba las series');
}

// ------------------------------------------------------------------
console.log('\nY la recarga por cambio de día no se lo lleva por delante');
{
  const p = fn('function ponerseAlDia(');
  const iVacia = p.indexOf('vaciarGuardadoPendiente()');
  const iRecarga = p.indexOf('location.reload()');
  ok(iVacia > 0, 'la recarga vacía lo pendiente');
  ok(iVacia < iRecarga,
     'y lo hace ANTES de recargar',
     'después de recargar no se ejecuta nada: arreglar la fecha de ayer ' +
     'tirando las series recién tecleadas es peor que el fallo que arregla');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
