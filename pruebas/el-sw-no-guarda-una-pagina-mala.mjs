// Lo que la app abre sin señal es lo que el service worker guardó.
//
// Y guardaba la respuesta del index FUERA LO QUE FUERA. La otra rama del
// mismo fichero —el JavaScript y las hojas— sí mira `r.ok`, y lo tiene
// explicado con todas las letras: «guardar un 404 lo convertiría en
// permanente». En el index valía igual y más, porque el index es
// justamente lo que sostiene la app cuando no hay red.
//
// Dos formas tenía de envenenarse, y las dos son corrientes:
//
//  · UN DESPLIEGUE A MEDIAS. GitHub Pages devuelve un 404 durante unos
//    segundos al publicar. Si alguien abre la app justo ahí, ese 404 se
//    queda guardado y pasa a ser lo que ve sin señal. Para siempre, o
//    hasta que vuelva a abrirla con red.
//
//  · EL WIFI DEL HOTEL. Te devuelve SU página de «conéctese aquí» con un
//    200 limpio, así que ningún `r.ok` lo pilla. Pero redirige a su
//    dominio, y eso sí se puede mirar: si la respuesta no viene de donde
//    la pedimos, no es nuestra app.
//
// Esto no lee el fichero: lo EJECUTA. Monta un `caches`, un `fetch` y un
// `self` de mentira, dispara eventos de navegación y mira qué acabó
// guardado y qué se sirvió. Las comprobaciones de texto que ya había en
// `abre-sin-señal` no habrían visto nada de esto.

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SW = readFileSync(join(RAIZ, 'docs', 'sw.js'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

const ORIGEN = 'https://eduardo.github.io';

// Una respuesta como la que da el navegador, con lo justo que usa el sw.
function respuesta({ status = 200, url = ORIGEN + '/index.html', cuerpo = '<html>app</html>' } = {}) {
  return {
    status, ok: status >= 200 && status < 300, url, cuerpo,
    clone() { return respuesta({ status, url, cuerpo }); },
  };
}

function montar({ red, relojes = [] } = {}) {
  const guardado = new Map();          // clave: url -> respuesta
  const oyentes = {};
  const almacen = {
    put: (req, r) => { guardado.set(String(req.url || req), r); return Promise.resolve(); },
    match: (req) => Promise.resolve(guardado.get(String(req.url || req))),
    keys: () => Promise.resolve([...guardado.keys()].map((u) => ({ url: u }))),
    delete: (req) => { guardado.delete(String(req.url || req)); return Promise.resolve(true); },
    addAll: () => Promise.resolve(),
  };
  const caches = {
    open: () => Promise.resolve(almacen),
    // `ignoreSearch`: la app pide el index con `?v=sello`, y lo guardado
    // es la dirección pelada.
    match: (req, op) => {
      const u = String(req.url || req);
      if (guardado.has(u)) return Promise.resolve(guardado.get(u));
      if (op && op.ignoreSearch) {
        const sinBusca = u.split('?')[0];
        for (const [k, v] of guardado) if (k.split('?')[0] === sinBusca) return Promise.resolve(v);
      }
      return Promise.resolve(undefined);
    },
    keys: () => Promise.resolve(['macros-esqueleto']),
    delete: () => Promise.resolve(true),
  };

  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    URL, Promise, Map, Set, Object, Array, String, Number, JSON, Error,
    caches,
    fetch: (req) => red(req),
    Response: { error: () => respuesta({ status: 0, url: '' }) },
    // Los relojes se guardan en vez de correr: así se puede decidir si la
    // red llega antes o después de los 2,5 segundos.
    setTimeout: (fn, ms) => { relojes.push({ fn, ms }); return relojes.length; },
    clearTimeout: (id) => { if (relojes[id - 1]) relojes[id - 1].cancelado = true; },
  };
  ctx.self = {
    location: { origin: ORIGEN },
    addEventListener: (ev, fn) => { (oyentes[ev] ||= []).push(fn); },
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve() },
  };
  vm.createContext(ctx);
  vm.runInContext(SW, ctx, { filename: 'sw.js' });

  // Dispara un fetch y devuelve lo que el sw contestó (o null si no lo
  // interceptó, que es lo que pasa con lo de fuera y con version.txt).
  const pedir = (url, modo = 'navigate') => {
    let contestado = null, intercepto = false;
    const ev = {
      request: { url, method: 'GET', mode: modo },
      respondWith: (p) => { intercepto = true; contestado = p; },
    };
    (oyentes.fetch || []).forEach((f) => f(ev));
    return { intercepto, contestado };
  };
  return { pedir, guardado, relojes, oyentes };
}

const esperar = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0)); };

// ------------------------------------------------------------------
console.log('\nUna página buena se guarda y se sirve');
{
  const m = montar({ red: () => Promise.resolve(respuesta()) });
  const { intercepto, contestado } = m.pedir(ORIGEN + '/index.html');
  ok(intercepto, 'el sw se encarga de la navegación');
  const r = await contestado;
  await esperar();
  ok(r && r.status === 200, 'y contesta con lo que dio la red');
  ok(m.guardado.size === 1, 'y lo guarda para la próxima',
     'guardados: ' + m.guardado.size);
}

// ------------------------------------------------------------------
console.log('\nY una página MALA se sirve pero NO se guarda');
{
  for (const estado of [404, 500, 503]) {
    const m = montar({ red: () => Promise.resolve(respuesta({ status: estado })) });
    const r = await m.pedir(ORIGEN + '/index.html').contestado;
    await esperar();
    ok(r && r.status === estado, 'el ' + estado + ' se devuelve tal cual',
       'esconder el error del servidor no ayuda a nadie');
    ok(m.guardado.size === 0,
       'y NO se queda guardado el ' + estado,
       'guardarlo lo convierte en lo que la app abre sin señal, que es ' +
       'justo lo que este fichero existe para evitar');
  }
}

// ------------------------------------------------------------------
console.log('\nY la página del wifi del hotel tampoco');
{
  // 200 limpio, pero viene de otro dominio porque te redirigió.
  const m = montar({
    red: () => Promise.resolve(respuesta({
      status: 200, url: 'https://wifi-hotel.example/acceso', cuerpo: '<html>Conéctese</html>',
    })),
  });
  const r = await m.pedir(ORIGEN + '/index.html').contestado;
  await esperar();
  ok(r && r.status === 200, 'se devuelve, que es lo que el navegador haría');
  ok(m.guardado.size === 0,
     'pero no se guarda: no viene de donde la pedimos',
     'ningún `r.ok` pilla esto —el portal contesta 200— y sin mirarlo la ' +
     'app acaba enseñando «conéctese aquí» como si fuera ella');
}

// ------------------------------------------------------------------
console.log('\nY sin red se abre con lo guardado');
{
  const m = montar({ red: () => Promise.resolve(respuesta()) });
  await m.pedir(ORIGEN + '/index.html').contestado;   // primero se guarda
  await esperar();
  ok(m.guardado.size === 1, 'hay algo guardado de antes');

  const sinRed = { ...m, ...montar({ red: () => Promise.reject(new TypeError('Failed to fetch')) }) };
  // Se vuelve a montar pero con lo guardado puesto a mano.
  const m2 = montar({ red: () => Promise.reject(new TypeError('Failed to fetch')) });
  m2.guardado.set(ORIGEN + '/index.html', respuesta({ cuerpo: '<html>la de ayer</html>' }));
  const r = await m2.pedir(ORIGEN + '/index.html?v=abc').contestado;
  await esperar();
  ok(r && r.cuerpo === '<html>la de ayer</html>',
     'y con `?v=` nuevo también lo encuentra',
     'el index se recarga con el sello nuevo en la dirección; sin ' +
     '`ignoreSearch` el respaldo no aparecería');
  ok(sinRed !== null, 'y nada revienta por el camino');
}

// ------------------------------------------------------------------
console.log('\nY si la red tarda, se abre igual');
{
  const relojes = [];
  let soltar;
  const m = montar({ red: () => new Promise((res) => { soltar = res; }), relojes });
  m.guardado.set(ORIGEN + '/index.html', respuesta({ cuerpo: '<html>la de ayer</html>' }));
  const p = m.pedir(ORIGEN + '/index.html').contestado;

  const reloj = relojes.find((x) => x.ms === 2500);
  ok(!!reloj, 'hay un reloj de 2,5 segundos', 'relojes: ' + JSON.stringify(relojes.map((x) => x.ms)));
  reloj.fn();                       // se agota la espera
  const r = await p;
  ok(r && r.cuerpo === '<html>la de ayer</html>',
     'se abre con lo guardado sin esperar a la red',
     'con datos flojos la red ni contesta ni falla, y la app se quedaba ' +
     'en blanco los treinta segundos que el navegador tarde en rendirse');

  // Y la que iba en camino sigue: deja el index nuevo para la próxima.
  soltar(respuesta({ cuerpo: '<html>la nueva</html>' }));
  await esperar();
  ok(m.guardado.get(ORIGEN + '/index.html').cuerpo === '<html>la nueva</html>',
     'y lo que llegó tarde se guarda para la próxima vez');
}

// ------------------------------------------------------------------
console.log('\nY lo que no se debe tocar, no se toca');
{
  const m = montar({ red: () => Promise.resolve(respuesta()) });
  ok(!m.pedir(ORIGEN + '/version.txt', 'cors').intercepto,
     '`version.txt` va siempre a la red',
     'es la señal que dispara la actualización: servirla de la caché ' +
     'diría «ya estás al día» para siempre');
  ok(!m.pedir(ORIGEN + '/iconos/180.png', 'cors').intercepto,
     'los iconos también');
  ok(!m.pedir(ORIGEN + '/manifest.json', 'cors').intercepto, 'y el manifest');
  ok(!m.pedir('https://abc.supabase.co/rest/v1/diary_entries', 'cors').intercepto,
     'y Supabase ni se mira',
     'guardar la comida de alguien en la caché del navegador sería ' +
     'enseñarle datos viejos como si fueran de ahora');
}

// ------------------------------------------------------------------
console.log('\nY el JavaScript con sello sale de la caché');
{
  const m = montar({ red: () => Promise.resolve(respuesta({ url: ORIGEN + '/app.js?v=abc', cuerpo: 'nuevo' })) });
  const r1 = await m.pedir(ORIGEN + '/app.js?v=abc', 'no-cors').contestado;
  await esperar();
  ok(r1 && r1.cuerpo === 'nuevo', 'la primera vez se baja');
  ok(m.guardado.size === 1, 'y se guarda');

  // Y un 404 de un fichero con sello tampoco se guarda.
  const m2 = montar({ red: () => Promise.resolve(respuesta({ status: 404, url: ORIGEN + '/app.js?v=xyz' })) });
  await m2.pedir(ORIGEN + '/app.js?v=xyz', 'no-cors').contestado;
  await esperar();
  ok(m2.guardado.size === 0, 'y un 404 con sello tampoco se queda');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
