// El tope del asistente: cada consulta cuesta dinero, así que esto es lo
// que impide que un usuario -o un token robado- vacie la cuenta.
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
const asFalla = async (uid, sql) => {
  await db.exec(`select set_config('request.jwt.claim.sub','${uid}',false)`);
  await db.exec('set role authenticated');
  try { await db.query(sql); return null; }
  catch (e) { return e.message.split('\n')[0]; }
  finally { await db.exec('reset role'); }
};
const comoUsuario = async (uid, sql) => {
  await db.exec(`select set_config('request.jwt.claim.sub','${uid}',false)`);
  await db.exec('set role authenticated');
  try { return await db.query(sql); } finally { await db.exec('reset role'); }
};

const YO   = '11111111-1111-1111-1111-111111111111';
const OTRO = '22222222-2222-2222-2222-222222222222';
await db.exec(`insert into auth.users(id,email) values ('${YO}','yo@x.com'),('${OTRO}','otro@x.com')`);

const gastar = async (uid, tope) =>
  (await db.query(`select public.gastar_consulta_ia('${uid}', ${tope}) g`)).rows[0].g;

console.log('— El tope cuenta bien —');
check('la primera consulta deja tope-1', (await gastar(YO, 3)) === 2);
check('la segunda deja 1',               (await gastar(YO, 3)) === 1);
check('la tercera deja 0',               (await gastar(YO, 3)) === 0);
check('la cuarta se rechaza con -1',     (await gastar(YO, 3)) === -1);
check('y la quinta tambien',             (await gastar(YO, 3)) === -1);

const usadas = (await db.query(
  `select consultas c from public.ia_uso where user_id='${YO}' and dia=current_date`)).rows[0].c;
check('rechazar NO gasta una consulta', usadas === 3,
  `se contaron ${usadas}, deberian ser 3`);

console.log('\n— Cada quien lleva su cuenta —');
check('el tope de uno no afecta al otro', (await gastar(OTRO, 3)) === 2);

console.log('\n— Nadie puede falsear su uso —');
check('un usuario NO puede insertar su fila',
  (await asFalla(OTRO, `insert into public.ia_uso(user_id,consultas) values ('${OTRO}',0)`)) !== null);
check('un usuario NO puede bajarse el contador',
  (await asFalla(YO, `update public.ia_uso set consultas=0 where user_id='${YO}'`)) !== null);
check('un usuario NO puede borrar su fila',
  (await asFalla(YO, `delete from public.ia_uso where user_id='${YO}'`)) !== null);
check('ni llamar a la funcion del tope directamente',
  (await asFalla(YO, `select public.gastar_consulta_ia('${YO}', 999)`)) !== null);

console.log('\n— Pero sí ve lo suyo —');
check('cada quien lee su propio uso',
  (await comoUsuario(YO, `select count(*)::int n from public.ia_uso`)).rows[0].n === 1);
check('y no el de los demas',
  (await comoUsuario(YO, `select count(*)::int n from public.ia_uso where user_id='${OTRO}'`)).rows[0].n === 0);

console.log('\n— Permisos: quien puede mover el contador —');
// Esto es lo que fallo en produccion. La 0015 revoco el permiso a
// `public` para que ningun usuario se regalara consultas, pero
// service_role -quien llama desde la Edge Function- dependia justo de
// ese permiso. La 0016 se lo devuelve. Sin esta prueba, volveria a
// pasar y otra vez sin dejar rastro en el registro.
const puede = async (rol) => (await db.query(
  `select has_function_privilege('${rol}','public.gastar_consulta_ia(uuid,integer)','execute') p`
)).rows[0].p;
check('el servidor (service_role) SI puede', (await puede('service_role')) === true);
check('un usuario normal NO puede',          (await puede('authenticated')) === false);
check('un anonimo NO puede',                 (await puede('anon')) === false);

console.log('\n— Limpieza —');
await db.exec(`insert into public.ia_uso(user_id,dia,consultas)
               values ('${YO}', current_date - 40, 5)`);
const borradas = (await db.query(`select public.limpiar_uso_ia() b`)).rows[0].b;
check('se borra el uso de hace mas de 30 dias', borradas === 1);
const hoy = (await db.query(
  `select count(*)::int n from public.ia_uso where dia = current_date`)).rows[0].n;
check('y el de hoy se queda', hoy === 2);

console.log(`\n${ok} pasan · ${bad} fallan`);
await db.close();
process.exit(bad ? 1 : 0);
