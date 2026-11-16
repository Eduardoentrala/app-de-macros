// La ficha del cliente: dos días sueltos, ninguna gráfica y ningún volumen.
//
// Es la pantalla desde la que se le arma el plan a alguien —Plan, picar a la
// persona— y lo que enseñaba del cuerpo eran cuatro filas de texto:
//
//   · EL PESO, como «el último contra el de hace 7 días» y «contra el de
//     hace 30». Dos días sueltos, con un peso que varía un kilo largo por
//     agua y sal: si el de hace siete cayó seco, la ficha decía que subió
//     ochocientos gramos sin que esa persona hubiera subido nada. Es el
//     mismo `fin - ini` que se quitó de la gráfica de la app.
//
//   · LA CINTURA, solo la última medida. Y una cintura suelta no dice nada:
//     88 no significa nada, 91 → 88 significa que está perdiendo grasa. Es
//     además la única medida que distingue grasa de músculo, que es lo que
//     la báscula no sabe hacer.
//
//   · EL VOLUMEN, que no estaba. Ni en la tarjeta, ni en `plan_metricas`, ni
//     en lo que recibe la IA al pulsar «Analizar» —que es ese mismo paquete—.
//     Para saber si alguien subió, mantuvo o bajó había que entrar a mirarle
//     las sesiones una por una.
//
// LA RECTA ES LA MISMA QUE LA DE SU PANTALLA. No por ahorrar código: si la
// ficha calculara su propia tendencia, el entrenador y la persona verían
// números distintos de los mismos pesajes y no habría forma de saber cuál
// creer. Por eso aquí se ejecuta `tendenciaDePeso` de verdad.

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
const SUELO = (LIMPIO.match(/^\s*var DIAS_DE_TENDENCIA = .*$/m) || [])[0];
if (!SUELO) throw new Error('no encuentro DIAS_DE_TENDENCIA');

const FUENTE = SUELO + '\n' +
  fn('function tendenciaDePeso(pts){') + fn('function lapso(dias){') +
  fn('function filaFicha(etiqueta, valor, meta){') +
  fn('function tarjetaFicha(titulo, filas, pie){') +
  fn('function tarjetaVacia(titulo, frase){') +
  fn('function diaCorto(iso){') +
  fn('function tarjetaDeSerie(titulo, pts, unidad, vacia){') +
  fn('function comparado(ahora, antes){') +
  fn('function pintarMetricas(){');

const hace = (n) => {
  const d = new Date(2026, 10, 15);
  d.setDate(d.getDate() - n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
         '-' + String(d.getDate()).padStart(2, '0');
};

// Se dibuja con `svgDeSerie`, que aquí se cambia por un espía: lo que importa
// comprobar no es la geometría del dibujo —eso ya lo usa media app— sino QUÉ
// puntos se le mandan.
function pintar(METRICAS) {
  const dibujos = [];
  const caja = { innerHTML: '' };
  new Function(
    'METRICAS', 'document', 'svgDeSerie', 'fmtFecha', 'escapar', 'mil', 'dibujos',
    FUENTE + '; pintarMetricas();'
  )(
    METRICAS, { getElementById: (id) => (id === 'fcMetricas' ? caja : null) },
    (pts) => { dibujos.push(pts); return '<svg data-n="' + pts.length + '"></svg>'; },
    (d) => d.getDate() + ' nov', (s) => String(s),
    (n) => String(n), dibujos
  );
  return { html: caja.innerHTML, dibujos };
}

// Un cliente con de todo, para no repetirlo en cada caso.
const base = {
  meta_cal: 2200, meta_p: 170, dias_entreno: 4, meta_cardio: 150,
  diario: { dias_7: 5, dias_30: 24, ultimo: hace(0), cal_dia_7: 2100, prot_dia_7: 150 },
  peso: { ultimo: 85.0, ultimo_dia: hace(0), apuntes_30: 20, serie: [] },
  cintura: { cm: null, dia: null, serie: [] },
  entreno: { sesiones_7: 4, sesiones_30: 16, ultima: hace(1) },
  cardio: { min_7: 45, min_30: 180 },
  volumen: {},
  fotos: {}, chequeo: {}, chequeos: [], ajustes_mano: []
};
const con = (extra) => Object.assign({}, base, extra);

// ------------------------------------------------------------------
console.log('\nEl peso se enseña dibujado y por su recta');
{
  // Catorce días planos con un lunes salado al principio: el primero contra
  // el último daría «bajó 2 kg», y no bajó nada.
  const serie = [];
  for (let i = 13; i >= 0; i--) serie.push({ d: hace(i), kg: i === 13 ? 87 : 85 });
  const r = pintar(con({ peso: Object.assign({}, base.peso, { serie: serie }) }));

  ok(/Cómo va su peso/.test(r.html), 'sale la tarjeta de la gráfica');
  ok(r.dibujos.length >= 1 && r.dibujos[0].length === 14,
     'y se le mandan los catorce pesajes, no dos',
     'se dibujaron ' + (r.dibujos[0] || []).length);
  ok(!/2\.0 kg/.test(r.html),
     'el pesaje con agua ya no sale como dos kilos perdidos',
     r.html.slice(r.html.indexOf('Cómo va su peso'), r.html.indexOf('Cómo va su peso') + 320));
  ok(/en 13 días/.test(r.html), 'y se dicen los días que hay entre el primero y el último',
     'no «en 30 días» ni el nombre de una ventana');
  ok(/Se pesó/.test(r.html) && /20 de 30 días/.test(r.html),
     'y debajo, cuántas veces se pesó',
     'es lo que dice si la recta de arriba se puede creer');

  // Y UNA BAJADA DE VERDAD SE VE ENTERA.
  const bajando = [];
  for (let i = 30; i >= 0; i -= 3) bajando.push({ d: hace(i), kg: 90 - (30 - i) * 0.1 });
  const b = pintar(con({ peso: Object.assign({}, base.peso, { serie: bajando }) }));
  ok(/Bajó 3\.0 kg/.test(b.html), 'una bajada sostenida sale entera',
     b.html.slice(b.html.indexOf('peso-resumen'), b.html.indexOf('peso-resumen') + 160));
}

console.log('\nY la cintura, que antes era un número suelto');
{
  const r = pintar(con({
    cintura: { cm: 88, dia: hace(0),
               serie: [{ d: hace(30), cm: 91 }, { d: hace(0), cm: 88 }] }
  }));
  ok(/Cómo va su cintura/.test(r.html), 'sale su tarjeta');
  ok(/Bajó 3\.0 cm/.test(r.html), 'y dice cuánto se movió, no solo cuánto mide',
     '«88» no significa nada; «91 → 88» significa que está perdiendo grasa. ' +
     r.html.slice(r.html.indexOf('Cómo va su cintura'), r.html.indexOf('Cómo va su cintura') + 300));
  // Se dibuja con sus dos medidas. En este caso es el único dibujo: el peso
  // de este cliente de mentira va sin serie a propósito, para que se vea que
  // una tarjeta no arrastra a la otra.
  const ultimo = r.dibujos[r.dibujos.length - 1] || [];
  ok(r.dibujos.length === 1 && ultimo.length === 2,
     'y se dibuja con sus dos medidas',
     'dibujos: ' + r.dibujos.length + ', puntos: ' + ultimo.length);

  // SIN MEDIDAS NO SE INVENTA UNA TARJETA VACÍA SIN EXPLICAR.
  const sin = pintar(con({}));
  ok(/No tiene ninguna medida de cintura/.test(sin.html),
     'y si no se ha medido nunca, se dice',
     'una tarjeta en blanco se lee como que algo falló');
  // Y EL PESO IGUAL. `hayPeso` puede ser cierto con la serie vacía: alguien
  // cuyo último pesaje es de hace cuatro meses tiene «último peso» y ni un
  // punto dentro de la ventana.
  ok(/No se ha pesado en los últimos 90 días/.test(sin.html),
     'y si tiene último peso pero ninguno en la ventana, también',
     sin.html.slice(0, 200));
}

// ------------------------------------------------------------------
console.log('\nY el volumen, que no estaba en ninguna parte');
{
  const r = pintar(con({
    volumen: { kg_30: 10500, kg_30_antes: 8000, kg_7: 5400, kg_7_antes: 5300,
               libres_30: 120, libres_30_antes: 90, libres_7: 12, libres_7_antes: 30 }
  }));
  ok(/Volumen del mes/.test(r.html), 'sale en la tarjeta de entrenamiento');
  ok(/10500 kg·rep/.test(r.html), 'con sus kilos por repetición',
     r.html.slice(r.html.indexOf('Volumen del mes'), r.html.indexOf('Volumen del mes') + 200));

  // LA PREGUNTA DE VERDAD: subió, se mantuvo o bajó.
  ok(/subió 31%/.test(r.html), 'y contra el periodo anterior: subió un 31 %',
     'sin la comparación, «10500» no dice absolutamente nada');
  ok(/se mantuvo/.test(r.html), 'y la semana, que casi no se movió, «se mantuvo»',
     'una banda del 2 %: la misma con la que el cierre del lunes lo juzga, ' +
     'o los dos lados de la app se contradirían sobre el mismo número');

  // LAS REPETICIONES SIN PESO, APARTE Y NUNCA SUMADAS.
  ok(/Repeticiones sin peso/.test(r.html), 'las repeticiones sin peso van por su lado');
  ok(/120 en el mes/.test(r.html), 'con las suyas', r.html.slice(r.html.indexOf('Repeticiones'), r.html.indexOf('Repeticiones') + 160));
  ok(!/10620/.test(r.html), 'y no se suman a los kilos',
     'quien cambia press de banca por dominadas no se derrumbó un 98 %');

  // A quien entrena todo con barra, una fila de ceros le quita sitio.
  const conBarra = pintar(con({ volumen: { kg_30: 10500, kg_30_antes: 8000, libres_30: 0 } }));
  ok(!/Repeticiones sin peso/.test(conBarra.html),
     'y si no hay ninguna, la fila no sale');
}

console.log('\nY «subió o bajó» se decide igual que en el cierre del lunes');
{
  const dime = new Function('a', 'b', fn('function comparado(ahora, antes){') +
                            '; return comparado(a, b);');
  ok(dime(110, 100) === 'subió 10%', dime(110, 100));
  ok(dime(90, 100) === 'bajó 10%', dime(90, 100));
  ok(dime(101, 100) === 'se mantuvo', dime(101, 100) + ' — un 1 % es ruido');
  ok(dime(98, 100) === 'se mantuvo', dime(98, 100));
  ok(dime(103, 100) === 'subió 3%', dime(103, 100));
  ok(dime(5000, 0) === 'sin periodo anterior con que comparar',
     'sin periodo anterior no se inventa un porcentaje',
     'dividir por cero daría «subió Infinity%»: ' + dime(5000, 0));
  ok(dime(0, 0) === '', 'y sin nada de nada, no se dice nada');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
