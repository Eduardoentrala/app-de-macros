// Una hoja que se abre desde dos pantallas no puede vivir dentro de una.
//
// El fondo de las hojas es `position:absolute; inset:0`, así que se estira
// contra su ancestro colocado. Si la hoja está DENTRO de una vista y se
// abre desde OTRA, esa vista está en `display:none` y la hoja aparece
// midiendo 0×0. No da error, no avisa, no se ve: tocas el botón y no pasa
// nada.
//
// YA PASÓ TRES VECES. Las dos primeras están escritas en el comentario de
// `semanaSheet` —«ya pasó con dos»—. La tercera fue `nameSheet`: nació
// dentro de Rutina porque solo la usaba el renombrar un día, y el día que
// se reusó desde Comidas —para ponerle nombre a una receta— dejó de
// funcionar sin un solo error en la consola.
//
// Que una hoja viva dentro de su vista NO es un fallo: la mayoría solo se
// abren desde ahí y está bien. Lo que esta prueba vigila son las que se
// abren desde más de un sitio, que es cuando el sitio importa.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8').replace(/\r\n/g, '\n');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

// Recorre el HTML llevando la cuenta de los `div` abiertos, y anota a qué
// profundidad empezó cada vista. Una hoja está dentro de una vista si, al
// encontrarla, hay alguna vista abierta por encima.
//
// Se cuentan SOLO los `div` porque las vistas y las hojas lo son; mezclar
// otras etiquetas haría la cuenta más frágil sin ganar nada.
function dondeViveCadaHoja() {
  const donde = {};
  const vistas = [];          // pila: { vista, nivel }
  let nivel = 0;
  // SIN LOS COMENTARIOS. Este fichero explica cada decisión encima de su
  // marcado, y varios comentarios llevan `<div …>` de ejemplo dentro: sin
  // quitarlos la cuenta de niveles se descuadra y todo lo de abajo miente.
  const limpio = HTML.replace(/<!--[\s\S]*?-->/g, '');
  const re = /<div\b([^>]*)>|<\/div\s*>/g;
  let m;
  while ((m = re.exec(limpio))) {
    if (m[0].startsWith('</')) {
      nivel--;
      // `>=` y no `>`: la vista se apila con el nivel en el que ESTÁ, así
      // que al llegar su cierre el nivel vuelve a ese mismo número. Con `>`
      // no se desapilaba nunca y todas las hojas salían dentro de la última
      // vista abierta —incluidas las que de verdad están fuera—.
      while (vistas.length && vistas[vistas.length - 1].nivel >= nivel) vistas.pop();
      continue;
    }
    const attrs = m[1] || '';
    const vista = (attrs.match(/data-view="([^"]+)"/) || [])[1];
    const id = (attrs.match(/id="([^"]+)"/) || [])[1];
    if (/class="[^"]*\bsheet-backdrop\b/.test(attrs) && id)
      donde[id] = vistas.length ? vistas[vistas.length - 1].vista : null;
    if (vista && /class="[^"]*\bapp-view\b/.test(attrs)) vistas.push({ vista, nivel });
    // Las etiquetas que se cierran solas no existen para `div`.
    nivel++;
  }
  return donde;
}

const donde = dondeViveCadaHoja();

console.log('\nSe sabe dónde vive cada hoja');
{
  const n = Object.keys(donde).length;
  ok(n >= 15, `se encontraron ${n} hojas`,
     'si salen pocas, el recorrido del HTML se rompió y esto no mira nada');
  // Dos que se saben: una dentro y otra fuera. Si estas dos salen mal, la
  // cuenta de niveles está mal y lo de abajo no vale.
  ok(donde.timerSheet === 'rutina', '`timerSheet` sale dentro de Rutina, que es donde está',
     'salió ' + donde.timerSheet);
  ok(donde.semanaSheet === null, 'y `semanaSheet` sale fuera, que es donde la pusieron',
     'salió ' + donde.semanaSheet);
}

console.log('\nY las que se abren desde más de una pantalla están fuera');
{
  // `nameSheet` la abren el renombrar un día (Rutina) y el guardar una
  // receta (Comidas). Dentro de Rutina, lo segundo no funcionaba.
  ok(donde.nameSheet === null, '`nameSheet` no vive dentro de ninguna vista',
     'vive dentro de «' + donde.nameSheet + '»: desde Comidas esa vista está ' +
     'apagada y la hoja se abre midiendo 0×0. Tocas el botón y no pasa nada');

  // Y que de verdad la abran dos: si algún día solo queda una, esta prueba
  // estaría pidiendo algo que ya no hace falta, y conviene enterarse.
  const aperturas = (APP.match(/openNameSheet\(\{/g) || []).length;
  ok(aperturas >= 2, `la abren ${aperturas} sitios distintos`,
     'con uno solo, daría igual dónde viviera');
  ok(/title: 'Nombre de la receta'/.test(APP), 'y uno de ellos es el de las recetas');
  ok(/title:'Renombrar día'/.test(APP) || /title: 'Renombrar día'/.test(APP),
     'y el otro, el de los días de rutina');
}

console.log('\nY lo que es de cada quien, lo pone quien la abre');
{
  const abrir = APP.slice(APP.indexOf('function openNameSheet(opts){'));
  ok(/pista\.textContent = opts\.hint \|\|/.test(abrir.slice(0, 700)),
     'la pista la pone quien abre');
  ok(/dayNameInput\.placeholder = opts\.ejemplo \|\|/.test(abrir.slice(0, 700)),
     'y el ejemplo también',
     '«Ej. Pecho y tríceps» no le dice nada a quien está nombrando un desayuno');
  ok(/id="nameSheetHint"/.test(HTML), 'y la pista tiene dónde escribirse');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
