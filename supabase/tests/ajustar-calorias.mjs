// Que el entrenador mueva las calorías de alguien, semana a semana.
//
// LO QUE SOSTIENE ESTO es que la política de `profiles` dice
// `puede_editar_propio(id)`: un coach ve el perfil de sus clientes pero NO
// lo escribe. La función corre con permisos propios, así que se salta esa
// política entera — y lo único que impide que sea un agujero es el
// `puede_ver` de dentro. Media prueba es intentar saltárselo.
//
// La otra mitad es la aritmética. Mover calorías no es multiplicar por un
// número: la proteína no se toca (se calcula por el peso, no por lo que se
// come) y la grasa tiene un suelo por debajo del cual deja de ser una dieta.
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
await db.exec(`update public.profiles set role='super_admin', full_name='Eduardo' where id='${ADMIN}'`);
await db.exec(`update public.profiles set role='coach', full_name='Coach' where id='${COACH}'`);
await db.exec('alter table public.profiles enable trigger trg_bloquear_escalada_de_rol');
await db.exec(`insert into public.coach_clientes (coach_id, cliente_id) values ('${COACH}','${LETY}')`);

// 2000 kcal: 150 P (600), 200 C (800), 67 G (603)
const RESET = `update public.profiles
  set full_name='Leticia', goal_protein_g=150, goal_carbs_g=200, goal_fat_g=67`;
await db.exec(`${RESET} where id='${LETY}'`);
await db.exec(`update public.profiles set full_name='Otra',
  goal_protein_g=120, goal_carbs_g=180, goal_fat_g=60 where id='${OTRA}'`);

const macros = async (id) => (await db.query(
  `select goal_protein_g p, goal_carbs_g c, goal_fat_g g,
          goal_protein_g*4 + goal_carbs_g*4 + goal_fat_g*9 as cal
     from public.profiles where id = $1`, [id])).rows[0];

// ------------------------------------------------------------------
console.log('\nBajarle 200 calorías');
{
  const antes = await macros(LETY);
  const { r, e } = await como(COACH,
    `select public.ajustar_calorias('${LETY}', 1800, 'tres semanas sin bajar') as v`);
  check('el coach puede', !e, e || '');
  if (!e) {
    const v = r.rows[0].v;
    const d = await macros(LETY);
    check('la proteína NO se movió', d.p === antes.p,
      `era ${antes.p} g y quedó ${d.p} g — se calcula por su peso, no por lo que come`);
    check('las calorías quedaron donde se pidió', Math.abs(d.cal - 1800) <= 5,
      `pedidas 1800, quedaron ${d.cal}`);
    check('y devuelve las de verdad, no las pedidas', v.cal === Number(d.cal),
      `dice ${v.cal}, hay ${d.cal}`);
    check('el recorte salió de carbos y grasas', d.c < antes.c || d.g < antes.g,
      `carbos ${antes.c}→${d.c}, grasas ${antes.g}→${d.g}`);
    console.log(`        ${antes.cal} kcal (${antes.p}P ${antes.c}C ${antes.g}G)  →  ` +
                `${d.cal} kcal (${d.p}P ${d.c}C ${d.g}G)`);
  }
}

// ------------------------------------------------------------------
console.log('\nY queda escrito quién y por qué');
{
  const { r } = await como(COACH,
    `select cal_antes, cal_despues, motivo, hecho_por from public.ajustes_calorias
      where cliente_id='${LETY}' order by creado_en desc limit 1`);
  const a = r.rows[0];
  check('con las calorías de antes y las de después', a.cal_antes === 2003 && a.cal_despues > 0,
    JSON.stringify(a));
  check('con el motivo', a.motivo === 'tres semanas sin bajar');
  check('y con quién lo hizo', a.hecho_por === COACH);

  const { r: r2 } = await como(COACH,
    `select jsonb_array_length(public.plan_metricas('${LETY}') -> 'ajustes_mano') as n,
            public.plan_metricas('${LETY}') -> 'ajustes_mano' -> 0 ->> 'quien' as quien`);
  check('y sale en su ficha, junto a los ajustes de la IA', r2.rows[0].n === 1);
  check('con el nombre de quien lo movió, no su id', r2.rows[0].quien === 'Coach');

  const { r: r3 } = await como(LETY,
    `select cal_despues, motivo from public.ajustes_calorias where cliente_id='${LETY}'`);
  check('y ELLA lo ve: son sus calorías', r3.rows.length === 1,
    'enterarse de que te cambiaron la comida sin saber quién es perder la confianza');
}

// ------------------------------------------------------------------
console.log('\nLas dos manos no se pelean');
{
  const { r } = await como(COACH, `select public.calorias_movidas_a_mano('${LETY}') as v`);
  check('el cierre del lunes puede saber que una persona ya las movió',
    r.rows[0].v && r.rows[0].v.cal_despues > 0, JSON.stringify(r.rows[0].v));

  const { r: r2 } = await como(ADMIN, `select public.calorias_movidas_a_mano('${OTRA}') as v`);
  check('y que a quien no se las movieron, no', r2.rows[0].v === null);

  // Lo de hace ocho días ya no cuenta: es la semana pasada.
  await db.exec(`update public.ajustes_calorias set creado_en = now() - interval '8 days'
                  where cliente_id = '${LETY}'`);
  const { r: r3 } = await como(COACH, `select public.calorias_movidas_a_mano('${LETY}') as v`);
  check('pero lo de hace ocho días ya no frena nada', r3.rows[0].v === null,
    'si no, un ajuste de hace un mes bloquearía el cierre para siempre');
  await db.exec(`update public.ajustes_calorias set creado_en = now() where cliente_id='${LETY}'`);
}

// ------------------------------------------------------------------
console.log('\nLos límites');
{
  await db.exec(`${RESET} where id='${LETY}'`);

  const a = await como(COACH, `select public.ajustar_calorias('${LETY}', 200, null)`);
  check('200 calorías no se aceptan', !!a.e, a.e || 'NO FALLÓ');
  const b = await como(COACH, `select public.ajustar_calorias('${LETY}', 9000, null)`);
  check('9000 tampoco', !!b.e, b.e || 'NO FALLÓ');
  check('y no se tocó nada al rechazarlas', (await macros(LETY)).cal === 2003);

  // Un recorte brutal: 150 g de proteína son 600 kcal, más del 40% de 1000.
  await como(COACH, `select public.ajustar_calorias('${LETY}', 1000, 'prueba')`);
  const d = await macros(LETY);
  check('con muy pocas calorías, la proteína cede lo justo para que quepa',
    d.p * 4 <= 1000 * 0.41 && d.p > 0, `${d.p} g = ${d.p * 4} kcal de 1000`);
  check('la grasa no baja del 20% de las calorías',
    d.g * 9 >= d.cal * 0.195, `${d.g} g = ${d.g * 9} kcal de ${d.cal}`);
  check('y los carbos nunca salen negativos', d.c >= 0, `${d.c} g`);
  console.log(`        1000 kcal  →  ${d.cal} kcal (${d.p}P ${d.c}C ${d.g}G)`);
}

// ------------------------------------------------------------------
console.log('\nY NADIE MÁS puede tocarlas');
{
  await db.exec(`${RESET} where id='${LETY}'`);

  const a = await como(LETY, `select public.ajustar_calorias('${LETY}', 3000, 'quiero comer más')`);
  check('ella no se las sube a sí misma', !!a.e, a.e || 'NO FALLÓ');
  check('y siguen donde estaban', (await macros(LETY)).cal === 2003);

  const b = await como(COACH, `select public.ajustar_calorias('${OTRA}', 1500, 'porque sí')`);
  check('un coach no toca a quien no es cliente suyo', !!b.e, b.e || 'NO FALLÓ');
  check('y esa persona sigue igual', (await macros(OTRA)).cal === 1740);

  const c = await como(LETY, `select public.calorias_movidas_a_mano('${OTRA}')`);
  check('ni mira los ajustes de una desconocida', !!c.e, c.e || 'NO FALLÓ');

  const d = await como(LETY, `insert into public.ajustes_calorias
    (cliente_id, cal_despues, p_despues, c_despues, g_despues) values ('${LETY}',3000,1,1,1)`);
  check('ni se inventa una fila de ajuste a mano', !!d.e, d.e || 'NO FALLÓ');

  // Y por el camino directo: la política de profiles.
  const e2 = await como(COACH, `update public.profiles set goal_carbs_g = 400 where id='${LETY}'`);
  const tocado = (await macros(LETY)).c !== 200;
  check('y el coach tampoco escribe el perfil por su cuenta', !tocado,
    'la función es la única puerta, y solo deja pasar tres números');
}

// ------------------------------------------------------------------
console.log('\nEl super admin sí, con todos');
{
  const a = await como(ADMIN, `select public.ajustar_calorias('${OTRA}', 1600, 'la llevo yo')`);
  check('puede con quien no es cliente de nadie', !a.e, a.e || '');
  check('y se le movieron', Math.abs((await macros(OTRA)).cal - 1600) <= 5);
}

console.log(`\n${ok} pasan · ${bad} fallan`);
process.exit(bad ? 1 : 0);
