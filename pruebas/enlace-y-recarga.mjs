// La recarga por versión nueva contra el enlace del correo.
//
// Son dos trozos de código que corren en la misma carga de la página y que
// no se conocen:
//
//   A) El arranque de app.js, que lee la sesión de la almohadilla, la limpia
//      de la dirección y enseña «elige una contraseña nueva».
//   B) El comprobador de versión del index, que si hay una publicación más
//      nueva hace `location.replace` para recargar con ella.
//
// Y CUÁL DE LOS DOS VA PRIMERO NO ESTÁ DECIDIDO. `app.js` viene de la caché
// del service worker —instantáneo— y `version.txt` va SIEMPRE a la red. En un
// servidor local gana el segundo; en un teléfono con datos, el primero. O
// sea que el resultado depende de la latencia, que es la peor clase de fallo:
// funciona en las pruebas y falla en el teléfono de quien lo necesita.
//
// LO QUE PASA EN CADA ORDEN, Y POR QUÉ HACEN FALTA DOS ARREGLOS:
//
//   B → A: la almohadilla sigue en la dirección, así que la recarga tiene que
//          llevársela con ella. Si no, se recarga sin el token y el enlace
//          -de un solo uso- queda gastado para nada.
//
//   A → B: la almohadilla YA está limpia, así que llevársela no sirve de
//          nada: no hay nada que llevar. Y la recarga cae encima de la
//          persona mientras está tecleando su contraseña nueva, se la borra
//          y la deja en la pantalla de entrar con el enlace gastado.
//
// El primer arreglo -llevarse la almohadilla- solo cubre el primer orden. Se
// desplegó así, y en el segundo orden -el del teléfono- el fallo seguía
// entero.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
// Con los finales de línea normalizados: en Windows el fichero de trabajo
// tiene CRLF y los recortes que hace esta prueba buscan patrones con `\n`
// dentro. Con `\r\n` no casan, el recorte sale descuadrado y lo que se
// intenta ejecutar revienta con un «Illegal return statement» que no tiene
// nada que ver con lo que se está probando. Se midió: con LF verde, con
// CRLF rota.
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8').replace(/\r\n/g, '\n');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

// ---- Los dos trozos de verdad ----
const BLOQUE_VERSION = (() => {
  const i = HTML.indexOf('    try{\n      if(sessionStorage.getItem(\'macros.recargado\') !== SELLO){');
  if (i < 0) throw new Error('no encuentro el comprobador de versión');
  return HTML.slice(i, HTML.indexOf('    }catch(e){}', i) + 15);
})();

const LEER = (() => {
  const i = APP.indexOf('  function loQueTraeElEnlace(){');
  return APP.slice(i, APP.indexOf('\n  }', APP.indexOf('  function limpiarElEnlace(){')) + 4);
})();

// Un navegador de mentira con una dirección que se puede tocar.
function navegador(hash) {
  const estado = {
    hash, search: '', pathname: '/app-de-macros/',
    recargas: [], almacen: {},
  };
  const location = {
    get hash() { return estado.hash; },
    set hash(v) { estado.hash = v; },
    get search() { return estado.search; },
    get pathname() { return estado.pathname; },
    replace(u) { estado.recargas.push(u); },
  };
  const history = {
    replaceState(_a, _b, u) {
      estado.hash = '';
      const [p, s] = String(u).split('?');
      estado.pathname = p;
      estado.search = s ? '?' + s : '';
    },
  };
  const sessionStorage = {
    getItem: (k) => (k in estado.almacen ? estado.almacen[k] : null),
    setItem: (k, v) => { estado.almacen[k] = String(v); },
  };
  return { estado, location, history, sessionStorage };
}

// (A) El arranque de app.js: lee la almohadilla y la limpia.
//
// Las dos líneas del arranque se SACAN del archivo, no se copian aquí. Copiar
// «lo que hace el arranque» es escribir una segunda versión que se queda
// vieja: el arreglo de este mismo fallo añade una línea ahí, y una copia la
// habría dejado fuera dando verde con la app rota.
const ARRANQUE = (() => {
  const i = APP.indexOf('  var delCorreo = loQueTraeElEnlace();');
  if (i < 0) throw new Error('no encuentro el arranque');
  return APP.slice(i, APP.indexOf('\n\n', i));
})();

function correrArranque(n) {
  const caja = new Function('location', 'history', 'window', `
    ${LEER}
    ${ARRANQUE}
    return delCorreo;`);
  return caja(n.location, n.history, n.ventana);
}

// (B) El comprobador de versión, con una publicación más nueva esperando.
function correrVersion(n, selloNuevo = 'SELLOnuevo') {
  const caja = new Function('sessionStorage', 'fetch', 'location', 'SELLO', 'window',
    BLOQUE_VERSION + '\n; return null;');
  caja(n.sessionStorage,
       () => Promise.resolve({ ok: true, text: () => Promise.resolve(selloNuevo) }),
       n.location, 'SELLOviejo', n.ventana);
  // El comprobador es asíncrono: se espera a que se resuelvan sus promesas.
  return new Promise((r) => setImmediate(() => setImmediate(r)));
}

const HASH = '#access_token=abc.def&refresh_token=r1&type=recovery';

// ------------------------------------------------------------------
console.log('\nOrden B → A: la versión gana la carrera');
{
  const n = navegador(HASH);
  n.ventana = {};
  await correrVersion(n);

  ok(n.estado.recargas.length === 1, 'se recarga con la versión nueva');
  const u = n.estado.recargas[0] || '';
  ok(u.indexOf('access_token=abc.def') >= 0,
     'y la recarga se lleva la almohadilla con ella',
     'recargó a «' + u + '»: sin el token, el enlace queda gastado para nada');

  // Y tras esa recarga, el arranque encuentra su enlace.
  const n2 = navegador('#' + u.split('#')[1]);
  n2.ventana = {};
  const traido = correrArranque(n2);
  ok(traido && traido.type === 'recovery',
     'así que al recargar, el arranque sí lo encuentra');
}

// ------------------------------------------------------------------
console.log('\nOrden A → B: el arranque gana, que es lo que pasa en un teléfono');
{
  const n = navegador(HASH);
  n.ventana = {};

  const traido = correrArranque(n);
  ok(traido && traido.access_token === 'abc.def', 'el arranque coge el token');
  ok(n.estado.hash === '', 'y limpia la dirección, que es lo que debe hacer');

  // Y AHORA llega el comprobador de versión.
  await correrVersion(n);

  ok(n.estado.recargas.length === 0,
     'NO se recarga: la persona está poniendo su contraseña nueva',
     'recargó a «' + (n.estado.recargas[0] || '') + '»: le borra lo tecleado, ' +
     'la deja en la pantalla de entrar y el enlace ya está gastado');

  // Y no se da por actualizada. El freno APLAZA la actualización a la próxima
  // apertura; si además se apuntara «ya recargué», ese teléfono se quedaría
  // con la versión vieja hasta que se cerrara la pestaña.
  ok(n.estado.almacen['macros.recargado'] === undefined,
     'y tampoco se apunta como ya recargada: solo se aplaza',
     'quedó apuntada: la actualización no se aplaza, se cancela');
}

// ------------------------------------------------------------------
console.log('\nY sin enlace de por medio, la actualización sigue igual');
{
  const n = navegador('');
  n.ventana = {};
  correrArranque(n);
  await correrVersion(n);
  ok(n.estado.recargas.length === 1,
     'una apertura normal con versión nueva sí se recarga',
     'frenar SIEMPRE la actualización dejaría la app vieja para siempre');
  ok((n.estado.recargas[0] || '').indexOf('?v=SELLOnuevo') >= 0, 'con el sello nuevo');
}

// ------------------------------------------------------------------
console.log('\nY el freno solo dura esta carga');
{
  // Si el freno se guardara, la app no volvería a actualizarse nunca en ese
  // teléfono. Tiene que ser una marca de la página, no algo que persista.
  ok(!/localStorage[^\n]{0,60}(enlace|correo)/i.test(APP),
     'el freno no se guarda en el teléfono');
  ok(!/sessionStorage[^\n]{0,60}(enlace|correo)/i.test(APP),
     'ni siquiera para la sesión');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
