// La tecla de retorno mandaba el mensaje a medio escribir.
//
// El código decía «Enter manda; Shift+Enter hace salto de línea, como en
// cualquier chat». Como en cualquier chat DE ORDENADOR: EN UN TELÉFONO NO
// HAY SHIFT.
//
// Así que desde el móvil no había forma de hacer un salto de línea, y
// bastaba tocar la tecla de retorno para que se fuera lo que llevara
// escrito. Le pasó con una foto y dos letras —«Me»—, de un «Me comí la
// mitad» que nunca llegó a terminarse. La foto y media palabra salieron
// como mensaje, le costó una consulta de su tope, y eso no se recoge.
//
// Él lo contó así: «por qué se envió antes la foto y no me dejó escribir, y
// luego se mandó el mensaje cortado».
//
// DOS CAMINOS LLEVABAN AL MISMO SITIO, y los dos se cierran:
//
//  1. El dedo. Con `pointer: coarse` la tecla de retorno es retorno y manda
//     la flecha, que está al lado. Es como se manda en cualquier app del
//     teléfono.
//  2. El corrector. El retorno que acepta una sugerencia de un teclado que
//     compone llega al mismo sitio que uno de verdad, y mandaría la frase a
//     medias aunque haya teclado físico.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

// El manejador de verdad, con `matchMedia` y `enviarIA` de mentira. Se
// ejecuta: lo que importa es si manda o no, no cómo está escrito el `if`.
function tecla(evento, dedo) {
  const i = APP.indexOf("iaTexto.addEventListener('keydown'");
  if (i < 0) throw new Error('no encuentro el manejador del teclado');
  const fin = APP.indexOf('\n  });', i);
  const cuerpo = APP.slice(APP.indexOf('function(e){', i) + 'function(e){'.length, fin);

  let mandado = false, frenado = false;
  const e = Object.assign({ key: 'Enter', shiftKey: false, isComposing: false,
                            keyCode: 13, preventDefault: () => { frenado = true; } }, evento);
  new Function('e', 'conDedo', 'enviarIA',
    cuerpo)(e, dedo, () => { mandado = true; });
  return { mandado, frenado };
}

// ------------------------------------------------------------------
console.log('\nCon el dedo, el retorno es retorno');
{
  const r = tecla({}, true);
  ok(r.mandado === false, 'tocar retorno en el móvil NO manda el mensaje',
     'es lo que mandó una foto con «Me» de un «Me comí la mitad»');
  ok(r.frenado === false, 'y la tecla hace lo suyo: salto de línea',
     'frenarla sin mandar deja a esa persona sin poder escribir dos líneas, ' +
     'que es el otro lado del mismo fallo');
}

// ------------------------------------------------------------------
console.log('\nY con teclado de verdad sigue siendo un atajo');
{
  const r = tecla({}, false);
  ok(r.mandado === true, 'Enter manda');
  ok(r.frenado === true, 'y no deja además un salto de línea suelto');

  ok(tecla({ shiftKey: true }, false).mandado === false,
     'Shift+Enter no manda, hace salto de línea');
  ok(tecla({ key: 'a' }, false).mandado === false, 'y cualquier otra tecla no manda');
  ok(tecla({ key: 'a' }, true).mandado === false, 'tampoco con el dedo');
}

// ------------------------------------------------------------------
console.log('\nY el corrector no manda por su cuenta');
{
  // El retorno que acepta una sugerencia llega aquí igual que uno de verdad.
  ok(tecla({ isComposing: true }, false).mandado === false,
     'mientras se compone, Enter no manda',
     'aceptar una sugerencia del corrector mandaría la frase a medio ' +
     'escribir — el mismo fallo por el otro camino');
  ok(tecla({ keyCode: 229 }, false).mandado === false,
     'ni con el 229, que es como lo dicen los teclados viejos',
     '`isComposing` no está en todos: el 229 es el código que mandan los ' +
     'que no lo traen');
}

// ------------------------------------------------------------------
console.log('\nY el teclado del teléfono dibuja la tecla que es');
{
  ok(/id="iaTexto"[\s\S]{0,160}enterkeyhint="enter"/.test(HTML),
     'el campo pide una tecla de RETORNO, no una de enviar',
     'la que promete enviar y la que hace salto de línea no pueden ser la ' +
     'misma tecla');

  // Y que el dedo se decida por el PUNTERO y no por el ancho: hay teléfonos
  // anchos y ventanas estrechas, y lo que decide esto es con qué se escribe.
  ok(/matchMedia\('\(pointer: coarse\)'\)/.test(APP), 'el dedo se detecta por el puntero');
  ok(/try\{ conDedo = window\.matchMedia/.test(APP),
     'y si el navegador no sabe, no revienta',
     'sin el try, un navegador viejo sin `matchMedia` deja el chat sin ' +
     'poder escribir');
}

// ------------------------------------------------------------------
console.log('\nY la flecha sigue mandando siempre');
{
  ok(/getElementById\('iaEnviar'\)\.addEventListener\('click', function\(\)\{ enviarIA\(\); \}\)/.test(APP),
     'el botón de enviar manda',
     'si el retorno deja de mandar en el móvil y la flecha no manda, no ' +
     'queda forma de mandar nada');
}

// ------------------------------------------------------------------
console.log('\nY elegir una foto NO manda nada');
{
  // La otra mitad de lo que contó: «se envió antes la foto». La foto se
  // adjunta y espera; lo que la mandaba era el retorno.
  // CONTANDO PARÉNTESIS, no cortando en el primer `\n  });`: el manejador
  // lleva dentro una cadena de promesas con sus propios cierres, y la
  // ventana corta se quedaba antes del `IA_FOTOS.push`.
  // Y anclado en el `addEventListener`, no en el primer `iaArchivo` que
  // aparezca: el primero es el `.click()` que abre el selector, que no es
  // lo que se está mirando.
  const i = APP.indexOf("getElementById('iaArchivo').addEventListener('change'");
  let n = 0, j = APP.indexOf('(', APP.indexOf('addEventListener', i));
  for (; j < APP.length; j++) {
    if (APP[j] === '(') n++;
    else if (APP[j] === ')') { n--; if (!n) break; }
  }
  const h = APP.slice(i, j).replace(/^\s*\/\/.*$/gm, '');
  ok(i > 0, 'se encuentra el manejador de la foto');
  ok(!/enviarIA\(/.test(h), 'elegir una foto no manda el mensaje',
     'la foto se adjunta y espera a que esa persona acabe de escribir');
  ok(/IA_FOTOS\.push/.test(h) && /pintarFotoIA\(\)/.test(h),
     'se adjunta y se enseña');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
