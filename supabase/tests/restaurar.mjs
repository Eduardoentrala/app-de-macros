// `restaurar()` no miraba de quién era la fila.
//
// En esta base un DELETE no borra: un trigger archiva la fila para que haya
// una papelera. `restaurar(tabla, id)` es lo que la saca de ahí, y está
// concedida a `authenticated`, o sea a cualquiera con sesión.
//
// La inyección por el nombre de la tabla SÍ estaba tapada —lista blanca y
// `%I`—, y eso engaña: parece que la función está pensada. Lo que no había
// era comprobación de DUEÑO. Con el id de una fila ajena, cualquiera con
// sesión la devolvía a la vida.
//
// Y `profiles` está en la lista blanca. Archivar un perfil es como se da de
// baja una cuenta, así que restaurarlo es REACTIVAR UNA CUENTA DADA DE BAJA.
// Los ids de perfil no son secretos: son los de usuario, un entrenador ve
// los de su gente y `plan_buscar` los devuelve.
//
// Nadie la llama todavía desde la app. Da igual: está concedida, y una
// función concedida es alcanzable escriba lo que escriba la app.

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const MIG = join(AQUI, '..', 'migrations');

const db = await PGlite.create();
await db.exec(readFileSync(join(AQUI, 'bootstrap.sql'), 'utf8'));
for (const f of readdirSync(MIG).filter(f => f.endsWith('.sql')).sort())
  await db.exec(readFileSync(join(MIG, f), 'utf8'));

let ok = 0, bad = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { bad++; console.log(`  FALLA ${n}${extra ? '\n        ' + extra : ''}`); }
};

// Montar el escenario, SIN sesión de nadie.
//
// Hace falta borrar el "sub" antes: si se queda el de la última llamada, un
// `update profiles set role=...` de montaje choca con el guardia anti-escalada
// y la prueba revienta en su propio decorado. Pasó, y lo peor es que entonces
// TODAS las mutaciones parecían cazadas: la prueba fallaba siempre.
const sembrar = async (sql) => {
  await db.exec(`select set_config('request.jwt.claim.sub', NULL, false)`);
  return db.exec(sql);
};

// Como la app: con el "sub" del JWT puesto y el rol `authenticated`. Sin el
// `set role`, PGlite corre como superusuario y el RLS no se aplica.
const como = async (uid, sql) => {
  await db.exec(`select set_config('request.jwt.claim.sub','${uid}',false)`);
  await db.exec('set role authenticated');
  try { return { r: await db.query(sql), e: null }; }
  catch (e) { return { r: null, e: e.message.split('\n')[0] }; }
  finally { await db.exec('reset role'); }
};

const ANA  = '11111111-1111-1111-1111-111111111111';
const BETO = '22222222-2222-2222-2222-222222222222';
const JEFE = '33333333-3333-3333-3333-333333333333';

await sembrar(`
  insert into auth.users (id, email) values
    ('${ANA}','ana@x.com'), ('${BETO}','beto@x.com'), ('${JEFE}','jefe@x.com')
    on conflict do nothing;
  update public.profiles set full_name='Ana',  role='cliente'     where id='${ANA}';
  update public.profiles set full_name='Beto', role='cliente'     where id='${BETO}';
  update public.profiles set full_name='Jefe', role='super_admin' where id='${JEFE}';
`);

// Una receta de Ana, ya archivada (como si la hubiera borrado).
await sembrar(`
  insert into public.recipes (id, user_id, name)
    values ('aaaaaaaa-0000-0000-0000-000000000001','${ANA}','Pollo de Ana');
  update public.recipes set archivado_en = now()
    where id = 'aaaaaaaa-0000-0000-0000-000000000001';
`);

const archivada = async (tabla, id) => (await db.query(
  `select archivado_en from public.${tabla} where id = $1`, [id])).rows[0]?.archivado_en;

// ------------------------------------------------------------------
console.log('\n— Lo de otra persona no se toca —');
{
  const r = await como(BETO,
    `select public.restaurar('recipes','aaaaaaaa-0000-0000-0000-000000000001')`);
  check('Beto no puede restaurar la receta de Ana', r.e !== null,
    'la sacó de la papelera sin ser suya: la papelera es de su dueña');
  check('y la receta sigue archivada',
    (await archivada('recipes', 'aaaaaaaa-0000-0000-0000-000000000001')) !== null);
}

// ------------------------------------------------------------------
console.log('\n— Pero la dueña sí, que para eso es una papelera —');
{
  const r = await como(ANA,
    `select public.restaurar('recipes','aaaaaaaa-0000-0000-0000-000000000001')`);
  check('Ana restaura lo suyo', r.e === null, 'dio: ' + r.e);
  check('y vuelve a estar viva',
    (await archivada('recipes', 'aaaaaaaa-0000-0000-0000-000000000001')) === null);
}

// ------------------------------------------------------------------
console.log('\n— Y una cuenta dada de baja no la revive cualquiera —');
{
  // El super admin da de baja a Beto.
  await sembrar(`update public.profiles set archivado_en = now() where id = '${BETO}'`);

  const r = await como(ANA, `select public.restaurar('profiles','${BETO}')`);
  check('Ana no puede reactivar la cuenta de Beto', r.e !== null,
    'cualquiera con sesión deshacía una baja que decidió el super admin');
  check('y Beto sigue dado de baja',
    (await archivada('profiles', BETO)) !== null);

  // Ni siquiera el propio Beto: dar de baja es del super admin.
  const b = await como(BETO, `select public.restaurar('profiles','${BETO}')`);
  check('ni Beto se reactiva a sí mismo', b.e !== null,
    'si el interesado puede deshacerlo, la baja no es una baja');

  const j = await como(JEFE, `select public.restaurar('profiles','${BETO}')`);
  check('el super admin sí', j.e === null, 'dio: ' + j.e);
  check('y Beto vuelve', (await archivada('profiles', BETO)) === null);
}

// ------------------------------------------------------------------
console.log('\n— El entrenador, sobre lo que ya puede escribir —');
{
  await sembrar(`
    insert into public.coach_clientes (coach_id, cliente_id) values ('${JEFE}','${ANA}')
      on conflict do nothing;
    insert into public.routine_days (id, user_id, name, sort_order)
      values ('bbbbbbbb-0000-0000-0000-000000000001','${ANA}','Empuje',0);
    update public.routine_days set archivado_en = now()
      where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  `);
  // Un cliente cualquiera, no.
  const b = await como(BETO,
    `select public.restaurar('routine_days','bbbbbbbb-0000-0000-0000-000000000001')`);
  check('Beto no restaura el día de rutina de Ana', b.e !== null);

  // Pero su entrenador SÍ, porque ya puede escribir esa tabla: la regla de
  // restaurar es la misma que la de escribir, no una inventada aparte.
  //
  // Hace falta un coach que NO sea super admin, o este caso pasaría por el
  // camino del super admin y no probaría nada.
  const COACH = '44444444-4444-4444-4444-444444444444';
  await sembrar(`
    insert into auth.users (id, email) values ('${COACH}','coach@x.com')
      on conflict do nothing;
    update public.profiles set full_name='Coach', role='coach' where id='${COACH}';
    insert into public.coach_clientes (coach_id, cliente_id) values ('${COACH}','${ANA}')
      on conflict do nothing;
  `);
  const c = await como(COACH,
    `select public.restaurar('routine_days','bbbbbbbb-0000-0000-0000-000000000001')`);
  check('su entrenador sí', c.e === null, 'dio: ' + c.e);
  check('y el día vuelve',
    (await archivada('routine_days', 'bbbbbbbb-0000-0000-0000-000000000001')) === null);

  // Y NO sobre lo personal de esa misma persona: el coach ve su comida pero
  // no la escribe.
  await sembrar(`
    insert into public.recipes (id, user_id, name)
      values ('aaaaaaaa-0000-0000-0000-000000000002','${ANA}','Otra de Ana');
    update public.recipes set archivado_en = now()
      where id = 'aaaaaaaa-0000-0000-0000-000000000002';
  `);
  const p = await como(COACH,
    `select public.restaurar('recipes','aaaaaaaa-0000-0000-0000-000000000002')`);
  check('pero no una receta suya, que es personal', p.e !== null,
    'el coach ve la comida de su gente, no la escribe');
}

// ------------------------------------------------------------------
console.log('\n— Y lo que ya estaba bien sigue bien —');
{
  const r = await como(ANA, `select public.restaurar('auth.users','${ANA}')`);
  check('una tabla fuera de la lista blanca se rechaza', r.e !== null,
    'la lista blanca es lo que impide la inyección por el nombre de la tabla');
  check('y se dice cuál', /no restaurable/i.test(r.e || ''), 'dio: ' + r.e);

  const f = await como(ANA,
    `select public.restaurar('recipes','ffffffff-0000-0000-0000-000000000009')`);
  check('una fila que no existe también se rechaza', f.e !== null,
    'callar aquí deja creer que se restauró algo');
}

console.log(`\n${ok} pasan · ${bad} fallan`);
await db.close();
process.exit(bad ? 1 : 0);
