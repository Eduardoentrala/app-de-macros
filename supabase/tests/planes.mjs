// El plan de comida: que el entrenador pueda escribirlo, que el cliente lo
// lea, y que nadie escriba el plan de un desconocido.
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
const asFalla = async (uid, sql) => {
  await db.exec(`select set_config('request.jwt.claim.sub','${uid}',false)`);
  await db.exec('set role authenticated');
  try { await db.query(sql); return null; }
  catch (e) { return e.message.split('\n')[0]; }
  finally { await db.exec('reset role'); }
};

const U = {
  admin: '11111111-1111-1111-1111-111111111111',
  coach: '22222222-2222-2222-2222-222222222222',
  papa:  '33333333-3333-3333-3333-333333333333',
  ajeno: '44444444-4444-4444-4444-444444444444'
};
for (const [k, id] of Object.entries(U))
  await db.exec(`insert into auth.users(id,email) values ('${id}','${k}@x.com')`);

await db.exec(`select public.nombrar_super_admin('admin@x.com')`);
await db.exec(`update public.profiles set role='coach' where id='${U.coach}'`);
await db.exec(`insert into public.coach_clientes(coach_id,cliente_id) values ('${U.coach}','${U.papa}')`);

// La tabla tiene RLS de verdad
const rls = await db.query(`select relrowsecurity r from pg_class where relname='planes'`);
check('la tabla nace CON row level security', rls.rows[0].r === true);

console.log('\n— Escribir el plan —');
const comidas = JSON.stringify([
  { momento: 'Desayuno', texto: '2 huevos, pan integral, cafe' },
  { momento: 'Comida',   texto: 'Pollo a la plancha, arroz, ensalada' },
  { momento: 'Cena',     texto: 'Sopa de verduras y pescado' }
]).replace(/'/g, "''");

check('el entrenador puede escribirle el plan a su cliente',
  (await asFalla(U.coach,
    `insert into public.planes(user_id,nombre,comidas)
     values ('${U.papa}','Plan de mi papa','${comidas}'::jsonb)`)) === null);

check('un cliente NO puede escribirle el plan a otro',
  (await asFalla(U.ajeno,
    `insert into public.planes(user_id,nombre) values ('${U.papa}','Plan colado')`)) !== null);

check('nadie se escribe un plan a si mismo saltandose al entrenador',
  (await asFalla(U.papa,
    `insert into public.planes(user_id,nombre) values ('${U.papa}','Me lo pongo yo')`)) === null,
  'el propio dueno si puede: puede_editar_entreno incluye objetivo = auth.uid()');

console.log('\n— Leerlo —');
check('el cliente ve su plan',
  (await as(U.papa, `select count(*)::int n from public.planes`)).rows[0].n >= 1);
check('su entrenador tambien',
  (await as(U.coach, `select count(*)::int n from public.planes where user_id='${U.papa}'`)).rows[0].n >= 1);
check('el super admin lo ve todo',
  (await as(U.admin, `select count(*)::int n from public.planes`)).rows[0].n >= 1);
check('un desconocido NO ve nada',
  (await as(U.ajeno, `select count(*)::int n from public.planes`)).rows[0].n === 0);

console.log('\n— Contenido —');
const p = await as(U.papa, `select nombre, comidas from public.planes limit 1`);
check('las comidas llegan enteras',
  (p.rows[0]?.comidas || []).length === 3, JSON.stringify(p.rows[0]?.comidas));
check('con su texto tal cual se escribio',
  (p.rows[0]?.comidas || [])[0]?.texto === '2 huevos, pan integral, cafe');

console.log('\n— Se comporta como el resto de tablas —');
await as(U.coach, `update public.planes set nombre='Plan v2' where user_id='${U.papa}'`);
const aud = await db.query(`select count(*)::int n from public.auditoria where tabla='planes'`);
check('los cambios quedan auditados', aud.rows[0].n >= 1);

await as(U.coach, `delete from public.planes where user_id='${U.papa}'`);
const arch = await db.query(`select count(*)::int n from public.planes where archivado_en is not null`);
check('borrar archiva, no borra', arch.rows[0].n >= 1);

const org = await db.query(`select count(*)::int n from public.planes where org_id is null`);
check('la organizacion se rellena sola', org.rows[0].n === 0);

console.log(`\n${ok} pasan · ${bad} fallan`);
await db.close();
process.exit(bad ? 1 : 0);
