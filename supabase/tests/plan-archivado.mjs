// La lista de Plan decia «con plan» de gente sin plan.
//
// EL FALLO
//
// El entrenador pulsa «Quitar el plan». El cliente deja de verlo al
// instante... y en la lista del entrenador esa persona sigue apareciendo
// como «con plan». Los dos miran lo mismo y ven cosas distintas.
//
// Salen dos decisiones correctas que juntas fallan:
//
//   1. Borrar no borra: el trigger de la 0007 marca `archivado_en` y cancela
//      el DELETE, pero NO toca `activo`.
//   2. `plan_lista` es SECURITY DEFINER, y eso se salta el RLS. La politica
//      «planes: ver» filtra lo archivado, asi que en el resto de la app no
//      existe; aqui si, y el `exists(... where pl.activo)` lo contaba.
//
// La 0041 le anade `archivado_en is null`. Esto lo comprueba corriendo el
// ciclo entero contra Postgres: escribir, quitar, y volver a escribir.
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

// Sin `set role authenticated` PGlite corre de superusuario y el RLS no se
// aplica, asi que la prueba pasaria siempre.
const como = async (uid, sql) => {
  await db.exec(`select set_config('request.jwt.claim.sub','${uid}',false)`);
  await db.exec('set role authenticated');
  try { return await db.query(sql); }
  finally { await db.exec('reset role'); }
};

const COACH = '22222222-2222-2222-2222-222222222222';
const CLI   = '33333333-3333-3333-3333-333333333333';
for (const [k, id] of [['coach', COACH], ['cli', CLI]])
  await db.exec(`insert into auth.users(id,email) values ('${id}','${k}@x.com')`);
await db.exec('alter table public.profiles disable trigger trg_bloquear_escalada_de_rol');
await db.exec(`update public.profiles set role='coach' where id='${COACH}'`);
await db.exec('alter table public.profiles enable trigger trg_bloquear_escalada_de_rol');
await db.exec(`update public.profiles set full_name='Ana' where id='${CLI}'`);
await db.exec(`insert into public.coach_clientes(coach_id,cliente_id) values ('${COACH}','${CLI}')`);

const tienePlan = async () =>
  (await como(COACH, 'select tiene_plan from public.plan_lista()')).rows[0]?.tiene_plan;

await como(COACH, `select public.plan_inscribir('cli@x.com')`);

console.log('\n— Con un plan escrito —');
{
  check('sale en la lista', (await como(COACH, 'select count(*)::int n from public.plan_lista()')).rows[0].n === 1);
  check('y todavia sin plan', (await tienePlan()) === false);
  await como(COACH, `insert into public.planes(user_id,nombre,comidas,activo,creado_por)
                     values ('${CLI}','Plan de Ana','[{"momento":"Cena","texto":"sopa"}]'::jsonb,true,'${COACH}')`);
  check('al escribirlo, tiene_plan se pone en true', (await tienePlan()) === true);
}

console.log('\n— Al quitarlo —');
{
  // Lo que hace la app: un DELETE, que el trigger convierte en archivado.
  await como(COACH, `delete from public.planes where user_id='${CLI}'`);

  const cruda = await db.query(
    `select activo, archivado_en is not null as archivado from public.planes where user_id='${CLI}'`);
  // Esto NO es el fallo, es el diseno: `activo` significa «es el plan
  // vigente» y `archivado_en` significa «esto ya no existe». Son dos cosas
  // distintas. El fallo era no mirar la segunda.
  check('la fila queda archivada pero con activo=true',
    cruda.rows[0].archivado === true && cruda.rows[0].activo === true);

  check('y la lista ya NO dice que tiene plan', (await tienePlan()) === false,
    'el entrenador veria «con plan» y el cliente no veria nada');

  // El cliente, por su lado, pasa por PostgREST con RLS: nunca lo vio.
  const suyo = await como(CLI, `select count(*)::int n from public.planes where activo`);
  check('el cliente tampoco lo ve', suyo.rows[0].n === 0);
  check('los dos ven lo mismo', (await tienePlan()) === (suyo.rows[0].n > 0));
}

console.log('\n— Y se le puede escribir otro —');
{
  // No hay unique sobre (user_id) where activo, asi que la fila archivada
  // -que sigue con activo=true- no bloquea el alta. Si algun dia se anade
  // esa restriccion, esto salta.
  const r = await como(COACH, `insert into public.planes(user_id,nombre,comidas,activo,creado_por)
                               values ('${CLI}','Plan nuevo','[{"momento":"Cena","texto":"pescado"}]'::jsonb,true,'${COACH}')`)
    .then(() => null).catch(e => e.message.split('\n')[0]);
  check('el plan archivado no estorba al nuevo', r === null, r ?? '');
  check('y vuelve a decir que tiene plan', (await tienePlan()) === true);
  const suyo = await como(CLI, `select nombre from public.planes where activo`);
  check('el cliente ve el nuevo y solo el nuevo',
    suyo.rows.length === 1 && suyo.rows[0].nombre === 'Plan nuevo',
    JSON.stringify(suyo.rows));
}

console.log(`\n${ok} pasan · ${bad} fallan`);
process.exit(bad ? 1 : 0);
