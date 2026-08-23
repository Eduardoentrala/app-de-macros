// Salir de apuntar vuelve a HOY. Por TODAS las salidas.
//
// EL FALLO. Apuntar en otro día deja dos cosas puestas: DIA_APUNTE, que
// decide en qué día se escribe, y la lista de COMIDAS de ese día. Volvían a
// hoy al entrar de nuevo a apuntar y al salir con el botón de regresar,
// pero NO al salir por la barra de abajo, que es una salida como las otras.
//
// Y no es solo cosmético, porque el asistente también apunta comida y lo
// hace en `diaDeApunte()`. La secuencia era:
//
//   Diario -> + agregar -> se elige el miércoles -> se sale tocando una
//   pestaña de abajo -> se va al asistente -> "apuntar" en lo que propuso.
//
// Y esa comida se guardaba en el miércoles pasado, en silencio, contando
// para un día que ya estaba cerrado en la cabeza de la persona.

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

// ------------------------------------------------------------------
console.log('\nLo que hace volver a hoy, ejecutado');
{
  const i = APP.indexOf('  function volverAHoyElApunte(){');
  ok(i > 0, 'existe una sola función que lo hace');
  if (i > 0) {
    const trozo = APP.slice(i, APP.indexOf('\n  }', i) + 4);
    const visto = { pintado: 0, cargado: [] };
    const HOY = new Date(2026, 7, 22);
    const isoDe = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
                         '-' + String(d.getDate()).padStart(2, '0');
    const caja = new Function('HOY', 'isoDe', 'visto', `
      var DIA_APUNTE = null;
      function pintarSelectorDia(){ visto.pintado++; }
      function cargarComidasDelDia(d){ visto.cargado.push(isoDe(d)); }
      ${trozo}
      return {
        volver: volverAHoyElApunte,
        elegir: function(d){ DIA_APUNTE = d; },
        dia: function(){ return DIA_APUNTE; }
      };`)(HOY, isoDe, visto);

    caja.elegir(new Date(2026, 7, 19));
    const veniaDeOtro = caja.volver();
    ok(caja.dia() === null, 'se vuelve a hoy');
    ok(veniaDeOtro === true, 'y avisa de que venía de otro día');
    ok(visto.cargado.length === 1 && visto.cargado[0] === '2026-08-22',
       'se rehace la lista, que todavía tenía la del miércoles',
       'cargado: ' + JSON.stringify(visto.cargado));
    ok(visto.pintado === 1, 'y se repinta el selector');

    // Estando ya en hoy no hay nada que rehacer: pedir otra vez la lista es
    // una consulta de más cada vez que se toca una pestaña.
    const antes = visto.cargado.length;
    const otra = caja.volver();
    ok(otra === false && visto.cargado.length === antes,
       'estando ya en hoy no se vuelve a pedir la lista');
  }
}

// ------------------------------------------------------------------
console.log('\nY las tres salidas la llaman');
{
  const salidas = [
    ["entrar de nuevo a apuntar", "push.dataset.push === 'mealadd'"],
    ["el botón de regresar", "var backBtn = e.target.closest('[data-back]');"],
    ["la barra de abajo", "var tabbar = e.target.closest('[data-tabbar]');"],
  ];
  // Cada rama se mira hasta donde empieza la SIGUIENTE. Con una ventana de
  // tantos caracteres, quitarle la llamada al botón de regresar seguía
  // pasando: dentro caía la de la barra de abajo, que está diez líneas más
  // allá, y la prueba daba por buena una rama vacía.
  for (let n = 0; n < salidas.length; n++) {
    const [dicho, ancla] = salidas[n];
    const i = APP.indexOf(ancla);
    const sig = salidas[n + 1]
      ? APP.indexOf(salidas[n + 1][1])
      : APP.indexOf('// Diario Hoy/Semana toggle');
    ok(i > 0 && sig > i && /volverAHoyElApunte\(\)/.test(APP.slice(i, sig)),
       `${dicho} vuelve a hoy`);
  }
}

// ------------------------------------------------------------------
console.log('\nY nadie más toca el día por su cuenta');
{
  // Si el día se pone a null en cuatro sitios, el cuarto se queda sin la
  // recarga de la lista y vuelve el fallo por otro lado. Solo pueden hacerlo
  // la función que vuelve a hoy y el selector de fecha, que es quien lo
  // cambia a propósito.
  // Devolver el día a hoy solo puede hacerlo esa función. Las otras dos
  // escrituras que quedan no ponen "hoy": eligen un día (el selector) y
  // deshacen sobre el día en que se sumó (el guardado que falla), y las dos
  // van por un ternario.
  const aHoy = (APP.match(/DIA_APUNTE = null;/g) || []).length;
  ok(aHoy === 2,
     'nadie devuelve el día a hoy por su cuenta: solo la declaración y volverAHoyElApunte',
     'hay ' + aHoy + ' sitios que lo ponen a null a pelo');

  // Y lo que apunta comida usa el día, no HOY a secas: el asistente apunta
  // en la misma fecha que el diario.
  const i = APP.indexOf('  function sbAgregarAlimento(a, comida){');
  ok(/entry_date: isoDe\(diaDeApunte\(\)\)/.test(APP.slice(i, i + 1400)),
     'lo que se guarda lleva el día de apunte');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
