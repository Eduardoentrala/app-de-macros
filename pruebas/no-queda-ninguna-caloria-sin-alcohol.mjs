// Cuatro veces ya: añades un macro y se queda a medias.
//
// El alcohol entró como cuarto macro en la 0073. Desde entonces apareció
// olvidado en cuatro sitios distintos, uno por vez, y cada uno lo
// encontró él usando la app:
//
//   1. `buscar_catalogo()` tenía el dato al lado y no lo devolvía.
//   2. Las recetas lo perdían al guardar y al escalar.
//   3. La hoja de «¿cuánto consumiste?» decía 0 cal con 200 g de
//      tequila puestos, y 54 con medio litro de vino.
//   4. Los alimentos guardados lo soltaban al pasar por la despensa.
//
// Arreglarlos de uno en uno no sirve: el quinto ya está escrito en algún
// sitio. Lo que hace falta es que NO SE PUEDA escribir una suma de
// calorías sin decidir qué pasa con el alcohol.
//
// Esta prueba busca TODAS las sumas `P*4 + C*4 + G*9` del fichero y
// exige que cada una esté en uno de dos grupos:
//
//   · las que suman `+ algo*7`, o
//   · las que están en la lista de abajo CON SU MOTIVO.
//
// Una suma nueva que no esté en ninguno pone esto en rojo. No se puede
// pasar por alto: para callarla hay que escribir aquí por qué.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8').replace(/\r\n/g, '\n');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

// LO QUE NO LLEVA ALCOHOL, Y POR QUÉ. Cada entrada es un trozo de la
// línea, lo bastante para identificarla sin fijar el código entero.
const SIN_ALCOHOL = [
  // --- METAS. Son tres números que pone la persona en Perfil: proteína,
  // carbohidrato y grasa. No hay meta de alcohol ni la va a haber, así
  // que sumarle un cuarto macro sería inventarse un objetivo.
  { trozo: 'var calDia = P*4 + C*4 + G*9;', por: 'la meta diaria del perfil' },
  { trozo: 'cal: Math.round(t.P * 4 + t.C * 4 + t.G * 9) };', por: 'el reparto de metas del coach' },
  { trozo: 'base.cal = Math.round(base.P * 4 + base.C * 4 + base.G * 9);', por: 'las metas del cliente' },
  { trozo: 'var cal = Math.round(m.P * 4 + m.C * 4 + m.G * 9);', por: 'la tira de metas de un plan' },
  { trozo: 'var cal = Math.round(p.goal_protein_g*4', por: 'las metas guardadas de una persona' },
  { trozo: '? Math.round(cliente.metas.P * 4 + cliente.metas.C * 4 + cliente.metas.G * 9)',
    por: 'las calorías contra las que se compara el plan que arma la IA' },
  { trozo: 'meta_cal: Math.round(meta.P*4', por: 'la meta que se le manda al asistente' },

  // --- CREAR UN ALIMENTO A MANO. El formulario pide tres macros y no
  // tiene campo de alcohol: lo que no se puede teclear no se puede
  // sumar. Si algún día se añade el campo, estas dos líneas caen aquí.
  { trozo: "document.getElementById('nfCal').textContent = mil(P*4 + C*4 + G*9);",
    por: 'la previa de «crear alimento», que no pide alcohol' },
  { trozo: 'var cal = Math.round(P * 4 + C * 4 + G * 9);\n      var calAntes',
    por: 'lo tecleado en «crear alimento», que no pide alcohol' },

  // --- LO QUE PROPONE LA IA DE UNA FOTO. El modelo devuelve tres
  // macros; no estima alcohol y no se le va a pedir que lo haga mirando
  // un plato. Son tarjetas para confirmar, y al apuntarse pasan por el
  // camino normal.
  { trozo: 'var cal = Math.round(a.P*4 + a.C*4 + a.G*9);',
    por: 'los alimentos que propone la IA de una foto' }
];

// ------------------------------------------------------------------
// Las líneas con una suma de calorías. Sin comentarios: aquí arriba hay
// un montón de texto que habla de `P*4 + C*4 + G*9` y no es código.
const LINEAS = APP.split('\n');
const esComentario = (l) => /^\s*(\/\/|\*|\/\*)/.test(l);
const TRES = /\*\s*4\s*\+[^;]*?\*\s*4\s*\+[^;]*?\*\s*9/;

const sumas = [];
for (let i = 0; i < LINEAS.length; i++) {
  if (esComentario(LINEAS[i]) || !TRES.test(LINEAS[i])) continue;
  // La suma puede seguir en la línea de abajo: `... * 9 +\n  A * 7)`.
  sumas.push({ nro: i + 1, texto: LINEAS[i] + '\n' + (LINEAS[i + 1] || '') });
}

console.log('\nTodas las sumas de calorías están decididas');
{
  ok(sumas.length >= 12, `hay ${sumas.length} sumas de calorías en app.js`,
     'si salen tres, la búsqueda no está mirando lo que cree y esta ' +
     'prueba no protege nada');

  const cuentaAlcohol = (t) => /\*\s*7/.test(t);
  const excusada = (t) => SIN_ALCOHOL.find((x) =>
    x.trozo.split('\n').every((p) => t.includes(p.trim())));

  const sueltas = sumas.filter((s) => !cuentaAlcohol(s.texto) && !excusada(s.texto));
  ok(sueltas.length === 0,
     'y todas suman el alcohol o están excusadas con su motivo',
     sueltas.map((s) => 'app.js:' + s.nro + '  ' + s.texto.split('\n')[0].trim()).join('\n         ') +
     '\n\n         Una suma de calorías sin `* 7` cuenta el alcohol como ' +
     'cero.\n         Si lleva alimentos, súmalo. Si son metas o algo que ' +
     'no puede\n         llevar alcohol, añádela a SIN_ALCOHOL en esta ' +
     'prueba con el motivo.');

  // Y AL REVÉS: una excusa que ya no corresponde a nada es peor que no
  // tenerla, porque tapa la siguiente suma que se escriba parecida.
  const muertas = SIN_ALCOHOL.filter((x) =>
    !sumas.some((s) => x.trozo.split('\n').every((p) => s.texto.includes(p.trim()))));
  ok(muertas.length === 0,
     'y ninguna excusa sobra',
     'ya no existen: ' + muertas.map((x) => x.por).join(' · ') +
     '\n         bórralas, que si no excusan a la próxima que se parezca');
}

// ------------------------------------------------------------------
console.log('\nY los sitios que lo perdieron están cubiertos');
{
  // Las cuatro de la historia, cada una por su nombre. No sustituyen al
  // barrido de arriba: lo acompañan, para que si una vuelve a romperse
  // el rojo diga CUÁL en vez de un número de línea.
  const tiene = (trozo) => APP.includes(trozo);

  ok(tiene("var A = (a.porBase.A || 0) * f;"),
     'la hoja de «¿cuánto consumiste?» escala el alcohol',
     'es la que decía «0 cal» con 200 g de tequila');
  ok(/cantCal'\)\.textContent = mil\(P\*4 \+ C\*4 \+ G\*9 \+ A\*7\)/.test(APP),
     'y lo cuenta en su total');
  ok(tiene('alcohol_g,veces_usado'),
     'los alimentos guardados se traen con su alcohol',
     'sin la columna en el `select`, la despensa lo devuelve en cero');
  ok(tiene('A:Number(f.alcohol_g)||0,'),
     'y se guarda en memoria al leerlos');
  ok(/hoy_cal: Math\.round\(r\.P\*4 \+ r\.C\*4 \+ r\.G\*9 \+ \(r\.A\|\|0\)\*7\)/.test(APP),
     'y el día que ve el asistente lo incluye');

  // EL PANEL DE ADMIN NO TIENE CAMPO DE ALCOHOL y recalcula las kcal al
  // guardar. Sin esto, abrir un tequila y darle a guardar sin tocar nada
  // le dejaba las calorías en CERO con la columna `alcohol` intacta.
  ok(tiene('var alcoholYa = Number(catEditando && catEditando.alcohol) || 0;'),
     'y el panel de admin no borra el alcohol de una fila al guardarla',
     'guardar sin cambiar nada no puede romper un alimento');
  ok(/alimentos_catalogo\?select=[^']*alcohol/.test(APP.replace(/'\s*\+\s*\n?\s*'/g, '')),
     'y lo pide al servidor, que si no siempre sería cero',
     'la excusa de arriba se apoya en que `catEditando.alcohol` exista');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
