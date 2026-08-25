// Los cuatro huecos de Fotos no pueden encogerse hasta desaparecer.
//
// EL FALLO. La rejilla de las cuatro poses es `flex:1` dentro de una columna
// flexible, o sea se queda con LO QUE SOBRA de la pantalla. Y llevaba
// `min-height:0`, que le da permiso para encogerse hasta cero.
//
// Mientras lo de abajo era corto, sobraba sitio. Pero debajo va la tarjeta
// «Tu mes en fotos», que la escribe el asistente y puede ocupar media
// pantalla. El mes que sale larga, lo que sobra es nada.
//
// Se midió en el navegador con el texto real de un análisis:
//
//     sin análisis   rejilla 298 px · cada hueco 139 px
//     con análisis   rejilla  12 px · cada hueco   2 px
//
// Los cuatro botones seguían ahí. Aplastados en una línea de puntos de dos
// píxeles, imposibles de tocar. Desde fuera lo que se ve es «ya no puedo
// subir mis fotos», y no hay ningún error en ninguna consola.
//
// El arreglo es un suelo. Con él, el mes que no quepa todo se arrastra un
// poco, que es infinitamente mejor que tener botones invisibles.
//
// NO SE PUEDE PROBAR AQUÍ QUE MIDA LO QUE MIDE —eso pide un navegador, y ahí
// se comprobó: 248 px de rejilla y huecos de 114×189, y de 114×167 en una
// pantalla de 375—. Lo que sí se puede fijar es que el suelo siga puesto, que
// es lo único que hay entre esto y que vuelva a pasar.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const CSS = readFileSync(join(RAIZ, 'docs', 'estilos', 'pantallas.css'), 'utf8');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

// La regla, sin saltos de línea, para poder leerla de una pieza.
const regla = (() => {
  const i = CSS.indexOf('.foto-grid{');
  return CSS.slice(i, CSS.indexOf('}', i) + 1).replace(/\s+/g, ' ');
})();

console.log('\nLa rejilla tiene suelo');
{
  ok(regla.length > 20, 'la regla existe');
  const m = regla.match(/min-height:\s*(\d+)px/);
  ok(!!m, 'lleva un min-height en píxeles',
     'con `min-height:0` la rejilla se encoge hasta desaparecer el mes que el ' +
     'análisis sale largo: se midió, quedaba en 12 px. Regla: ' + regla);
  const alto = m ? Number(m[1]) : 0;
  ok(alto >= 200,
     `y es suficiente para dos filas tocables (${alto} px)`,
     'son dos filas: menos de 200 deja huecos por debajo de lo que se puede tocar');
}

console.log('\nY sigue siendo flexible, que es lo que la hacía caber');
{
  ok(/flex:\s*1/.test(regla), 'se sigue quedando con lo que sobra',
     'sin esto vuelve a tener alto fijo y empuja el resto fuera de la vista');
  ok(/grid-template-rows:\s*minmax\(0,\s*1fr\)\s*minmax\(0,\s*1fr\)/.test(regla),
     'y las dos filas se reparten por igual, así las cuatro encogen a la vez');
  ok(/grid-template-columns:\s*1fr 1fr/.test(regla), 'en dos columnas');
}

console.log('\nY lo de abajo se puede arrastrar cuando no cabe');
{
  // El suelo solo sirve si el contenedor puede desplazarse: si no, lo que
  // se empuja fuera es la tarjeta del análisis y el problema cambia de sitio.
  ok(/\[data-view="fotos"\] \.scroll\{display:flex;flex-direction:column;\}/.test(
       CSS.replace(/\s*\n\s*/g, '')),
     'la columna de Fotos es flexible');
  ok(/class="scroll"/.test(HTML), 'y va dentro de un contenedor que arrastra');
}

console.log('\nY la tarjeta que lo provocó sigue donde estaba');
{
  // Si algún día se mueve el análisis fuera de esta columna, este suelo deja
  // de hacer falta. Mientras esté aquí, hace falta.
  const i = HTML.indexOf('data-view="fotos"');
  const vista = HTML.slice(i, HTML.indexOf('data-view=', i + 10));
  ok(/id="analisisCard"/.test(vista),
     'el análisis del mes vive en la misma columna que la rejilla',
     'si se ha movido, este suelo ya no sería necesario y sobra');
  ok(/id="fotoGrid"/.test(vista), 'y la rejilla también');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
