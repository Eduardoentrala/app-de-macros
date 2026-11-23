// La quinta vez, y esta sí entraba mal en el diario.
//
// Buscó «Tequila (caballito)». La tarjeta decía 101 kcal, bien. Tocó la
// tarjeta y la hoja de «¿cuánto consumiste?» decía 0 cal. Y no era solo
// la pantalla: dándole a «Agregar», el tequila entraba al diario con
// CERO calorías.
//
// La tarjeta usa el objeto entero. La hoja recibía una copia, y la copia
// se arma campo a campo:
//
//     elegirAlimento({ n:nombre, u:a.u, cant:a.cant, P:a.P, C:a.C, G:a.G })
//
// Sin `A`. Copiar campo a campo es cómodo hasta que aparece un campo
// nuevo, y entonces no falla: se pierde en silencio.
//
// POR QUÉ NO BASTABA LA PRUEBA DE ANTES. `no-queda-ninguna-caloria-sin-
// alcohol` revisa las SUMAS de calorías, y todas estaban bien: la hoja
// multiplicaba por 7 como debe. Lo que llegaba en cero era el dato. Una
// fórmula correcta sobre un dato perdido da un cero perfectamente
// calculado.
//
// Así que esta mira lo otro: TODO objeto que copie los tres macros de
// otro tiene que copiar también el cuarto.

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

// LO QUE NO LLEVA ALCOHOL, Y POR QUÉ. Con el trozo que lo identifica.
const SIN_ALCOHOL = [
  // --- METAS. Son tres números que pone la persona en Perfil. No hay
  // meta de alcohol ni la va a haber.
  { trozo: 'metaHoy = { P: conEvento.P', por: 'la meta de hoy con los eventos' },
  { trozo: 'var vacio = { P:meta.P', por: 'el reparto cuando no queda reserva' },
  { trozo: 'if(!(reserva > 0)) return { P:meta.P', por: 'el reparto sin reserva' },
  { trozo: 'P:base.P, C:base.C, G:base.G, cal: base.cal', por: 'las metas del cliente, en la hoja de calorías' },
  // LA META DE HOY. Aquí el alcohol SÍ cuenta, pero no como cuarto
  // campo: no hay meta de etanol a la que sumarlo. Entra como calorías
  // en la misma expresión, por `quitarCalorias`, que es la línea de
  // debajo. Si alguien le quita esa llamada, lo que cae es
  // `el-alcohol-de-ayer-tambien-se-compensa`, no esta prueba.
  { trozo: 'P: (meta.P * diasCuenta - antes.P) / n',
    por: 'la meta de hoy, que descuenta el alcohol como calorías' },
  // Y LOS DOS DE `quitarCalorias`, que es justo quien lo descuenta. El
  // que devuelve la meta intacta cuando no hay nada que quitar, y el que
  // reempaqueta lo que ella devolvió para la reserva de un evento.
  { trozo: 'var igual = { P: meta.P, C: meta.C, G: meta.G }',
    por: 'la meta sin tocar cuando no hay calorías que quitar' },
  { trozo: 'P: r.P, C: r.C, G: r.G,',
    por: 'lo que `apartarParaEvento` devuelve de `quitarCalorias`' },
  // Y EL REPARTO DE METAS, que ahora devuelve lo que le dio
  // `conTopesDeColumna`. Tres números de objetivo, sin cuarto macro.
  { trozo: 'return { P:t.P, C:t.C, G:t.G,',
    por: 'el reparto de metas, ya topado a lo que admiten las columnas' },

  // --- LAS MEDIAS DE LA SEMANA. Los tres macros se promedian porque son
  // los que tienen meta; las calorías NO se recalculan aquí, se suman de
  // `e.calories`, que es la columna generada de la base y desde la 0073
  // ya lleva el alcohol dentro. O sea que el número que importa está
  // bien, y una «media de alcohol» no significaría nada.
  { trozo: 'P: Math.round(t.P / dias.length)', por: 'las medias de la semana' },

  // --- LO QUE REGISTRAN OTRAS PERSONAS. Viene de `buscar_alimentos`,
  // que devuelve `protein_g`, `carbs_g`, `fat_g` y nada más. No es un
  // olvido de la app: el dato no existe en lo que llega. Si algún día esa
  // función devuelve el alcohol, esta línea cae de la lista.
  { trozo: "fuente:'gente'", por: 'lo que registran otros, que no trae alcohol' },

  // --- LO QUE PROPONE LA IA DE UNA FOTO. El modelo estima tres macros
  // mirando un plato; no estima alcohol y no se le va a pedir.
  { trozo: 'seguridad: x.seguridad', por: 'los alimentos que propone la IA de una foto' },

  // --- EDITAR UNA FICHA GUARDADA. El formulario tiene tres campos y el
  // alcohol no se toca, así que el respaldo para deshacer tampoco lo
  // necesita: lo que no cambia no hay que reponerlo.
  { trozo: 'var antes = { n:ed.n', por: 'el respaldo al editar una ficha guardada' },
  { trozo: 'var antes = { P:g.P, C:g.C, G:g.G }', por: 'el respaldo al corregir sus macros' }
];

// ------------------------------------------------------------------
// Los objetos que copian macros. Se busca una `P` seguida de `C` y `G`
// dentro de las tres líneas siguientes, que es como se escriben aquí.
const LINEAS = APP.split('\n');
const esComentario = (l) => /^\s*(\/\/|\*|\/\*)/.test(l);

//
// COPIAS DE OTRO OBJETO, no cualquier `{P:..., C:..., G:...}`.
//
// El primer intento cogía los tres macros vinieran de donde vinieran, y
// sacaba veinte objetos que son metas, acumuladores en cero y repartos
// de calorías — ninguno puede llevar alcohol. La lista de excusas habría
// sido más larga que la prueba, y una prueba que pide veinte excusas
// deja de leerse.
//
// Lo que falla de verdad es copiar campo a campo DESDE OTRO ALIMENTO:
// `P: a.P`, `P: Number(x.protein_g)`, `P: a.porBase.P`. Ahí es donde el
// campo nuevo se queda fuera sin que nadie lo note.
//
// Y EN POSICIÓN DE PROPIEDAD. Sin el `[{,]` delante, el `:` de un
// ternario pasaba por una clave: `var P = igual ? mias.P : m.P` salía
// como si fuera un objeto copiando macros, y no lo es.
const DE_OTRO = (letra, nombres) =>
  new RegExp('(^|[{,(])\\s*' + letra + '\\s*:\\s*[^,;}]*\\b\\w+\\.(' + nombres + ')\\b', 'm');
const COPIA_P = DE_OTRO('P', 'P|proteina|protein_g');
const COPIA_C = DE_OTRO('C', 'C|carbos|carbs_g');
const COPIA_G = DE_OTRO('G', 'G|grasas|fat_g');

// SEIS LÍNEAS DE CÓDIGO, no seis líneas a secas. Entre `protein_g:` y
// `alcohol_g:` de `sbGuardarAlimento` hay tres de comentario
// explicando por qué, y una ventana que las contara daba por perdido un
// alcohol que sí se manda.
const ventana = (desde, cuantas) => {
  const fuera = [];
  for (let k = desde; k < LINEAS.length && fuera.length < cuantas; k++) {
    if (!esComentario(LINEAS[k])) fuera.push(LINEAS[k]);
  }
  return fuera.join('\n');
};
// Para las excusas hace falta la línea de código anterior: lo que
// identifica al bloque —`fuente:'gente'`— suele ir encima de los macros.
const conAntes = (desde) => {
  let p = desde - 1;
  while (p >= 0 && esComentario(LINEAS[p])) p--;
  return (p >= 0 ? LINEAS[p] + '\n' : '') + ventana(desde, 6);
};

const copias = [];
for (let i = 0; i < LINEAS.length; i++) {
  if (esComentario(LINEAS[i]) || !COPIA_P.test(LINEAS[i])) continue;
  const trozo = ventana(i, 6);
  if (!COPIA_C.test(trozo) || !COPIA_G.test(trozo)) continue;
  copias.push({ nro: i + 1, texto: trozo, conAntes: conAntes(i) });
}

console.log('\nTodo lo que copia macros copia los cuatro');
{
  ok(copias.length >= 10, `hay ${copias.length} objetos que copian macros`,
     'si salen dos, la búsqueda no está mirando lo que cree');

  const lleva = (t) => /\bA\s*:\s*\S/.test(t) || /alcohol_g\s*:/.test(t);
  const excusada = (c) => SIN_ALCOHOL.find((x) => c.conAntes.includes(x.trozo));

  const sueltas = copias.filter((c) => !lleva(c.texto) && !excusada(c));
  ok(sueltas.length === 0,
     'y ninguna se deja el alcohol por el camino',
     sueltas.map((c) => 'app.js:' + c.nro + '  ' + c.texto.split('\n')[0].trim()).join('\n         ') +
     '\n\n         Un objeto que copia P, C y G y no copia A pierde el ' +
     'alcohol EN SILENCIO:\n         no falla, da cero. Si lleva comida, ' +
     'copia la `A`. Si no puede llevar\n         alcohol, añádelo a ' +
     'SIN_ALCOHOL en esta prueba con el motivo.');

  const muertas = SIN_ALCOHOL.filter((x) => !copias.some((c) => c.conAntes.includes(x.trozo)));
  ok(muertas.length === 0, 'y ninguna excusa sobra',
     'ya no existen: ' + muertas.map((x) => x.por).join(' · '));
}

// ------------------------------------------------------------------
console.log('\nY el camino que falló, por su nombre');
{
  // Tocar una sugerencia y que la hoja reciba el alcohol. Es el que él
  // encontró, y el único de los cinco que metía el dato mal en la base
  // en vez de solo enseñarlo mal.
  const i = APP.indexOf('elegirAlimento({ n:nombre');
  const trozo = APP.slice(i, APP.indexOf('});', i));
  ok(i > 0 && /A:\s*a\.A/.test(trozo),
     'tocar una sugerencia se lleva el alcohol a la hoja',
     'sin esto el tequila entra al diario en 0 calorías, no solo lo ' +
     'enseña mal');

  // Y el resto de los que se arreglaron con él.
  const tiene = (t) => APP.includes(t);
  ok(tiene('A: a.porBase ? (a.porBase.A || 0) : (a.A || 0) };'),
     'comparar con lo ya guardado cuenta el alcohol');
  ok(/alcohol_g: Math\.round\(\(a\.porBase \? \(a\.porBase\.A \|\| 0\)/.test(APP),
     'y corregir una ficha guardada lo manda al servidor');
  ok(tiene('var antes = { cant:a.cant, P:a.P, C:a.C, G:a.G, A:a.A || 0 };') &&
     tiene('a.A = antes.A || 0;'),
     'deshacer una corrección repone también el alcohol',
     'reponer sin él deja el apunte contando de menos');
  ok(/fuente:'mio'[\s\S]{0,180}A:Number\(a\.A\)\|\|0/.test(APP),
     'y tus guardados lo llevan al salir en la búsqueda');
  ok(/Math\.round\(\(nueva\.A \|\| 0\) \* 10\) === Math\.round\(\(yaEsta\.A \|\| 0\) \* 10\)/.test(APP),
     'y «son los mismos macros» mira los cuatro',
     'sin esto, una cerveza guardada en cero y la del catálogo con sus ' +
     '3,9 pasan por iguales y no se pregunta nada');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
