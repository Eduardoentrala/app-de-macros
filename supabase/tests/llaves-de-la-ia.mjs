// Apagarle la IA a alguien, pieza por pieza.
//
// LO QUE DE VERDAD SE PRUEBA AQUI es que la llave no se pueda volver a
// encender sola. Una llave que su dueño puede girar no es una llave: si una
// persona pudiera escribir su propia fila de `ia_permisos`, reactivaria lo
// que su entrenador apago y todo esto seria decorado.
//
// Por eso la tabla NO TIENE ninguna politica de escritura, ni siquiera para
// uno mismo, y ni siquiera el GRANT: se cambia solo por
// `ia_permisos_guardar`, que comprueba quien llama. La mitad de esta prueba
// es intentar saltarse eso por los tres caminos que hay.
//
// Y la otra mitad es que no rompa a quien ya usa la app: sin fila, todo
// encendido. Nadie se despierta con la mitad apagada porque se anadio una
// tabla.
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
const OTRA  = '44444444-4444-4444-4444-444444444444';

for (const [n, id] of [['admin', ADMIN], ['coach', COACH], ['lety', LETY], ['otra', OTRA]])
  await db.exec(`insert into auth.users (id, email) values ('${id}', '${n}@x.com')`);

await db.exec('alter table public.profiles disable trigger trg_bloquear_escalada_de_rol');
await db.exec(`update public.profiles set role='super_admin', full_name='Admin' where id='${ADMIN}'`);
await db.exec(`update public.profiles set role='coach', full_name='Coach' where id='${COACH}'`);
await db.exec(`update public.profiles set full_name='Leticia Quiroz' where id='${LETY}'`);
await db.exec(`update public.profiles set full_name='Otra Persona' where id='${OTRA}'`);
await db.exec('alter table public.profiles enable trigger trg_bloquear_escalada_de_rol');

// Lety es del coach; Otra no es de nadie más que del super admin.
await db.exec(`insert into public.coach_clientes (coach_id, cliente_id) values ('${COACH}','${LETY}')`);
await db.exec(`insert into public.plan_inscritos (cliente_id, inscrito_por)
               values ('${LETY}','${COACH}'), ('${OTRA}','${ADMIN}')`);

const llaves = async (uid, de) => {
  const { r, e } = await como(uid, `select public.ia_permisos_ver('${de}') as v`);
  return e ? { error: e } : r.rows[0].v;
};

// ------------------------------------------------------------------
console.log('\nQuien ya usa la app no nota nada');
{
  const v = await llaves(COACH, LETY);
  check('sin fila, las seis encendidas',
    v.foto && v.chat && v.semanal && v.plan_dia && v.plan_semana && v.analisis,
    JSON.stringify(v));
  check('y no se creó fila por solo mirar',
    (await db.query('select count(*)::int n from public.ia_permisos')).rows[0].n === 0);
}

// ------------------------------------------------------------------
console.log('\nEl entrenador apaga lo caro');
{
  await como(COACH, `select public.ia_permisos_guardar('${LETY}', '{"plan_semana": false}'::jsonb)`);
  const v = await llaves(COACH, LETY);
  check('la semana entera queda apagada', v.plan_semana === false);
  check('y el plan del día sigue encendido', v.plan_dia === true,
    'mandar una llave no puede apagar las otras');

  await como(COACH, `select public.ia_permisos_guardar('${LETY}', '{"analisis": false}'::jsonb)`);
  const v2 = await llaves(COACH, LETY);
  check('apagar una segunda no reenciende la primera', v2.plan_semana === false && v2.analisis === false,
    JSON.stringify(v2));

  // El atajo "solo apuntar": las seis de golpe, una sola petición.
  await como(COACH, `select public.ia_permisos_guardar('${LETY}',
    '{"foto":true,"chat":false,"semanal":false,"plan_dia":false,"plan_semana":false,"analisis":false}'::jsonb)`);
  const v3 = await llaves(COACH, LETY);
  check('un atajo mueve las seis de una vez',
    v3.foto === true && !v3.chat && !v3.semanal && !v3.plan_dia && !v3.plan_semana && !v3.analisis,
    JSON.stringify(v3));

  const { r } = await como(COACH, `select cambiado_por from public.ia_permisos where user_id='${LETY}'`);
  check('y queda apuntado quién fue', r.rows[0].cambiado_por === COACH,
    'si a alguien se le apaga algo y no sabe por qué, esto lo dice');
}

// ------------------------------------------------------------------
console.log('\nLA LLAVE NO SE PUEDE GIRAR DESDE DENTRO');
{
  const v = await llaves(LETY, LETY);
  check('Lety SÍ ve las suyas', v.foto === true && v.chat === false,
    'la app esconde el botón apagado, y para esconderlo tiene que saberlo');

  const a = await como(LETY, `select public.ia_permisos_guardar('${LETY}', '{"chat": true}'::jsonb)`);
  check('pero no puede reencendérselas por la función', !!a.e, a.e || 'NO FALLÓ');

  const b = await como(LETY, `update public.ia_permisos set chat = true where user_id = '${LETY}'`);
  check('ni tocando la tabla a mano', !!b.e, b.e || 'NO FALLÓ');

  const c = await como(OTRA, `insert into public.ia_permisos (user_id) values ('${OTRA}')`);
  check('ni creándose una fila propia en blanco', !!c.e, c.e || 'NO FALLÓ');

  check('y sigue apagado después de intentarlo todo',
    (await llaves(LETY, LETY)).chat === false);
}

// ------------------------------------------------------------------
console.log('\nNi desde el entrenador de al lado');
{
  const a = await como(COACH, `select public.ia_permisos_guardar('${OTRA}', '{"foto": false}'::jsonb)`);
  check('un coach no apaga nada a quien no es suyo', !!a.e, a.e || 'NO FALLÓ');

  const b = await llaves(COACH, OTRA);
  check('ni ve sus llaves', !!b.error, b.error || 'NO FALLÓ');

  const c = await como(LETY, `select public.ia_permisos_guardar('${OTRA}', '{"foto": false}'::jsonb)`);
  check('y una persona normal no apaga nada a nadie', !!c.e, c.e || 'NO FALLÓ');

  const d = await como(LETY, `select count(*)::int n from public.ia_permisos`);
  check('la tabla entera, vista por alguien normal, es solo su fila',
    d.r.rows[0].n === 1);
}

// ------------------------------------------------------------------
console.log('\nEl super admin sí puede con todos');
{
  const a = await como(ADMIN, `select public.ia_permisos_guardar('${OTRA}', '{"plan_semana": false}'::jsonb)`);
  check('apaga a quien sea', !a.e, a.e || '');
  check('y lo ve', (await llaves(ADMIN, OTRA)).plan_semana === false);
}

// ------------------------------------------------------------------
console.log('\nLa lista de Plan lo dice sin una petición por persona');
{
  const { r } = await como(COACH, 'select nombre, tiene_plan, ia_apagadas from public.plan_lista()');
  const lety = r.rows.find(f => f.nombre === 'Leticia Quiroz');
  check('trae el recuento de apagadas', lety && lety.ia_apagadas === 5,
    JSON.stringify(r.rows));
  check('y no se llevó por delante lo que ya devolvía',
    lety && 'tiene_plan' in lety && 'nombre' in lety);

  const { r: r2 } = await como(ADMIN, 'select nombre, ia_apagadas from public.plan_lista()');
  const otra = r2.rows.find(f => f.nombre === 'Otra Persona');
  check('y quien no tiene nada apagado sale en cero',
    r2.rows.length === 2 && otra.ia_apagadas === 1,
    JSON.stringify(r2.rows));
}

console.log(`\n${ok} pasan · ${bad} fallan`);
process.exit(bad ? 1 : 0);
