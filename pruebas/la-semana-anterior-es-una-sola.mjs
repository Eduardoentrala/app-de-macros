// «El volumen bajó un 73 %» era mentira. Había bajado un 53 %.
//
// Él preguntó al asistente cómo iba y le dijo que el volumen del
// gimnasio se había hundido un 73 % respecto a la semana anterior.
// Preguntó por qué, y el asistente le explicó muy convencido que
// probablemente había metido menos peso o menos repeticiones.
//
// Los números de verdad de esas dos semanas:
//
//     2-8 nov    14.753   (3 días)
//     26 oct-1   31.689   (5 días)    →  -53 %
//
// EL FALLO. `datosDeEntreno()` pide CUATRO semanas de sesiones —las
// necesita para la tendencia— y luego las reparte en dos montones con
// un solo corte:
//
//     if (fila >= finCerrada) return;          // la semana en curso, fuera
//     var esDeEsta = fila >= corte;            // corte = inicio de la cerrada
//     (esDeEsta ? estaSemana : anterior).push(...)
//
// Todo lo que no cae en la semana cerrada se va a `anterior`. O sea que
// `anterior` no es la semana anterior: son LAS TRES anteriores sumadas.
// Con sus datos, 65.567 contra 14.753.
//
// Por eso el número siempre parecía un derrumbe: se compara una semana
// contra tres. Para empatar habría que triplicar el volumen.
//
// Y NO ERA SOLO EL CHAT. El cierre de los lunes usa estos mismos campos
// —«Volumen: X kg esta semana, Y kg la anterior»—, así que llevaba
// semanas diciéndole lo mismo, y de ahí salen los consejos.

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
const sinC = (s) => s.replace(/^\s*\/\/.*$/gm, '');

function fn(cabecera) {
  const i = APP.indexOf(cabecera);
  if (i < 0) throw new Error('no encuentro: ' + cabecera);
  let n = 0, j = APP.indexOf('(', i);
  for (; j < APP.length; j++) {
    if (APP[j] === '(') n++;
    else if (APP[j] === ')') { n--; if (!n) break; }
  }
  n = 0;
  for (let k = APP.indexOf('{', j); k < APP.length; k++) {
    if (APP[k] === '{') n++;
    else if (APP[k] === '}') { n--; if (!n) return APP.slice(i, k + 1); }
  }
  throw new Error('llaves sin cerrar: ' + cabecera);
}

// ------------------------------------------------------------------
// SE EJECUTA LA FUNCIÓN DE VERDAD, con el lunes 9 de noviembre de ancla
// y sus sesiones reales. Mirando el texto, un reparto en dos montones
// con un corte parece correcto: hay que sumarlo para ver qué cae dónde.
const SESIONES = [
  // Cuatro semanas, la más vieja primero. Son las suyas.
  ['2026-10-12', 2567], ['2026-10-14', 2440], ['2026-10-15', 15750], ['2026-10-16', 2094],
  ['2026-10-19', 5694], ['2026-10-22', 2745], ['2026-10-23', 2588],
  ['2026-10-26', 9360], ['2026-10-27', 2670], ['2026-10-28', 5802],
  ['2026-10-29', 11012], ['2026-10-30', 2845],
  ['2026-11-04', 2670], ['2026-11-06', 2753], ['2026-11-07', 9330],
  // La semana en curso, que no entra en ninguno de los dos montones.
  ['2026-11-09', 2442], ['2026-11-10', 5503], ['2026-11-12', 10377],
  ['2026-11-13', 2730], ['2026-11-14', 2774],
].map(([d, v]) => ({ session_date: d, total_volume: v, exercises: [], duration_min: 45 }));

const CERRADA  = 14753;   // 2-8 nov, tres días
const PREVIA   = 31689;   // 26 oct-1 nov, cinco días
const TRES     = 65567;   // las tres anteriores juntas: lo que sumaba mal

async function correr(filas) {
  const cuerpo = sinC(fn('function datosDeEntreno('));
  const ancla = new Date(2026, 10, 9);          // lunes 9 de noviembre
  return new Function(
    'sesion', 'anclaSemana', 'isoDe', 'sbFetch', 'reg', 'PESOS', 'CINTURAS',
    cuerpo + '; return datosDeEntreno();'
  )(
    { user: { id: 'yo' } }, ancla,
    (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10),
    () => Promise.resolve(filas),
    { dias: 4 }, {}, {}
  );
}

console.log('\n«La semana anterior» es UNA semana');
{
  const r = await correr(SESIONES);

  ok(r && r.volumen === CERRADA,
     `la semana cerrada suma ${CERRADA}`, 'salió ' + (r || {}).volumen);
  ok(r.sesiones === 3, 'y fueron tres días', 'salió ' + r.sesiones);

  ok(r.volumen_antes !== TRES,
     'y la anterior NO son las tres anteriores juntas',
     `salió ${r.volumen_antes}, que es la suma de las semanas del 12, 19 y 26 ` +
     'de octubre. Se compara una semana contra tres: para empatar habría ' +
     'que triplicar el volumen, y por eso siempre parece un derrumbe');
  ok(r.volumen_antes === PREVIA,
     `sino la de antes, ${PREVIA}`, 'salió ' + r.volumen_antes);
  ok(r.sesiones_antes === 5, 'con sus cinco días', 'salió ' + r.sesiones_antes);

  // EL NÚMERO QUE SE LE ENSEÑA. Es lo único de todo esto que él lee.
  const pct = Math.round((r.volumen - r.volumen_antes) / r.volumen_antes * 100);
  ok(pct === -53, `y el cambio que se le dice es -53 %`,
     'dijo ' + pct + ' %. Le contestó «bajó un 73 %» y le explicó, muy ' +
     'convencido, por qué había pasado algo que no pasó');
}

// ------------------------------------------------------------------
console.log('\nY las cuatro semanas de la tendencia siguen una por una');
{
  // `por_semana` sí cortaba bien: cada una con su ventana de siete días.
  // Se comprueba para que el arreglo de arriba no se las lleve por
  // delante — y porque son la prueba de que el reparto en dos montones
  // era lo raro, no la forma de contar semanas.
  const r = await correr(SESIONES);
  const v = (r.por_semana || []).map((x) => x.volumen);
  ok(v.length === 4, 'son cuatro', JSON.stringify(v));
  ok(v.join() === [22851, 11027, PREVIA, CERRADA].join(),
     'de la más vieja a la cerrada, cada una la suya', JSON.stringify(v));
}

// ------------------------------------------------------------------
console.log('\nY sin semana anterior no se inventa una comparación');
{
  // Alguien que empieza: solo tiene la semana que se cierra. Dividir
  // entre cero da `Infinity`, y un «+∞ %» en el chat es peor que no
  // decir nada.
  const r = await correr(SESIONES.filter((s) => s.session_date >= '2026-11-02'));
  ok(r.volumen === CERRADA, 'la suya sale igual', 'salió ' + r.volumen);
  ok(r.volumen_antes === 0, 'y la anterior es cero, no las de nadie',
     'salió ' + r.volumen_antes);
  ok(r.sesiones_antes === 0, 'sin días');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
