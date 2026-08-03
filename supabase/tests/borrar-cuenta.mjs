// Borrar una cuenta de verdad.
//
// Es la unica operacion de la app sin vuelta atras, asi que se prueban las
// dos mitades: que borre TODO lo que tiene que borrar -incluida la copia
// que la auditoria guarda del propio borrado, que es el rincon donde se
// queda el expediente entero sin que nadie mire- y que NO deje a nadie
// borrar lo que no es suyo.
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
  else { bad++; console.log(`  FALLA ${n}${extra ? ' — ' + extra : ''}`); }
};
const as = async (uid, sql) => {
  await db.exec(`select set_config('request.jwt.claim.sub','${uid}',false)`);
  await db.exec('set role authenticated');
  try { return await db.query(sql); } finally { await db.exec('reset role'); }
};
const falla = async (uid, sql) => {
  await db.exec(`select set_config('request.jwt.claim.sub','${uid}',false)`);
  await db.exec('set role authenticated');
  try { await db.query(sql); return null; }
  catch (e) { return e.message.split('\n')[0]; }
  finally { await db.exec('reset role'); }
};
const cuenta = async (sql) => (await db.query(sql)).rows[0].n;

const U = {
  admin: '11111111-1111-1111-1111-111111111111',
  otro:  '22222222-2222-2222-2222-222222222222',
  ana:   '33333333-3333-3333-3333-333333333333'
};
for (const [k, id] of Object.entries(U))
  await db.exec(`insert into auth.users(id,email) values ('${id}','${k}@x.com')`);
await db.exec(`select public.nombrar_super_admin('admin@x.com')`);
// Un segundo super admin, para que borrarse no choque con la regla del
// ultimo que queda.
await db.exec(`update public.profiles set role='super_admin' where id='${U.otro}'`);

// Ana deja rastro por todos lados, como una persona de verdad.
await db.exec(`update public.profiles set full_name='Ana', weight_kg=62 where id='${U.ana}'`);
await db.exec(`insert into public.weight_logs(user_id,log_date,weight_kg)
               values ('${U.ana}', current_date, 62)`);
await db.exec(`insert into public.diary_entries(user_id,entry_date,meal,food_name,unit,quantity,protein_g,carbs_g,fat_g)
               values ('${U.ana}', current_date, 'Desayuno', 'Huevo', 'Pieza', 2, 12, 1, 10)`);
// Un UPDATE para que la auditoria tenga algo suyo ANTES del borrado.
await db.exec(`update public.profiles set weight_kg=61 where id='${U.ana}'`);

console.log('— Antes de borrar, esta todo ahi —');
check('tiene perfil', await cuenta(`select count(*)::int n from public.profiles where id='${U.ana}'`) === 1);
check('tiene pesos',  await cuenta(`select count(*)::int n from public.weight_logs where user_id='${U.ana}'`) === 1);
check('tiene diario', await cuenta(`select count(*)::int n from public.diary_entries where user_id='${U.ana}'`) === 1);
check('y la auditoria guardo su UPDATE',
  await cuenta(`select count(*)::int n from public.auditoria where user_id='${U.ana}'`) >= 1);

console.log('\n— Nadie borra lo que no es suyo —');
check('otra persona no puede borrar la cuenta de Ana',
  (await falla(U.ana, `select public.admin_borrar_cuenta('${U.otro}')`)) !== null);
check('ni llamar a la purga por dentro',
  (await falla(U.ana, `select public.purgar_persona('${U.otro}')`)) !== null);
check('el super admin no se borra a si mismo desde el panel',
  (await falla(U.admin, `select public.admin_borrar_cuenta('${U.admin}')`)) !== null);
check('ni borra a alguien que no existe',
  (await falla(U.admin,
    `select public.admin_borrar_cuenta('99999999-9999-9999-9999-999999999999')`)) !== null);
check('y Ana sigue entera tras todos esos intentos',
  await cuenta(`select count(*)::int n from public.profiles where id='${U.ana}'`) === 1);

console.log('\n— Ana borra su cuenta —');
const err = await falla(U.ana, `select public.borrar_mi_cuenta()`);
check('la llamada sale bien', err === null, err || '');

check('el usuario ya no existe',
  await cuenta(`select count(*)::int n from auth.users where id='${U.ana}'`) === 0);
// Lo importante: que NO quede archivado. El archivado es lo que hacia la
// 0007 y es justo lo que aqui no vale.
check('el perfil se fue de verdad, no archivado',
  await cuenta(`select count(*)::int n from public.profiles where id='${U.ana}'`) === 0);
check('los pesos tambien',
  await cuenta(`select count(*)::int n from public.weight_logs where user_id='${U.ana}'`) === 0);
check('y el diario',
  await cuenta(`select count(*)::int n from public.diary_entries where user_id='${U.ana}'`) === 0);

// El rincon donde se quedaba todo: la auditoria guarda `datos_antes` con la
// fila completa. Si sobrevive, el borrado es de mentira.
check('la auditoria no conserva su expediente',
  await cuenta(`select count(*)::int n from public.auditoria
                 where user_id='${U.ana}' or actor_id='${U.ana}'`) === 0);
// Y por si el nombre viajo dentro del jsonb con otro user_id.
check('su nombre no aparece en ningun jsonb de auditoria',
  await cuenta(`select count(*)::int n from public.auditoria
                 where datos_antes::text ilike '%Ana%'
                    or datos_despues::text ilike '%Ana%'`) === 0);

console.log('\n— El archivado normal sigue funcionando —');
// El flag es local a la transaccion. Si se hubiera quedado pegado, el
// siguiente borrado normal borraria de verdad sin que nadie lo pidiera.
await db.exec(`insert into public.recipes(user_id,name) values ('${U.otro}','Pollo')
               on conflict do nothing`);
const hayReceta = await cuenta(
  `select count(*)::int n from public.recipes where user_id='${U.otro}'`);
if (hayReceta) {
  await as(U.otro, `delete from public.recipes where user_id='${U.otro}'`);
  check('borrar una receta sigue archivandola, no borrandola',
    await cuenta(`select count(*)::int n from public.recipes
                   where user_id='${U.otro}' and archivado_en is not null`) === 1);
} else {
  check('borrar una receta sigue archivandola, no borrandola', false,
    'no se pudo crear la receta de prueba');
}

console.log('\n— El ultimo super admin no puede irse —');
await db.exec(`update public.profiles set role='cliente' where id='${U.otro}'`);
check('se le impide dejar el panel sin nadie',
  (await falla(U.admin, `select public.borrar_mi_cuenta()`)) !== null);
check('y sigue ahi',
  await cuenta(`select count(*)::int n from public.profiles where id='${U.admin}'`) === 1);

console.log(`\n${ok} pasan · ${bad} fallan`);
await db.close();
process.exit(bad ? 1 : 0);
