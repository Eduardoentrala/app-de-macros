// La quinta vez. Y esta se ve sin buscarla: los dos anillos del Diario,
// uno al lado del otro, diciendo cosas distintas del mismo tequila.
//
// `no-queda-ninguna-caloria-sin-alcohol` barre todas las sumas
// `P*4 + C*4 + G*9` del fichero y exige que cada una decida qué hace con el
// alcohol. Esta pasó por delante sin despeinarse, y con razón: la suma está
// BIEN. `calDe()` lleva su `+ (m.A || 0)*7` desde la 0073.
//
// Lo que estaba mal era el DATO que se le daba. `sumaDesde()` arrancaba su
// acumulador así:
//
//     var tot = {P:0, C:0, G:0};
//
// sin `A`. Y tres líneas más abajo hacía `tot.A += (reg.A||0)`, o sea
// `undefined + 30`, o sea **NaN**. Y entonces el remate: `calDe` escribe
// `(m.A || 0)` para protegerse del `undefined`, y NaN también es falso, así
// que el NaN se convertía en un 0 limpio y callado.
//
// Resultado, con un día apuntado y 30 g de alcohol dentro:
//
//     anillo de HOY     2.240 cal
//     anillo de SEMANA  2.030 cal
//
// La semana valía menos que el único día que tiene dentro. Doscientas diez
// calorías desaparecían al mirar el anillo de al lado.
//
// Esta prueba no mira la suma: mira el ACUMULADOR, y lo hace EJECUTÁNDOLO.
// Es el único sitio desde el que se ve, porque el síntoma es un número que
// sale redondo.

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

// La semana de verdad, ejecutada. `calDe` y `fmtFecha` entran como dobles
// mínimos: lo que se mide es el acumulador, no lo que los rodea.
function semanaDe(registro, dias) {
  const HOY = new Date('2026-11-20T00:00:00');
  const ancla = new Date(HOY);
  ancla.setDate(ancla.getDate() - (dias - 1));
  const cuerpo = fn('function sumaDesde(ancla){');
  return new Function('REGISTRO', 'HOY', 'iso', 'calDe', 'fmtFecha', `
    ${cuerpo}
    return sumaDesde(arguments[5]);
  `)(registro, HOY,
     (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
            '-' + String(d.getDate()).padStart(2, '0'),
     (m) => m.P * 4 + m.C * 4 + m.G * 9 + (m.A || 0) * 7,
     () => 'x', ancla);
}

// ------------------------------------------------------------------
console.log('\nUn día con una copa dentro');
{
  // 150 P, 200 C, 70 G y 30 g de alcohol. A mano:
  //   150*4 + 200*4 + 70*9 = 600 + 800 + 630 = 2030
  //   + 30*7 = 210  →  2240
  const s = semanaDe({ '2026-11-20': { P: 150, C: 200, G: 70, A: 30 } }, 5);

  ok(s.total.A === 30, 'el alcohol llega al total de la semana',
     'salió: ' + String(s.total.A) +
     '\n         NaN es lo que da `undefined + 30`, y es exactamente lo que ' +
     'pasaba:\n         el acumulador nacía sin `A`');
  ok(Number.isFinite(s.total.A), 'y es un número, no un NaN disfrazado',
     'un NaN aquí no revienta nada: `(m.A || 0)` de `calDe` lo convierte en ' +
     'cero\n         y la cuenta sale redonda, 210 calorías más abajo');
  ok(s.cal === 2240, 'y las calorías de la semana lo cuentan',
     'salió ' + s.cal + ' y son 2240. Con 2030 la semana vale MENOS que el ' +
     'único\n         día que tiene dentro, y los dos anillos están en la ' +
     'misma pantalla');
}

// ------------------------------------------------------------------
console.log('\nY la semana es la suma de sus días');
{
  // Esto es lo que se ve en el Diario: el anillo de hoy está DENTRO del de
  // la semana. Si el de la semana es más pequeño, uno de los dos miente.
  const hoy = { P: 150, C: 200, G: 70, A: 30 };
  const ayer = { P: 120, C: 150, G: 50, A: 0 };
  const calDe = (m) => m.P * 4 + m.C * 4 + m.G * 9 + (m.A || 0) * 7;
  const s = semanaDe({ '2026-11-20': hoy, '2026-11-19': ayer }, 5);

  ok(s.cal === calDe(hoy) + calDe(ayer),
     'la semana vale lo que valen sus días juntos',
     'semana ' + s.cal + ' · días ' + (calDe(hoy) + calDe(ayer)));
  ok(s.cal >= calDe(hoy),
     'y nunca menos que uno solo de ellos',
     'el anillo de hoy está dentro del de la semana: más pequeño es imposible');
}

// ------------------------------------------------------------------
console.log('\nY sin nada apuntado no se inventa un cero raro');
{
  const s = semanaDe({}, 5);
  ok(s.total.A === 0, 'una semana en blanco trae el alcohol a cero',
     'salió: ' + String(s.total.A));
  ok(s.cal === 0, 'y cero calorías');
}

// ------------------------------------------------------------------
console.log('\nY el acumulador nace con los cuatro');
{
  // Lo de arriba es lo que importa; esto solo dice DÓNDE está el arreglo
  // cuando vuelva a romperse, en vez de dejar un número suelto.
  const f = fn('function sumaDesde(ancla){');
  const arranca = /var tot = \{\s*P:\s*0\s*,\s*C:\s*0\s*,\s*G:\s*0\s*,\s*A:\s*0\s*\}/.test(f);
  ok(arranca, 'el acumulador de la semana arranca con `A:0`',
     'sin él, `tot.A += x` es `undefined + x`, o sea NaN, y `(m.A || 0)` lo ' +
     'tapa\n         en cero sin que nada reviente');

  // Y el que ya lo tenía bien no se mueve: la compensación del día lee los
  // días de antes con su propio acumulador.
  ok(/var antes = \{P:0, C:0, G:0, A:0\};/.test(fn('function actualizarMetas(){')),
     'y el de los días de antes sigue teniéndolo');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
