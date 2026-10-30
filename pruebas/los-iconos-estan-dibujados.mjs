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
for (const m of HTML.matchAll(/<symbol id="(i-[a-z-]+)"([^>]*)>([\s\S]*?)<\/symbol>/g)) {
  SIMBOLOS.set(m[1], { attrs: m[2], dentro: m[3] });
}
ok(SIMBOLOS.size > 10, 'se encuentran los símbolos', 'salieron ' + SIMBOLOS.size);

// Quién los usa. Tres caminos distintos, y los tres tienen que cuadrar.
const USOS = new Map();   // id -> de dónde sale
const apunta = (id, donde) => {
  if (!USOS.has(id)) USOS.set(id, new Set());
  USOS.get(id).add(donde);
};
for (const m of HTML.matchAll(/href="#(i-[a-z-]+)"/g)) apunta(m[1], 'index.html');
// app.js escribe el mismo `href="#i-..."` dentro de sus cadenas.
for (const m of APP.matchAll(/href="#(i-[a-z-]+)"/g)) apunta(m[1], 'app.js');
for (const m of APP.matchAll(/href="#i-' \+ ([A-Za-z.]+) \+ '"/g)) apunta('(variable: ' + m[1] + ')', 'app.js');
for (const m of APP.matchAll(/iconoSVG\('([a-z-]+)'\)/g)) apunta('i-' + m[1], 'app.js');
// La tabla de momentos del plan: ahí el id no se escribe junto al <use>,
// se guarda en `ico` y se compone al pintar.
for (const m of APP.matchAll(/ico:'([a-z-]+)'/g)) apunta('i-' + m[1], 'app.js (MOMENTOS)');

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

  // Las reglas que miden un icono, escritas a mano A PROPÓSITO: si mañana
  // alguien mete uno en un sitio nuevo, esta prueba se pone roja y le
  // obliga a pasar por aquí a decir con qué regla lo está midiendo.
  // Adivinarlo leyendo la cascada no se puede: quién gana solo se sabe
  // midiendo en un navegador, y así se midió cada uno de estos.
  const REGLAS = [
    '.greeting .streak svg', '.cp-ico svg', '.quick-circle svg', '.pend-ico svg',
    '.rec-ico svg', '.af-ico svg', '.meal-emoji svg', '.bottom-tabs button svg',
    '.searchbox svg', '.btn-ico svg', '.tabrow .ia-btn svg', '.tema-sol svg',
    '.avatar svg', '.plan-armar button svg', '.plan-vacio .ico svg',
    '.empty-day .ico svg', '.ia-icono svg, .ia-enviar svg', '.clock-btn svg',
    '.nota-badge svg', '.chip svg', '.icon-mini button svg',
    // Estos dos llevan la clase en el propio <svg>, no en el hueco.
    '.ico-momento', '.ia-atajo-icono', '.usr-acc button svg',
  ];
  const marcas = new Set();      // clases e ids que sabemos que miden algo
  for (const sel of REGLAS) {
    const regla = new RegExp(sel.replace(/[.#[\]]/g, (c) => '\\' + c) + '\\s*\\{([^}]*)\\}');
    const m = CSS.match(regla);
    ok(m && /width\s*:/.test(m[1]), `«${sel}» mide lo que hay dentro`,
       m ? 'la regla existe pero no pone ancho: ' + m[1] : 'no existe esa regla');
    for (const c of sel.matchAll(/[.#]([\w-]+)/g)) marcas.add(c[1]);
  }

  // Y de qué cuelga cada icono. Se sube por los padres de verdad —contando
  // etiquetas abiertas y cerradas— y no por una ventana de caracteres: los
  // botones de la barra no llevan clase propia y cuelgan de `.bottom-tabs`,
  // que queda muy por encima.
  const VACIAS = new Set(['meta', 'link', 'input', 'br', 'img', 'hr', 'source', 'col',
                          'area', 'base', 'embed', 'param', 'track', 'wbr']);
  const limpio = HTML.replace(/<!--[\s\S]*?-->/g, '');
  const etiquetas = [...limpio.matchAll(/<(\/?)([a-z]+)([^<>]*)>/g)];

  function deQuienCuelga(pos) {
    const marcas = [];
    let hondo = 0;
    for (let i = etiquetas.length - 1; i >= 0; i--) {
      const e = etiquetas[i];
      if (e.index >= pos) continue;
      const [, cierre, nombre, attrs] = e;
      if (VACIAS.has(nombre) || /\/$/.test(attrs)) continue;
      if (cierre) { hondo++; continue; }
      if (hondo > 0) { hondo--; continue; }
      const cl = /class="([^"]*)"/.exec(attrs);
      const id = /id="([^"]*)"/.exec(attrs);
      if (cl) marcas.push(...cl[1].split(/\s+/));
      if (id) marcas.push(id[1]);
      marcas.push(nombre);
    }
    return marcas;
  }

  for (const m of limpio.matchAll(/<svg><use href="#(i-[a-z-]+)"/g)) {
    const cadena = deQuienCuelga(m.index);
    ok(cadena.some((c) => marcas.has(c)),
       `«${m[1]}» cuelga de algo que lo mide (${cadena.slice(0, 3).join(' < ')})`,
       'un <svg> sin regla de ancho no sale pequeño: sale de 300x150 y parte ' +
       'la fila entera. Si el hueco es nuevo, añade su regla arriba. ' +
       'Las que hay miden: ' + [...marcas].join(' '));
  }

  // ---- Y LOS QUE ESCRIBE app.js, que es por donde se coló uno ----
  //
  //  Esto solo miraba index.html, y la mitad de los iconos de la app los
  //  escribe `app.js` dentro de cadenas. Por ahí pasaron tres sin regla de
  //  ancho —la chispa y la llave de la lista de usuarios del panel— y
  //  salieron de 300x150: estrellas verdes del tamaño de la pantalla, una
  //  por persona. Se vio en una captura, no aquí.
  //
  //  AQUÍ NO HAY ÁRBOL QUE SUBIR: son trozos de texto, y el hueco puede
  //  construirse al vuelo —`class="'+(u.ia?'b-on':'b-off')+'"`—. Así que se
  //  miran las clases escritas CERCA, por encima del icono, y basta con que
  //  una de ellas esté medida.
  //
  //  HASTA DÓNDE LLEGA, dicho sin adornos: caza el caso de verdad —el que
  //  pasó, una zona entera sin regla— y se le escapa meter un hueco nuevo
  //  sin medidas AL LADO de otro que sí las tiene, porque la clase del
  //  vecino le vale. Para eso haría falta el árbol, y aquí no hay árbol:
  //  hay cadenas de texto. Lo que cierra ese resto es mirar la pantalla.
  // El único que no se puede resolver leyendo: `pill.innerHTML`, donde el
  // hueco sale de `card.querySelector('[data-act="notas"]')` y su clase
  // -`chip`- está a cien líneas, en la plantilla de la tarjeta. Se anota a
  // mano y con la regla que lo mide, que se comprobó en un navegador: 13px.
  const A_MANO = { 'i-lapiz': '.chip svg' };

  for (const m of APP.matchAll(/<svg(?: class="[^"]*")?><use href="#(i-[a-z-]+)"/g)) {
    const antes = APP.slice(Math.max(0, m.index - 1400), m.index);
    const propia = /<svg class="([^"]*)"/.exec(m[0]);
    const cerca = [...new Set([
      ...(propia ? propia[1].split(/\s+/) : []),
      // Las de `class="..."` y las que se arman con un ternario dentro.
      ...[...antes.matchAll(/class="([^"]*)"/g)].flatMap((c) => c[1].split(/\s+/)),
      ...[...antes.matchAll(/class="[^"]*'\s*\+\s*\([^)]*\)/g)]
        .flatMap((c) => [...c[0].matchAll(/'([a-z][\w-]*)'/g)].map((x) => x[1])),
    ])].filter(Boolean);
    const medido = cerca.some((c) => marcas.has(c)) || !!A_MANO[m[1]];
    ok(medido,
       `«${m[1]}» de app.js cuelga de algo medido (${cerca.slice(-3).join(', ') || 'nada'})`,
       'sale de 300x150 y parte la fila entera. Lo escribe app.js, así que ' +
       'no se ve hasta que alguien abre esa pantalla. Las clases medidas ' +
       'son: ' + [...marcas].join(' '));
  }
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
