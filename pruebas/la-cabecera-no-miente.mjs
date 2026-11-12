// La cabecera del asistente decía dos cosas, y las dos eran falsas.
//
// Decía «hace tres cosas: chat, apuntar, plan». `apuntar` no existe como
// acción —nunca llegó, o se fue— y faltaban cuatro de las que sí: semana,
// fotos, aviso, cumple, cliente.
//
// Y decía esto otro, que es lo grave:
//
//     «Lo que NO hace: escribir en la base. Devuelve una propuesta y la
//      app la guarda por el camino de siempre, con RLS. Así esta función
//      no necesita permisos de escritura y no puede saltarse ninguna
//      regla.»
//
// La función tiene la clave de servicio, que SE SALTA RLS POR DISEÑO, y
// escribe en tres tablas. Un comentario viejo sobre estilo hace perder un
// minuto; un comentario viejo que dice «esto no puede saltarse ninguna
// regla» hace que alguien razone sobre la seguridad al revés y se quede
// tan tranquilo.
//
// En este proyecto los comentarios son el sitio donde está escrito POR QUÉ
// las cosas son como son, así que un comentario que miente no es un
// detalle: es documentación rota. Esta prueba no lee prosa, compara listas:
// las acciones que la cabecera dice contra las que el código atiende, y las
// tablas que la cabecera dice escribir contra las que escribe.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const FN = readFileSync(join(RAIZ, 'supabase', 'functions', 'asistente', 'index.ts'), 'utf8');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};
const iguales = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const lista = (s) => [...new Set(s)].sort();

// La cabecera es el comentario de arriba del todo, hasta la primera línea
// que no empieza por `//`. Delimitarla así y no por número de líneas: el
// comentario crece.
const CABECERA = FN.slice(0, FN.search(/^(?!\/\/|\s*$)/m));

// ------------------------------------------------------------------
console.log('\nLas acciones que dice son las que hay');
{
  // Las que el código ATIENDE de verdad.
  const reales = lista([...FN.matchAll(/accion === '([a-z_]+)'/g)].map((m) => m[1]));
  // Las que la cabecera ANUNCIA: líneas «//    nombre → ...».
  const dichas = lista([...CABECERA.matchAll(/^\/\/ {3,}([a-z_]+) +→/gm)].map((m) => m[1]));

  ok(reales.length >= 5, 'se encuentran las acciones del código', reales.join(' '));
  ok(dichas.length >= 5, 'y la lista de la cabecera', dichas.join(' '));
  ok(iguales(reales, dichas),
     'y son exactamente las mismas: ' + reales.join(', '),
     'cabecera: ' + dichas.join(' ') + '\n         código:   ' + reales.join(' ') +
     '\n         sobra en la cabecera: ' + dichas.filter((x) => !reales.includes(x)).join(' ') +
     '\n         falta en la cabecera: ' + reales.filter((x) => !dichas.includes(x)).join(' '));

  // Y la app no manda ninguna que la función no conozca. Mandarla cuesta
  // una llamada y devuelve un error que nadie entiende.
  const manda = lista([...APP.matchAll(/accion: '([a-z_]+)'/g)].map((m) => m[1]));
  ok(manda.every((a) => reales.includes(a)),
     'y la app no pide ninguna que no exista',
     'pide y no existe: ' + manda.filter((a) => !reales.includes(a)).join(' '));
}

// ------------------------------------------------------------------
console.log('\nY lo que dice que escribe es lo que escribe');
{
  // Lo que ESCRIBE de verdad: `.from('tabla')` seguido de insert/upsert/
  // update/delete. Se mira la llamada entera, no la línea, porque van
  // partidas en varias.
  const escribe = lista([...FN.matchAll(
    /\.from\('([a-z_]+)'\)\s*(?:\r?\n\s*)?\.(insert|upsert|update|delete)\(/g)]
    .map((m) => m[1]));
  // Lo que la cabecera dice escribir: líneas «//      · `tabla` — ...».
  const dichas = lista([...CABECERA.matchAll(/^\/\/ +· +`([a-z_]+)`/gm)].map((m) => m[1]));

  ok(escribe.length > 0, 'la función sí escribe, y se ve dónde', escribe.join(' '));
  ok(iguales(escribe, dichas),
     'y la cabecera las nombra todas: ' + escribe.join(', '),
     'cabecera: ' + dichas.join(' ') + '\n         código:   ' + escribe.join(' ') +
     '\n         escribe y no lo dice: ' + escribe.filter((x) => !dichas.includes(x)).join(' ') +
     '\n         lo dice y no escribe: ' + dichas.filter((x) => !escribe.includes(x)).join(' '));
}

// ------------------------------------------------------------------
console.log('\nY se avisa de lo que de verdad hay que saber');
{
  // La prosa se aplana antes de mirarla: sin las barras y con los saltos
  // convertidos en espacios. Buscando línea a línea, «que SE / SALTA RLS»
  // —partido por el ancho del comentario— no aparecía, y la comprobación
  // decía que faltaba algo que estaba escrito.
  const prosa = CABECERA.replace(/^\/\//gm, ' ').replace(/\s+/g, ' ');

  ok(/se salta RLS/i.test(prosa),
     'se dice que la clave de servicio se salta RLS',
     'es lo primero que hay que saber antes de tocar este fichero. ' +
     'La cabecera llegó a decir lo contrario —«no puede saltarse ninguna ' +
     'regla»— y eso hace razonar sobre la seguridad al revés');
  ok(/clave de servicio|SERVICE_ROLE/i.test(prosa),
     'y se dice que la tiene');
  // Lo que de verdad protege, que es lo que sí era cierto de aquella
  // frase: los datos de la persona no los escribe la función.
  ok(/NO escribe los datos de la persona/i.test(prosa),
     'y lo que sigue siendo verdad: los datos de la persona los guarda la app',
     'es la mitad buena de la frase vieja y no se puede perder al corregirla');

  // Lo que sigue siendo verdad y es lo que de verdad protege, así que
  // tiene que seguir siéndolo: los datos de la persona los guarda la app.
  ok(/const userId = quien\.user\.id;/.test(FN),
     'la identidad sale del token verificado');
  ok(/admin\.auth\.getUser\(auth\.slice\(7\)\)/.test(FN),
     'y el token se comprueba contra el servidor, no se cree');

  // Y ninguna escritura usa un id que venga del cuerpo de la petición.
  const cuerpos = [...FN.matchAll(/user_id: ([A-Za-z0-9_.?]+)/g)].map((m) => m[1]);
  ok(cuerpos.length > 0 && cuerpos.every((v) => v === 'userId'),
     'y todas las escrituras van atadas a ese id, no a uno del cuerpo',
     'salieron: ' + [...new Set(cuerpos)].join(', '));
}

// ------------------------------------------------------------------
console.log('\nY al chat se le dicen tantas cosas como hace');
{
  // Decía «Haces tres cosas» y venían cuatro numeradas. La cuarta era la
  // recién añadida —decirle cómo va— o sea justo la que más riesgo tiene
  // de que el modelo la trate como un añadido.
  const i = FN.indexOf('const SISTEMA_CHAT = `');
  const chat = FN.slice(i, FN.indexOf('`.trim();', i));
  const cuantas = (chat.match(/^\d+\. [A-ZÁÉÍÓÚÑ]/gm) || []).length;
  const NUM = { 1:'una', 2:'dos', 3:'tres', 4:'cuatro', 5:'cinco', 6:'seis' };
  ok(new RegExp('Haces ' + NUM[cuantas] + ' cosas:').test(chat),
     'el prompt dice «' + NUM[cuantas] + '» y trae ' + cuantas + ' puntos',
     'dice: «' + (chat.match(/Haces \w+ cosas:/) || ['(nada)'])[0] + '» y hay ' +
     cuantas + ' numerados');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
