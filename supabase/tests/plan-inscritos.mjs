// Plan solo enseña a quien está inscrito.
//
// Todas las funciones se LLAMAN de verdad. Crear una funcion que revienta
// al ejecutarse pasa cualquier prueba que solo mire que la migracion
// aplique: `admin_buscar_usuarios` se creo asi, paso los tests y tumbo esta
// misma pantalla en produccion durante semanas.
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

const U = {
  admin: '11111111-1111-1111-1111-111111111111',
  coach: '22222222-2222-2222-2222-222222222222',
  suyo:  '33333333-3333-3333-3333-333333333333',   // cliente del coach
  ajeno: '44444444-4444-4444-4444-444444444444',   // cliente de nadie
  otro:  '55555555-5555-5555-5555-555555555555'
};
for (const [k, id] of Object.entries(U))
  await db.exec(`insert into auth.users(id,email) values ('${id}','${k}@x.com')`);
await db.exec(`select public.nombrar_super_admin('admin@x.com')`);
await db.exec(`update public.profiles set role='coach' where id='${U.coach}'`);
for (const [k, id] of Object.entries(U))
  await db.exec(`update public.profiles set full_name='${k}' where id='${id}'`);
await db.exec(`insert into public.coach_clientes(coach_id,cliente_id,activo)
               values ('${U.coach}','${U.suyo}',true)`);

const lista = async (uid) => (await as(uid, `select * from public.plan_lista()`)).rows;

console.log('— Al principio no hay nadie en Plan —');
// Este es el cambio entero: antes salian todos los registrados.
check('el super admin no ve a nadie', (await lista(U.admin)).length === 0);
check('el coach tampoco', (await lista(U.coach)).length === 0);

console.log('\n— Se inscribe por correo —');
const err = await falla(U.admin, `select public.plan_inscribir('otro@x.com')`);
check('el super admin inscribe', err === null, err || '');
const l1 = await lista(U.admin);
check('y ahora aparece uno solo', l1.length === 1, JSON.stringify(l1.map(r => r.nombre)));
check('con su nombre', l1[0]?.nombre === 'otro', JSON.stringify(l1[0]));
// El correo es lo que un coach nunca habia podido ver, y lo que reventaba
// por el varchar(255) de auth.users.
check('y con su correo', l1[0]?.correo === 'otro@x.com', JSON.stringify(l1[0]));
check('marcado como sin plan todavia', l1[0]?.tiene_plan === false);

console.log('\n— Un correo que no existe no inscribe a nadie —');
check('avisa en vez de callarse',
  (await falla(U.admin, `select public.plan_inscribir('nadie@x.com')`)) !== null);
check('y la lista no crece', (await lista(U.admin)).length === 1);

console.log('\n— Inscribir dos veces no duplica —');
await falla(U.admin, `select public.plan_inscribir('otro@x.com')`);
check('sigue habiendo uno', (await lista(U.admin)).length === 1);

console.log('\n— Cada quien ve lo suyo —');
await falla(U.admin, `select public.plan_inscribir('suyo@x.com')`);
await falla(U.admin, `select public.plan_inscribir('ajeno@x.com')`);
const delCoach = await lista(U.coach);
check('el coach ve solo a su cliente', delCoach.length === 1 && delCoach[0].nombre === 'suyo',
  JSON.stringify(delCoach.map(r => r.nombre)));
check('el super admin ve a los tres', (await lista(U.admin)).length === 3);
check('un cliente cualquiera no ve la lista', (await lista(U.suyo)).length === 0);

console.log('\n— Un coach no mete en su Plan a quien no es suyo —');
// Sin esto bastaria saberse un correo para meter a cualquiera.
check('se le impide',
  (await falla(U.coach, `select public.plan_inscribir('ajeno@x.com')`)) !== null);
check('un cliente no puede inscribir a nadie',
  (await falla(U.suyo, `select public.plan_inscribir('otro@x.com')`)) !== null);
check('ni escribir en la tabla directo',
  (await falla(U.suyo, `insert into public.plan_inscritos(cliente_id)
                        values ('${U.otro}')`)) !== null);

console.log('\n— Quien tiene plan sale marcado —');
await db.exec(`insert into public.planes(user_id,activo) values ('${U.suyo}',true)`);
const conPlan = (await lista(U.admin)).find(r => r.nombre === 'suyo');
check('tiene_plan se pone en true', conPlan?.tiene_plan === true, JSON.stringify(conPlan));

console.log('\n— Dar de baja —');
check('el coach da de baja a su cliente',
  (await falla(U.coach, `select public.plan_dar_baja('${U.suyo}')`)) === null);
check('desaparece de la lista',
  !(await lista(U.admin)).some(r => r.nombre === 'suyo'));
// Se da de baja, no se borra: si vuelve en marzo interesa saber que estuvo.
check('pero queda la historia',
  (await db.query(`select count(*)::int n from public.plan_inscritos
                    where cliente_id='${U.suyo}'`)).rows[0].n === 1);
check('y se le puede volver a inscribir',
  (await falla(U.admin, `select public.plan_inscribir('suyo@x.com')`)) === null);
check('sin duplicar la fila activa',
  (await db.query(`select count(*)::int n from public.plan_inscritos
                    where cliente_id='${U.suyo}' and baja_en is null`)).rows[0].n === 1);

console.log('\n— Nadie da de baja a quien no le toca —');
check('un cliente no da de baja a otro',
  (await falla(U.suyo, `select public.plan_dar_baja('${U.otro}')`)) !== null);
check('y ese sigue en la lista',
  (await lista(U.admin)).some(r => r.nombre === 'otro'));

console.log(`\n${ok} pasan · ${bad} fallan`);
await db.close();
process.exit(bad ? 1 : 0);
