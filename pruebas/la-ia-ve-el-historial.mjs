// La IA decidía sin dos cosas que la app ya tenía guardadas.
//
// UNA: CUÁNTOS DÍAS DIJO QUE IBA A ENTRENAR. Al cierre le llegaba «entrenó
// 4 veces (3 la semana anterior)» y con eso no se puede juzgar nada: cuatro
// es una semana perfecta para quien planea cuatro y es dejarse dos para
// quien planea seis. La regla del sistema dice «peso plano y entrenó poco o
// nada → le falta estímulo, no calorías», y sin el plan no hay forma de
// saber qué es «poco». Es el mismo fallo que tenía el anillo de la pantalla
// de Progreso, que se medía contra 7 porque no miraba `reg.dias`.
//
// Y DOS: EL HISTORIAL QUE YA SE GUARDA. Desde que el cierre deja su foto en
// `chequeos_semanales` hay veinte columnas por semana —lo que comió de
// media, sus macros, su peso medio, el volumen—. A la IA se le mandaban
// seis: hambre, energía, sueño y si se le ajustó. Todo lo demás se guardaba
// y no lo leía nadie.
//
// Eso importa más de lo que parece porque el teléfono solo se descarga 60
// días de diario. Más atrás, `resumenDeSemanas()` no puede reconstruir
// nada: la ÚNICA memoria de lo que pasó hace cuatro meses es esa tabla.
//
// LO QUE SE PRUEBA SE EJECUTA. Buscar «p.media_cal» en el fuente no prueba
// que el texto salga bien: una mutación que rompía la línea dejaba el
// nombre más adelante en la misma expresión y la comprobación pasaba
// igual. Aquí se arma el texto de verdad y se mira lo que produce.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const FN = readFileSync(join(RAIZ, 'supabase', 'functions', 'asistente', 'index.ts'), 'utf8')
  .replace(/\r\n/g, '\n');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

// Una función entera de app.js, contando llaves.
function sacar(cabecera) {
  const i = APP.indexOf(cabecera);
  if (i < 0) throw new Error('no encuentro: ' + cabecera);
  let n = 0, j = APP.indexOf('{', i);
  for (; j < APP.length; j++) {
    if (APP[j] === '{') n++;
    else if (APP[j] === '}') { n--; if (!n) return APP.slice(i, j + 1); }
  }
  throw new Error('llaves sin cerrar en ' + cabecera);
}

// Un trozo del fuente de la Edge Function entre dos marcas, para EJECUTARLO.
// Las marcas son código real: si alguien lo reescribe, esto revienta con un
// mensaje claro en vez de pasar sin mirar nada.
function trozo(desde, hasta) {
  const i = FN.indexOf(desde);
  if (i < 0) throw new Error('no encuentro el principio: ' + desde);
  const j = FN.indexOf(hasta, i);
  if (j < 0) throw new Error('no encuentro el final: ' + hasta);
  return FN.slice(i, j + hasta.length);
}

// ------------------------------------------------------------------
console.log('\nLa app manda cuántos días dijo que entrena');
{
  const f = sacar('function datosDeEntreno(){');
  ok(/dias_previstos/.test(f), 'va en lo que se manda del entreno',
     '«entrenó 4 veces» no se puede juzgar sin saber si su plan eran cuatro ' +
     'o seis');
  ok(/reg\.dias/.test(f), 'y sale de lo que dijo al registrarse',
     'ese dato ya existe: es el que fija el factor de actividad de sus calorías');

  // Y con un plan fuera de rango no se manda un número absurdo.
  const dame = new Function('reg', 'return (' +
    (f.match(/dias_previstos: (.+),\n/) || [])[1] + ');');
  ok(dame({ dias: 4 }) === 4, 'con un plan normal, va el número');
  for (const malo of [0, 99, -1, null, undefined, 'cuatro']) {
    ok(dame({ dias: malo }) === null, 'con dias=' + malo + ' va nulo',
       'salió ' + JSON.stringify(dame({ dias: malo })) + ': mejor no decir ' +
       'nada que decir una cifra falsa');
  }
  ok(dame(null) === null, 'y sin perfil, también nulo',
     'el primer arranque, antes de que la carga conteste');
}

// ------------------------------------------------------------------
console.log('\nY la función lo pone al lado de lo que hizo');
{
  const armar = new Function('e', trozo(
    'const plan = e && e.dias_previstos', "        : '';") + '; return entreno;');

  const cumplio = armar({ sesiones: 4, sesiones_antes: 4, dias_previstos: 4,
                          volumen: 21500, volumen_antes: 20100 });
  ok(/4 que planea/.test(cumplio), 'el plan sale al lado de lo que hizo',
     'salió: ' + cumplio.replace(/\n/g, ' | '));
  ok(/Entrenó 4 veces/.test(cumplio), 'sin perder lo que ya decía');
  ok(/21500 kg/.test(cumplio), 'ni el volumen');

  // Sin plan no se inventa ninguno: la app y la función se despliegan por
  // separado y durante un rato llegan cuerpos viejos sin ese campo.
  const sinPlan = armar({ sesiones: 4, sesiones_antes: 4, volumen: 1, volumen_antes: 1 });
  ok(!/undefined|null|NaN/.test(sinPlan), 'y sin plan no aparece un hueco raro',
     'salió: ' + sinPlan.replace(/\n/g, ' | '));
  ok(!/que planea/.test(sinPlan), 'simplemente no se menciona');
}

console.log('\nY se le dice qué hacer con eso');
{
  const reglas = FN.slice(FN.indexOf('SISTEMA_SEMANA'), FN.indexOf('LA SEMANA QUE SE CIERRA'));
  // Dos ideas distintas de la MISMA regla: que el listón es su plan, y que
  // cumplirlo cuenta aunque sean pocos días. Pidiendo solo una, borrar el
  // encabezado dejaba pasar la comprobación — lo enseñó una mutación.
  const parrafo = (reglas.split('\n\n').find((b) => /su plan/i.test(b)) || '');
  ok(/plan/i.test(parrafo) && /cumpli/i.test(parrafo),
     'el listón es su plan, y cumplirlo cuenta',
     'sin esto, «solo entrenó 3» se lee siempre como poco, y a quien entrena ' +
     'tres días por elección se le regaña cada lunes por hacer justo lo que ' +
     'dijo. Dice: «' + parrafo.slice(0, 140) + '»');
}

// ------------------------------------------------------------------
console.log('\nLa app pide el historial entero, no seis columnas');
{
  const f = sacar('function chequeosDeAntes(){');
  for (const col of ['media_cal', 'cal_antes', 'media_p', 'meta_p', 'peso_medio',
                     'volumen', 'dias_apuntados', 'sesiones']) {
    ok(new RegExp(col).test(f), `pide «${col}»`,
       'está guardado desde el cierre y no lo lee nadie; y pasados 60 días ' +
       'esta tabla es la única memoria que queda');
  }
  ok(/hambre/.test(f) && /sueno/.test(f), 'sin perder el hambre y el sueño');
}

console.log('\nY la función las enseña, con lo que de verdad pasó');
{
  const armar = new Function('previas', trozo(
    'const historial = previas.length', "        : '';") + '; return historial;');

  const t = armar([{
    semana: '2026-08-11', hambre: 2, energia: 3, sueno: 3,
    peso_medio: 84.7, media_cal: 2380, cal_antes: 2451,
    media_p: 120, meta_p: 170, dias_apuntados: 7, sesiones: 4, volumen: 21500,
    ajusto: false,
  }]);

  ok(/84\.7 kg/.test(t), 'el peso medio de esa semana',
     'es lo que convierte cuatro números sueltos en una tendencia. Salió: ' + t);
  ok(/2380\/2451 cal/.test(t), 'lo que comió contra su meta',
     'salió: ' + t);
  ok(/120\/170 g/.test(t), 'y su proteína contra la suya',
     'sin esto no se ve el patrón que se buscaba: que las semanas de poca ' +
     'proteína son las mismas en que el peso no se mueve');
  ok(/apuntó 7\/7/.test(t), 'cuántos días apuntó');
  ok(/gym 4/.test(t), 'y cuántas veces fue al gimnasio');
  ok(/hambre 2/.test(t), 'sin perder la encuesta');
  ok(/no se tocó/.test(t), 'y lo que se decidió esa semana',
     'es lo que impide proponer el mismo ajuste dos veces seguidas');

  const conAjuste = armar([{ semana: '2026-08-04', ajusto: true, cal_despues: 2300 }]);
  ok(/2300 cal/.test(conAjuste), 'o a cuánto se le dejó');
}

console.log('\nY una semana de antes de todo esto no saca ceros');
{
  const armar = new Function('previas', trozo(
    'const historial = previas.length', "        : '';") + '; return historial;');
  const vieja = armar([{ semana: '2026-05-05', hambre: 3, energia: 3, sueno: 3, ajusto: false }]);
  ok(!/NaN|undefined|null/.test(vieja), 'sin NaN ni undefined', 'salió: ' + vieja);
  ok(/—/.test(vieja), 'sale con guiones');
  ok(!/\b0 kg|\b0 cal|\b0 g\b/.test(vieja), 'y nunca con ceros',
     'un cero ahí afirma que esa semana pesó cero o comió cero: ' + vieja);
}

console.log('\nY no se dispara el tamaño del contexto');
{
  // Cuatro semanas. Si esto creciera a diez, cada cierre costaría más y el
  // modelo leería más ruido que señal.
  const i = FN.indexOf('cuerpo.historial');
  const bloque = FN.slice(i, i + 200);
  ok(/slice\(-4\)/.test(bloque), 'se siguen mandando cuatro semanas y no más',
     'la ventana es lo que mantiene esto barato: ' + bloque.slice(0, 90));
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
