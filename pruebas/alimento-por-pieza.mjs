// Registrar un alimento por piezas en el panel.
//
// EL FALLO DE FONDO NO ERA DEL FORMULARIO: era que el aviso no se veía.
//
// `.toast` iba en z-index 50 y `.sheet-backdrop` en 60, así que CUALQUIER
// aviso que saliera con una hoja abierta se pintaba por debajo de ella. Se
// mostraba, se desvanecía a los dos segundos, y nadie lo veía jamás.
//
// Se destapó aquí: al guardar un alimento por piezas sin decir cuánto pesa
// una, la app avisaba de lo que faltaba —hacía su trabajo— y en pantalla
// solo parecía que el botón Guardar estuviera roto.
//
// Y afectaba a toda la app, no a esta pantalla: los errores salen justo
// cuando hay algo abierto.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8');
const CSS = ['componentes', 'pantallas', 'base', 'diario']
  .map((f) => { try { return readFileSync(join(RAIZ, 'docs', 'estilos', f + '.css'), 'utf8'); } catch { return ''; } })
  .join('\n');

let ok = 0, mal = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { mal++; console.log(`  FALLA ${n}${extra ? '\n        ' + extra : ''}`); }
};

const num = (re) => { const m = re.exec(CSS.replace(/\s*\n\s*/g, '')); return m ? Number(m[1]) : null; };

console.log('\n— El aviso se ve por encima de las hojas —');
{
  const zToast = num(/\.toast\{[^}]*z-index:(\d+)/);
  const zHoja  = num(/\.sheet-backdrop\{[^}]*z-index:(\d+)/);
  check('el aviso tiene z-index', zToast !== null);
  check('la hoja también', zHoja !== null);
  check('y el aviso va POR ENCIMA', zToast > zHoja,
    `aviso ${zToast} contra hoja ${zHoja}: por debajo, el mensaje existe pero no lo ve nadie`);

  // Un mensaje largo no puede salirse por los lados de un móvil.
  check('un mensaje largo no se sale', /\.toast\{[^}]*max-width:calc\(100% - 32px\)/.test(CSS.replace(/\s*\n\s*/g, '')));
}

console.log('\n— El campo que falta se señala, no solo se menciona —');
{
  // Hasta el final del manejador, NO 1400 caracteres: la ventana fija se
  // desbordo en cuanto el guardado creció unas líneas, y estas
  // comprobaciones se pusieron rojas sin que nada se hubiera roto.
  const i = APP.indexOf("getElementById('catGuardar')");
  const fn = APP.slice(i, APP.indexOf('\n  });', i));
  check('sigue habiendo aviso', /toast\('toastAdmin', 'Falta cuánto pesa/.test(fn));
  // Un mensaje dice QUÉ falta; marcar el campo dice DÓNDE.
  check('se marca el campo', /campo\.classList\.add\('falta'\)/.test(fn));
  check('y se le lleva el foco', /campo\.focus\(\)/.test(fn));
  check('se sube a la vista', /campo\.scrollIntoView/.test(fn));
  // Y la marca se quita al arreglarlo: dejarla puesta hace pensar que sigue mal.
  check('la marca se quita al guardar bien',
    /document\.getElementById\('catPiezaG'\)\.classList\.remove\('falta'\)/.test(APP));
  check('la marca no es solo color', /\.big-input\.falta\{[^}]*box-shadow/.test(CSS.replace(/\s*\n\s*/g, '')),
    'solo con rojo no lo distingue quien no ve bien los rojos');
}

console.log('\n— El hueco vacío ya no parece lleno —');
{
  // Tenía placeholder="50" en gris. Se lee como un valor puesto, se guarda,
  // y la app dice que falta algo que parecía estar.
  check('el ejemplo no parece un valor',
    /id="catPiezaG"[^>]*placeholder="obligatorio"/.test(HTML),
    'un número en gris se lee como si el campo ya estuviera lleno');
}

console.log('\n— Un solo campo de gramos a la vista —');
{
  // Había DOS: «Pesa una (g)» (la unidad en la que se apunta) y «Pesa (g)»
  // de la porción de USDA (con la que se audita la fila). En un alimento
  // propio la segunda no significa nada y es como se acaba llenando la que
  // no era.
  check('lo de USDA vive en su propio bloque', /id="catBloqueUsda"/.test(HTML));
  check('y nace oculto', /id="catBloqueUsda" hidden/.test(HTML));
  check('solo sale si el alimento viene de USDA',
    /document\.getElementById\('catBloqueUsda'\)\.hidden = !deUsda;/.test(APP));
  check('y se dice para qué es', /Solo para cuadrar la fila con USDA/.test(HTML));
}

console.log('\n— Se ve lo que va a ver quien lo apunte —');
{
  const i = APP.indexOf('function pintarPreviaCatalogo(');
  const fn = APP.slice(i, APP.indexOf('\n  }', i));
  check('existe la previa', i > 0);
  check('hay sitio para ella', /id="catPreview"/.test(HTML) && /id="catPreview" hidden/.test(HTML));

  // Solo cuando significa algo: en gramos no hay nada que previsualizar, y
  // sin peso no se puede calcular.
  check('en gramos no sale',
    /if\(u === 'Gramos' \|\| \(!porUnidad && g <= 0\)\)\{ caja\.hidden = true; return; \}/.test(fn));

  // Los macros se teclean por 100 g: la previa los pasa a la pieza.
  //
  // Desde la 0052 hay fichas cuyos macros YA son los de una unidad. Ahí no
  // se divide entre nada: dividir enseñaría la centésima parte y el
  // formulario parecería correcto, que es lo que esta previa existe para
  // evitar.
  check('escala los macros a la pieza', /var f = porUnidad \? 1 : g \/ 100;/.test(fn));
  check('enseña las calorías', /\(P\*4 \+ C\*4 \+ G\*9\) \* f/.test(fn));
  check('y los tres macros', /'P ' \+ Math\.round\(P\*f\*10\)\/10/.test(fn));
  check('diciendo cuánto pesa, cuando ese peso significa algo',
    /porUnidad \? '' : ' \(' \+ g \+ ' g\)'/.test(fn),
    'en una ficha por unidad no hay peso que enseñar: ponerlo sería inventarlo');

  // Se rehace al teclear, no solo al elegir la unidad: es lo que permite
  // ver al momento si el dato tiene sentido.
  check('se rehace con cualquier número',
    /\['catPiezaG','catP','catC','catG'\]/.test(APP) && /addEventListener\('input', pintarPreviaCatalogo\)/.test(APP),
    'sin esto hay que cerrar y reabrir para ver si cuadra');
  check('y al cambiar de unidad', /pintarPreviaCatalogo\(\);\s*\r?\n\s*\}/.test(APP));
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);
