// Botones que el dedo no alcanzaba.
//
// Un dedo no es un puntero. Apple pide 44×44 como mínimo tocable, y se midió
// en el navegador que estos estaban muy por debajo:
//
//     Editar foto      63×13     ← el peor, sin un solo píxel de relleno
//     Renombrar        66×17
//     Borrar día       59×17
//     Reiniciar        60×21
//     ✕ del asistente  24×24
//     ‹ Regresar       80×26     ← en DIECIOCHO pantallas
//
// «Regresar» es el botón que más se usa en toda la app, y fallar al tocarlo
// no se lee como «fallé»: se lee como que la app se quedó colgada.
//
// NO SE AGRANDA EL BOTÓN, SE AGRANDA SU ZONA SENSIBLE. Un `::after` colocado
// encima, fuera del flujo, así que la maqueta no se mueve. Se comprobó
// midiendo los botones después del cambio: siguen midiendo 63×13, 66×17, lo
// mismo que antes. Y con `elementFromPoint` a 14-18 px fuera del botón
// visible, el toque ya cae dentro.
//
// Y AQUÍ ESTÁ LO QUE HACE FALTA CUIDAR. Una zona ampliada se come el toque de
// quien tenga al lado. Con la zona centrada salieron CINCO solapes medidos en
// las 27 pantallas, y uno era grave: «Borrar última sesión» va justo debajo de
// «Guardar sesión», así que tocar el borde de abajo de Guardar habría borrado
// la sesión. Cambiar un fallo de puntería por un borrado que nadie pidió es
// peor que no tocar nada.
//
// Por eso hay DOS reglas: los enlaces de texto —que siempre van pegados
// debajo de un botón principal— crecen solo hacia abajo.
//
// Lo que esta prueba puede fijar es el CSS. Las medidas y los solapes piden
// un navegador y ahí se comprobaron: cero por debajo de 44, cero solapes.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const CSS = readFileSync(join(RAIZ, 'docs', 'estilos', 'componentes.css'), 'utf8');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

// La regla, de una pieza y sin saltos, para poder mirarla entera.
const reglaDe = (selector) => {
  const i = CSS.indexOf(selector);
  if (i < 0) return '';
  return CSS.slice(i, CSS.indexOf('}', i) + 1).replace(/\s+/g, ' ');
};

// ------------------------------------------------------------------
console.log('\nLa zona ampliada existe y llega a 44');
{
  const centrada = reglaDe('.back-btn::after');
  ok(centrada.length > 20, 'hay una regla para los botones pequeños');
  ok(/min-width:\s*44px/.test(centrada) && /min-height:\s*44px/.test(centrada),
     'y llega a 44 en los dos lados',
     'es el mínimo tocable: por debajo se falla. Regla: ' + centrada);
  ok(/position:\s*absolute/.test(centrada), 'va fuera del flujo',
     'sin esto el botón crece de verdad y la maqueta se mueve entera');
  ok(/width:\s*100%/.test(centrada) && /height:\s*100%/.test(centrada),
     'y lo que ya era grande se queda como estaba',
     'sin el 100%, un botón ancho se encogería a 44');
}

// ------------------------------------------------------------------
console.log('\nY los botones no cambian de tamaño');
{
  // Si el arreglo hubiera tocado el botón en vez de su zona, la maqueta se
  // movería en dieciocho pantallas.
  const base = reglaDe('.back-btn, .prof-edit, .btn-mini,');
  ok(base.length > 10, 'la regla de los botones existe');
  ok(/position:\s*relative/.test(base), 'solo se les pone position:relative',
     'que es lo que necesita el ::after para colocarse contra ellos');
  // El `(min-|max-)?` no sobra: sin él, un `min-height:44px` metido aquí se
  // colaba —el guion no es ni `;` ni espacio— y eso agranda el botón de
  // verdad, que es justo lo que esta prueba dice que no pasa. Lo cazó una
  // mutación.
  ok(!/(^|[;{ ])(min-|max-)?(width|height|padding|margin|font-size)\s*:/.test(base),
     'y nada más: ni tamaño, ni relleno, ni margen',
     'cualquiera de esos mueve la maqueta en dieciocho pantallas. Regla: ' + base);
}

// ------------------------------------------------------------------
console.log('\nY los enlaces de texto crecen SOLO hacia abajo');
{
  // Esta es la parte que evita el borrado que nadie pidió.
  const abajo = reglaDe('.btn-ghost-text::after');
  ok(abajo.length > 20, 'tienen su propia regla, distinta de la centrada',
     'con la centrada se comían el borde de abajo del botón de encima');
  ok(/top:\s*0/.test(abajo), 'anclados a su borde de arriba',
     'centrados crecen hacia arriba, que es justo donde está el botón ' +
     'principal: en Rutina eso pone «Borrar última sesión» debajo de ' +
     '«Guardar sesión». Regla: ' + abajo);
  ok(!/translate\(-50%,\s*-50%\)/.test(abajo), 'y no centrados',
     'centrarlos es exactamente el fallo que esto evita');
  ok(/min-height:\s*44px/.test(abajo), 'y llegan a 44 de alto');
  // A lo ancho no hacen falta: son de ancho completo.
  ok(!/min-width/.test(abajo), 'a lo ancho no se tocan, que ya son anchos',
     'ampliarlos a los lados solo puede pisar a alguien');
}

// ------------------------------------------------------------------
console.log('\nY los que se arreglaron siguen ahí');
{
  // Si alguno desaparece o se renombra, la regla queda apuntando a nada y
  // el botón vuelve a ser intocable sin que nadie se entere.
  for (const id of ['editPhotoBtn', 'renameDayBtn', 'deleteDayBtn',
                    'pesoReiniciar', 'iaCerrar']) {
    ok(HTML.includes('id="' + id + '"'), id + ' sigue en la pantalla',
       'si se renombró, su regla ya no le llega y vuelve a no poder tocarse');
  }
  ok((HTML.match(/class="back-btn"/g) || []).length >= 10,
     'y «Regresar» sigue saliendo en muchas pantallas',
     'es el que más se usa');
  ok((HTML.match(/class="btn-ghost-text"/g) || []).length >= 4,
     'y hay varios enlaces de texto, que es lo que pedía la segunda regla');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
