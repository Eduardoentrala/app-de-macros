// El titular de la gráfica de peso era el primer pesaje contra el último.
//
//     var ini = pts[0].w, fin = pts[pts.length-1].w;
//     var difKg = Math.round((fin - ini) * 10) / 10;
//
// Y el resto de los puntos, de adorno. Es exactamente lo que `gastoMedido` se
// prohíbe a sí mismo unas pantallas más allá —«la pendiente usa todos los
// puntos, no el primero contra el último, que es tirar la mitad de los
// datos»—, solo que aquí pesaba más: esta es la cifra que se mira a diario.
//
// Con dos extremos ruidosos el número baila solo. El peso de un día se mueve
// un kilo largo por agua y sal, así que un lunes salado contra un domingo en
// ayunas da «bajaste 1,8 kg» sin haber perdido nada —y al revés, una semana
// buena puede salir plana porque el último pesaje cayó mal—.
//
// Y EL RÓTULO MENTÍA APARTE. Decía «en 14 días» siempre, porque salía del
// botón pulsado y no de los datos: con dos pesajes de anteayer y ayer ponía
// igual «en 14 días».

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
const LIMPIO = sinC(APP);
function fn(cabecera) {
  const i = LIMPIO.indexOf(cabecera);
  if (i < 0) throw new Error('no encuentro: ' + cabecera);
  let n = 0;
  for (let j = LIMPIO.indexOf('{', i); j < LIMPIO.length; j++) {
    if (LIMPIO[j] === '{') n++;
    else if (LIMPIO[j] === '}') { n--; if (!n) return LIMPIO.slice(i, j + 1); }
  }
  throw new Error('llaves sin cerrar: ' + cabecera);
}

// El cálculo de verdad, no una copia. El suelo de días se lleva del fuente y
// no se escribe aquí: si se sube a cinco, esta prueba tiene que enterarse
// —abajo se comprueba con él, no con un 3 tecleado a mano—.
const SUELO = (LIMPIO.match(/^\s*var DIAS_DE_TENDENCIA = .*$/m) || [])[0];
if (!SUELO) throw new Error('no encuentro DIAS_DE_TENDENCIA');
const MATE = SUELO + '\n' + fn('function tendenciaDePeso(pts){') + fn('function lapso(dias){');
const calcular = new Function('pts', MATE + '; return tendenciaDePeso(pts);');
const enPalabras = new Function('d', MATE + '; return lapso(d);');

// Pesajes: día 0 el más viejo.
const serie = (kgs, cadaCuantos = 1) => kgs.map((w, i) => ({
  d: new Date(2026, 10, 1 + i * cadaCuantos), w
}));

// ------------------------------------------------------------------
console.log('\nUn pesaje con agua ya no decide el titular');
{
  // CATORCE DÍAS PLANOS Y UN LUNES SALADO AL PRINCIPIO. El peso de esta
  // persona no se ha movido: 85,0 todos los días menos el primero.
  const pts = serie([87.0, 85, 85, 85, 85, 85, 85, 85, 85, 85, 85, 85, 85, 85]);
  const t = calcular(pts);

  // Lo que decía antes: 85,0 − 87,0 = «Bajaste 2,0 kg».
  ok(Math.abs(pts[pts.length - 1].w - pts[0].w) === 2,
     'el primero contra el último daría 2,0 kg',
     'esto es lo que se enseñaba');
  ok(Math.abs(t.dif) < 0.9,
     'y la recta por todos los puntos dice que no se movió',
     'salió ' + t.dif + ' kg. Catorce días iguales y un pesaje con agua al ' +
     'principio no son dos kilos perdidos');

  // Y AL REVÉS: una bajada de verdad tiene que verse entera.
  const bajando = calcular(serie([90, 89.5, 89, 88.5, 88, 87.5, 87]));
  ok(bajando.dif <= -2.8 && bajando.dif >= -3.2,
     'pero una bajada sostenida sale entera',
     'salió ' + bajando.dif + ' kg de los 3 que bajó');
  ok(bajando.pct < 0 && bajando.pct > -5, 'con su porcentaje', JSON.stringify(bajando));

  // EL PORCENTAJE SE DIVIDE POR LA RECTA, NO POR EL PRIMER PESAJE. Veinte
  // días bajando, con el primero inflado por agua: dividir por ese 95 encoge
  // el porcentaje justo cuando ese número es el que está mal.
  const inflado = [];
  for (let i = 0; i < 20; i++) inflado.push(i === 0 ? 95 : 85 - i * 0.3);
  const p = calcular(serie(inflado));
  ok(p.pct <= -9.5,
     'y se mide contra lo que dice la recta, no contra el primer pesaje',
     'salió ' + p.pct + '%. Dividiendo por el 95 del primer día sale −8.9 %, ' +
     'medio punto de menos puesto por el pesaje que menos se puede creer');
  ok(bajando.ultimo === 87, 'y el último pesaje va en crudo, sin pasar por la recta',
     'es el número que esa persona vio en la báscula');
}

console.log('\nY los días que se dicen son los que hay');
{
  const t = calcular(serie([86, 85.8, 85.6, 85.4], 4));   // 0, 4, 8 y 12
  ok(t.dias === 12, 'doce días entre el primero y el último son doce',
     'salió ' + t.dias + ': el rótulo salía del botón pulsado —«en 14 días»— ' +
     'y no de los pesajes');

  // Los saltos cuentan como lo que son. Pesarse tres días seguidos, saltarse
  // nueve y volver no es lo mismo que pesarse cuatro veces repartidas, y
  // tomando la POSICIÓN en la lista como eje saldría igual.
  const pegados = calcular([
    { d: new Date(2026, 10, 1), w: 90 },
    { d: new Date(2026, 10, 2), w: 90 },
    { d: new Date(2026, 10, 3), w: 90 },
    { d: new Date(2026, 10, 30), w: 87 },
  ]);
  ok(pegados.dias === 29, 'y un hueco de tres semanas también cuenta',
     'salió ' + pegados.dias);
  ok(pegados.dif < -2 && pegados.dif > -3.4,
     'con la pendiente puesta en el calendario de verdad',
     'salió ' + pegados.dif + '. Con la posición en la lista como eje, tres ' +
     'pesajes iguales y uno lejano se leen como una caída constante');
}

console.log('\nY con los pesajes pegados no se inventa una tendencia');
{
  ok(calcular(serie([85.8, 85.0])) === null,
     'dos pesajes de días seguidos no son una tendencia',
     'es la diferencia entre dos vasos de agua');
  ok(calcular(serie([85.8, 85.0, 85.4])) === null, 'ni tres en tres días');
  ok(calcular(serie([85.8, 85.0, 85.4, 85.2])) !== null, 'cuatro días ya sí');
  ok(calcular([]) === null, 'sin pesajes tampoco');
  ok(calcular(serie([85])) === null, 'ni con uno solo');
}

console.log('\nY el periodo se dice como se lee');
{
  ok(enPalabras(1) === 'en 1 día', enPalabras(1));
  ok(enPalabras(12) === 'en 12 días', enPalabras(12));
  ok(enPalabras(44) === 'en 44 días', enPalabras(44));
  ok(enPalabras(60) === 'en 2 meses', enPalabras(60) + ' — «en 60 días» obliga a dividir');
  ok(enPalabras(300) === 'en 10 meses', enPalabras(300));
}

// ------------------------------------------------------------------
console.log('\nY la pantalla usa esto, no dos puntos');
{
  // EJECUTADO: el titular que sale de verdad, con el `pintarPeso` del fuente.
  const correr = (pts, rango) => {
    const campos = {};
    const dame = (id) => campos[id] || (campos[id] = { textContent: '', className: '', style: {}, innerHTML: '' });
    new Function(
      'serieDePeso', 'document', 'PESOS', 'isoDe', 'HOY', 'revisarRecordatorios',
      'pintarPantallaPesajes', 'svgDeSerie', 'RANGO', 'MESES',
      MATE + sinC(fn('function pintarPeso(){')) + '; pintarPeso();'
    )(
      () => pts, { getElementById: dame }, {}, () => '2026-11-15', new Date(2026, 10, 15),
      () => {}, () => {}, () => '<svg></svg>', rango || '14',
      ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
    );
    return { delta: campos.pesoDelta.textContent, resumen: campos.pesoResumen.textContent };
  };

  const salado = correr(serie([87.0, 85, 85, 85, 85, 85, 85, 85, 85, 85, 85, 85, 85, 85]));
  ok(!/2\.0 kg/.test(salado.resumen),
     'el pesaje con agua ya no sale como dos kilos perdidos',
     'dijo: «' + salado.resumen + '»');
  ok(/85\.0 kg/.test(salado.resumen), 'y se enseña el último pesaje de verdad',
     'dijo: «' + salado.resumen + '»');

  const corto = correr(serie([86.5, 85.0]));
  ok(/no hay tendencia/.test(corto.resumen),
     'con dos pesajes pegados se dice que todavía no hay tendencia',
     'dijo: «' + corto.resumen + '»');
  ok(!/14 días/.test(corto.resumen) && !/14 días/.test(corto.delta),
     'y no se habla de catorce días',
     'el rango del botón no es el periodo de los datos. Dijo: «' +
     corto.delta + '» / «' + corto.resumen + '»');
  ok(corto.delta === '—', 'el porcentaje queda en raya', corto.delta);

  const doce = correr(serie([86, 85.8, 85.6, 85.4], 4));
  ok(/en 12 días/.test(doce.resumen) && /en 12 días/.test(doce.delta),
     'y con pesajes de doce días se dicen doce',
     'dijo: «' + doce.delta + '» / «' + doce.resumen + '»');

  // Y el rótulo YA NO SALE DEL BOTÓN: el mismo periodo, mirado como «año»,
  // tiene que decir lo mismo.
  const mismoEnElAnio = correr(serie([86, 85.8, 85.6, 85.4], 4), 'anio');
  ok(mismoEnElAnio.resumen === doce.resumen,
     'mirar el mismo periodo como «año» no cambia el titular',
     '«' + mismoEnElAnio.resumen + '» contra «' + doce.resumen + '»');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
