// El coach preguntaba y no había dónde responderle.
//
// El aviso del Diario decía cosas como «cuéntame cómo te sientes y le
// movemos tantito para destrabarlo», y el único botón era «Entendido». Él
// lo dijo mejor que nadie: «¿a quién le digo, cómo le digo?».
//
// Una pregunta sin dónde responder es peor que no preguntar: promete una
// conversación y deja a esa persona buscando la puerta. Y la puerta existía
// —el asistente— pero no desde ahí, y sin lo que le acababan de decir, así
// que había que repetírselo todo para que supiera de qué se hablaba.
//
// Y EL OTRO LADO DE LA MISMA PANTALLA: «Tu coach de Macros», en Mis
// semanas, se cortaba a media frase. Ese texto es el razonamiento del
// cierre, y nació con un tope de 500 de cuando no se enseñaba. Se vio en su
// pantalla, cortado en «El margen está en la…», justo donde decía lo único
// que quería saber. Nadie le había dicho al modelo que había un tope: un
// tope del que solo se entera un lado es un tope que siempre se pasa.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');
const CSS = readFileSync(join(RAIZ, 'docs', 'estilos', 'diario.css'), 'utf8');
const FN = readFileSync(join(RAIZ, 'supabase', 'functions', 'asistente', 'index.ts'), 'utf8');
const MIG = readFileSync(
  join(RAIZ, 'supabase', 'migrations', '0066_el_coach_cabe_entero.sql'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

const sinComentarios = (s) => s.replace(/^\s*\/\/.*$/gm, '');

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

// ------------------------------------------------------------------
console.log('\nEl aviso tiene dónde contestar');
{
  // SE EJECUTA: lo que importa es el HTML que acaba en la pantalla.
  let puesto = '';
  const caja = {
    hidden: true,
    set innerHTML(v) { puesto = v; },
    get innerHTML() { return puesto; },
  };
  const pintar = new Function('document', 'escapar',
    sacar('function pintarAvisoCoach(') + '; return pintarAvisoCoach;')(
    { getElementById: () => caja }, (s) => String(s));

  pintar('Cuéntame cómo te sientes y le movemos tantito.', 'a1');
  ok(/data-contesta="a1"/.test(puesto), 'hay un botón de contestar');
  ok(/Contestar/.test(puesto), 'y dice Contestar');
  ok(/data-visto="a1"/.test(puesto), 'y sigue estando el de Entendido',
     'cerrar un aviso tiene que seguir siendo posible');
  ok(puesto.indexOf('Contestar') < puesto.indexOf('Entendido'),
     'y contestar va PRIMERO',
     'la respuesta es la acción principal; «Entendido» es la salida, y la ' +
     'salida no puede ser lo primero que cae bajo el pulgar');

  // Sin aviso no se pinta una tarjeta vacía con dos botones.
  pintar(null);
  ok(puesto === '' && caja.hidden === true, 'y sin aviso no queda nada en pantalla');
}

// ------------------------------------------------------------------
console.log('\nY contestar abre el chat SABIENDO qué le dijeron');
{
  // SE EJECUTA. Mirando el texto, quitar el `if(!yaEsta)` dejaba la línea
  // del `some` en su sitio y la comprobación seguía verde con el mensaje
  // duplicándose. Pasó al mutarlo.
  const c = sinComentarios(sacar('function contestarAviso('));
  const correr = (msgs, texto) => {
    const abierto = [];
    new Function('IA_MSGS', 'pintarChat', 'pintarFotoIA', 'goto', 'setTimeout',
      'iaTexto', 'texto',
      c + '; contestarAviso(texto);')(
      msgs, () => {}, () => {}, (v) => abierto.push(v), () => {},
      { focus: () => {} }, texto);
    return abierto;
  };

  const msgs = [];
  const ido = correr(msgs, 'Cuéntame cómo te sientes.');
  ok(msgs.length === 1 && msgs[0].rol === 'el',
     'lo que le dijo el coach entra en la conversación',
     'sin eso hay que repetírselo todo para que sepa de qué se habla');
  ok(msgs[0] && msgs[0].texto === 'Cuéntame cómo te sientes.', 'con su texto');

  correr(msgs, 'Cuéntame cómo te sientes.');
  ok(msgs.length === 1, 'y dos toques no lo dejan dos veces',
     'quedaron ' + msgs.length);
  correr(msgs, 'Otra cosa distinta.');
  ok(msgs.length === 2, 'pero un aviso distinto sí entra');

  ok(ido.includes('asistente'), 'se abre el asistente');
  ok(/iaTexto\.focus\(\)/.test(c), 'con el teclado listo');

  // Y entra como historial de verdad: el chat manda `IA_MSGS` al servidor,
  // así que el modelo ve su propia frase y la respuesta tiene sentido.
  ok(/mensajes: IA_MSGS/.test(APP),
     'y el chat manda la conversación al servidor',
     'es lo que hace que el modelo sepa qué preguntó');
}

// ------------------------------------------------------------------
console.log('\nY contestar NO lo marca como visto');
{
  // Anclado en SU caja y no en el primer `caja.addEventListener` que
  // aparezca: hay varias en el fichero y la primera no es esta.
  const iCaja = APP.indexOf("var caja = document.getElementById('avisoCoach');");
  const i = APP.indexOf("caja.addEventListener('click'", iCaja);
  const h = sinComentarios(APP.slice(i, APP.indexOf('\n  })();', i)));
  const iContesta = h.indexOf('data-contesta');
  const iVisto = h.indexOf('data-visto');
  ok(iContesta > 0 && iVisto > iContesta, 'contestar se mira antes');
  ok(/contestarAviso\([\s\S]{0,60}\);\s*return;/.test(h),
     'y sale sin seguir al de visto',
     'si al abrir el chat el aviso desapareciera y luego cerrara sin ' +
     'escribir, se habría quedado sin la pregunta y sin saber que la hubo');
  ok(/method: 'PATCH'/.test(h), 'y «Entendido» sí lo marca, como siempre');
}

// ------------------------------------------------------------------
console.log('\nY los dos botones se pueden tocar');
{
  ok(/\.aviso-coach \.aviso-botones\{/.test(CSS), 'van en una fila');
  ok(/\.aviso-coach button::after\{[\s\S]{0,180}min-width:44px/.test(CSS),
     'y cada uno tiene su área de dedo',
     'dos botones de doce píxeles juntos se tocan el que no es');
  ok(/\.aviso-coach \.aviso-contestar\{ color:var\(--ink\); \}/.test(CSS),
     'y contestar se ve más que la salida');
}

// ------------------------------------------------------------------
console.log('\nY el razonamiento del coach cabe entero');
{
  ok(/maxLength: 700/.test(FN),
     'el modelo sabe cuánto tiene',
     'escribía lo que hacía falta y la app cortaba al guardar: un tope del ' +
     'que solo se entera un lado es un tope que siempre se pasa');
  ok(/recortarTexto\(r\.motivo, 1000\)/.test(APP),
     'y la app guarda hasta donde la base acepta');
  ok(/length\(motivo\) <= 1000/.test(MIG), 'y la base acepta mil');

  // El recorte se queda: es la última red. Lo que no puede es morder a los
  // 500 cuando caben mil.
  ok(!/recortarTexto\(r\.motivo, 500\)/.test(APP), 'y ya no se corta en 500');

  // Y los tres números tienen que ir en el mismo sentido. Si el prompt
  // pidiera más de lo que acepta la base, volveríamos al principio por otro
  // camino: el modelo obedeciendo y Postgres rechazando la fila entera.
  const pide = Number((FN.match(/maxLength: (\d+)/) || [])[1]);
  const guarda = Number((APP.match(/recortarTexto\(r\.motivo, (\d+)\)/) || [])[1]);
  const acepta = Number((MIG.match(/length\(motivo\) <= (\d+)/) || [])[1]);
  ok(pide <= guarda && guarda <= acepta,
     `el prompt pide ${pide}, la app guarda ${guarda} y la base acepta ${acepta}`,
     'en ese orden o no sirve de nada');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
