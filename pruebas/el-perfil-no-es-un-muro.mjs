// Once filas seguidas en Perfil, y tres de ellas sobraban.
//
// La tarjeta fue creciendo una fila cada vez que hacía falta un ajuste
// —días de gimnasio, cumpleaños, tus datos, descargar— y acabó en once
// seguidas mezclando el cuerpo, el objetivo, la IA y la privacidad. Él lo
// dijo: «es mucha info a la vista».
//
// Y NO ERA SOLO CANTIDAD. Tres de las once no añadían nada:
//
//   · ALTURA y EDAD salían de adorno, sin poder tocarse, y además se
//     editaban dentro de una fila llamada «Tus datos» — un nombre que no
//     dice nada rodeado de filas que también son sus datos.
//   · EDAD repetía lo que ya decía el cumpleaños, porque sale de esa fecha.
//     Dos filas para el mismo dato es como se acaba con dos respuestas
//     distintas.
//   · Y PESO invitaba a tocarse sin hacer nada.
//
// Ahora son tres bloques con su título, se toca el dato que se quiere
// cambiar, y la fila de «Tus datos» desapareció: la abre Altura.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8');
const CSS = readFileSync(join(RAIZ, 'docs', 'estilos', 'cuenta.css'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

// La pantalla de Perfil. Hasta la siguiente vista O hasta donde empiezan
// las hojas sueltas, lo que llegue antes: Perfil es la ÚLTIMA vista, así
// que buscar solo el siguiente `data-view` devuelve -1, el `slice` se come
// el resto del fichero y las comprobaciones de «esto ya no está» encuentran
// la palabra dentro de una hoja. Pasó con «Edad» y «Tus datos», que siguen
// —y tienen que seguir— dentro de la hoja que se abre desde Altura.
const i = HTML.indexOf('data-view="perfil"');
const finVista = HTML.indexOf('data-view="', i + 20);
const finHojas = HTML.indexOf('sheet-backdrop', i);
const candidatos = [finVista, finHojas].filter((x) => x > 0);
const PERFIL = HTML.slice(i, candidatos.length ? Math.min(...candidatos) : HTML.length);

// ------------------------------------------------------------------
console.log('\nTres bloques, no una lista');
{
  const titulos = [...PERFIL.matchAll(/<div class="prof-grupo">([^<]+)<\/div>/g)]
    .map((m) => m[1]);
  ok(titulos.length === 3, `hay ${titulos.length} grupos: ${titulos.join(' · ')}`,
     'once filas seguidas se leen como un muro; tres bloques se leen de un ' +
     'vistazo aunque las filas sean casi las mismas');
  ok(titulos[0] === 'Tú', 'el cuerpo primero, que es lo que más se mira');

  ok(/\.prof-grupo\{/.test(CSS), 'y tienen estilo');
  ok(/color:var\(--ink-faint\)/.test(CSS.slice(CSS.indexOf('.prof-grupo{'))),
     'gris y discreto: separa sin pedir atención',
     'un título que compite con las filas no ordena, estorba');
}

// ------------------------------------------------------------------
console.log('\nY no quedan filas muertas');
{
  // Una fila sin `info-btn` es un dato que se lee y nada más. Tenerlas
  // mezcladas con las que sí se tocan enseña a no tocar ninguna.
  const filas = [...PERFIL.matchAll(/<(div|button) class="info-row([^"]*)"[^>]*id="([^"]+)"/g)]
    .map((m) => ({ tag: m[1], clase: m[2], id: m[3] }));
  ok(filas.length >= 8, `se encuentran ${filas.length} filas`);

  const muertas = filas.filter((f) => !f.clase.includes('info-btn'));
  ok(muertas.length === 0, 'todas llevan a algún sitio',
     'muertas: ' + muertas.map((f) => f.id).join(', ') +
     '. Una fila con aspecto de tocable que no hace nada enseña a no tocar ' +
     'las demás');
}

// ------------------------------------------------------------------
console.log('\nY nada se dice dos veces');
{
  ok(!/>Edad</.test(PERFIL), 'la edad ya no tiene fila propia',
     'sale del cumpleaños, que tiene la suya: dos filas para el mismo dato ' +
     'acaban diciendo cosas distintas');
  ok(!/>Tus datos</.test(PERFIL), 'ni existe la fila «Tus datos»',
     'era un nombre que no dice nada rodeado de filas que también son sus ' +
     'datos — y escondía la altura, que ya salía arriba');
  ok(/id="profDatosBtn"[\s\S]{0,80}<span>Altura<\/span>/.test(PERFIL),
     'la hoja la abre Altura, que es el dato que se va a cambiar',
     'como en los ajustes del teléfono: se toca el dato, no una caja que ' +
     'los contiene');
  ok(/id="profCumpleBtn"[\s\S]{0,90}<span>Cumpleaños<\/span>/.test(PERFIL),
     'y el cumpleaños es su propia fila');
}

// ------------------------------------------------------------------
console.log('\nY el peso lleva a donde se pesa');
{
  ok(/id="profPesoBtn"/.test(PERFIL), 'el peso es tocable');
  const h = APP.slice(APP.indexOf("getElementById('profPesoBtn')"));
  ok(/volverA\('peso', 'diario'\)/.test(h.slice(0, 200)),
     'y abre la pestaña Peso',
     'era una fila que invitaba a tocarla y no pasaba nada');
  ok(!/goto\('peso'/.test(h.slice(0, 200)),
     'con `volverA` y no `goto`, para que el «Regresar» tenga a dónde ir',
     'con `goto` ese botón se queda sin destino y parece roto — es la misma ' +
     'razón por la que la barra de abajo lo hace así');
}

// ------------------------------------------------------------------
console.log('\nY la edad sale del cumpleaños, en su fila');
{
  const f = APP.slice(APP.indexOf('function pintarCumplePerfil('));
  const cuerpo = f.slice(0, f.indexOf('\n  }'));
  ok(/edadDeNacimiento\(/.test(cuerpo), 'la calcula de la fecha');
  ok(/años/.test(cuerpo), 'y la enseña al lado');
  ok(/anios != null \?/.test(cuerpo),
     'y si no se puede calcular, no inventa una edad',
     'una fecha rara dejaría «5 nov · NaN años»');
}

// ------------------------------------------------------------------
console.log('\nY el peso se pinta con su flecha');
{
  // `textContent` se comería el `<i>›</i>` y la fila se quedaría sin
  // flecha después del primer repintado, que es peor que no tenerla:
  // aparece y desaparece.
  const conFlecha = [...APP.matchAll(/getElementById\('profPeso'\)\.(\w+)/g)]
    .map((m) => m[1]);
  ok(conFlecha.length > 0, `se pinta en ${conFlecha.length} sitio(s)`);
  ok(!conFlecha.includes('textContent'),
     'y nunca con `textContent`, que se comería la flecha',
     'usa: ' + conFlecha.join(', '));
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
