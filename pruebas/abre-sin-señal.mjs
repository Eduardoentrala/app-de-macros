// Que la app ABRA sin señal.
//
// EL FALLO: en Celaya no abría.
//
// La app parecía instalable —etiquetas de Apple, pantalla completa, icono
// en el escritorio— pero por dentro no había nada: ni service worker, ni
// manifest, ni una línea que guardara nada. Cero referencias en todo el
// proyecto. Cada apertura se bajaba los 390 KB del JavaScript otra vez:
// con señal mala salía una pantalla en blanco, y sin señal no abría.
//
// Y duele donde más se usa: se apunta comida en restaurantes, en el
// gimnasio, viajando. Justo donde la señal es peor.
//
// LA TRAMPA QUE ESTA PRUEBA VIGILA
//
// Un service worker mal hecho sirve una versión vieja PARA SIEMPRE, y eso
// es peor que no tener ninguno. Aquí no puede pasar, y no por cuidado sino
// por cómo está montada la app: el JavaScript y las hojas se piden con
// `?v=SELLO` en la dirección, así que cada versión es una dirección
// distinta y servir de la caché devuelve siempre la que se pidió.
//
// Lo que sí hay que vigilar, y es lo que se comprueba abajo: que
// `version.txt` NUNCA se cachee —es la señal que dispara la
// actualización— y que las respuestas de Supabase tampoco.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SW = existsSync(join(RAIZ, 'docs', 'sw.js'))
  ? readFileSync(join(RAIZ, 'docs', 'sw.js'), 'utf8') : '';
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8');

let ok = 0, mal = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { mal++; console.log(`  FALLA ${n}${extra ? '\n        ' + extra : ''}`); }
};

console.log('\n— Existe y se registra —');
{
  check('hay service worker', SW.length > 0,
    'sin el, cada apertura se baja 390 KB y sin señal no abre');
  check('el index lo registra', /navigator\.serviceWorker\.register\('sw\.js'\)/.test(HTML));
  // Va en 'load' para no retrasar ni un milisegundo lo que se ve.
  check('sin retrasar lo que se ve',
    /window\.addEventListener\('load', function\(\)\{[\s\S]{0,200}serviceWorker\.register/.test(HTML));
  // Navegadores viejos, o servido por http sin cifrar: que no reviente.
  check('y no revienta donde no lo haya', /if\('serviceWorker' in navigator\)/.test(HTML));
}

console.log('\n— Guarda el esqueleto, y nada más —');
{
  check('guarda el index de arranque', /const MINIMO = \['\.\/', '\.\/index\.html'\]/.test(SW));
  // El JS y las hojas NO se listan: sus direcciones llevan el sello, que
  // este archivo no conoce. Se guardan solas al pedirse.
  check('el resto se guarda al pedirse', /if \(r && r\.ok\)[\s\S]{0,160}c\.put\(req, copia\)/.test(SW));
  check('y solo lo que salió bien', /r && r\.ok/.test(SW),
    'guardar un 404 lo convertiria en permanente');
}

console.log('\n— Lo que NUNCA se cachea —');
{
  // Supabase es otro dominio. Guardar la comida de alguien en la cache del
  // navegador seria enseñarle datos viejos como si fueran de ahora.
  check('nada de otro dominio', /url\.origin !== self\.location\.origin\) return;/.test(SW),
    'con esto fuera, las respuestas de Supabase se guardarian');
  // version.txt es la señal que dispara la actualizacion: cachearlo seria
  // decirle a la app que ya esta al dia para siempre.
  check('version.txt siempre a la red', /url\.pathname\.endsWith\('version\.txt'\)\) return;/.test(SW),
    'cacheado, la app no se entera nunca de que hay version nueva');
  // Y nada que no sea GET: un POST cacheado seria un desastre.
  check('solo peticiones GET', /req\.method !== 'GET'\) return;/.test(SW));
}

console.log('\n— No se puede quedar servida una versión vieja —');
{
  // El index es el unico con direccion fija. Va a la red PRIMERO, para que
  // en cuanto haya señal llegue el sello nuevo.
  //
  // Esto estaba escrito contra la forma exacta que tenia la rama -una ventana
  // de 400 caracteres y un `.catch(() => caches.match(req)` literal- y se
  // puso rojo al meterle el tiempo de espera, que es lo que faltaba para que
  // la app abra tambien cuando la red se cuelga en vez de fallar. La ventana
  // ahora es la rama entera, y lo que HACE se ejecuta en sw-espera.
  const iNav = SW.indexOf("req.mode === 'navigate'");
  const rama = SW.slice(iNav, SW.indexOf('\n    return;', iNav));
  check('el index va a la red primero', /fetch\(req\)/.test(rama),
    'de la cache primero, el sello nuevo no llegaria nunca');
  check('y la cache es solo el respaldo',
    /indexGuardado\(req\)/.test(rama) && rama.indexOf('fetch(req)') < rama.lastIndexOf('indexGuardado(req)'),
    'lo guardado se pide para respaldar la red, no en su lugar');

  // Lo demas puede ir de la cache sin riesgo PORQUE la direccion lleva el
  // sello: cada version es una direccion distinta.
  check('el resto va de la caché sin riesgo', /caches\.match\(req\)\.then\(\(guardado\)/.test(SW));
  check('y está razonado por qué se puede', /Cada\s*\n?\/\/\s*versión es una dirección DISTINTA|versión es una dirección/.test(SW));

  // El sello se sigue pidiendo y sigue mandando: el service worker no toca
  // ese mecanismo.
  check('el auto-actualizador sigue intacto',
    /fetch\('version\.txt', \{ cache: 'no-store' \}\)/.test(HTML));
  check('y sigue recargando con la versión nueva',
    /location\.replace\(location\.pathname \+ '\?v=' \+ nuevo\)/.test(HTML));
}

console.log('\n— Y la caché no crece sin fin —');
{
  // Cada despliegue añade un app.js?v=nuevo. Sin limpiar, el anterior se
  // queda para siempre ocupando sitio en el telefono.
  check('la página le manda su sello', /postMessage\(\{ tipo:'limpiar', sello: SELLO \}\)/.test(HTML));
  check('y el service worker lo escucha', /d\.tipo !== 'limpiar'/.test(SW));
  check('borrando solo lo de otras versiones', /if \(v && v !== d\.sello\) c\.delete\(req\)/.test(SW),
    'el index no lleva sello y no se toca: es lo que sostiene la app sin señal');
  // Y al activarse, fuera las caches de nombres viejos.
  check('y las cachés viejas se sueltan al activarse',
    /ns\.filter\(\(n\) => n !== CACHE\)\.map\(\(n\) => caches\.delete\(n\)\)/.test(SW));
}

console.log('\n— Lo que esto NO arregla, dicho —');
{
  // Prometer offline completo seria mentir: la comida, el peso y la IA
  // viven en Supabase.
  check('está escrito que no se puede apuntar sin red',
    /NO hace que se pueda apuntar sin red/.test(SW),
    'sin decirlo, alguien contaria con guardar comida en un avion');
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);
