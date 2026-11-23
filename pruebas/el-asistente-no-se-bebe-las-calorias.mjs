// «Apunta un caballito de tequila» entraba con CERO calorías.
//
// Y no como estimación: marcado `seguridad: 'alta'`, que es la etiqueta
// que significa «esto ya no lo estima el modelo, sale de la tabla».
//
// Son dos fallos en `afinarConCatalogo` y se multiplican.
//
// UNO. CONVIERTE CON LA COLUMNA EQUIVOCADA. Las filas que no van en
// gramos traen DOS pesos y no son lo mismo:
//
//   · `porcion_g` — lo que pesa la ración de USDA. Para la cerveza son
//     30 g, porque la ficha original venía en «fl oz».
//   · `pieza_g`   — lo que pesa UNA de verdad, que es lo que puso la
//     0076 al pasar las bebidas a medidas: la lata, 360.
//
// La app usa `pieza_g` desde entonces y lo tiene escrito: «el peso sigue
// saliendo de `pieza_g`, un peso medido, y nunca del texto de la
// porción». El asistente se quedó con `porcion_g`. Una lata entraba como
// 30 gramos de cerveza.
//
// DOS. NO LEE EL ALCOHOL. La 0074 se hizo justo para esto —«la búsqueda
// también tiene que devolver el alcohol»— y `buscar_catalogo` lo
// devuelve desde entonces. La app se arregló aquel día; esta función
// nunca. De un destilado, el alcohol son TODAS las calorías: P, C y G
// valen cero y lo que queda son 33,4 g de etanol.
//
// Juntos:
//
//     caballito de tequila   101 cal  →  apuntaba 0     (-100%)
//     lata de cerveza        157 cal  →  apuntaba 5      (-97%)
//     copa de vino tinto     125 cal  →  apuntaba 3      (-97%)
//     bolillo                165 cal  →  apuntaba 81     (-51%)
//
// El bolillo no lleva alcohol: ése es el primer fallo solo, y es el que
// demuestra que esto no va de bebidas. Son las 11 filas del catálogo
// cuyo `pieza_g` y `porcion_g` no coinciden. Las otras 18 que se
// convierten por peso son platillos donde los dos pesos son iguales por
// casualidad, no por diseño: hoy aciertan y nadie lo está vigilando.
//
// POR QUÉ NO LO VIO `no-se-pierde-el-alcohol-al-copiar`. Esa prueba
// busca objetos que copian `P: a.P` sin la `A`, y tiene una excusa
// escrita para lo que propone la IA: «el modelo estima tres macros
// mirando un plato; no estima alcohol y no se le va a pedir». Es cierto
// y sigue siéndolo. Pero el afinado con el catálogo NO es una
// estimación del modelo: ahí el dato existe, está en la fila, y se tira.

import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const FN = readFileSync(join(RAIZ, 'supabase', 'functions', 'asistente', 'index.ts'), 'utf8');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8').replace(/\r\n/g, '\n');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

// La función de verdad, sin tipos, con su comparador de nombres delante.
const i = FN.indexOf('const PALABRAS_DE_ESTADO');
const iFn = FN.indexOf('async function afinarConCatalogo');
if (i < 0 || iFn < 0 || i > iFn) {
  throw new Error('no encuentro el afinado con su comparador de nombres delante');
}
const afinar = new Function(
  stripTypeScriptTypes(FN.slice(i, FN.indexOf('\n}', iFn) + 2), { mode: 'strip' }) +
  '; return afinarConCatalogo;')();

// LAS FILAS DE PRODUCCIÓN, con sus dos pesos. Copiadas de 0019 + 0073 +
// 0075 + 0076, que es lo que hay en la base hoy.
const CATALOGO = {
  tequila: [{
    nombre: 'Tequila (caballito)', estado: 'unico', unidad: 'Pieza', macros_por: '100g',
    pieza_g: 43, porcion_g: 28, proteina: 0, carbos: 0, grasas: 0, alcohol: 33.4,
  }],
  cerveza: [{
    nombre: 'Cerveza (lata)', estado: 'unico', unidad: 'Pieza', macros_por: '100g',
    pieza_g: 360, porcion_g: 30, proteina: 0.5, carbos: 3.6, grasas: 0, alcohol: 3.9,
  }],
  bolillo: [{
    nombre: 'Bolillo (pieza)', estado: 'unico', unidad: 'Pieza', macros_por: '100g',
    pieza_g: 57, porcion_g: 28, proteina: 9.1, carbos: 55.8, grasas: 3.3, alcohol: 0,
  }],
  // Los dos pesos de verdad del huevo cocido: una pieza son 50 g y la
  // ración de USDA son 136, que es «cup, chopped». La 0023 creó
  // `pieza_g` precisamente porque no son lo mismo.
  huevo: [{
    nombre: 'Huevo cocido', estado: 'cocido', unidad: 'Pieza', macros_por: '100g',
    pieza_g: 50, porcion_g: 136, proteina: 12.6, carbos: 0.7, grasas: 9.5, alcohol: 0,
  }],
  // En gramos y sin alcohol: lo normal, que no se puede romper.
  'pechuga de pollo': [{
    nombre: 'Pechuga de pollo', estado: 'cocido', unidad: 'Gramos', macros_por: '100g',
    pieza_g: null, porcion_g: 140, proteina: 31, carbos: 0, grasas: 3.6, alcohol: 0,
  }],
};

// `buscar_catalogo` busca por texto normalizado y devuelve lo que se le
// parezca, no una clave exacta: pedir «Atún (en aceite)» tiene que traer
// las filas de atún. Un buscador de mentira indexado por el literal
// dejaría pasar una prueba que en producción no se cumple.
const llano = (t) => String(t).toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ')
  .replace(/\s+/g, ' ').trim();
const buscador = {
  rpc: (_f, p) => {
    const q = llano(p.p_texto);
    const clave = Object.keys(CATALOGO).find((k) => q.includes(llano(k)));
    return Promise.resolve({ data: clave ? CATALOGO[clave] : [] });
  },
};

// La cuenta de la app, que es la que acaba en el anillo.
const cal = (a) => (Number(a.proteina) || 0) * 4 + (Number(a.carbos) || 0) * 4 +
                   (Number(a.grasas) || 0) * 9 + (Number(a.alcohol) || 0) * 7;

const pedir = async (nombre, cantidad, unidad) =>
  (await afinar(buscador, [{ nombre, cantidad, unidad, proteina: 0, carbos: 0,
                             grasas: 0, seguridad: 'media' }]))[0];

// ------------------------------------------------------------------
console.log('\nEl caballito de tequila');
{
  const a = await pedir('Tequila', 1, 'Pieza');
  ok(Math.abs(cal(a) - 101) < 12,
     'un caballito entra por sus ~101 calorías',
     'salió con ' + Math.round(cal(a)) + '. P, C y G valen cero en un destilado: ' +
     'si no se\n         lee el alcohol, el apunte es un cero perfectamente calculado');
  ok(Number(a.alcohol) > 0, 'y el alcohol llega con el alimento',
     'sin este campo la app no tiene de dónde sacarlo: ' + JSON.stringify(a));
  ok(a.seguridad === 'alta', 'y se marca como dato de tabla, que es lo que es');
}

// ------------------------------------------------------------------
console.log('\nLa lata de cerveza');
{
  const a = await pedir('Cerveza', 1, 'Pieza');
  ok(Math.abs(cal(a) - 157) < 25,
     'una lata entra por sus ~157 calorías',
     'salió con ' + Math.round(cal(a)) + ' · ' + JSON.stringify(a) +
     '\n         con `porcion_g` la lata pesa 30 g en vez de 360');
  ok(Number(a.carbos) > 10,
     'y hasta el carbohidrato sale bien, que no depende del alcohol',
     'con 30 g salen 1.1 g; con los 360 de la lata, 13 — ' + a.carbos);

  // Dos latas son dos latas.
  const dos = await pedir('Cerveza', 2, 'Pieza');
  ok(Math.abs(cal(dos) - 2 * cal(a)) < 1, 'y dos latas son el doble que una');
}

// ------------------------------------------------------------------
console.log('\nY el bolillo, que no lleva alcohol');
{
  // ESTE ES EL QUE DEMUESTRA QUE NO VA DE BEBIDAS. Sin una gota de
  // etanol, el peso equivocado ya se come la mitad.
  const a = await pedir('Bolillo', 1, 'Pieza');
  ok(Math.abs(cal(a) - 165) < 18,
     'una pieza entra por sus ~165 calorías',
     'salió con ' + Math.round(cal(a)) + '. El peso de un bolillo es 57 g (`pieza_g`), ' +
     'no los\n         28 de la ración de USDA (`porcion_g`)');
}

// ------------------------------------------------------------------
console.log('\nY lo de siempre sigue igual');
{
  const a = await pedir('Pechuga de pollo', 150, 'Gramos');
  ok(Math.abs(Number(a.proteina) - 46.5) < 0.2,
     '150 g de pechuga siguen siendo 46,5 g de proteína',
     JSON.stringify(a));
  ok(Number(a.alcohol || 0) === 0, 'y lo que no lleva alcohol lleva cero, no `undefined`',
     'un `undefined` viajando hasta la base es un NaN esperando: ' + JSON.stringify(a));

  // Y DOS TAZAS NO SON DOS PIEZAS.
  //
  // El candado de «la misma unidad» venía de la miel: la fila iba en
  // gramos, el modelo en cucharadas, y «2» se convertía en dos raciones
  // de 339 g. Al pasar de `porcion_g` a `pieza_g` ese caso dejó de
  // ejercitarlo —la miel no tiene peso por pieza, así que ya no hay nada
  // que multiplicar— y el candado se quedó sin nadie mirándolo. Este es
  // el caso que lo mira ahora: una fila que SÍ pesa por pieza, pedida en
  // otra unidad.
  const enTazas = await pedir('Huevo', 2, 'Taza');
  ok(enTazas.seguridad === 'media' && Number(enTazas.proteina) === 0,
     'una fila por piezas pedida en tazas no se convierte',
     'salió ' + JSON.stringify(enTazas) + '\n         sin el candado, «2 tazas» ' +
     'se cuentan como dos huevos de 50 g');

  // Pedida en piezas, sí.
  const enPiezas = await pedir('Huevo', 2, 'Pieza');
  ok(Math.abs(Number(enPiezas.proteina) - 12.6) < 0.05,
     'y en piezas sí, con el peso de una', JSON.stringify(enPiezas));

  // Sin fila que coincida no se toca nada: la estimación del modelo se
  // queda, marcada como tal.
  const b = await pedir('Tamal de dulce', 1, 'Pieza');
  ok(b.seguridad === 'media' && Number(b.proteina) === 0,
     'y lo que no está en el catálogo se queda como lo estimó el modelo');
}

// ------------------------------------------------------------------
console.log('\nY el paréntesis que NO es una medida se respeta');
{
  // LA OTRA MITAD DE LA REGLA. Quitar «(caballito)» del nombre es lo que
  // devuelve las bebidas al catálogo; quitar CUALQUIER paréntesis haría
  // que dos alimentos distintos pasaran por el mismo y se cogiera el
  // primero — que es, exactamente, el fallo del 20 de noviembre con la
  // crema. «En agua» y «en aceite» son 1 g de grasa contra 8.
  CATALOGO['atun'] = [
    { nombre: 'Atún (en agua)', estado: 'unico', unidad: 'Gramos', macros_por: '100g',
      pieza_g: null, porcion_g: 100, proteina: 25.5, carbos: 0, grasas: 0.8, alcohol: 0 },
    { nombre: 'Atún (en aceite)', estado: 'unico', unidad: 'Gramos', macros_por: '100g',
      pieza_g: null, porcion_g: 100, proteina: 29.1, carbos: 0, grasas: 8.2, alcohol: 0 },
  ];
  const a = await pedir('Atún', 100, 'Gramos');
  ok(a.seguridad === 'media' && Number(a.grasas) === 0,
     'pedir «atún» a secas no elige uno de los dos por orden de llegada',
     'salió ' + JSON.stringify(a) + '\n         si se tira cualquier paréntesis, ' +
     'los dos se llaman «atun» y gana el primero:\n         la grasa se decide ' +
     'por el orden de la tabla, no por lo que se comió');

  // Y pedido por su nombre entero, sí.
  const conAceite = await pedir('Atún (en aceite)', 100, 'Gramos');
  ok(Math.abs(Number(conAceite.grasas) - 8.2) < 0.05,
     'y pedido por su nombre completo sí se afina', JSON.stringify(conAceite));
  delete CATALOGO['atun'];
}

// ------------------------------------------------------------------
console.log('\nY la app recoge el alcohol que ahora le mandan');
{
  // De poco sirve calcularlo bien si el otro extremo lo tira. Es el
  // único sitio donde la app arma alimentos con lo que contesta la IA.
  const j = APP.indexOf("seguridad: x.seguridad");
  const desde = APP.lastIndexOf('prepararAlimento({', j);
  const trozo = APP.slice(desde, j + 60);
  ok(desde > 0 && /A:\s*Number\(x\.alcohol\)/.test(trozo),
     'lo que propone la IA llega con su alcohol',
     'sin esto el campo nuevo muere a tres líneas del diario:\n         ' +
     trozo.split('\n').join('\n         '));
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
