// La 0056: la nota del cierre y los pesajes de cada semana.
//
// Dos columnas pequeñas de las que depende que la app vaya conociendo a
// alguien en vez de empezar de cero cada lunes:
//
//   · `profiles.aprendido_cierre` — lo que el cierre entiende de esa
//     persona y quiere seguir sabiendo. Va SEPARADA de `memoria_ia`
//     porque las dos se reescriben enteras y con dos escritores se pisan.
//   · `chequeos_semanales.dias_con_peso` — la otra mitad de si una semana
//     sirve para medir el gasto. Con menos de dos pesajes, el «peso medio»
//     es un peso suelto con otro nombre.
//
// Se ejecuta contra Postgres de verdad (PGlite), con las migraciones tal y
// como se van a aplicar.

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const MIG = join(AQUI, '..', 'migrations');

const db = await PGlite.create();
await db.exec(readFileSync(join(AQUI, 'bootstrap.sql'), 'utf8'));
for (const f of readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort())
  await db.exec(readFileSync(join(MIG, f), 'utf8'));

let ok = 0, bad = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log('  PASA  ' + n); }
  else { bad++; console.log('  FALLA ' + n + (extra ? '\n        ' + extra : '')); }
};

const ANA = '11111111-1111-1111-1111-111111111111';
await db.exec(`
  insert into auth.users (id, email) values ('${ANA}', 'ana@ejemplo.com')
  on conflict do nothing;
`);

const falla = async (sql) => {
  try { await db.exec(sql); return false; } catch { return true; }
};

console.log('\n— La nota del cierre —');
{
  await db.exec(`update public.profiles set aprendido_cierre =
    'En septiembre de 2026 bajamos a 2.100 y se quedó sin energía.'
    where id = '${ANA}'`);
  const r = (await db.query(
    `select aprendido_cierre a, memoria_ia m from public.profiles where id = '${ANA}'`)).rows[0];
  check('se guarda', /sin energía/.test(r.a || ''));
  check('y no toca la memoria del chat', r.m == null,
    'son dos notas distintas con dos dueños distintos; si una escribiera en ' +
    'la otra, el texto que se reescribe entero se machacaría');

  check('no acepta más de 800 caracteres',
    await falla(`update public.profiles set aprendido_cierre = repeat('x', 801)
                 where id = '${ANA}'`),
    'el prompt pide 800 y la app recorta a 800: si la columna aceptara más, ' +
    'el tope viviría en dos sitios');
  check('y 800 justos sí',
    !(await falla(`update public.profiles set aprendido_cierre = repeat('x', 800)
                   where id = '${ANA}'`)));
}

console.log('\n— Los pesajes de cada semana —');
{
  await db.exec(`insert into public.chequeos_semanales (user_id, semana, dias_con_peso)
                 values ('${ANA}', current_date, 3)`);
  const n = (await db.query(
    `select dias_con_peso d from public.chequeos_semanales where user_id = '${ANA}'`)).rows[0].d;
  check('se guardan', n === 3);

  check('no caben ocho en una semana',
    await falla(`update public.chequeos_semanales set dias_con_peso = 8
                 where user_id = '${ANA}'`));
  check('ni un número negativo',
    await falla(`update public.chequeos_semanales set dias_con_peso = -1
                 where user_id = '${ANA}'`));
  check('y las filas viejas pueden no tenerlos',
    !(await falla(`update public.chequeos_semanales set dias_con_peso = null
                   where user_id = '${ANA}'`)),
    'las anteriores a la 0056 no lo saben, y exigirlo las dejaría fuera de ' +
    'la medición para siempre');
}

console.log(`\n${ok} pasan · ${bad} fallan`);
process.exit(bad ? 1 : 0);
