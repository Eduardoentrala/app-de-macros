// El chat se borraba entero en cada recarga.
//
//     var IA_MSGS = [];           // y nada más
//
// Ni una línea lo guardaba, ni en el teléfono ni en el servidor. Mientras
// la app siguiera abierta se podía cerrar el chat y volver a entrar; en
// cuanto se recargaba —y se recarga SOLA al cambiar el día— no quedaba
// nada.
//
// Y cada respuesta cuesta una consulta del tope diario. El 20 de noviembre
// gastó tres preguntando por su progreso, cerró, y al volver no estaban:
// volver a preguntar lo mismo se paga otra vez.
//
// LO QUE NO SE GUARDA, Y POR QUÉ. Esto es la mitad del diseño:
//
//   · LAS FOTOS. Son data-URL de cientos de KB, y `localStorage` es el
//     MISMO cajón donde espera la comida apuntada sin señal. Si el chat lo
//     llena, `colaGuardar` empieza a tirar apuntes de verdad. De los dos,
//     el que tiene que ceder es el chat. Queda la marca de que hubo foto.
//
//   · LAS PROPUESTAS DE COMIDA. Un «Desayuno» tocable sobre una propuesta
//     de hace dos días, restaurada tras una recarga, es una forma nueva de
//     meter comida en el día equivocado. Lo que se pidió es VER las
//     respuestas, no volver a actuar sobre ellas.
//
//   · LA BURBUJA DEL «…», que no es un mensaje.
//
// Y CON DUEÑO, por lo mismo que la despensa: una conversación lleva dentro
// su peso, sus dudas y lo que come. No se queda en un teléfono para la
// siguiente cuenta que entre.

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
  if (i < 0) return null;
  let n = 0;
  for (let j = LIMPIO.indexOf('{', i); j < LIMPIO.length; j++) {
    if (LIMPIO[j] === '{') n++;
    else if (LIMPIO[j] === '}') { n--; if (!n) return LIMPIO.slice(i, j + 1); }
  }
  return null;
}
function linea(trozo) {
  const l = LIMPIO.split('\n').find((x) => x.includes(trozo));
  if (!l) throw new Error('no encuentro la línea: ' + trozo);
  return l;
}

// ------------------------------------------------------------------
// Las dos funciones, EJECUTADAS, con un almacén de mentira. `cabenLetras`
// es cuánto acepta el teléfono: por encima de eso `setItem` revienta como
// el de verdad.
function montar({ guardado = null, dueno = 'u1', cabenLetras = 1e9 } = {}) {
  const caja = {};
  if (guardado !== null) caja['macros.chat'] = guardado;
  const almacen = {
    getItem: (k) => (k in caja ? caja[k] : null),
    setItem: (k, v) => {
      if (String(v).length > cabenLetras) {
        const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e;
      }
      caja[k] = String(v);
    },
    removeItem: (k) => { delete caja[k]; },
  };
  const IA_MSGS = [];
  // `HOY` a medianoche, como en la app. `isoDe` es la de verdad, copiada
  // del fichero: si cambiara la forma de escribir una fecha, esto tiene que
  // cambiar con ella.
  const api = new Function('localStorage', 'IA_MSGS', 'sesion', 'HOY', `
    ${sinC(fn('function isoDe(d){'))}
    ${linea("var CHAT_KEY = 'macros.chat';")}
    ${linea('var CHAT_TOPE =')}
    ${linea('var CHAT_LETRAS =')}
    ${sinC(fn('function guardarChat(){'))}
    ${sinC(fn('function cargarChat(){'))}
    return { guardarChat: guardarChat, cargarChat: cargarChat,
             TOPE: CHAT_TOPE, LETRAS: CHAT_LETRAS };
  `)(almacen, IA_MSGS, dueno ? { user: { id: dueno } } : null,
     (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })());
  return { ...api, IA_MSGS, caja, leido: () => (caja['macros.chat']
    ? JSON.parse(caja['macros.chat']) : null) };
}

// ------------------------------------------------------------------
console.log('\nLa conversación vuelve después de recargar');
{
  const a = montar();
  a.IA_MSGS.push({ rol: 'yo', texto: '¿Por qué voy tan lento?' });
  a.IA_MSGS.push({ rol: 'el', texto: 'Vas lento porque así se baja de verdad.' });
  a.guardarChat();
  ok(a.leido() !== null, 'se guarda algo', JSON.stringify(a.caja));

  // La recarga: otro arranque, el mismo teléfono.
  const b = montar({ guardado: a.caja['macros.chat'] });
  b.cargarChat();
  ok(b.IA_MSGS.length === 2, 'y vuelven los dos mensajes',
     JSON.stringify(b.IA_MSGS));
  ok(b.IA_MSGS[0].rol === 'yo' && /tan lento/.test(b.IA_MSGS[0].texto),
     'con su texto y quién lo dijo', JSON.stringify(b.IA_MSGS[0]));
  ok(b.IA_MSGS[1].rol === 'el', 'y la respuesta como suya');
}

// ------------------------------------------------------------------
console.log('\nPero las fotos NO: ese cajón lo comparte la comida sin subir');
{
  const a = montar();
  const gorda = 'data:image/webp;base64,' + 'A'.repeat(200000);
  a.IA_MSGS.push({ rol: 'yo', texto: '', foto: gorda });
  a.IA_MSGS.push({ rol: 'el', texto: 'Eso son unas 600 cal.' });
  a.guardarChat();

  const bruto = a.caja['macros.chat'] || '';
  ok(!bruto.includes('AAAA'), 'la foto no llega al teléfono',
     'ocupa ' + bruto.length + ' caracteres: una data-URL de 200 KB dentro ' +
     'del mismo\n         cajón donde espera la comida sin subir hace que ' +
     '`colaGuardar` empiece\n         a tirar apuntes de verdad');
  ok(bruto.length < 5000, 'y lo guardado es pequeño (' + bruto.length + ')');

  // PERO QUEDA LA MARCA. Sin ella, un mensaje que solo era una foto vuelve
  // como una burbuja vacía: un hueco en blanco en mitad de la charla.
  const b = montar({ guardado: a.caja['macros.chat'] });
  b.cargarChat();
  ok(b.IA_MSGS.length === 2, 'el mensaje de la foto no desaparece',
     JSON.stringify(b.IA_MSGS));
  ok(b.IA_MSGS[0].fotoIda === true, 'y queda marcado como que llevaba foto',
     JSON.stringify(b.IA_MSGS[0]) + '\n         sin esto vuelve sin texto y ' +
     'sin imagen: una burbuja vacía');
  ok(!b.IA_MSGS[0].foto, 'sin la foto, que no está');

  // Y LA PANTALLA LO PINTA. Es la otra mitad: la marca no sirve de nada si
  // `pintarChat` no la mira.
  const p = fn('function pintarChat(){');
  ok(p && /fotoIda/.test(p), 'y `pintarChat` sabe qué hacer con la marca',
     'si no, el mensaje vuelve a ser un hueco en blanco');
}

// ------------------------------------------------------------------
console.log('\nNi las propuestas de comida, ni el «…»');
{
  const a = montar();
  a.IA_MSGS.push({ rol: 'el', texto: 'Te propongo esto',
                   alimentos: [{ n: 'Arroz', P: 2, C: 28, G: 0.3, cant: 100 }] });
  a.IA_MSGS.push({ rol: 'el', texto: '…', pensando: true });
  a.guardarChat();

  const bruto = a.caja['macros.chat'] || '';
  ok(!/Arroz/.test(bruto), 'los alimentos propuestos no se guardan',
     'un «Desayuno» tocable sobre una propuesta de hace dos días mete comida ' +
     'en el\n         día equivocado. Guardado: ' + bruto);
  ok(!/pensando/.test(bruto), 'y la burbuja del «…» tampoco');

  const b = montar({ guardado: bruto });
  b.cargarChat();
  ok(b.IA_MSGS.length === 1, 'vuelve un solo mensaje, el de verdad',
     JSON.stringify(b.IA_MSGS));
  ok(!b.IA_MSGS[0].alimentos, 'y vuelve sin botones que tocar');
}

// ------------------------------------------------------------------
console.log('\nY es de quien la tuvo, no del teléfono');
{
  const a = montar({ dueno: 'u1' });
  a.IA_MSGS.push({ rol: 'yo', texto: 'Peso 82 kg y me cuesta bajar' });
  a.guardarChat();
  ok(a.leido().dueno === 'u1', 'se guarda con su dueño');

  // Entra otra cuenta en el mismo teléfono.
  const otra = montar({ guardado: a.caja['macros.chat'], dueno: 'u2' });
  otra.cargarChat();
  ok(otra.IA_MSGS.length === 0,
     'otra cuenta NO ve la conversación',
     'quedó: ' + JSON.stringify(otra.IA_MSGS) + '\n         ahí dentro va su ' +
     'peso, sus dudas y lo que come');

  // Y sin sesión tampoco se guarda nada.
  const sin = montar({ dueno: null });
  sin.IA_MSGS.push({ rol: 'yo', texto: 'hola' });
  sin.guardarChat();
  ok(sin.leido() === null, 'y sin sesión no se escribe nada');
}

// ------------------------------------------------------------------
console.log('\nY tiene tope, por número y por tamaño');
{
  const a = montar();
  for (let i = 0; i < 200; i++) a.IA_MSGS.push({ rol: 'el', texto: 'mensaje ' + i });
  a.guardarChat();
  const g = a.leido();
  ok(g.msgs.length === a.TOPE, `se queda con ${a.TOPE} mensajes de 200`,
     'salieron ' + g.msgs.length);
  ok(/199/.test(JSON.stringify(g.msgs)), 'y son los ÚLTIMOS, no los primeros',
     'lo viejo es lo que sobra: la charla de hoy es la que se quiere leer');

  // Y POR TAMAÑO, que el número de mensajes no dice nada del sitio que
  // ocupan. Cada uno se recorta a 2.000 letras, así que el tope de
  // mensajes permite hasta 40 × 2.000 = 80.000: por encima del techo. Con
  // mensajes cortos esto no se nota nunca, y por eso hay que probarlo con
  // los largos — la primera versión de esta comprobación usaba diez de
  // 10.000 y no podía disparar, porque el recorte los dejaba en 2.000.
  const b = montar();
  for (let i = 0; i < b.TOPE; i++) b.IA_MSGS.push({ rol: 'el', texto: 'x'.repeat(2000) });
  b.guardarChat();
  const bruto = b.caja['macros.chat'] || '';
  ok(b.TOPE * 2000 > b.LETRAS,
     'el tope de mensajes por sí solo permite pasarse del techo',
     b.TOPE + ' × 2.000 = ' + (b.TOPE * 2000) + ', y el techo es ' + b.LETRAS +
     '.\n         Si dejan de cruzarse, esta comprobación no prueba nada');
  ok(bruto.length <= b.LETRAS + 200,
     'y aun así nunca se pasa (' + bruto.length + ' ≤ ' + b.LETRAS + ')',
     'el cajón es el mismo donde espera la comida sin subir');
}

// ------------------------------------------------------------------
console.log('\nY si no cabe, el chat cede: no pelea con la comida sin subir');
{
  // El teléfono casi lleno. Lo que NO puede pasar es que el chat insista y
  // acabe echando de `localStorage` los apuntes que esperan señal.
  const a = montar({ cabenLetras: 300 });
  for (let i = 0; i < 20; i++) a.IA_MSGS.push({ rol: 'el', texto: 'mensaje largo ' + i });
  let reventó = false;
  try { a.guardarChat(); } catch (e) { reventó = true; }
  ok(!reventó, 'guardar no revienta cuando no hay sitio',
     'un throw aquí sube hasta `pintarChat` y deja la pantalla a medias');
  const bruto = a.caja['macros.chat'];
  ok(bruto === undefined || bruto.length <= 300,
     'y lo que queda escrito cabe, o no queda nada',
     'quedó: ' + JSON.stringify(bruto));

  // Y con sitio justo, se guarda lo que entre en vez de rendirse de golpe.
  const b = montar({ cabenLetras: 2000 });
  for (let i = 0; i < 60; i++) b.IA_MSGS.push({ rol: 'el', texto: 'hola ' + i });
  b.guardarChat();
  ok((b.caja['macros.chat'] || '').length <= 2000,
     'con sitio justo se guarda un trozo',
     'quedó: ' + (b.caja['macros.chat'] || '(nada)').slice(0, 120));
}

// ------------------------------------------------------------------
console.log('\nBorrar: existe, pregunta antes, y se lleva lo guardado');
{
  ok(/id="iaBorrar"/.test(HTML), 'hay un botón de borrar en la cabecera');
  const cab = HTML.slice(HTML.indexOf('<div class="ia-head">'),
                         HTML.indexOf('id="iaChat"'));
  ok(cab.includes('id="iaBorrar"'), 'y está dentro de la cabecera del chat', cab);

  // `.addEventListener` en el ancla: `iaBorrar` se nombra DOS veces —aquí y
  // en `pintarChat`, que lo esconde cuando no hay charla— y buscar solo el
  // id encuentra el otro.
  const i = LIMPIO.indexOf("document.getElementById('iaBorrar').addEventListener");
  ok(i > 0, 'y tiene manejador');
  const h = LIMPIO.slice(i, i + 700);
  ok(/preguntar\(/.test(h),
     'que PREGUNTA antes de borrar',
     'cada respuesta de ahí costó una consulta del tope diario y no vuelve: ' +
     'un toque\n         por error en la cabecera las borra para siempre');
  ok(/IA_MSGS\.length = 0|IA_MSGS\.length=0/.test(h), 'y vacía la conversación');

  // Y LO GUARDADO SE VA SOLO. `guardarChat` quita la clave cuando no queda
  // nada, así que no hay dos sitios que borrar y uno que se olvide.
  const a = montar();
  a.IA_MSGS.push({ rol: 'yo', texto: 'algo' });
  a.guardarChat();
  ok(a.leido() !== null, 'con mensajes, hay algo guardado');
  a.IA_MSGS.length = 0;
  a.guardarChat();
  ok(a.caja['macros.chat'] === undefined,
     'y al quedarse vacía, la clave se va del teléfono',
     'quedó: ' + JSON.stringify(a.caja['macros.chat']) +
     '\n         dejar un `{"msgs":[]}` ahí es basura que no dice nada');

  // Y SE VA AUNQUE LA SESIÓN YA NO VALGA. Se vio probándolo en el
  // navegador: con un token caducado la app pone `sesion` a null, y la
  // comprobación del dueño —que estaba ANTES— hacía que `guardarChat` se
  // fuera sin borrar nada. Resultado: «Borrar» limpiaba la pantalla, y al
  // volver a entrar la conversación reaparecía entera.
  //
  // Y es justo cuando más se toca ese botón: la app acaba de echarte.
  const sin = montar({
    guardado: JSON.stringify({ dueno: 'u1', msgs: [{ r: 'yo', t: 'algo', c: Date.now() }] }),
    dueno: null,
  });
  ok(sin.caja['macros.chat'] !== undefined, 'había algo guardado de antes');
  sin.guardarChat();                     // sin sesión y sin mensajes
  ok(sin.caja['macros.chat'] === undefined,
     'sin sesión, vaciar la conversación TAMBIÉN borra lo guardado',
     'quedó: ' + JSON.stringify(sin.caja['macros.chat']) +
     '\n         si no, lo borrado vuelve en cuanto esa persona entre otra vez');
}

// ------------------------------------------------------------------
console.log('\nSe guarda al pintar, y ANTES del return de la charla vacía');
{
  const p = fn('function pintarChat(){');
  ok(p && /guardarChat\(\)/.test(p),
     'pintar guarda: un solo sitio para los ocho que tocan la conversación',
     'enviar, contestar, el error, el aviso del coach y apuntar una ' +
     'propuesta\n         pasan todos por aquí');

  // EL ORDEN IMPORTA. `pintarChat` se va por un `return` temprano cuando no
  // hay mensajes, y por ahí se pasa justo al borrar: puesto al final, la
  // conversación se iría de la pantalla y seguiría guardada en el teléfono.
  const iG = p.indexOf('guardarChat()');
  const iR = p.indexOf('return;');
  ok(iG > 0 && iR > 0 && iG < iR,
     'y guarda ANTES del return de «no hay nada»',
     'al borrar se pasa por ese return: puesto después, la pantalla queda ' +
     'limpia\n         y el teléfono sigue con la conversación dentro');
}

// ------------------------------------------------------------------
console.log('\nLo de otro día se LEE, pero no viaja al modelo');
{
  // ESTO ES LO QUE MÁS PODÍA SALIR MAL. Dentro de la conversación guardada
  // hay frases del propio modelo con NÚMEROS: «pasaste de 82.5 a 82.1».
  // Restauradas y mandadas de vuelta, las lee como actuales y repite un
  // peso que ya no es — justo el fallo que esta app persigue en todos
  // lados. Sus números de hoy se los manda `progreso` en cada mensaje; lo
  // viejo solo puede estorbar.
  const ayer = Date.now() - 30 * 3600 * 1000;
  const guardado = JSON.stringify({ dueno: 'u1', msgs: [
    { r: 'el', t: 'Pasaste de 82.5 a 82.1 kg', c: ayer },
    { r: 'yo', t: '¿y hoy?', c: Date.now() },
  ]});
  const a = montar({ guardado });
  a.cargarChat();
  ok(a.IA_MSGS.length === 2, 'se restauran los dos', JSON.stringify(a.IA_MSGS));
  ok(a.IA_MSGS[0].viejo === true, 'el de ayer queda marcado como viejo',
     JSON.stringify(a.IA_MSGS[0]));
  ok(a.IA_MSGS[1].viejo === false, 'y el de hoy no',
     JSON.stringify(a.IA_MSGS[1]));

  // Sin fecha, viejo: el lado seguro. Es lo que habría en un teléfono con
  // algo guardado por una versión anterior.
  const b = montar({ guardado: JSON.stringify({ dueno: 'u1',
    msgs: [{ r: 'el', t: 'sin sello' }] }) });
  b.cargarChat();
  ok(b.IA_MSGS[0].viejo === true, 'y sin fecha también es viejo',
     JSON.stringify(b.IA_MSGS[0]));

  // Y EL ENVÍO LO RESPETA.
  const e = fn('function enviarIA(textoForzado){');
  ok(e && /!m\.pensando && !m\.viejo/.test(e),
     'el envío al modelo deja fuera lo viejo',
     'sin esto, la marca no sirve de nada: se guarda y se manda igual');

  // Y VOLVER A GUARDARLO NO LO REJUVENECE. Si al re-guardar se le pusiera
  // la hora de ahora, nunca llegaría a ser viejo.
  a.guardarChat();
  const reguardado = a.leido().msgs[0];
  ok(reguardado.c === ayer, 'y volver a guardarlo conserva su hora',
     'quedó ' + reguardado.c + ' y era ' + ayer);
}

// ------------------------------------------------------------------
console.log('\nNo se restaura dos veces, ni encima de lo escrito');
{
  // `cargarChat` lo llaman DOS sitios: el arranque y `cargarDatos()`, que
  // es por donde pasan entrar por el formulario, registrarse y volver de
  // una sesión caducada. Sin guarda, la conversación saldría duplicada.
  const guardado = JSON.stringify({ dueno: 'u1',
    msgs: [{ r: 'yo', t: 'hola', c: Date.now() }] });
  const a = montar({ guardado });
  a.cargarChat();
  a.cargarChat();
  ok(a.IA_MSGS.length === 1, 'dos llamadas restauran una sola vez',
     JSON.stringify(a.IA_MSGS.map((m) => m.texto)));

  // Y si ya hay algo escrito, no se le mete historia por debajo.
  const b = montar({ guardado });
  b.IA_MSGS.push({ rol: 'yo', texto: 'estoy escribiendo' });
  b.cargarChat();
  ok(b.IA_MSGS.length === 1 && b.IA_MSGS[0].texto === 'estoy escribiendo',
     'y con algo ya escrito no restaura nada',
     JSON.stringify(b.IA_MSGS.map((m) => m.texto)));

  // Y QUE DE VERDAD SE LLAME desde `cargarDatos`: quien entra por el
  // formulario NO recarga la app, así que el del arranque ya pasó sin
  // sesión y no restauró nada.
  const c = fn('function cargarDatos(){');
  ok(c && /cargarChat\(\)/.test(c),
     '`cargarDatos` la restaura también',
     'sin esto, entrar con correo y contraseña abre el chat vacío hasta la ' +
     'siguiente recarga');
}

// ------------------------------------------------------------------
console.log('\nY se va al cerrar sesión');
{
  const i = LIMPIO.indexOf("document.getElementById('cerrarSesion')");
  const h = LIMPIO.slice(i, i + 900);
  ok(/removeItem\(CHAT_KEY\)/.test(h),
     'cerrar sesión borra la conversación del teléfono',
     'va con la despensa y el plan, por lo mismo que ellos: no dejar lo de ' +
     'alguien\n         en un teléfono que puede no ser suyo');
  // Y las otras tres siguen yéndose: esto no las puede haber desplazado.
  ok(/removeItem\(DESPENSA_KEY\)/.test(h) && /removeItem\(PLAN_KEY\)/.test(h),
     'y las que ya se iban siguen yéndose');

  // Y DE LA MEMORIA TAMBIÉN. Esto ya fallaba antes de que se guardara nada:
  // salir NO recarga la app, así que `IA_MSGS` se quedaba entero y la
  // siguiente cuenta que entrara en este teléfono abría el chat y leía la
  // conversación de la anterior. Borrar solo del almacén no lo arregla: lo
  // que se ve en pantalla sale de la memoria.
  ok(/IA_MSGS\.length = 0/.test(h),
     'y la conversación se va también de la memoria',
     'salir no recarga la app: sin esto, la cuenta siguiente la lee entera');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
