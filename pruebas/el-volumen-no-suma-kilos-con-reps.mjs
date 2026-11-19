// El volumen sumaba kilos con repeticiones, y contaba series no hechas.
//
// `volumenDeSerie(reps, peso)` devuelve `reps × peso` si hay peso, y
// `reps` a secas si no lo hay. La nota que lo acompaña lo reconoce —«sí,
// mezcla unidades»— y lo justifica así: «da igual, porque este número no
// se compara con el de nadie más, solo consigo mismo, de una semana a la
// siguiente».
//
// Ahí está el error. Compararse consigo mismo de una semana a otra es
// EXACTAMENTE donde mezclar unidades rompe:
//
//     semana A:  4 × 10 × 50 kg de press   =  2.000
//     semana B:  4 × 10 dominadas al fallo =     40
//
// Mismo esfuerzo, puede que más, y el número dice «-98 %». Basta cambiar
// un ejercicio con barra por uno con el peso del cuerpo.
//
// Ahora son dos números que no se mezclan: los kilos levantados y las
// repeticiones sin peso. Cada uno se compara con el suyo.
//
// Y LAS PALOMITAS NO DECIDEN NADA AQUÍ, que fue un ida y vuelta.
//
// La primera versión de este arreglo contaba solo las series MARCADAS, con
// un argumento que suena bien: las filas vienen rellenas con lo que dice la
// rutina, así que contarlas todas es contar lo que pensabas hacer. Para el
// RÉCORD DE PESO ese argumento sigue valiendo y la regla sigue puesta —se
// puede teclear un peso «para la próxima» sin llegar a levantarlo—.
//
// Para el volumen no valía, y lo dijo quien usa la app: «a veces no marco
// la paloma pero sí hago el ejercicio». Con una serie marcada de tres, el
// lunes contaba 200 donde se habían levantado 600, y encima decía que había
// bajado.
//
// EL PROBLEMA NO ERA EQUIVOCARSE, ERA EQUIVOCARSE DISTINTO CADA SEMANA.
// Este número solo sirve para ver una tendencia, y una tendencia aguanta un
// sesgo constante pero no uno que depende de lo cuidadoso que estuviera
// alguien con las palomitas ese día: una semana marcando todo contra otra
// marcando una se leen como un +200% sin haber entrenado distinto.
//
// Para la serie que de verdad no se hizo hay un botón que lo dice sin
// ambigüedad —la `×` de la fila—. La palomita no lo dice.

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

// Una sesión como las que guarda la app: ejercicios con sus series.
const ses = (fecha, ejercicios, totalGuardado) => ({
  session_date: fecha, exercises: ejercicios, duration_min: 45,
  total_volume: totalGuardado
});
const ej = (nombre, series) => ({ nombre, series, volumen: 0 });
const s = (reps, peso, hecho) => ({ reps, peso, hecho: hecho !== false });

async function correr(filas) {
  const cuerpo = sinC(fn('function datosDeEntreno('));
  return new Function(
    'sesion', 'anclaSemana', 'isoDe', 'sbFetch', 'reg', 'PESOS', 'CINTURAS',
    cuerpo + '; return datosDeEntreno();'
  )(
    { user: { id: 'yo' } }, new Date(2026, 10, 9),
    (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10),
    () => Promise.resolve(filas), { dias: 4 }, {}, {}
  );
}

// ------------------------------------------------------------------
console.log('\nCambiar barra por dominadas no es un derrumbe');
{
  // La semana de antes, con barra. La cerrada, lo mismo con el cuerpo.
  const conBarra  = [ej('Press banca', [s(10, 50), s(10, 50), s(10, 50), s(10, 50)])];
  const conCuerpo = [ej('Dominadas',   [s(10, 0),  s(10, 0),  s(10, 0),  s(10, 0)])];
  const r = await correr([
    ses('2026-10-27', conBarra,  2000),
    ses('2026-11-03', conCuerpo, 40),
  ]);

  ok(r.volumen === 0 && r.volumen_antes === 2000,
     'los kilos van por su lado: 0 esta semana, 2.000 la anterior',
     'salió ' + r.volumen + ' y ' + r.volumen_antes);
  ok(r.reps_libres === 40 && r.reps_libres_antes === 0,
     'y las repeticiones sin peso por el suyo: 40 contra 0',
     'salió ' + r.reps_libres + ' y ' + r.reps_libres_antes);

  // LO QUE NO PUEDE PASAR: que los dos acaben en el mismo saco y salga un
  // «-98 %» de haber cambiado de ejercicio.
  ok(r.volumen !== 40 && r.volumen_antes !== 2040,
     'y no se suman entre sí en ningún momento',
     'si 40 repeticiones y 2.000 kg caben en el mismo número, cambiar un ' +
     'ejercicio con barra por uno con el peso del cuerpo se lee como un ' +
     'derrumbe del 98 %');
}

// ------------------------------------------------------------------
console.log('\nY las palomitas no deciden cuánto levantaste');
{
  // EL CASO QUE LO DECIDIÓ: tres series hechas, una sola marcada. Es lo
  // normal de quien marca la primera, se mete en la serie y ya no vuelve a
  // tocar la pantalla.
  const unaMarcada = [ej('Sentadilla', [s(10, 60), s(10, 60, false), s(10, 60, false)])];
  const r = await correr([ses('2026-11-03', unaMarcada, 1800)]);
  ok(r.volumen === 1800,
     'con una marcada de tres, cuentan las tres',
     'salió ' + r.volumen + '. Contando solo la marcada serían 600 de los ' +
     '1.800 que se levantaron, y el lunes diría que bajó');

  const todas = [ej('Sentadilla', [s(10, 60), s(10, 60), s(10, 60)])];
  const r2 = await correr([ses('2026-11-03', todas, 1800)]);
  ok(r2.volumen === 1800, 'y marcándolas todas, lo mismo',
     'la misma tarde no puede dar dos números según cuántas palomitas se ' +
     'pusieran: eso es ruido metido en la tendencia, que es lo único que ' +
     'este número sirve para ver');

  const ninguna = [ej('Sentadilla', [s(10, 60, false), s(10, 60, false)])];
  const r3 = await correr([ses('2026-11-03', ninguna, 1200)]);
  ok(r3.volumen === 1200, 'y sin marcar ninguna, igual', 'salió ' + r3.volumen);

  // LO QUE SÍ SIGUE MIRANDO LA PALOMITA: el récord de peso. Un récord es
  // una afirmación, no una tendencia, y se puede teclear un peso para la
  // próxima sin llegar a levantarlo. Inflar un récord es peor que perderlo.
  const conIntencion = [ej('Press', [s(10, 40), s(10, 80, false)])];
  const r4 = await correr([ses('2026-11-03', conIntencion, 1200)]);
  const press = (r4.ejercicios || []).filter((x) => x.nombre === 'Press')[0];
  ok(press && press.peso === 40,
     'pero el récord de peso sigue siendo solo de las marcadas',
     JSON.stringify(press) + ' — los 80 están tecleados para la próxima, no ' +
     'levantados: contarlos le diría «subiste a 80» a quien no los movió');
  ok(r4.volumen === 1200, 'aunque esos kilos sí cuenten para el volumen',
     'salió ' + r4.volumen + ': las dos reglas conviven porque miden cosas ' +
     'distintas');
}

// ------------------------------------------------------------------
console.log('\nY lo viejo, sin series guardadas, sigue contando');
{
  // Sesiones de antes de que se guardara el detalle: solo `total_volume`.
  // Tirarlas sería borrarle semanas del historial.
  const r = await correr([
    ses('2026-10-27', [], 5000),
    ses('2026-11-03', [], 3000),
  ]);
  ok(r.volumen === 3000 && r.volumen_antes === 5000,
     'se usa el total que quedó guardado',
     'salió ' + r.volumen + ' y ' + r.volumen_antes);
}

// ------------------------------------------------------------------
console.log('\nY las cuatro semanas de la tendencia cuentan igual');
{
  // Si la tendencia sigue con el número mezclado y la cabecera con el
  // nuevo, dos sitios de la misma pantalla dicen cosas distintas.
  const r = await correr([
    ses('2026-10-12', [ej('A', [s(10, 10), s(10, 10, false)])], 200),
    ses('2026-11-03', [ej('A', [s(10, 10)])], 100),
  ]);
  const v = (r.por_semana || []).map((x) => x.volumen);
  ok(v[0] === 200, 'la del 12 de octubre cuenta sus dos series',
     'salió ' + v[0] + ' de ' + JSON.stringify(v) + '. La tendencia y la ' +
     'cabecera tienen que contar igual: si no, dos sitios de la misma ' +
     'pantalla dicen cosas distintas de la misma tarde');
  ok(v[3] === 100, 'y la cerrada la suya', JSON.stringify(v));
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
