// Un botón que se elige y no lo enseña.
//
// La hoja de «Tus datos» salió con esto: los botones de Hombre / Mujer se
// marcaban por dentro, se guardaban bien en la base, y A LA VISTA NO PASABA
// NADA. Se tocaba, no cambiaba, y no había forma de saber si había quedado
// puesto. Él lo dijo así: «no sé si se seleccionó, no se ve como si se
// seleccionara».
//
// EL FALLO ERA UNA CLASE QUE FALTABA. El estilo de «esto está elegido» vive
// en `.opt.active`, no en `.opt-row button.active`, así que un botón sin
// `class="opt"` dentro de un `.opt-row` se queda sin estilo ninguno — ni el
// de reposo ni el de elegido— y el `classList.add('active')` no pinta nada.
//
// Es un fallo silencioso de los peores, porque todo lo demás funciona: el
// dato viaja, se guarda y se lee. Lo único que no ocurre es lo único que la
// persona puede ver.
//
// Esta prueba no mira la hoja que falló: mira TODOS los grupos de opciones
// que hay y los que haya mañana.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8');
const CSS = ['cuenta', 'componentes', 'pantallas', 'diario', 'vistas', 'base', 'maqueta']
  .map((n) => readFileSync(join(RAIZ, 'docs', 'estilos', n + '.css'), 'utf8')).join('\n');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

// Cada `<div class="... opt-row ..." id="X"> ... </div>`, con su contenido.
function grupos(clase) {
  const re = new RegExp(
    `<div[^>]*class="[^"]*\\b${clase}\\b[^"]*"[^>]*id="([A-Za-z0-9_-]+)"[^>]*>([\\s\\S]*?)</div>`, 'g');
  const out = [];
  let m;
  while ((m = re.exec(HTML))) out.push({ id: m[1], dentro: m[2] });
  return out;
}

// ------------------------------------------------------------------
console.log('\nEn un `.opt-row`, cada botón lleva su clase');
{
  const filas = grupos('opt-row');
  ok(filas.length >= 2, `se encuentran ${filas.length} grupos de opciones`,
     'si sale 0 o 1, el troceo no está mirando lo que cree');

  // La regla que importa: el estilo de elegido es `.opt.active`, así que
  // sin `opt` el botón no puede enseñar que lo está.
  ok(/\.opt\.active\s*\{/.test(CSS), 'y el estilo de elegido es `.opt.active`',
     'si un día se mueve a `.opt-row button.active`, esta prueba sobra — ' +
     'pero mientras cuelgue de `.opt`, la clase hace falta');

  for (const g of filas) {
    const botones = g.dentro.match(/<button[^>]*>/g) || [];
    ok(botones.length > 0, `«${g.id}» tiene botones`);
    const sinClase = botones.filter((b) => !/class="[^"]*\bopt\b/.test(b));
    ok(sinClase.length === 0,
       `y los ${botones.length} de «${g.id}» pueden enseñar que están elegidos`,
       sinClase.length + ' sin `class="opt"`:\n         ' +
       sinClase.join('\n         ') +
       '\n         sin esa clase se marcan por dentro y a la vista no pasa nada');
  }
}

// ------------------------------------------------------------------
console.log('\nY lo mismo con los días, que van por otro camino');
{
  // `.dias-ej` sí estiliza por `button` directamente, así que ahí no hace
  // falta clase. Se comprueba que siga siendo así: si alguien lo cambia a
  // `.dias-ej .opt.active`, los selectores de días se quedan mudos igual.
  ok(/\.dias-ej button\.active\s*\{/.test(CSS),
     'los de `.dias-ej` se estilizan por etiqueta, sin clase',
     'si esto deja de ser verdad, sus botones necesitan clase como los ' +
     'de `.opt-row` — y nadie se acordaría');

  const d = grupos('dias-ej');
  ok(d.length >= 1, `y hay ${d.length} grupo(s) de días`);
  for (const g of d) {
    const n = (g.dentro.match(/<button/g) || []).length;
    ok(n === 8, `«${g.id}» tiene los ocho, de 0 a 7`, 'tiene ' + n);
  }
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
