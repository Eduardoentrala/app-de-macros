// Borrar el historial de peso, contra Postgres de verdad.
//
// Se reporto que reiniciar el peso no borra nada: sales de la app, vuelves
// y los registros siguen ahi. Antes de tocar el cliente hay que saber si la
// base deja borrar, porque son dos arreglos completamente distintos.
//
// Ojo con como se comprueba: un DELETE que no encaja con ninguna fila NO da
// error, sale bien sin tocar nada. Hay que mirar lo que QUEDA.
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
const cuenta = async (uid) => (await db.query(
  `select count(*)::int n from public.weight_logs where user_id='${uid}'`)).rows[0].n;

const YO   = '11111111-1111-1111-1111-111111111111';
const OTRO = '22222222-2222-2222-2222-222222222222';
for (const [k, id] of [['yo', YO], ['otro', OTRO]])
  await db.exec(`insert into auth.users(id,email) values ('${id}','${k}@x.com')`);

for (const [id, dias] of [[YO, [0, 2, 4]], [OTRO, [0, 1]]])
  for (const d of dias)
    await db.exec(`insert into public.weight_logs(user_id,log_date,weight_kg)
                   values ('${id}', current_date - ${d}, 80)`);

console.log('— Antes de borrar —');
check('yo tengo tres registros', (await cuenta(YO)) === 3);
check('el otro tiene dos', (await cuenta(OTRO)) === 2);

console.log('\n— El borrado que hace la app —');
// Exactamente lo que manda la app: DELETE filtrando por user_id.
await as(YO, `delete from public.weight_logs where user_id = '${YO}'`);
check('se borran los mios', (await cuenta(YO)) === 0,
  'si esto pasa, el fallo esta en la base y no en el cliente');
check('y no se tocan los de nadie mas', (await cuenta(OTRO)) === 2);

console.log('\n— No se archivan, se borran —');
// weight_logs NO esta entre las tablas que la 0007 convierte en archivado.
// Si lo estuviera, el DELETE se cancelaria y las filas seguirian ahi.
const cols = await db.query(`select column_name from information_schema.columns
                              where table_name='weight_logs' and column_name='archivado_en'`);
check('la tabla no tiene archivado_en', cols.rows.length === 0,
  'si lo tuviera, borrar solo la marcaria y volveria al recargar');

console.log('\n— Y nadie borra los de otro —');
await as(OTRO, `delete from public.weight_logs where user_id = '${YO}'`);
// Un DELETE que RLS esconde sale bien sin tocar nada: hay que mirar el valor.
await db.exec(`insert into public.weight_logs(user_id,log_date,weight_kg)
               values ('${YO}', current_date, 81)`);
await as(OTRO, `delete from public.weight_logs where user_id = '${YO}'`);
check('los mios siguen ahi', (await cuenta(YO)) === 1);

console.log(`\n${ok} pasan · ${bad} fallan`);
await db.close();
process.exit(bad ? 1 : 0);
