// Guardar un alimento que ya tenías: ¿te lo dice y te deja corregirlo?
//
// LO QUE PASABA ANTES. Los dos caminos que guardan en la despensa se
// estrellaban contra el mismo muro:
//
//   * «Guardar alimento» creaba la ficha, apuntaba la comida, y el `insert`
//     chocaba con el índice único de (persona, nombre, unidad). La ficha se
//     borraba de la lista y salía «No se pudo guardar el alimento: ...».
//   * La estrella decía «Ese ya estaba en Guardados» y ahí se acababa.
//
// Los dos eran callejones sin salida: si la ficha guardada tenía los macros
// mal, no había forma de corregirla. Ahora se pregunta antes.
//
// Y LA REGLA QUE SOSTIENE LA COMPARACIÓN es NOMBRE + UNIDAD, no solo el
// nombre: el índice de la base es sobre los tres, y «Churro» en Gramos y en
// Pieza son dos fichas legítimas —cien gramos de churro y un churro no
// tienen los mismos macros—. Preguntar por el nombre a secas estorbaría en
// un caso que funciona bien.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(AQUI, '..', 'docs', 'app.js'), 'utf8');
const HTML = readFileSync(join(AQUI, '..', 'docs', 'index.html'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q) => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q); }
};

// ---- Se EJECUTA la comparación de verdad, sacada de app.js ----
function sacar(desde, hasta) {
  const i = APP.indexOf(desde);
  if (i < 0) return null;
  const j = APP.indexOf(hasta, i);
  return j < 0 ? null : APP.slice(i, j + hasta.length);
}
const fNorm = sacar('  function normalizarBusqueda(s){', '\n  }');
const fIgual = sacar('  function guardadoIgual(nombre, unidad){', '\n  }');
if (!fNorm || !fIgual) {
  console.log('  FALLA  no encuentro las funciones en app.js');
  process.exit(1);
}
const guardadoIgual = new Function('MIS_ALIMENTOS',
  fNorm + fIgual + '; return guardadoIgual;')(
  [
    { n: 'Plátano', u: 'Gramos', P: 1, C: 23, G: 0.3, id: 'a' },
    { n: 'Churro de azúcar', u: 'Gramos', P: 4, C: 40, G: 20, id: 'b' },
    { n: 'Churro de azúcar', u: 'Pieza', P: 2, C: 18, G: 9, id: 'c' },
  ]);

// ------------------------------------------------------------------
console.log('\nLo reconoce aunque se escriba distinto');
{
  ok(guardadoIgual('Churro de azúcar', 'Gramos')?.id === 'b',
     'el mismo nombre y la misma unidad');
  ok(guardadoIgual('churro de azucar', 'Gramos')?.id === 'b',
     'sin acentos y en minúsculas: quien escribe «platano» busca su «Plátano»');
  ok(guardadoIgual('  Plátano  ', 'Gramos')?.id === 'a',
     'y con espacios de más a los lados');
}

// ------------------------------------------------------------------
console.log('\nPero NO confunde dos fichas legítimas');
{
  ok(guardadoIgual('Churro de azúcar', 'Pieza')?.id === 'c',
     'el mismo nombre en otra unidad es OTRA ficha');
  ok(guardadoIgual('Churro de azúcar', 'Taza') === null,
     'y una unidad que no tiene no es duplicado de nada');
  ok(guardadoIgual('Churro', 'Gramos') === null,
     'y un nombre parecido tampoco: se compara entero, no por trozos');
  ok(guardadoIgual('Manzana', 'Gramos') === null, 'lo que no tiene, no lo tiene');
}

// ------------------------------------------------------------------
console.log('\nLa hoja para preguntar');
{
  ok(/id="preguntaSheet"/.test(HTML), 'existe');
  ok(/id="preguntaSi"/.test(HTML) && /id="preguntaNo"/.test(HTML),
     'con los dos botones');
  ok(/id="preguntaTitulo"/.test(HTML) && /id="preguntaTexto"/.test(HTML),
     'y el título y el texto se ponen desde el código: sirve para más preguntas');

  const f = sacar('  function preguntar(titulo, texto, textoSi){', '\n  }');
  ok(!!f && /new Promise/.test(f), 'devuelve una promesa, para poder esperarla');
  ok(!!f && /if\(e\.target === hoja\) cerrar\(false\)/.test(f),
     'y tocar fuera es cancelar, como en el resto de las hojas');
  // LOS TRES, no «alguno». Se pone uno por cada botón y otro en el fondo,
  // y basta con que quede UNO suelto para que la segunda pregunta responda
  // también a la primera: dos hojas, una sola respuesta y la promesa vieja
  // resolviéndose con lo que se contestó a otra cosa.
  const sueltos = ['si.removeEventListener', 'no.removeEventListener',
                   'hoja.removeEventListener'].filter((x) => !f.includes(x));
  ok(!!f && sueltos.length === 0,
     'y se sueltan LOS TRES escuchadores al cerrar' +
     (sueltos.length ? ' — falta soltar: ' + sueltos.join(', ') : ''));
}

// ------------------------------------------------------------------
console.log('\nAl guardar desde «Agregar alimento»');
{
  const i = APP.indexOf("document.getElementById('nfSave').addEventListener");
  const bloque = APP.slice(i, APP.indexOf('\n  });', i));

  ok(/var yaLoTiene = guardadoIgual\(nombre, unidadActual\);/.test(bloque),
     'se comprueba ANTES de crear nada');
  ok(/preguntar\(/.test(bloque), 'y se pregunta');
  ok(/if\(cambiar\) actualizarGuardado\(/.test(bloque),
     'si dice que sí, se le cambian los macros a la ficha que ya existe');

  // Lo que más importa: cancelar la pregunta no puede llevarse por delante
  // la comida. Se entró aquí a apuntar algo.
  const iThen = bloque.indexOf('.then(function(cambiar){');
  const iApuntar = bloque.indexOf('apuntarYLimpiar', iThen);
  const iCierra = bloque.indexOf('});', iThen);
  ok(iApuntar > iThen && iApuntar < iCierra,
     'y la comida se apunta se conteste lo que se conteste');
  ok(!/if\(cambiar\)[\s\S]{0,80}apuntarYLimpiar/.test(bloque),
     'no colgando de un «si dijo que sí»: cancelar los macros no es cancelar la comida');
}

// ------------------------------------------------------------------
console.log('\nY desde la estrella de una comida ya apuntada');
{
  const i = APP.indexOf("var b = e.target.closest('[data-guardar]');");
  const bloque = APP.slice(i, APP.indexOf('\n  });', i));

  ok(/var yaEsta = guardadoIgual\(a\.n, a\.u \|\| 'Gramos'\);/.test(bloque),
     'también se comprueba antes de tocar nada');
  ok(/if\(mismos\)\{/.test(bloque),
     'y si los macros son IGUALES no se pregunta nada: no hay nada que decidir');
  ok(/actualizarGuardado\(yaEsta/.test(bloque),
     'y si son distintos, se ofrece cambiarlos');
}

// ------------------------------------------------------------------
console.log('\nActualizar no puede dejar la pantalla mintiendo');
{
  const f = sacar('  function actualizarGuardado(g, P, C, G){', '\n  }');
  ok(!!f && /var antes = \{ P:g\.P, C:g\.C, G:g\.G \};/.test(f),
     'se guarda cómo estaba antes');
  ok(!!f && /g\.P = antes\.P; g\.C = antes\.C; g\.G = antes\.G;/.test(f),
     'y si la base dice que no, se deshace');
  ok(!!f && /No se pudo actualizar/.test(f),
     'y se avisa: una ficha que dice 300 cal y guarda 200 es peor que un error');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
