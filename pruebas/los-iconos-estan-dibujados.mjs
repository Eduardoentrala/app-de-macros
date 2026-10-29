// Los iconos de la app, y el fallo que no avisa.
//
// Eran emojis. Un emoji trae su propio color y su propio dibujo: el plato de
// iOS es gris con brillos y el de Android plano y naranja, no se pueden
// teñir, y al lado de una app en blanco y negro se veían pegados. Ahora son
// trazos, y el trazo vive en UN SOLO SITIO —el <defs> de index.html— porque
// los mismos dibujos los pinta el HTML quieto (la barra de abajo son TRES
// copias) y los pinta la app con innerHTML (el plan de comidas, los atajos
// del asistente).
//
// LO QUE VIGILA ESTA PRUEBA ES QUE EL <use> NO SE QUEDE HUÉRFANO:
//
//   Un `href="#i-camara"` cuando el símbolo se llama `i-fotos` no da error,
//   no deja hueco, no se ve en la consola. Simplemente no aparece nada, y
//   la fila se queda con el texto corrido. Es el mismo tipo de fallo que
//   las columnas que la app nombraba y la base no tenía: dos mitades de un
//   contrato en ficheros distintos sin nada que las ate.
//
// Y al revés: un símbolo que ya no usa nadie es peso muerto que se copia a
// cada teléfono en cada despliegue.
//
// EL TAMAÑO NO SE PRUEBA AQUÍ. Un <svg> sin width en el CSS no sale
// pequeño: sale de 300x150, el tamaño que el navegador da por defecto, y
// revienta la fila entera. Eso se mide en el navegador de verdad, porque
// leer el CSS no dice qué regla gana.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (p) => readFileSync(join(RAIZ, p), 'utf8').replace(/\r\n/g, '\n');
const HTML = leer('docs/index.html');
const APP = leer('docs/app.js');
const BASE = leer('docs/estilos/base.css');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

// ------------------------------------------------------------------
console.log('\nEl almacén de dibujos existe y está fuera del flujo');

const regla = (BASE.match(/\.iconos\{([^}]*)\}/) || [])[1];
ok(!!regla, 'hay una regla para el <svg> del almacén',
   'sin ella ese <svg> ocupa su sitio en la página: una franja en blanco ' +
   'por encima de todo');
ok(regla && /position:absolute/.test(regla), 'y lo saca del flujo');
ok(regla && !/display:none/.test(regla),
   'y NO con display:none',
   'con display:none hay navegadores que dejan de resolver los <use>, y ' +
   'entonces no se ve NINGÚN icono de la app: el fallo más caro posible ' +
   'por ahorrar una línea');
ok(/<svg class="iconos"/.test(HTML), 'y el <svg> del index lleva esa clase');

// ------------------------------------------------------------------
console.log('\nCada <use> apunta a un dibujo que existe');

// Los símbolos, con sus atributos, para poder mirarlos luego.
const SIMBOLOS = new Map();
for (const m of HTML.matchAll(/<symbol id="(i-[a-z]+)"([^>]*)>([\s\S]*?)<\/symbol>/g)) {
  SIMBOLOS.set(m[1], { attrs: m[2], dentro: m[3] });
}
ok(SIMBOLOS.size > 10, 'se encuentran los símbolos', 'salieron ' + SIMBOLOS.size);

// Quién los usa. Tres caminos distintos, y los tres tienen que cuadrar.
const USOS = new Map();   // id -> de dónde sale
const apunta = (id, donde) => {
  if (!USOS.has(id)) USOS.set(id, new Set());
  USOS.get(id).add(donde);
};
for (const m of HTML.matchAll(/href="#(i-[a-z]+)"/g)) apunta(m[1], 'index.html');
for (const m of APP.matchAll(/href="#i-' \+ ([A-Za-z.]+) \+ '"/g)) apunta('(variable: ' + m[1] + ')', 'app.js');
for (const m of APP.matchAll(/iconoSVG\('([a-z]+)'\)/g)) apunta('i-' + m[1], 'app.js');
// La tabla de momentos del plan: ahí el id no se escribe junto al <use>,
// se guarda en `ico` y se compone al pintar.
for (const m of APP.matchAll(/ico:'([a-z]+)'/g)) apunta('i-' + m[1], 'app.js (MOMENTOS)');

for (const [id, donde] of USOS) {
  if (id.startsWith('(')) continue;           // las variables se miran abajo
  ok(SIMBOLOS.has(id), `«${id}» existe (lo usa ${[...donde].join(', ')})`,
     'un href a un id que no existe no da error ni deja hueco: simplemente ' +
     'no se ve nada. Hay: ' + [...SIMBOLOS.keys()].join(' '));
}

// En app.js el id no siempre se escribe junto al <use>: se compone al
// pintar. Esos sitios no los puede comprobar el buscador, así que lo que se
// vigila es que sigan siendo LOS DOS QUE YA SE MIRAN por otro lado —la
// tabla de momentos y las llamadas a iconoSVG()—. Si aparece un tercero,
// esta prueba deja de cubrirlo y hay que venir a enseñarle de dónde saca
// su id.
{
  const compuestos = [...USOS.keys()].filter((k) => k.startsWith('('));
  const esperados = ['(variable: m.ico)', '(variable: id)'];
  ok(compuestos.length === esperados.length &&
     esperados.every((e) => compuestos.includes(e)),
     'los ids que se componen al pintar son los dos que ya se comprueban',
     'salieron: ' + compuestos.join(', ') + ' — se esperaban ' + esperados.join(', '));
  // Y que cada uno tenga de verdad quien le dé valor: si se borra la tabla
  // o la última llamada, el <use> se queda apuntando a «#i-undefined».
  ok([...USOS.values()].some((d) => d.has('app.js (MOMENTOS)')),
     'y la tabla de momentos sigue dándole ids',
     'sin ella `m.ico` es undefined y el <use> apunta a «#i-undefined»');
  ok(/iconoSVG\('[a-z]+'\)/.test(APP), 'y los atajos del asistente también');
}

// ------------------------------------------------------------------
console.log('\nY cada dibujo lo usa alguien');
for (const id of SIMBOLOS.keys()) {
  ok(USOS.has(id), `«${id}» se usa`,
     'un símbolo que no usa nadie se descarga en cada teléfono en cada ' +
     'despliegue sin pintar nada');
}

// ------------------------------------------------------------------
console.log('\nTodos son la MISMA familia');
// Es lo único que hace que diez dibujos distintos parezcan un juego y no
// diez iconos sueltos: mismo lienzo, mismo grosor, sin relleno, y el color
// heredado de donde se usen.
for (const [id, s] of SIMBOLOS) {
  const bien = /viewBox="0 0 24 24"/.test(s.attrs) &&
               /fill="none"/.test(s.attrs) &&
               /stroke="currentColor"/.test(s.attrs) &&
               /stroke-width="1\.6"/.test(s.attrs);
  ok(bien, `«${id}» con el mismo lienzo, grosor y color`,
     'un lienzo distinto lo pinta a otra escala y un grosor distinto se ve ' +
     'a simple vista al lado del de al lado. Tiene: ' + s.attrs.replace(/\s+/g, ' ').trim());
  ok(/<(path|circle|rect) /.test(s.dentro), `«${id}» dibuja algo`);
  ok(!/fill="(?!none)/.test(s.dentro) && !/stroke-width="/.test(s.dentro),
     `«${id}» no se pelea con la familia desde dentro`,
     'un relleno o un grosor en un trazo suelto es como no tener familia');
}

// ------------------------------------------------------------------
console.log('\nY en el Diario ya no queda ningún emoji');
{
  // Solo la pantalla del Diario: es la que se abre al entrar y la que se
  // mira veinte veces al día.
  const ini = HTML.indexOf('data-view="diario"');
  const fin = HTML.indexOf('class="app-view"', ini + 10);
  ok(ini > 0 && fin > ini, 'se encuentra la pantalla', `${ini}..${fin}`);
  const trozo = HTML.slice(ini, fin);
  // Lo que se busca son dibujos de colores, no cualquier cosa que no sea
  // ASCII: las flechas «›» y los taches «×» son tipografía, se tiñen con
  // el texto y están bien donde están.
  const pictos = trozo.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]\u{FE0F}?/gu) || [];
  // Las líneas de comentario hablan de los emojis que se quitaron; eso no
  // pinta nada en la pantalla.
  const vivos = pictos.filter((p) => {
    const i = trozo.indexOf(p);
    const linea = trozo.slice(trozo.lastIndexOf('\n', i) + 1, trozo.indexOf('\n', i));
    return !/^\s*(\/\/|<!--|\s*\w+ )/.test(linea) || /<span|<div|<button/.test(linea);
  });
  ok(vivos.length === 0, 'ni uno',
     'quedan: ' + vivos.join(' ') + ' — cada uno lo pinta un sistema distinto ' +
     'y ninguno sigue el color del texto');
}

// ------------------------------------------------------------------
console.log('\nY ninguno se queda sin tamaño');
{
  // UN <svg> SIN ANCHO EN EL CSS NO SALE PEQUEÑO: sale de 300x150, que es
  // lo que da el navegador por defecto, y revienta la fila entera. Como el
  // dibujo ya no trae width ni height puestos —los quita a propósito, para
  // que cada sitio ponga el suyo—, estrenar un hueco nuevo y olvidar la
  // regla es el fallo fácil de este montaje.
  //
  // Esto no dice QUÉ regla gana —eso solo se sabe midiendo en un navegador
  // de verdad, y así se midió—. Lo que dice es que el sitio donde se mete
  // un icono tiene alguna regla que le pone ancho.
  const CSS = ['base', 'maqueta', 'vistas', 'diario', 'cuenta', 'pantallas',
               'componentes', 'modo-app'].map((h) => leer('docs/estilos/' + h + '.css')).join('\n');

  // Los huecos donde hoy se mete un icono, y qué regla le da tamaño a cada
  // uno. La lista está escrita a mano A PROPÓSITO: si mañana alguien mete
  // un icono en un sitio nuevo, esta prueba se pone roja y le obliga a
  // pasar por aquí a decir con qué regla lo está midiendo. Adivinarlo
  // leyendo la cascada no se puede: quién gana solo se sabe midiendo.
  const HUECOS = {
    'span.streak': '.greeting .streak svg',
    'span.cp-ico': '.cp-ico svg',
    'span.quick-circle': '.quick-circle svg',
    'span.pend-ico': '.pend-ico svg',
    'span.rec-ico': '.rec-ico svg',
    'span.af-ico': '.af-ico svg',
    'span.meal-emoji': '.meal-emoji svg',
    'button[data-tabbar]': '.bottom-tabs button svg',
    // Y los dos que escribe app.js, que llevan su clase puesta en el <svg>.
    'svg.ico-momento': '.ico-momento',
    'svg.ia-atajo-icono': '.ia-atajo-icono',
  };
  for (const [hueco, selector] of Object.entries(HUECOS)) {
    const regla = new RegExp(selector.replace(/[.[\]]/g, (c) => '\\' + c) + '\\s*\\{([^}]*)\\}');
    const m = CSS.match(regla);
    ok(m && /width\s*:/.test(m[1]), `«${hueco}» tiene su regla de ancho (${selector})`,
       m ? 'la regla existe pero no pone ancho: ' + m[1] : 'no existe esa regla');
  }

  // Y que no haya ningún icono colgando de un hueco que no esté en la lista.
  for (const m of HTML.matchAll(/<svg><use href="#(i-[a-z]+)"/g)) {
    const antes = HTML.slice(Math.max(0, m.index - 120), m.index);
    const abre = antes.slice(antes.lastIndexOf('<'));
    const clase = (/<(\w+)[^>]*class="([^"]*)"/.exec(abre) || []);
    const dato = /<(\w+)[^>]*(data-tabbar)/.exec(abre);
    // El `data-tabbar` manda sobre la clase: el botón de la pestaña abierta
    // lleva además `class="active"`, y eso no es un hueco distinto.
    const llave = dato ? dato[1] + '[' + dato[2] + ']'
                : clase[1] ? clase[1] + '.' + clase[2].split(/\s+/)[0]
                : '¿? ' + abre.slice(0, 40);
    ok(llave in HUECOS, `«${m[1]}» cuelga de un hueco conocido (${llave})`,
       'un <svg> sin regla de ancho no sale pequeño: sale de 300x150 y parte ' +
       'la fila entera. Si el hueco es nuevo, añádelo arriba con su regla. ' +
       'Hay: ' + Object.keys(HUECOS).join(', '));
  }
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
