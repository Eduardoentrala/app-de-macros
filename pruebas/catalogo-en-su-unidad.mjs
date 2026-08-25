// El catálogo se rellena como viene el envase.
//
// Antes había que traducirlo todo a «por 100 g» de cabeza, y para contar por
// piezas hacía falta además saber lo que pesa una. Ninguna de las dos cosas
// las tienes delante: de una barrita conoces los macros DE LA BARRITA y de un
// aceite los de UNA CUCHARADA.
//
// Ahora se elige la unidad, se dice la cantidad, y se teclean los macros DE
// ESA CANTIDAD —«Macros para 45 g», «Macros para 1 pieza»—. La conversión a lo
// que la base sabe guardar se hace al guardar, que es donde toca:
//
//   Gramos   -> por 100 g          (45 g de barrita × 100/45)
//   lo demás -> los de UNA unidad  (dividido entre cuántas se dijeron)
//
// LO QUE MÁS PUEDE DOLER AQUÍ es equivocarse en esa cuenta: no falla nada, no
// hay error, simplemente el alimento queda con los macros multiplicados o
// divididos y todo el que lo use se lo come. Por eso la conversión se saca a
// una función y se ejecuta con números, en vez de mirar si el código «parece»
// correcto.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8');
const SQL = readFileSync(join(RAIZ, 'supabase', 'migrations',
  '0053_el_catalogo_en_su_unidad.sql'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

const hasta = (desde, fin) => {
  const i = APP.indexOf(desde);
  if (i < 0) throw new Error('no encuentro: ' + desde);
  return APP.slice(i, APP.indexOf(fin, i) + fin.length);
};

// ------------------------------------------------------------------
console.log('\nLa cuenta que convierte lo tecleado en lo que se guarda');
{
  // Se saca del guardado y se ejecuta con números.
  const i = APP.indexOf('    var cant = catCantidad();');
  const trozo = APP.slice(i, APP.indexOf('var cuerpo = {', i));
  ok(i > 0 && trozo.length > 40, 'la conversión está donde se guarda');

  const convertir = new Function('unidad', 'catCantidad',
    trozo + '; return { factor: factor, red: red };');

  // Un huevo: los macros de UNA pieza se guardan tal cual.
  const huevo = convertir('Pieza', () => 1);
  ok(huevo.red(6.3) === 6.3, 'una pieza se guarda como está', String(huevo.red(6.3)));

  // Dos huevos tecleados de golpe: se guarda lo de UNO.
  const dos = convertir('Pieza', () => 2);
  ok(dos.red(12.6) === 6.3, 'dos piezas se dividen entre dos',
     'guardó ' + dos.red(12.6) + ': el alimento quedaría con el doble de macros ' +
     'y todo el que lo use se lo come');

  // Media pieza: se guarda el doble.
  const media = convertir('Pieza', () => 0.5);
  ok(media.red(3) === 6, 'media pieza se multiplica por dos', String(media.red(3)));

  // Gramos: siempre por 100 g.
  const cien = convertir('Gramos', () => 100);
  ok(cien.red(7) === 7, '100 g se guardan como están');

  // La barrita de 45 g, que es el caso que no se podía escribir.
  const barrita = convertir('Gramos', () => 45);
  ok(Math.abs(barrita.red(10) - 22.2) < 0.05, '45 g se llevan a 100 g',
     'guardó ' + barrita.red(10) + ', esperaba 22.2 (10 × 100/45)');
  ok(Math.abs(barrita.red(22) - 48.9) < 0.05, 'y los carbos igual',
     String(barrita.red(22)));

  // Un envase de 330 ml contado como servicio.
  const serv = convertir('Servicio', () => 1);
  ok(serv.red(31) === 31, 'un servicio se guarda como está');
}

// ------------------------------------------------------------------
console.log('\nY qué dice que son, que es lo que decide cómo se leen');
{
  const f = hasta('  function macrosPorDelCatalogo(){', '\n  }');
  const cual = new Function('catUnidadActual', f + '; return macrosPorDelCatalogo();');
  ok(cual('Gramos') === '100g', 'en gramos, por 100 g');
  for (const u of ['Pieza', 'Servicio', 'Taza', 'Cucharada', 'Onzas']) {
    ok(cual(u) === 'unidad', `en ${u.toLowerCase()}, los de una`);
  }
}

// ------------------------------------------------------------------
console.log('\nUna cantidad en blanco no arruina la ficha');
{
  const f = hasta('  function catCantidad(){', '\n  }');
  const leer = (v) => new Function('catUnidadActual', 'document', 'baseDeUnidad',
    f + '; return catCantidad();')(
      'Pieza', { getElementById: () => ({ value: v }) }, () => 1);

  ok(leer('') === 1, 'vacía se lee como una porción',
     'un cero ahí dividiría entre cero: macros infinitos');
  ok(leer('0') === 1, 'y un cero también');
  ok(leer('-3') === 1, 'y un negativo');
  ok(leer('2') === 2, 'y un número normal se respeta');
}

// ------------------------------------------------------------------
console.log('\nLa pantalla, como la referencia');
{
  ok(/id="catUnidadPills"/.test(HTML), 'las unidades son píldoras, no un desplegable');
  for (const u of ['Gramos', 'Pieza', 'Servicio', 'Taza', 'Cucharada', 'Onzas']) {
    const i = HTML.indexOf('id="catUnidadPills"');
    ok(HTML.slice(i, i + 400).includes('>' + u + '<'), `está ${u}`);
  }
  ok(/id="catCantidad"/.test(HTML), 'hay una cantidad');
  ok(/id="catCantUnidad"/.test(HTML), 'con su etiqueta, que cambia con la unidad');

  // Y la cantidad se ajusta al elegir unidad. Sin esto, tocar «Pieza» deja el
  // 100 puesto y la etiqueta diría «Macros para 100 piezas»: se teclean los
  // macros de una creyendo eso, y al guardar se dividen entre cien.
  const pon = hasta('  function ponerUnidadCat(u){', '\n  }');
  ok(/catCantidad'\)\.value = baseDeUnidad\(u\)/.test(pon),
     'y al elegir unidad la cantidad va a la suya: 100 en gramos, 1 en el resto',
     'quedarse en 100 al pasar a piezas divide los macros entre cien al guardar');

  const p = hasta('  function pintarUnidadCatalogo(){', '\n  }');
  ok(/'Macros para ' \+ cuanto/.test(p),
     'y los macros dicen para cuánto son',
     '«Macros para 1 pieza», que es lo que se pidió');
  ok(/'Calorías para ' \+ cuanto/.test(p), 'y las calorías igual');
  ok(!/obligatorio/.test(HTML.slice(HTML.indexOf('id="catPiezaG"') - 200,
                                    HTML.indexOf('id="catPiezaG"') + 200)),
     'el peso ya no se marca como obligatorio',
     'era justo lo que no se quería tener que poner');
}

// ------------------------------------------------------------------
console.log('\nY nada de eso se puede guardar si la base no lo admite');
{
  ok(/'Taza', 'Cucharada', 'Onzas'/.test(SQL),
     'la base admite las seis unidades',
     'el check solo dejaba tres: elegir Cucharada daría un error de Postgres');
  ok(/macros_por = 'unidad' or unidad = 'Gramos' or pieza_g is not null/.test(SQL),
     'y sigue exigiendo el peso cuando de verdad hace falta convertir');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
