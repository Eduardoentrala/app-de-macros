// Cancelar un evento se enseñaba hecho aunque el servidor no se enterara.
//
// «La pantalla no debe mentir sobre lo que hay guardado» es una regla que
// esta app ya tenía escrita, y que cumple en casi todas partes: si falla
// subir una foto, se quita; si falla apuntar comida sin señal, se encola y
// se dice. Quedaba un sitio donde no.
//
// `cancelarEvento` borraba el evento de memoria, rehacía el reparto de la
// semana, decía «quitado · tus calorías vuelven a la normalidad»… y si el
// PATCH fallaba, solo avisaba: «Sigue apuntado, inténtalo otra vez».
//
// O sea que esa persona leía que seguía apuntado MIENTRAS LO VEÍA QUITADO,
// y con las calorías de la semana ya repartidas como si la cena no
// existiera. Al recargar, el evento volvía y las calorías cambiaban solas
// sin que nada lo explicara.
//
// Dos verdades distintas en la misma pantalla es peor que un error claro.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

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

// Se EJECUTA, con el servidor diciendo que sí y diciendo que no. Lo que
// importa es en qué estado queda `EVENTOS`, no cómo está escrito el catch.
const FUENTE = sacar('function cancelarEvento(');

function cancelar(falla) {
  const EVENTOS = { '2026-12-24': { titulo: 'Cena de Navidad', calorias: 1200 } };
  const visto = { semanas: 0, pintados: 0, avisos: [], fallos: [] };
  const fn = new Function(
    'EVENTOS', 'actualizarSemana', 'toast', 'sesion', 'sbFetch',
    'traducirError', 'pintarEventos', 'apuntarFallo', 'Promise', 'Date', 'JSON',
    FUENTE + '; return cancelarEvento;')(
    EVENTOS,
    () => { visto.semanas++; },
    (_, t) => visto.avisos.push(t),
    { user: { id: 'u1' } },
    () => falla ? Promise.reject(new Error('sin red')) : Promise.resolve(null),
    (m) => String(m),
    () => { visto.pintados++; },
    (donde) => visto.fallos.push(donde),
    Promise, Date, JSON);
  return { p: fn('2026-12-24'), EVENTOS, visto };
}

const esperar = () => new Promise((r) => setTimeout(r, 15));

// ------------------------------------------------------------------
console.log('\nSi el servidor lo acepta, queda quitado');
{
  const { EVENTOS, visto } = cancelar(false);
  await esperar();
  ok(!EVENTOS['2026-12-24'], 'el evento se va');
  ok(visto.semanas >= 1, 'y la semana se rehace sin él');
  ok(visto.avisos.some((t) => /quitado/.test(t)), 'y se dice que se quitó',
     JSON.stringify(visto.avisos));
}

// ------------------------------------------------------------------
console.log('\nY SI NO, VUELVE');
{
  const { EVENTOS, visto } = cancelar(true);
  await esperar();

  ok(!!EVENTOS['2026-12-24'], 'el evento vuelve a estar',
     'si no, la pantalla lo enseña quitado mientras el aviso dice que ' +
     'sigue apuntado: dos verdades a la vez');
  ok(EVENTOS['2026-12-24'] && EVENTOS['2026-12-24'].titulo === 'Cena de Navidad',
     'y vuelve entero, no un hueco',
     JSON.stringify(EVENTOS['2026-12-24']));
  ok(EVENTOS['2026-12-24'] && EVENTOS['2026-12-24'].calorias === 1200,
     'con sus calorías, que son las que reparten la semana');

  ok(visto.semanas >= 2, 'y la semana se rehace otra vez, con él dentro',
     'sin esto las calorías de la semana se quedan repartidas como si la ' +
     'cena no existiera, y al recargar cambian solas');

  ok(visto.avisos.some((t) => /Sigue apuntado/.test(t)),
     'y se dice que sigue ahí', JSON.stringify(visto.avisos));
  ok(visto.fallos.includes('cancelar_evento'),
     'y queda apuntado el fallo',
     'si esto falla siempre, nadie se enteraría salvo por el toast');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
