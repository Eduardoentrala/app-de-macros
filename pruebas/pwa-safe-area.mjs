// Que la app respete la isla dinámica y no se vaya desfasando.
//
// Dos fallos distintos que se veían igual de mal:
//
//   1. El contenido quedaba DEBAJO de la barra de estado. Con
//      `apple-mobile-web-app-capable` la app es de pantalla completa y el
//      reloj se dibuja encima, asi que hay que dejarle sitio a mano.
//
//   2. La interfaz se iba desfasando con el uso. En iOS, enfocar un campo
//      desplaza la VENTANA para hacer sitio al teclado; con
//      `body{overflow:hidden}` no hay barra que devolver a su sitio, asi
//      que ese desplazamiento se quedaba. Cada campo que tocabas subia la
//      app un poco mas. Recargar la arreglaba y volvia a pasar.
//
// Ninguno de los dos da error en consola. Solo se ven.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(RAIZ, 'docs');
const HTML = readFileSync(join(DOCS, 'index.html'), 'utf8');
const APP  = readFileSync(join(DOCS, 'app.js'), 'utf8');
const CSS = Object.fromEntries(readdirSync(join(DOCS, 'estilos'))
  .filter(f => f.endsWith('.css'))
  .map(f => [f, readFileSync(join(DOCS, 'estilos', f), 'utf8')]));
const TODO_CSS = Object.values(CSS).join('\n');

let ok = 0, mal = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { mal++; console.log(`  FALLA ${n}${extra ? '\n        ' + extra : ''}`); }
};

console.log('\n— El teléfono nos deja llegar a los bordes —');
{
  check('viewport-fit=cover está puesto', /viewport-fit=cover/.test(HTML),
    'sin esto, env(safe-area-inset-*) vale 0 y no hay nada que respetar');
  check('y la app es de pantalla completa',
    /apple-mobile-web-app-capable"?\s+content="yes"/.test(HTML));
}

console.log('\n— Los huecos, en un solo sitio —');
{
  check('las cuatro variables existen',
    ['--sat', '--sab', '--sal', '--sar'].every(v =>
      new RegExp(`${v}: env\\(safe-area-inset-`).test(CSS['base.css'])));
  // Con valor por defecto: sin el 0px, un navegador que no conozca env()
  // deja la propiedad invalida y el calc() entero se cae.
  check('con 0px por defecto', /env\(safe-area-inset-top, 0px\)/.test(CSS['base.css']));

  // Fuera de la definición nadie debería volver a escribir env() a mano:
  // así no hay dos formas de lo mismo ni sitios donde falte el respaldo.
  const crudos = Object.entries(CSS)
    .filter(([f]) => f !== 'base.css')
    .filter(([, c]) => /env\(safe-area-inset/.test(c))
    .map(([f]) => f);
  check('nadie más usa env() suelto', crudos.length === 0, crudos.join(', '));
}

console.log('\n— Arriba: la isla dinámica —');
{
  const app = CSS['modo-app.css'];
  check('la carcasa deja sitio arriba', /padding-top:var\(--sat\)/.test(app));
  check('y a los lados, para el horizontal',
    /padding-left:var\(--sal\)/.test(app) && /padding-right:var\(--sar\)/.test(app));
  // Abajo NO se pone ahi: las barras de dentro ya lo llevan, y ponerlo en
  // los dos sitios lo contaria dos veces.
  check('abajo NO se duplica', !/\.phone-screen\{[^}]*padding-bottom:var\(--sab\)/.test(app),
    'la barra de pestañas ya reserva ese hueco');
}

console.log('\n— Abajo: la barra de gestos —');
{
  check('las pestañas la respetan', /padding-bottom:calc\(6px \+ var\(--sab\)\)/.test(CSS['diario.css']));
  check('y las barras de acción también',
    /padding-bottom:calc\(14px \+ max\(8px, var\(--sab\)\)\)/.test(CSS['pantallas.css']));
}

console.log('\n— Ni un 100vh —');
{
  // En iPhone `100vh` cuenta la pantalla ENTERA, incluida la parte que
  // tapan las barras: la pagina queda mas alta de lo que se ve.
  const conVh = Object.entries(CSS)
    .filter(([, c]) => /height:\s*100vh/.test(c))
    .map(([f]) => f);
  check('ninguna hoja usa 100vh', conVh.length === 0, conVh.join(', '));
  check('el cuerpo usa dvh', /min-height:100dvh/.test(CSS['base.css']));
}

console.log('\n— La ventana no se puede desplazar —');
{
  const app = CSS['modo-app.css'];
  // Esta es la mitad importante del arreglo del desfase: si la ventana no
  // se puede mover, el teclado no puede dejarla movida.
  check('el cuerpo va fijo', /html, body\{[^}]*position:fixed/.test(app),
    'sin esto, el teclado desplaza la ventana y se queda asi');
  check('y la carcasa también', /\.phone\{[^}]*position:fixed/.test(app));
  check('sigue sin desplazarse la página', /overflow:hidden/.test(app));
}

console.log('\n— Y si aun así se mueve, vuelve —');
{
  check('hay quien la endereza', /function enderezarVentana\(/.test(APP));
  check('al soltar un campo', /'focusout'/.test(APP),
    'es cuando iOS deja la ventana desplazada');
  check('al volver a la app', /visibilitychange[\s\S]{0,120}enderezarVentana/.test(APP));
  check('y al girar el teléfono', /'orientationchange'/.test(APP));
}

console.log('\n— El desplazamiento no se hereda de otra pantalla —');
{
  check('entrar a una pantalla empieza arriba', /if\(push\) arribaDelTodo\(id\)/.test(APP));
  check('y se aplica a sus zonas desplazables',
    /querySelectorAll\('\.scroll'\)[\s\S]{0,60}scrollTop = 0/.test(APP));
  // Al VOLVER no se toca: donde estabas es justo lo que esperas encontrar.
  const f = APP.slice(APP.indexOf('function back()'), APP.indexOf('function back()') + 300);
  check('pero volver conserva dónde estabas', !/arribaDelTodo/.test(f));
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);
