// El campo «Cantidad» de crear un alimento no lo leía nadie.
//
// La pantalla de «Agregar alimento» tiene tres tarjetas: la unidad, la
// CANTIDAD, y los macros por porción base. Y `nfQty` —la cantidad— no
// aparecía ni una sola vez en app.js. Era un hueco donde escribir que no
// hacía nada.
//
// LO QUE SE VEÍA:
//
//   · En gramos: pones 150, tecleas los macros, guardas... y se apuntan 100 g.
//     Da igual lo que escribas ahí. «Si quiero registrarlo con un gramaje
//     diferente no me deja».
//
//   · En piezas: el `value="100"` está escrito en el HTML y nadie lo cambia
//     al elegir unidad, así que la caja sigue diciendo 100 con la etiqueta
//     «(pza)» —como si fueras a apuntar cien piezas— y luego apunta una.
//     La pantalla dice una cosa y la app hace otra.
//
// Y AL ARREGLARLO SALE UN SEGUNDO FALLO, escondido detrás del primero:
// `sbGuardarAlimento` guarda en la despensa `a.P/C/G`, que son los macros DE
// LO QUE SE APUNTA, no los de la porción base. Mientras la cantidad era
// siempre la base, los dos números coincidían y nadie lo notaba. En cuanto
// alguien apunta 150 g, la ficha de la despensa se guarda con los macros de
// 150 g etiquetados como «por 100 g»: un 50 % de más, para siempre, cada vez
// que vuelva a usarla.
//
// La otra ruta que guarda un alimento —la estrella— ya lo hacía bien:
// `a.porBase ? a.porBase.P : a.P`. Otra vez la misma regla escrita dos veces
// y solo corregida en una.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8');

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
console.log('\nEl campo existe y ahora sí se lee');
{
  ok(/id="nfQty"/.test(HTML), 'la pantalla tiene una caja de cantidad');
  const veces = (APP.match(/nfQty/g) || []).length;
  ok(veces > 0, 'y el código la lee',
     'aparece 0 veces en app.js: es un hueco donde escribir que no hace nada');
}

// ------------------------------------------------------------------
console.log('\nLo que se teclea, convertido en alimento');
{
  const fuente =
    (APP.match(/^ {2}function baseDeUnidad\(u\)\{.*$/m) || [])[0] + '\n' +
    hasta('  function aplicarCantidad(a, cant){', '\n  }') + '\n' +
    hasta('  function alimentoDelFormulario(', '\n  }');
  const crear = new Function(fuente + '; return alimentoDelFormulario;')();

  // 150 g de arroz, con los macros por 100 g.
  const arroz = crear('Arroz', 7, 78, 0.6, 'Gramos', 150);
  ok(arroz.cant === 150, 'en gramos se apunta la cantidad que se escribió',
     'apuntó ' + arroz.cant + ' g: la caja de cantidad no sirve de nada');
  ok(Math.abs(arroz.C - 117) < 0.05, 'y los macros salen escalados',
     'C = ' + arroz.C + ', debería ser 117 (78 × 1.5)');
  ok(Math.abs(arroz.porBase.C - 78) < 0.001,
     'mientras que la porción base guarda lo tecleado, sin escalar',
     'porBase.C = ' + arroz.porBase.C);

  // Dos huevos.
  const huevo = crear('Huevo', 6.3, 0.4, 5.3, 'Pieza', 2);
  ok(huevo.cant === 2, 'en piezas se apuntan las piezas que se dijeron');
  ok(Math.abs(huevo.P - 12.6) < 0.05, 'y los macros se doblan',
     'P = ' + huevo.P);
  ok(Math.abs(huevo.porBase.P - 6.3) < 0.001, 'con una pieza como base');

  // Y lo que ya funcionaba: sin tocar la cantidad, una porción.
  const solo = crear('Pollo', 31, 0, 3.6, 'Gramos', '');
  ok(solo.cant === 100, 'sin escribir cantidad se apunta una porción base');
  ok(Math.abs(solo.P - 31) < 0.001, 'con los macros tal cual');
  const cero = crear('Pollo', 31, 0, 3.6, 'Gramos', 0);
  ok(cero.cant === 100, 'y un cero tampoco apunta cero: es una porción');
}

// ------------------------------------------------------------------
console.log('\nLa caja dice un número que tenga sentido para su unidad');
{
  const f = hasta('  function ponerUnidad(u){', '\n  }');
  ok(/nfQty/.test(f),
     'al cambiar de unidad se ajusta la cantidad',
     'el value="100" está escrito en el HTML: al elegir «Pieza» la caja ' +
     'sigue diciendo 100 con la etiqueta (pza)');
  ok(/baseDeUnidad\(u\)/.test(f),
     'y al número que le toca a esa unidad: 100 en gramos, 1 en piezas');
}

// ------------------------------------------------------------------
console.log('\nY la despensa guarda la PORCIÓN BASE, no lo que se apuntó hoy');
{
  const g = hasta('  function sbGuardarAlimento(a){', '\n  }');
  ok(/porBase/.test(g),
     'sbGuardarAlimento guarda los macros de la porción base',
     'guarda a.P, que son los de lo apuntado: quien apunte 150 g deja su ' +
     'ficha con un 50 % de más etiquetado como «por 100 g», para siempre');

  // Las dos rutas que guardan en `saved_foods` tienen que decir lo mismo.
  //
  // Anclado a esa tabla y no a `protein_g:` a secas: ese nombre sale también
  // en las metas y en el diario, y la comprobación daba rojo señalando
  // líneas que no tienen nada que ver.
  // Se mira ALREDEDOR de cada `protein_g`, no hacia delante desde la tabla:
  // en una de las dos rutas la fila se arma ANTES de nombrar la tabla, y
  // buscando solo hacia delante esa se quedaba fuera.
  const rutas = [];
  let i = -1;
  while ((i = APP.indexOf('protein_g:', i + 1)) >= 0) {
    const vecindad = APP.slice(Math.max(0, i - 900), i + 900);
    if (!/\/rest\/v1\/saved_foods'/.test(vecindad)) continue;
    if (/method:\s*'PATCH'/.test(APP.slice(Math.max(0, i - 400), i))) continue;  // editar, no crear
    rutas.push(APP.slice(i, APP.indexOf('\n', i)).trim().replace(/,$/, ''));
  }
  ok(rutas.length === 2, 'hay dos rutas que guardan en la despensa',
     rutas.length + ': ' + rutas.join(' | '));
  ok(rutas.every((r) => /porBase/.test(r)),
     'y las dos guardan la porción base',
     'una guarda una cosa y la otra otra: ' + rutas.join(' | '));
}

// ------------------------------------------------------------------
console.log('\nY quien guarda la usa: una función sola no arregla nada');
{
  const i = APP.indexOf("document.getElementById('nfSave').addEventListener");
  const guardar = APP.slice(i, APP.indexOf('\n  });', i));
  const llamadas = (guardar.match(/alimentoDelFormulario\(/g) || []).length;
  ok(llamadas === 2, 'el botón de guardar la llama por los dos caminos',
     'la llama ' + llamadas + ' veces: hay dos —el alimento nuevo y el que ' +
     'ya estaba guardado— y los dos apuntan comida');
  ok(/document\.getElementById\('nfQty'\)\.value/.test(guardar),
     'leyendo la caja de cantidad de la pantalla');
}

// ------------------------------------------------------------------
console.log('\n«2 piezas», no «2 pieza»');
{
  // Se escribía `a.u.toLowerCase()`: el nombre de la unidad tal cual, o sea
  // siempre en singular —y las onzas siempre en plural, «una onzas»—.
  const fuente =
    (APP.match(/^ {2}var UNIDAD_BASE {2}= .*$/m) || [])[0] + '\n' +
    hasta('  function textoUnidad(cant, u){', '\n  }');
  const t = new Function(fuente + '; return textoUnidad;')();

  ok(t(1, 'Pieza') === 'pieza', 'una pieza');
  ok(t(2, 'Pieza') === 'piezas', 'dos piezas', 'dijo «' + t(2, 'Pieza') + '»');
  ok(t(1.5, 'Pieza') === 'piezas', 'y una y media también son piezas');
  ok(t(1, 'Onzas') === 'onza', 'una onza, no «una onzas»');
  ok(t(3, 'Onzas') === 'onzas', 'y tres onzas');
  ok(t(1, 'Taza') === 'taza' && t(4, 'Taza') === 'tazas', 'tazas igual');
  ok(t(1, 'Cucharada') === 'cucharada' && t(2, 'Cucharada') === 'cucharadas', 'y cucharadas');
  ok(t(150, 'Gramos') === 'g' && t(1, 'Gramos') === 'g',
     'los gramos van con su abreviatura y no se pluralizan');
  ok(t(2, 'LoQueSea') === 'g', 'y una unidad que no existe no revienta');

  // Y que lo use quien pinta la línea del diario, que es donde se lee.
  const linea = hasta('  function lineaComida(a){', '\n  }');
  ok(/textoUnidad\(a\.cant, a\.u\)/.test(linea),
     'la línea del diario lo usa',
     'ahí es donde de verdad se lee «2 pieza» todos los días');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
