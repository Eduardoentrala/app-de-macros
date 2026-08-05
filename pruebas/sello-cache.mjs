// Que la app publicada no se quede rancia en el teléfono.
//
// El fallo que cierra esto: se subió el buscador de guardados y lo de
// frecuentes, se comprobó que GitHub Pages servía el archivo nuevo byte a
// byte... y en el celular seguía sin salir. No era el servidor: era que
// `app.js` se pedía siempre con la misma dirección, así que para el
// teléfono era el mismo archivo de siempre y se quedaba con su copia.
//
// Esta prueba es la que impide que vuelva a pasar en silencio: si app.js
// cambia y nadie vuelve a sellar, salta aquí y no en el móvil de alguien
// tres días después.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { selloDe, PATRON_SELLO, sellar } from '../herramientas/sellar.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8');

let ok = 0, mal = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { mal++; console.log(`  FALLA ${n}${extra ? '\n        ' + extra : ''}`); }
};

console.log('\n— El sello está y está al día —');
{
  const m = HTML.match(PATRON_SELLO);
  check('index.html lleva sello', !!m);
  const esperado = selloDe(APP);
  check('el sello corresponde al app.js de ahora',
    m && m[2] === esperado,
    m ? `pone ${m[2]}, toca ${esperado} — ejecuta: node herramientas/sellar.mjs` : '');
  // Que no se quedara el marcador de relleno del primer día.
  check('no es el valor de relleno', m && m[2] !== '0000000000');
  check('sellar() dice que no hay nada pendiente', sellar({ escribir: false }).cambio === false);
}

console.log('\n— Y se carga como debe —');
{
  check('la dirección lleva el sello cuando hay servidor',
    /'app\.js' \+ \(location\.protocol === 'file:' \? '' : '\?v=' \+ SELLO\)/.test(HTML));
  // Abrir el index a doble clic tiene que seguir funcionando: ahí no hay
  // caché de servidor que burlar, y una consulta en la dirección puede
  // dejar al navegador sin encontrar el archivo.
  check('a doble clic (file://) se carga sin sello',
    /location\.protocol === 'file:' \? ''/.test(HTML));
  // Ya no debe quedar la etiqueta de siempre, o se cargaría dos veces.
  check('no queda el <script src="app.js"> antiguo',
    !/<script src="app\.js"><\/script>/.test(HTML));
  check('app.js se carga una sola vez',
    (HTML.match(/appendChild\(s\)/g) || []).length === 1);
}

console.log('\n— El sello sale del contenido, no del reloj —');
{
  // Si dependiera de la fecha, cada publicación obligaría a descargar la
  // app entera aunque no hubiera cambiado nada.
  check('mismo contenido, mismo sello', selloDe('hola') === selloDe('hola'));
  check('contenido distinto, sello distinto', selloDe('hola') !== selloDe('holaa'));
  // El repositorio usa CRLF y Git puede cambiarlos al clonar. Sin
  // normalizar, el mismo código daría sellos distintos en Windows y en una
  // Mac, y la app se recargaría entera sin motivo.
  check('CRLF y LF dan el mismo sello',
    selloDe('a\r\nb\r\nc') === selloDe('a\nb\nc'));
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);
