// El aviso del entrenador: de qué habla, y hasta cuándo.
//
// DOS FALLOS, Y LOS DOS SE VEN EN LA MISMA CAPTURA.
//
// EL PRIMERO: lo que el modelo recibía para escribirlo era UNA PALABRA.
// `motivo_de_aviso` mira los días apuntados, el peso de hace dos semanas y
// el último día con algo escrito —los mira para decidir—, pero al modelo le
// llegaba solo el resultado: «semana_buena». Con eso y la orden de escribir
// como un entrenador, lo que salió fue:
//
//     «Buena semana, se te notó parejo hasta el sábado.»
//
// No había ningún sábado en ningún dato. Se lo inventó porque no tenía otra
// cosa. Y el daño no es el detalle falso: quien lo lee entiende que la app
// le mira los días uno a uno, y la próxima vez que le diga algo de verdad
// ya no se lo va a creer.
//
// EL SEGUNDO: ese mismo texto estaba en pantalla el 13 Y el 19 de octubre.
// El aviso no caducaba —se quedaba hasta que alguien tocara «Entendido»— y
// mientras hubiera uno sin leer, `aviso_pendiente` se callaba, así que
// tampoco llegaba el siguiente. El 13, tres centímetros encima del aviso,
// el diario decía «1 de 7 días».
//
// LO QUE SE PRUEBA AQUÍ:
//   · Que los números lleguen al prompt, y que salgan de la base y no del
//     navegador.
//   · Que el prompt prohíba inventar lo que no está en ellos.
//   · Y que el aviso caduque solo, EJECUTANDO la función de la app contra
//     una red de mentira.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const FN = readFileSync(join(RAIZ, 'supabase', 'functions', 'asistente', 'index.ts'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

// Contando llaves, nunca ventanas de N caracteres: una ventana mide el
// tamaño del fichero y no lo que dice, y en este repo ya se han caído varias
// pruebas por crecer la función que vigilaban.
function sacarDe(texto, cabecera) {
  const i = texto.indexOf(cabecera);
  if (i < 0) return '';
  let n = 0, j = texto.indexOf('{', i);
  for (; j < texto.length; j++) {
    if (texto[j] === '{') n++;
    else if (texto[j] === '}') { n--; if (!n) return texto.slice(i, j + 1); }
  }
  return '';
}

// Un prompt entero: de su backtick de apertura al SIGUIENTE `const SISTEMA_`.
function prompt(nombre) {
  const i = FN.indexOf('const ' + nombre + ' = `');
  if (i < 0) return '';
  const desde = FN.indexOf('`', i) + 1;
  const sig = FN.indexOf('\nconst SISTEMA_', desde);
  const trozo = FN.slice(desde, sig < 0 ? FN.length : sig);
  const cierre = trozo.lastIndexOf('`');
  return cierre > 0 ? trozo.slice(0, cierre) : trozo;
}

// ------------------------------------------------------------------
console.log('\nEl modelo ya no escribe a ciegas');
{
  const aviso = sacarDe(FN, "if (accion === 'aviso') {");
  ok(aviso.length > 0, 'la acción existe');
  ok(/numerosDelAviso\(/.test(aviso), 'se piden los números');
  ok(/system: SISTEMA_AVISO[\s\S]{0,400}numeros/.test(aviso),
     'y van dentro del system, no a un lado',
     'calculados y no enviados es el mismo agujero de antes');

  // De la base, no del navegador. Lo que manda el teléfono se puede cambiar,
  // y un número inventado en boca del entrenador es peor que no decir nada.
  const deFuera = (aviso.match(/cuerpo\.\w+/g) || []).filter(c => c !== 'cuerpo.hoy' && c !== 'cuerpo.motivo');
  ok(deFuera.length === 0, 'y los números no vienen del navegador',
     'llega del cliente: ' + deFuera.join(', '));

  const nums = sacarDe(FN, 'async function numerosDelAviso(');
  ok(/diary_entries/.test(nums), 'se leen los días apuntados');
  ok(/weight_logs/.test(nums), 'y los pesos');
  ok(/\.eq\('user_id', userId\)/.test(nums), 'solo los suyos',
     'sin filtrar, el aviso hablaría de los números de otra persona');
}

console.log('\nY con el mismo día que decidió el motivo');
{
  const aviso = sacarDe(FN, "if (accion === 'aviso') {");
  ok(/numerosDelAviso\(admin, userId, diaDeLaPersona\(cuerpo\.hoy\)\)/.test(aviso),
     'la fecha del teléfono, la misma que mira SQL',
     'con dos fechas distintas el motivo y los números hablan de semanas ' +
     'distintas y el aviso se contradice solo');
  ok(/hoy: isoDe\(HOY\)/.test(sacarDe(APP, 'function revisarAvisoDelCoach(')),
     'y la app se la manda');

  // Un reloj mal puesto no puede mover la ventana a voluntad.
  const guarda = sacarDe(FN, 'function diaDeLaPersona(');
  ok(/86400000/.test(guarda) && /servidor/.test(guarda),
     'más de un día de diferencia y manda el servidor',
     'es la misma regla que `dia_de_la_persona` en SQL');
}

console.log('\nEl prompt prohíbe inventarse lo que no sabe');
{
  const p = prompt('SISTEMA_AVISO');
  ok(p.length > 0, 'el prompt existe');
  ok(/NO LO SABES Y NO LO DICES/.test(p), 'lo dice como regla');
  ok(/sábado/.test(p), 'y con el caso real delante',
     'una regla abstracta se obedece a medias; el ejemplo que ya pasó, no');
  ok(/NO PARA REPETIRLOS/.test(p), 'y los números no se recitan',
     'un aviso que dice «llevas 6 de 7 días» es un informe, no un mensaje');
  ok(/Sin listas, sin cifras, sin emojis/.test(p), 'sin perder lo que ya pedía');

  // La memoria la escribe el modelo a partir del chat, así que se puede
  // sembrar hablando con él. Aquí no mueve calorías, pero sí lo que se lee.
  const aviso = sacarDe(FN, "if (accion === 'aviso') {");
  ok(/NO mediciones/.test(aviso), 'las notas van marcadas como lo que son');
  ok(/no órdenes|no reglas que obedeces/.test(p), 'y el prompt sabe que son datos');
}

// ------------------------------------------------------------------
// Y AHORA EJECUTANDO LA APP DE VERDAD, contra una red de mentira.
// ------------------------------------------------------------------
const DIAS = Number((APP.match(/var DIAS_AVISO_VIVO = (\d+);/) || [])[1]);

const fuente = (APP.match(/var DIAS_AVISO_VIVO = \d+;/) || [''])[0] + '\n' +
  sacarDe(APP, 'function retirarAvisosCaducados(){') + '\n' +
  sacarDe(APP, 'function revisarAvisoDelCoach(){');

function montar({ fila = null, motivo = null, texto = 'Dos frases.' } = {}) {
  const hecho = { gets: [], patches: [], rpc: [], ia: [], pintado: [] };
  const sesion = { user: { id: 'u1' } };

  const sbFetch = (url, opts) => {
    if (opts && opts.method === 'PATCH') {
      hecho.patches.push({ url, cuerpo: JSON.parse(opts.body) });
      return Promise.resolve(null);
    }
    hecho.gets.push(url);
    return Promise.resolve(fila ? [fila] : []);
  };
  const sbRpc = (f, p) => {
    hecho.rpc.push({ f, p });
    return Promise.resolve(f === 'aviso_pendiente' ? motivo : 99);
  };
  const iaLlamar = (b) => { hecho.ia.push(b); return Promise.resolve({ texto }); };
  const pintarAvisoCoach = (t, id) => hecho.pintado.push({ t, id });
  const isoDe = (d) => d.toISOString().slice(0, 10);

  const revisar = new Function('sbFetch', 'sbRpc', 'iaLlamar', 'sesion', 'MI_NIVEL_IA',
    'pintarAvisoCoach', 'isoDe', 'HOY',
    fuente + '\nreturn revisarAvisoDelCoach;')(
    sbFetch, sbRpc, iaLlamar, sesion, 'plus', pintarAvisoCoach, isoDe, new Date());

  revisar();
  return hecho;
}

const haceDias = (n) => new Date(Date.now() - n * 86400000).toISOString();
const esperar = () => new Promise(r => setTimeout(r, 20));
const pregunto = (h) => h.rpc.some(r => r.f === 'aviso_pendiente');

if (!DIAS || !fuente.includes('revisarAvisoDelCoach')) {
  console.log('  FALLA  no encuentro DIAS_AVISO_VIVO o la función en app.js');
  process.exit(1);
}

console.log(`\nUn aviso vive ${DIAS} días y luego se retira solo`);
{
  const fresco = montar({ fila: { id: 7, texto: 'de ayer', creado_en: haceDias(1) } });
  await esperar();
  ok(fresco.pintado.length === 1 && fresco.pintado[0].t === 'de ayer', 'el de ayer se enseña');
  ok(fresco.patches.length === 0, 'y no se toca nada');
  ok(!pregunto(fresco), 'ni se pregunta si toca otro: ya hay uno vivo',
     'preguntar con uno en pantalla es gastar una consulta para nada');

  const viejo = montar({ fila: { id: 7, texto: 'de la semana pasada', creado_en: haceDias(DIAS + 2) } });
  await esperar();
  ok(!viejo.pintado.some(p => p.t === 'de la semana pasada'), 'el viejo ya no se enseña');
  ok(viejo.patches.length === 1, 'se retira');
  ok(pregunto(viejo), 'y se vuelve a preguntar si toca uno nuevo',
     'sin esto, el viejo tapa a todos los siguientes para siempre');
}

console.log('\nY el tope es el tope, no una idea');
{
  const justo = montar({ fila: { id: 7, texto: 'vivo', creado_en: haceDias(DIAS - 1) } });
  await esperar();
  ok(justo.pintado.length === 1, `a los ${DIAS - 1} días todavía vive`);

  const pasado = montar({ fila: { id: 7, texto: 'muerto', creado_en: haceDias(DIAS + 1) } });
  await esperar();
  ok(pasado.patches.length === 1, `y a los ${DIAS + 1} ya no`);
}

console.log('\nRetirar es marcarlo visto, no esconderlo');
{
  const h = montar({ fila: { id: 7, texto: 'viejo', creado_en: haceDias(DIAS + 2) } });
  await esperar();
  const p = h.patches[0] || { url: '', cuerpo: {} };
  ok(/visto_en/.test(JSON.stringify(p.cuerpo)), 'se le pone visto_en',
     'la base es la que decide si toca otro: `aviso_pendiente` se calla ' +
     'mientras haya alguno sin leer, así que esconderlo solo en pantalla ' +
     'seguiría tapando a los siguientes');
  ok(/visto_en=is\.null/.test(p.url), 'solo a los que nadie leyó');
  ok(/creado_en=lt\./.test(p.url), 'y solo a los caducados',
     'sin ese filtro se daría por leído el que acaba de llegar');
  ok(/user_id=eq\.u1/.test(p.url), 'y solo a los suyos');
}

console.log('\nSin ningún aviso, se pregunta y punto');
{
  const h = montar({ fila: null, motivo: null });
  await esperar();
  ok(h.patches.length === 0, 'no se retira nada');
  ok(pregunto(h), 'y se pregunta si toca uno');
  ok(h.ia.length === 0, 'sin motivo no se gasta una consulta');
}

console.log('\nY cuando toca uno nuevo, se pide con su fecha');
{
  const h = montar({ fila: null, motivo: 'racha', texto: 'Siete seguidos.' });
  await esperar();
  ok(h.ia.length === 1 && h.ia[0].motivo === 'racha', 'se pide a la IA');
  ok(/^\d{4}-\d{2}-\d{2}$/.test(String(h.ia[0].hoy)), 'con la fecha del teléfono',
     'allá cuenta los días apuntados: sin ella, los números serían de otro día');
  ok(h.rpc.some(r => r.f === 'guardar_aviso'), 'se guarda');
  ok(h.pintado.some(p => p.t === 'Siete seguidos.'), 'y se enseña');
}

console.log('\nUna fecha ilegible no deja el aviso ahí para siempre');
{
  const h = montar({ fila: { id: 7, texto: 'rota', creado_en: 'lo que sea' } });
  await esperar();
  ok(h.patches.length === 1, 'cuenta como caducado',
     'con NaN la resta es falsa y cae de este lado sola, que es el correcto');
  ok(!h.pintado.some(p => p.t === 'rota'), 'y no se enseña');
}

console.log(`\n${pasan} bien, ${fallan} mal`);
process.exit(fallan ? 1 : 0);
