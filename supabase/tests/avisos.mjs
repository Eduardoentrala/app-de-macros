// Cuando el asistente tiene algo que decir.
//
// Dos cosas se prueban aqui, y la segunda importa mas que la primera:
//   1. Que detecte las situaciones que dijo que detectaria.
//   2. Que NO se pase. Un aviso de mas es acoso, y a una app que acosa se
//      le silencian las notificaciones el primer dia y ya no vuelve nadie.
//
// Todas las funciones se llaman de verdad.
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
  ana:   '11111111-1111-1111-1111-111111111111',
  beto:  '22222222-2222-2222-2222-222222222222',
  cris:  '33333333-3333-3333-3333-333333333333',
  nuevo: '44444444-4444-4444-4444-444444444444'
};
for (const [k, id] of Object.entries(U))
  await db.exec(`insert into auth.users(id,email) values ('${id}','${k}@x.com')`);

// Apunta comida en los dias indicados (0 = hoy, 3 = hace tres dias).
const comio = async (uid, ...dias) => {
  for (const d of dias)
    await db.exec(`insert into public.diary_entries
      (user_id,entry_date,meal,food_name,unit,quantity,protein_g,carbs_g,fat_g)
      values ('${uid}', current_date - ${d}, 'Comida','Pollo','Gramos',150,30,0,5)`);
};
const motivo = async (uid) =>
  (await as(uid, `select public.motivo_de_aviso('${uid}') m`)).rows[0].m;
const pendiente = async (uid) =>
  (await as(uid, `select public.aviso_pendiente('${uid}') m`)).rows[0].m;

console.log('— A quien acaba de llegar no se le echa de menos —');
await comio(U.nuevo, 0, 1);       // solo dos dias de historial
check('sin historial no hay aviso', (await motivo(U.nuevo)) === null,
  'a alguien que empieza no se le dice nada');

console.log('\n— Se fue —');
// Apunto una semana y desaparecio hace cuatro dias.
await comio(U.ana, 4, 5, 6, 7, 8);
check('cuatro dias sin aparecer: ausente', (await motivo(U.ana)) === 'ausente');
// Dos dias es un fin de semana, no una ausencia.
await comio(U.beto, 2, 3, 4, 5);
check('dos dias no es ausencia', (await motivo(U.beto)) !== 'ausente',
  `salio ${await motivo(U.beto)}`);

console.log('\n— Lleva la semana entera —');
await comio(U.cris, 0, 1, 2, 3, 4, 5, 6);
check('siete dias seguidos: racha', (await motivo(U.cris)) === 'racha');

console.log('\n— El peso no se mueve —');
// Cris quiere bajar y pesa lo mismo que hace tres semanas.
await db.exec(`update public.profiles set goal='bajar' where id='${U.cris}'`);
await db.exec(`insert into public.weight_logs(user_id,log_date,weight_kg) values
  ('${U.cris}', current_date - 21, 80.0), ('${U.cris}', current_date, 79.9)`);
check('quince dias sin moverse: estancado', (await motivo(U.cris)) === 'estancado',
  'y gana a la racha, porque es lo que de verdad necesita saber');
// Si si baja, no hay nada que corregir.
await db.exec(`update public.weight_logs set weight_kg = 78.4
                where user_id='${U.cris}' and log_date = current_date`);
check('si baja, no se le molesta', (await motivo(U.cris)) === 'racha',
  `salio ${await motivo(U.cris)}`);
// Y a quien quiere mantener, el peso quieto es exactamente lo que busca.
await db.exec(`update public.profiles set goal='mantener' where id='${U.cris}'`);
await db.exec(`update public.weight_logs set weight_kg = 79.9
                where user_id='${U.cris}' and log_date = current_date`);
check('a quien mantiene, el peso quieto no es problema',
  (await motivo(U.cris)) === 'racha', `salio ${await motivo(U.cris)}`);

console.log('\n— Sale uno solo, y el mas urgente —');
// Ana esta ausente Y estancada. Solo debe salir lo primero.
await db.exec(`update public.profiles set goal='bajar' where id='${U.ana}'`);
await db.exec(`insert into public.weight_logs(user_id,log_date,weight_kg) values
  ('${U.ana}', current_date - 20, 90.0), ('${U.ana}', current_date - 4, 90.1)`);
check('la ausencia gana al estancamiento', (await motivo(U.ana)) === 'ausente',
  'lo primero es que vuelva');

console.log('\n— Y no se repite —');
check('hay aviso pendiente', (await pendiente(U.ana)) === 'ausente');
const err = await falla(U.ana,
  `select public.guardar_aviso('ausente', 'Te echamos de menos. Volvemos hoy?')`);
check('se puede guardar', err === null, err || '');
check('ya no queda pendiente, esta sin leer', (await pendiente(U.ana)) === null,
  'con uno sin leer no se manda otro');

// Se lee, y aun asi no vuelve el mismo motivo en siete dias.
await as(U.ana, `update public.avisos_coach set visto_en = now()
                  where user_id='${U.ana}'`);
check('leido, sigue sin repetirse el mismo motivo', (await pendiente(U.ana)) === null,
  'recibir el mismo "todo bien?" cada mañana es como se silencia una app');
// Pero si el aviso es viejo, vuelve a tocar.
await db.exec(`update public.avisos_coach set creado_en = now() - interval '8 days'
                where user_id='${U.ana}'`);
check('pasada la semana, vuelve a tocar', (await pendiente(U.ana)) === 'ausente');

console.log('\n— Nadie se escribe sus propios avisos —');
check('no se puede guardar un motivo que no toca',
  (await falla(U.cris, `select public.guardar_aviso('estancado','Me lo invento')`)) !== null,
  'sin esto cualquiera se escribe lo que quiera en su propia app');
check('ni insertar en la tabla directo',
  (await falla(U.cris, `insert into public.avisos_coach(user_id,motivo,texto)
                        values ('${U.cris}','racha','a mano')`)) !== null);
check('ni ver los de otro',
  (await as(U.cris, `select count(*)::int n from public.avisos_coach
                      where user_id='${U.ana}'`)).rows[0].n === 0);

console.log('\n— Marcar como visto si es cosa suya —');
const suyo = await as(U.ana, `select id from public.avisos_coach
                               where user_id='${U.ana}' limit 1`);
check('el dueño lo marca leido',
  (await falla(U.ana, `update public.avisos_coach set visto_en = now()
                        where id = ${suyo.rows[0].id}`)) === null);
// Un UPDATE que RLS esconde no da error: sale bien sin tocar nada. Por eso
// se mira el valor y no la excepcion.
await db.exec(`update public.avisos_coach set visto_en = null
                where id = ${suyo.rows[0].id}`);
await falla(U.cris, `update public.avisos_coach set visto_en = now()
                      where id = ${suyo.rows[0].id}`);
check('otro no puede marcarlo',
  (await db.query(`select visto_en from public.avisos_coach
                    where id = ${suyo.rows[0].id}`)).rows[0].visto_en === null);

console.log(`\n${ok} pasan · ${bad} fallan`);
await db.close();
process.exit(bad ? 1 : 0);
