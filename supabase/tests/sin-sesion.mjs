// Lo que pasa cuando llama el SERVIDOR y no una persona.
//
// La Edge Function usa la clave de servicio. Ahi dentro `auth.uid()` vale
// null, y con uid nulo `puede_ver()` devuelve FALSE —no null—, porque
// `acceso_permitido()` empieza por `cuenta_habilitada()`, que hace
// `coalesce(..., false)`.
//
// Eso convierte la forma de escribir la comprobacion en algo que decide si
// una funcion sirve o no:
//
//     if not public.puede_ver(x)                     -> REVIENTA
//     if not (x = auth.uid() or public.puede_ver(x))  -> pasa, por NULL
//
// La segunda pasa porque `uuid = null` da NULL, no false. Es decir: una de
// ellas funcionaba de milagro. Esta prueba fija las dos, para que nadie
// "ordene" la que funciona y mate el freno del cierre de los lunes sin
// enterarse.
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

// SIN sesion: ni set_config ni set role. Es lo mismo que la clave de
// servicio en Supabase.
const servidor = async (sql) => {
  try { return { r: await db.query(sql), e: null }; }
  catch (e) { return { r: null, e: e.message.split('\n')[0] }; }
};
const persona = async (uid, sql) => {
  await db.exec(`select set_config('request.jwt.claim.sub','${uid}',false)`);
  await db.exec('set role authenticated');
  try { return { r: await db.query(sql), e: null }; }
  catch (e) { return { r: null, e: e.message.split('\n')[0] }; }
  finally { await db.exec('reset role'); await db.exec(`select set_config('request.jwt.claim.sub','',false)`); }
};

const COACH = '22222222-2222-2222-2222-222222222222';
const LETY  = '33333333-3333-3333-3333-333333333333';
const OTRA  = '44444444-4444-4444-4444-444444444444';
for (const [n, id] of [['coach', COACH], ['lety', LETY], ['otra', OTRA]])
  await db.exec(`insert into auth.users (id, email) values ('${id}', '${n}@x.com')`);
await db.exec('alter table public.profiles disable trigger trg_bloquear_escalada_de_rol');
await db.exec(`update public.profiles set role='coach', full_name='Coach' where id='${COACH}'`);
await db.exec('alter table public.profiles enable trigger trg_bloquear_escalada_de_rol');
await db.exec(`update public.profiles set full_name='Leticia' where id='${LETY}'`);
await db.exec(`insert into public.coach_clientes (coach_id, cliente_id) values ('${COACH}','${LETY}')`);
await db.exec(`insert into public.ajustes_calorias
  (cliente_id, hecho_por, cal_antes, p_antes, c_antes, g_antes,
   cal_despues, p_despues, c_despues, g_despues, motivo)
  values ('${LETY}','${COACH}', 2000,150,200,67, 1800,150,172,57, 'tres semanas sin bajar')`);

// ------------------------------------------------------------------
console.log('\nLo que ve el servidor con la clave de servicio');
{
  const { r } = await servidor(`select auth.uid() as uid,
    public.acceso_permitido() as acceso, public.puede_ver('${LETY}') as puede_ver`);
  const f = r.rows[0];
  check('sin sesion, auth.uid() es nulo', f.uid === null);
  check('y `puede_ver` dice que NO (false, no null)', f.puede_ver === false,
    'por eso una comprobacion escrita a secas revienta aqui');
}

// ------------------------------------------------------------------
console.log('\nEL FRENO DEL CIERRE DE LOS LUNES tiene que funcionar ahi');
{
  const { r, e } = await servidor(`select public.calorias_movidas_a_mano('${LETY}') as v`);
  check('la Edge Function puede preguntarlo sin sesion', !e, e || '');
  check('y le contesta con el ajuste', !!(r && r.rows[0].v && r.rows[0].v.cal_despues === 1800),
    r ? JSON.stringify(r.rows[0].v) : '');
  check('con el motivo, para que el mensaje del lunes sea coherente',
    !!(r && r.rows[0].v && r.rows[0].v.motivo === 'tres semanas sin bajar'));

  const { r: r2 } = await servidor(`select public.calorias_movidas_a_mano('${OTRA}') as v`);
  check('y de quien no tiene ajustes devuelve nulo, no un error',
    r2 && r2.rows[0].v === null);
}

// ------------------------------------------------------------------
console.log('\nPero seguir cerrada para las personas');
{
  const a = await persona(LETY, `select public.calorias_movidas_a_mano('${OTRA}')`);
  check('una persona no mira los ajustes de una desconocida', !!a.e, a.e || 'NO FALLO');

  const b = await persona(LETY, `select public.calorias_movidas_a_mano('${LETY}') as v`);
  check('pero si los suyos', !b.e && b.r.rows[0].v !== null, b.e || '');

  const c = await persona(COACH, `select public.calorias_movidas_a_mano('${LETY}') as v`);
  check('y su entrenador tambien', !c.e && c.r.rows[0].v !== null, c.e || '');
}

// ------------------------------------------------------------------
console.log('\nY que nadie confunda las dos formas de escribirlo');
{
  // `plan_metricas` usa la forma "a secas" y revienta sin sesion. NO es un
  // fallo: a esa no la llama nunca el servidor. Se fija aqui para que quede
  // claro que la diferencia es real y no una casualidad de un dia.
  const { e } = await servidor(`select public.plan_metricas('${LETY}')`);
  check('`plan_metricas` sigue reventando sin sesion, como siempre', !!e,
    e || 'NO FALLO — si esto cambia, alguien toco la comprobacion');
}

console.log(`\n${ok} pasan · ${bad} fallan`);
process.exit(bad ? 1 : 0);
