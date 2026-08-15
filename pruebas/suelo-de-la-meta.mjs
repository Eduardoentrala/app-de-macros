// La meta de hoy nunca baja del mínimo sano.
//
// EL FALLO, MEDIDO CON LA FÓRMULA REAL:
//
// La app compensa: si te pasaste ayer, hoy te toca menos. Bien. Pero esa
// compensación NO estaba acotada por abajo. Con una meta de 2.315 cal,
// comiendo 1,5 veces eso cinco días seguidos —unas vacaciones, una
// Navidad— salía:
//
//     día 5 →   772 cal
//     día 6 →  −579 cal
//     día 7 → −4.630 cal
//
// O sea: la app decía que comieras 772 calorías, por debajo de su PROPIO
// mínimo de 1.200, y luego números negativos que no significan nada.
//
// El suelo existía —`Math.max(1200, base × 0.65)`— pero vivía dentro de
// `apartarParaEvento`, así que solo protegía cuando había un evento
// apartando calorías. La compensación normal, que es la que pasa todas las
// semanas, no lo tenía.
//
// Y lo decía justo al volver de una mala semana, que es cuando más caso se
// le hace a una app. Compensar está bien; castigar no.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');

let ok = 0, mal = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { mal++; console.log(`  FALLA ${n}${extra ? '\n        ' + extra : ''}`); }
};

console.log('\n— El suelo cubre TODOS los caminos —');
{
  const i = APP.indexOf('var hoyEsEvento = !!EVENTOS[isoDe(HOY)];');
  const fn = APP.slice(i, i + 2200);
  check('el trozo existe', i > 0);

  // Antes se calculaba DENTRO del `if(reserva > 0)`, así que solo existía
  // cuando había evento. Ahora se saca fuera y aplica siempre.
  check('el suelo se calcula fuera del caso de evento',
    fn.indexOf('var pisoDia =') < fn.indexOf('if(reserva > 0)'),
    'dentro del if, solo protege cuando hay un evento apartando calorías');
  check('y se aplica DESPUÉS de todo lo demás',
    fn.indexOf('if(reserva > 0)') < fn.indexOf('if(calDe(metaHoy) < pisoDia)'),
    'tiene que ser la última palabra, o un ajuste posterior lo puede hundir otra vez');

  check('es 1.200 o el 65% de su meta, lo que sea mayor',
    /Math\.max\(1200, calDe\(\{P:P, C:C, G:G\}\) \* 0\.65\)/.test(fn));
  // La proteína es lo que se protege cuando hay que recortar.
  check('la proteína se queda en su base', /\{ P: P, C: \(restoCal/.test(fn));
  check('y el resto se reparte como ya lo tenía',
    /restoCal \* \(basC \/ baseCG\)/.test(fn) && /restoCal \* \(basG \/ baseCG\)/.test(fn));
  // Sin macros base no hay proporción que aplicar: se cae a solo proteína
  // en vez de dividir por cero.
  check('sin carbos ni grasa base no se divide por cero',
    /baseCG > 0[\s\S]{0,200}\{ P: P, C: 0, G: 0 \}/.test(fn));
}

console.log('\n— Y la cuenta, corrida de verdad —');
{
  // La fórmula tal cual está en la app, no una descripción de ella.
  const P = 170, C = 240, G = 75;
  const calDe = (m) => m.P * 4 + m.C * 4 + m.G * 9;
  const piso = Math.max(1200, calDe({ P, C, G }) * 0.65);

  const metaDe = (dia, factor, conSuelo) => {
    const du = dia - 1, dr = Math.max(1, 8 - dia), dc = du + dr;
    const antes = { P: P * factor * du, C: C * factor * du, G: G * factor * du };
    let m = { P: (P*dc - antes.P)/dr, C: (C*dc - antes.C)/dr, G: (G*dc - antes.G)/dr };
    if (conSuelo && calDe(m) < piso) {
      const resto = Math.max(0, piso - P*4), bC = C*4, bG = G*9, bs = bC + bG;
      m = bs > 0 ? { P: P, C: (resto*(bC/bs))/4, G: (resto*(bG/bs))/9 } : { P: P, C: 0, G: 0 };
    }
    return m;
  };

  // Primero: que el fallo era real y alcanzable, no teórico.
  check('sin suelo, el día 5 comiendo 1,5× salía por debajo del mínimo',
    calDe(metaDe(5, 1.5, false)) < 1200,
    `daba ${Math.round(calDe(metaDe(5, 1.5, false)))} cal`);
  check('y el día 6 salía NEGATIVO', calDe(metaDe(6, 1.5, false)) < 0,
    `daba ${Math.round(calDe(metaDe(6, 1.5, false)))} cal`);

  // Y ahora: ninguna combinación baja del suelo.
  let peor = Infinity, negativas = 0;
  for (const factor of [0.5, 1, 1.5, 2, 2.5, 3]) {
    for (let dia = 1; dia <= 7; dia++) {
      const cal = calDe(metaDe(dia, factor, true));
      if (cal < peor) peor = cal;
      if (cal < 0) negativas++;
    }
  }
  check('ninguna meta negativa, con ningún exceso', negativas === 0);
  check('ninguna por debajo del suelo', peor >= piso - 1,
    `la peor daba ${Math.round(peor)} y el suelo es ${Math.round(piso)}`);

  // Y la proteína aguanta: es lo último que se recorta.
  const m = metaDe(7, 3, true);
  check('la proteína se mantiene aunque se pase muchísimo', Math.round(m.P) === P,
    `dio ${Math.round(m.P)} g en vez de ${P}`);
  check('y el suelo no se queda corto para ella', piso >= P * 4,
    'si el suelo no cubriera ni la proteína base, el reparto daría negativo');
}

console.log('\n— Y se dice, no se hace en silencio —');
{
  const i = APP.indexOf('if(pisoTocado){');
  const fn = APP.slice(i, i + 800);
  // El texto se arma concatenando trozos, así que una frase puede quedar
  // partida por un `' + '` en mitad. Se pegan los trozos antes de buscar:
  // si no, la prueba se pone roja al reescribir el mensaje aunque diga
  // exactamente lo mismo. Ya pasó.
  const frase = fn.replace(/'\s*\+\s*\n?\s*'/g, '').replace(/\s+/g, ' ');
  check('hay aviso cuando el suelo para la cuenta', i > 0);
  check('dice en cuántas calorías queda', /mil\(calHoyMeta\)/.test(fn));
  // El motivo importa más que el número: sin él parece un capricho.
  check('y por qué no baja más', /sano ni funciona/.test(frase));
  check('dice que lo que sobra se olvida', /se olvida/.test(fn),
    'sin esto se queda la duda de si la deuda sigue viva la semana que viene');

  // Gana a "ya se enseñó hoy": no es un ajuste más, es un tope de
  // seguridad, y callarlo deja a alguien pensando que hoy le tocan 1.200
  // porque sí.
  check('este aviso gana a los demás',
    APP.indexOf('if(pisoTocado){') < APP.indexOf('} else if(!avisoAjustePendiente){'));
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);
