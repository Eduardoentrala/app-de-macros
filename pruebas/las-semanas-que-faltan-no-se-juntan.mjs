// Saltarse un mes te subía las calorías 254 al día.
//
// `medirGasto` ajusta una recta sobre las medias semanales de peso y de
// ahí saca el gasto real: lo que comes menos lo que la báscula dice que
// estás ganando o perdiendo. Es el número que mueve tus calorías cada
// lunes, así que la pendiente tiene que estar bien.
//
// Y el eje x de esa recta eran las POSICIONES EN LA LISTA:
//
//     Sx += w[i] * i;   Sxy += w[i] * i * s[i].peso_medio;
//
// La lista solo lleva las semanas que cuentan —cinco días apuntados y
// dos pesajes, mínimo—, así que una semana floja no entra y la
// siguiente ocupa su sitio como si fuera la de al lado. Un mes sin
// apuntar se comprimía en un hueco de una semana, y toda la bajada de
// ese mes se le atribuía a los siete días siguientes.
//
// La misma persona, bajando al MISMO ritmo real de 0,3 kg por semana:
//
//     seis semanas seguidas     -0,30 kg/sem  ->  gasto 2330
//     las mismas con un hueco   -0,53 kg/sem  ->  gasto 2584
//
// Y pasaba el filtro de cordura —2584 contra un estimado de 2300 es un
// 12%, por debajo del 30% de margen—, así que se daba por bueno.
//
// EL SENTIDO ES EL CRUEL. Faltar semanas hace creer a la app que gastas
// más, o sea que te sube las calorías justo cuando dejaste de apuntar.
//
// Y EL MISMO FALLO EN EL PESO POR ANTIGÜEDAD. El comentario promete
// «cada VIDA_MEDIA semanas lo de atrás pesa la mitad» y la cuenta era
// `edad = (n - 1) - i`, que son posiciones. Tres semanas de hace un año
// pesaban como si fueran de hace tres.
//
// Las dos cuentas prometen semanas en su propio comentario —«kg por
// semana», «cada ocho semanas»— y las dos contaban otra cosa. Con las
// semanas seguidas dan el mismo número, que es por lo que nadie lo vio.
//
// UNA MUTACIÓN QUE NO CAE, Y ESTÁ BIEN QUE NO CAIGA. Quitar el `- t[0]`
// de `posicionesEnSemanas` —contar semanas desde 1970 en vez de desde
// la primera de la serie— no rompe nada, y no puede romperlo: una recta
// de mínimos cuadrados es invariante a desplazar el eje x, y las edades
// son restas entre posiciones. Medido con sesenta semanas y una bajada
// de 20 g por semana, que es donde más muerde la cancelación, la
// diferencia es de 1e-10 relativo y el gasto sale idéntico al entero.
// El `- t[0]` se queda porque deja los números pequeños y porque el
// respaldo sin fechas también empieza en cero, no porque haga falta.

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

// La función de verdad, con sus constantes de verdad.
const iGM = LIMPIO.indexOf('var GM = {');
const GM = LIMPIO.slice(iGM, LIMPIO.indexOf('};', iGM) + 2);
const piezas = [GM, 'var KCAL_POR_KG = 7700;', fn('function margenDe('),
                fn('function posicionesEnSemanas('), fn('function medirGasto(')];
if (!GM || iGM < 0 || !piezas[2] || !piezas[4]) {
  console.log('  FALLA  no encuentro la medición del gasto en app.js');
  console.log('\n0 bien, 1 mal');
  process.exit(1);
}
const medir = new Function(
  piezas.filter(Boolean).join('\n') + '; return medirGasto;')();

// Un lunes cada siete días desde el que se diga.
const sem = (iso, cal, peso, dias = 7) =>
  ({ semana: iso, dias_apuntados: dias, media_cal: cal, peso_medio: peso });

// ------------------------------------------------------------------
console.log('\nSeis semanas seguidas, bajando 0,3 kg comiendo 2000');
const SEGUIDAS = [
  sem('2026-09-01', 2000, 84.0), sem('2026-09-08', 2000, 83.7),
  sem('2026-09-15', 2000, 83.4), sem('2026-09-22', 2000, 83.1),
  sem('2026-09-29', 2000, 82.8), sem('2026-10-06', 2000, 82.5),
];
const base = medir(SEGUIDAS, 2300);
{
  ok(base.estado === 'ok', 'se mide', JSON.stringify(base));
  ok(Math.abs(base.kg_por_semana + 0.3) < 0.01, 'y la pendiente es la de verdad',
     'salió ' + base.kg_por_semana);
  ok(base.gasto === 2330, 'y el gasto son 2330', 'salió ' + base.gasto);
}

// ------------------------------------------------------------------
console.log('\nLas mismas seis con un mes de hueco en medio');
{
  // El peso siguió bajando a 0,3 por semana mientras no apuntaba. Del
  // 15 de septiembre al 20 de octubre hay CINCO saltos de semana —las
  // cuatro que faltan más la de vuelta—, o sea 1,5 kg: 83,4 → 81,9. Lo
  // único que cambia respecto a la serie de arriba es que esas cuatro
  // no están en la lista.
  const CON_HUECO = [
    sem('2026-09-01', 2000, 84.0), sem('2026-09-08', 2000, 83.7),
    sem('2026-09-15', 2000, 83.4),
    // 09-22, 09-29, 10-06 y 10-13: sin apuntar
    sem('2026-10-20', 2000, 81.9), sem('2026-10-27', 2000, 81.6),
    sem('2026-11-03', 2000, 81.3),
  ];
  const r = medir(CON_HUECO, 2300);
  ok(r.estado === 'ok', 'se mide igual', JSON.stringify(r));
  ok(Math.abs(r.kg_por_semana + 0.3) < 0.02,
     'y la pendiente sigue siendo 0,3 por semana',
     'salió ' + r.kg_por_semana + '. Con el índice como eje, el mes de hueco ' +
     'vale una\n         semana y toda su bajada se le carga a los siete días ' +
     'siguientes');
  ok(Math.abs(r.gasto - base.gasto) <= 5,
     'y el gasto es el mismo que si no hubiera faltado',
     'seguidas ' + base.gasto + ', con hueco ' + r.gasto + ' — ' +
     Math.abs(r.gasto - base.gasto) + ' calorías al día de diferencia por no ' +
     'apuntar,\n         y en el sentido que te las SUBE');
}

// ------------------------------------------------------------------
console.log('\nY si durante el hueco no bajó nada, tampoco se inventa');
{
  // Mismo hueco, pero vuelve pesando lo mismo que se fue. El ritmo real
  // de todo el tramo es mucho más lento que el de las tres primeras.
  const PARADO = [
    sem('2026-09-01', 2000, 84.0), sem('2026-09-08', 2000, 83.7),
    sem('2026-09-15', 2000, 83.4),
    sem('2026-10-20', 2000, 83.4), sem('2026-10-27', 2000, 83.3),
    sem('2026-11-03', 2000, 83.2),
  ];
  const r = medir(PARADO, 2300);
  ok(r.estado === 'ok' && Math.abs(r.kg_por_semana) < 0.12,
     'un mes parado sale como un mes parado, no como una bajada',
     JSON.stringify(r));
}

// ------------------------------------------------------------------
console.log('\nY lo viejo pesa la mitad cada ocho SEMANAS, no cada ocho filas');
{
  // Tres semanas de hace casi un año comiendo 3000, y tres de ahora
  // comiendo 2000. Contando filas, las viejas valen 0,65 de una reciente
  // y la media sale muy por encima de 2000. Contando semanas, valen 0,02.
  const VIEJAS_Y_NUEVAS = [
    sem('2026-01-05', 3000, 90.0), sem('2026-01-12', 3000, 89.7),
    sem('2026-01-19', 3000, 89.4),
    sem('2026-10-19', 2000, 83.0), sem('2026-10-26', 2000, 82.7),
    sem('2026-11-02', 2000, 82.4),
  ];
  const r = medir(VIEJAS_Y_NUEVAS, 2300);
  ok(r.estado === 'ok' && r.media_cal < 2100,
     'una temporada de hace diez meses casi no cuenta',
     'la media ponderada salió ' + (r.media_cal) + ' · ' + JSON.stringify(r) +
     '\n         contando filas, tres semanas de enero pesan como si fueran ' +
     'de hace tres\n         semanas y arrastran la media hacia sus 3000');
}

// ------------------------------------------------------------------
console.log('\nY nada de esto cambia a quien apunta todas las semanas');
{
  // LA GARANTÍA QUE IMPORTA. Con las semanas seguidas, las semanas de
  // calendario y las posiciones son el mismo número, así que el arreglo
  // no le mueve el gasto a nadie que ya lo tuviera bien.
  ok(base.gasto === 2330 && Math.abs(base.kg_por_semana + 0.3) < 0.01,
     'el caso seguido da exactamente lo que daba antes');

  // Cinco días apuntados pesan menos que siete, que es lo de siempre.
  const FLOJA = [
    sem('2026-09-01', 2000, 84.0), sem('2026-09-08', 2000, 83.7),
    sem('2026-09-15', 2000, 83.4), sem('2026-09-22', 2000, 83.1, 5),
  ];
  const r = medir(FLOJA, 2300);
  ok(r.estado === 'ok' && r.dias === 26,
     'y los días apuntados siguen contando dentro de cada semana',
     JSON.stringify(r));

  // Menos de tres semanas no se mide, y eso no se toca.
  ok(medir([SEGUIDAS[0], SEGUIDAS[1]], 2300).estado === 'faltan_semanas',
     'y con dos semanas sigue sin medirse');

  // Sin fecha en las semanas no se revienta: se cae al índice, que es lo
  // que se hacía antes para todas.
  const SIN_FECHA = SEGUIDAS.map((x) => ({ ...x, semana: null }));
  const r2 = medir(SIN_FECHA, 2300);
  ok(r2.estado === 'ok' && Math.abs(r2.kg_por_semana + 0.3) < 0.01,
     'y una serie sin fechas no se cae: cuenta por posición como antes',
     JSON.stringify(r2));
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
