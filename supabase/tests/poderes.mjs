// Los poderes del super admin sobre las cuentas: apagar la IA, suspender,
// e invitar por correo. Y sobre todo: que el interesado NO pueda
// deshacerlo por su cuenta, que es donde estaba el agujero.
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
  papa:  '33333333-3333-3333-3333-333333333333'
};
for (const [k, id] of Object.entries(U))
  await db.exec(`insert into auth.users(id,email) values ('${id}','${k}@x.com')`);
await db.exec(`select public.nombrar_super_admin('admin@x.com')`);
await db.exec(`update public.profiles set role='coach' where id='${U.coach}'`);

console.log('— El interruptor de la IA —');
check('nace encendida',
  (await db.query(`select ia_habilitada i from public.profiles where id='${U.papa}'`)).rows[0].i === true);

check('el super admin la puede apagar',
  (await falla(U.admin, `update public.profiles set ia_habilitada=false where id='${U.papa}'`)) === null);
check('y queda apagada',
  (await db.query(`select ia_habilitada i from public.profiles where id='${U.papa}'`)).rows[0].i === false);

check('el propio interesado NO se la puede reencender',
  (await falla(U.papa, `update public.profiles set ia_habilitada=true where id='${U.papa}'`)) !== null);
check('sigue apagada tras intentarlo',
  (await db.query(`select ia_habilitada i from public.profiles where id='${U.papa}'`)).rows[0].i === false);
// Ojo al comprobar esto: un UPDATE que no toca ninguna fila -porque RLS
// la escondio- NO da error, devuelve "0 filas afectadas". Comprobar por
// excepcion daria falsos verdes; hay que mirar el valor despues.
const iaDe = async (id) => (await db.query(
  `select ia_habilitada i from public.profiles where id='${id}'`)).rows[0].i;

await falla(U.coach, `update public.profiles set ia_habilitada=true where id='${U.papa}'`);
check('un coach tampoco consigue encenderla', (await iaDe(U.papa)) === false);

console.log('\n— Suspender la cuenta —');
check('el super admin suspende',
  (await falla(U.admin, `update public.profiles set estado='suspendido' where id='${U.papa}'`)) === null);
const sus = (await db.query(
  `select estado, activo from public.profiles where id='${U.papa}'`)).rows[0];
check('suspender apaga el acceso', sus.estado === 'suspendido' && sus.activo === false,
  JSON.stringify(sus));

// Igual que arriba: tras suspenderlo, cuenta_habilitada() lo deja fuera y
// sus UPDATE no alcanzan ninguna fila. Se comprueba el resultado.
const cuentaDe = async (id) => (await db.query(
  `select estado::text e, activo a from public.profiles where id='${id}'`)).rows[0];

await falla(U.papa, `update public.profiles set estado='activo' where id='${U.papa}'`);
await falla(U.papa, `update public.profiles set activo=true where id='${U.papa}'`);
const tras = await cuentaDe(U.papa);
check('el suspendido no consigue reactivarse solo',
  tras.e === 'suspendido' && tras.a === false, JSON.stringify(tras));

check('el super admin lo reactiva',
  (await falla(U.admin,
    `update public.profiles set estado='activo', activo=true where id='${U.papa}'`)) === null);
const react = (await db.query(
  `select estado, activo from public.profiles where id='${U.papa}'`)).rows[0];
check('y vuelve a tener acceso', react.estado === 'activo' && react.activo === true);

console.log('\n— Lo que un usuario SI puede seguir cambiando —');
check('su propio nombre, como siempre',
  (await falla(U.papa, `update public.profiles set full_name='Papa' where id='${U.papa}'`)) === null);

console.log('\n— Invitaciones —');
check('la tabla nace CON row level security',
  (await db.query(`select relrowsecurity r from pg_class where relname='invitaciones'`)).rows[0].r === true);

check('el super admin invita',
  (await falla(U.admin,
    `insert into public.invitaciones(correo, rol, coach_id)
     values ('  MAMA@X.COM ', 'cliente', '${U.coach}')`)) === null);
check('el correo se guarda normalizado',
  (await db.query(`select correo from public.invitaciones limit 1`)).rows[0].correo === 'mama@x.com');

check('un coach NO puede leer las invitaciones',
  (await as(U.coach, `select count(*)::int n from public.invitaciones`)).rows[0].n === 0);
check('ni crearlas',
  (await falla(U.coach, `insert into public.invitaciones(correo) values ('otro@x.com')`)) !== null);

console.log('\n— Al registrarse se aplica sola —');
const MAMA = '44444444-4444-4444-4444-444444444444';
await db.exec(`insert into auth.users(id,email) values ('${MAMA}','mama@x.com')`);
const p = (await db.query(`select role::text r from public.profiles where id='${MAMA}'`)).rows[0];
check('entra con el rol de la invitacion', p && p.r === 'cliente', JSON.stringify(p));
check('queda asignada a su entrenador',
  (await db.query(
    `select count(*)::int n from public.coach_clientes
      where coach_id='${U.coach}' and cliente_id='${MAMA}'`)).rows[0].n === 1);
check('la invitacion queda marcada como aceptada',
  (await db.query(
    `select count(*)::int n from public.invitaciones where aceptada_en is not null`)).rows[0].n === 1);

console.log('\n— Quien se registra sin invitacion no se ve afectado —');
const AJENO = '55555555-5555-5555-5555-555555555555';
await db.exec(`insert into auth.users(id,email) values ('${AJENO}','ajeno@x.com')`);
check('entra normal, sin entrenador',
  (await db.query(
    `select count(*)::int n from public.coach_clientes where cliente_id='${AJENO}'`)).rows[0].n === 0);

console.log(`\n${ok} pasan · ${bad} fallan`);
await db.close();
process.exit(bad ? 1 : 0);
