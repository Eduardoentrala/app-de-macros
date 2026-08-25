// Dar de alta algo por piezas sin saber cuánto pesa una.
//
// El panel obligaba: si elegías Piezas, tenías que decir cuántos gramos pesa
// una, porque los macros del catálogo van por 100 g y sin ese peso no hay con
// qué convertir. La razón era buena pero el precio, alto: de un huevo o de
// una barrita sabes lo que dice la caja —los macros de UNA— y no lo que pesa.
// Quien lo daba de alta se inventaba un peso para poder guardar, y un peso
// inventado se propaga a todas las cantidades.
//
// Ahora se dice explícitamente a qué se refieren los macros de la fila. Y eso
// hay que respetarlo en LOS TRES sitios que leen esos números: la búsqueda de
// la app, el asistente cuando afina lo que ve en una foto, y la previa del
// propio panel. Si solo se cambia uno, los otros dividen entre 100 unos
// macros que ya venían por unidad y salen con la centésima parte, callados.
//
// Y DE PASO, UN FALLO QUE YA ESTABA. La consulta del panel no traía `unidad`
// ni `pieza_g`, así que abrir un alimento para editarlo dejaba el desplegable
// en «Gramos» y el peso en blanco. Entrar a corregirle una tilde al nombre de
// un huevo lo convertía en gramos y le borraba el peso, sin un aviso. Es la
// regresión silenciosa que la 0033 se cuidó de evitar, entrando por la puerta
// del formulario.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8');
const FN = readFileSync(join(RAIZ, 'supabase', 'functions', 'asistente', 'index.ts'), 'utf8');

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
console.log('\nLa app convierte según lo que diga la fila');
{
  // Se saca el trozo que traduce una fila del catálogo y se ejecuta.
  const i = APP.indexOf('      var cat = (r[0] || []).map(function(x){');
  const cuerpo = APP.slice(i, APP.indexOf('\n      });', i) + 9);
  const traducir = new Function('r',
    cuerpo + '; return cat;');

  const fila = (extra) => Object.assign({
    nombre: 'Huevo', estado: 'crudo', proteina: 6.3, carbos: 0.4, grasas: 5.3,
  }, extra);

  // Lo de siempre: por 100 g, con el peso de una pieza.
  const conPeso = traducir([[fila({ unidad: 'Pieza', pieza_g: 50, macros_por: '100g' })]])[0];
  ok(conPeso.u === 'Pieza' && conPeso.cant === 1, 'una pieza sigue siendo una pieza');
  ok(Math.abs(conPeso.P - 3.2) < 0.05, 'y sus macros se convierten con el peso',
     'P = ' + conPeso.P + ', esperaba 3.2 (6.3 × 50/100)');

  // Lo nuevo: los macros YA son los de una.
  const porUnidad = traducir([[fila({ unidad: 'Pieza', pieza_g: null, macros_por: 'unidad' })]])[0];
  ok(porUnidad.u === 'Pieza' && porUnidad.cant === 1, 'sin peso también sale por piezas',
     'salió en ' + porUnidad.u + ': la unidad elegida se ignoraba');
  ok(Math.abs(porUnidad.P - 6.3) < 0.001,
     'y los macros se cogen tal cual, sin dividir entre nada',
     'P = ' + porUnidad.P + ': se convirtieron unos números que ya venían por unidad');

  // Sin peso y sin decir nada: se cae a gramos, como antes.
  const suelto = traducir([[fila({ unidad: 'Pieza', pieza_g: null })]])[0];
  ok(suelto.u === 'Gramos' && suelto.cant === 100,
     'una fila vieja sin peso sigue cayendo a gramos, que es lo que hacía');

  // Y «por unidad» EN GRAMOS no significa nada: la unidad es el gramo. La
  // base ya lo impide, pero si una fila llegara así, cogerla tal cual daría
  // los macros de 1 g como si fueran los de 100.
  const raro = traducir([[fila({ unidad: 'Gramos', pieza_g: null, macros_por: 'unidad' })]])[0];
  ok(raro.u === 'Gramos' && raro.cant === 100,
     'y en gramos se ignora, que ahí no quiere decir nada',
     'salió ' + raro.cant + ' ' + raro.u);
}

// ------------------------------------------------------------------
console.log('\nY el asistente igual, que lee las mismas filas');
{
  const i = FN.indexOf('async function afinarConCatalogo');
  const f = FN.slice(i, FN.indexOf('\n}', i));
  ok(/macros_por/.test(f), 'mira si la fila trae los macros por unidad',
     'sin esto divide entre 100 unos números que ya venían por unidad: ' +
     'la centésima parte de los macros, en silencio');
  ok(/k = cant;/.test(f), 'y entonces solo multiplica por cuántas dijo el modelo');
  ok(/!== 'Gramos'/.test(f), 'solo cuando la unidad no es gramos');
}

// ------------------------------------------------------------------
// AQUÍ HABÍA DOS SECCIONES sobre el desplegable «Los macros de arriba son de»
// y sobre cuándo se pedía el peso. Ese formulario se rehízo: ahora se eligen
// unidad y cantidad, y las etiquetas dicen «Macros para 1 pieza». Lo que hace
// esa pantalla —y sobre todo la cuenta que convierte lo tecleado en lo que se
// guarda— se ejecuta con números en catalogo-en-su-unidad.
//
// Lo que sigue AQUÍ es lo que no cambió: que los TRES sitios que leen esas
// filas respeten `macros_por`, y que editar un alimento no le cambie la
// unidad a la espalda.

// ------------------------------------------------------------------
console.log('\nY editar un alimento ya no le cambia la unidad a la espalda');
{
  const c = hasta('  function cargarCatalogo(){', '\n  }');
  for (const col of ['unidad', 'pieza_g', 'macros_por']) {
    ok(new RegExp(col).test(c), `la lista del panel trae «${col}»`,
       'sin ella, abrir para editar deja el desplegable en Gramos y al ' +
       'guardar el huevo deja de contarse por huevos');
  }
  const abrir = hasta('  function abrirCatalogo(a){', '\n  }');
  // La unidad ya no es un desplegable: son píldoras, y ponerla ajusta además
  // la cantidad, así que se hace con la misma función que usa el dedo.
  ok(/ponerUnidadCat\(\(a && a\.unidad\) \|\| 'Gramos'\)/.test(abrir),
     'al abrirlo se recupera la unidad que tenía guardada',
     'sin esto vuelve a Gramos y al guardar el huevo deja de contarse por huevos');
  ok(/catPiezaG'\)\.value  = \(a && a\.pieza_g\) \|\| ''/.test(abrir),
     'y el peso, si lo tenía');
  // `macros_por` ya no se elige a mano: sale de la unidad. Lo que hay que
  // comprobar es que la ficha se reabra con la cantidad a la que se refieren
  // los macros GUARDADOS —100 g, o una unidad—, no con la que se tecleó en su
  // día, que no se guarda en ningún sitio.
  ok(/catCantidad'\)\.value =\s*\(\(a && a\.unidad\) \|\| 'Gramos'\) === 'Gramos' \? 100 : 1/.test(abrir),
     'y con la cantidad a la que se refiere lo guardado',
     'reabrirla con otra cantidad haría que los macros se leyeran mal');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
