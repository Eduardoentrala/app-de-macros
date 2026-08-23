// El cronómetro de descanso no puede taparle el «Guardar sesión».
//
// LO QUE PASABA. Flotaba en `position:absolute` con `bottom:96px`, y esos
// 96 eran una estimación de lo que mide la barra de abajo. No mide eso:
//
//     14 (padding arriba)
//   + 45 (el botón «Guardar sesión»)
//   +  8 (el hueco)
//   + 21 (el «Borrar última sesión»)
//   + 14 (padding abajo)
//   + 34 (la franja de gestos del iPhone, que entra por --sab)
//   ────
//    136
//
// Cuarenta píxeles más de lo que suponía el número. Así que el cronómetro
// se montaba encima de la barra y tapaba media palabra del botón.
//
// Y NO ES UN NÚMERO QUE SE PUEDA ACERTAR: la altura depende de la franja de
// gestos —que cambia según el teléfono— y de si el texto del botón se parte
// en dos líneas. Cualquier `bottom:` fijo vuelve a fallar en algún aparato.
//
// La solución es que no haya número: `.app-view` es una columna flex con el
// scroll en `flex:1`, así que un `flex:none` deja el cronómetro justo
// encima de la barra, mida lo que mida.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const HTML = readFileSync(join(AQUI, '..', 'docs', 'index.html'), 'utf8');
const CSS = readFileSync(join(AQUI, '..', 'docs', 'estilos', 'pantallas.css'), 'utf8');
const VISTAS = readFileSync(join(AQUI, '..', 'docs', 'estilos', 'vistas.css'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q) => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q); }
};

// La regla de `.rest-bar`, de su llave a su cierre.
const i = CSS.indexOf('.rest-bar{');
const REGLA = i < 0 ? '' : CSS.slice(i, CSS.indexOf('}', i) + 1);

// ------------------------------------------------------------------
console.log('\nYa no flota con un número a ojo');
{
  ok(!!REGLA, 'la regla existe');
  ok(!/position:\s*absolute/.test(REGLA),
     'no va en position:absolute');
  ok(!/bottom:\s*\d/.test(REGLA),
     'y NO tiene un «bottom» fijo: la barra de abajo mide 137 en un iPhone ' +
     'con franja de gestos, y cualquier número acertado hoy falla mañana');
  ok(!/z-index/.test(REGLA),
     'ni z-index: lo que está en el flujo no necesita pelearse por estar encima');
}

// ------------------------------------------------------------------
console.log('\nVa en el flujo, encima de la barra');
{
  ok(/flex:\s*none/.test(REGLA),
     'con flex:none, para que no se estire ni se encoja');

  // Lo que hace que «flex:none» lo coloque donde toca. La vista nace en
  // `display:none` y se vuelve flex al activarse, así que son dos reglas.
  ok(/\.app-view\{[^}]*flex-direction:column/.test(VISTAS),
     'y la vista se apila en columna');
  ok(/\.app-view\.active\{[^}]*display:flex/.test(VISTAS),
     'y es flex cuando está a la vista, que es lo que reparte el alto');
  ok(/\.scroll\{[^}]*flex:1/.test(VISTAS),
     'con el scroll en flex:1: es él quien cede el sitio, no la barra');
}

// ------------------------------------------------------------------
console.log('\nY el orden en el HTML es el orden en pantalla');
{
  const vista = HTML.slice(HTML.indexOf('data-view="rutina"'),
                           HTML.indexOf('id="toastRutina"'));
  const iScroll = vista.indexOf('class="scroll"');
  const iCrono  = vista.indexOf('id="restBar"');
  const iBarra  = vista.indexOf('class="bottom-bar"');

  ok(iScroll > 0 && iCrono > iScroll,
     'el cronómetro va después del scroll');
  ok(iCrono > 0 && iBarra > iCrono,
     'y ANTES de la barra de abajo: en una columna flex, ese es el orden que se ve');

  // Si alguien lo mueve dentro del scroll, se iría con el desplazamiento.
  const scroll = vista.slice(iScroll, vista.indexOf('</div>', iBarra));
  ok(!/class="scroll"[\s\S]*?id="restBar"[\s\S]*?class="add-exercise-btn"/.test(vista),
     'y no está metido dentro del scroll, donde se iría al desplazar la lista');
}

// ------------------------------------------------------------------
console.log('\nSe lee como UN pie, no como dos cosas apiladas');
{
  ok(/border-radius:\s*18px 18px 0 0/.test(REGLA),
     'las esquinas de abajo van rectas: se apoya en la barra en vez de flotar sobre ella');
  ok(!/margin/.test(REGLA),
     'y sin margen, para que no quede una rendija entre los dos');

  // La sombra hacia arriba: es el único lado donde ahora hay algo que
  // separar. Hacia abajo caería sobre la barra que tiene pegada.
  ok(/box-shadow:\s*0 -\d/.test(REGLA),
     'y la sombra va hacia arriba, que es donde está el contenido');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
