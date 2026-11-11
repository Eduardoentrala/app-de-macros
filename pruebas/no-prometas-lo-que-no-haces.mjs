// «Cuéntame cómo te sientes y TE LO AJUSTO», dicho por quien no puede.
//
// El aviso del Diario enseñaba esa frase al modelo como ejemplo de qué
// escribir cuando el peso lleva dos semanas quieto. Y es mentira por dos
// sitios a la vez:
//
//   1. Durante semanas no había dónde contestar: solo un «Entendido». Eso
//      ya está —hay un botón de Contestar, ver al-coach-se-le-puede-
//      contestar—.
//   2. Pero aunque contestes, EL CHAT TIENE PROHIBIDO AJUSTAR NADA. Su
//      prompt lo dice con todas las letras: «NO LES CAMBIES LAS METAS, Y NO
//      PUEDES AUNQUE QUIERAS». Las calorías se deciden en el cierre de los
//      lunes.
//
// O sea que el camino completo era: te invita a hablar, contestas, y el
// coach te dice que no puede hacer lo que su propio mensaje prometía.
//
// LA REGLA QUE SE FIJA AQUÍ: lo que un aviso promete tiene que poder
// cumplirlo quien lo escribe. Pedir que te cuenten algo está bien; prometer
// a cambio una acción que no está en sus manos, no.
//
// Y hay una salida verdadera que sí se puede prometer: lo que se habla en
// el chat se guarda, y el cierre de los lunes lo lee. «Lo tengo en cuenta
// para el cierre» es cierto. «Te lo ajusto» no.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const FN = readFileSync(join(RAIZ, 'supabase', 'functions', 'asistente', 'index.ts'), 'utf8');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

function prompt(nombre) {
  const i = FN.indexOf('const ' + nombre + ' = `');
  if (i < 0) throw new Error('no encuentro ' + nombre);
  const desde = FN.indexOf('`', i) + 1;
  return FN.slice(desde, FN.indexOf('`.trim();', desde));
}

const AVISO = prompt('SISTEMA_AVISO');
const CHAT = prompt('SISTEMA_CHAT');
const plano = (s) => s.replace(/\s+/g, ' ');

// ------------------------------------------------------------------
console.log('\nLo que el chat NO puede hacer');
{
  // Si esto cambiara —si algún día el chat sí pudiera mover calorías—
  // media prueba sobra. Mientras no pueda, lo de abajo importa.
  ok(/NO LES CAMBIES LAS METAS/.test(CHAT),
     'el chat tiene prohibido mover las calorías',
     'si esto desaparece, revisar esta prueba entera: puede que ya no haga ' +
     'falta');
  ok(/CIERRE DE LOS LUNES/.test(plano(CHAT)),
     'y se decide en el cierre de los lunes');
}

// ------------------------------------------------------------------
console.log('\nY el aviso no promete hacerlo');
{
  // SOLO LOS EJEMPLOS, que son lo que el modelo copia. La regla de más
  // abajo cita la frase a propósito —«decía TE LO AJUSTO, y no puedes»— y
  // mirando el prompt entero esto se ponía rojo por el texto que explica
  // que está mal. Un aviso y su explicación no son lo mismo.
  const ejemplos = [...AVISO.matchAll(/Así:\s*"([^"]+)"/g)].map((m) => m[1]);
  ok(ejemplos.length >= 4, `se encuentran los ${ejemplos.length} ejemplos`,
     'si salen cero, cambió la forma de escribirlos y esto no mira nada');

  const malos = ejemplos.filter((t) => [
    /te lo ajusto/i,
    /te las (ajusto|subo|bajo|cambio|muevo)/i,
    /te lo (subo|bajo|cambio|muevo)/i,
    /(ajusto|cambio|muevo) tus (calorías|macros|metas)/i,
  ].some((re) => re.test(t)));
  ok(malos.length === 0,
     'ninguno promete un ajuste que el chat no puede hacer',
     'promete: ' + malos.join(' | ') +
     '\n         quien contestaba se encontraba con un «no puedo cambiarte ' +
     'las metas»');
}

// ------------------------------------------------------------------
console.log('\nY se le dice POR QUÉ, no solo que no');
{
  ok(/NO PROMETAS NADA QUE NO VAYAS A HACER/.test(AVISO),
     'la regla está escrita como regla');
  ok(/te lo ajusto/i.test(AVISO) || /TE LO AJUSTO/.test(AVISO),
     'con el ejemplo que falló, citado',
     'una regla sin el caso que la provocó se lee como manía de quien la ' +
     'escribió, y se ignora');
  ok(/prohibido/.test(plano(AVISO)),
     'y diciendo que no está en sus manos, no que quede feo');
}

// ------------------------------------------------------------------
console.log('\nY se le da la salida que SÍ es verdad');
{
  // EN LA LISTA DE LO QUE SÍ PUEDE DECIR, no en cualquier parte: el prompt
  // nombra el cierre de los lunes varias veces —también para decir que no
  // puede tocarlo— y mirando el texto entero, quitar la salida verdadera
  // pasaba sin que saltara nada.
  const iSi = AVISO.indexOf('Lo que SÍ es verdad');
  const salidas = iSi < 0 ? '' : plano(AVISO.slice(iSi, iSi + 500));
  ok(iSi > 0, 'hay una lista de lo que sí puede decir');
  ok(/cierre del lunes|cierre de los lunes/.test(salidas),
     'y ahí está lo del cierre del lunes',
     'quedó: ' + salidas.slice(0, 160));

  // Y ES VERDAD: lo que se habla en el chat se guarda, y el cierre lo lee.
  // Si un día dejara de leerlo, esta frase pasaría a ser otra promesa vacía.
  const SEM = FN.slice(FN.indexOf("if (accion === 'semana') {"),
                       FN.indexOf("if (accion === 'fotos')"));
  // Y QUE LO LEA DE VERDAD, no que la palabra aparezca por ahí: el bloque
  // la menciona también en comentarios. Lo que importa es el `select`.
  ok(/select\('[^']*memoria_ia[^']*'\)/.test(SEM),
     'y es cierto: el cierre lee lo que el chat guardó',
     'si el cierre dejara de leer la memoria, esta frase sería otra promesa ' +
     'vacía y habría que quitarla del aviso también');
  ok(/memoria_ia/.test(APP),
     'y el chat guarda lo que se habla');

  ok(/a mano en Perfil/.test(salidas),
     'y lo de cambiarlas a mano en Perfil');
  // Que esa puerta exista de verdad. Es la otra mitad del mismo fallo:
  // mandar a alguien a una pantalla donde no está lo que se le dijo.
  ok(/Metas de macros/.test(HTML) && /id="goalP"/.test(HTML),
     'y esa puerta existe: «Metas de macros» en Perfil',
     'mandar a alguien a una pantalla donde no está lo que buscaba es el ' +
     'mismo fallo con otro disfraz');
}

// ------------------------------------------------------------------
console.log('\nY pedir que te cuenten sigue valiendo, porque hay dónde');
{
  ok(/Cuéntame cómo te sientes/.test(plano(AVISO)),
     'el aviso sigue invitando a hablar');
  ok(/data-contesta/.test(APP) && /Contestar/.test(APP),
     'y hay un botón para hacerlo',
     'invitar sin puerta es justo lo que se arregló antes; quitar la ' +
     'invitación habría sido la solución perezosa');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
