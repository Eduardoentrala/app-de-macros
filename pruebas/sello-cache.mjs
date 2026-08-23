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
  const sellos = HTML.match(PATRON_SELLO) || [];
  check('index.html lleva sello', sellos.length > 0);
  // Dos: uno para las hojas de estilo (en el <head>) y otro para app.js.
  check('hay uno para el CSS y otro para el JS', sellos.length === 2,
    `hay ${sellos.length}`);
  const valores = [...HTML.matchAll(/var SELLO = '([^']*)';/g)].map(x => x[1]);
  check('los dos llevan el mismo', new Set(valores).size === 1, valores.join(' / '));
  // Que no se quedara el marcador de relleno del primer día.
  check('no es el valor de relleno', valores.every(v => v !== '0000000000'));
  // La comprobación de verdad: que corresponda a lo que hay AHORA en el
  // disco. Si no, salta aquí y no en el móvil de alguien tres días después.
  check('sellar() dice que no hay nada pendiente', sellar({ escribir: false }).cambio === false,
    'ejecuta: node herramientas/sellar.mjs');
}

console.log('\n— El index tampoco se queda viejo —');
{
  // El agujero que quedaba: el sello arregla app.js y las hojas, pero no a
  // sí mismo. Vive DENTRO del index, que se pide siempre con la misma
  // dirección. Si el teléfono se queda con un index viejo, pide el JS y el
  // CSS viejos y no hay forma de enterarse. Pasó: se arregló un botón, se
  // comprobó que el servidor lo servía, y en el móvil seguía roto.
  const VERSION = readFileSync(join(RAIZ, 'docs', 'version.txt'), 'utf8').trim();
  const sello = (HTML.match(/var SELLO = '([^']*)';/) || [])[1];

  check('hay un archivo de versión', VERSION.length === 10, VERSION);
  check('y dice lo mismo que el index', VERSION === sello, `${VERSION} vs ${sello}`);

  check('la app lo consulta al abrirse', /fetch\('version\.txt', \{ cache: 'no-store' \}\)/.test(HTML));
  check('sin caché, o preguntaría a la copia vieja', /cache: 'no-store'/.test(HTML));
  // Sin el `$` del final ni la línea exacta: esto se puso rojo al añadirle
  // detrás `+ location.hash`, que hacía falta para que una versión recién
  // publicada no se comiera el enlace de recuperar la contraseña. Nada se
  // había roto. Lo que importa es que recargue con el sello nuevo.
  check('y si no coincide, se recarga con la versión nueva',
    /location\.replace\(location\.pathname \+ '\?v=' \+ nuevo/.test(HTML));
  check('llevándose la almohadilla, donde viene el enlace del correo',
    /'\?v=' \+ nuevo \+ location\.hash\)/.test(HTML),
    'sin esto, pulsar el enlace de recuperar justo tras un despliegue lo gasta para nada');
  // Sin freno, un despliegue a medias dejaría la app recargándose en bucle,
  // y una app que parpadea es peor que una desactualizada.
  check('con freno para no recargar en bucle',
    /sessionStorage\.getItem\('macros\.recargado'\) !== SELLO/.test(HTML) &&
    /sessionStorage\.setItem\('macros\.recargado', SELLO\)/.test(HTML));
  check('sin red se sigue con lo que hay', /\['catch'\]\(function\(\)\{\}\)/.test(HTML));

  // El index entra en el sello, o un cambio solo de HTML no avisaría a nadie.
  const SELLAR = readFileSync(join(RAIZ, 'herramientas', 'sellar.mjs'), 'utf8');
  check('el index cuenta para el sello', /partes\.push\(readFileSync\(RUTA_HTML, 'utf8'\)/.test(SELLAR));
  // Y se le quitan sus propios sellos antes, o esto se muerde la cola:
  // cambiar el sello cambia el index, que cambia el sello, y así siempre.
  check('quitándole antes sus propios sellos',
    /readFileSync\(RUTA_HTML, 'utf8'\)\.replace\(PATRON_SELLO, "\$1\$3"\)/.test(SELLAR));
  check('version.txt se escribe siempre, aunque el sello no cambie',
    /if \(escribir\) writeFileSync\(RUTA_VERSION, sello \+ '\\n'\);[\s\S]{0,120}if \(anterior === sello\)/.test(SELLAR),
    'si se quedara viejo, la app se recargaría en bucle buscando algo que no llega');
}

console.log('\n— Y el sello cubre también las hojas de estilo —');
{
  // Esto se aprendió por las malas: el arreglo del zoom -que ningún campo
  // baje de 16px- vive en el CSS. Se publicó, se comprobó que el servidor
  // lo servía... y la app instalada siguió con su copia de siempre, porque
  // el sello solo miraba app.js.
  check('cambiar una hoja cambia el sello',
    selloDe(APP + '\nbody{}') !== selloDe(APP + '\nbody{color:red}'));
  check('las hojas se piden con sello',
    /'estilos\/' \+ HOJAS\[i\] \+ '\.css' \+ \(suelto \? '' : '\?v=' \+ SELLO\)/.test(HTML));
  // El orden es la cascada: modo-app va el último porque apaga el marco de
  // maqueta. Escribirlas desde JS no puede alterarlo.
  const lista = (HTML.match(/var HOJAS = \[([^\]]*)\]/) || [, ''])[1]
    .split(',').map(s => s.trim().replace(/'/g, ''));
  check('están las ocho', lista.length === 8, lista.join(','));
  check('base va primero y modo-app el último',
    lista[0] === 'base' && lista[lista.length - 1] === 'modo-app', lista.join(','));
  // Ya no deben quedar <link> fijos, o se cargarían dos veces.
  check('no quedan <link> sueltos sin sello',
    !/<link rel="stylesheet" href="estilos\//.test(HTML));
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
