// Un comentario mal cerrado se lleva por delante la regla de al lado.
//
// Esto no es teoría: pasó DOS VECES el mismo día, las dos escribiendo un
// comentario largo encima de una regla. El patrón es siempre el mismo —se
// amplía la explicación de arriba y se cierra con `*/` cuando el bloque
// anterior ya estaba cerrado—, y el resultado es texto suelto fuera de
// toda regla:
//
//     /* …explicación… */
//        …más explicación… */        ← esto ya no es un comentario
//     .icon-mini button{ … }         ← y esto deja de aplicarse
//
// Y NO AVISA NADIE. El navegador no da error: descarta en silencio lo que
// no entiende. La primera vez el botón del asistente salió gris y plano
// —ninguno de los seis diseños—; la segunda, cuatro botones de la rutina
// aparecieron con el recuadro gris que pinta el navegador por su cuenta.
// Las dos se vieron MIRANDO la pantalla, no leyendo el fichero, porque el
// fichero se lee bien: el `*/` de más parece el final del comentario.
//
// Aquí se mira lo que el navegador haría: quitar los comentarios bien
// formados y comprobar que lo que queda son reglas y nada más.

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(RAIZ, 'docs', 'estilos');
const hojas = readdirSync(DIR).filter((f) => f.endsWith('.css')).sort();

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

const linea = (txt, i) => txt.slice(0, i).split('\n').length;

console.log('\nHay hojas que mirar');
ok(hojas.length >= 4, `se encontraron ${hojas.length} hojas de estilo`,
   'si no hay ninguna, esto pasa sin comprobar nada');

for (const f of hojas) {
  console.log('\n' + f);
  const css = readFileSync(join(DIR, f), 'utf8').replace(/\r\n/g, '\n');

  // 1. Los comentarios abren y cierran a la par.
  const abre = (css.match(/\/\*/g) || []).length;
  const cierra = (css.match(/\*\//g) || []).length;
  ok(abre === cierra, `los comentarios cuadran (${abre} abren, ${cierra} cierran)`,
     'uno de más deja texto suelto fuera de toda regla; uno de menos se come ' +
     'todo lo que venga detrás hasta el siguiente cierre');

  // 2. Y ningún `*/` suelto, que es el caso de verdad: los dos números
  //    cuadran y aun así hay un cierre donde no toca.
  let dentro = false, sueltos = [];
  for (let i = 0; i < css.length - 1; i++) {
    if (!dentro && css[i] === '/' && css[i + 1] === '*') { dentro = true; i++; }
    else if (css[i] === '*' && css[i + 1] === '/') {
      if (!dentro) sueltos.push(linea(css, i));
      dentro = false; i++;
    }
  }
  ok(sueltos.length === 0, 'y no hay ningún «*/» sin su «/*»',
     'líneas ' + sueltos.join(', ') + ': ahí el navegador deja de entender y ' +
     'descarta en silencio lo que siga');
  ok(!dentro, 'ni un comentario sin cerrar',
     'todo lo que venga detrás se pierde');

}

// NO SE MIRA «prosa suelta entre reglas», que era la idea obvia y no
// funciona: este repo explica cada decisión encima de su regla, así que un
// comentario de quince líneas antes de un selector es lo NORMAL. Al
// probarlo marcó treinta reglas buenas —`@keyframes paneEntra`,
// `.ia-macros`, `.exercise-card`— y ni una mala. Una prueba que grita
// treinta veces no se lee: se apaga.
//
// Las dos de arriba bastan porque el fallo real SIEMPRE deja un `*/` de
// más: se amplía un comentario ya cerrado y se vuelve a cerrar. Las dos
// veces que pasó, el recuento se descuadró.

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
