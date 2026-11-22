// Tres «chicharrón de cerdo» idénticos, uno encima de otro.
//
// Buscó «Chicharron» y le salieron tres tarjetas con la misma letra:
//
//     chicharron de cerdo   P 61g · C 0g · G 35g · 559kcal · Gramos
//     chicharron de cerdo   P 61g · C 0g · G 35g · 559kcal · Gramos
//     Chicharron de cerdo   P 61g · C 0g · G 35g · 559kcal · Gramos
//
// Las tres bajo el mismo rótulo, «Tus alimentos · los que diste de alta
// tú», y sin forma de saber cuál tocar.
//
// POR QUÉ. Esa franja no sale de un sitio, sale de DOS: lo que tiene
// guardado en su despensa (`saved_foods`) y lo que dio de alta en el
// catálogo desde el panel (`alimentos_catalogo` con `de_la_app = false`).
// El código las junta con un `concat` y las pinta bajo un solo título.
//
// Y NO ES LA REGLA DE ARRIBA. Unas líneas antes hay una decisión tomada a
// propósito —«el del catálogo ya no se esconde detrás del tuyo»— y es
// buena: su «Bolillo» de 148 kcal la pieza, el de su panadería, y el de la
// app de 293 por 100 g son dos panes distintos, y cada uno sale bajo su
// propio rótulo diciendo de quién es. Eso es información.
//
// Pero eso vale ENTRE franjas. Dentro de una, dos tarjetas que se leen
// exactamente igual no informan de nada: son el mismo alimento metido en
// dos sitios, y lo único que hacen es obligar a elegir a ciegas.
//
// LA REGLA ES «SE LEEN IGUAL», no «se llaman igual»: mismo nombre y misma
// línea de macros. Dos fichas que comparten nombre y dicen cosas distintas
// se quedan las dos, que es justo lo que hay que ver.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8').replace(/\r\n/g, '\n');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

const sinC = (s) => s.replace(/^\s*\/\/.*$/gm, '');
const LIMPIO = sinC(APP);
function fn(cabecera) {
  const i = LIMPIO.indexOf(cabecera);
  if (i < 0) return null;
  let n = 0;
  for (let j = LIMPIO.indexOf('{', i); j < LIMPIO.length; j++) {
    if (LIMPIO[j] === '{') n++;
    else if (LIMPIO[j] === '}') { n--; if (!n) return LIMPIO.slice(i, j + 1); }
  }
  return null;
}

// Las de verdad: la que quita repetidos, y las dos de las que depende.
const fuente = [
  fn('function normalizarBusqueda(s){'),
  fn('function sinTildes(s){'),
  fn('function un(x){') || 'function un(x){ return (Math.round(x*10)/10); }',
  fn('function calAlim(a){') || 'function calAlim(a){ return a.P*4 + a.C*4 + a.G*9 + (a.A||0)*7; }',
  fn('function lineaMacros(a){'),
  fn('function sinRepetidos(arr){'),
].join('\n');
if (!fn('function sinRepetidos(arr){')) {
  console.log('\n  FALLA  no existe `sinRepetidos`: la franja sigue pintando lo mismo dos veces');
  console.log('\n0 bien, 1 mal');
  process.exit(1);
}
const sinRepetidos = new Function(fuente + '\nreturn sinRepetidos;')();

const card = (n, P, C, G, u) => ({ n, P, C, G, u: u || 'Gramos' });

// ------------------------------------------------------------------
console.log('\nLos tres chicharrones');
{
  // Tal y como le salieron: dos de la despensa y el catálogo, y uno más
  // que se coló con mayúscula.
  const r = sinRepetidos([
    { fuente: 'mio',      ...card('chicharron de cerdo', 61, 0, 35) },
    { fuente: 'catalogo', ...card('chicharron de cerdo', 61, 0, 35) },
    { fuente: 'catalogo', ...card('Chicharron de cerdo', 61, 0, 35) },
  ]);
  ok(r.length === 1, 'quedan en uno', 'quedaron ' + r.length + ': ' +
     JSON.stringify(r.map((x) => x.n)));
  ok(r[0] && r[0].fuente === 'mio', 'y se queda el primero, el suyo',
     JSON.stringify(r[0]));
}

// ------------------------------------------------------------------
console.log('\nPero lo que dice cosas distintas se queda');
{
  // ESTE ES EL LÍMITE DE LA REGLA. Dos fichas con el mismo nombre y
  // macros distintos son dos alimentos distintos mal nombrados, o una de
  // las dos está mal: en los dos casos hay que verlas.
  const r = sinRepetidos([
    card('Bolillo', 9, 56, 2),
    card('Bolillo', 5, 28, 1),
  ]);
  ok(r.length === 2, 'mismo nombre y macros distintos: se quedan los dos',
     'quedaron ' + r.length + '. Esconder uno es esconder que hay un ' +
     'número mal');

  // Y la unidad cuenta: «Bolillo» por pieza y por 100 g no son lo mismo.
  const u = sinRepetidos([
    card('Bolillo', 9, 56, 2, 'Gramos'),
    card('Bolillo', 9, 56, 2, 'Pieza'),
  ]);
  ok(u.length === 2, 'y con distinta unidad también',
     'la línea de la tarjeta acaba en la unidad: si se leen distinto, se ven');

  // El alcohol entra en la cuenta como todo lo demás.
  const a = sinRepetidos([
    { ...card('Cerveza', 0.5, 3.6, 0), A: 3.9 },
    { ...card('Cerveza', 0.5, 3.6, 0), A: 0 },
  ]);
  ok(a.length === 2, 'y una con alcohol y otra sin él son dos cosas',
     'son 43 kcal contra 16: el cuarto macro no puede quedarse fuera de ' +
     'esta comparación');

  // Y AL REVÉS: DOS ALIMENTOS DISTINTOS CON LOS MISMOS MACROS. Pasa de
  // verdad —pechuga de pollo y pechuga de pavo rondan los mismos números—
  // y comparar solo la línea de macros escondería uno de los dos. El
  // nombre tiene que entrar en la cuenta.
  const n = sinRepetidos([
    card('Pechuga de pollo', 31, 0, 3.6),
    card('Pechuga de pavo', 31, 0, 3.6),
  ]);
  ok(n.length === 2, 'y dos alimentos distintos con los mismos macros se quedan',
     'quedaron ' + n.length + ': ' + JSON.stringify(n.map((x) => x.n)) +
     '\n         pollo y pavo dan casi lo mismo, y no son lo mismo');
}

// ------------------------------------------------------------------
console.log('\nY da igual la tilde y la mayúscula');
{
  const r = sinRepetidos([
    card('Plátano', 1.1, 22.8, 0.3),
    card('platano', 1.1, 22.8, 0.3),
    card('PLATANO', 1.1, 22.8, 0.3),
  ]);
  ok(r.length === 1, 'tres formas de escribirlo son una tarjeta',
     'quedaron ' + r.length + ': ' + JSON.stringify(r.map((x) => x.n)));
  ok(r[0].n === 'Plátano', 'y se queda como se escribió la primera');
}

// ------------------------------------------------------------------
console.log('\nY la franja se arma con eso');
{
  const i = LIMPIO.indexOf('var deMios');
  const linea = LIMPIO.slice(i, LIMPIO.indexOf(';', i) + 1);
  ok(/sinRepetidos\(/.test(linea),
     '«Tus alimentos» quita los repetidos',
     'es la única franja que junta dos orígenes bajo un rótulo: ' + linea);

  // Y LAS OTRAS DOS NO. Es la decisión que ya estaba tomada: el bolillo de
  // la app y el suyo salen los dos, cada uno bajo su título.
  const app = LIMPIO.slice(LIMPIO.indexOf('var deLaApp'), LIMPIO.indexOf('var aMano'));
  ok(!/sinRepetidos\(/.test(app),
     'y «Base de datos de la app» no, que ahí ver los dos es información',
     'su bolillo de 148 la pieza y el de la app de 293 por 100 g son dos ' +
     'panes');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
