// Apuntabas un alimento y las tres comidas se quedaban en blanco.
//
// Desayuno, comida y cena: la lista vacía. Los totales seguían bien
// —«883 cal», los macros de abajo, todo correcto— y al cerrar la app y
// volver a abrirla estaba todo ahí. No se perdió nunca nada; solo dejó
// de enseñarse.
//
// EL PORQUÉ. Al separar «la base de datos de la app» de «tus
// alimentos», la lista de lo ya apuntado se escondía mientras buscabas,
// para que no se leyera como una base de datos más. Esconderla lo hacía
// `pintarSugerencias`. Volver a enseñarla, nadie: al registrar un
// alimento el buscador se vacía por otro camino
// —`limpiarBuscadoresDeAlimento()`— que no sabía nada de eso.
//
// Y el comentario que escribí en `app.js` AFIRMABA que sí lo sabía:
// «el buscador se vacía solo al registrar, así que la lista vuelve».
// No volvía. El comentario describía lo que yo creía, no lo que hacía
// el código, que es la peor clase de comentario que hay.
//
// EL ARREGLO no es acordarse en el otro sitio: es que `pintarComida()`
// —por donde pasan todos los caminos— decida si se ve mirando el
// buscador. Derivado del estado, no recordado.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
// En Windows el fichero de trabajo queda en CRLF y cualquier ancla de
// varias líneas deja de encontrarse. No es un fallo del código.
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8')
  .replace(/\r\n/g, '\n');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

// Quitar los comentarios ANTES de mirar: ya hubo comprobaciones que
// pasaban por encontrar lo que buscaban dentro de un comentario recién
// escrito, y aquí arriba hay uno que habla justo de esto.
const sinComentarios = (s) => s.replace(/^\s*\/\/.*$/gm, '');

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

// ------------------------------------------------------------------
// SE EJECUTA DE VERDAD. Mirando el texto no se distingue un `hidden`
// que se calcula de uno que se queda como estaba.
const CUERPO = sinComentarios(fn('function pintarComida('));

function correr(lista, textoBuscado, empiezaEscondida) {
  const lienzo = {};
  const el = (id) => (lienzo[id] = lienzo[id] || { textContent: '', style: {} });
  const mealList = { innerHTML: '', hidden: !!empiezaEscondida };
  const mealSearch = { value: textoBuscado };

  new Function(
    'pintarFilasComidas', 'COMIDAS', 'comidaActual', 'document', 'mealSearch',
    'prepararAlimento', 'escapar', 'lineaComida', 'un', 'mil', 'calAlim',
    CUERPO + '; pintarComida();'
  )(
    () => {},
    { Comida: lista }, 'Comida',
    { getElementById: (id) => (id === 'mealList' ? mealList : el(id)) },
    mealSearch,
    () => {}, (s) => String(s), () => 'sub',
    (n) => n, (n) => String(n),
    (m) => m.P * 4 + m.C * 4 + m.G * 9 + (m.A || 0) * 7
  );

  return {
    escondida: mealList.hidden,
    html: mealList.innerHTML,
    tarjetas: (mealList.innerHTML.match(/class="food-card"/g) || []).length,
    cal: lienzo.tCal ? lienzo.tCal.textContent : '(no se pintó)'
  };
}

const CERVEZA  = { n: 'Cerveza',  P: 1.8, C: 12.8, G: 0, A: 13.8 };
const PECHUGA  = { n: 'Pechuga',  P: 31,  C: 0,    G: 3.6 };

// ------------------------------------------------------------------
console.log('\nApuntar un alimento no esconde lo que ya tenías');
{
  // ESTE ES EL FALLO, Y ARRANCA ESCONDIDA A PROPÓSITO. Es el estado en
  // el que queda la pantalla justo después de buscar. Al registrar, el
  // buscador se vacía y se repinta la comida: ahí tiene que volver.
  //
  // Arrancando visible esta comprobación pasaría sola, con el arreglo
  // quitado y todo, que es exactamente cómo se me escapó.
  const r = correr([PECHUGA, CERVEZA], '', true);
  ok(r.escondida === false,
     'tras apuntar, la comida vuelve a verse',
     'quedaba escondida hasta cerrar la app y volver a abrirla, y las ' +
     'tres comidas parecían vacías');
  ok(r.tarjetas === 2,
     'y están los dos alimentos',
     'tarjetas pintadas: ' + r.tarjetas);
}

// ------------------------------------------------------------------
console.log('\nY buscando sigue sin estorbar');
{
  // Arranca VISIBLE: esconderla solo puede haberlo hecho el código.
  const r = correr([PECHUGA], 'cerve', false);
  ok(r.escondida === true,
     'mientras buscas, tu comida se esconde',
     'pegada a los resultados y sin rótulo, se lee como otra base de datos');

  // Una sola letra no es una búsqueda: el buscador no pide nada hasta
  // dos. Si aquí se escondiera, bastaría rozar el teclado para vaciar
  // la pantalla.
  const corto = correr([PECHUGA], 'c', true);
  ok(corto.escondida === false, 'con una sola letra no se esconde');
}

// ------------------------------------------------------------------
console.log('\nY el total de la comida cuenta el alcohol');
{
  // La cerveza de un tarro: 13,8 g de alcohol son 97 kcal. Si el total
  // de la comida se sigue sumando con tres macros, el diario cuenta
  // bien y esta pantalla no, y las dos cifras se contradicen en la
  // misma app.
  const r = correr([CERVEZA], '', false);
  const esperado = Math.round(1.8 * 4 + 12.8 * 4 + 0 * 9 + 13.8 * 7);
  ok(r.cal === esperado + ' cal',
     'un tarro de cerveza suma ' + esperado + ' cal',
     'salió «' + r.cal + '». Sin alcohol serían 58');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
