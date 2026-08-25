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
console.log('\nEl panel deja de exigir el peso, pero solo cuando sobra');
{
  const g = hasta("  document.getElementById('catGuardar').addEventListener('click', function(){",
                  "\n  });");
  ok(/macrosPor !== 'unidad' && piezaG <= 0/.test(g),
     'con los macros por unidad no se pide el peso',
     'seguía obligando: es lo que se pidió quitar');
  ok(/unidad !== 'Gramos' &&/.test(g),
     'pero con los macros por 100 g sigue haciendo falta',
     'sin ese peso no hay forma de convertir y saldría «1 pieza = 0 calorías»');
  ok(/macros_por: macrosPor/.test(g), 'y se guarda lo que se eligió');
}

// ------------------------------------------------------------------
console.log('\nLa pantalla dice de qué son los números');
{
  ok(/id="catMacrosPor"/.test(HTML), 'hay dónde elegirlo');
  const p = hasta('  function pintarUnidadCatalogo(){', '\n  }');
  ok(/catMacrosPorCaja/.test(p) && /hidden = enGramos/.test(p),
     'la pregunta solo sale si no se cuenta en gramos');
  ok(/hidden = enGramos \|\| porUnidad/.test(p),
     'y el peso se esconde cuando ya no hace falta');
  ok(/catCalQue/.test(p),
     'y las calorías dicen si son de 100 g o de una unidad',
     'la etiqueta decía «Calorías por 100 g» fijo: en una ficha por unidad, mentía');

  // La previa es lo que hace que un dato absurdo cante antes de guardarse.
  // Si dividiera entre 100 unos macros que ya son de una pieza, enseñaría la
  // centésima parte y todo parecería correcto.
  const prev = hasta('  function pintarPreviaCatalogo(){', '\n  }');
  ok(/var f = porUnidad \? 1 : g \/ 100;/.test(prev),
     'y la previa no convierte lo que ya viene por unidad',
     'enseñaría 0.75 cal donde hay 75, y nadie sospecharía del formulario');
  ok(/u === 'Gramos' \|\| \(!porUnidad && g <= 0\)/.test(prev),
     'y se enseña sin peso, que es justo cuando no hace falta');
}

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
  ok(/catMacrosPor'\)\.value = \(a && a\.macros_por\) \|\| '100g'/.test(abrir),
     'y al abrirlo se rellena con lo que tiene guardado');
  ok(/catUnidad'\)\.value = \(a && a\.unidad\) \|\| 'Gramos'/.test(abrir),
     'igual que la unidad');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
