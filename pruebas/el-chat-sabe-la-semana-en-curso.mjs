// Preguntó si se había pasado esta semana y le contestaron con la anterior.
//
// El 23 de noviembre de 2026, literal:
//
//   ÉL  — «No pasa nada si me paso de calorías, por ejemplo esta semana
//          ya me pasé al igual que en anteriores»
//   ÉL  — «Mira tus números: la semana del 20-oct promediaste 2201, luego
//          1634, luego 2032, y la última 1911. (…) la más reciente quedó
//          por debajo de tu meta de 1947. (…) hoy no es el caso.»
//
// Los cuatro números eran exactos. El problema es cuáles eran: las
// semanas del 20-oct, 27-oct, 3-nov y 10-nov. La que él decía —la del
// 17-nov, en curso— iba por 2085 con seis días apuntados, o sea 138 por
// encima de su meta. Tenía razón y se le dijo que no.
//
// EL HUECO. Al chat se le mandan dos cosas sobre su comida:
//
//   · `macrosDeHoy()`      — hoy, y solo hoy.
//   · `resumenDeSemanas(4)` — las cuatro semanas YA CERRADAS.
//
// Y nada de los días de en medio. `resumenDeSemanas` cuenta desde
// `anclaSemana - 7·i`, así que por construcción nunca llega a la semana
// en curso — y hace bien, porque de esa misma función sale la medición
// del gasto y media semana contada como entera la estropearía.
//
// Así que la semana en curso va APARTE y marcada como incompleta. Son
// dos cosas distintas: de una se dice «promedió» y de la otra «lleva».

import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
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

if (!fn('function semanaEnCurso(){')) {
  console.log('\n  FALLA  no existe `semanaEnCurso`: al chat le sigue faltando la ' +
              'semana que va corriendo');
  console.log('\n0 bien, 1 mal');
  process.exit(1);
}

// La de verdad, ejecutada. Su semana empieza en MARTES, como la suya de
// verdad (`week_start_dow = 2`): si esto solo funcionara con semanas de
// lunes, a él no le serviría.
const MARTES = new Date('2026-11-17T00:00:00');
const correr = (registro, hoy) => new Function(
  'REGISTRO', 'anclaSemana', 'HOY', 'isoDe', 'calDe',
  sinC(fn('function semanaEnCurso(){')) + '; return semanaEnCurso();'
)(registro, MARTES, hoy,
  (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
         '-' + String(d.getDate()).padStart(2, '0'),
  (m) => m.P * 4 + m.C * 4 + m.G * 9 + (m.A || 0) * 7);

const dia = (cal) => ({ P: cal / 4, C: 0, G: 0, A: 0 });

// ------------------------------------------------------------------
console.log('\nLa semana que va corriendo');
{
  // Seis días apuntados de los siete que van, como los suyos.
  const r = correr({
    '2026-11-17': dia(2000), '2026-11-18': dia(2000), '2026-11-19': dia(2200),
    '2026-11-20': dia(2400), '2026-11-21': dia(1900), '2026-11-22': dia(2010),
  }, new Date('2026-11-23T00:00:00'));

  ok(r !== null, 'se arma', JSON.stringify(r));
  ok(r && r.dias_apuntados === 6, 'con los días apuntados', JSON.stringify(r));
  ok(r && r.dias_transcurridos === 7, 'y los que van de semana',
     'siete, de martes a lunes. Sin esto, «2085 de media» no se distingue ' +
     'de una\n         semana entera: ' + JSON.stringify(r));
  ok(r && r.media_cal === 2085,
     'y la media entre los días APUNTADOS, no entre siete',
     'salió ' + (r && r.media_cal) + ', esperaba 2085. Es la misma regla ' +
     'que el cierre:\n         dividir entre siete a quien apuntó seis le ' +
     'inventa un déficit');
  ok(r && r.semana === '2026-11-17', 'y dice de qué semana habla', JSON.stringify(r));
}

// ------------------------------------------------------------------
console.log('\nY no se cuela nada de fuera');
{
  // Lo de la semana pasada y lo de mañana no son de esta.
  const r = correr({
    '2026-11-16': dia(9000),   // lunes, semana anterior
    '2026-11-18': dia(2000),
    '2026-11-24': dia(9000),   // martes que viene
  }, new Date('2026-11-19T00:00:00'));
  ok(r && r.dias_apuntados === 1 && r.media_cal === 2000,
     'solo cuentan los días de esta semana hasta hoy',
     JSON.stringify(r) + '\n         el lunes de antes es de la semana que ya ' +
     'cerró, y el martes que viene\n         no ha pasado');
  ok(r && r.dias_transcurridos === 3, 'y van tres días (martes, miércoles, jueves)',
     JSON.stringify(r));

  // Y HOY CUENTA, que es el día por el que se pregunta. Un bucle que se
  // cortara en ayer dejaría fuera justo el único día que él tiene delante
  // en la pantalla al escribir «¿cómo voy?».
  const h = correr({ '2026-11-18': dia(2000), '2026-11-19': dia(2600) },
                   new Date('2026-11-19T00:00:00'));
  ok(h && h.dias_apuntados === 2 && h.media_cal === 2300,
     'y lo apuntado HOY entra en la cuenta',
     JSON.stringify(h) + ' — cortando en ayer saldría un día y 2000 de media: ' +
     'le diría que va bien el día que se pasó');

  // Sin nada apuntado, nada que decir. Un cero sería una afirmación.
  ok(correr({}, new Date('2026-11-19T00:00:00')) === null,
     'y una semana sin apuntar todavía no dice nada',
     'una media de cero se leería como «no ha comido»');
}

// ------------------------------------------------------------------
console.log('\nY las semanas cerradas siguen siendo las cerradas');
{
  // ESTO ES LO QUE NO SE PUEDE ROMPER. De `resumenDeSemanas` sale también
  // la medición del gasto (`serieParaMedir`), y ahí una semana a medias
  // contada como entera corrompe el número con el que se mueven sus
  // calorías cada lunes.
  const r = fn('function resumenDeSemanas(cuantas){');
  ok(r && /for\(var i = cuantas; i >= 1; i--\)/.test(r),
     '`resumenDeSemanas` sigue contando hacia atrás desde el ancla',
     'si llegara a `i = 0` incluiría la semana en curso, y de ahí sale el ' +
     'gasto medido');
  ok(r && !/semanaEnCurso/.test(r),
     'y no sabe nada de la semana en curso',
     'son dos cosas distintas a propósito');

  const s = fn('function serieParaMedir(){');
  ok(s && /resumenDeSemanas\(8\)/.test(s),
     'y la medición del gasto sigue usándola a ella',
     'es la que no puede ver semanas a medias');
}

// ------------------------------------------------------------------
console.log('\nY se le manda al asistente');
{
  const p = fn('function progresoDelChat(){');
  ok(p && /semanaEnCurso\(\)/.test(p), 'el envío del chat la incluye');
  ok(p && /en_curso/.test(p), 'con su propio nombre, separada de `semanas`',
     'metida dentro del array de cerradas, el modelo la promediaría con ' +
     'las demás');
}

// ------------------------------------------------------------------
console.log('\nY el asistente la dice como lo que es');
{
  const i = FN.indexOf('const PALABRAS_DE_ESTADO');
  const iFn = FN.indexOf('function comoVa(');
  const fuente = FN.slice(FN.indexOf('function comoVa('), FN.indexOf('\n}', iFn) + 2);
  const comoVa = new Function(
    stripTypeScriptTypes(fuente, { mode: 'strip' }) + '; return comoVa;')();

  const texto = comoVa({
    objetivo: 'bajar',
    en_curso: { semana: '2026-11-17', dias_apuntados: 6, dias_transcurridos: 7,
                media_cal: 2085 },
    semanas: [
      { semana: '2026-11-03', dias_apuntados: 7, media_cal: 2032, peso_medio: 82.5 },
      { semana: '2026-11-10', dias_apuntados: 7, media_cal: 1911, peso_medio: 82.1 },
    ],
  });

  ok(/2085/.test(texto), 'sale la media de la semana en curso',
     'salió:\n         ' + texto.split('\n').join('\n         '));
  ok(/sin terminar|en curso|de ahora|no ha terminado/i.test(texto),
     'y se dice que NO ha terminado',
     'sin eso el modelo la trata como una semana cerrada más y la promedia ' +
     'con\n         las otras');
  ok(/6 d[íi]as/.test(texto) && /7/.test(texto),
     'y cuántos días lleva de cuántos',
     'una media de dos días no es una semana');
  ok(/lleva/i.test(texto),
     'y se dice «lleva», no «promedió»',
     'el tiempo verbal es la diferencia entre un dato cerrado y uno a medias');

  // Y LAS CERRADAS SIGUEN SALIENDO, que es lo que ya funcionaba.
  ok(/2026-11-10/.test(texto) && /1911/.test(texto),
     'y las semanas cerradas siguen ahí con su fecha');

  // Sin semana en curso —recién empezada, nada apuntado— no se inventa.
  const sinNada = comoVa({ objetivo: 'bajar', semanas: [] });
  ok(!/sin terminar/i.test(sinNada), 'y sin ella no se dice nada',
     'salió: ' + JSON.stringify(sinNada).slice(0, 200));
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
