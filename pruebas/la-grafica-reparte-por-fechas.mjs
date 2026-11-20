// La gráfica repartía los pesajes a pasos iguales, como si te pesaras
// todos los días.
//
// `tendenciaDePeso` ya se arregló, y su comentario dice por qué:
//
//     «Recta de mínimos cuadrados sobre los pesajes del periodo, con los
//      DÍAS de verdad en el eje y no la posición en la lista. (…) los
//      pesajes no van uno detrás de otro —te pesas tres días seguidos, te
//      saltas nueve, vuelves— y contándolos como si estuvieran repartidos
//      la pendiente sale de un calendario que no existe.»
//
// El titular se corrigió. El DIBUJO que tiene justo debajo se quedó atrás:
// `x(i)` era `L + i * (R - L) / (n - 1)`, o sea la posición en la lista.
//
// Así que la cifra y la línea contaban cosas distintas sobre los mismos
// datos. Y donde más se ve es en «el año», que es donde los huecos son de
// meses: cinco pesajes de enero y uno de diciembre salían como seis puntos
// a pasos iguales, con las etiquetas «ene ene ene dic» debajo. Once meses
// de hueco dibujados del mismo ancho que un día.
//
// No es un detalle de estilo: una línea que baja suave de enero a diciembre
// y una que baja de golpe en enero y luego se queda plana once meses son
// dos historias distintas, y la segunda es la verdadera.
//
// Las etiquetas de abajo van igual: cogidas por posición se amontonaban
// todas en el mes que tiene los pesajes.

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

const svgDeSerie = new Function(fn('function svgDeSerie(pts, etiquetaX){') +
  '\nreturn svgDeSerie;')();

// Las x de la línea, leídas del SVG que se dibuja de verdad.
const equis = (svg) => {
  const m = /<polyline[^>]*points="([^"]*)"/.exec(svg);
  if (!m) throw new Error('no hay línea en el svg');
  return m[1].trim().split(/\s+/).map((par) => Number(par.split(',')[0]));
};
// Los bordes del dibujo salen del código, no copiados aquí: si cambian, lo
// que esta prueba mide sigue siendo lo mismo.
const BORDES = /var W = 320, H = 180, L = (\d+), R = (\d+)/.exec(sinC(APP));
const L = Number(BORDES[1]), R = Number(BORDES[2]);
const pct = (x) => (x - L) / (R - L) * 100;

const dia = (n, v) => ({ d: new Date(2026, 0, 1 + n, 12), v: v });

// CUÁNDO SE PISAN DOS FECHAS. No es un número a ojo ni una copia del tope
// del código: sale del tamaño de letra que el propio SVG escribe. Un rótulo
// de cinco cifras —«11-19»— a ese tamaño ocupa unos 24 px, o sea un 8,6 %
// del eje; dos que no se toquen necesitan además medio ancho de aire cada
// uno. Doce por ciento es el suelo de «se leen por separado».
const FUENTE = Number(/font-size="([\d.]+)" fill="var\(--ink-faint\)" text-anchor/
  .exec(sinC(APP))[1]);
const PEGADAS = (5 * FUENTE * 0.5 * 1.5) / (R - L) * 100;

// ------------------------------------------------------------------
console.log('\nUn hueco de meses se dibuja como un hueco de meses');
{
  // Tres pesajes seguidos en enero y uno en abril: el hueco es el 97 % del
  // tiempo que cubre la gráfica.
  const svg = svgDeSerie([dia(0, 85), dia(1, 84.5), dia(2, 84), dia(100, 80)], () => 'x');
  const xs = equis(svg).map(pct);

  ok(xs.length === 4, 'los cuatro puntos están', JSON.stringify(xs));
  ok(xs[2] < 10,
     'los tres de enero se quedan juntos a la izquierda',
     'el tercero cayó en el ' + Math.round(xs[2]) + ' % del ancho; por ' +
     'posición\n         le tocaba el 67 %, que es dibujar dos días como ' +
     'dos tercios del año');
  ok(xs[3] > 95,
     'y el de abril, al final',
     'cayó en el ' + Math.round(xs[3]) + ' %');
  ok(xs[3] - xs[2] > 80,
     'con el hueco entero entre los dos',
     'el hueco salió del ' + Math.round(xs[3] - xs[2]) + ' % del ancho y ' +
     'son 98 días de 100');
  ok(!/NaN/.test(svg), 'sin NaN');

  // Y LA PROPORCIÓN ES LA DE VERDAD, no «más o menos a la derecha».
  const esperado = [0, 1, 2, 100].map((d) => d / 100 * 100);
  const desvio = Math.max.apply(null, xs.map((x, i) => Math.abs(x - esperado[i])));
  ok(desvio < 1,
     'y cada punto cae donde le toca por fecha',
     'el que más se desvía lo hace un ' + desvio.toFixed(1) + ' %: ' +
     JSON.stringify(xs.map((x) => Math.round(x * 10) / 10)));
}

// ------------------------------------------------------------------
console.log('\nY pesándose a diario sale exactamente igual que antes');
{
  // Lo que no puede pasar es que el arreglo mueva la gráfica de quien se
  // pesa todos los días, que son casi todas.
  const xs = equis(svgDeSerie([0, 1, 2, 3, 4].map((n) => dia(n, 85 - n * 0.2)), () => 'x'));
  const paso = xs[1] - xs[0];
  const parejos = xs.every((x, i) => i === 0 || Math.abs((x - xs[i - 1]) - paso) < 0.01);
  ok(parejos, 'cinco días seguidos salen a pasos iguales',
     JSON.stringify(xs) + '\n         con un pesaje al día, por fecha y por ' +
     'posición es lo mismo: si aquí\n         cambia algo, el arreglo rompió ' +
     'el caso corriente');
  ok(Math.abs(xs[0] - L) < 0.01 && Math.abs(xs[xs.length - 1] - R) < 0.01,
     'y de borde a borde', JSON.stringify([xs[0], xs[xs.length - 1], L, R]));
}

// ------------------------------------------------------------------
console.log('\nY las fechas de abajo no se amontonan');
{
  // Cogidas por posición, tres de las cuatro caían en los días seguidos y
  // se pisaban unas a otras.
  const marcas = (svg) =>
    (svg.match(/<text[^>]*text-anchor[^>]*>([^<]*)<\/text>/g) || [])
      .map((t) => Number(/x="([\d.]+)"/.exec(t)[1]));

  const svg = svgDeSerie([dia(0, 85), dia(1, 84.5), dia(2, 84), dia(100, 80)],
                         (p) => String(p.d.getMonth() + 1) + '/' + p.d.getDate());
  const xs = marcas(svg).map(pct).sort((a, b) => a - b);
  ok(xs.length >= 2, 'hay fechas en el eje', JSON.stringify(xs));
  ok(xs[xs.length - 1] - xs[0] > 80,
     'y van repartidas a lo largo del eje',
     'ocupan del ' + Math.round(xs[0]) + ' % al ' + Math.round(xs[xs.length - 1]) +
     ' %\n         por posición, tres caían en los dos primeros días: tres ' +
     'etiquetas\n         encima de la misma pulgada de pantalla');

  // Y ninguna pareja pegada: dos textos a menos de un 8 % se solapan.
  const juntas = xs.some((x, i) => i > 0 && x - xs[i - 1] < PEGADAS);
  ok(!juntas, 'y ninguna pisa a la de al lado', JSON.stringify(xs));

  // EL AÑO DE VERDAD, que es donde esto se nota: diez pesajes en enero, uno
  // en junio y uno en diciembre.
  //
  //  Cogiendo los rótulos por POSICIÓN, los cuatro candidatos son los
  //  índices 0, 4, 8 y 11 — o sea tres pesajes de la primera semana de enero
  //  y el de diciembre—, así que al tirar los que se pisan quedan DOS: enero
  //  y diciembre. Medio eje en blanco y junio sin nombre.
  //
  //  Por tiempo, el candidato del segundo cuarto es el de junio, que está en
  //  mitad del eje y sobrevive. Tres fechas donde antes había dos, y la de
  //  en medio diciendo de cuándo es el tramo plano.
  const anio = Array.from({ length: 10 }, (_, i) => dia(i, 85 - i * 0.1))
    .concat([dia(151, 82), dia(334, 80)]);
  const xa = marcas(svgDeSerie(anio, (p) => String(p.d.getMonth() + 1)))
    .map(pct).sort((a, b) => a - b);
  ok(xa.length >= 3,
     'y en un año con los pesajes apelotonados salen tres fechas, no dos',
     'salieron ' + xa.length + ': ' + JSON.stringify(xa.map(Math.round)) +
     '\n         por posición los cuatro candidatos caen en la primera semana ' +
     'de enero\n         más el último, y al quitar los que se pisan quedan dos');
  ok(xa.some((x) => x > 25 && x < 75),
     'y una cae en el tramo de en medio',
     JSON.stringify(xa.map(Math.round)) + '\n         es la que dice de cuándo ' +
     'es el trozo plano del dibujo');
  ok(!xa.some((x, i) => i > 0 && x - xa[i - 1] < PEGADAS),
     'y siguen sin pisarse', JSON.stringify(xa.map(Math.round)));

  // Y LA ÚLTIMA MANDA SOBRE LA ANTERIOR, que es el único caso que el filtro
  // de ida no puede resolver: la del final se pone siempre —es la fecha del
  // último dato— así que es ella la que puede quedar encima de la de antes.
  //
  //  Con pesajes en los días 0, 10, 90 y 100, el candidato del tercer cuarto
  //  es el del día 90: a un 10 % del último. Mirando solo hacia delante los
  //  dos sobreviven y se pisan; hay que tirar la de antes.
  const pegadas = marcas(svgDeSerie(
    [dia(0, 85), dia(10, 84), dia(90, 81), dia(100, 80)],
    (p) => String(p.d.getMonth() + 1) + '/' + p.d.getDate()
  )).map(pct).sort((a, b) => a - b);
  ok(!pegadas.some((x, i) => i > 0 && x - pegadas[i - 1] < PEGADAS),
     'y la de antes se tira si la última le queda encima',
     JSON.stringify(pegadas.map(Math.round)) +
     '\n         sin eso quedan dos fechas a un 10 % una de otra, y a 9,5 px ' +
     'de letra\n         eso es una encima de la otra');
  ok(pegadas[pegadas.length - 1] > 95,
     'y la que se queda es la del final, no la de antes',
     JSON.stringify(pegadas.map(Math.round)) +
     '\n         es la fecha del último pesaje: la que esa persona busca');
}

// ------------------------------------------------------------------
console.log('\nY los bordes siguen sin romperse');
{
  ok(!/NaN/.test(svgDeSerie([dia(0, 88)], () => 'x')),
     'con un solo punto');
  // Todos el MISMO día: el hueco de tiempo es cero y dividir por él daría
  // NaN. Ahí se vuelve al reparto por posición, que es lo único que queda.
  const mismoDia = [1, 2, 3].map(() => ({ d: new Date(2026, 7, 5, 12), v: 88 }));
  const svg = svgDeSerie(mismoDia, () => 'x');
  ok(!/NaN/.test(svg), 'y con tres medidas del mismo día tampoco',
     'el reparto por fecha divide por el hueco de tiempo, y aquí vale cero');
  const xs = equis(svg);
  ok(xs[0] === L && xs[xs.length - 1] === R,
     'y aun así se dibujan de borde a borde', JSON.stringify(xs));

  // Y al revés de lo esperado: una serie desordenada no puede salir con el
  // eje del revés. No debería pasar —las tres que llaman vienen ordenadas—
  // pero una x negativa dibuja la línea fuera del recuadro.
  const alReves = [dia(100, 80), dia(0, 85)];
  const r = equis(svgDeSerie(alReves, () => 'x'));
  ok(r.every((x) => x >= L && x <= R),
     'y nada se sale del recuadro con la serie al revés',
     JSON.stringify(r) + ' · el recuadro va de ' + L + ' a ' + R);

  // EL CASO QUE DE VERDAD NECESITA EL TOPE: los extremos en orden y uno de
  // en medio fuera. Con el de arriba el hueco sale negativo y se va por el
  // reparto por posición, así que no llega a probar el acotado; aquí el
  // hueco es de 100 días y el punto de en medio está en el 200, o sea al
  // doble de ancho que el recuadro.
  const enMedioFuera = [dia(0, 85), dia(200, 78), dia(100, 80)];
  const m2 = equis(svgDeSerie(enMedioFuera, () => 'x'));
  ok(m2.every((x) => x >= L && x <= R),
     'y tampoco con un punto de en medio fuera del periodo',
     JSON.stringify(m2) + ' · el recuadro va de ' + L + ' a ' + R +
     '\n         una x por encima de R dibuja la línea encima de los rótulos ' +
     'y fuera\n         del marco: el `viewBox` no recorta, solo encuadra');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
