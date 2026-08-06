// Pone en index.html un sello sacado del contenido de app.js.
//
// Para qué: instalada en el teléfono, la app se quedaba con su copia de
// app.js y la servía durante días. La dirección no cambiaba nunca, así que
// para el móvil siempre era el mismo archivo, y ni cerrándola del todo se
// enteraba de que había versión nueva.
//
// El sello sale del propio contenido, no de la fecha ni de un número que
// haya que acordarse de subir: si app.js no cambió, el sello es el mismo y
// el teléfono se queda con su copia, que es lo correcto. Si cambió, cambia
// solo y la copia vieja deja de valer.
//
// Se ejecuta ANTES de publicar:   node herramientas/sellar.mjs
// Y `pruebas/sello-cache.mjs` salta si se olvidó.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const RUTA_APP = join(RAIZ, 'docs', 'app.js');
const RUTA_HTML = join(RAIZ, 'docs', 'index.html');
const DIR_CSS = join(RAIZ, 'docs', 'estilos');

// Las hojas cuentan igual que app.js. Se aprendió por las malas: el arreglo
// del zoom -que ningún campo baje de 16px- vive en el CSS, se publicó, y la
// app instalada siguió sirviendo su copia de siempre. Un sello que solo
// mira app.js deja la mitad del trabajo sin llegar al teléfono.
function contenidoSellado() {
  const partes = [readFileSync(RUTA_APP, 'utf8')];
  // Ordenadas por nombre para que el sello no dependa de cómo devuelva los
  // archivos el sistema, que cambia entre Windows y una Mac.
  for (const f of readdirSync(DIR_CSS).filter(x => x.endsWith('.css')).sort())
    partes.push(readFileSync(join(DIR_CSS, f), 'utf8'));
  return partes.join('\n');
}

// Los saltos de línea se normalizan antes de resumir: el repositorio usa
// CRLF y Git puede cambiarlos al clonar. Sin esto, el mismo código daría
// sellos distintos en Windows y en una Mac, y la app se recargaría entera
// sin motivo. (Que es justo el caso de llevarse el proyecto a un portátil
// nuevo.)
export function selloDe(contenido) {
  return createHash('sha1').update(contenido.replace(/\r\n/g, '\n')).digest('hex').slice(0, 10);
}

// Se busca la línea completa para no tocar por accidente otra cosa que se
// parezca. El valor puede ser cualquier cadena entre comillas simples.
// Hay DOS: la de las hojas en el <head> y la de app.js al final. Las dos
// llevan el mismo sello, así que se reemplazan todas.
export const PATRON_SELLO = /(var SELLO = ')([^']*)(';)/g;

export function sellar({ escribir = true } = {}) {
  const sello = selloDe(contenidoSellado());
  const html = readFileSync(RUTA_HTML, 'utf8');

  const encontrados = html.match(PATRON_SELLO);
  if (!encontrados) throw new Error('no encontré «var SELLO = ...» en index.html');
  // Si un día se añade una tercera y alguien la deja sin reemplazar, mejor
  // enterarse aquí que descubrir que media app va con la versión de ayer.
  if (encontrados.length !== 2)
    throw new Error(`esperaba 2 sellos en index.html y hay ${encontrados.length}`);

  const anterior = html.match(/var SELLO = '([^']*)';/)[1];
  if (anterior === sello) return { sello, anterior, cambio: false };

  if (escribir) {
    // Se conservan los CRLF: el reemplazo no toca los finales de línea.
    writeFileSync(RUTA_HTML, html.replace(PATRON_SELLO, `$1${sello}$3`));
  }
  return { sello, anterior, cambio: true };
}

// Solo al ejecutarlo a mano, no al importarlo desde la prueba.
if (process.argv[1] && process.argv[1].endsWith('sellar.mjs')) {
  const r = sellar();
  console.log(r.cambio
    ? `sello: ${r.anterior} -> ${r.sello}`
    : `sello ya al día: ${r.sello}`);
}
