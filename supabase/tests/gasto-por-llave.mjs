// El gasto de la IA, contado por LLAVE y no por accion tecnica.
//
// EL FALLO QUE ARREGLA: `ia_gasto` guardaba la accion —'chat', 'plan'…—, y
// la foto de comida viaja como `chat`. O sea que lo mas caro de la app
// (apuntar con foto, el 67% de la factura) y lo mas barato (preguntar por
// texto) caian en el mismo saco.
//
// El registro se monto para responder «¿en que se me va el dinero?».
// Contestando «chat: $180» no responde nada: no se sabe si eso es la foto o
// son preguntas, que es lo unico que hay que saber para decidir cual apagar.
//
// Ahora el informe habla el mismo idioma que los seis interruptores.
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
const LETY  = '33333333-3333-3333-3333-333333333333';
for (const [n, id] of [['admin', ADMIN], ['lety', LETY]])
  await db.exec(`insert into auth.users (id, email) values ('${id}', '${n}@x.com')`);
await db.exec('alter table public.profiles disable trigger trg_bloquear_escalada_de_rol');
await db.exec(`update public.profiles set role='super_admin' where id='${ADMIN}'`);
await db.exec('alter table public.profiles enable trigger trg_bloquear_escalada_de_rol');

// Como lo escribe la Edge Function con la clave de servicio. Fijate en las
// dos primeras: MISMA accion, llaves distintas.
await db.exec(`insert into public.ia_gasto
  (user_id, accion, llave, modelo, entrada, salida) values
  ('${LETY}','chat','foto',       'claude-opus-5', 12750, 1200),
  ('${LETY}','chat','foto',       'claude-opus-5', 12800, 1150),
  ('${LETY}','chat','chat',       'claude-opus-5', 11500,  700),
  ('${LETY}','plan','plan_semana','claude-opus-5',  5500,14000),
  ('${LETY}','plan','plan_dia',   'claude-opus-5',  5500, 3500)`);

// ------------------------------------------------------------------
console.log('\nLa foto y las preguntas dejan de ir en el mismo saco');
{
  const { r, e } = await como(ADMIN, 'select * from public.ia_gasto_resumen(30)');
  check('el super admin ve el resumen', !e, e || '');
  const f = {};
  (r ? r.rows : []).forEach((x) => { f[x.llave] = x; });

  check('la foto sale aparte', f.foto && Number(f.foto.llamadas) === 2,
    JSON.stringify(r && r.rows));
  check('las preguntas también', f.chat && Number(f.chat.llamadas) === 1);
  check('y las dos vienen de la MISMA acción',
    f.foto && f.chat && f.foto.accion === 'chat' && f.chat.accion === 'chat',
    'que es justo lo que las mezclaba antes');
  check('con sus tokens sin mezclar',
    f.foto && Number(f.foto.entrada) === 25550 && Number(f.foto.salida) === 2350,
    f.foto ? JSON.stringify(f.foto) : '');

  check('el plan de un día y la semana entera, separados',
    f.plan_dia && f.plan_semana && Number(f.plan_semana.salida) === 14000,
    'son la misma acción con cinco veces de diferencia');
}

// ------------------------------------------------------------------
console.log('\nY lo caro sale primero');
{
  const { r } = await como(ADMIN, 'select llave, salida from public.ia_gasto_resumen(30)');
  const salidas = r.rows.map((x) => Number(x.salida));
  const ordenado = salidas.every((v, i) => i === 0 || salidas[i - 1] >= v);
  check('ordenado por tokens de salida, que es lo que se paga caro', ordenado,
    JSON.stringify(r.rows));
  check('y arriba del todo, la semana entera', r.rows[0].llave === 'plan_semana');
}

// ------------------------------------------------------------------
console.log('\nSigue siendo cosa del super admin');
{
  const { e } = await como(LETY, 'select * from public.ia_gasto_resumen(30)');
  check('a quien usa la app no se le enseña la factura', !!e, e || 'NO FALLÓ');

  const { r } = await como(LETY, 'select count(*)::int n from public.ia_gasto');
  check('ni las filas sueltas', r.rows[0].n === 0,
    'saber cuántos tokens gastó solo invita a racionarse por miedo a costar dinero');

  const { e: e2 } = await como(LETY,
    `insert into public.ia_gasto (user_id, accion, modelo) values ('${LETY}','x','y')`);
  check('ni puede inventarse consumo', !!e2, e2 || 'NO FALLÓ');
}

// ------------------------------------------------------------------
console.log('\nLo apuntado antes de esto no se pierde');
{
  // Las filas viejas no tienen llave. Caen en su accion en vez de
  // desaparecer del informe.
  await db.exec(`insert into public.ia_gasto (user_id, accion, modelo, entrada, salida)
                 values ('${LETY}','aviso','claude-opus-5', 7200, 400)`);
  const { r } = await como(ADMIN, 'select * from public.ia_gasto_resumen(30)');
  const viejo = r.rows.filter((x) => x.accion === 'aviso')[0];
  check('una fila sin llave cae en su acción', viejo && viejo.llave === 'aviso',
    JSON.stringify(r.rows.map((x) => x.llave)));
}

console.log(`\n${ok} pasan · ${bad} fallan`);
process.exit(bad ? 1 : 0);
