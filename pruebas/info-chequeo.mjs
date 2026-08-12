// La «i» de cada pregunta del chequeo semanal.
//
// El cuestionario decide las calorías de la semana entera. Si alguien
// contesta «Bastante hambre» pensando en cómo está en ese momento —y no en
// la semana— la IA sube calorías sin motivo. La explicación existe para
// que se conteste sobre lo correcto.
//
// Cada explicación lleva SU botón de cerrar. Sin él la única salida es
// volver a tocar la «i», que ya no se ve porque el texto la empujó fuera de
// pantalla.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8');
const CSS = readFileSync(join(RAIZ, 'docs', 'estilos', 'componentes.css'), 'utf8');

let ok = 0, mal = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { mal++; console.log(`  FALLA ${n}${extra ? '\n        ' + extra : ''}`); }
};

console.log('\n— Hay una «i» en cada una de las tres —');
{
  const iconos = HTML.match(/class="chq-ayuda"[^>]*/g) || [];
  check('tres botones de ayuda', iconos.length === 3, `encontrados ${iconos.length}`);
  for (const cual of ['hambre', 'energia', 'sueno']) {
    check(`la de ${cual}`, new RegExp(`data-ayuda="${cual}"`).test(HTML));
  }
  // Es un botón, no un <span>: con teclado o lector de pantalla un span no
  // se alcanza ni se anuncia.
  check('son botones de verdad', !/<span class="chq-ayuda"/.test(HTML));
  check('y dicen para qué son', (HTML.match(/class="chq-ayuda"[^>]*aria-label="[^"]+"/g) || []).length === 3);
}

console.log('\n— Cada explicación empieza cerrada y con su cerrar —');
{
  const cajas = HTML.match(/<div class="chq-info"[^>]*>/g) || [];
  check('tres explicaciones', cajas.length === 3, `encontradas ${cajas.length}`);
  // Si arrancaran abiertas, el cuestionario se abriría con tres párrafos
  // desplegados y los botones de contestar fuera de pantalla.
  check('todas nacen ocultas', cajas.length === 3 && cajas.every(c => /\shidden/.test(c)));
  for (const id of ['infoHambre', 'infoEnergia', 'infoSueno']) {
    check(`existe ${id}`, new RegExp(`id="${id}"`).test(HTML));
  }
  const equis = HTML.match(/class="chq-info-x"[^>]*/g) || [];
  check('cada una lleva su × de cerrar', equis.length === 3, `encontradas ${equis.length}`);
  check('la × dice qué hace', (HTML.match(/class="chq-info-x"[^>]*aria-label="[^"]+"/g) || []).length === 3);
}

console.log('\n— La «i» abre y la × cierra —');
{
  const i = APP.indexOf("chequeoSheet.addEventListener('click'");
  const trozo = i > 0 ? APP.slice(i, i + 1800) : '';
  check('el chequeo escucha los toques', i > 0);

  const posX = trozo.indexOf(".closest('.chq-info-x')");
  const posI = trozo.indexOf(".closest('.chq-ayuda')");
  // Este es el fallo que hubo: la × estaba puesta en el HTML y con su estilo,
  // pero nadie escuchaba el toque. Caía hasta `.chq-esc button`, que da null,
  // y el botón de cerrar no hacía absolutamente nada.
  check('se escucha el toque en la ×', posX > 0,
    'sin esta rama la × es un dibujo: se pulsa y no pasa nada');
  check('se escucha el toque en la i', posI > 0);
  // El orden entre las dos ramas da igual y está comprobado en el navegador:
  // la × vive en .chq-info y la i en .chq-tit, ninguna contiene a la otra,
  // así que closest() nunca las confunde. Por eso aquí no se afirma nada
  // sobre el orden.

  const ramaX = trozo.slice(posX, posX + 420);
  check('la × oculta su explicación', /caja\.hidden = true;/.test(ramaX));
  check('y apaga su icono', /suIcono\.classList\.remove\('abierta'\)/.test(ramaX));
  // closest('.chq-info') y no querySelector: con tres cajas abiertas hay que
  // cerrar la del botón pulsado, no la primera del documento.
  check('cierra la suya, no la primera', /cerrarInfo\.closest\('\.chq-info'\)/.test(ramaX),
    'con las tres abiertas, la × de abajo cerraría la de arriba');

  const ramaI = trozo.slice(posI, posI + 420);
  check('la i abre y cierra', /texto\.hidden = !texto\.hidden;/.test(ramaI));
  check('y marca el icono', /classList\.toggle\('abierta', !texto\.hidden\)/.test(ramaI));
  check('la i busca dentro de su bloque', /bloque\.querySelector\('\.chq-info'\)/.test(ramaI));

  // Sin el return el toque sigue bajando por el resto del manejador, que es
  // el que marca respuestas y envía la hoja. Abrir una ayuda no puede
  // contestar por nadie: lo que se contesta aquí decide las calorías.
  check('abrir la ayuda no contesta la pregunta', /return;/.test(ramaI),
    'sin return, tocar la i marcaría una respuesta sin querer');
  check('cerrar la ayuda tampoco', /return;/.test(ramaX));
}

console.log('\n— Al reabrir el chequeo no quedan abiertas de la vez pasada —');
{
  const i = APP.indexOf('function abrirChequeo(');
  const trozo = i > 0 ? APP.slice(i, i + 900) : '';
  check('se cierran todas al abrir', /querySelectorAll\('\.chq-info'\)[\s\S]{0,120}hidden = true/.test(trozo),
    'si no, el cuestionario se abre con los párrafos de la semana pasada desplegados');
  check('y se apagan los iconos', /querySelectorAll\('\.chq-ayuda'\)[\s\S]{0,130}remove\('abierta'\)/.test(trozo));
}

console.log('\n— Se pueden tocar con el dedo —');
{
  const i = CSS.indexOf('.chq-ayuda');
  const trozo = i > 0 ? CSS.slice(i, i + 1400) : '';
  check('la i tiene su estilo', i > 0);
  // 17px de círculo se ve bien pero no se acierta. El blanco táctil se
  // agranda con ::after, que no ocupa sitio en la maqueta: la última vez
  // que lo hice con margen, los campos de reps quedaron en 35px.
  check('la i crece el blanco sin ocupar sitio', /\.chq-ayuda::after[\s\S]{0,140}inset:\s*-\d+px/.test(trozo),
    'agrandar el botón en sí estrecha el título de la pregunta');
  check('la × también', /\.chq-info-x::after[\s\S]{0,140}inset:\s*-\d+px/.test(CSS));
  // La × va encima del texto: sin hueco, las primeras palabras pasan por debajo.
  check('el texto no pasa por debajo de la ×', /\.chq-info\{[^}]*padding-right:\s*3\d px?|\.chq-info\{[^}]*padding-right:\s*3\dpx/.test(CSS.replace(/\s*\n\s*/g, '')),
    'sin hueco a la derecha la primera línea se lee por debajo del botón');
  check('la × se coloca respecto a su caja', /\.chq-info\{[^}]*position:\s*relative/.test(CSS.replace(/\s*\n\s*/g, '')));
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);
