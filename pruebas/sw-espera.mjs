// La app tiene que abrir tambien cuando la red NO falla: cuando se cuelga.
//
// EL FALLO. El index va a la red primero y solo cae en la caché `.catch()`,
// o sea cuando el fetch RECHAZA. Sin señal eso pasa enseguida: el navegador
// sabe que no hay red y falla al instante, sale lo guardado y la app abre.
//
// Con datos móviles flojos no rechaza: se queda esperando. Y ahí no hay
// `.catch()` que valga, porque no ha fallado nada todavía. La app se queda en
// blanco los treinta o más segundos que el navegador tarde en rendirse, que
// para quien la abre es «no abre».
//
// Es la mitad que faltaba de lo que dice la cabecera de sw.js: «con señal
// mala salía una pantalla en blanco». Sin señal quedó resuelto; con señal
// mala, que es lo más común, no.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SW = readFileSync(join(RAIZ, 'docs', 'sw.js'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

// ---- El service worker de verdad, con la plataforma de mentira ----
function montar({ red }) {
  // Los dos respaldos con contenido DISTINTO a propósito. El de
  // './index.html' se guardó el día que se instaló la app y no se vuelve a
  // tocar; el de la raíz lo refresca cada apertura con señal. Con el mismo
  // texto en los dos, la prueba no podía ver la diferencia entre buscar bien
  // y caer en el de hace meses.
  const guardado = new Map([
    ['https://x.github.io/app/', 'INDEX GUARDADO'],
    ['https://x.github.io/app/index.html', 'INDEX DEL DIA QUE SE INSTALO'],
  ]);
  const relojes = [];
  const visto = { puesto: [], esperas: [] };

  const respuesta = (cuerpo) => ({
    ok: true, status: 200, cuerpo,
    clone(){ return respuesta(cuerpo); }
  });
  const caches = {
    open: () => Promise.resolve({
      addAll: () => Promise.resolve(),
      put: (req, r) => { visto.puesto.push(req.url); guardado.set(req.url, r.cuerpo); return Promise.resolve(); },
      keys: () => Promise.resolve([]),
      delete: () => Promise.resolve(true),
    }),
    keys: () => Promise.resolve([]),
    delete: () => Promise.resolve(true),
    match: (req, op) => {
      const url = typeof req === 'string' ? new URL(req, 'https://x.github.io/app/').href : req.url;
      if (guardado.has(url)) return Promise.resolve(respuesta(guardado.get(url)));
      if (op && op.ignoreSearch) {
        const pelado = url.split('?')[0];
        if (guardado.has(pelado)) return Promise.resolve(respuesta(guardado.get(pelado)));
      }
      return Promise.resolve(undefined);
    },
  };

  const oyentes = {};
  const self = {
    location: { origin: 'https://x.github.io' },
    addEventListener: (n, f) => { oyentes[n] = f; },
    skipWaiting: () => {}, clients: { claim: () => {} },
  };
  const setTimeout_ = (fn, ms) => { visto.esperas.push(ms); relojes.push(fn); return relojes.length; };
  const clearTimeout_ = (id) => { relojes[id - 1] = null; };

  new Function('self', 'caches', 'fetch', 'setTimeout', 'clearTimeout', 'Response', 'URL', SW)(
    self, caches, red, setTimeout_, clearTimeout_, { error: () => respuesta('ERROR DE RED') }, URL);

  return {
    visto,
    // Se acabó la espera: dispara el reloj que haya puesto el sw.
    correrReloj: () => relojes.forEach((f) => f && f()),
    pedir: (url) => new Promise((listo) => {
      let contestado = false;
      oyentes.fetch({
        request: { method: 'GET', url, mode: 'navigate' },
        respondWith: (p) => { contestado = true; Promise.resolve(p).then(listo); },
        waitUntil: () => {},
      });
      if (!contestado) listo(null);
    }),
  };
}

const INDEX = 'https://x.github.io/app/';
const esperar = (ms) => new Promise((r) => globalThis.setTimeout(r, ms));

// ------------------------------------------------------------------
console.log('\nCon red buena manda la red, como hasta ahora');
{
  const sw = montar({ red: () => Promise.resolve({
    ok: true, status: 200, cuerpo: 'INDEX NUEVO', clone(){ return this; } }) });
  const r = await sw.pedir(INDEX);
  ok(r && r.cuerpo === 'INDEX NUEVO', 'sale el index del servidor, no el guardado',
     'salió: ' + (r && r.cuerpo));
  await esperar(0);
  ok(sw.visto.puesto.length === 1, 'y se guarda para la próxima');
}

// ------------------------------------------------------------------
console.log('\nSin señal sale lo guardado, que es lo que ya funcionaba');
{
  const sw = montar({ red: () => Promise.reject(new Error('Failed to fetch')) });
  const r = await sw.pedir(INDEX);
  ok(r && r.cuerpo === 'INDEX GUARDADO', 'abre con lo guardado',
     'salió: ' + (r && r.cuerpo));
}

// ------------------------------------------------------------------
console.log('\nY con la red COLGADA -datos móviles flojos- también');
{
  // Ni contesta ni falla. Es lo que hace una conexión mala, y es el caso
  // que se quedaba en blanco.
  const sw = montar({ red: () => new Promise(() => {}) });

  let contestoSolo = false;
  const espera = sw.pedir(INDEX).then((r) => { contestoSolo = true; return r; });
  await esperar(0);
  ok(!contestoSolo, 'antes de que pase el tiempo no se rinde: la red puede llegar');

  ok(sw.visto.esperas.length === 1, 'hay un tiempo de espera puesto',
     'no hay ninguno: la app se queda colgada hasta que se rinda el navegador');
  ok(sw.visto.esperas[0] > 0 && sw.visto.esperas[0] <= 4000,
     'y es corto, de segundos, no de los treinta del navegador',
     'espera ' + sw.visto.esperas[0] + ' ms');

  sw.correrReloj();
  const r = await espera;
  ok(r && r.cuerpo === 'INDEX GUARDADO',
     'pasado ese tiempo abre con lo guardado en vez de quedarse en blanco',
     'salió: ' + (r && r.cuerpo));
}

// ------------------------------------------------------------------
console.log('\nY la recarga por versión nueva encuentra el index');
{
  // Al publicar, el index se recarga con `?v=nuevo` en la dirección. Esa
  // dirección no está guardada tal cual, así que el respaldo tiene que
  // buscar sin mirar la consulta o cae en el index del día que se instaló.
  const sw = montar({ red: () => new Promise(() => {}) });
  const espera = sw.pedir(INDEX + '?v=abc123');
  await esperar(0);
  sw.correrReloj();
  const r = await espera;
  ok(r && r.cuerpo === 'INDEX GUARDADO',
     'con ?v= en la dirección también sale lo guardado',
     'salió: ' + (r && r.cuerpo));
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
