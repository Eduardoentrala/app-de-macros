// «Mis recetas» existía y no se podía crear ninguna.
//
// La pantalla estaba entera —tabla, listado, buscador, estado vacío, hasta
// un «Explorar recetas de la comunidad · Próximamente»— y NO HABÍA UNA
// SOLA escritura a `recipes` en toda la app. Se entraba, se veía «Todavía
// no tienes recetas» y no había forma de que dejara de ser verdad.
//
// POR QUÉ NO UN FORMULARIO DE INGREDIENTES, que es lo que pediría el
// sentido común: porque es teclear por segunda vez lo que ya está
// apuntado. Tu desayuno de siempre lo registraste esta mañana; lo que hace
// falta no es volver a escribirlo, es poder repetirlo.
//
// Así que la receta se guarda DESDE la comida, con lo que ya hay dentro, y
// se vuelve a apuntar desde el buscador de esa misma comida —donde ya se
// sabe si es desayuno o cena, sin preguntar nada—.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const MIG = readFileSync(join(RAIZ, 'supabase', 'migrations', '0001_esquema_base.sql'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

function sacar(cab) {
  const i = APP.indexOf(cab);
  if (i < 0) throw new Error('no encuentro: ' + cab);
  let n = 0, j = APP.indexOf('{', i);
  for (; j < APP.length; j++) {
    if (APP[j] === '{') n++;
    else if (APP[j] === '}') { n--; if (!n) return APP.slice(i, j + 1); }
  }
  throw new Error('llaves sin cerrar en ' + cab);
}

// ------------------------------------------------------------------
console.log('\nSe guarda lo que ya está apuntado');
{
  ok(/id="mealAReceta" hidden/.test(HTML), 'el botón vive en la comida y nace oculto',
     'una comida vacía no es una receta');
  const pintar = sacar('function pintarComida(){');
  ok(/aReceta\.hidden = !lista\.length;/.test(pintar),
     'y aparece solo cuando hay algo dentro');

  // EJECUTADO: el cuerpo de la receta que se manda.
  const crear = sacar('function guardarComidaComoReceta(nombre){');
  const correr = (lista, nombre) => {
    let enviado = null, avisos = [];
    new Function('lista', 'nombre', 'guardar',
      'var comidaActual = "Desayuno";' +
      'var COMIDAS = { Desayuno: lista };' +
      'var RECETAS = [];' +
      'var sesion = { user: { id: "u1" } };' +
      'function toast(_i, t){ guardar.avisos.push(t); }' +
      'function traducirError(m){ return m; }' +
      'function sbFetch(ruta, op){ guardar.enviado = { ruta: ruta, cuerpo: JSON.parse(op.body) };' +
      '  return Promise.resolve([{ id: "r1" }]); }' +
      crear + '\n' +
      'guardarComidaComoReceta(nombre);' +
      'guardar.RECETAS = RECETAS;'
    )(lista, nombre, { avisos, get enviado() { return enviado; }, set enviado(v) { enviado = v; } });
    return { enviado, avisos };
  };

  const r = correr([
    { n: 'Huevo', u: 'Pieza', cant: 2, P: 12.6, C: 1.2, G: 10.6 },
    { n: 'Pan integral', u: 'Gramos', cant: 60, P: 5.4, C: 28.2, G: 1.8 },
  ], 'Desayuno de siempre');

  ok(r.enviado && r.enviado.ruta === '/rest/v1/recipes', 'se escribe en `recipes`',
     'la tabla existía desde la 0001 y no la usaba nadie');
  const c = (r.enviado || {}).cuerpo || {};
  ok(c.name === 'Desayuno de siempre', 'con el nombre que se le puso');
  ok(Array.isArray(c.ingredients) && c.ingredients.length === 2,
     'y los dos alimentos dentro', JSON.stringify(c.ingredients));
  ok(c.ingredients && c.ingredients[0].cant === 2 && c.ingredients[0].u === 'Pieza',
     'con su cantidad y su unidad, tal y como se comieron',
     'guardar la porción base en vez de lo comido cambia la receta por otra cosa');
  ok(Math.abs(c.protein_g - 18) < 0.05 && Math.abs(c.carbs_g - 29.4) < 0.05 &&
     Math.abs(c.fat_g - 12.4) < 0.05,
     'y los totales sumados', JSON.stringify([c.protein_g, c.carbs_g, c.fat_g]));
  ok(c.servings === 1, 'una porción: es la comida entera, no un guiso para cuatro');

  // Sin nombre se llama como la comida. EJECUTADO y no por regex: la linea
  // acaba en coma -va dentro de un objeto- y buscar «|| comidaActual;» daba
  // rojo sin que nada estuviera mal.
  const sinNombre = correr([{ n: 'Avena', u: 'Gramos', cant: 40, P: 5, C: 27, G: 3 }], '   ');
  ok(((sinNombre.enviado || {}).cuerpo || {}).name === 'Desayuno',
     'y sin nombre se llama como la comida',
     'salió «' + (((sinNombre.enviado || {}).cuerpo || {}).name) + '»: una receta ' +
     'sin nombre no se encuentra nunca más');
}

// ------------------------------------------------------------------
console.log('\nY lo que se manda cabe en la columna');
{
  const rango = /protein_g\s+numeric\(8,2\) not null default 0 check \(protein_g >= 0\)/.test(MIG);
  ok(rango, 'la columna pide no negativo', 'si cambia, el acotado de abajo sobra o falta');
  const crear = sacar('function guardarComidaComoReceta(nombre){');
  ok(/Math\.min\(999999, Math\.max\(0, un1\(tot\.P\)\)\)/.test(crear),
     'y se acota antes de mandarlo',
     'un número fuera de rango no tumba ese campo: tumba la fila entera y la ' +
     'receta no se guarda');
  ok(/String\(nombre \|\| ''\)\.trim\(\)\.slice\(0, 80\)/.test(crear),
     'y el nombre se recorta');
}

// ------------------------------------------------------------------
console.log('\nY se vuelve a apuntar de un toque');
{
  ok(/select=id,name,servings,calories,is_public,ingredients/.test(APP),
     'los ingredientes se traen del servidor',
     'sin ellos la receta es un nombre y un número: se ve y no sirve');
  ok(/ing: Array\.isArray\(r\.ingredients\) \? r\.ingredients : \[\]/.test(APP),
     'y se guardan en memoria con guarda',
     'una fila vieja sin `ingredients` no puede tumbar el listado');

  const apuntar = sacar('function apuntarReceta(r){');
  ok(/agregarAlimento\(\{[\s\S]{0,260}?\{ calla: true \}\)/.test(apuntar),
     'cada ingrediente pasa por el camino de siempre',
     '`agregarAlimento` es el único que suma al día, repinta, persiste y ' +
     'deshace si falla: escribir eso otra vez es escribir los mismos fallos otra vez');
  ok(/toast\('toastComida', r\.n \+ ' · ' \+ ing\.length/.test(apuntar),
     'y se avisa UNA vez, no una por alimento',
     'cinco «agregado a Desayuno» seguidos tapan la pantalla');
  ok(/if\(!ing\.length\)\{/.test(apuntar), 'una receta vacía lo dice y no hace nada');

  const agregar = sacar('function agregarAlimento(a, opciones){');
  ok(/if\(!\(opciones && opciones\.calla\)\)\{/.test(agregar),
     'y el silencio es opcional: lo de siempre sigue avisando');
}

// ------------------------------------------------------------------
console.log('\nY aparecen donde se usan');
{
  const pintarSug = sacar('function pintarSugerencias(lista, texto, sinRed){');
  ok(/var bloqueRecetas = !recetas\.length \? '' :/.test(pintarSug),
     'se buscan junto a los alimentos');
  // LOS DOS TIENEN QUE ESTAR. Comparar posiciones a secas pasa cuando una
  // no aparece: `indexOf` devuelve -1 y -1 siempre es menor. La mutacion
  // que quitaba las recetas del todo sobrevivia por eso.
  const iRecetas = pintarSug.indexOf('aviso + bloqueRecetas +');
  const iMios = pintarSug.indexOf("bloque('Tus guardados'");
  ok(iRecetas > 0 && iMios > 0 && iRecetas < iMios,
     'y salen las primeras',
     'son tuyas y meten varios alimentos de un toque: si coincide una, es ' +
     'casi seguro lo que buscabas');
  ok(/if\(!lista\.length && !hayReceta\)\{/.test(pintarSug),
     'y «no encontré nada» no sale si hay una receta que sí',
     'decir que no hay nada teniéndolo es el fallo que ya se arregló con el ' +
     'catálogo sin señal');

  const clic = APP.slice(APP.indexOf("mealSugeridos.addEventListener('click'"));
  // Que la receta se BUSQUE y se USE, no solo que el texto aparezca antes:
  // un `var rec = null; e.target.closest('[data-receta]');` dejaba la
  // cadena en su sitio y la comprobacion pasaba sin que nada funcionara.
  const iRec = clic.indexOf("var rec = e.target.closest('[data-receta]');");
  const iSug = clic.indexOf("closest('[data-sug]')");
  ok(iRec > 0 && iSug > 0 && iRec < iSug &&
     /if\(rec\)\{[\s\S]{0,220}?abrirReceta\(r\);[\s\S]{0,40}?return;/.test(clic),
     'y el clic mira primero si es receta, y la abre',
     'una receta no tiene índice en SUGERIDOS: mirarla después la haría ' +
     'caer en el camino de los alimentos');
}

// ------------------------------------------------------------------
console.log('\nY desde «Mis recetas» también, que es donde se miran');
{
  ok(/recetaList[\s\S]{0,200}?addEventListener\('click'/.test(APP),
     'la lista escucha el toque');
  ok(/data-receta="'\+escapar\(String\(r\.id\|\|''\)\)\+'"/.test(APP),
     'y cada tarjeta lleva su id');
  const h = APP.slice(APP.indexOf("var caja = document.getElementById('recetaList');"));
  ok(/if\(r\) abrirReceta\(r\);/.test(h.slice(0, 500)),
     'y al tocarla se abre lo que lleva',
     'apuntarla de golpe metía varios alimentos sin que nadie los hubiera ' +
     'visto, y luego hay que quitarlos uno por uno');
  ok(/data-push="misrecetas"/.test(HTML), 'y ese camino sigue existiendo',
     'si algún día se llega desde otro sitio, `comidaActual` deja de ' +
     'significar algo y esto hay que repensarlo');
}

// ------------------------------------------------------------------
console.log('\nTocarla ENSEÑA lo que lleva; apuntarla es el segundo toque');
{
  // Tocarla la apuntaba de golpe. Una receta son VARIOS alimentos a la vez,
  // y apuntar cinco cosas sin haberlas visto es exactamente lo que luego
  // hay que deshacer una por una.
  const abrir = sacar('function abrirReceta(r){');
  ok(/recetaIng'\)\.innerHTML/.test(abrir), 'se pintan sus alimentos');
  ok(/textoUnidad\(x\.cant, x\.u \|\| 'Gramos'\)/.test(abrir),
     'con la unidad en plural cuando toca',
     '`abreviarUnidad` devuelve el singular siempre y salía «2 pieza»');
  ok(/btn\.textContent = 'Agregar a ' \+ comidaActual;/.test(abrir),
     'y el botón dice a qué comida va',
     'desde aquí no se ve la comida: «Agregar» a secas obliga a acordarse ' +
     'de por dónde se entró');
  ok(/btn\.disabled = !ing\.length;/.test(abrir),
     'y no deja apuntar una receta vacía');

  const h = APP.slice(APP.indexOf("document.getElementById('recetaAgregar').addEventListener"));
  ok(/cerrarReceta\(\);\n      if\(r\) apuntarReceta\(r\);/.test(h.slice(0, 400)),
     'y al confirmar se cierra y se apunta');

  // La hoja, FUERA de las vistas. Es la lección que acaba de costar que el
  // botón de guardar no hiciera nada.
  ok(/id="recetaSheet"/.test(HTML), 'la hoja existe');
  ok(HTML.indexOf('id="recetaSheet"') > HTML.indexOf('id="semanaSheet"') ||
     /id="recetaSheet"[\s\S]{0,4000}?id="nameSheet"/.test(HTML),
     'y vive con las demás hojas sueltas',
     'dentro de una vista se abriría midiendo 0×0; lo vigila ' +
     '`hojas-que-cruzan-pantallas`');
}

console.log('\nY se puede borrar, preguntando');
{
  const h = APP.slice(APP.indexOf("document.getElementById('recetaBorrar').addEventListener"));
  ok(/if\(!btn\.classList\.contains\('confirmando'\)\)\{/.test(h.slice(0, 600)),
     'el primer toque pregunta');
  ok(/setTimeout\(reposarBorradoReceta, 4000\)/.test(h.slice(0, 700)), 'y se desarma solo');
  ok(/user_id=eq\.' \+ sesion\.user\.id/.test(h.slice(0, 1500)),
     'y el borrado filtra por usuario además del id',
     'RLS ya lo impediría, pero la regla aquí es no apoyarse solo en ella');
  ok(/RECETAS\.splice\(i, 0, r\);/.test(h.slice(0, 1800)),
     'y si el servidor dice que no, vuelve a la lista',
     'quitarla de la pantalla y callarse es decirle que se borró algo que sigue ahí');
}

console.log('\nY el botón que no hacía nada ya no está');
{
  ok(!/<button class="btn-primary">\+ Nueva receta<\/button>/.test(HTML),
     '«+ Nueva receta» fuera',
     'sin `id`, sin manejador, y era lo más llamativo de la pantalla');
  ok(/Las recetas se guardan desde una comida/.test(HTML),
     'y en su lugar se dice de dónde salen',
     'quitar el botón sin explicar deja la misma pregunta sin el botón');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
