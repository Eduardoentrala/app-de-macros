// Una receta se cocina entera y se come en varias veces.
//
// Apuntarla metía la fuente COMPLETA de un golpe. Su postre de avena son
// 1.210 g y 1.083 calorías, y se come en tres o cuatro días: apuntarlo
// entero y luego corregir los cuatro alimentos a mano, uno por uno, es más
// trabajo que no usar la receta. Él lo dijo así: «cómo le hago si es todo
// ese plato, me lo comeré en porciones y no tengo opción de agregar por
// gramos o algo así».
//
// Ahora la receta sabe lo que pesa entera y se le dice cuánto se sirvió.
//
// DE DÓNDE SALE EL PESO. De lo que lleva dentro, que ya está apuntado — NO
// de pesar la fuente. Pesarla mide también el recipiente, y eso se olvida:
// su báscula marcaba 1.369 g con el tupper, 159 más que la comida.
//
// Y SOLO SI TODOS LOS INGREDIENTES VAN EN GRAMOS. Con uno en piezas no se
// sabe lo que pesa la fuente —media pieza de qué—, así que los gramos se
// esconden y quedan las fracciones, que funcionan siempre.

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

const sinComentarios = (s) => s.replace(/^\s*\/\/.*$/gm, '');

function sacar(cabecera) {
  const i = APP.indexOf(cabecera);
  if (i < 0) throw new Error('no encuentro: ' + cabecera);
  let n = 0, j = APP.indexOf('(', i);
  for (; j < APP.length; j++) {
    if (APP[j] === '(') n++;
    else if (APP[j] === ')') { n--; if (!n) break; }
  }
  n = 0;
  let k = APP.indexOf('{', j);
  for (; k < APP.length; k++) {
    if (APP[k] === '{') n++;
    else if (APP[k] === '}') { n--; if (!n) return APP.slice(i, k + 1); }
  }
  throw new Error('llaves sin cerrar en ' + cabecera);
}

const pesoDeReceta = new Function(sacar('function pesoDeReceta(') + '; return pesoDeReceta;')();
const escalar = new Function(sacar('function escalarIngrediente(') + '; return escalarIngrediente;')();

// SU RECETA, la de verdad, con los números de su pantalla.
const POSTRE = { n: 'Postre de avena', ing: [
  { n: 'avena Quick',               u: 'Gramos', cant: 600, P: 15.6, C: 67.2, G: 6 },
  { n: 'griego yoplait sin azucar', u: 'Gramos', cant: 440, P: 30.8, C: 29.9, G: 8.4 },
  { n: 'Chocolate 70% 3b',          u: 'Gramos', cant: 70,  P: 6.3,  C: 24.5, G: 17.5 },
  { n: 'Plátano',                   u: 'Gramos', cant: 100, P: 1.1,  C: 22.8, G: 0.3 },
]};
const cal = (ing) => Math.round(ing.reduce((t, x) => t + x.P * 4 + x.C * 4 + x.G * 9, 0));
const servir = (f) => POSTRE.ing.map((x) => escalar(x, f));

// ------------------------------------------------------------------
console.log('\nLa receta sabe lo que pesa, sin pesarla');
{
  ok(pesoDeReceta(POSTRE) === 1210, 'su postre pesa 1.210 g',
     'salió ' + pesoDeReceta(POSTRE) + '. Sale de sumar lo que lleva, no de ' +
     'la báscula: la suya marcaba 1.369 con el tupper');

  // Con una pieza por medio no se puede repartir, y decir un número a
  // medias sería peor que no decir ninguno.
  const conPieza = { ing: [
    { n: 'Pan', u: 'Piezas', cant: 2, P: 8, C: 50, G: 2 },
    { n: 'Atún', u: 'Gramos', cant: 120, P: 26, C: 0, G: 1 },
  ]};
  ok(pesoDeReceta(conPieza) === null, 'con un ingrediente en piezas, no hay peso',
     'devolvió ' + pesoDeReceta(conPieza) + '. Media pieza de qué');

  ok(pesoDeReceta({ ing: [] }) === null, 'una receta vacía no pesa nada');
  ok(pesoDeReceta(null) === null, 'y sin receta no revienta');
  ok(pesoDeReceta({ ing: [{ n: 'x', u: 'Gramos', cant: 0, P: 0, C: 0, G: 0 }] }) === null,
     'ni un ingrediente de 0 g da un peso con el que repartir',
     'dividir entre cero manda el factor al infinito');
}

// ------------------------------------------------------------------
console.log('\nY se sirve lo que se sirvió');
{
  // CON MARGEN DE 3 CALORÍAS, y no por pereza. Cada macro de cada
  // ingrediente se guarda a un decimal, igual que todo lo demás que se
  // apunta, así que medio postre acumula ocho redondeos. La primera
  // versión de esto exigía el 541 exacto —la mitad justa de 1.083— y salía
  // 543: no estaba mal el reparto, estaba mal la cuenta de la prueba.
  //
  // Tres calorías sobre quinientas es un 0,5%, muy por debajo de lo que se
  // equivoca la etiqueta del yogur. Lo que sí tiene que cuadrar exacto son
  // los GRAMOS, y eso se comprueba abajo.
  const cerca = (a, b) => Math.abs(a - b) <= 3;
  ok(cal(servir(1)) === 1083, 'entera, sus 1.083 cal exactas',
     'salió ' + cal(servir(1)) + '. Sin escalar no hay redondeo que valga');
  ok(cerca(cal(servir(0.5)), 541), 'la mitad, 541', 'salió ' + cal(servir(0.5)));
  ok(cerca(cal(servir(1 / 3)), 361), 'un tercio, 361', 'salió ' + cal(servir(1 / 3)));
  ok(cerca(cal(servir(250 / 1210)), 224), 'y 250 g, 224', 'salió ' + cal(servir(250 / 1210)));

  // Y QUE EL REDONDEO NO SE VAYA SIEMPRE PARA EL MISMO LADO MUCHO. Es
  // hacia arriba —`Math.round` sube los .5— así que medio postre sale un
  // pelín alto. Mientras sea un pelín, da igual; si un día son veinte
  // calorías por plato, es otra cosa.
  ok(cal(servir(0.5)) * 2 - cal(servir(1)) <= 6,
     'y dos mitades no se separan de la fuente entera',
     'dos mitades dan ' + (cal(servir(0.5)) * 2) + ' contra ' + cal(servir(1)));

  // LA CANTIDAD SE MUEVE CON LOS MACROS. Escalar unos y no la otra deja el
  // diario diciendo «600 g · 128 cal», que no se puede ni corregir.
  const mitad = servir(0.5);
  ok(mitad[0].cant === 300, 'la avena baja a 300 g', 'quedó en ' + mitad[0].cant);
  ok(mitad[0].P === 7.8, 'y su proteína a la mitad también', 'quedó en ' + mitad[0].P);
  ok(mitad.reduce((t, x) => t + x.cant, 0) === 605, 'y el plato pesa la mitad: 605 g');

  // A UN DECIMAL, no a entero: con enteros, tres tercios no suman la
  // receta entera y sobra o falta comida que nadie apuntó.
  const t = servir(1 / 3);
  const tresTercios = t.reduce((a, x) => a + x.cant, 0) * 3;
  ok(Math.abs(tresTercios - 1210) < 1,
     'tres tercios vuelven a ser la fuente entera',
     'suman ' + tresTercios.toFixed(1) + ' g');

  // Los nombres y las unidades no se tocan.
  ok(mitad[0].n === 'avena Quick' && mitad[0].u === 'Gramos', 'el nombre y la unidad siguen');
  ok(servir(2)[3].cant === 200, 'y repetir plato también vale',
     'dos raciones de postre es un caso normal, no un error');
}

// ------------------------------------------------------------------
console.log('\nY un factor raro no apunta cualquier cosa');
{
  for (const malo of [0, -1, null, undefined, NaN, 'x']) {
    const r = escalar(POSTRE.ing[0], malo);
    ok(r.cant === 600,
       'con un factor «' + String(malo) + '» se apunta la receta entera',
       'quedó en ' + r.cant + '. Un cero apuntaría un plato de 0 g, y un ' +
       'negativo restaría comida del día');
  }
}

// ------------------------------------------------------------------
console.log('\nY la pantalla enseña lo que va a entrar');
{
  ok(HTML.includes('id="recetaPorcion"'), 'está el selector');
  ok(HTML.includes('id="recetaFrac"'), 'con sus fracciones');
  ok(HTML.includes('id="recetaGramos"'), 'y sus gramos');
  ok(/¿Cuánto te serviste\?/.test(HTML), 'y se pregunta en claro');

  const p = sinComentarios(sacar('function pintarPorcionReceta('));
  ok(/escalarIngrediente\(x, factorReceta\)/.test(p),
     'la lista se pinta ESCALADA',
     'enseñar los 600 g mientras se apuntan 200 sería enseñar otra receta');
  ok(/recetaPreview/.test(p), 'y se dice cuántas calorías entran');
  ok(/caja\.hidden = \(peso == null\)/.test(p),
     'y los gramos se esconden si no se sabe el peso',
     'un campo de gramos sobre una receta con piezas pide un dato que no ' +
     'se puede usar');
  ok(/activeElement !== campo/.test(p),
     'y no se reescribe el campo mientras se teclea',
     'escribir «25» para llegar a 250 se convertiría en 25 y de vuelta');

  const a = sinComentarios(sacar('function abrirReceta('));
  ok(/factorReceta = 1;/.test(a), 'y cada vez que se abre, vuelve a la fuente entera',
     'heredar el tercio de la vez anterior apunta un tercio sin que nadie ' +
     'lo haya pedido');
}

// ------------------------------------------------------------------
console.log('\nY el aviso dice cuánto entró');
{
  const ap = sinComentarios(sacar('function apuntarReceta('));
  ok(/apuntarReceta\(r, factor\)/.test(APP) || /function apuntarReceta\(r, factor\)/.test(ap),
     'se apunta con el factor');
  ok(/Math\.round\(f \* 100\)/.test(ap),
     'y el aviso dice el porcentaje',
     'si al apuntar un tercio dice lo mismo que al apuntarlo entero, no hay ' +
     'forma de saber cuál de los dos pasó');
  ok(/f === 1\) \? ''/.test(ap), 'pero no al apuntarla entera, que es lo normal');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
