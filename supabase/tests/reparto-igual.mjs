// El mismo reparto de calorías, en dos idiomas: ¿dicen lo mismo?
//
// LA PANTALLA ENSEÑA EL RESULTADO ANTES DE GUARDAR. Para eso, `repartir()`
// en app.js hace la misma cuenta que `ajustar_calorias` en Postgres. Es una
// copia deliberada: la alternativa sería pedirle al servidor una simulación
// en cada toque del botón, y el número llegaría medio segundo tarde en un
// mando que se pulsa seguido.
//
// El precio de esa copia es que pueden separarse. Y si se separan, la
// pantalla PROMETE unos macros y el servidor guarda otros: alguien pulsa
// viendo «150 P» y acaba con 138. Por eso esta prueba no lee el código: lo
// EJECUTA, los dos, con las mismas cifras, y compara gramo a gramo.
//
// Los decimales no son iguales en los dos sitios —Postgres usa `numeric`,
// que es exacto, y JavaScript usa coma flotante binaria, donde 0.20 no
// existe— así que si algún caso se va por un gramo, es aquí donde sale.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const MIG = join(AQUI, '..', 'migrations');
// Los finales de línea se normalizan al leer. En Windows el fichero de
// trabajo tiene CRLF, y los recortes de aquí abajo buscan cosas como
// `'\n  }\n'`: con `\r\n  }\r\n` ese patrón no existe, `indexOf` devuelve -1
// y la prueba se declaraba rota —«no encuentro repartir()»— por el sistema
// operativo, no por el código. Se midió: con LF verde, con CRLF roja.
const APP = readFileSync(join(AQUI, '..', '..', 'docs', 'app.js'), 'utf8')
  .replace(/\r\n/g, '\n');

// ---- El `repartir` de verdad, sacado de app.js ----
const desde = APP.indexOf('  function repartir(base, cal){');
const hasta = APP.indexOf('\n  }\n', APP.indexOf('return { P:P, C:C, G:G', desde));
// Se compara `hasta <= desde` y no `hasta < 0`: si el marcador del return
// cambia, indexOf busca desde el principio del archivo y devuelve un numero
// positivo pero absurdo, y el recorte sale vacio sin avisar de nada.
if (desde < 0 || hasta <= desde) {
  console.log('  FALLA  no encuentro repartir() en app.js');
  process.exit(1);
}
const repartir = new Function(
  'return (' + APP.slice(desde + '  function '.length, hasta + 4)
    .replace(/^repartir/, 'function repartir') + ')')();

const db = await PGlite.create();
await db.exec(readFileSync(join(AQUI, 'bootstrap.sql'), 'utf8'));
for (const f of readdirSync(MIG).filter(f => f.endsWith('.sql')).sort())
  await db.exec(readFileSync(join(MIG, f), 'utf8'));

let ok = 0, bad = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { bad++; console.log(`  FALLA ${n}${extra ? ' — ' + extra : ''}`); }
};

const ADMIN = '11111111-1111-1111-1111-111111111111';
const QUIEN = '22222222-2222-2222-2222-222222222222';
for (const [n, id] of [['admin', ADMIN], ['quien', QUIEN]])
  await db.exec(`insert into auth.users (id, email) values ('${id}', '${n}@x.com')`);
await db.exec('alter table public.profiles disable trigger trg_bloquear_escalada_de_rol');
await db.exec(`update public.profiles set role='super_admin' where id='${ADMIN}'`);
await db.exec('alter table public.profiles enable trigger trg_bloquear_escalada_de_rol');
await db.exec(`select set_config('request.jwt.claim.sub','${ADMIN}',false)`);

// Bases distintas a propósito: una equilibrada, una muy grasa, una muy
// alta en carbos, una con muchísima proteína y una diminuta. El reparto
// arrastra la proporción de grasa que ya tenía la persona, así que la base
// cambia el resultado tanto como las calorías que se piden.
const BASES = [
  ['equilibrada',      150, 200,  67],
  ['muy grasa',        140,  80, 130],
  ['muy alta en carbos',130, 400,  40],
  ['mucha proteína',   220, 150,  60],
  ['pequeña',           90, 120,  40],
];
const METAS = [800, 900, 1000, 1234, 1500, 1800, 1801, 2000, 2345, 2500,
               3000, 3333, 4000, 5000, 5999, 6000];

console.log('\nLos dos repartos, con 80 combinaciones');
let iguales = 0, distintos = [];
for (const [nombre, P, C, G] of BASES) {
  for (const meta of METAS) {
    await db.exec(`update public.profiles
      set goal_protein_g=${P}, goal_carbs_g=${C}, goal_fat_g=${G} where id='${QUIEN}'`);
    const { rows } = await db.query(
      `select public.ajustar_calorias('${QUIEN}', ${meta}, null) as v`);
    const sql = rows[0].v;
    const js = repartir({ P, C, G }, meta);

    if (sql.p === js.P && sql.c === js.C && sql.g === js.G) iguales++;
    else distintos.push(`${nombre} → ${meta}: SQL ${sql.p}/${sql.c}/${sql.g} · ` +
                        `JS ${js.P}/${js.C}/${js.G}`);
  }
}
check(`las ${BASES.length * METAS.length} coinciden gramo a gramo`,
  distintos.length === 0,
  distintos.slice(0, 6).join('  |  '));
if (distintos.length) console.log('        ...y ' + distintos.length + ' en total');

// ------------------------------------------------------------------
console.log('\nY las reglas se cumplen en todas');
{
  let proteFija = 0, sueloGrasa = 0, carbosOk = 0, calOk = 0, n = 0;
  for (const [, P, C, G] of BASES) {
    for (const meta of METAS) {
      const r = repartir({ P, C, G }, meta);
      n++;
      if (r.P === P || r.P * 4 <= meta * 0.41) proteFija++;
      if (r.G * 9 >= r.cal * 0.195) sueloGrasa++;
      if (r.C >= 0) carbosOk++;
      if (Math.abs(r.cal - meta) <= 6) calOk++;
    }
  }
  check('la proteína no se mueve (salvo que no quepa)', proteFija === n, `${proteFija}/${n}`);
  check('la grasa nunca baja del 20%', sueloGrasa === n, `${sueloGrasa}/${n}`);
  check('los carbos nunca salen negativos', carbosOk === n, `${carbosOk}/${n}`);
  check('y las calorías caen donde se pidieron', calOk === n, `${calOk}/${n}`);
}

console.log(`\n${ok} pasan · ${bad} fallan`);
process.exit(bad ? 1 : 0);
