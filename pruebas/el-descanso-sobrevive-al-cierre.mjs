// Cerrar la app a media serie se llevaba el descanso por delante.
//
// El cronómetro de la SESIÓN ya sobrevivía —guarda el instante de arranque
// en el teléfono—, así que al volver el tiempo de entrenamiento seguía
// corriendo. El del DESCANSO no: `finRest` vivía en memoria y nada más,
// así que la app se cerraba y el descanso desaparecía. Quedaba lo peor de
// los dos mundos: la mitad del gimnasio se acordaba y la otra mitad no.
//
// Y pasa de verdad: se entrena con el teléfono en el bolsillo, y el
// teléfono cierra apps cuando le da la gana.
//
// LO QUE SE GUARDA ES EL INSTANTE EN QUE TERMINA, no los segundos que
// faltan. Es la misma idea que el cronómetro de la sesión y por la misma
// razón: guardando segundos habría que descontarlos a mano, y nadie sabe
// cuánto estuvo la app cerrada. Con un instante no hay nada que descontar.
//
// LO DELICADO ES CUÁNDO NO ENSEÑAR NADA:
//
//   · Si el descanso TERMINÓ mientras la app estaba cerrada, no se abre la
//     barra ni suena nada. Avisar ahora es avisar de algo que pasó hace
//     rato: o ya volvió a la serie, o no.
//   · Y al recuperarlo no suena el tono de arranque. Ese tono dice «ya
//     empezó», y lo que pasó es justo lo contrario.

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

function sacar(cab) {
  const i = APP.indexOf(cab);
  if (i < 0) throw new Error('no encuentro: ' + cab);
  let n = 0, j = APP.indexOf('{', i);
  for (; j < APP.length; j++) {
    if (APP[j] === '{') n++;
    else if (APP[j] === '}') { n--; if (!n) return APP.slice(i, j + 1); }
  }
  throw new Error('llaves sin cerrar en ' + cab);
}

// La clave del almacén se LEE DEL FUENTE y no se copia aquí: copiada, un
// día alguien la renombra, el código empieza a guardar en otro sitio y esta
// prueba sigue en verde guardando y leyendo de la suya.
const CLAVE = (APP.match(/var CLAVE_DESCANSO = '[^']+';/) || [])[0];
if (!CLAVE) throw new Error('no encuentro CLAVE_DESCANSO en app.js');

// El gimnasio de mentira. Lleva el reloj a mano —`avanzar(n)` es «pasaron n
// segundos con la app cerrada»— y las funciones de verdad del fuente: las
// cuatro del guardado y `startRest` entera, para que el `callado` se pruebe
// ejecutándolo y no leyéndolo.
//
// CADA CASO CON SU GIMNASIO NUEVO. Compartir el cierre arrastra `finRest` y
// `paused` de una comprobación a la siguiente, y entonces pasan o fallan por
// lo que hizo la de arriba.
function gimnasio(guardado) {
  const caja = { v: guardado === undefined ? null : guardado };
  const almacen = {
    getItem() { return caja.v; },
    setItem(k, v) { caja.v = v; },
    removeItem() { caja.v = null; },
  };
  const motor = new Function('almacen', 'arrancaEn', `
    var reloj = arrancaEn;
    var Date = { now: function(){ return reloj; } };
    var localStorage = almacen;
    var remaining = 0, ticking = null, paused = false, total = 0, finRest = 0;
    var DESCANSO_MAX = 900;
    ${CLAVE}
    var tonos = [], pintados = 0;
    var abierta = false, acabada = false;
    var restBar = { classList: {
      add: function(c){ if(c === 'open') abierta = true; if(c === 'done') acabada = true; },
      remove: function(c){ if(c === 'open') abierta = false; if(c === 'done') acabada = false; } } };
    var restPause = { textContent: '' };
    var restWho = { textContent: '' };
    function paintRest(){ pintados++; }
    function stopTick(){ ticking = null; }
    function tono(f){ tonos.push(f); }
    function setInterval(){ return 'vivo'; }
    ${sacar('function startRest(secs, label, callado){')}
    ${sacar('function guardarDescanso(){')}
    ${sacar('function olvidarDescanso(){')}
    ${sacar('function recuperarDescanso(){')}
    return {
      startRest: startRest,
      guardar: guardarDescanso,
      olvidar: olvidarDescanso,
      recuperar: recuperarDescanso,
      avanzar: function(seg){ reloj += seg * 1000; },
      pausar: function(){ paused = true; },
      mirar: function(){ return { remaining: remaining, total: total, paused: paused,
        abierta: abierta, acabada: acabada, ticking: ticking, tonos: tonos.slice(),
        quien: restWho.textContent, boton: restPause.textContent }; },
    };
  `)(almacen, 1_700_000_000_000);
  // Lo guardado se mira desde FUERA del cierre: dentro no se ve `caja`, y
  // leerlo por `localStorage.getItem` dentro sería leerlo con el mismo
  // código que lo escribe.
  motor.leer = () => { try { return JSON.parse(caja.v); } catch (e) { return caja.v; } };
  return motor;
}

// ------------------------------------------------------------------
console.log('\nSe guarda el INSTANTE en que termina, no los segundos');
{
  const g = gimnasio();
  g.startRest(180, 'Press banca, set 2');
  const fila = g.leer();
  ok(fila && fila.fin > 0, 'se guarda un instante',
     'salió: ' + JSON.stringify(fila));
  ok(fila && !('restan' in fila), 'y NO los segundos que faltan',
     'guardando segundos habría que descontar a mano el rato que la app ' +
     'estuvo cerrada, y eso no lo sabe nadie');
  ok(fila && fila.total === 180, 'y el descanso entero, para la barra',
     'sin el total la barra se llenaría contra lo que quedaba, no contra ' +
     'los tres minutos: volvería al 100% cada vez');
  ok(fila && fila.quien === 'Press banca, set 2', 'y de qué serie era');
}

console.log('\nY al volver se ha descontado el rato que estuvo cerrada');
{
  const g = gimnasio();
  g.startRest(180, 'Sentadilla, set 1');
  const guardado = g.leer();

  // Otro gimnasio: es LA APP RECIÉN ABIERTA, con la memoria en blanco.
  const otro = gimnasio(JSON.stringify(guardado));
  otro.avanzar(45);
  otro.recuperar();
  const v = otro.mirar();
  ok(v.remaining === 135, 'cuarenta y cinco segundos fuera, cuarenta y cinco menos',
     'salió ' + v.remaining + ': este es el fallo entero. El de la sesión ya ' +
     'lo hacía bien y este se reiniciaba');
  ok(v.abierta === true, 'y la barra vuelve a estar');
  ok(v.ticking === 'vivo', 'y contando');
  ok(v.total === 180, 'y la barra se llena contra el descanso entero',
     'salió ' + v.total);
  ok(v.quien === 'Sentadilla, set 1', 'y sigue sabiendo de qué serie era');
}

console.log('\nY no suena como si acabara de empezar');
{
  const g = gimnasio();
  g.startRest(180, 'x');
  ok(g.mirar().tonos.length === 1, 'pulsarlo sí suena',
     'el tono es lo que confirma que arrancó');

  const otro = gimnasio(JSON.stringify(g.leer()));
  otro.avanzar(20);
  otro.recuperar();
  ok(otro.mirar().tonos.length === 0, 'pero recuperarlo NO',
     'ese tono dice «ya empezó», y al recuperar pasó justo lo contrario: ' +
     'empezó hace rato y la app se enteró ahora');
}

// ------------------------------------------------------------------
console.log('\nSi se acabó con la app cerrada, no se enseña nada');
{
  const g = gimnasio();
  g.startRest(60, 'Remo, set 3');
  const otro = gimnasio(JSON.stringify(g.leer()));
  otro.avanzar(600);           // diez minutos después
  otro.recuperar();
  const v = otro.mirar();
  ok(v.abierta === false, 'la barra no se abre',
     'abrirla en verde diciendo «¡terminado!» es avisar de algo que pasó ' +
     'hace diez minutos: o ya volvió a la serie, o no');
  ok(v.tonos.length === 0, 'y no suena nada');
  ok(otro.leer() === null, 'y la marca se borra',
     'dejarla haría que el mismo descanso muerto se intentara recuperar en ' +
     'cada arranque');
}

console.log('\nPausado sigue pausado, y el tiempo parado no corre');
{
  const g = gimnasio();
  g.startRest(180, 'Peso muerto, set 2');
  g.avanzar(30);
  g.pausar();
  g.guardar();
  const fila = g.leer();
  ok(fila && fila.pausado === true, 'se guarda que estaba pausado');
  ok(fila && fila.restan > 0 && !('fin' in fila),
     'y con los segundos que quedaban, no con un instante',
     'pausado no hay instante de fin: eso es lo que significa pausar. ' +
     'Salió: ' + JSON.stringify(fila));

  const otro = gimnasio(JSON.stringify(fila));
  otro.avanzar(900);           // un cuarto de hora de app cerrada
  otro.recuperar();
  const v = otro.mirar();
  ok(v.paused === true, 'vuelve pausado');
  ok(v.remaining === fila.restan, 'y con lo mismo que tenía',
     'salió ' + v.remaining + ' contra ' + (fila && fila.restan) + ': si el ' +
     'tiempo pausado corriera, pausar no serviría de nada');
  ok(v.boton === 'Seguir', 'y el botón dice Seguir, no Pausar',
     'salió «' + v.boton + '»: decir Pausar sobre algo ya pausado es pedir ' +
     'que se toque dos veces para reanudar');
  ok(v.total === 180, 'y la barra, contra el descanso entero');
}

// ------------------------------------------------------------------
console.log('\nY lo que no se entiende se tira, sin reventar');
{
  for (const [malo, que] of [
    ['no es json', 'un texto cualquiera'],
    ['null', 'nada guardado'],
    ['{}', 'una marca vacía'],
    ['{"fin":0,"total":180}', 'sin instante de fin'],
    ['{"total":0,"fin":1}', 'sin descanso que recuperar'],
    ['{"pausado":true,"total":180}', 'pausado sin segundos'],
    // SIN TOTAL PERO CON UN FIN QUE TODAVÍA NO HA LLEGADO. Es el caso que
    // de verdad prueba el guardia del total: los de arriba se caen antes
    // por el fin. Sin total la barra se llena contra cero y se queda vacía
    // los tres minutos, que es peor que no enseñarla.
    [`{"fin":${1_700_000_000_000 + 60_000}}`, 'un fin bueno pero sin total'],
    ['{"pausado":true,"restan":60}', 'pausado con segundos pero sin total'],
  ]) {
    const g = gimnasio(malo);
    let reventó = false;
    try { g.recuperar(); } catch (e) { reventó = true; }
    ok(!reventó && g.mirar().abierta === false, 'con ' + que + ', nada',
       reventó ? 'reventó' : 'abrió la barra');
  }

  // Un fin más lejos de lo que puede durar un descanso es un reloj movido,
  // no un descanso larguísimo: el tope de la pantalla son quince minutos.
  const g = gimnasio('{"fin":' + (1_700_000_000_000 + 3_600_000) + ',"total":180}');
  g.recuperar();
  ok(g.mirar().abierta === false, 'y con un fin dentro de una hora, tampoco',
     'el descanso más largo que deja poner la pantalla son 900 s; una hora ' +
     'es un reloj que se movió, y dejaría la barra puesta sesenta minutos');
  ok(g.leer() === null, 'y se borra la marca');
}

// ------------------------------------------------------------------
console.log('\nY se olvida cuando deja de haber descanso');
{
  const fin = sacar('function terminarRest(){');
  ok(/olvidarDescanso\(\)/.test(fin), 'al terminarse',
     'si no, al abrir la app se intentaría recuperar un descanso ya cumplido');
  const cerrar = sacar("document.getElementById('restClose').addEventListener('click', function(){");
  ok(/olvidarDescanso\(\)/.test(cerrar), 'y al cerrarlo a mano',
     'cerrarlo es decir que ya no hay descanso; volver a verlo al abrir la ' +
     'app sería deshacer lo que la persona acaba de hacer');
}

console.log('\nY se vuelve a guardar cada vez que cambia el reloj');
{
  const mas = sacar("document.getElementById('restPlus').addEventListener('click', function(){");
  ok(/guardarDescanso\(\)/.test(mas), 'con los +30 s',
     'sin esto se recuperaría el fin de antes y los treinta segundos se ' +
     'perderían al cerrar la app');
  const pausa = sacar("restPause.addEventListener('click', function(){");
  ok(/guardarDescanso\(\)/.test(pausa), 'y al pausar o seguir',
     'es lo que cambia entre guardar un instante y guardar los segundos');
}

console.log('\nY se recupera donde `DESCANSO_MAX` ya existe');
{
  // `recuperarDescanso` compara contra `DESCANSO_MAX`, que se declara MÁS
  // ABAJO que el cronómetro. Llamarlo antes lo compararía contra
  // `undefined`: toda comparación sale falsa y se tira cualquier descanso.
  const iTope = APP.indexOf('var DESCANSO_MIN = ');
  const iLlamada = APP.indexOf('\n  recuperarDescanso();');
  ok(iTope > 0 && iLlamada > iTope, 'la llamada va después del tope',
     'tope en ' + iTope + ', llamada en ' + iLlamada);
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
