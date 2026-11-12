// El catálogo enseñaba seis veces el mismo dibujo.
//
// Él lo dijo de un vistazo: «los diseños de las fotos de los ejercicios se
// ven bien chafotas, todos son iguales». Y no era cosa de gusto: el dibujo
// salía de `figureSvg(grupo)`, con el GRUPO por argumento y no el
// ejercicio. Los seis de «Pecho» recibían la misma llamada, así que salían
// seis cuerpos idénticos con el pecho en rojo.
//
// Lo de fondo es peor que lo feo: para llegar a esa pantalla ya habías
// tocado la pestaña «Pecho». El dibujo te repetía lo que acababas de
// tocar. Y el rótulo de debajo —«VISTA FRONTAL»— tampoco hablaba del
// ejercicio: hablaba del dibujo. Media pantalla ocupada por cero
// información, con el nombre partido en dos renglones por falta de sitio.
//
// El propio código lo tenía confesado desde el primer día: «marcador de
// posición del arte final». El arte nunca llegó y el marcador se quedó
// haciendo de versión buena.
//
// Así que lo que esta prueba vigila no es que la pantalla sea bonita: es
// que CADA FILA DIGA ALGO DISTINTO DE LA DE AL LADO. Si algún día las seis
// vuelven a decir lo mismo, da igual con qué se pinten, es el mismo fallo.
//
// Y de paso el buscador, que es lo que faltaba para no tener que adivinar
// que «Curl martillo» vive en Bíceps.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8');
const CSS = readFileSync(join(RAIZ, 'docs', 'estilos', 'componentes.css'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

const sinComentarios = (s) => s.replace(/^\s*\/\/.*$/gm, '');

// Un bloque con delimitadores equilibrados, que es lo único de fiar: la
// tabla de ejercicios lleva `[` y `]` dentro, y contar líneas o pedir
// ventanas de N caracteres se parte en cuanto alguien añade un ejercicio.
function equilibrado(desde, abre, cierra) {
  const i = APP.indexOf(desde);
  if (i < 0) throw new Error('no encuentro: ' + desde);
  let n = 0, j = APP.indexOf(abre, i);
  for (let k = j; k < APP.length; k++) {
    if (APP[k] === abre) n++;
    else if (APP[k] === cierra) { n--; if (!n) return APP.slice(i, k + 1); }
  }
  throw new Error('sin cerrar: ' + desde);
}
// Una función: primero los paréntesis de la firma, luego la llave del
// cuerpo. Al revés se parte en cuanto la firma lleva una llave dentro.
function fn(cabecera) {
  const i = APP.indexOf(cabecera);
  if (i < 0) throw new Error('no encuentro: ' + cabecera);
  let n = 0, j = APP.indexOf('(', i);
  for (; j < APP.length; j++) {
    if (APP[j] === '(') n++;
    else if (APP[j] === ')') { n--; if (!n) break; }
  }
  n = 0;
  for (let k = APP.indexOf('{', j); k < APP.length; k++) {
    if (APP[k] === '{') n++;
    else if (APP[k] === '}') { n--; if (!n) return APP.slice(i, k + 1); }
  }
  throw new Error('llaves sin cerrar: ' + cabecera);
}
function linea(exacta) {
  if (!APP.includes(exacta)) throw new Error('no encuentro la línea: ' + exacta);
  return exacta;
}

// ------------------------------------------------------------------
// SE EJECUTA EL CÓDIGO DE VERDAD. Mirando el texto, cambiar el subtítulo
// por una constante dejaría todas las expresiones en su sitio.
function montar() {
  const caja = { innerHTML: '' };
  const scroller = { hidden: false };
  const cuantos = { hidden: true, textContent: '' };
  const fuente = [
    linea('  var BASICO = true, ACCESORIO = false;'),
    equilibrado('var groups = ', '[', ']') + ';',
    equilibrado('var APAREJOS = ', '{', '}') + ';',
    linea('  var selected = new Set();'),
    linea("  var busqueda = '';"),
    linea('  var activeGroup = groups[0].key;'),
    'var grid = _grid, libScroller = _scroller, libCuantos = _cuantos;',
    fn('function sinTildes('),
    fn('function filasDeLaLibreria('),
    fn('function renderGrid('),
    `return {
       groups: groups, APAREJOS: APAREJOS, caja: _grid,
       scroller: _scroller, cuantos: _cuantos,
       marcar: function(id){ selected.add(id); },
       buscar: function(q){ busqueda = q; return filasDeLaLibreria(); },
       pintar: function(q, g){
         busqueda = q === undefined ? '' : q;
         if(g) activeGroup = g;
         renderGrid();
         return _grid.innerHTML;
       }
     };`,
  ].join('\n');
  return new Function('escapar', '_grid', '_scroller', '_cuantos', fuente)(
    (s) => String(s).replace(/[&<>"]/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
    caja, scroller, cuantos);
}
const L = montar();
const subtitulos = (html) =>
  Array.from(html.matchAll(/<small>([^<]*)<\/small>/g)).map((m) => m[1]);
const nombres = (html) =>
  Array.from(html.matchAll(/<b>([^<]*)<\/b>/g)).map((m) => m[1]);

// ------------------------------------------------------------------
console.log('\nCada fila dice algo distinto de la de al lado');
{
  let todosVariados = true, peor = '';
  for (const g of L.groups) {
    const subs = subtitulos(L.pintar('', g.key));
    if (new Set(subs).size < 2) { todosVariados = false; peor = g.label + ': ' + subs[0]; }
  }
  ok(todosVariados,
     'en ningún grupo se repite lo mismo seis veces',
     'es EL fallo: ' + peor + '. Si las seis filas dicen lo mismo, la ' +
     'pantalla no está diciendo nada, se pinte como se pinte');

  // Y lo que dicen es útil: con qué se hace y si es básico o accesorio.
  const pecho = subtitulos(L.pintar('', 'pecho'));
  ok(pecho.length === 6, 'salen los seis de Pecho', 'salieron ' + pecho.length);
  ok(pecho.includes('Barra · Básico'), 'el press de banca es con barra y es básico',
     pecho.join(' | '));
  ok(pecho.includes('Polea · Accesorio'), 'y el cruce de poleas es accesorio',
     pecho.join(' | '));

  // Sin buscar NO se repite el grupo: ya lo pone la pestaña de arriba.
  ok(!pecho.some((s) => s.indexOf('Pecho') >= 0),
     'y no te repite «Pecho», que es lo que acabas de tocar',
     'ese era el pecado del dibujo; no vale repetirlo en texto');
}

// ------------------------------------------------------------------
console.log('\nY el dibujo que no decía nada ya no está');
{
  const limpio = sinComentarios(APP);
  ok(!/function figureSvg\s*\(/.test(limpio), 'no queda la figura');
  ok(!/var VISTA = \{/.test(limpio), 'ni la tabla de vistas');
  ok(!/vista posterior|vista frontal/.test(limpio),
     'ni el rótulo que hablaba del dibujo en vez del ejercicio');
  ok(!/ex-lib-pic|ex-lib-card|ex-lib-name/.test(limpio + CSS + HTML),
     'ni las clases de las tarjetas viejas',
     'CSS muerto que nadie borra es CSS que alguien copia');
  // En oscuro el recuadro se forzaba a claro porque la figura iba con
  // grises fijos: seis cuadros blancos encendidos de noche.
  ok(!/#f0f1f3/.test(CSS), 'ni el parche que lo forzaba a claro de noche');
}

// ------------------------------------------------------------------
console.log('\nLos datos están completos y cuadran');
{
  const todos = L.groups.flatMap((g) => g.ex);
  ok(todos.length === 48, 'siguen los 48 ejercicios', 'hay ' + todos.length);
  ok(new Set(todos.map((e) => e[0])).size === 48, 'y ninguno repetido');

  const sinAparejo = todos.filter((e) => !L.APAREJOS[e[1]]);
  ok(sinAparejo.length === 0,
     'todos tienen un aparejo que existe',
     sinAparejo.map((e) => e[0] + ' → ' + e[1]).join(', '));

  const malBasico = todos.filter((e) => e[2] !== true && e[2] !== false);
  ok(malBasico.length === 0,
     'y todos dicen si son básicos o accesorios',
     malBasico.map((e) => e[0]).join(', '));

  // Un icono mal escrito no revienta: deja un hueco en blanco y nadie se
  // entera hasta que lo ve en el teléfono.
  const sinIcono = Object.values(L.APAREJOS)
    .filter((a) => !HTML.includes('id="' + a.icono + '"'));
  ok(sinIcono.length === 0,
     'y cada aparejo tiene su icono en el index',
     sinIcono.map((a) => a.nombre + ' → #' + a.icono).join(', '));

  // Y al revés: iconos de aparejo que no usa nadie.
  const huerfanos = (HTML.match(/id="(i-ap-[a-z]+)"/g) || [])
    .map((s) => s.slice(4, -1))
    .filter((id) => !Object.values(L.APAREJOS).some((a) => a.icono === id));
  ok(huerfanos.length === 0, 'y no sobra ninguno', huerfanos.join(', '));
}

// ------------------------------------------------------------------
console.log('\nEl buscador busca en los ocho grupos, no en la pestaña');
{
  // Esto es lo que no se podía hacer: para agregar «Curl martillo» había
  // que saber de antemano que vive en Bíceps.
  const r = L.buscar('martillo');
  ok(r.length === 1 && r[0].nombre === 'Curl martillo',
     'estando en Pecho, «martillo» encuentra el curl martillo de Bíceps',
     r.map((x) => x.nombre).join(', '));

  ok(L.buscar('jalon').some((x) => x.nombre === 'Jalón al pecho'),
     'y «jalon» sin tilde encuentra «Jalón»',
     'en el teclado del teléfono nadie pone la tilde para buscar');
  ok(L.buscar('SENTADILLA').length >= 2, 'y las mayúsculas dan igual');

  // El aparejo también se busca: es media razón para tener el dato.
  const manc = L.buscar('mancuerna');
  ok(manc.length >= 8, 'se puede buscar por aparejo: «mancuerna»',
     'salieron ' + manc.length);
  ok(new Set(manc.map((x) => x.grupo.key)).size >= 4,
     'y salen de varios grupos a la vez');
  ok(L.buscar('polea').every((x) => x.aparejo.nombre === 'Polea' ||
       /polea/i.test(x.nombre)), 'y lo que sale de «polea» es de polea');

  // Palabras sueltas, en cualquier orden: así se escribe de verdad.
  const alReves = L.buscar('polea curl');
  ok(alReves.some((x) => x.nombre === 'Curl en polea'),
     '«polea curl» encuentra «Curl en polea»',
     alReves.map((x) => x.nombre).join(', '));
  ok(L.buscar('curl polea').length === alReves.length,
     'y da igual el orden');
  // Dos palabras ACOTAN, no amplían. Con un `some` en vez del `every`,
  // «curl polea» sacaría todos los curls MÁS todas las poleas y las dos
  // comprobaciones de arriba seguirían verdes.
  ok(L.buscar('curl polea').length < L.buscar('curl').length,
     'y añadir una palabra deja menos cosas, no más',
     'curl: ' + L.buscar('curl').length + ' · curl polea: ' +
     L.buscar('curl polea').length);

  // Buscando SÍ se dice de qué grupo es cada uno: es lo único que no
  // sabes cuando los resultados vienen de los ocho.
  const html = L.pintar('curl');
  ok(subtitulos(html).every((s) => /^(Bíceps|Piernas|Tríceps|Espalda) · /.test(s)),
     'y cada resultado dice de qué grupo es',
     subtitulos(html).join(' | '));
  ok(/ejercicios, de todos los grupos/.test(L.cuantos.textContent),
     'y se dice cuántos salieron', L.cuantos.textContent);
  ok(L.cuantos.hidden === false, 'y ese rótulo se ve al buscar');

  // Las pestañas de grupo se esconden: buscando no mandan nada, y
  // dejarlas con una marcada diría que sí.
  ok(L.scroller.hidden === true, 'y las pestañas de grupo se quitan de en medio');
  L.pintar('');
  ok(L.scroller.hidden === false && L.cuantos.hidden === true,
     'y al borrar la búsqueda vuelven');
}

// ------------------------------------------------------------------
console.log('\nY cuando no hay nada no se promete ninguna puerta');
{
  const vacio = L.pintar('bicicleta');
  ok(/Nada con «bicicleta»/.test(vacio), 'se dice que no hay nada', vacio.slice(0, 120));
  // Se cuentan FILAS y no negritas: el propio aviso de «no hay nada» lleva
  // una `<b>`, así que contar negritas daría uno y la comprobación sería
  // verde por el motivo equivocado.
  ok((vacio.match(/class="ex-row/g) || []).length === 0,
     'y no queda ninguna fila suelta');

  // AQUÍ NO SE PUEDE ESCRIBIR UN EJERCICIO NUEVO: ese campo está en la
  // hoja de «+ agregar ejercicio», que es de donde se viene y que ya se
  // cerró. Ofrecerlo desde aquí sería la puerta que no existe de siempre.
  ok(!/escríbelo|escribelo|agr[ée]galo|cr[eé]alo/i.test(vacio),
     'y no se ofrece escribirlo, porque desde aquí no se puede',
     vacio);
  ok(/otra palabra/.test(vacio) && /polea|mancuerna/.test(vacio),
     'se ofrece lo que sí se puede hacer desde aquí: buscar distinto');

  // Y lo que escribió la persona va escapado, que es texto de teclado.
  const malo = L.pintar('<img src=x onerror=alert(1)>');
  ok(!/<img/.test(malo) && /&lt;img/.test(malo),
     'y lo que se tecleó no se interpreta');
}

// ------------------------------------------------------------------
console.log('\nY la pantalla se abre limpia');
{
  const limpio = sinComentarios(fn('function abrirLibreria('));
  ok(/busqueda = ''/.test(limpio) && /libBuscar\.value = ''/.test(limpio),
     'abrir la librería borra la búsqueda de la vez pasada',
     'si no, se abre con cuatro resultados sueltos y las pestañas ' +
     'escondidas, y nadie entiende por qué');
  ok(/renderTabs\(\)/.test(limpio) && /renderGrid\(\)/.test(limpio) &&
     /renderBottom\(\)/.test(limpio), 'y repinta las tres cosas');
  ok(/if\(id === 'library'\) abrirLibreria\(\);/.test(APP),
     'y es lo que se llama al entrar');
}

// ------------------------------------------------------------------
console.log('\nY la fila se puede tocar');
{
  const una = L.pintar('', 'pecho');
  ok(/<button type="button" class="ex-row/.test(una),
     'cada fila es un botón de verdad',
     'un div no entra con el teclado ni lo anuncia el lector de pantalla');
  ok(/aria-pressed="false"/.test(una), 'que dice si está marcado');
  ok(/min-height:58px/.test(CSS), 'y mide lo que mide un dedo');
  ok(/\.ex-row\.picked \.ex-row-chk\{/.test(CSS), 'y marcado se ve marcado');
  ok(/<input id="libBuscar"/.test(HTML) && /enterkeyhint="search"/.test(HTML),
     'y el buscador está en el index con su tecla de buscar');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
