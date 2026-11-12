// Contestabas al coach y la tarjeta seguía ahí preguntando lo mismo.
//
// Primero no había dónde contestar —solo «Entendido»— y se le puso un
// botón. Entonces él probó el camino entero: tocó Contestar, le escribió
// «siento que tengo antojos y pico entre comidas», recibió una respuesta
// buena… y preguntó lo único que quedaba por preguntar: «¿y ahora qué?».
//
// Porque no pasaba nada más. Se comprobó en su base: `avisos_sin_ver = 1`
// con la conversación ya hecha. El aviso seguía abierto en el Diario,
// repitiendo la misma pregunta que acababa de responder.
//
// SE CIERRA AL MANDAR, NO AL ABRIR. Es lo que lo hace verdad: abrir el chat
// y cerrarlo sin escribir no es haber contestado, y ahí la pregunta tiene
// que seguir esperando. Esa parte ya estaba bien y no se toca.
//
// Y SE DICE QUÉ PASÓ CON LO QUE CONTÓ, pero solo cuando de verdad pasó: el
// modelo devuelve `memoria` cuando guarda algo, y lo guardado es lo que el
// cierre del lunes lee. Sin esa señal, un «anotado» sería otra promesa sin
// puerta — que es justo el fallo del que viene toda esta historia.

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
console.log('\nSe recuerda DE QUÉ aviso se vino');
{
  const c = sinComentarios(sacar('function contestarAviso('));
  ok(/avisoEsperandoRespuesta = id \|\| null/.test(c), 'se guarda el aviso que se va a contestar');

  // EL ID Y NO UN `true`. Entre que abre el chat y escribe puede haber
  // llegado otro aviso, y cerraríamos el que no es.
  ok(/function contestarAviso\(texto, id\)/.test(c),
     'y se guarda su id, no un «sí»',
     'entre abrir el chat y escribir puede llegar otro aviso: con un ' +
     'booleano se cerraría el que no es');

  const i = APP.indexOf("c.dataset.contesta");
  ok(i > 0, 'y el botón se lo pasa',
     'sin esto el id llega vacío y no se cierra nada');
}

// ------------------------------------------------------------------
console.log('\nY se cierra al MANDAR, no al abrir');
{
  const env = sinComentarios(APP.slice(
    APP.indexOf('guardarMemoriaIA(r.memoria);'),
    APP.indexOf('guardarMemoriaIA(r.memoria);') + 1200));

  ok(/if\(avisoEsperandoRespuesta\)\{/.test(env),
     'al llegar la respuesta se mira si había un aviso pendiente');
  ok(/marcarAvisoVisto\(cualAviso\)/.test(env), 'y se da por contestado');
  ok(/avisoEsperandoRespuesta = null;/.test(env),
     'y se suelta, para que el siguiente mensaje no cierre otro aviso');

  // Y NO al pulsar Contestar: abrir y cerrar sin escribir no es contestar.
  const c = sinComentarios(sacar('function contestarAviso('));
  ok(!/marcarAvisoVisto/.test(c),
     'y abrir el chat NO lo cierra',
     'si desapareciera al abrir y luego cerrara sin escribir, se habría ' +
     'quedado sin la pregunta y sin saber que la hubo');
}

// ------------------------------------------------------------------
console.log('\nY «anotado» solo si de verdad se anotó');
{
  const env = APP.slice(APP.indexOf('if(avisoEsperandoRespuesta){'));
  const trozo = sinComentarios(env.slice(0, 600));
  ok(/if\(r\.memoria\)/.test(trozo),
     'el aviso de «anotado» depende de que el modelo guardara algo',
     '`r.memoria` es el modelo diciendo que lo guardó, y lo guardado es lo ' +
     'que el cierre del lunes lee');
  ok(/cierre del lunes/.test(trozo),
     'y dice dónde va a aparecer',
     '«anotado» a secas no dice nada: lo que cierra el círculo es saber ' +
     'cuándo sirve');

  // Y que eso sea verdad: lo que se guarda es lo que el cierre lee.
  ok(/guardarMemoriaIA\(r\.memoria\)/.test(APP), 'y se guarda de verdad');
}

// ------------------------------------------------------------------
console.log('\nY marcar visto es una sola función para los dos caminos');
{
  const m = sinComentarios(sacar('function marcarAvisoVisto('));
  ok(/pintarAvisoCoach\(null\)/.test(m), 'quita la tarjeta');
  ok(/method: 'PATCH'/.test(m) && /visto_en/.test(m), 'y lo marca en la base');
  ok(/if\(!id \|\| !sesion/.test(m),
     'y sin id o sin sesión no manda nada',
     'un PATCH a `id=eq.undefined` es una petición que no puede salir bien');

  const llaman = (APP.match(/marcarAvisoVisto\(/g) || []).length;
  ok(llaman >= 3, `la llaman desde ${llaman - 1} sitios`,
     'uno es «Entendido» y otro el chat: si solo hay uno, falta un camino');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
