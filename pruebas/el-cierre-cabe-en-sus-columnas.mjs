// El cierre del lunes podía escribir una meta que la base rechaza.
//
// Hay TRES sitios que escriben `goal_protein_g`, `goal_carbs_g` y
// `goal_fat_g`:
//
//   1. el reparto de la pantalla  (`repartir`)
//   2. la hoja del entrenador     (la función SQL de la 0047)
//   3. el cierre de los lunes     (`aplicarCaloriasNuevas`)
//
// Los dos primeros ponen los topes de las columnas —0-600, 0-900,
// 0-400, puestos desde la 0001— y el tercero no. Escala los macros por
// `f = nuevas / antes` y los guarda tal cual.
//
// La 0047 ya dejó escrito lo que pasa cuando falta: «el `update` choca
// con `profiles_goal_carbs_g_check` y a quien pulsó le sale un error de
// Postgres en crudo». En el cierre es peor que un error feo: la
// pantalla se queda con las calorías nuevas y la base con las viejas.
// Al recargar vuelven las de antes, nadie entiende nada, y el lunes
// siguiente el entrenador decide sobre una meta que no llegó a existir
// — que es justo lo que el comentario de al lado dice que no puede
// pasar.
//
// NO HACE FALTA UN CASO RARO. El paso máximo es 250 calorías, así que
// `f` es pequeño, pero a quien ya come mucho carbohidrato le basta:
//
//     P180 C870 G100  =  5.100 cal
//     el cierre sube a 5.350  ->  f = 1,049  ->  C = 913
//
// 913 pasa de 900 y el `check` lo rechaza. Son calorías de alguien en
// volumen, no de un caso imposible: la hoja del entrenador admite hasta
// 6.000.
//
// Y LO QUE NO CABE EN CARBO SE PASA A LA GRASA, no se tira. Es lo que
// hacen los otros dos sitios, y recortar a secas le quitaría calorías
// sin decirle por qué.

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

const LIMPIO = APP.replace(/^\s*\/\/.*$/gm, '');
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

const fuente = fn('function conTopesDeColumna(');
if (!fuente) {
  console.log('\n  FALLA  no existe `conTopesDeColumna`: el cierre del lunes sigue ' +
              'pudiendo escribir\n         una meta que la base rechaza');
  console.log('\n0 bien, 1 mal');
  process.exit(1);
}
const topar = new Function(fuente + '; return conTopesDeColumna;')();

// Los mismos de la 0001. Si allí se cambian, aquí también.
const TOPE = { P: 600, C: 900, G: 400 };

// ------------------------------------------------------------------
console.log('\nNada se sale de su columna');
{
  const a = topar(700, 1200, 500);
  ok(a.P <= TOPE.P && a.C <= TOPE.C && a.G <= TOPE.G,
     'los tres se quedan dentro', JSON.stringify(a));
  ok(a.P >= 0 && a.C >= 0 && a.G >= 0, 'y ninguno baja de cero', JSON.stringify(a));

  const b = topar(-5, -5, -5);
  ok(b.P === 0 && b.C === 0 && b.G === 0, 'y un negativo se queda en cero',
     JSON.stringify(b));

  const c = topar(150.4, 200.6, 60.5);
  ok(Number.isInteger(c.P) && Number.isInteger(c.C) && Number.isInteger(c.G),
     'y salen enteros, que es lo que admiten las columnas', JSON.stringify(c));

  // CADA UNO POR SU CUENTA. Arriba el carbo también se pasaba, y el
  // desborde a la grasa vuelve a toparla de rebote: con eso solo, quitar
  // el tope de la grasa no se notaba. Este es con el carbo DENTRO, que es
  // el único que lo prueba de verdad.
  const d = topar(180, 300, 500);
  ok(d.G === TOPE.G, 'la grasa se topa aunque el carbo quepa de sobra',
     JSON.stringify(d));
  const e = topar(900, 300, 60);
  ok(e.P === TOPE.P, 'y la proteína igual', JSON.stringify(e));
}

// ------------------------------------------------------------------
console.log('\nY lo que no cabe en carbo se pasa a la grasa');
{
  // 40 g de carbo de más son 160 cal; en grasa, 17 g.
  const a = topar(180, 940, 100);
  ok(a.C === 900, 'el carbo se queda en 900', JSON.stringify(a));
  ok(a.G === 100 + Math.floor(40 * 4 / 9),
     'y los 160 cal sobrantes van a la grasa',
     'esperaba G' + (100 + Math.floor(40 * 4 / 9)) + ', salió G' + a.G);

  // Con la grasa ya en su tope no hay donde meterlo: se pierde, pero
  // dentro de los límites. Mejor perder calorías que no poder guardar.
  const b = topar(180, 1400, 395);
  ok(b.C === 900 && b.G === 400,
     'y si la grasa ya está en su tope, se queda en el tope', JSON.stringify(b));
}

// ------------------------------------------------------------------
console.log('\nY el cierre del lunes lo usa');
{
  const cierre = fn('function aplicarCaloriasNuevas(');
  ok(cierre && /conTopesDeColumna\(/.test(cierre),
     '`aplicarCaloriasNuevas` topa antes de guardar',
     'escala los macros por `f = nuevas / antes` y los manda a la base sin mirar');

  // Y DESPUÉS DE LA SALUD, que también los toca. Al revés, un tope renal
  // aplicado después podría volver a sacar el carbo de rango.
  const iSalud = cierre ? cierre.indexOf('ajustarPorSalud(') : -1;
  const iTope = cierre ? cierre.indexOf('conTopesDeColumna(') : -1;
  const iGuardar = cierre ? cierre.indexOf('goalP.value =') : -1;
  ok(iSalud >= 0 && iTope > iSalud && iGuardar > iTope,
     'y lo hace después de la salud y antes de escribir las metas',
     'salud en ' + iSalud + ', topes en ' + iTope + ', guardado en ' + iGuardar);
}

// ------------------------------------------------------------------
console.log('\nY el caso que lo destapó, con la cuenta del cierre entera');
{
  // `aplicarCaloriasNuevas`: f = nuevas/antes y los tres por f.
  const PASO = 250;
  let fuera = 0, peor = null;
  for (let P = 100; P <= 300; P += 20) {
    for (let C = 300; C <= 900; C += 20) {
      for (let G = 40; G <= 250; G += 20) {
        const antes = P * 4 + C * 4 + G * 9;
        if (antes < 800 || antes > 6000) continue;
        for (const salto of [PASO, -PASO]) {
          const f = (antes + salto) / antes;
          const t = topar(Math.round(P * f), Math.round(C * f), Math.round(G * f));
          if (t.P > TOPE.P || t.C > TOPE.C || t.G > TOPE.G) {
            fuera++; peor = { P, C, G, antes, salto, t };
          }
        }
      }
    }
  }
  ok(fuera === 0,
     'ninguna meta alcanzable por el cierre se sale de las columnas',
     fuera + ' casos, p.ej. ' + JSON.stringify(peor));

  // Y sin topar, el caso de la cabecera SÍ se sale: que quede probado que
  // esto no era teórico.
  const f = 5350 / 5100;
  ok(Math.round(870 * f) > TOPE.C,
     'y sin los topes, P180 C870 G100 subido 250 pasa de 900 de carbo',
     'sale C' + Math.round(870 * f) + ', y la columna admite ' + TOPE.C);
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
