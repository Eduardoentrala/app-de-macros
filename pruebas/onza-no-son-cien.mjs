// La onza valía cien.
//
// EL FALLO. `baseDeUnidad` metía las onzas en el mismo saco que los gramos y
// les daba base 100. Pero la pantalla del alimento nuevo dice «Macros por
// onza» —una, no cien—. Quien daba de alta un queso tecleaba los macros de
// una onza y la app lo apuntaba como CIEN onzas llevando los macros de una.
//
// El estropicio de verdad venía después. `prepararAlimento` deduce la
// porción base dividiendo por la cantidad, así que al corregir la cantidad a
// dos onzas —lo normal— los macros salían divididos por cincuenta: 7 g de
// proteína se quedaban en 0.1.
//
// Y no se ve leyendo `baseDeUnidad` sola: los dos números son razonables por
// separado. Lo que no cuadraba era la PAREJA etiqueta/base, y por eso esta
// prueba las compara todas, no solo la que falló.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

// ---- Las funciones de verdad, sacadas y ejecutadas ----
const hasta = (desde, fin) => {
  const i = APP.indexOf(desde);
  if (i < 0) throw new Error('no encuentro: ' + desde);
  const j = APP.indexOf(fin, i);
  if (j < 0) throw new Error('no encuentro el final de: ' + desde);
  return APP.slice(i, j + fin.length);
};

const fuente =
  (APP.match(/^ {2}function baseDeUnidad\(u\)\{.*$/m) || [])[0] + '\n' +
  hasta('  function cantidadDeLaFila(unidad, cantidad){', '\n  }') + '\n' +
  hasta('  function prepararAlimento(a){', '\n  }') + '\n' +
  hasta('  function aplicarCantidad(a, cant){', '\n  }') + '\n' +
  hasta('  function textoBase(a){', '\n  }') + '\n' +
  (APP.match(/^ {2}var UNIDAD_ABREV = .*$/m) || [])[0] + '\n' +
  (APP.match(/^ {2}var UNIDAD_BASE {2}= .*$/m) || [])[0] + '\n' +
  (APP.match(/^ {2}var UNIDAD_UNA {3}= .*$/m) || [])[0] + '\n' +
  hasta('  function abreviarUnidad(u){', '\n  }');

const app = new Function(fuente + `
  return { baseDeUnidad, cantidadDeLaFila, prepararAlimento, aplicarCantidad,
           textoBase, UNIDAD_BASE, UNIDAD_UNA, UNIDAD_ABREV };`)();

// ------------------------------------------------------------------
console.log('\nEl caso que se rompía: un queso en onzas');
{
  // Se teclean los macros DE UNA ONZA, que es lo que pide la pantalla.
  const a = { n: 'Queso', u: 'Onzas', P: 7, C: 0.6, G: 9 };
  app.prepararAlimento(a);
  ok(a.cant === 1, 'recién dado de alta se apunta UNA onza, no cien',
     'salió cant=' + a.cant);
  ok(a.P === 7 && a.G === 9, 'con los macros que se tecleaon, tal cual');

  app.aplicarCantidad(a, 2);
  ok(Math.abs(a.P - 14) < 0.001 && Math.abs(a.C - 1.2) < 0.001 && Math.abs(a.G - 18) < 0.001,
     'y al ponerle dos onzas los macros se DOBLAN',
     'salió P=' + a.P + ' C=' + a.C + ' G=' + a.G + ', se esperaba 14 / 1.2 / 18');

  app.aplicarCantidad(a, 1);
  ok(Math.abs(a.P - 7) < 0.001, 'y volver a una deja lo de antes');
}

// ------------------------------------------------------------------
console.log('\nLos gramos no se tocaron');
{
  const a = { n: 'Arroz', u: 'Gramos', P: 7, C: 78, G: 0.6 };
  app.prepararAlimento(a);
  ok(a.cant === 100, 'siguen dándose de alta por 100 g');
  app.aplicarCantidad(a, 50);
  ok(Math.abs(a.C - 39) < 0.001, 'y la mitad son la mitad', 'salió C=' + a.C);
}

// ------------------------------------------------------------------
console.log('\nLa pareja que nadie comparaba: lo que dice la pantalla y lo que usa el código');
{
  // La regla, sin tabla escrita a mano: si la etiqueta empieza por un
  // número, la base es ese número; si dice «onza» o «taza», es una.
  for (const u of Object.keys(app.UNIDAD_BASE)) {
    const etiqueta = app.UNIDAD_BASE[u];
    const dice = Number((etiqueta.match(/^(\d+)/) || [])[1] || 1);
    const usa = app.baseDeUnidad(u);
    ok(dice === usa,
       `${u}: la pantalla pide «Macros por ${etiqueta}» y el código usa base ${usa}`,
       `pide los macros de ${dice} y guarda los de ${usa}`);
  }
  // Y el mismo cuadre en la hoja de la cantidad, que dice la porción con su
  // artículo: salía de abreviarUnidad(), que pluraliza, y decía «una onzas».
  const dice = {};
  for (const u of Object.keys(app.UNIDAD_BASE)) {
    const a = { u }; app.prepararAlimento(a);
    dice[u] = 'por ' + app.textoBase(a);
  }
  ok(dice.Onzas === 'por una onza', 'la hoja dice «por una onza»', 'dijo «' + dice.Onzas + '»');
  ok(dice.Servicio === 'por un servicio', 'y «por un servicio», no «una»', 'dijo «' + dice.Servicio + '»');
  ok(dice.Gramos === 'por 100 g', 'y los gramos siguen siendo «por 100 g»', 'dijo «' + dice.Gramos + '»');
  ok(Object.keys(app.UNIDAD_BASE).every((u) => !/s$/.test(app.UNIDAD_UNA[u])),
     'ninguna porción está en plural: es UNA, no varias',
     Object.values(app.UNIDAD_UNA).join(' | '));
}

// ------------------------------------------------------------------
console.log('\nLo que ya está guardado se lee por lo que se comió');
{
  const c = app.cantidadDeLaFila;
  ok(c('Gramos', 1) === 100,
     'gramos con quantity=1 de antes de la edición son una porción de 100');
  ok(c('Onzas', 100) === 1,
     'onzas con quantity=100 son la porción de una que se dio de alta mal');
  ok(c('Onzas', 1) === 1, 'y una onza apuntada hoy sigue siendo una');
  ok(c('Gramos', 250) === 250, 'lo demás pasa sin tocarse');
  ok(c('Pieza', 1) === 1, 'y una pieza es una pieza, no cien');
  ok(c('Taza', 2) === 2, 'dos tazas, dos');

  // Y de punta a punta: la fila vieja se relee y se puede volver a editar.
  const vieja = { n: 'Queso', u: 'Onzas', cant: app.cantidadDeLaFila('Onzas', 100), P: 7, C: 0.6, G: 9 };
  app.prepararAlimento(vieja);
  app.aplicarCantidad(vieja, 3);
  ok(Math.abs(vieja.P - 21) < 0.001,
     'una fila guardada con el fallo se puede corregir a 3 onzas y sale x3',
     'salió P=' + vieja.P);
}

// ------------------------------------------------------------------
console.log('\nLa regla vive en un solo sitio');
{
  // El diario se lee por dos caminos: el del arranque y el de cambiar de
  // día. Con la regla copiada, se arregla en uno y no en el otro.
  const llamadas = (APP.match(/cantidadDeLaFila\(unidad, cantidad\)/g) || []).length;
  ok(llamadas === 3, 'los dos caminos que releen el diario la llaman (más la propia)',
     'aparece ' + llamadas + ' veces');
  ok(!/if\(cantidad === 1 && baseDeUnidad\(unidad\) === 100\) cantidad = 100;/.test(APP),
     'y no queda ninguna copia suelta de la corrección');
}

// ------------------------------------------------------------------
console.log('\nLas dos rutas que guardan un alimento dicen la misma base');
{
  // Una escribía base_qty: 100 fijo, así que una pieza se guardaba como si
  // su porción fueran cien.
  const bases = APP.match(/base_qty: [^,\n]+/g) || [];
  ok(bases.length === 2, 'hay dos rutas que guardan alimento', bases.join(' | '));
  ok(bases.every((b) => /baseDeUnidad/.test(b)),
     'y las dos sacan la base de la unidad, ninguna la fija a 100',
     bases.join(' | '));
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
