// La felicitación de cumpleaños: una por persona y año, y de nadie más.
//
// El mensaje lo escribe el modelo, así que abrir la app cuatro veces el día
// de tu cumpleaños no puede costar cuatro felicitaciones distintas —ni
// cuatro llamadas—. El freno es un `unique (user_id, anio)` en la base y no
// una marca en el navegador: el navegador se vacía, y además son dos
// teléfonos.
//
// Y se guardan los años anteriores a propósito: al escribir la del año que
// viene se le pasan con el encargo de no parecerse. Sin eso, la sorpresa
// dura un año.

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const MIG = join(AQUI, '..', 'migrations');

const db = await PGlite.create();
await db.exec(readFileSync(join(AQUI, 'bootstrap.sql'), 'utf8'));
for (const f of readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort()) {
  await db.exec(readFileSync(join(MIG, f), 'utf8'));
}

let ok = 0, bad = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { bad++; console.log(`  FALLA ${n}${extra ? '\n        ' + extra : ''}`); }
};
const as = async (uid, sql) => {
  await db.exec(`select set_config('request.jwt.claim.sub','${uid}',false)`);
  await db.exec('set role authenticated');
  try { return await db.query(sql); } finally { await db.exec('reset role'); }
};

const YO   = '11111111-1111-1111-1111-111111111111';
const OTRO = '22222222-2222-2222-2222-222222222222';
await db.exec(`insert into auth.users(id,email) values
  ('${YO}','yo@x.com'),('${OTRO}','otro@x.com')`);

// ------------------------------------------------------------------
console.log('— La fecha se guarda, y es opcional —');
{
  await as(YO, `update public.profiles set nacimiento = date '1990-11-05' where id='${YO}'`);
  // El driver devuelve un `Date`, así que se compara por sus partes UTC y
  // no por `String(...)`, que daría «Mon Nov 05 1990 ...» en el idioma y la
  // zona de quien corra esto.
  const f = (await as(YO, `select nacimiento from public.profiles where id='${YO}'`)).rows[0];
  const d = new Date(f.nacimiento);
  check('se guarda la fecha',
    d.getUTCFullYear() === 1990 && d.getUTCMonth() === 10 && d.getUTCDate() === 5,
    JSON.stringify(f));

  const sinPoner = (await db.query(
    `select nacimiento from public.profiles where id='${OTRO}'`)).rows[0];
  check('y quien no la pone la tiene en nulo', sinPoner.nacimiento === null,
    'es opcional de verdad: un dato que solo sirve para algo bonito no se ' +
    'cobra a la fuerza');

  let absurda = false;
  try {
    await as(YO, `update public.profiles set nacimiento = date '1799-01-01' where id='${YO}'`);
  } catch { absurda = true; }
  check('una fecha imposible no entra', absurda);
}

// ------------------------------------------------------------------
console.log('\n— Una por año, y lo decide la base —');
{
  await db.exec(`insert into public.felicitaciones(user_id, anio, mensaje)
                 values ('${YO}', 2026, 'Felicidades, Eduardo.')`);

  let repetida = false;
  try {
    await db.exec(`insert into public.felicitaciones(user_id, anio, mensaje)
                   values ('${YO}', 2026, 'Otra distinta.')`);
  } catch { repetida = true; }
  check('no caben dos del mismo año', repetida,
    'abrir la app cuatro veces ese día costaría cuatro llamadas al modelo');

  await db.exec(`insert into public.felicitaciones(user_id, anio, mensaje)
                 values ('${YO}', 2027, 'La del año que viene.')`);
  const mías = (await as(YO,
    `select anio from public.felicitaciones order by anio`)).rows;
  check('pero sí una por año', mías.length === 2, JSON.stringify(mías));
  check('y se guardan las de antes', mías[0]?.anio === 2026,
    'son lo que se le pasa al modelo para que la siguiente no se parezca — ' +
    'y de paso un recuerdo');
}

// ------------------------------------------------------------------
console.log('\n— Y son de quien son —');
{
  const ajenas = await as(OTRO, `select count(*)::int as n from public.felicitaciones`);
  check('nadie ve las de otro', ajenas.rows[0].n === 0, 've ' + ajenas.rows[0].n);

  let colada = false;
  try {
    await as(YO, `insert into public.felicitaciones(user_id, anio, mensaje)
                  values ('${YO}', 2028, 'me la escribo yo')`);
  } catch { colada = true; }
  const cuántas = (await db.query(
    `select count(*)::int as n from public.felicitaciones where anio=2028`)).rows[0].n;
  check('y nadie se escribe la suya desde el navegador', colada || cuántas === 0,
    'las escribe la función del asistente con su clave; si el navegador ' +
    'pudiera, el `unique` de arriba no serviría de nada');
}

console.log(`\n${ok} pasan · ${bad} fallan`);
process.exit(bad ? 1 : 0);
