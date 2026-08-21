// Buscar a quien inscribir en Plan escribiendo su nombre.
//
// LO QUE HABIA: un prompt() del navegador pidiendo el correo EXACTO. Para
// inscribir a Lety habia que sabérselo de memoria y escribirlo sin erratas.
//
// LO QUE MAS IMPORTA AQUI ES A QUIEN DEJA VER. `plan_buscar` es SECURITY
// DEFINER —tiene que leer `profiles` y `auth.users` enteros para filtrar—,
// asi que lo unico que impide que sea una fuga es el `puede_ver` de dentro.
// Sin el, un entrenador escribe una letra y lee los nombres y correos de
// los clientes de todos los demas.
//
// Por eso la mitad de esta prueba es intentar ver a quien no toca.
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

const como = async (uid, sql) => {
  await db.exec(`select set_config('request.jwt.claim.sub','${uid}',false)`);
  await db.exec('set role authenticated');
  try { return { r: await db.query(sql), e: null }; }
  catch (e) { return { r: null, e: e.message.split('\n')[0] }; }
  finally { await db.exec('reset role'); }
};

const ADMIN = '11111111-1111-1111-1111-111111111111';
const COACH = '22222222-2222-2222-2222-222222222222';
const LETY  = '33333333-3333-3333-3333-333333333333';
const OTRO  = '44444444-4444-4444-4444-444444444444';   // otro entrenador
const AJENA = '55555555-5555-5555-5555-555555555555';   // clienta del otro
for (const [k, id] of [['admin', ADMIN], ['coach', COACH], ['lety', LETY],
                       ['otro', OTRO], ['ajena', AJENA]])
  await db.exec(`insert into auth.users(id,email) values ('${id}','${k}@x.com')`);
await db.exec('alter table public.profiles disable trigger trg_bloquear_escalada_de_rol');
await db.exec(`update public.profiles set role='super_admin' where id='${ADMIN}'`);
await db.exec(`update public.profiles set role='coach' where id in ('${COACH}','${OTRO}')`);
await db.exec('alter table public.profiles enable trigger trg_bloquear_escalada_de_rol');
// Con acento y con mayusculas a proposito: quien busca escribe "lety".
await db.exec(`update public.profiles set full_name='Leticia Ramírez' where id='${LETY}'`);
await db.exec(`update public.profiles set full_name='Leticia Ajena'   where id='${AJENA}'`);
await db.exec(`insert into public.coach_clientes(coach_id,cliente_id)
               values ('${COACH}','${LETY}'), ('${OTRO}','${AJENA}')`);

const busca = async (uid, texto) =>
  (await como(uid, `select nombre, correo, ya_inscrito from public.plan_buscar('${texto}')`)).r.rows;

console.log('\n— Encuentra escribiendo el nombre —');
{
  check('por el nombre', (await busca(COACH, 'leticia')).length === 1);
  // Sin acentos y sin mayusculas: quien busca no escribe "Ramírez" con
  // tilde ni se acuerda de como lo guardo.
  check('sin acentos', (await busca(COACH, 'ramirez')).length === 1,
    'busco "ramirez" y ella es "Ramírez"');
  check('y sin mayusculas', (await busca(COACH, 'LETICIA')).length === 1);
  check('por trozos del apellido', (await busca(COACH, 'ram')).length === 1);
  check('y tambien por el correo', (await busca(COACH, 'lety@')).length === 1);
  const uno = (await busca(COACH, 'leticia'))[0];
  // Dos personas pueden llamarse igual: el correo es lo unico que de
  // verdad las distingue, y por eso sale debajo del nombre.
  check('trae el correo para distinguirlas', !!uno.correo, JSON.stringify(uno));
}

console.log('\n— Pero solo a los suyos —');
{
  // ESTO ES LO QUE NO PUEDE FALLAR NUNCA.
  const delOtro = await busca(COACH, 'ajena');
  check('un entrenador NO ve a la clienta de otro', delOtro.length === 0,
    'escribiria una letra y leeria los nombres y correos de todos');
  check('y al reves tampoco', (await busca(OTRO, 'ramirez')).length === 0);
  // El super admin si, que es su trabajo.
  check('el super admin ve a las dos', (await busca(ADMIN, 'leticia')).length === 2);
  // Un cliente normal no tiene nada que buscar aqui: devuelve vacio en vez
  // de reventar, porque la app la llama al teclear.
  check('un cliente no busca a nadie', (await busca(LETY, 'leticia')).length === 0);
}

console.log('\n— Con una letra no busca —');
{
  // Una lista con TODOS al abrir es justo lo que hizo inutil la pantalla de
  // clientes del panel.
  check('con una sola letra devuelve vacio', (await busca(COACH, 'l')).length === 0);
  check('con dos ya busca', (await busca(COACH, 'le')).length === 1);
}

console.log('\n— Dice quien ya esta dentro —');
{
  check('todavia no esta inscrita', (await busca(COACH, 'leticia'))[0].ya_inscrito === false);
  await como(COACH, `select public.plan_inscribir_id('${LETY}')`);
  // Sin esto, tocar a quien ya esta no hace nada visible —el alta es «si ya
  // esta, no hagas nada»— y parece que la app se colgo.
  check('y despues sale marcada', (await busca(COACH, 'leticia'))[0].ya_inscrito === true);
  check('y aparece en la lista de Plan',
    (await como(COACH, 'select count(*)::int n from public.plan_lista()')).r.rows[0].n === 1);
}

console.log('\n— Inscribir por id tiene la misma puerta —');
{
  // Un id se adivina peor que un correo, pero "peor" no es "no".
  const r = await como(OTRO, `select public.plan_inscribir_id('${LETY}')`);
  check('no se inscribe a la clienta de otro', r.e !== null, 'entro sin protestar');
  const c = await como(LETY, `select public.plan_inscribir_id('${AJENA}')`);
  check('ni un cliente inscribe a nadie', c.e !== null);
  // Repetir no duplica: el alta lleva `on conflict do nothing`.
  await como(COACH, `select public.plan_inscribir_id('${LETY}')`);
  check('inscribir dos veces no duplica',
    (await como(COACH, 'select count(*)::int n from public.plan_lista()')).r.rows[0].n === 1);
}

console.log('\n— Una cuenta suspendida no se inscribe —');
{
  // Por el camino de verdad: un trigger impide tocar `activo` a mano, para
  // que nadie se reactive solo. Lo hace el super admin.
  await como(ADMIN, `select public.admin_activar('${LETY}', false)`);
  check('deja de salir en la busqueda', (await busca(COACH, 'leticia')).length === 0,
    'no puede llevar plan quien no puede entrar');
  await como(ADMIN, `select public.admin_activar('${LETY}', true)`);
  check('y vuelve al reactivarla', (await busca(COACH, 'leticia')).length === 1);
}

console.log(`\n${ok} pasan · ${bad} fallan`);
process.exit(bad ? 1 : 0);
