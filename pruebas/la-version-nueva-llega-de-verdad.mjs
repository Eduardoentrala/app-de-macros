// La app se quedaba vieja y no había forma de saberlo.
//
// Pasó así, y se vio porque los números no cuadraban entre sí:
//
//   · Se añadieron las bebidas al catálogo y se desplegó la app.
//   · Él buscó «Tequila (caballito)» y la tarjeta dijo 101 kcal — el
//     nombre y las calorías vienen del SERVIDOR, así que eso estaba al
//     día.
//   · Tocó la tarjeta y la hoja de la cantidad dijo «0 cal», que es lo
//     que decía el `app.js` de antes del arreglo.
//
// Datos nuevos y programa viejo, a la vez, sin un solo aviso.
//
// POR QUÉ. El index va a red primero pero con un reloj de 2,5 segundos:
// con mala señal gana la copia guardada. La página arranca con el sello
// viejo, pide `version.txt` —que siempre va a la red—, ve que hay uno
// nuevo y se recarga... y el service worker le vuelve a servir el index
// guardado, porque el reloj vuelve a ganar.
//
// Y ahí estaba la segunda mitad, que es la que lo volvía permanente: al
// recargar se apuntaba en `sessionStorage` el sello DE LA PÁGINA QUE
// CORRE, no el nuevo. Como la página seguía siendo la vieja, lo apuntado
// y el sello coincidían, y la comprobación se saltaba el resto de la
// sesión. Nunca volvía a mirar.
//
// Ahora: la página le pide al service worker que se traiga el index
// nuevo ANTES de recargar —y eso va a red sin reloj— y apunta el sello
// NUEVO, para que un intento fallido no desarme los siguientes.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SW = readFileSync(join(RAIZ, 'docs', 'sw.js'), 'utf8').replace(/\r\n/g, '\n');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8').replace(/\r\n/g, '\n');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

// ------------------------------------------------------------------
// EL SERVICE WORKER, EJECUTADO. Mirando el texto no se distingue un
// `cache.put` que corre de uno que está detrás de un `if` imposible.
console.log('\nEl service worker sabe traerse el index nuevo');
{
  const guardado = new Map();
  const escuchas = {};
  const respuestas = [];

  const cache = {
    put: (k, v) => { guardado.set(String(k), v); return Promise.resolve(); },
    keys: () => Promise.resolve([]),
    delete: () => Promise.resolve(true)
  };
  const self_ = {
    addEventListener: (t, f) => { (escuchas[t] = escuchas[t] || []).push(f); },
    location: { origin: 'https://ejemplo.test', href: 'https://ejemplo.test/app/' },
    skipWaiting: () => {}, clients: { claim: () => {} }
  };

  // La red tarda: justamente el caso en que el reloj del index ganaba.
  let pedidas = [];
  const fetch_ = (ruta, opc) => {
    pedidas.push({ ruta: String(ruta), opc: opc || {} });
    return new Promise((res) => setTimeout(() => res({
      ok: true, url: 'https://ejemplo.test/app/index.html',
      clone: () => 'EL INDEX NUEVO'
    }), 40));
  };

  new Function('self', 'caches', 'fetch', 'URL', 'Response', 'setTimeout',
               'clearTimeout', 'Promise',
    SW)(self_,
       { open: () => Promise.resolve(cache), match: () => Promise.resolve(null) },
       fetch_, URL, { error: () => ({}) }, setTimeout, clearTimeout, Promise);

  ok((escuchas.message || []).length === 1, 'el service worker escucha mensajes');

  const mandar = (data) => (escuchas.message || []).forEach((f) => f({
    data,
    source: { postMessage: (m) => respuestas.push(m) }
  }));

  mandar({ tipo: 'refrescar-index' });

  await new Promise((listo) => setTimeout(() => {
    const pidio = pedidas.find((x) => x.ruta.includes('index.html'));
    ok(!!pidio, 'al pedírselo, va a buscar el index',
       'pidió: ' + JSON.stringify(pedidas.map((x) => x.ruta)));
    ok(pidio && pidio.opc.cache === 'reload',
       'y saltándose su propia caché',
       'sin `cache: reload` se puede traer el mismo viejo que ya tenía');
    ok(guardado.has('./index.html'),
       'y lo guarda en el sitio del que se sirve sin señal',
       'guardó: ' + JSON.stringify([...guardado.keys()]));
    ok(respuestas.some((r) => r.tipo === 'index-refrescado' && r.ok === true),
       'y avisa a la página de que ya está',
       'respondió: ' + JSON.stringify(respuestas));

    // SIN RELOJ, que es la diferencia con la rama de navegar. Esto se
    // pide cuando ya se sabe que hay versión nueva: lo que importa es
    // traerla entera, no contestar rápido.
    const cuerpo = SW.slice(SW.indexOf("d.tipo === 'refrescar-index'"),
                            SW.indexOf("if (d.tipo !== 'limpiar'"));
    ok(!/ESPERA_RED|setTimeout/.test(cuerpo),
       'y no se rinde a los 2,5 segundos como la otra rama',
       'con reloj, con mala señal volvería a ganar la copia vieja — que es ' +
       'el fallo entero');

    // Y AL ACTIVARSE, SOLO. Es la mitad que de verdad cierra el círculo:
    // lo de arriba lo pide la página, y no sirve cuando la página que
    // corre ES la vieja — el arreglo vive en el index y en el propio
    // service worker, justo los dos que están guardados.
    //
    // Este archivo sí se actualiza por su cuenta, así que es el único
    // sitio desde el que se puede romper. Si el service worker nuevo no
    // se trajera el index al arrancar, haría falta que alguien borrara
    // los datos del sitio a mano, y eso no se le pide a nadie.
    //
    // HASTA LA DEFINICIÓN, NO HASTA EL `fetch`. El primer intento cortaba
    // en `addEventListener('fetch'` y dentro de ese trozo cae también la
    // DECLARACIÓN de `refrescarIndex`, así que quitar la llamada dejaba
    // esto en verde: encontraba la función, no el uso. Lo cazó la
    // mutación.
    const act = SW.slice(SW.indexOf("addEventListener('activate'"),
                         SW.indexOf('function refrescarIndex'));
    ok(/refrescarIndex\(\)/.test(act.replace(/^\s*\/\/.*$/gm, '')),
       'y al activarse se trae el index nuevo sin que nadie se lo pida',
       'sin esto, una app ya cacheada se queda vieja para siempre: el ' +
       'arreglo está en los dos archivos que ella tiene guardados');

    // Y NO BORRA EL VIEJO ANTES DE TENER EL NUEVO. Si lo borrara y la red
    // fallara, la app se quedaría sin nada que abrir sin señal — que es
    // justo lo que el service worker existe para evitar.
    ok(!/delete\(['"]?\.\/index\.html/.test(SW),
       'y no borra el index guardado en ningún momento',
       'borrarlo y que falle la red deja la app sin nada que abrir');

    seguir();
    listo();
  }, 160));
}

function seguir() {
  // ----------------------------------------------------------------
  console.log('\nY la página lo pide antes de recargar');
  {
    const i = HTML.indexOf("sessionStorage.getItem('macros.recargado')");
    const j = HTML.indexOf('</script>', i);
    const trozo = HTML.slice(i, j).replace(/^\s*\/\/.*$/gm, '');

    ok(/postMessage\(\{\s*tipo:\s*'refrescar-index'\s*\}\)/.test(trozo),
       'le pide al service worker que se traiga el index',
       'sin esto la recarga se la vuelve a servir la caché y no cambia nada');
    ok(/location\.replace/.test(trozo), 'y luego recarga');

    // Y RECARGA PASE LO QUE PASE. Una actualización que deja la app
    // colgada esperando es peor que una que llega a la próxima apertura.
    ok(/setTimeout\(irseUnaVez,\s*\d+\)/.test(trozo),
       'y no se queda esperando para siempre si el service worker calla');
    ok(/if\(!yaFui\)/.test(trozo),
       'y no recarga dos veces si contesta justo al cumplirse el plazo',
       'el aviso y el reloj pueden llegar los dos: la segunda recarga ' +
       'pisaría la primera a medias');

    // LO QUE SE APUNTA ES EL SELLO NUEVO. Esta es la media trampa que
    // volvía el fallo permanente.
    ok(/sessionStorage\.setItem\('macros\.recargado',\s*nuevo\)/.test(trozo),
       'y apunta el sello NUEVO, no el que ya estaba corriendo',
       'apuntando el viejo, un intento fallido deja la comprobación ' +
       'desarmada el resto de la sesión: la app se queda vieja y no ' +
       'vuelve a mirar');
    ok(!/sessionStorage\.setItem\('macros\.recargado',\s*SELLO\)/.test(trozo),
       'y el viejo ya no se apunta en ninguna parte');
  }

  console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
  process.exit(fallan ? 1 : 0);
}
