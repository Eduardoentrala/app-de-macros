// El aviso de privacidad se quedaba cacheado para siempre.
//
// `abrirLegal` lo pide así:
//
//     fetch('legal.md', { cache: 'no-cache' })
//
// y ese `no-cache` no sirve de nada, porque antes de llegar a la caché
// del navegador pasa por el service worker. Y el service worker, para
// todo lo que no es navegación, hace caché primero y sin revalidar:
//
//     caches.match(req).then((guardado) => {
//       if (guardado) return guardado;
//       ...
//
// Así que la primera vez se guarda y a partir de ahí se sirve esa
// copia. Para siempre.
//
// Y EL BARRIDO TAMPOCO LO QUITA. Al arrancar, la app le manda al worker
// un `{tipo:'limpiar', sello}` que borra lo que tenga un `?v=` distinto
// del sello de ahora. `legal.md` se pide SIN `?v=`, así que el
// `if (v && v !== d.sello)` nunca es cierto y la entrada se queda.
//
// POR QUÉ IMPORTA MÁS QUE UN TEXTO VIEJO. Al lado de ese fetch está
// `VERSION_LEGAL`, con su nota: «la versión viaja con el
// consentimiento: sin ella, "acepto" no significa nada dentro de un
// año, porque el texto habrá cambiado y no habrá forma de saber qué
// leyó esa persona». El sistema entero existe para poder decir QUÉ
// texto aceptó alguien.
//
// Con la copia pegada pasa justo lo que se quería evitar al revés: se
// cambia legal.md, se sube `VERSION_LEGAL` a 3, y quien ya había
// abierto el aviso lee la versión 2 y firma la 3. La constancia dice
// una cosa y la pantalla enseñaba otra.
//
// EL ARREGLO ES EL QUE YA USA TODO LO DEMÁS: pedirlo con `?v=` y el
// sello dentro, como `app.js` y las hojas de estilo. Así sigue
// funcionando sin conexión —la copia está— y cada despliegue la
// renueva. Y encaja con el barrido, que es quien borra las viejas.
//
// Sin sello no se deja el `v` vacío: se pone algo que NO va a coincidir
// nunca, para que el barrido se la lleve en vez de dejarla pegada otra
// vez. Equivocarse hacia «se vuelve a bajar» es gratis; hacia «se queda
// el texto viejo» no.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const SW = readFileSync(join(RAIZ, 'docs', 'sw.js'), 'utf8').replace(/\r\n/g, '\n');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

// ------------------------------------------------------------------
console.log('\nSe pide con el sello delante');
{
  const i = APP.indexOf("fetch('legal.md");
  const linea = i < 0 ? '' : APP.slice(i, APP.indexOf('\n', i));
  ok(i > 0 && /legal\.md\?v=/.test(linea),
     '`legal.md` se pide con `?v=`',
     'sin él, el service worker sirve la copia guardada para siempre y el ' +
     'barrido\n         del arranque no la toca. Dice: ' + linea.trim());
  ok(/SELLO_APP/.test(linea),
     'y el `v` lleva el sello de la versión',
     'es lo que hace que cada despliegue la renueve: ' + linea.trim());
  ok(!/\|\|\s*''\s*\)/.test(linea) && !/\|\|\s*""\s*\)/.test(linea),
     'y sin sello no se queda vacío',
     'un `v=` vacío vuelve a ser una entrada que el barrido no borra: ' +
     linea.trim());
}

// ------------------------------------------------------------------
console.log('\nY el barrido del worker se la lleva cuando cambia');
{
  // El service worker de verdad, ejecutado. Se le da un `caches` de
  // mentira y se mira qué borra al recibir el `limpiar`.
  const guardadas = [
    'https://x.test/app.js?v=VIEJO',
    'https://x.test/app.js?v=NUEVO',
    'https://x.test/estilos/pantallas.css?v=VIEJO',
    'https://x.test/legal.md?v=VIEJO',
    'https://x.test/legal.md?v=NUEVO',
    'https://x.test/legal.md',            // la de antes del arreglo
    'https://x.test/index.html',
    'https://x.test/iconos/192.png',
    'https://x.test/manifest.json',
  ];
  const borradas = [];
  const cajon = {
    keys: () => Promise.resolve(guardadas.map((u) => ({ url: u }))),
    delete: (req) => { borradas.push(req.url); return Promise.resolve(true); },
  };
  const oyentes = {};
  const self_ = {
    addEventListener: (t, f) => { (oyentes[t] = oyentes[t] || []).push(f); },
    location: { href: 'https://x.test/sw.js' },
    skipWaiting: () => {},
    clients: { claim: () => Promise.resolve() },
  };
  new Function('self', 'caches', 'fetch', 'Response', 'URL', 'setTimeout', 'clearTimeout', SW)(
    self_,
    { open: () => Promise.resolve(cajon), keys: () => Promise.resolve([]), match: () => Promise.resolve(null) },
    () => Promise.reject(new Error('sin red')),
    class { static error() { return {}; } },
    URL, setTimeout, clearTimeout,
  );

  ok((oyentes.message || []).length === 1, 'el worker escucha mensajes');
  oyentes.message[0]({ data: { tipo: 'limpiar', sello: 'NUEVO' } });
  await new Promise((r) => setTimeout(r, 30));

  ok(borradas.includes('https://x.test/legal.md?v=VIEJO'),
     'borra el aviso legal de una versión vieja',
     'borró: ' + JSON.stringify(borradas));
  ok(!borradas.includes('https://x.test/legal.md?v=NUEVO'),
     'y deja el de la versión de ahora, para que siga sirviendo sin conexión');
  ok(borradas.includes('https://x.test/app.js?v=VIEJO') &&
     !borradas.includes('https://x.test/app.js?v=NUEVO'),
     'y con `app.js` hace lo de siempre');
  ok(!borradas.includes('https://x.test/index.html'),
     'y no toca el index, que va por otro camino');
}

// ------------------------------------------------------------------
console.log('\nY lo que el worker nunca debe cachear sigue fuera');
{
  ok(/version\.txt'\)\) return;/.test(SW) || /endsWith\('version\.txt'\)\)\s*return/.test(SW),
     '`version.txt` se queda fuera de la caché',
     'es el fichero con el que la app decide si hay versión nueva: cachearlo ' +
     'sería\n         preguntarle a la copia vieja si hay algo más nuevo');

  // Y la rama que sirve sin revalidar sigue ahí: es el motivo de todo
  // esto, y si algún día cambia a «red primero» este arreglo sobra pero
  // no estorba.
  ok(/caches\.match\(req\)\.then\(\(guardado\) => \{[\s\S]{0,80}if \(guardado\) return guardado;/.test(SW),
     'y lo que no es navegación se sigue sirviendo de la caché sin revalidar',
     'si esto cambia, conviene saberlo: es lo que hacía que `no-cache` no ' +
     'sirviera de nada');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
