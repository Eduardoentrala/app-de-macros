// Ningún fallo se traga sin decidirlo a propósito.
//
// Había TRECE `catch(){}` vacíos en la app. Cada uno es un fallo que
// ocurre y del que nadie se entera nunca.
//
// No es teoría: uno de ellos era `guardarChequeo`. Si ese guardado
// fallaba, el lunes siguiente el cuestionario volvía a salir como si no
// se hubiera contestado — otra consulta de IA gastada y un segundo ajuste
// de calorías por el mismo periodo. Nadie lo habría relacionado jamás.
//
// Los peores eran los que decían "guardado" ANTES de que la base
// contestara: los macros nuevos y las calorías que acaba de decidir la
// IA. Se veían en pantalla, no estaban en la base, y al recargar volvían
// los viejos sin explicación.
//
// Callar puede estar bien —hay casos donde lo correcto es no molestar—,
// pero tiene que ser una DECISIÓN escrita, no un descuido. Esta prueba
// exige justamente eso: que cada silencio lleve su porqué al lado.
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

const lineas = APP.split('\n');

console.log('\n— Cada silencio lleva su porqué —');
{
  const vacios = [];
  lineas.forEach((l, i) => {
    if (/\['catch'\]\(function\(\)\{\}\)/.test(l)) vacios.push(i + 1);
  });

  // Se mira en la MISMA línea (comentario al final) y en las seis de
  // alrededor: unos van antes de la llamada y otros justo después.
  const justificado = (n) => {
    const desde = Math.max(0, n - 7), hasta = Math.min(lineas.length, n + 4);
    // Con y sin tilde: el fuente mezcla las dos formas y una prueba no
    // puede fallar por un acento.
    return /en silencio|CALLA A PROP[OÓ]SITO|no molestar/i.test(lineas.slice(desde, hasta).join('\n'));
  };

  const sinJustificar = vacios.filter((n) => !justificado(n));
  check('no queda ningún silencio sin explicar', sinJustificar.length === 0,
    sinJustificar.length
      ? 'líneas ' + sinJustificar.join(', ') + ' se tragan un fallo y no dicen por qué'
      : '');

  // Y que no vuelvan a crecer sin querer. Trece era el número de partida.
  check('y son pocos y contados', vacios.length <= 6,
    `hay ${vacios.length}; cada uno nuevo es un fallo que nadie va a ver`);
}

console.log('\n— Lo que decide calorías nunca calla —');
{
  // Estas dos son las que costaban de verdad: la pantalla enseñaba unos
  // números y la base guardaba otros.
  const i = APP.indexOf('function aplicarCaloriasNuevas(');
  const ap = APP.slice(i, i + 1600);
  check('las calorías de la IA avisan si no se guardan',
    /Tus calorías nuevas no se guardaron/.test(ap),
    'sin esto, el domingo siguiente el entrenador decide sobre una meta que nunca existió');

  const j = APP.indexOf("getElementById('wcAccept')");
  const wc = APP.slice(j, j + 1200);
  check('los macros a mano también', /No se pudieron guardar/.test(wc));
  // Y el "guardado" se dice DESPUÉS de que la base conteste, no antes.
  check('el aviso de éxito va después de la respuesta',
    wc.indexOf('.then(function(){ toast') < wc.indexOf("['catch']") &&
    /\.then\(function\(\)\{ toast\('toastPeso', 'Macros guardados'\); \}\)/.test(wc),
    'decir «guardado» antes de que conteste la base es prometer algo que no ha pasado');
}

console.log('\n— Lo que se carga avisa si no llega —');
{
  // Calladas, la app se ve vacía: parece que no hay rutina, ni
  // entrenamientos, ni fotos. Y quien lo cree los vuelve a meter.
  check('la rutina', /No pude cargar tu rutina/.test(APP));
  check('los entrenamientos', /No pude cargar tus entrenamientos/.test(APP),
    'sin ellos el cierre del domingo decide sin saber lo que entrenaste');
  check('las fotos', /No pude cargar tus fotos/.test(APP));
}

console.log('\n— Lo que ya se dio por hecho en pantalla —');
{
  // Estos dicen "listo" antes de que la base conteste. Si falla, hay que
  // desdecirse.
  check('el evento cancelado', /Sigue apuntado, inténtalo otra vez/.test(APP),
    'la app decía «quitado» y el evento seguía repartiendo la semana');
  check('el nombre del día de rutina', /No se pudo guardar el día/.test(APP));
  // El peor: en el panel, un plan que no carga y se guarda encima BORRA el
  // que esa persona sí tenía.
  check('el plan de un cliente en el panel',
    /No guardes o lo sobrescribes/.test(APP),
    'callarlo convierte un fallo de red en perdida de datos de otra persona');
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);
