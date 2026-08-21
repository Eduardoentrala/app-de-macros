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
//  QUÉ SE DIBUJA
//
//  El aro abierto del Diario —el mismo arranque arriba y la misma vuelta
//  del 72%— y dentro una mancuerna. Dice las dos mitades del producto a la
//  vez: el aro es el plato y el progreso, y lo que hay servido es el
//  entrenamiento. Las dos ideas conviven porque una RODEA a la otra; se
//  probaron cruzadas y superpuestas y en pequeño se emborronaban.
//
//  El color va a la manera de Apple, que es como se pidió: el fondo lleva
//  el degradado vertical de un color del sistema —aquí systemGreen, que es
//  el de Mensajes y Teléfono y el más cercano al --green de la app— y el
//  glifo va en BLANCO PURO y sin degradado. Eso último es lo que hace que
//  se lea como un icono de Apple: una marca degradada sobre un fondo
//  degradado se ve de otra tienda.
//
//  El dibujo ocupa unos dos tercios del lado y no tres cuartos. Los iconos
//  de Apple dejan bastante aire, y con el glifo pegado al borde se nota
//  enseguida que no es suyo.
//
//  POR QUÉ SE DIBUJA A MANO Y NO SE USA UNA LIBRERÍA
//
//  Rasterizar un SVG a PNG pide una librería (sharp, resvg, canvas), y este
//  proyecto no tiene dependencias a propósito. Pero PNG hace falta sí o sí:
//  iOS NO acepta SVG en apple-touch-icon, solo PNG.
//
//  La salida es lo bastante simple —un degradado, un arco y cinco barras—
//  para dibujarla con aritmética y comprimirla con `zlib`, que ya viene en
//  Node. Así el icono se regenera en cualquier máquina con `node` y nada
//  más, sin `npm install`.
//
//  UN SOLO SITIO CON LOS NÚMEROS
//
//  La geometría vive en ARO y PESA, y de ahí salen las DOS cosas: el
//  rasterizador la usa para pintar píxeles y el generador de SVG para
//  escribir los mismos trazos en texto. Cambiar el grosor aquí lo cambia en
//  los dos formatos, que es justo lo que se descuadra al mantenerlos aparte.
//
//  Se ejecuta:   node herramientas/iconos.mjs
//  Y `pruebas/iconos.mjs` comprueba que lo generado sigue estando y cuadra.
//
//  SOBRE LA CACHÉ: estos archivos NO llevan sello de versión en el nombre.
//  No hace falta, porque `docs/sw.js` los deja fuera de la caché a
//  propósito —está explicado allí—. Lo que sí es inevitable: iOS se queda
//  con el icono al INSTALAR la app, así que a quien ya la tenga en la
//  pantalla de inicio no le cambia hasta que la borre y la vuelva a añadir.
//  Eso no lo arregla ninguna cabecera.
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
const ARO = {
  radio:  0.302,          // del centro al eje del trazo
  grosor: 0.050,
  inicio: -Math.PI / 2,   // arranca arriba, como el anillo del Diario
  vuelta: 0.72            // y da la misma vuelta del 72%
};

const PESA = { cy: 0.5, semi: 0.178, barra: 0.052 };

// La mancuerna, como lista de barras con puntas redondas. Se declara una
// sola vez porque la usan los dos formatos: el rasterizador la convierte en
// distancias y el SVG en <line>.
function barrasDeLaPesa() {
  const { cy, semi, barra } = PESA;
  const d1 = semi * 0.62, d2 = semi * 0.92;   // discos interior y exterior
  return [
    { a: [0.5 - d1, cy], b: [0.5 + d1, cy], w: barra },                                  // la barra
    { a: [0.5 - d1, cy - semi * 0.49], b: [0.5 - d1, cy + semi * 0.49], w: barra * 1.48 },
    { a: [0.5 + d1, cy - semi * 0.49], b: [0.5 + d1, cy + semi * 0.49], w: barra * 1.48 },
    { a: [0.5 - d2, cy - semi * 0.29], b: [0.5 - d2, cy + semi * 0.29], w: barra * 1.18 },
    { a: [0.5 + d2, cy - semi * 0.29], b: [0.5 + d2, cy + semi * 0.29], w: barra * 1.18 }
  ];
}

// Lo que más lejos llega del centro, en diámetro. Android puede recortar un
// icono `maskable` hasta un círculo del 80% del lado, así que esto tiene
// que quedarse por debajo o le corta el aro. Con 65% entra de sobra y el
// MISMO archivo sirve de icono normal y de maskable.
const OCUPA = (ARO.radio + ARO.grosor / 2) * 2;

// systemGreen de Apple (#34C759), aclarado arriba y rebajado abajo, que es
// como llevan el degradado sus iconos.
const FONDO_A = [0x5a, 0xe2, 0x7e], FONDO_B = [0x1b, 0xa8, 0x47];
const TINTA = [0xff, 0xff, 0xff];

const mezcla = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hex = (v) => '#' + v.map((n) => Math.round(n).toString(16).padStart(2, '0')).join('');

// ---------------------------------------------------------------------
//  Rasterizar
// ---------------------------------------------------------------------
// Sin muestreo múltiple: se calcula la DISTANCIA de cada píxel al trazo y
// se usa para el borde suave. Un píxel a más de medio grosor está fuera, a
// menos está dentro, y la franja de 1 px de en medio se rellena a medias.
// Sale mejor que promediar dieciséis muestras y cuesta una fracción.
function distanciaASegmento(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay, wx = px - ax, wy = py - ay;
  const largo = vx * vx + vy * vy;
  let t = largo === 0 ? 0 : (wx * vx + wy * vy) / largo;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

function pintar(S) {
  const px = Buffer.alloc(S * S * 3);
  const c = S / 2;
  const R = ARO.radio * S, medio = (ARO.grosor * S) / 2;
  const barrido = ARO.vuelta * Math.PI * 2;
  const a0 = ARO.inicio, a1 = a0 + barrido;
  const DOS_PI = Math.PI * 2;
  // Los centros de las dos puntas redondas del aro. El anillo del Diario
  // lleva stroke-linecap="round"; sin esto acabaría en corte recto.
  const P0x = c + R * Math.cos(a0), P0y = c + R * Math.sin(a0);
  const P1x = c + R * Math.cos(a1), P1y = c + R * Math.sin(a1);
  // La pesa, ya en píxeles.
  const barras = barrasDeLaPesa().map(b => ({
    ax: b.a[0] * S, ay: b.a[1] * S, bx: b.b[0] * S, by: b.b[1] * S, medio: (b.w * S) / 2
  }));

  for (let y = 0; y < S; y++) {
    const py = y + 0.5;
    const tv = S === 1 ? 0 : y / (S - 1);          // 0 arriba, 1 abajo
    const fondo = mezcla(FONDO_A, FONDO_B, tv);

    for (let x = 0; x < S; x++) {
      const pxx = x + 0.5;
      const dx = pxx - c, dy = py - c;

      // --- el aro, solo el tramo, con las puntas redondas ---
      // El ángulo se mide desde el arranque y se normaliza a [0, 2π). Si
      // cae dentro del barrido, la distancia es la radial; si cae fuera, lo
      // único que puede tocarlo son las puntas.
      let t = (Math.atan2(dy, dx) - a0) % DOS_PI;
      if (t < 0) t += DOS_PI;
      let d = (t <= barrido
        ? Math.abs(Math.hypot(dx, dy) - R)
        : Math.min(Math.hypot(pxx - P0x, py - P0y), Math.hypot(pxx - P1x, py - P1y))) - medio;

      // --- la pesa ---
      // Se toma el MÍNIMO con lo anterior en vez de pintar cada barra
      // aparte: pintadas por separado, en los solapes se mezclaría el borde
      // suave dos veces y saldría una costura visible.
      for (const b of barras)
        d = Math.min(d, distanciaASegmento(pxx, py, b.ax, b.ay, b.bx, b.by) - b.medio);

      const cub = Math.min(Math.max(0.5 - d, 0), 1);
      const i = (y * S + x) * 3;
      for (let k = 0; k < 3; k++)
        px[i + k] = Math.round(fondo[k] + (TINTA[k] - fondo[k]) * cub);
    }
  }
  return px;
}

// ---------------------------------------------------------------------
//  Escribir el PNG
// ---------------------------------------------------------------------
// Un PNG es la firma, tres bloques y el CRC de cada uno. Se escribe en
// color 2 (RGB, sin transparencia) porque el icono es opaco: ahorra un
// cuarto del tamaño, y además iOS descarta el canal alfa de todas formas —
// un icono con fondo transparente le sale con un cuadro NEGRO detrás.
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
// unos cientos de bytes. Sale de ARO y PESA igual que el PNG.
//
// `pathLength="100"` es el mismo truco que usa el anillo del Diario: el
// trazo se mide en porcentaje y no hay que calcular 2πr, que es donde se
// cuela el error al cambiar el radio.
function svg() {
  const S = 512, c = S / 2;
  const R = ARO.radio * S, W = ARO.grosor * S;
  const gira = (ARO.inicio * 180) / Math.PI;   // -90: arranca arriba
  const n = (v) => Number(v.toFixed(2));
  const lineas = barrasDeLaPesa().map(b =>
    '    <line x1="' + n(b.a[0] * S) + '" y1="' + n(b.a[1] * S) +
    '" x2="' + n(b.b[0] * S) + '" y2="' + n(b.b[1] * S) +
    '" stroke-width="' + n(b.w * S) + '"/>');

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + S + ' ' + S + '" width="' + S + '" height="' + S + '">',
    '  <defs>',
    '    <linearGradient id="fondo" x1="0" y1="0" x2="0" y2="1">',
    '      <stop offset="0" stop-color="' + hex(FONDO_A) + '"/>',
    '      <stop offset="1" stop-color="' + hex(FONDO_B) + '"/>',
    '    </linearGradient>',
    '  </defs>',
    '  <rect width="' + S + '" height="' + S + '" fill="url(#fondo)"/>',
    // El glifo entero en un grupo: un solo color plano, sin degradado, que
    // es lo que lo hace parecer de Apple.
    '  <g fill="none" stroke="' + hex(TINTA) + '" stroke-linecap="round">',
    '    <circle cx="' + c + '" cy="' + c + '" r="' + n(R) + '" stroke-width="' + n(W) + '"',
    '      pathLength="100" stroke-dasharray="' + n(ARO.vuelta * 100) + ' 100"',
    '      transform="rotate(' + gira + ' ' + c + ' ' + c + ')"/>',
    ...lineas,
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
console.log('el dibujo ocupa el ' + (OCUPA * 100).toFixed(1) + '% del lado (el tope maskable es 80%)');
