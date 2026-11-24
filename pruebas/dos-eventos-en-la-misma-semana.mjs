// Con dos eventos en la semana, el día del primero dejaba de ahorrar
// para el segundo.
//
// La regla es buena y está escrita: «el día del evento no se recorta:
// ese día es el que se está protegiendo». Lo que no cuadra es cómo se
// aplicaba:
//
//     var reserva = hoyEsEvento ? 0 : reservaDeLaSemana();
//
// Eso apaga la reserva ENTERA, no la de hoy. Con un solo evento da
// igual —lo único que hay que apagar es el suyo— y por eso nadie lo
// vio. Con dos en la misma semana, no:
//
//     miércoles  comida de trabajo   800
//     sábado     boda              1.000
//
// El miércoles la reserva correcta son los 1.000 del sábado: ese día no
// se recorta por SU comida, pero sí tiene que seguir apartando para la
// boda. Salía 0. Un día entero de ahorro que no pone nadie, y el sábado
// llega con menos sitio del que se le prometió.
//
// LO QUE SE PROTEGE ES EL EVENTO DE HOY, NO EL CALENDARIO ENTERO.
//
// Y SALE COMO FUNCIÓN SUYA, no como un ternario dentro de
// `actualizarMetas`. Es lo mismo que ya se hizo con `conPaso` y
// `conSuelo`, y por el mismo motivo escrito allí: una prueba que mira
// «cómo está escrito el `if`» es por donde se escapó una mutación.

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

const LIMPIO = APP.replace(/^\s*\/\/.*$/gm, '');
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

const partes = [fn('function reservaDeLaSemana('), fn('function reservaDeHoy(')];
if (partes.some((p) => !p)) {
  console.log('\n  FALLA  no existe `reservaDeHoy`: el día de un evento se apaga la\n' +
              '         reserva entera, también la de los demás eventos de la semana');
  console.log('\n0 bien, 1 mal');
  process.exit(1);
}

const isoDe = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
                     '-' + String(d.getDate()).padStart(2, '0');
// Su semana de verdad empieza en MARTES.
const ANCLA = new Date('2026-11-24T00:00:00');
const hoyEs = (iso, EVENTOS) => new Function(
  'EVENTOS', 'HOY', 'anclaSemana', 'isoDe',
  partes.join('\n') + '; return reservaDeHoy();'
)(EVENTOS, new Date(iso + 'T00:00:00'), ANCLA, isoDe);

// Miércoles una comida, sábado la boda.
const DOS = { '2026-11-25': { calorias: 800 }, '2026-11-28': { calorias: 1000 } };
const SOLO_BODA = { '2026-11-28': { calorias: 1000 } };

// ------------------------------------------------------------------
console.log('\nCon un solo evento, igual que siempre');
{
  ok(hoyEs('2026-11-24', SOLO_BODA) === 1000,
     'el martes se aparta para la boda', 'salió ' + hoyEs('2026-11-24', SOLO_BODA));
  ok(hoyEs('2026-11-28', SOLO_BODA) === 0,
     'y el sábado no se recorta a sí mismo',
     'es el día que se está protegiendo: salió ' + hoyEs('2026-11-28', SOLO_BODA));
  ok(hoyEs('2026-11-29', SOLO_BODA) === 0,
     'y el domingo ya no hay nada que apartar',
     'salió ' + hoyEs('2026-11-29', SOLO_BODA));
}

// ------------------------------------------------------------------
console.log('\nCon dos, el de hoy no apaga al otro');
{
  ok(hoyEs('2026-11-24', DOS) === 1800,
     'el martes aparta para los dos', 'salió ' + hoyEs('2026-11-24', DOS));

  ok(hoyEs('2026-11-25', DOS) === 1000,
     'el miércoles sigue apartando los 1.000 de la boda',
     'salió ' + hoyEs('2026-11-25', DOS) + '. Ese día no se recorta por SU comida ' +
     'de trabajo,\n         pero el sábado sigue estando ahí: apagar la reserva ' +
     'entera le quita a la\n         boda un día de ahorro que no pone nadie');

  ok(hoyEs('2026-11-26', DOS) === 1000,
     'y el jueves también, con la comida ya pasada',
     'salió ' + hoyEs('2026-11-26', DOS));

  ok(hoyEs('2026-11-28', DOS) === 0,
     'y el sábado, con todo lo demás pasado, cero',
     'salió ' + hoyEs('2026-11-28', DOS));
}

// ------------------------------------------------------------------
console.log('\nY nada se sale de madre');
{
  ok(hoyEs('2026-11-24', {}) === 0, 'sin eventos no hay reserva');

  // Un evento de la semana que viene no toca ésta.
  ok(hoyEs('2026-11-24', { '2026-12-05': { calorias: 1500 } }) === 0,
     'y uno de la semana que viene no entra en ésta',
     'cada semana reparte lo suyo');

  // NUNCA NEGATIVO, Y EL CASO QUE LO PIDE. La resta solo puede pasarse
  // si el evento de hoy NO entró en el total, y eso pasa cuando `HOY`
  // se sale de la semana del ancla: la app recarga al cambiar el día
  // para que no ocurra, pero el ancla es una variable y las variables
  // se quedan atrás. Una «reserva» negativa es una contradicción, y hoy
  // la tapa el `if(reserva > 0)` de quien llama — que es justo el tipo
  // de red que se quita sin querer.
  const fuera = hoyEs('2026-12-05', { '2026-12-05': { calorias: 1500 } });
  ok(fuera >= 0, 'con el ancla quedada atrás, cero y no un negativo',
     'salió ' + fuera);

  const raro = hoyEs('2026-11-24', { '2026-11-24': { calorias: 9999 } });
  ok(raro >= 0, 'y un evento enorme hoy tampoco lo saca de cero', 'salió ' + raro);

  // Sin calorías en el evento de hoy no se revienta.
  const vacio = hoyEs('2026-11-24', { '2026-11-24': {}, '2026-11-28': { calorias: 1000 } });
  ok(vacio === 1000, 'y un evento de hoy sin calorías no se lleva la otra reserva',
     'salió ' + vacio);
}

// ------------------------------------------------------------------
console.log('\nY la meta del día la usa');
{
  const i = LIMPIO.indexOf('var reserva =');
  const linea = LIMPIO.slice(i, LIMPIO.indexOf('\n', i));
  ok(/reservaDeHoy\(\)/.test(linea),
     '`actualizarMetas` pide la reserva de hoy', 'la línea dice: ' + linea.trim());
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
