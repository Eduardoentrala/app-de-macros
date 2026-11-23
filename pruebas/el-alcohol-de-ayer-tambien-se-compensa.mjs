// Bebías el martes y la meta del miércoles no se enteraba.
//
// La app reparte el saldo de la semana: la meta de hoy es la de la
// semana menos lo que ya se comió, dividido entre los días que quedan.
// Pasarse un día aprieta los siguientes, y eso funcionaba — para la
// proteína, el carbohidrato y la grasa.
//
// El alcohol no. Y no por olvido de que existe: `actualizarMetas` lo
// SUMABA —`antes.A += (reg.A||0)`— y luego no lo usaba en ninguna
// parte. Un acumulador que nadie lee. Hasta hay una prueba hermana
// (`el-anillo-de-la-semana-cuenta-el-alcohol`) que lo da por bueno
// diciendo «la compensación del día lee los días de antes con su propio
// acumulador». Lo tenía; no lo leía.
//
// Así que el anillo del día sí contaba esas calorías —`calDe` las suma
// desde la 0073— y el saldo de la semana no. Tres cervezas el martes
// son unas 330 calorías de puro etanol que desaparecían del reparto: el
// miércoles te daba la meta entera, y la semana acababa por encima
// mientras la pantalla decía que ibas bien.
//
// CÓMO SE RESTA ALGO QUE NO TIENE MACRO. El alcohol es el único de los
// cuatro sin meta propia, y no la va a tener: nadie se pone un objetivo
// de etanol. Así que no hay de dónde restarlo macro a macro y se resta
// como lo que es, calorías, con la regla que esta app ya usa en los
// otros dos sitios donde hay que quitar calorías —la reserva de un
// evento y el suelo del día—:
//
//   · la proteína no se toca NUNCA;
//   · el recorte se reparte entre carbo y grasa según lo que cada uno
//     aporta, así que a quien ya come poca grasa casi no se le quita de
//     ahí.
//
// Esa regla estaba escrita tres veces. Ahora es `quitarCalorias` y la
// usan las tres.
//
// Y SE REPARTE ENTRE LOS DÍAS QUE QUEDAN, como todo lo demás. Cobrar
// las 330 de golpe el miércoles dejaría un día absurdo por una cena del
// martes.

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

const partes = [fn('function quitarCalorias('), fn('function metaDelDia(')];
if (partes.some((p) => !p)) {
  console.log('\n  FALLA  no existen `quitarCalorias` / `metaDelDia`: el alcohol de ' +
              'los días de antes\n         sigue sin descontarse del saldo de la semana');
  console.log('\n0 bien, 1 mal');
  process.exit(1);
}
const dame = (nombre) => new Function(partes.join('\n') + '; return ' + nombre + ';')();
const quitarCalorias = dame('quitarCalorias');
const metaDelDia = dame('metaDelDia');
const cal = (m) => m.P * 4 + m.C * 4 + m.G * 9;

// Una persona con 1940 de meta: P150 C200 G60.
const META = { P: 150, C: 200, G: 60 };
// Dos días ya pasados, comidos justo en la meta. Quedan cinco.
const DOS_DIAS = { P: 300, C: 400, G: 120, A: 0 };

// ------------------------------------------------------------------
console.log('\nSin alcohol, el reparto es el de siempre');
{
  const m = metaDelDia(META, DOS_DIAS, 7, 5);
  ok(Math.abs(m.P - 150) < 0.01 && Math.abs(m.C - 200) < 0.01 && Math.abs(m.G - 60) < 0.01,
     'dos días clavados dejan la meta igual', JSON.stringify(m));

  // Pasarse sigue apretando y ahorrar sigue soltando.
  const pasado = metaDelDia(META, { P: 300, C: 600, G: 120, A: 0 }, 7, 5);
  ok(cal(pasado) < cal(META) - 150,
     'y pasarse 800 calorías sigue apretando los cinco días que quedan',
     'salió ' + Math.round(cal(pasado)) + ' · ' + JSON.stringify(pasado));
}

// ------------------------------------------------------------------
console.log('\nY el alcohol de los días de antes ya se cobra');
{
  // 40 g de etanol en los dos días pasados: 280 calorías.
  const m = metaDelDia(META, { ...DOS_DIAS, A: 40 }, 7, 5);
  const sinEllo = metaDelDia(META, DOS_DIAS, 7, 5);

  ok(Math.abs((cal(sinEllo) - cal(m)) - 280 / 5) < 0.5,
     'las 280 calorías se reparten entre los cinco días que quedan',
     'bajó ' + Math.round(cal(sinEllo) - cal(m)) + ' cal, esperaba 56 · ' +
     JSON.stringify(m));

  ok(m.P === META.P, 'y la proteína no se toca',
     'es lo que se protege siempre que hay que recortar: salió ' + m.P);

  // Repartido entre carbo y grasa SEGÚN LO QUE APORTA CADA UNO.
  const quitaC = (sinEllo.C - m.C) * 4, quitaG = (sinEllo.G - m.G) * 9;
  const calC = sinEllo.C * 4, calG = sinEllo.G * 9;
  ok(Math.abs(quitaC / (quitaC + quitaG) - calC / (calC + calG)) < 0.01,
     'y el recorte se reparte entre carbo y grasa en su proporción',
     'quitó ' + Math.round(quitaC) + ' de carbo y ' + Math.round(quitaG) +
     ' de grasa, sobre ' + Math.round(calC) + ' y ' + Math.round(calG));

  // Un solo día que queda: se cobra entero ese día, no una quinta parte.
  const ultimo = metaDelDia(META, { ...DOS_DIAS, A: 40 }, 7, 1);
  const ultimoSin = metaDelDia(META, DOS_DIAS, 7, 1);
  ok(Math.abs((cal(ultimoSin) - cal(ultimo)) - 280) < 1,
     'y en el último día de la semana se cobra entero',
     'bajó ' + Math.round(cal(ultimoSin) - cal(ultimo)));
}

// ------------------------------------------------------------------
console.log('\nY nada se va por debajo de cero');
{
  // El último día de la semana —seis ya comidos, clavados— y encima una
  // cantidad de alcohol absurda: más calorías de las que queda meta.
  const m = metaDelDia(META, { P: 900, C: 1200, G: 360, A: 500 }, 7, 1);
  ok(m.C >= 0 && m.G >= 0 && m.P === META.P,
     'carbo y grasa se quedan en cero, no en negativo',
     JSON.stringify(m) + '\n         el suelo del día lo pone `actualizarMetas` ' +
     'después; aquí basta con no\n         devolver gramos negativos');

  // NI CERO DÍAS RESTANTES. Hoy quien llama ya trae un `Math.max(1, …)`
  // delante, así que esto no puede pasar — pero es una DIVISIÓN, y el
  // día que alguien llame a esta función desde otro sitio, un cero no da
  // error: da `Infinity`, y de ahí sale un `NaN` escrito en la pantalla
  // como meta del día. El suelo se queda, y por eso hay que probarlo:
  // una rama que nadie recorre es una rama que nadie arregla.
  const cero = metaDelDia(META, { P: 900, C: 1200, G: 360, A: 10 }, 7, 0);
  ok([cero.P, cero.C, cero.G].every(function(v){ return isFinite(v); }),
     'y con cero días restantes no salen infinitos ni NaN',
     JSON.stringify(cero));
}

// ------------------------------------------------------------------
console.log('\nY la regla de quitar calorías es una sola');
{
  // Sin nada que quitar, nada se mueve.
  for (const c of [0, -100, null, undefined, NaN]) {
    const m = quitarCalorias(META, c);
    ok(m.P === META.P && m.C === META.C && m.G === META.G,
       'quitar ' + String(c) + ' calorías no cambia nada', JSON.stringify(m));
  }

  // Quita exactamente lo que se le pide.
  const m = quitarCalorias(META, 300);
  ok(Math.abs(cal(META) - cal(m) - 300) < 0.5,
     'quitar 300 calorías quita 300', 'quitó ' + Math.round(cal(META) - cal(m)));
  ok(m.P === META.P, 'y nunca de la proteína');

  // Sin carbo ni grasa que recortar no hay de dónde: se deja como está.
  const soloP = { P: 150, C: 0, G: 0 };
  const r = quitarCalorias(soloP, 300);
  ok(r.P === 150 && r.C === 0 && r.G === 0,
     'y con solo proteína en la meta no se recorta nada',
     'recortar de la proteína es lo único que esta app no hace: ' + JSON.stringify(r));
}

// ------------------------------------------------------------------
console.log('\nY la reserva de un evento usa esa misma regla');
{
  const apartar = fn('function apartarParaEvento(');
  ok(apartar && /quitarCalorias\(/.test(apartar),
     '`apartarParaEvento` reparte con `quitarCalorias`',
     'si cada sitio se escribe su propia división entre carbo y grasa, el día ' +
     'que una\n         cambie las otras se quedan atrás sin que nadie lo note');
  ok(apartar && !/calC \/ base/.test(apartar),
     'y ya no lleva su propia copia de la cuenta');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
