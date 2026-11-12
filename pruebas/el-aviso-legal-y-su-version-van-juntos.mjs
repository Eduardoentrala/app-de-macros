// «Acepto» tiene que poder decir QUÉ se aceptó.
//
// Al registrarse se guarda `consentimiento_version` junto a la fecha. Esa
// constancia solo vale si el número apunta a un texto concreto. El propio
// código ya lo dice desde hace meses:
//
//     «Al tocar legal.md hay que subirla aquí.»
//
// Y nada lo obligaba. Un comentario no es una comprobación: se toca el
// aviso, se olvida el número, y a partir de ahí todas las constancias
// dicen «versión 1» señalando a un texto que ya no es el que leyeron.
// Nadie se entera nunca, porque no se rompe nada — solo deja de ser verdad.
//
// Así que aquí queda fijado el texto por su huella. Si legal.md cambia,
// esta prueba se pone roja y hay que decidir a conciencia:
//
//   · cambio de fondo  → sube VERSION_LEGAL, la cabecera de legal.md y la
//                        huella de aquí abajo;
//   · una coma o una falta de ortografía → actualiza solo la huella.
//
// Lo que no se puede es que cambie y nadie lo mire.

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');
// Sin retornos de carro: el fichero viaja entre Windows y GitHub y la
// huella no puede depender de cómo acabe cada línea.
const LEGAL = readFileSync(join(RAIZ, 'docs', 'legal.md'), 'utf8').replace(/\r/g, '');

// La huella del texto que corresponde a la versión de abajo.
const HUELLA = '4f160d54eb7bd8b9';
const VERSION = '2';

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

// ------------------------------------------------------------------
console.log('\nEl número que se guarda y el texto que se lee son el mismo');
{
  const enApp = (APP.match(/var VERSION_LEGAL = '([^']+)';/) || [])[1];
  ok(enApp === VERSION,
     'la app guarda la versión ' + VERSION,
     'guarda «' + enApp + '»');

  // La cabecera de legal.md, que es lo único que ve la persona.
  const enTexto = (LEGAL.match(/\*\*Versión (\d+) · /) || [])[1];
  ok(enTexto === VERSION,
     'y el aviso se presenta como la versión ' + VERSION,
     'el aviso dice «' + enTexto + '» y la app guarda «' + enApp + '»: la ' +
     'constancia apuntaría a un texto que no es');
}

// ------------------------------------------------------------------
console.log('\nY el texto es el que esa versión dice ser');
{
  const hoy = createHash('sha256').update(LEGAL).digest('hex').slice(0, 16);
  ok(hoy === HUELLA,
     'legal.md no ha cambiado por debajo de su versión',
     'la huella es ' + hoy + ' y aquí dice ' + HUELLA + '.\n' +
     '         Si el cambio es de fondo: sube VERSION_LEGAL en docs/app.js,\n' +
     '         la cabecera de docs/legal.md y la huella de esta prueba.\n' +
     '         Si es una coma: actualiza solo la huella.');
}

// ------------------------------------------------------------------
console.log('\nY la fecha de la cabecera no se queda en el pasado');
{
  // No sirve subir el número y dejar la fecha de la versión anterior: lo
  // que se enseña es la fecha, y una fecha vieja sobre un texto nuevo
  // miente igual que un número viejo.
  const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio',
                 'agosto','septiembre','octubre','noviembre','diciembre'];
  const m = LEGAL.match(/\*\*Versión \d+ · (\d{1,2}) de ([a-zé]+) de (\d{4})\*\*/);
  ok(!!m, 'la cabecera lleva fecha legible');
  if (m) {
    ok(MESES.indexOf(m[2]) >= 0, 'con un mes de verdad: ' + m[2]);
    const d = new Date(Number(m[3]), MESES.indexOf(m[2]), Number(m[1]));
    ok(!Number.isNaN(d.getTime()), 'y el día existe');
  }
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
