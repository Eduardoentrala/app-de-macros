// Lo que esta página PUEDE hacer, escrito donde manda.
//
// La app es autocontenida: no carga ni un script, ni una hoja, ni una fuente
// de fuera, y solo habla con un servidor. Cuando eso es así, declararlo cuesta
// cinco líneas y quita de golpe lo que una inyección necesitaría para servir
// de algo: mandar lo apuntado a otro sitio, o traerse código de fuera.
//
// Se pinta bastante HTML con datos de personas —nombres, alimentos, notas—.
// Se escapan, y hay pruebas que lo vigilan, pero eso es cuidado, y el cuidado
// se salta un día. Esto es lo que queda debajo cuando se salta.
//
// LA PAREJA QUE MÁS IMPORTA. `connect-src` tiene que nombrar el MISMO
// servidor de Supabase que usa `app.js`. Si alguien cambia de proyecto y toca
// solo uno de los dos, la app no falla un poco: deja de cargar datos ENTERA,
// y el navegador lo dice en una consola que en un teléfono nadie abre.
//
// Se comprobó en el navegador antes de fijarlo: las 26 pantallas se pintan
// sin una sola violación, el service worker se registra, las imágenes de
// `data:` y `blob:` cargan, Supabase contesta, y example.com queda bloqueado
// tanto para conectarse como para cargar un script.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

const meta = (HTML.match(
  /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1];

console.log('\nEstá y se puede leer');
{
  ok(!!meta, 'la página declara su política',
     'sin esto, una inyección puede mandar lo apuntado a donde quiera');
}

// Cada directiva, en un mapa, para poder mirarlas de una en una.
const dir = {};
for (const trozo of String(meta || '').split(';')) {
  const p = trozo.trim().split(/\s+/);
  if (p[0]) dir[p[0]] = p.slice(1);
}

console.log('\nLa pareja: el servidor de la CSP y el de la app');
{
  const suyo = (APP.match(/var SB_URL = '([^']+)'/) || [])[1];
  ok(!!suyo, 'app.js dice a qué Supabase habla');
  ok((dir['connect-src'] || []).includes(suyo),
     `y connect-src lo deja: ${suyo}`,
     'no coinciden: la app deja de cargar datos ENTERA, y solo se ve en una ' +
     'consola que en un teléfono nadie abre. connect-src dice: ' +
     JSON.stringify(dir['connect-src']));
  ok((dir['connect-src'] || []).includes("'self'"),
     "y también 'self', que es de donde salen version.txt y las hojas");
}

console.log('\nLo que la app necesita de verdad');
{
  // Las fotos: recién comprimida se pinta como base64, y al encuadrarla se
  // usa createObjectURL. Sin esto la pantalla de fotos se queda en negro.
  ok((dir['img-src'] || []).includes('data:'), 'las imágenes en base64 cargan');
  ok((dir['img-src'] || []).includes('blob:'), 'y las de createObjectURL');
  ok((dir['img-src'] || []).some((x) => x.includes('supabase')),
     'y las de progreso, que llegan firmadas desde Supabase');
  // Tres scripts viven dentro del index.
  ok((dir['script-src'] || []).includes("'unsafe-inline'"),
     'los scripts que están dentro del index siguen corriendo');
  ok((dir['style-src'] || []).includes("'unsafe-inline'"),
     'y los 72 style= del HTML siguen aplicándose');
}

console.log('\nY lo que no hace falta, cerrado');
{
  ok(!(dir['script-src'] || []).includes("'unsafe-eval'"),
     "sin 'unsafe-eval': la app no usa eval ni new Function",
     'concederlo devuelve el camino más corto para ejecutar lo inyectado');
  ok((dir['object-src'] || []).includes("'none'"), 'nada de <object> ni plugins');
  ok((dir['base-uri'] || []).includes("'self'"),
     'no se puede reescribir a dónde apuntan las rutas relativas');
  ok((dir['form-action'] || []).includes("'none'"),
     'y no hay formularios: nada puede enviarse a ningún sitio');
  ok(!!dir['default-src'], 'hay un default-src que cubre lo que no se nombró');

  // Un comodín en connect-src o script-src deja la puerta como estaba.
  for (const d of ['connect-src', 'script-src', 'default-src']) {
    ok(!(dir[d] || []).some((x) => x === '*' || x === 'https:'),
       `${d} no lleva comodín`,
       'un * ahí deja la política de adorno');
  }
}

console.log('\nY las direcciones no se le cuentan a nadie');
{
  ok(/<meta name="referrer" content="same-origin">/.test(HTML),
     'el referrer se queda en casa');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
