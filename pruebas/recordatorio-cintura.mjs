// El recordatorio de la cintura: vuelve mañana hasta que te midas.
//
// LO QUE PASABA. La × guardaba el MES —'2026-08'— así que cerrarla callaba
// el aviso hasta septiembre. Y como el campo para apuntar la cintura solo
// aparece cuando toca, era fácil pasarse el mes entero sin medirse y sin
// que nada lo recordara. Cerrar un aviso es «hoy no», no «ya no».
//
// Ahora guarda el DÍA, igual que el peso: mañana vuelve, y pasado, hasta
// que se registre la medida. En cuanto se registra, quien lo apaga es
// `tocaMedirCintura()` —28 días— y no la ×.
//
// Esta prueba EJECUTA las dos funciones reales sacadas de app.js contra un
// almacenamiento y un calendario de mentira, y recorre los días uno a uno.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(AQUI, '..', 'docs', 'app.js'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q) => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q); }
};
function sacar(desde, hasta) {
  const i = APP.indexOf(desde);
  if (i < 0) return null;
  const j = APP.indexOf(hasta, i);
  return j < 0 ? null : APP.slice(i, j + hasta.length);
}

const fCiclo = sacar('  function cicloDeRecordatorio(cual){', '\n  }');
const fCallado = sacar('  function recordatorioCallado(cual){', '\n  }');
const fToca = sacar('  function tocaMedirCintura(){', '\n  }');
// Los 28 días, SACADOS DEL CÓDIGO y no escritos aquí. Con el número
// repetido en la prueba, cambiarlo en la app no rompía nada: la prueba
// seguía midiendo contra su propia copia.
const mDias = APP.match(/var DIAS_ENTRE_CINTURAS = (\d+);/);

// Y la línea que de verdad ejecuta la ×, sacada de su manejador. Escrita a
// mano aquí, quitarla de la app dejaba esta prueba en verde con la × muerta.
const lineaCerrar = (APP.match(
  /try\{ localStorage\.setItem\(CLAVE_REC \+ cual, cicloDeRecordatorio\(cual\)\); \}catch\(e2\)\{\}/
) || [])[0];

if (!fCiclo || !fCallado || !fToca || !mDias || !lineaCerrar) {
  console.log('  FALLA  no encuentro en app.js: ' + [
    !fCiclo && 'cicloDeRecordatorio', !fCallado && 'recordatorioCallado',
    !fToca && 'tocaMedirCintura', !mDias && 'DIAS_ENTRE_CINTURAS',
    !lineaCerrar && 'la línea que guarda el silencio de la ×',
  ].filter(Boolean).join(', '));
  process.exit(1);
}

// El mundo de mentira: un calendario que se puede mover y un almacenamiento
// en memoria. Todo lo demás es el código de verdad.
function montar() {
  const estado = { hoy: new Date('2026-08-22T00:00:00'), guardado: {}, cinturas: [] };
  const fns = new Function('estado', `
    var CLAVE_REC = 'rec.';
    var DIAS_ENTRE_CINTURAS = ${mDias[1]};
    var localStorage = {
      getItem: function(k){ return k in estado.guardado ? estado.guardado[k] : null; },
      setItem: function(k, v){ estado.guardado[k] = String(v); },
    };
    function isoDe(d){
      return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') +
             '-' + String(d.getDate()).padStart(2,'0');
    }
    function claveDeMisFotos(){ return 'semana'; }
    var HOY = estado.hoy, CINTURAS = estado.cinturas;
    ${fCiclo}
    ${fCallado}
    ${fToca}
    return {
      // La × de verdad: esta línea sale del manejador de app.js, no está
      // escrita aquí. Si alguien la quita de la app, la prueba no arranca.
      cerrar: function(){ HOY = estado.hoy; var cual = 'cintura'; ${lineaCerrar} },
      // Lo mismo que hace \`revisarRecordatorios\`: se ve si toca Y no está callado.
      sale: function(){ HOY = estado.hoy; CINTURAS = estado.cinturas;
                        return tocaMedirCintura() && !recordatorioCallado('cintura'); },
      ciclo: function(){ HOY = estado.hoy; return cicloDeRecordatorio('cintura'); },
    };
  `)(estado);
  return { estado, ...fns };
}
const diaMas = (m, n) => { m.estado.hoy = new Date(m.estado.hoy.getTime() + n * 86400000); };

// ------------------------------------------------------------------
console.log('\nLa × calla el aviso UN DÍA, no un mes');
{
  const m = montar();
  ok(/^\d{4}-\d{2}-\d{2}$/.test(m.ciclo()),
     'lo que guarda la × es un día completo (2026-08-22)');
  ok(!/^\d{4}-\d{2}$/.test(m.ciclo()),
     'y no un mes: eso es lo que la callaba hasta septiembre');
}

// ------------------------------------------------------------------
console.log('\nCerrarla hoy, y mañana vuelve');
{
  const m = montar();
  ok(m.sale() === true, 'nunca se ha medido: sale');
  m.cerrar();
  ok(m.sale() === false, 'se cierra con la ×: hoy ya no sale');

  diaMas(m, 1);
  ok(m.sale() === true, 'al día siguiente vuelve');
  m.cerrar();
  diaMas(m, 1);
  ok(m.sale() === true, 'se vuelve a cerrar y vuelve otra vez');

  // Y así todos los días, aunque se cierre siempre.
  let salioSiempre = true;
  for (let i = 0; i < 10; i++) { m.cerrar(); diaMas(m, 1); if (!m.sale()) salioSiempre = false; }
  ok(salioSiempre, 'y diez días seguidos cerrándola, vuelve los diez');
}

// ------------------------------------------------------------------
console.log('\nEn cuanto se mide, se calla sola');
{
  const m = montar();
  m.cerrar(); diaMas(m, 1);
  ok(m.sale() === true, 'venía saliendo');

  // Se registra la medida HOY.
  m.estado.cinturas.push({ fecha: '2026-08-23', cm: 84 });
  ok(m.sale() === false, 'se mide y desaparece, sin tener que cerrarla');

  diaMas(m, 1);
  ok(m.sale() === false, 'y al día siguiente tampoco sale');
  diaMas(m, 20);
  ok(m.sale() === false, 'ni tres semanas después');
}

// ------------------------------------------------------------------
console.log('\nY vuelve cuando toca de nuevo, a los 28 días');
{
  const m = montar();
  m.estado.cinturas.push({ fecha: '2026-08-22', cm: 84 });
  ok(m.sale() === false, 'recién medida, callada');

  diaMas(m, 27);
  ok(m.sale() === false, 'el día 27 todavía no');
  diaMas(m, 1);
  ok(m.sale() === true, 'el día 28 vuelve a salir');

  // Y ahí empieza otra vez: cerrar hoy, volver mañana.
  m.cerrar();
  ok(m.sale() === false, 'se puede cerrar');
  diaMas(m, 1);
  ok(m.sale() === true, 'y vuelve mañana, como la primera vez');
}

// ------------------------------------------------------------------
console.log('\nLo que ya estaba cerrado con el formato viejo');
{
  // Quien tenga guardado '2026-08' de antes no puede quedarse sin aviso: el
  // valor viejo no coincide con ningún día, así que sale. Al revés —que un
  // formato nuevo pareciera «callado»— sí sería un problema.
  const m = montar();
  m.estado.guardado['rec.cintura'] = '2026-08';
  ok(m.sale() === true, 'el silencio viejo, de un mes entero, ya no vale: sale');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
