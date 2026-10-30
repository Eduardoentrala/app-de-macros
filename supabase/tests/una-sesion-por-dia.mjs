// Dos filas del mismo entrenamiento, y la pantalla igual de tranquila.
//
// `workout_sessions` era la única tabla de «una fila por día» sin nada que
// lo impidiera. Las hermanas lo tienen desde la 0001: los pesos por
// `(user_id, log_date)`, las fotos por `(user_id, week_key, pose)`, los
// chequeos por `(user_id, semana)`, el análisis por `(user_id, mes)`.
//
// Y la app guardaba con un buscar-y-si-no-insertar escrito en JavaScript,
// que es exactamente lo que una restricción hace bien y un cliente hace
// mal. La parte del cliente ya está arreglada; esto es la otra mitad, la
// que vale para los tres caminos a la vez —dos teléfonos, la cola de
// sin-señal, y un teléfono con la versión vieja—.
//
// LO QUE SE PRUEBA, CONTRA POSTGRES DE VERDAD:
//
//   · Que la migración limpia lo que YA estuviera duplicado, y que se
//     queda la fila más completa y no una al azar.
//   · Que NO se lleva por delante lo que sí puede repetirse: dos días de
//     rutina distintos en la misma fecha, o dos personas.
//   · Que el `routine_day_id` nulo cuenta. En SQL dos NULL no son iguales,
//     así que un índice único normal dejaría pasar justo las filas de
//     quien entrena sin rutina guardada.
//   · Y que después ya no entra un duplicado.
//
// LAS MIGRACIONES SE APLICAN EN DOS TANDAS a propósito: todas hasta la
// 0058, se siembran los duplicados, y entonces la 0059. Aplicándolas de
// corrido la tabla está vacía cuando corre el borrado y no se prueba nada.

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const MIG = join(AQUI, '..', 'migrations');
const ESTA = '0059_una_sesion_por_dia.sql';

const db = await PGlite.create();
await db.exec(readFileSync(join(AQUI, 'bootstrap.sql'), 'utf8'));
const todas = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort();
if (!todas.includes(ESTA)) throw new Error('no encuentro ' + ESTA);
for (const f of todas) {
  if (f === ESTA) continue;
  await db.exec(readFileSync(join(MIG, f), 'utf8'));
}

let ok = 0, bad = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { bad++; console.log(`  FALLA ${n}${extra ? '\n        ' + extra : ''}`); }
};

const YO = '77777777-7777-7777-7777-777777777777';
const OTRA = '88888888-8888-8888-8888-888888888888';
for (const [u, c] of [[YO, 'eva'], [OTRA, 'ana']])
  await db.exec(`insert into auth.users (id, email)
                 values ('${u}', '${c}@ejemplo.com') on conflict do nothing;`);

// Dos días de rutina de verdad, para la fila que sí puede repetirse.
const DIA_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const DIA_B = 'bbbbbbbb-0000-0000-0000-000000000002';
await db.exec(`insert into public.routine_days (id, user_id, name, sort_order)
               values ('${DIA_A}', '${YO}', 'Empuje', 1),
                      ('${DIA_B}', '${YO}', 'Tirón', 2);`);

// Con hora a mano: la limpieza se queda con la MÁS RECIENTE, así que sin
// controlar `created_at` no se prueba la regla, se prueba el azar.
let reloj = 0;
const meter = (u, fecha, dia, vol, nota) => db.query(
  `insert into public.workout_sessions (user_id, session_date, routine_day_id, total_volume, note, created_at)
   values ($1, $2, $3, $4, $5, now() + ($6 || ' seconds')::interval) returning id`,
  [u, fecha, dia, vol, nota, ++reloj]);

// ------------------------------------------------------------------
console.log('\n— Lo que había antes de la migración —');

// Tres filas del mismo día y el mismo día de rutina: el caso de la cola
// que sube lo suyo mientras el teléfono ya había guardado.
// Y el orden importa: la de MÁS volumen va en medio y la última es más
// pequeña, que es el caso de corregir un peso hacia abajo. Quedándose
// con la mayor se guardaría justo el error que fue a arreglar.
await meter(YO, '2026-10-05', DIA_A, 8000, 'primera, a medias');
await meter(YO, '2026-10-05', DIA_A, 21500, 'el peso equivocado');
await meter(YO, '2026-10-05', DIA_A, 12000, 'la corregida, y la última');
// Y dos sin día de rutina, que es quien entrena sin rutina guardada.
await meter(YO, '2026-10-06', null, 5000, 'suelta, primera');
await meter(YO, '2026-10-06', null, 9400, 'suelta, la última');
// Lo que SÍ puede repetirse y no se puede tocar:
await meter(YO, '2026-10-07', DIA_A, 10000, 'mañana');
await meter(YO, '2026-10-07', DIA_B, 11000, 'tarde');
await meter(OTRA, '2026-10-05', null, 7000, 'de otra persona');

const antes = await db.query('select count(*)::int as n from public.workout_sessions');
check('se siembran ocho filas', antes.rows[0].n === 8, 'hay ' + antes.rows[0].n);

// ------------------------------------------------------------------
console.log('\n— Y la migración limpia solo lo que sobra —');
await db.exec(readFileSync(join(MIG, ESTA), 'utf8'));

const quedan = await db.query(
  `select session_date::text as f, routine_day_id as d, total_volume::float as v, note as n, user_id as u
     from public.workout_sessions order by u, f, v`);
const r = quedan.rows;
check('quedan cinco filas', r.length === 5,
  'quedaron ' + r.length + ': ' + JSON.stringify(r.map((x) => x.n)));

const d5 = r.filter((x) => x.u === YO && x.f === '2026-10-05');
check('del día con tres, queda una', d5.length === 1, JSON.stringify(d5));
check('y es la ÚLTIMA, aunque no sea la más gorda', d5[0] && d5[0].v === 12000,
  'quedó «' + (d5[0] && d5[0].n) + '» con ' + (d5[0] && d5[0].v) +
  ': quedarse con la mayor es quedarse con el peso que la persona fue a ' +
  'corregir. El último guardado es lo que dijo al final, y es lo mismo ' +
  'que hace la app arreglada: el PATCH escribe lo que hay en pantalla');

const d6 = r.filter((x) => x.u === YO && x.f === '2026-10-06');
check('y con el día de rutina NULO también se limpia', d6.length === 1, JSON.stringify(d6));
check('y también la última', d6[0] && d6[0].v === 9400,
  'en SQL dos NULL no son iguales: sin tratarlo aparte, estas dos se ' +
  'escapaban y son justo las de quien entrena sin rutina guardada');

const d7 = r.filter((x) => x.u === YO && x.f === '2026-10-07');
check('dos días de RUTINA distintos el mismo día se quedan los dos', d7.length === 2,
  'quien parte el entreno en mañana y tarde tiene dos sesiones de verdad: ' +
  JSON.stringify(d7));

const otra = r.filter((x) => x.u === OTRA);
check('y la fila de otra persona ni se toca', otra.length === 1 && otra[0].v === 7000);

// ------------------------------------------------------------------
console.log('\n— Y ya no entra un duplicado —');
{
  let reventó = null;
  try { await meter(YO, '2026-10-05', DIA_A, 999, 'la de más'); }
  catch (e) { reventó = String(e.message || e); }
  check('otra del mismo día y día de rutina, rechazada', !!reventó,
    'entró sin rechistar: el índice no está haciendo nada');
  check('y lo rechaza el índice, no otra cosa',
    reventó && /uq_sesion_por_dia_de_rutina|duplicate key/i.test(reventó),
    'dijo: ' + reventó);
}
{
  let reventó = null;
  try { await meter(YO, '2026-10-06', null, 999, 'suelta de más'); }
  catch (e) { reventó = String(e.message || e); }
  check('y otra suelta del mismo día, también', !!reventó,
    'el caso del NULL es el que se escapa si se escribe un único índice de ' +
    'tres columnas en vez de dos parciales');
}

console.log('\n— Pero lo legítimo sigue entrando —');
{
  let bien = true, porque = '';
  try { await meter(YO, '2026-10-07', null, 4000, 'sin rutina, mismo día'); }
  catch (e) { bien = false; porque = String(e.message || e); }
  check('una suelta el día que ya tiene dos días de rutina', bien, porque);

  bien = true;
  try { await meter(OTRA, '2026-10-06', null, 3000, 'otra persona, misma fecha'); }
  catch (e) { bien = false; porque = String(e.message || e); }
  check('y la misma fecha para otra persona', bien, porque);

  bien = true;
  try { await meter(YO, '2026-10-08', DIA_A, 5000, 'otro día'); }
  catch (e) { bien = false; porque = String(e.message || e); }
  check('y el mismo día de rutina en otra fecha', bien, porque);
}

// ------------------------------------------------------------------
console.log('\n— Y los dos índices están donde se dice —');
{
  const idx = await db.query(
    `select indexname from pg_indexes
      where tablename = 'workout_sessions' and indexname like 'uq_sesion%'
      order by indexname`);
  const nombres = idx.rows.map((x) => x.indexname);
  check('los dos, parciales', nombres.length === 2, JSON.stringify(nombres));
}

console.log(`\n${ok} pasan · ${bad} fallan`);
process.exit(bad ? 1 : 0);
