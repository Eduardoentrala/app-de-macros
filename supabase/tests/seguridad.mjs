// ¿Se COMPORTA como debe? Aplicar sin errores no prueba nada sobre la
// seguridad: hay que simular sesiones de cada rol y comprobar qué ve y
// qué puede escribir cada uno.
//
// Se simula la sesión igual que Supabase: poniendo el "sub" del JWT y
// cambiando al rol `authenticated`, que es el que usa la app. Sin ese
// `set role`, PGlite corre como superusuario y el RLS no se aplicaría,
// así que la prueba pasaría siempre y no valdría nada.
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
const check = (nombre, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${nombre}`); }
  else { bad++; console.log(`  FALLA ${nombre}${extra ? ' — ' + extra : ''}`); }
};
// Ejecuta algo esperando que reviente. Devuelve el mensaje, o null si NO falló.
const debeFallar = async (sql) => {
  try { await db.exec(sql); return null; } catch (e) { return e.message.split('\n')[0]; }
};
const as = async (uid, sql) => {
  await db.exec(`select set_config('request.jwt.claim.sub','${uid}',false)`);
  await db.exec('set role authenticated');
  try { return await db.query(sql); }
  finally { await db.exec('reset role'); }
};
const asFail = async (uid, sql) => {
  await db.exec(`select set_config('request.jwt.claim.sub','${uid}',false)`);
  await db.exec('set role authenticated');
  try { await db.query(sql); return null; }
  catch (e) { return e.message.split('\n')[0]; }
  finally { await db.exec('reset role'); }
};

const U = {
  admin: '11111111-1111-1111-1111-111111111111',
  coachA: '22222222-2222-2222-2222-222222222222',
  cliA1:  '33333333-3333-3333-3333-333333333333',
  cliA2:  '44444444-4444-4444-4444-444444444444',
  coachB: '55555555-5555-5555-5555-555555555555',
  cliB1:  '66666666-6666-6666-6666-666666666666',
};
for (const [k, id] of Object.entries(U))
  await db.exec(`insert into auth.users(id,email) values ('${id}','${k}@x.com')`);

console.log('\n— Arranque del primer super admin —');
const errBootstrap = await debeFallar(
  `select public.nombrar_super_admin('admin@x.com')`);
check('se puede crear el primer super admin desde el editor SQL',
      errBootstrap === null, errBootstrap ?? '');

if (errBootstrap) {   // plan B para poder seguir probando lo demás
  await db.exec('alter table public.profiles disable trigger trg_bloquear_escalada_de_rol');
  await db.exec(`update public.profiles set role='super_admin' where id='${U.admin}'`);
  await db.exec('alter table public.profiles enable trigger trg_bloquear_escalada_de_rol');
}
await db.exec(`update public.profiles set role='coach' where id in ('${U.coachA}','${U.coachB}')`);

// Segunda organización, para probar el aislamiento
await db.exec(`insert into public.organizations(nombre,slug) values ('Gimnasio B','gim-b')`);
await db.exec(`update public.profiles set org_id=(select id from public.organizations where slug='gim-b')
                where id in ('${U.coachB}','${U.cliB1}')`);
await db.exec(`insert into public.coach_clientes(coach_id,cliente_id) values ('${U.coachA}','${U.cliA1}')`);

for (const u of [U.cliA1, U.cliA2, U.cliB1])
  await db.exec(`insert into public.diary_entries(user_id,meal,food_name,protein_g)
                 values ('${u}','Desayuno','Avena',10)`);

console.log('\n— Aislamiento entre usuarios —');
check('un cliente solo ve su propio diario',
  (await as(U.cliA1, 'select count(*)::int n from public.diary_entries')).rows[0].n === 1);
check('un coach ve el diario de su cliente asignado',
  (await as(U.coachA, 'select count(*)::int n from public.diary_entries')).rows[0].n === 1);
check('un coach NO ve al cliente que no le asignaron',
  (await as(U.coachA, `select count(*)::int n from public.profiles where id='${U.cliA2}'`)).rows[0].n === 0);
check('el super admin lo ve todo',
  (await as(U.admin, 'select count(*)::int n from public.diary_entries')).rows[0].n === 3);

console.log('\n— Aislamiento entre organizaciones —');
check('un coach no ve nada de otra organización',
  (await as(U.coachA, `select count(*)::int n from public.profiles where id='${U.cliB1}'`)).rows[0].n === 0);
check('no se puede asignar un cliente de otra organización',
  (await debeFallar(`insert into public.coach_clientes(coach_id,cliente_id)
                     values ('${U.coachA}','${U.cliB1}')`)) !== null);

console.log('\n— Escritura —');
check('un coach NO puede inventarle comidas a su cliente',
  (await asFail(U.coachA, `insert into public.diary_entries(user_id,meal,food_name)
                           values ('${U.cliA1}','Cena','Pizza')`)) !== null);
check('un coach SÍ puede armarle la rutina a su cliente',
  (await asFail(U.coachA, `insert into public.routine_days(user_id,name)
                           values ('${U.cliA1}','Pecho')`)) === null);
check('nadie se asciende a sí mismo',
  (await asFail(U.cliA1, `update public.profiles set role='super_admin' where id='${U.cliA1}'`)) !== null);

console.log('\n— Archivado (0007) —');
await db.exec(`insert into public.saved_foods(user_id,name) values ('${U.cliA1}','Avena')`);
await as(U.cliA1, `delete from public.saved_foods where name='Avena'`);
check('borrar no borra: la fila sigue existiendo archivada',
  (await db.query(`select count(*)::int n from public.saved_foods where archivado_en is not null`)).rows[0].n === 1);
check('lo archivado deja de verse desde la app',
  (await as(U.cliA1, 'select count(*)::int n from public.saved_foods')).rows[0].n === 0);
check('se puede volver a crear un alimento con el mismo nombre',
  (await asFail(U.cliA1, `insert into public.saved_foods(user_id,name) values ('${U.cliA1}','Avena')`)) === null);

console.log('\n— Auditoría y versionado (0008) —');
await as(U.cliA1, `update public.profiles set goal_protein_g=200 where id='${U.cliA1}'`);
const aud = await db.query(`select datos_antes->>'goal_protein_g' antes, datos_despues->>'goal_protein_g' despues
                            from public.auditoria where tabla='profiles' order by creado_en desc limit 1`);
check('el cambio de macros queda auditado con valor anterior y nuevo',
  aud.rows[0]?.antes === '170' && aud.rows[0]?.despues === '200',
  JSON.stringify(aud.rows[0] ?? null));
check('se puede saber qué macros tenía en una fecha dada',
  (await as(U.cliA1, `select proteina_g from public.metas_en('${U.cliA1}', now())`)).rows[0]?.proteina_g === 200);
check('una sola versión vigente por usuario',
  (await db.query(`select count(*)::int n from public.metas_macros_versiones
                   where user_id='${U.cliA1}' and hasta is null`)).rows[0].n === 1);
check('el historial no se puede alterar desde la API',
  (await asFail(U.cliA1, `delete from public.auditoria`)) !== null ||
  (await db.query('select count(*)::int n from public.auditoria')).rows[0].n > 0);

console.log('\n— Cuenta desactivada (0006) —');
await db.exec(`update public.profiles set estado='suspendido' where id='${U.cliA2}'`);
check('suspender apaga el acceso',
  (await db.query(`select activo from public.profiles where id='${U.cliA2}'`)).rows[0].activo === false);
check('un suspendido no ve sus datos',
  (await as(U.cliA2, 'select count(*)::int n from public.diary_entries')).rows[0].n === 0);
check('pero sí puede leer su propia ficha (para que la app le explique)',
  (await as(U.cliA2, `select count(*)::int n from public.profiles where id='${U.cliA2}'`)).rows[0].n === 1);

console.log('\n— Cupos (0006) —');
await db.exec(`update public.organizations set max_clientes=1 where slug='gim-b'`);
await db.exec(`insert into auth.users(id,email) values ('77777777-7777-7777-7777-777777777777','extra@x.com')`);
check('el cupo de la organización se aplica',
  (await debeFallar(`update public.profiles
                       set org_id=(select id from public.organizations where slug='gim-b')
                     where id='77777777-7777-7777-7777-777777777777'`)) !== null);

console.log(`\n${ok} pasan · ${bad} fallan`);
await db.close();
process.exit(bad ? 1 : 0);
