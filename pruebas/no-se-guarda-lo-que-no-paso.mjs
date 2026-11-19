// «Guardar sesión» funcionaba igual antes de empezar que al terminar.
//
// Las series vienen rellenas con lo que dice la rutina, así que la pantalla
// está lista para guardarse desde que se abre. Un toque por error apunta la
// rutina ENTERA como si se hubiera levantado — y el volumen de ese día
// alimenta la regla más cara del cierre del lunes.
//
// Ahora se pregunta. Pero NO SIEMPRE, y eso es la mitad del arreglo: una
// confirmación que sale todos los días se contesta sin leerla a la semana, y
// entonces no protege de nada. Sale solo cuando no hay ni una señal de que
// el entrenamiento ocurrió.
//
// Las señales son tres, y basta con una:
//
//   · el cronómetro ha corrido —arranca al marcar la primera serie o al
//     poner un descanso—;
//   · hay alguna serie marcada;
//   · se tocó algún peso o alguna repetición.
//
// A quien entrena de verdad no le sale nunca: con marcar una serie o pulsar
// el descanso una sola vez ya hay rastro.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8').replace(/\r\n/g, '\n');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

const sinC = (s) => s.replace(/^\s*\/\/.*$/gm, '');
const LIMPIO = sinC(APP);
function fn(cabecera) {
  const i = LIMPIO.indexOf(cabecera);
  if (i < 0) throw new Error('no encuentro: ' + cabecera);
  let n = 0;
  for (let j = LIMPIO.indexOf('{', i); j < LIMPIO.length; j++) {
    if (LIMPIO[j] === '{') n++;
    else if (LIMPIO[j] === '}') { n--; if (!n) return LIMPIO.slice(i, j + 1); }
  }
  throw new Error('llaves sin cerrar: ' + cabecera);
}

// ------------------------------------------------------------------
console.log('\nLas tres señales de que el entrenamiento pasó');
{
  // EJECUTADA con una lista de mentira que contesta a los selectores.
  const mirar = ({ crono, marcada, tocada }) => new Function(
    'sesionInicio', 'exList',
    sinC(fn('function hayRastroDeEntreno(){')) + '; return hayRastroDeEntreno();'
  )(crono ? 1763300000000 : null, {
    querySelector: (sel) => {
      if (sel === '.set-check.done') return marcada ? {} : null;
      if (sel === '.exercise-card[data-tocado]') return tocada ? {} : null;
      return null;
    },
  });

  ok(mirar({ crono: true }) === true, 'el cronómetro corriendo basta',
     'arranca al marcar la primera serie o al poner un descanso: si corre, ' +
     'esa persona hizo algo');
  ok(mirar({ marcada: true }) === true, 'una serie marcada basta');
  ok(mirar({ tocada: true }) === true, 'y haber tocado un peso o unas reps también',
     'quien corrige el peso de la primera serie está entrenando, aunque no ' +
     'marque nada');

  // EL CASO DEL FALLO: se abre la rutina y se le da a guardar.
  ok(mirar({}) === false, 'sin ninguna de las tres, no hay rastro',
     'lo que hay en pantalla es la rutina tal y como vino rellenada: lo que ' +
     'esa persona PIENSA hacer');
}

console.log('\nY entonces se pregunta, no se bloquea');
{
  const i = LIMPIO.indexOf("document.getElementById('saveSessionBtn').addEventListener");
  const cuerpo = LIMPIO.slice(i, i + 700);

  ok(/if\(!hayRastroDeEntreno\(\)\)/.test(cuerpo), 'el botón lo mira antes de guardar');
  ok(/sesionVaciaSheet\.classList\.add\('open'\); return;/.test(cuerpo),
     'y abre la pregunta en vez de guardar');

  // ANTES DEL CANDADO. `guardarSesionAhora` pone `guardandoSesion = true` y
  // lo suelta al terminar: si la pregunta saliera después, «Todavía no»
  // dejaría el candado puesto y el botón muerto hasta reabrir la app.
  ok(cuerpo.indexOf('hayRastroDeEntreno') < cuerpo.indexOf('guardarSesionAhora'),
     'y la pregunta va antes de tocar el candado',
     'después, decir «todavía no» dejaría «Guardar sesión» muerto sin aviso');

  ok(/id="sesionVaciaOk"/.test(HTML) && /id="sesionVaciaNo"/.test(HTML),
     'la hoja tiene sus dos botones');
  ok(/Sí, guardar/.test(HTML) && /Todavía no/.test(HTML),
     'y se puede seguir adelante: no se bloquea a nadie',
     'hay quien no usa palomitas ni cronómetro y hace su rutina exacta sin ' +
     'cambiar un número');
  ok(/no marcaste ninguna serie/i.test(HTML) && /cronómetro no ha corrido/i.test(HTML),
     'y la pregunta dice POR QUÉ sale',
     'un «¿seguro?» a secas no deja decidir nada');
  ok(/rutina entera como si la hubieras hecho/i.test(HTML),
     'y qué pasa si se dice que sí');
}

console.log('\nY el cierre solo de las dos horas NO pregunta');
{
  // Salta sin nadie delante: una hoja esperando un toque que nunca llega
  // perdería el entrenamiento entero.
  const solo = fn('function cerrarSesionSola(seg){');
  ok(/guardarSesionAhora\(/.test(solo), 'guarda directo');
  ok(!/sesionVacia/.test(solo), 'sin pasar por la pregunta',
     'a las dos horas no hay nadie mirando el teléfono');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
