// El icono de la app: que exista, que sea un PNG de verdad y que esté bien
// enlazado.
//
// POR QUÉ SE PRUEBA ALGO QUE "SE VE"
//
// Precisamente porque NO se ve. El icono no sale en la pantalla de la app:
// sale en la pantalla de inicio del teléfono, y solo después de instalarla.
// Un enlace roto, un PNG mal escrito o una ruta que devuelve 404 no rompen
// nada visible al abrir la app —se ve idéntica— y el fallo solo aparece en
// el teléfono de un cliente, semanas después, en forma de cuadro gris.
//
// Y el PNG se escribe a mano (herramientas/iconos.mjs, sin librerías), así
// que aquí se DESCOMPRIME y se miran los píxeles. Comprobar que el archivo
// existe no prueba nada: un codificador roto también escribe archivos.
import { readFileSync, existsSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(RAIZ, 'docs');
const DIR = join(DOCS, 'iconos');
const HTML = readFileSync(join(DOCS, 'index.html'), 'utf8');

let ok = 0, mal = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { mal++; console.log(`  FALLA ${n}${extra ? '\n        ' + extra : ''}`); }
};

// ---------------------------------------------------------------------
//  Un decodificador mínimo, solo para lo que escribimos nosotros
// ---------------------------------------------------------------------
// No pretende leer cualquier PNG: lee el que genera nuestra herramienta
// —color 2, 8 bits, filtro 0— y revienta si se encuentra otra cosa, que es
// justo lo que queremos saber.
function leerPng(ruta) {
  const b = readFileSync(ruta);
  const firma = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) if (b[i] !== firma[i]) throw new Error('firma PNG mala');

  let i = 8, ancho = 0, alto = 0, bits = 0, tipo = -1;
  const trozos = [];
  const vistos = [];
  while (i < b.length) {
    const largo = b.readUInt32BE(i);
    const nombre = b.toString('ascii', i + 4, i + 8);
    const datos = b.subarray(i + 8, i + 8 + largo);
    vistos.push(nombre);
    if (nombre === 'IHDR') {
      ancho = datos.readUInt32BE(0);
      alto = datos.readUInt32BE(4);
      bits = datos[8];
      tipo = datos[9];
    }
    if (nombre === 'IDAT') trozos.push(datos);
    i += 12 + largo;
  }
  if (tipo !== 2) throw new Error('se esperaba color 2 (RGB) y vino ' + tipo);
  if (bits !== 8) throw new Error('se esperaban 8 bits y vinieron ' + bits);

  // Quitar el byte de filtro de cada línea. Solo se admite el 0: si la
  // herramienta empezara a filtrar, esto salta en vez de dar píxeles
  // sutilmente equivocados.
  const crudo = inflateSync(Buffer.concat(trozos));
  const linea = ancho * 3 + 1;
  const px = Buffer.alloc(ancho * alto * 3);
  for (let y = 0; y < alto; y++) {
    if (crudo[y * linea] !== 0) throw new Error('filtro ' + crudo[y * linea] + ' sin soportar');
    crudo.copy(px, y * ancho * 3, y * linea + 1, y * linea + 1 + ancho * 3);
  }
  return { ancho, alto, vistos, px, en: (x, y) => [px[(y * ancho + x) * 3], px[(y * ancho + x) * 3 + 1], px[(y * ancho + x) * 3 + 2]] };
}

const TAMANOS = [180, 192, 512, 32];

console.log('\n— Los archivos están —');
{
  for (const S of TAMANOS)
    check(`icono-${S}.png`, existsSync(join(DIR, `icono-${S}.png`)));
  check('icono.svg', existsSync(join(DIR, 'icono.svg')));
  check('manifest.json', existsSync(join(DOCS, 'manifest.json')));
}

console.log('\n— Y son PNG válidos, no archivos con nombre de PNG —');
{
  for (const S of TAMANOS) {
    let img = null, error = '';
    try { img = leerPng(join(DIR, `icono-${S}.png`)); } catch (e) { error = e.message; }
    check(`icono-${S}.png se descomprime`, img !== null, error);
    if (!img) continue;
    check(`icono-${S}.png mide ${S}×${S}`, img.ancho === S && img.alto === S,
          `mide ${img.ancho}×${img.alto}`);
    // Cuadrado: un icono no cuadrado lo deforma el teléfono sin avisar.
    check(`icono-${S}.png es cuadrado`, img.ancho === img.alto);
    check(`icono-${S}.png lleva IHDR, IDAT y IEND`,
          ['IHDR', 'IDAT', 'IEND'].every(n => img.vistos.includes(n)),
          img.vistos.join(','));
  }
}

console.log('\n— Y el dibujo es el que se quería —');
{
  // Se mira el de 512, que es donde la geometría se aprecia. Las posiciones
  // salen de las proporciones de herramientas/iconos.mjs: aro de radio .302
  // del lado, del 72% y arrancando arriba, y la pesa dentro.
  const img = leerPng(join(DIR, 'icono-512.png'));
  const S = 512, c = S / 2, R = 0.302 * S;
  // Un punto del aro a `giro` grados desde arriba, como las agujas.
  const en = (giro) => {
    const t = (giro * Math.PI) / 180;
    return img.en(Math.round(c + R * Math.sin(t)), Math.round(c - R * Math.cos(t)));
  };
  // Va a la manera de Apple: el fondo es el color y el glifo es BLANCO. Al
  // revés de como estaba antes, asi que estas dos son las que hay que mirar.
  const blanco = ([r, g, b]) => r > 230 && g > 230 && b > 230;
  const verde  = ([r, g, b]) => g > r + 40 && g > b + 40;

  check('arriba del aro hay trazo blanco', blanco(en(0)), en(0).join(','));
  check('a la derecha también', blanco(en(90)), en(90).join(','));
  check('abajo también', blanco(en(180)), en(180).join(','));
  // El hueco: el aro cubre el 72% (259.2°) desde arriba, así que de ahí a
  // los 360° tiene que verse el FONDO y no trazo. Si algún día se cierra el
  // aro, esto avisa.
  check('y arriba a la izquierda queda el hueco', verde(en(310)), en(310).join(','));

  // La pesa: el centro cae en mitad de la barra, así que ahí hay blanco. Es
  // lo que distingue este icono del anillo pelado que había antes.
  check('en el centro está la barra de la pesa', blanco(img.en(c, c)), img.en(c, c).join(','));
  // Y los discos, a los lados de la barra.
  const disco = Math.round(c + 0.178 * 0.62 * S);
  check('y los discos a los lados', blanco(img.en(disco, c)), img.en(disco, c).join(','));

  // Las esquinas son fondo: si el rasterizador se desbordara y rellenara de
  // más, esto deja de cumplirse.
  const esquina = img.en(4, 4);
  check('las esquinas son del color de fondo', verde(esquina), esquina.join(','));
  // El degradado del fondo: arriba más claro que abajo. Es lo primero que se
  // pierde si alguien simplifica el pintado.
  check('el fondo va degradado', img.en(4, 4)[1] > img.en(4, S - 5)[1] + 20,
        img.en(4, 4).join(',') + ' arriba / ' + img.en(4, S - 5).join(',') + ' abajo');
  // El glifo, en cambio, va PLANO. Un glifo degradado sobre fondo degradado
  // es lo que hace que un icono no parezca de Apple, y es justo lo que se
  // pidió evitar.
  const gArriba = en(0), gAbajo = en(180);
  check('el glifo NO va degradado', Math.abs(gArriba[1] - gAbajo[1]) < 8,
        gArriba.join(',') + ' arriba / ' + gAbajo.join(',') + ' abajo');

  // Sin transparencia: iOS descarta el alfa y deja el fondo NEGRO, no
  // transparente. Un icono con fondo transparente sale con un cuadro negro
  // en el iPhone.
  const b = readFileSync(join(DIR, 'icono-512.png'));
  check('sin canal alfa (color 2)', b[25] === 2, 'color ' + b[25]);
}

console.log('\n— Zona segura de Android —');
{
  // Un icono `maskable` puede recortarse hasta un círculo del 80% del lado.
  // Todo lo que importe tiene que caber dentro o Android le corta el aro.
  // Se comprueba con los números, no con la vista.
  const radio = 0.302, grosor = 0.050;
  const borde = (radio + grosor / 2) * 2;          // diámetro que ocupa el dibujo
  check('el dibujo cabe en el círculo del 80%', borde <= 0.80,
        `ocupa ${(borde * 100).toFixed(1)}% y el tope es 80%`);
}

console.log('\n— Y el service worker no los deja fijos para siempre —');
{
  // LA TRAMPA QUE ESTO VIGILA: los iconos y el manifest no llevan `?v=` en
  // la dirección, porque quien los lee es el sistema operativo y no pasa por
  // el mecanismo del sello. Si el service worker los guardara, se quedarían
  // fijos para siempre: se rediseña el icono, se publica, y en el teléfono
  // sigue el de antes sin forma de enterarse.
  //
  // Ya pasó con la primera versión de este icono, y por eso hay prueba.
  const SW = readFileSync(join(DOCS, 'sw.js'), 'utf8');
  check('sw.js deja fuera la carpeta de iconos', /\/iconos\//.test(SW));
  check('y también el manifest', /manifest\.json/.test(SW));
  // Que estén nombrados no basta: tienen que salir con `return` ANTES de
  // llegar al guardado, como hace version.txt.
  // El `.*` y no `[^)]*`: la condición lleva paréntesis dentro
  // —`includes('/iconos/')`— y una clase negada se para en el primero.
  const salida = SW.match(/^\s*if \(.*iconos.*\) return;$/m);
  check('y salen con return, no solo mencionados', !!salida,
        salida ? salida[0] : 'no hay un if que corte');
}

console.log('\n— El manifest dice lo que debe —');
{
  const m = JSON.parse(readFileSync(join(DOCS, 'manifest.json'), 'utf8'));
  check('tiene nombre', !!m.name);
  check('y nombre corto para debajo del icono', !!m.short_name && m.short_name.length <= 12);
  // Sin `display: standalone` se abre en una pestaña con la barra del
  // navegador y deja de parecer una app.
  check('se abre como app', m.display === 'standalone');
  check('está en español', /^es/.test(m.lang || ''));
  // Relativas y no absolutas: la app vive en /app-de-macros/ en GitHub
  // Pages, así que un "/" inicial la mandaría a la raíz del dominio.
  check('start_url es relativa', typeof m.start_url === 'string' && !m.start_url.startsWith('/'));
  check('scope es relativo', typeof m.scope === 'string' && !m.scope.startsWith('/'));

  const iconos = m.icons || [];
  check('declara el de 192', iconos.some(i => i.sizes === '192x192'));
  check('y el de 512', iconos.some(i => i.sizes === '512x512'));
  check('alguno es maskable', iconos.some(i => /maskable/.test(i.purpose || '')));
  // El fallo clásico del manifest: la ruta no existe. Chrome no dice nada,
  // simplemente no ofrece instalar.
  const rotos = iconos.filter(i => !existsSync(join(DOCS, i.src)));
  check('ninguna ruta del manifest está rota', rotos.length === 0,
        rotos.map(i => i.src).join(', '));
}

console.log('\n— Y el index los enlaza —');
{
  check('enlaza el manifest', /<link[^>]+rel="manifest"[^>]+href="manifest\.json"/.test(HTML));
  check('tiene apple-touch-icon', /rel="apple-touch-icon"/.test(HTML));
  // EL FALLO QUE SE QUIERE EVITAR: iOS no acepta SVG en apple-touch-icon.
  // Se lo salta sin avisar y vuelve a poner la captura de pantalla, o sea
  // que el icono "está" y no sirve de nada.
  const apple = HTML.match(/<link[^>]+rel="apple-touch-icon"[^>]*>/);
  check('y apunta a un PNG, no a un SVG', !!apple && /\.png"/.test(apple[0]),
        apple ? apple[0] : 'no está');
  check('hay favicon SVG', /rel="icon"[^>]+image\/svg\+xml/.test(HTML));
  check('y un PNG de respaldo', /rel="icon"[^>]+image\/png/.test(HTML));

  // Todo lo enlazado tiene que existir de verdad.
  const rotos = [...HTML.matchAll(/<link[^>]+href="(iconos\/[^"]+|manifest\.json)"/g)]
    .map(m => m[1]).filter(r => !existsSync(join(DOCS, r)));
  check('ningún enlace del index está roto', rotos.length === 0, rotos.join(', '));

  // El título sale en la pestaña y en el diálogo de instalar de Android.
  // Decía "Mockup interactivo" mucho después de dejar de ser un mockup.
  check('el título ya no dice mockup', !/mockup/i.test(HTML.match(/<title>[^<]*<\/title>/)[0]));
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);
