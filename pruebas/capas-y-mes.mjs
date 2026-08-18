// El orden de las capas, y el mes del análisis de fotos.
//
//  1. EL AVISO TIENE QUE SER LA CAPA MÁS ALTA
//
//     Estuvo en z-index 50 mientras las hojas iban en 60. Resultado: todo
//     aviso que saliera con una hoja abierta se pintaba por debajo. Se
//     mostraba, se desvanecía a los segundos, y no lo veía nadie. Meses
//     así, y se descubrió por casualidad.
//
//     Un mensaje no estorba estando encima —lleva pointer-events:none— y
//     estando debajo no sirve para nada. Así que va arriba del todo, por
//     encima incluso del visor de fotos a pantalla completa.
//
//  2. EL MES, EN LA ZONA DE LA APP
//
//     `new Date().toISOString().slice(0,7)` da el mes en UTC. El último
//     día de cada mes, a partir de las 18:00 de México, eso devuelve el
//     mes SIGUIENTE: la comparación se guardaba con el mes que viene, y al
//     mes siguiente salía "ya está hecho" y esa persona se quedaba sin la
//     suya. En Nochevieja se iba un año entero.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(RAIZ, 'docs', 'estilos');
const CSS = readdirSync(DIR).filter((f) => f.endsWith('.css'))
  .map((f) => readFileSync(join(DIR, f), 'utf8')).join('\n');
const FN = readFileSync(join(RAIZ, 'supabase', 'functions', 'asistente', 'index.ts'), 'utf8');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');

let ok = 0, mal = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { mal++; console.log(`  FALLA ${n}${extra ? '\n        ' + extra : ''}`); }
};

// Sin comentarios: ahí dentro se HABLA de z-index y se cuentan los números
// viejos, y buscarlos a secas daría falsos positivos.
const cssLimpio = CSS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s*\n\s*/g, '');
const z = (sel) => {
  const m = new RegExp(sel.replace('.', '\\.') + '\\{[^}]*z-index:(\\d+)').exec(cssLimpio);
  return m ? Number(m[1]) : null;
};

console.log('\n— El aviso, por encima de todo —');
{
  const aviso = z('.toast');
  const hoja  = z('.sheet-backdrop');
  const visor = z('.visor');

  check('el aviso tiene capa', aviso !== null);
  check('la hoja también', hoja !== null);
  check('el visor también', visor !== null);

  check('el aviso va por encima de las hojas', aviso > hoja,
    `aviso ${aviso} contra hoja ${hoja}: por debajo, el mensaje existe pero no lo ve nadie`);
  // Hoy el visor no saca ningún aviso, pero el día que se le añada un
  // "borrar esta foto", el error volveria a ser invisible.
  check('y también del visor a pantalla completa', aviso > visor,
    `aviso ${aviso} contra visor ${visor}`);

  // Que sea el techo, no solo que gane a esos dos: cualquier capa nueva
  // que se ponga por encima repite el fallo.
  const todas = [...cssLimpio.matchAll(/z-index:(\d+)/g)].map((m) => Number(m[1]));
  check('es la capa más alta de la app', aviso === Math.max(...todas),
    `hay una capa en ${Math.max(...todas)} y el aviso está en ${aviso}`);

  // Y que no estorbe estando arriba.
  check('no roba toques estando encima', /\.toast\{[^}]*pointer-events:none/.test(cssLimpio),
    'sin esto, un aviso invisible se comeria los toques de lo que tape');
}

console.log('\n— El mes del análisis, en la zona de la app —');
{
  const i = FN.indexOf('const mes = ');
  const trozo = FN.slice(i, i + 320);
  check('se calcula el mes', i > 0);
  check('no sale de toISOString', !/toISOString/.test(trozo),
    'toISOString va en UTC: el ultimo dia del mes, por la tarde, devuelve el mes siguiente');
  check('va en la zona de México', /timeZone: 'America\/Mexico_City'/.test(trozo));
  check('con el formato AAAA-MM', /'en-CA'/.test(trozo) && /year: 'numeric', month: '2-digit'/.test(trozo));

  // No se acepta del cliente, por lo mismo que el tope diario: quien
  // pudiera decir en que mes esta, pediria el analisis las veces que
  // quisiera, y son ocho imagenes cada vez.
  check('no se acepta del cliente', !/cuerpo\.mes/.test(FN),
    'con el mes de fuera, se fuerza un analisis nuevo cuando se quiera');
}

console.log('\n— Y la cuenta sale —');
{
  // Se corre de verdad, no se comprueba que el texto este escrito.
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit',
  });
  const casos = [
    ['2026-09-01T01:30:00Z', '2026-08', 'el 31 de agosto a las 19:30 de México'],
    ['2026-01-01T05:00:00Z', '2025-12', 'Nochevieja a las 23:00: UTC se iba un AÑO'],
    ['2026-08-14T01:39:00Z', '2026-08', 'una tarde cualquiera'],
  ];
  for (const [iso, esperado, cuando] of casos) {
    const d = new Date(iso);
    check(`${cuando} -> ${esperado}`, f.format(d) === esperado, `dio ${f.format(d)}`);
    if (esperado !== d.toISOString().slice(0, 7))
      check(`  ...y en UTC daba ${d.toISOString().slice(0, 7)}, que era el fallo`, true);
  }
}

console.log('\n— Ninguna fecha de calendario sale de toISOString —');
{
  // toISOString como marca de INSTANTE está bien (cancelado_en, visto_en).
  // Como FECHA de calendario, no: va en UTC.
  //
  // Se barre el CÓDIGO, no los comentarios. Un comentario que explica por
  // qué NO se usa `toISOString().slice(0,7)` contiene esas mismas letras, y
  // el barrido lo señalaba como si fuera el fallo. Se quitan solo las
  // líneas que son comentario enteras: así no se puede recortar código que
  // vaya detrás de un `//` a media línea y colarse un fallo de verdad.
  const soloCodigo = t => t.split(/\r?\n/).filter(l => !/^\s*\/\//.test(l)).join('\n');
  const sospechosas = [];
  for (const [n, txt] of [['app.js', soloCodigo(APP)], ['asistente', soloCodigo(FN)]]) {
    for (const m of txt.matchAll(/toISOString\(\)\s*\.\s*slice\(0,\s*(7|10)\)/g)) {
      sospechosas.push(n + ': ' + txt.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, ' '));
    }
  }
  check('ninguna', sospechosas.length === 0,
    sospechosas.join('\n        ') + '\n        una fecha de calendario en UTC se adelanta un dia por las tardes');
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);
