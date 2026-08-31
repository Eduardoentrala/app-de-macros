// Cada columna que la app nombra tiene que existir en la base.
//
// Son otra vez dos mitades del mismo contrato en ficheros distintos: los
// nombres de columna viven en las migraciones y la app los escribe a mano
// en las URLs y en los cuerpos que manda. Con 54 migraciones —columnas
// añadidas, renombradas, quitadas— separarse es cuestión de tiempo.
//
// Y las dos mitades no fallan igual de fuerte:
//
//   · Un FILTRO mal escrito (`?columna_que_no_existe=eq.…`) falla siempre,
//     desde el primer intento, y se ve enseguida.
//   · Una CLAVE mal escrita en el cuerpo de una escritura falla solo
//     cuando esa rama corre. Y hay ramas que corren una vez al mes: cerrar
//     la semana, borrar la cuenta, el panel de admin. Ahí un nombre viejo
//     puede quedarse meses sin que nadie lo note, y el día que corre no
//     falla ese campo: Postgres rechaza la fila ENTERA.
//
// Esta prueba mira las dos.
//
// LOS NOMBRES SE LEEN DE LAS MIGRACIONES, siguiéndolas en orden: los
// `create table`, y luego cada `alter table` con sus `add`, `drop` y
// `rename`. Copiar aquí una lista de columnas sería una tercera copia que
// también se separa.

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const MIG = join(RAIZ, 'supabase', 'migrations');
const SQL = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => readFileSync(join(MIG, f), 'utf8')).join('\n');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

// ---------------------------------------------------------------- base
const TABLA = {};
for (const m of SQL.matchAll(/create table (?:if not exists )?(?:public\.)?(\w+)\s*\(/g)) {
  let n = 0, j = m.index + m[0].length - 1, fin = j;
  for (; j < SQL.length; j++) {
    if (SQL[j] === '(') n++;
    else if (SQL[j] === ')') { n--; if (!n) { fin = j; break; } }
  }
  const cols = new Set(TABLA[m[1]] || []);
  for (const l of SQL.slice(m.index + m[0].length, fin).split('\n')) {
    const t = l.trim();
    if (!t || t.startsWith('--')) continue;
    if (/^(primary|foreign|unique|check|constraint|exclude)\b/i.test(t)) continue;
    const c = t.match(/^"?(\w+)"?\s+\S/);
    if (c) cols.add(c[1]);
  }
  TABLA[m[1]] = cols;
}

// Un `alter table` lleva muchas cláusulas separadas por comas, y con
// comentarios en medio. Hay que leer la sentencia entera hasta el punto y
// coma: buscar «alter table X add column» pegados se salta todas menos la
// primera, y ni esa si lleva un comentario delante. (Esa fue justo la
// pega de la primera versión: daba por perdidas dos columnas que sí
// existían, y por buenas las que aún no había mirado.)
for (const m of SQL.matchAll(/alter table (?:if exists )?(?:public\.)?(\w+)/gi)) {
  const p = SQL.indexOf(';', m.index);
  const cuerpo = SQL.slice(m.index, p < 0 ? SQL.length : p)
    .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  const t = (TABLA[m[1]] = TABLA[m[1]] || new Set());
  for (const c of cuerpo.matchAll(/add column (?:if not exists )?"?(\w+)"?/gi)) t.add(c[1]);
  for (const c of cuerpo.matchAll(/drop column (?:if exists )?"?(\w+)"?/gi)) t.delete(c[1]);
  for (const c of cuerpo.matchAll(/rename column "?(\w+)"? to "?(\w+)"?/gi))
    { t.delete(c[1]); t.add(c[2]); }
}
for (const m of SQL.matchAll(/drop table (?:if exists )?(?:public\.)?(\w+)/gi)) delete TABLA[m[1]];

// Lo que devuelven las vistas y las funciones también son nombres que la
// app lee, y no salen de ningún `create table`.
const DERIVADAS = new Set();
for (const m of SQL.matchAll(/returns table\s*\(([^)]*)\)/gi))
  for (const p of m[1].split(',')) {
    const c = p.trim().match(/^(\w+)\s+\S/);
    if (c) DERIVADAS.add(c[1]);
  }
for (const m of SQL.matchAll(/\b(\w+)\s+as\s*$/gim)) DERIVADAS.add(m[1]);

const TODAS = new Set([...Object.values(TABLA).flatMap((s) => [...s]), ...DERIVADAS]);

console.log('\nSe lee el esquema de las migraciones');
{
  ok(Object.keys(TABLA).length >= 20,
     `se encontraron ${Object.keys(TABLA).length} tablas`,
     'si salen pocas, esto no compara con nada');
  ok(TODAS.size >= 100, `y ${TODAS.size} columnas distintas`);
  // Un par de columnas conocidas, para saber que la lectura no se quedó a
  // medias: `dias_apuntados` va en un `alter table` con comentarios entre
  // cláusulas, que es justo lo que la primera versión no sabía leer.
  for (const [t, c] of [['chequeos_semanales', 'dias_apuntados'],
                        ['chequeos_semanales', 'media_cal'],
                        ['saved_foods', 'protein_g'],
                        ['diary_entries', 'meal']])
    ok(TABLA[t] && TABLA[t].has(c), `y «${t}.${c}» está entre ellas`,
       'si no, la lectura del esquema se dejó columnas y el resto de esta ' +
       'prueba da por malas cosas que están bien');
}

// ----------------------------------------------------------------- app
// Los nombres sueltos, vengan de la cadena que vengan: las URLs se montan
// a trozos —'…' + id + '&user_id=eq.' + …— así que leer la URL entera de
// una sola cadena se salta la mayoría.
const linea = (i) => APP.slice(0, i).split('\n').length;
const usados = new Map();
const anota = (c, i) => {
  if (!usados.has(c)) usados.set(c, []);
  usados.get(c).push(linea(i));
};
for (const m of APP.matchAll(/[?&]([a-z_]\w*)=(?:eq|neq|gt|gte|lt|lte|in|is|like|ilike|not|cs|cd)\./g))
  anota(m[1], m.index);
for (const m of APP.matchAll(/[?&]order=([a-z_]\w*)/g)) anota(m[1], m.index);
for (const m of APP.matchAll(/[?&]on_conflict=([a-z_,\w]*)/g))
  for (const c of m[1].split(',')) if (c) anota(c, m.index);
for (const m of APP.matchAll(/[?&]select=([a-z_0-9,\s]*)/g))
  for (const c of m[1].split(',')) {
    const t = c.trim();
    if (t && t !== '*') anota(t, m.index);
  }

console.log('\nLos filtros y los «select» nombran columnas que existen');
{
  ok(usados.size >= 50, `la app nombra ${usados.size} columnas distintas`,
     'si salen pocas, la lectura se rompió y esto pasa sin mirar nada');
  const fuera = [...usados.entries()].filter(([c]) => !TODAS.has(c));
  ok(fuera.length === 0, 'y todas están en el esquema',
     fuera.map(([c, l]) => c + ' (línea ' + l[0] + ')').join(', ') +
     ': una columna que no existe hace que PostgREST rechace la petición ' +
     'entera, así que no se lee nada de esa pantalla');
}

// --------------------------------------------------- cuerpos que se mandan
function bloque(i) {
  let n = 0;
  for (let j = i; j < APP.length; j++) {
    if (APP[j] === '{') n++;
    else if (APP[j] === '}') { n--; if (!n) return APP.slice(i + 1, j); }
  }
  return '';
}
function clavesDelPrimerNivel(s) {
  const out = []; let n = 0;
  for (let j = 0; j < s.length; j++) {
    const c = s[j];
    if (c === '{' || c === '[' || c === '(') n++;
    else if (c === '}' || c === ']' || c === ')') n--;
    else if (n === 0) {
      const m = s.slice(j).match(/^([a-z_]\w*)\s*:/);
      if (m && (j === 0 || /[,\s]/.test(s[j - 1]))) { out.push(m[1]); j += m[0].length - 1; }
    }
  }
  return out;
}

console.log('\nY los cuerpos que se mandan, también');
{
  let mirados = 0;
  const malos = [];
  for (const m of APP.matchAll(/JSON\.stringify\(\{/g)) {
    // ¿A qué tabla va? La ruta más cercana hacia atrás. Se dejan fuera
    // Storage y las funciones: ahí las claves son de SU api —`prefixes`,
    // `expiresIn`, `usuario`— y no columnas de nada.
    const atras = APP.slice(Math.max(0, m.index - 700), m.index);
    const rutas = [...atras.matchAll(/\/(?:rest|auth|functions|storage)\/v1\/([\w\-\/]+)/g)];
    if (!rutas.length) continue;
    const ruta = rutas[rutas.length - 1][0];
    if (!/\/rest\/v1\//.test(ruta)) continue;
    const tabla = rutas[rutas.length - 1][1].split('/')[0];
    if (tabla === 'rpc' || !TABLA[tabla]) continue;
    mirados++;
    for (const k of clavesDelPrimerNivel(bloque(m.index + 'JSON.stringify('.length)))
      if (!TABLA[tabla].has(k)) malos.push(tabla + '.' + k + ' (línea ' + linea(m.index) + ')');
  }
  ok(mirados >= 8, `se miraron ${mirados} cuerpos contra su tabla`,
     'si salen pocos, esta comprobación no está mirando las escrituras');
  ok(malos.length === 0, 'y ninguno manda una clave que la tabla no tenga',
     malos.join(', ') + ': la fila entera se rechaza, y eso puede tardar ' +
     'semanas en salir si la rama corre poco');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
