// Un caballito enseñaba tres ceros y un total de 101.
//
//     0.0 g Proteína · 0.0 g Carbos · 0.0 g Grasas
//     Total                                101 cal
//
// Los números eran correctos —las 101 calorías son los 14,4 g de
// alcohol por 7— pero la pantalla no se explicaba a sí misma. Puesto
// así parece que la app se equivoca, y de hecho lo pareció: lo reportó
// dos veces.
//
// Y eso no es una queja de diseño. Esta app se ha pasado el mes
// arreglando sitios donde decía algo que no era, y una pantalla cuyo
// total no sale de lo que enseña es exactamente eso, aunque el total
// esté bien.
//
// Ahora el alcohol se enseña donde cuenta: su casilla en la hoja de la
// cantidad, y un «A 14.4g» en las dos líneas de texto. Solo cuando lo
// lleva —son diez alimentos de doscientos cuarenta—, que una casilla en
// cero para todos los demás es ruido.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const CSS = readFileSync(join(RAIZ, 'docs', 'estilos', 'pantallas.css'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};
const sinC = (s) => s.replace(/^\s*\/\/.*$/gm, '');

function fn(cabecera) {
  const i = APP.indexOf(cabecera);
  if (i < 0) throw new Error('no encuentro: ' + cabecera);
  let n = 0, j = APP.indexOf('(', i);
  for (; j < APP.length; j++) {
    if (APP[j] === '(') n++;
    else if (APP[j] === ')') { n--; if (!n) break; }
  }
  n = 0;
  for (let k = APP.indexOf('{', j); k < APP.length; k++) {
    if (APP[k] === '{') n++;
    else if (APP[k] === '}') { n--; if (!n) return APP.slice(i, k + 1); }
  }
  throw new Error('llaves sin cerrar: ' + cabecera);
}

// Un caballito: 43 g al 33,4 % son 14,4 g de alcohol y 101 calorías.
const CABALLITO = () => ({ n: 'Tequila (caballito)', u: 'Pieza', cant: 1,
                           P: 0, C: 0, G: 0, A: 33.4 * 43 / 100 });
const PECHUGA = () => ({ n: 'Pechuga', u: 'Gramos', cant: 100, P: 31, C: 0, G: 3.6 });

// ------------------------------------------------------------------
// SE EJECUTA. Que la casilla exista en el HTML no dice si se enseña.
const CUERPO = ['function baseDeUnidad(', 'function prepararAlimento(',
                'function pintarPreviaCantidad('].map((c) => sinC(fn(c))).join('\n');

function hoja(alimento, cuanto) {
  const campos = {};
  const fila = { classList: { toggle: (c, v) => { campos.clase = v ? c : null; } } };
  const el = (id) => (campos[id] = campos[id] ||
    (id === 'cantCajaA' ? { hidden: true, parentNode: fila } : { textContent: '' }));
  new Function('alimentoEditando', 'cantValor', 'document', 'mil', 'un',
    CUERPO + '; alimentoEditando = prepararAlimento(alimentoEditando); pintarPreviaCantidad();')(
    alimento, { value: String(cuanto) }, { getElementById: el },
    (x) => String(Math.round(x)), (x) => x);
  return {
    total: campos.cantCal.textContent,
    escondida: campos.cantCajaA.hidden,
    alcohol: (campos.cantA || {}).textContent,
    clase: campos.clase || null
  };
}

console.log('\nLa hoja de la cantidad explica su total');
{
  const uno = hoja(CABALLITO(), 1);
  ok(uno.total === '101', 'un caballito son 101 cal', 'salió ' + uno.total);
  ok(uno.escondida === false, 'y la casilla del alcohol se enseña',
     'sin ella: tres ceros y un total de 101, que parece un fallo');
  ok(uno.alcohol === '14.4 g', 'diciendo cuántos gramos son',
     'puso «' + uno.alcohol + '»');
  ok(uno.clase === 'con-alcohol', 'y la fila se hace de cuatro columnas',
     'sin la clase, la cuarta casilla se sale o se encoge');

  // Y ESCALA CON LA CANTIDAD. Enseñar siempre los de una pieza sería
  // cambiar un número que no se explica por otro que miente.
  const cuatro = hoja(CABALLITO(), 4);
  ok(cuatro.alcohol === '57.4 g', 'cuatro caballitos llevan cuatro veces más',
     'puso «' + cuatro.alcohol + '»');
  ok(cuatro.total === '402', 'y el total va con ellos', 'salió ' + cuatro.total);
}

// ------------------------------------------------------------------
console.log('\nY no estorba a lo que no lleva');
{
  const p = hoja(PECHUGA(), 200);
  ok(p.escondida === true, 'una pechuga no enseña casilla de alcohol',
     'doscientos treinta alimentos de doscientos cuarenta no llevan: una ' +
     'casilla en cero para todos ellos es ruido');
  ok(p.clase === null, 'y su fila sigue siendo de tres columnas');
  ok(p.total === '313', 'con su total de siempre', 'salió ' + p.total);
}

// ------------------------------------------------------------------
console.log('\nY las dos líneas de texto también');
{
  const lineaMacros = new Function('un', 'calAlim',
    sinC(fn('function lineaMacros(')) + '; return lineaMacros;')(
    (x) => Math.round(x * 10) / 10,
    (m) => m.P * 4 + m.C * 4 + m.G * 9 + (m.A || 0) * 7);

  const conA = lineaMacros(CABALLITO());
  ok(/A 14\.4g/.test(conA), 'la línea del buscador dice el alcohol', conA);
  ok(/101kcal/.test(conA), 'y su total sigue cuadrando', conA);
  ok(!/A \d/.test(lineaMacros(PECHUGA())), 'y la pechuga no lo menciona',
     lineaMacros(PECHUGA()));

  const lineaComida = new Function('un', 'textoUnidad', 'calAlim',
    sinC(fn('function lineaComida(')) + '; return lineaComida;')(
    (x) => Math.round(x * 10) / 10, (c, u) => u,
    (m) => m.P * 4 + m.C * 4 + m.G * 9 + (m.A || 0) * 7);

  const enComida = lineaComida(CABALLITO());
  ok(/A14\.4/.test(enComida), 'y la de lo ya apuntado, igual', enComida);
  ok(!/A\d/.test(lineaComida(PECHUGA())), 'y tampoco molesta ahí',
     lineaComida(PECHUGA()));
}

// ------------------------------------------------------------------
console.log('\nY la casilla existe y cabe');
{
  ok(/id="cantCajaA" hidden/.test(HTML),
     'nace escondida en el HTML',
     'naciendo visible, parpadea una casilla vacía en cada apertura');
  ok(/id="cantA"/.test(HTML) && /<span>Alcohol<\/span>/.test(HTML),
     'con su rótulo');
  ok(/\.cant-macros\.con-alcohol\{[^}]*repeat\(4,1fr\)/.test(CSS.replace(/\s+/g, '')
       .replace(/\.cant-macros\.con-alcohol\{/, '.cant-macros.con-alcohol{')),
     'y el CSS le hace sitio con una cuarta columna',
     'sin esto las cuatro se reparten tres huecos y la última se sale');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
