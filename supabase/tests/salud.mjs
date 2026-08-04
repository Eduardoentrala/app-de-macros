// Las condiciones de salud: que se guarden, que no se pueda meter basura,
// y -lo importante- que sigan siendo dato privado de cada quien.
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

let ok = 0, mal = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { mal++; console.log(`  FALLA ${n}${extra ? ' — ' + extra : ''}`); }
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

const YO   = '11111111-1111-1111-1111-111111111111';
const OTRO = '22222222-2222-2222-2222-222222222222';
await db.exec(`insert into auth.users(id,email) values
  ('${YO}','yo@x.com'),('${OTRO}','otro@x.com')`);

console.log('— Se guardan y se leen —');
// Desde la 0031 hace falta consentimiento expreso para guardar datos de
// salud: son datos sensibles y la base ya no los acepta a secas.
await as(YO, `update public.profiles
                 set condiciones = '{diabetes_2,hipertension}'::public.condicion_salud[],
                     nota_salud  = 'Metformina por las mañanas',
                     consentimiento_salud_en = now()
               where id = '${YO}'`);
const mio = (await as(YO, `select condiciones::text[] c, nota_salud n
                             from public.profiles where id='${YO}'`)).rows[0];
check('quedan las dos condiciones',
  mio.c.length === 2 && mio.c.includes('diabetes_2') && mio.c.includes('hipertension'),
  JSON.stringify(mio.c));
check('y la nota', mio.n === 'Metformina por las mañanas');

console.log('\n— Por defecto no hay ninguna —');
const otro = (await as(OTRO, `select condiciones::text[] c, nota_salud n
                                from public.profiles where id='${OTRO}'`)).rows[0];
check('lista vacía, no nula', Array.isArray(otro.c) && otro.c.length === 0, JSON.stringify(otro.c));
check('sin nota', otro.n === null);

console.log('\n— Lo que la base NO deja pasar —');
check('una condición inventada',
  (await falla(YO, `update public.profiles set condiciones='{gripe}'::public.condicion_salud[]
                     where id='${YO}'`)) !== null);
check('la misma condición repetida',
  (await falla(YO, `update public.profiles
                       set condiciones='{diabetes_2,diabetes_2}'::public.condicion_salud[]
                     where id='${YO}'`)) !== null);
// Los dos tipos de diabetes a la vez no existen. Se comprueba en la base y
// no solo en la pantalla: la app habla por PostgREST y no es la única puerta.
check('diabetes tipo 1 y tipo 2 a la vez',
  (await falla(YO, `update public.profiles
                       set condiciones='{diabetes_1,diabetes_2}'::public.condicion_salud[]
                     where id='${YO}'`)) !== null);
check('una nota larguísima',
  (await falla(YO, `update public.profiles set nota_salud=repeat('x',301) where id='${YO}'`)) !== null);

console.log('\n— Sin consentimiento no se guardan datos de salud (0031) —');
// La pantalla no es la unica puerta: la app habla por PostgREST y se puede
// llamar directo. La regla tiene que vivir en la base o no vale nada.
check('OTRO no puede declarar condiciones sin haber aceptado',
  (await falla(OTRO, `update public.profiles
                         set condiciones='{prediabetes}'::public.condicion_salud[]
                       where id='${OTRO}'`)) !== null);
check('y no se le quedo nada guardado',
  (await db.query(`select cardinality(condiciones) n from public.profiles
                    where id='${OTRO}'`)).rows[0].n === 0);
check('con consentimiento si entra',
  (await falla(OTRO, `update public.profiles
                         set consentimiento_salud_en = now(),
                             condiciones='{prediabetes}'::public.condicion_salud[]
                       where id='${OTRO}'`)) === null);
// Quitarselas todas no requiere nada: dejar de dar un dato nunca puede
// estar mas restringido que darlo.
check('quitarlas siempre se puede',
  (await falla(OTRO, `update public.profiles
                         set condiciones='{}'::public.condicion_salud[],
                             consentimiento_salud_en = null
                       where id='${OTRO}'`)) === null);

console.log('\n— Sexo y días de entreno (0022) —');
// Las otras dos entradas de Mifflin-St Jeor. Sin guardarlas, recalcular al
// volver a entrar usaba el valor por defecto de la pantalla: 166 calorías
// de error por el sexo y hasta un 11% por el factor de actividad.
check('se puede guardar el sexo',
  (await falla(YO, `update public.profiles set sexo='m' where id='${YO}'`)) === null);
check('y los días de entreno',
  (await falla(YO, `update public.profiles set dias_entreno=6 where id='${YO}'`)) === null);
check('un sexo inventado no entra',
  (await falla(YO, `update public.profiles set sexo='x' where id='${YO}'`)) !== null);
check('ocho días de entreno tampoco',
  (await falla(YO, `update public.profiles set dias_entreno=8 where id='${YO}'`)) !== null);
// Las cuentas de antes de la 0022 no los tienen y nadie puede adivinarlos:
// null tiene que seguir siendo válido o la migración rompería lo que ya hay.
check('null sigue valiendo: nadie se inventa el dato',
  (await falla(YO, `update public.profiles set sexo=null, dias_entreno=null
                     where id='${YO}'`)) === null);

console.log('\n— Sigue siendo dato privado —');
const espia = await as(OTRO, `select condiciones::text[] c, nota_salud n
                                from public.profiles where id='${YO}'`);
check('otra persona NO ve mis condiciones', espia.rows.length === 0,
  JSON.stringify(espia.rows));
await as(OTRO, `update public.profiles set condiciones='{embarazo}'::public.condicion_salud[]
                 where id='${YO}'`);
const trasIntento = (await db.query(`select condiciones::text[] c from public.profiles
                                      where id='${YO}'`)).rows[0];
// Un UPDATE que no encaja con ninguna fila NO da error: sale bien sin tocar
// nada. Por eso se comprueba el valor que queda, no que salte una excepción.
check('ni me las puede cambiar',
  !trasIntento.c.includes('embarazo'), JSON.stringify(trasIntento.c));

console.log(`\n${ok} pasan · ${mal} fallan`);
await db.close();
process.exit(mal ? 1 : 0);
