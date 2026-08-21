// Dibuja el icono de la app y lo escribe en PNG y en SVG.
//
//  POR QUÉ EXISTE ESTO
//
//  La app no tenía icono. Ninguno: ni favicon, ni apple-touch-icon, ni
//  manifest. Y sin apple-touch-icon, cuando alguien la añade a la pantalla
//  de inicio del iPhone, iOS pone UNA CAPTURA DE LA PÁGINA como icono. Un
//  cuadrito borroso con letra diminuta, entre iconos de verdad.
//
//  Es lo primero que ve el cliente cada día y lo único que compite con las
//  otras apps de su pantalla.
//
//  POR QUÉ SE DIBUJA A MANO Y NO SE USA UNA LIBRERÍA
//
//  Rasterizar un SVG a PNG pide una librería (sharp, resvg, canvas), y este
//  proyecto no tiene dependencias a propósito. Pero PNG hace falta sí o sí:
//  iOS NO acepta SVG en apple-touch-icon, solo PNG.
//
//  La salida es lo bastante simple —un fondo degradado y dos anillos— para
//  dibujarla con aritmética y comprimirla con `zlib`, que ya viene en Node.
//  Así el icono se regenera en cualquier máquina con `node` y nada más.
//
//  UN SOLO SITIO CON LOS NÚMEROS
//
//  La geometría vive en GEOM y de ahí salen las DOS cosas: el rasterizador
//  la usa para pintar píxeles y el generador de SVG para escribir el mismo
//  círculo en texto. Cambiar el grosor del anillo aquí lo cambia en los dos
//  formatos, que es justo lo que se descuadra cuando se mantienen aparte.
//
//  Se ejecuta:   node herramientas/iconos.mjs
//  Y `pruebas/iconos.mjs` comprueba que lo generado sigue estando y cuadra.
//
//  OJO AL CAMBIAR EL DIBUJO: los nombres de archivo NO llevan sello de
//  versión, y el service worker los guarda para siempre. Si algún día se
//  rediseña el icono hay que CAMBIARLE EL NOMBRE al archivo, o quien ya
//  tenga la app instalada se quedará con el de antes para siempre.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(RAIZ, 'docs', 'iconos');

// ---------------------------------------------------------------------
//  La geometría, en proporciones y no en píxeles
// ---------------------------------------------------------------------
// Todo va como fracción del lado. Así el mismo dibujo sale igual a 32 que a
// 512 y no hay una versión "de las pequeñas" que se desvíe por su cuenta.
//
// El tamaño del anillo no es estético, es un requisito de Android: un icono
// `maskable` puede recortarse hasta un círculo del 80% del lado, así que
// todo lo que importe tiene que caber dentro. Aquí el anillo ocupa el 69.2%
// (radio 0.30 + medio grosor 0.048, por dos), o sea que entra con margen y
// el MISMO archivo sirve de icono normal y de maskable.
const GEOM = {
  radio:   0.300,   // del centro al eje del trazo
  grosor:  0.096,   // ancho del trazo
  // Cuánto da la vuelta el arco de progreso. 72% es "casi todo el día
  // hecho": deja un hueco claro arriba a la izquierda que se lee como algo
  // en marcha. Cerrado del todo sería un donut y no diría nada.
  vuelta:  0.72,
  // Empieza arriba, como el anillo del Diario, que lleva rotate(-90deg).
  inicio: -Math.PI / 2
};

// Los colores salen de la paleta oscura de la app (docs/estilos/base.css),
// no de un gusto aparte: el anillo de verdad lleva --pill-bg de pista y
// --green de progreso.
//
// Sobre fondo oscuro y no claro a propósito: un icono blanco se funde con
// el fondo de media pantalla de inicio y desaparece. El oscuro recorta
// contra cualquier fondo de pantalla.
const COLOR = {
  fondoArriba: [0x1e, 0x20, 0x23],
  fondoAbajo:  [0x0b, 0x0b, 0x0d],   // --ink
  pista:       [0x2b, 0x2d, 0x31],   // --pill-bg oscuro, un pelo levantado
  arcoArriba:  [0x62, 0xe8, 0xa4],   // --green oscuro, aclarado
  arcoAbajo:   [0x1c, 0x9a, 0x56]    // --green claro
};

const mezcla = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t
];

// ---------------------------------------------------------------------
//  Rasterizar
// ---------------------------------------------------------------------
// Sin muestreo múltiple: se calcula la DISTANCIA de cada píxel al trazo y
// se usa para el borde suave. Un píxel a más de medio grosor está fuera, a
// menos está dentro, y la franja de 1 px de en medio se rellena a medias.
// Sale mejor que promediar sixteen muestras y cuesta una fracción.
function pintar(S) {
  const px = Buffer.alloc(S * S * 3);
  const c = S / 2;
  const R = GEOM.radio * S;
  const medio = (GEOM.grosor * S) / 2;
  const barrido = GEOM.vuelta * Math.PI * 2;
  const a0 = GEOM.inicio;
  const a1 = a0 + barrido;
  // Los centros de las dos puntas redondas. El anillo del Diario lleva
  // stroke-linecap="round"; sin esto el icono acabaría en corte recto, que
  // es lo que distingue un anillo cuidado de una barra de progreso.
  const P0x = c + R * Math.cos(a0), P0y = c + R * Math.sin(a0);
  const P1x = c + R * Math.cos(a1), P1y = c + R * Math.sin(a1);
  const DOS_PI = Math.PI * 2;

  for (let y = 0; y < S; y++) {
    const py = y + 0.5;
    const tv = S === 1 ? 0 : y / (S - 1);        // 0 arriba, 1 abajo
    const fondo = mezcla(COLOR.fondoArriba, COLOR.fondoAbajo, tv);
    const arco  = mezcla(COLOR.arcoArriba,  COLOR.arcoAbajo,  tv);

    for (let x = 0; x < S; x++) {
      const pxx = x + 0.5;
      const dx = pxx - c, dy = py - c;
      const r = Math.hypot(dx, dy);

      // --- pista: el anillo entero ---
      const dPista = Math.abs(r - R);
      const cubPista = Math.min(Math.max(medio + 0.5 - dPista, 0), 1);

      // --- arco: solo el tramo, con las puntas redondas ---
      // El ángulo se mide desde el arranque y se normaliza a [0, 2π). Si
      // cae dentro del barrido, la distancia es la misma que la de la
      // pista; si cae fuera, lo único que puede tocarlo son las puntas.
      let t = (Math.atan2(dy, dx) - a0) % DOS_PI;
      if (t < 0) t += DOS_PI;
      const dArco = t <= barrido
        ? Math.abs(r - R)
        : Math.min(Math.hypot(pxx - P0x, py - P0y),
                   Math.hypot(pxx - P1x, py - P1y));
      const cubArco = Math.min(Math.max(medio + 0.5 - dArco, 0), 1);

      // Se apila: fondo, pista encima, arco encima del todo.
      const i = (y * S + x) * 3;
      for (let k = 0; k < 3; k++) {
        let v = fondo[k];
        v = v + (COLOR.pista[k] - v) * cubPista;
        v = v + (arco[k]        - v) * cubArco;
        px[i + k] = Math.round(v);
      }
    }
  }
  return px;
}

// ---------------------------------------------------------------------
//  Escribir el PNG
// ---------------------------------------------------------------------
// Un PNG es la firma, tres bloques y el CRC de cada uno. Se escribe en
// color 2 (RGB, sin transparencia) porque el icono es opaco: ahorra un
// cuarto del tamaño, y además iOS descarta el canal alfa de todas formas.
const TABLA = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = TABLA[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function bloque(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const suma = Buffer.alloc(4);
  suma.writeUInt32BE(crc(cuerpo));
  return Buffer.concat([largo, cuerpo, suma]);
}

function png(px, S) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0);
  ihdr.writeUInt32BE(S, 4);
  ihdr[8] = 8;    // 8 bits por canal
  ihdr[9] = 2;    // RGB
  // Cada línea va precedida de su byte de filtro. 0 = sin filtrar: con
  // degradados suaves y zonas planas comprime de sobra y no complica esto.
  const ancho = S * 3 + 1;
  const crudo = Buffer.alloc(S * ancho);
  for (let y = 0; y < S; y++) {
    crudo[y * ancho] = 0;
    px.copy(crudo, y * ancho + 1, y * S * 3, (y + 1) * S * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloque('IHDR', ihdr),
    bloque('IDAT', deflateSync(crudo, { level: 9 })),
    bloque('IEND', Buffer.alloc(0))
  ]);
}

// ---------------------------------------------------------------------
//  El mismo dibujo, en SVG
// ---------------------------------------------------------------------
// Para el favicon del navegador: así se ve nítido a cualquier tamaño y pesa
// unos cientos de bytes. Sale de GEOM igual que el PNG.
//
// `pathLength="100"` es el mismo truco que usa el anillo del Diario: el
// trazo se mide en porcentaje y no hay que calcular 2πr, que es donde se
// cuela el error al cambiar el radio.
const hex = (v) => '#' + v.map((n) => Math.round(n).toString(16).padStart(2, '0')).join('');

function svg() {
  const S = 512, c = S / 2;
  const R = GEOM.radio * S, W = GEOM.grosor * S;
  const gira = (GEOM.inicio * 180) / Math.PI;   // -90: arranca arriba
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + S + ' ' + S + '" width="' + S + '" height="' + S + '">',
    '  <defs>',
    '    <linearGradient id="fondo" x1="0" y1="0" x2="0" y2="1">',
    '      <stop offset="0" stop-color="' + hex(COLOR.fondoArriba) + '"/>',
    '      <stop offset="1" stop-color="' + hex(COLOR.fondoAbajo) + '"/>',
    '    </linearGradient>',
    '    <linearGradient id="arco" x1="0" y1="0" x2="0" y2="1">',
    '      <stop offset="0" stop-color="' + hex(COLOR.arcoArriba) + '"/>',
    '      <stop offset="1" stop-color="' + hex(COLOR.arcoAbajo) + '"/>',
    '    </linearGradient>',
    '  </defs>',
    '  <rect width="' + S + '" height="' + S + '" fill="url(#fondo)"/>',
    '  <g transform="rotate(' + gira + ' ' + c + ' ' + c + ')">',
    '    <circle cx="' + c + '" cy="' + c + '" r="' + R + '" fill="none" stroke="' + hex(COLOR.pista) + '" stroke-width="' + W + '"/>',
    '    <circle cx="' + c + '" cy="' + c + '" r="' + R + '" fill="none" stroke="url(#arco)" stroke-width="' + W + '"',
    '      stroke-linecap="round" pathLength="100"',
    '      stroke-dasharray="' + (GEOM.vuelta * 100).toFixed(2) + ' 100"/>',
    '  </g>',
    '</svg>',
    ''
  ].join('\n');
}

// ---------------------------------------------------------------------
//  Y a escribir
// ---------------------------------------------------------------------
// Cada tamaño está por un motivo, no por cubrirse las espaldas:
//   180  apple-touch-icon. Es lo que pide iOS para la pantalla de inicio.
//   192  el mínimo que Chrome exige en el manifest para ofrecer instalar.
//   512  el que usa Android para la pantalla de arranque y para la maskable.
//    32  favicon de respaldo para navegadores que no aceptan el SVG.
const TAMANOS = [180, 192, 512, 32];

mkdirSync(DIR, { recursive: true });
for (const S of TAMANOS) {
  const datos = png(pintar(S), S);
  writeFileSync(join(DIR, 'icono-' + S + '.png'), datos);
  console.log('icono-' + S + '.png' + ' '.repeat(6 - String(S).length) + String(datos.length).padStart(7) + ' bytes');
}
const marca = svg();
writeFileSync(join(DIR, 'icono.svg'), marca);
console.log('icono.svg     ' + String(Buffer.byteLength(marca)).padStart(7) + ' bytes');
