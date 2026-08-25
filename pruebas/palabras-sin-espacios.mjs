// Una palabra sin espacios se sale de su recuadro.
//
// EL FALLO. En todo el CSS de la app no había una sola regla de corte de
// palabra: ni `overflow-wrap`, ni `word-break`, ni `hyphens`. Y los huecos
// que reciben texto libre —el chat, la respuesta del chequeo semanal, el
// análisis de las fotos, el nombre de un alimento— van con `overflow:visible`.
// Resultado: lo que no cabe no se corta ni se envuelve, se pinta ENCIMA de lo
// de al lado y fuera del fondo de color.
//
// No hace falta rebuscar un caso hostil. Un correo no lleva espacios nunca, y
// una dirección de web tampoco. Basta con pegar uno en el chat.
//
// SE MIDIÓ EN EL NAVEGADOR, con las clases de verdad y un correo normal
// («maria.fernanda.rodriguez.gutierrez@correodeejemplomuylargo.com»):
//
//     antes    la burbuja da 359 px de hueco y el texto pedía 451
//     después  hueco 360, pide 360 — cabe exacto, envuelto
//
// Los cuatro huecos se midieron igual y los cuatro quedaron a cero de
// desbordamiento.
//
// POR QUÉ ESTA REGLA Y NO `word-break:break-all`: `break-all` parte también
// las palabras normales, y el texto del asistente son párrafos largos que
// quedarían cortados por cualquier sitio. `break-word` solo entra cuando una
// palabra no cabe de ninguna manera, que es exactamente el caso.
//
// Lo que se puede fijar desde aquí es que la regla siga puesta en los cuatro.
// El que mida cuánto ocupa es el navegador.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (f) => readFileSync(join(RAIZ, 'docs', 'estilos', f), 'utf8').replace(/\r\n/g, '\n');
const PANTALLAS = leer('pantallas.css');
const COMPONENTES = leer('componentes.css');
const DIARIO = leer('diario.css');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

// Saca una regla entera por su selector, sin depender de dónde caigan los
// saltos de línea.
function regla(css, selector) {
  const i = css.indexOf(selector + '{');
  if (i < 0) return null;
  return css.slice(i, css.indexOf('}', i) + 1).replace(/\s+/g, ' ');
}

// ------------------------------------------------------------------
console.log('\nLos huecos que reciben texto libre saben partir una palabra');
{
  const huecos = [
    [PANTALLAS,   '.ia-msg .burbuja',   'el chat: alguien pega un enlace o un correo'],
    [COMPONENTES, '.chq-respuesta',     'la respuesta del chequeo, que la escribe el modelo'],
    [COMPONENTES, '.analisis-txt',      'el análisis del mes, también del modelo'],
    [DIARIO,      '.food-card .fc-name','el nombre de un alimento, que lo teclea quien lo crea'],
  ];
  for (const [css, sel, porque] of huecos) {
    const r = regla(css, sel);
    ok(r !== null, `existe la regla de ${sel}`,
       'si se renombró, esta prueba dejó de mirar nada');
    ok(r !== null && /overflow-wrap:\s*break-word/.test(r),
       `${sel} parte lo que no cabe — ${porque}`,
       'sin esto el texto se pinta fuera del recuadro. Regla: ' + r);
  }
}

// ------------------------------------------------------------------
console.log('\nY no se parte por lo bruto');
{
  // `break-all` partiría también las palabras normales, y lo que va en estos
  // huecos son párrafos del asistente.
  for (const [css, sel] of [[PANTALLAS, '.ia-msg .burbuja'], [COMPONENTES, '.analisis-txt']]) {
    const r = regla(css, sel) || '';
    ok(!/word-break:\s*break-all/.test(r), `${sel} no usa break-all`,
       'cortaría los párrafos del asistente por cualquier letra');
  }
}

// ------------------------------------------------------------------
console.log('\nY el correo del panel se sigue cortando con puntos suspensivos');
{
  // Ese hueco NO lleva `break-word` a propósito: es una línea de una fila y
  // se corta con «…», que ahí se lee mejor que envolver a tres renglones.
  // Si algún día alguien le pone break-word, la fila crece y descuadra la
  // lista entera.
  const r = regla(PANTALLAS, '.cli-correo') || regla(COMPONENTES, '.cli-correo') || '';
  if (r) {
    ok(/text-overflow:\s*ellipsis/.test(r), 'sigue con puntos suspensivos',
       'se midió: se corta a 306 px de 307, con «…». Eso está bien.');
    ok(!/overflow-wrap:\s*break-word/.test(r),
       'y sin partir palabra, que ahí descuadraría la fila');
  } else {
    ok(true, '(no hay regla propia para .cli-correo; se salta)');
  }
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
