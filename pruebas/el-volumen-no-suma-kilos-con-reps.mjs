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
// Y LO SEGUNDO, que se ve al mirar las series una por una: las filas
// vienen RELLENAS con lo que dice la rutina —reps y peso ya puestos— y
// el volumen las sumaba todas, marcadas o no. O sea que contaba lo que
// pensabas hacer, no lo que hiciste.
//
// Eso el código ya lo sabía: el peso máximo de cada ejercicio solo mira
// las series marcadas, y lo explica —«se puede teclear un peso para la
// próxima sin llegar a levantarlo; contándolo, una intención se
// convierte en un récord»—. El volumen no hacía esa distinción.
//
// Ahora son dos números que no se mezclan: los kilos levantados y las
// repeticiones sin peso. Cada uno se compara con el suyo.

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
console.log('\nY solo cuenta lo que marcaste como hecho');
{
  // Cuatro series puestas por la rutina, dos hechas.
  const mitad = [ej('Sentadilla', [s(10, 60), s(10, 60), s(10, 60, false), s(10, 60, false)])];
  const r = await correr([ses('2026-11-03', mitad, 2400)]);
  ok(r.volumen === 1200,
     'dos series de diez a 60 kg son 1.200, no 2.400',
     'salió ' + r.volumen + '. Las filas vienen rellenas con lo que dice ' +
     'la rutina: contarlas todas es contar lo que pensabas hacer');

  // NINGUNA MARCADA: se cuentan todas. Mucha gente no usa las palomitas,
  // y dejar su semana en cero sería peor. Es la misma regla que ya usa el
  // peso máximo, no una inventada aquí.
  const sinMarcar = [ej('Sentadilla', [s(10, 60, false), s(10, 60, false)])];
  const r2 = await correr([ses('2026-11-03', sinMarcar, 1200)]);
  ok(r2.volumen === 1200,
     'y si no marcaste ninguna, se cuentan todas',
     'salió ' + r2.volumen);
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
  ok(v[0] === 100, 'la del 12 de octubre cuenta solo la serie hecha',
     'salió ' + v[0] + ' de ' + JSON.stringify(v));
  ok(v[3] === 100, 'y la cerrada igual', JSON.stringify(v));
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
