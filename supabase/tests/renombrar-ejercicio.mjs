// Renombrar un ejercicio sin perder lo que lleva detrás.
//
// El nombre de un ejercicio no se podía cambiar: la tarjeta lo pinta como
// texto pelado y para corregir una falta había que borrarlo y volver a
// crearlo. Y hacerlo «bien» —un campo editable que guarda
// `routine_exercises.name`— habría sido PEOR que no tenerlo, porque del
// nombre cuelgan tres cosas en tres sitios:
//
//   · la rutina, que puede tener el mismo ejercicio en varios días
//   · el historial, DENTRO del JSON de cada sesión ya guardada, que es de
//     donde sale `HISTORIAL[nombre]` y por tanto la gráfica de progreso
//   · la nota, con su `unique (user_id, exercise_name)`
//
// Cambiar solo la rutina deja la nota huérfana y PARTE LA GRÁFICA: meses
// de progresión se quedan colgando de un nombre que ya no existe en
// ninguna pantalla. Quien renombra quiere arreglar una falta, no empezar
// de cero.
//
// Por eso va en una función: o se mueven las tres o no se mueve ninguna.
//
// SE PRUEBA CONTRA POSTGRES DE VERDAD (PGlite), con las migraciones
// aplicadas en orden, porque lo delicado es SQL: reescribir un array de
// jsonb conservando el orden, y el único de las notas.

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const MIG = join(AQUI, '..', 'migrations');

const db = await PGlite.create();
await db.exec(readFileSync(join(AQUI, 'bootstrap.sql'), 'utf8'));
for (const f of readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort())
  await db.exec(readFileSync(join(MIG, f), 'utf8'));

let ok = 0, bad = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { bad++; console.log(`  FALLA ${n}${extra ? '\n        ' + extra : ''}`); }
};

const YO = '77777777-7777-7777-7777-777777777777';
const OTRA = '88888888-8888-8888-8888-888888888888';
for (const [u, c] of [[YO, 'eva'], [OTRA, 'ana']])
  await db.exec(`insert into auth.users (id, email)
                 values ('${u}', '${c}@ejemplo.com') on conflict do nothing;`);

const entrar = (u) => db.exec(`select set_config('request.jwt.claim.sub','${u}',false)`);
const uno = async (sql) => (await db.query(sql)).rows[0];
const intentar = async (sql) => {
  try { return { ok: true, fila: (await db.query(sql)).rows[0] }; }
  catch (e) { return { ok: false, error: e.message }; }
};

let ronda = 0;
async function sembrar(u, nombre, opciones = {}) {
  ronda++;
  const h = (p, n) => `${p}${String(ronda).padStart(4, '0')}-0000-0000-${String(n).padStart(12, '0')}`;
  const dia = h('11111111-', 1);
  await db.exec(`insert into public.routine_days (id, user_id, name, sort_order)
                 values ('${dia}','${u}','Empuje',0);`);
  await db.exec(`insert into public.routine_exercises (id, user_id, routine_day_id, name, sort_order)
                 values ('${h('22222222-', 1)}','${u}','${dia}','${nombre}',0);`);
  if (opciones.enDosDias) {
    const dia2 = h('11111111-', 2);
    await db.exec(`insert into public.routine_days (id, user_id, name, sort_order)
                   values ('${dia2}','${u}','Tiron',1);`);
    await db.exec(`insert into public.routine_exercises (id, user_id, routine_day_id, name, sort_order)
                   values ('${h('22222222-', 2)}','${u}','${dia2}','${nombre}',0);`);
  }
  if (opciones.archivado) {
    await db.exec(`insert into public.routine_exercises
                     (id, user_id, routine_day_id, name, sort_order, archivado_en)
                   values ('${h('22222222-', 9)}','${u}','${dia}','${nombre}',9, now());`);
  }
  return h;
}

const renombrar = (a, b) =>
  uno(`select public.renombrar_ejercicio('${a}','${b}') as r`);

// ------------------------------------------------------------------
console.log('\nLa rutina cambia de nombre, en todos los días donde esté');
{
  await entrar(YO);
  await sembrar(YO, 'Sentadilla con barra', { enDosDias: true, archivado: true });
  const r = await renombrar('Sentadilla con barra', 'Sentadilla trasera');
  check('dice cuántas filas de rutina movió', r.r.rutina === 2,
        'movió ' + r.r.rutina + ': el mismo ejercicio puede ir el lunes y el jueves');

  const quedan = await uno(`select
      count(*) filter (where name = 'Sentadilla trasera' and archivado_en is null) as nuevas,
      count(*) filter (where name = 'Sentadilla con barra' and archivado_en is null) as viejas,
      count(*) filter (where name = 'Sentadilla con barra' and archivado_en is not null) as archivadas
    from public.routine_exercises where user_id = '${YO}'`);
  check('las vivas llevan el nombre nuevo',
        Number(quedan.nuevas) === 2 && Number(quedan.viejas) === 0);
  check('y la archivada se queda como estaba', Number(quedan.archivadas) === 1,
        'una archivada está borrada para quien la mira: reescribir algo que ' +
        'la persona ya quitó sorprende más que dejarlo');
}

// ------------------------------------------------------------------
console.log('\nY el historial, que es lo que de verdad se perdería');
{
  await entrar(YO);
  const h = await sembrar(YO, 'Press banca');
  // Dos sesiones, y en una el ejercicio NO va solo: el orden importa.
  await db.exec(`insert into public.workout_sessions (id, user_id, session_date, exercises, total_volume)
    values ('${h('44444444-', 1)}','${YO}','2026-10-01',
      '[{"nombre":"Press banca","volumen":500}]'::jsonb, 500),
           ('${h('44444444-', 2)}','${YO}','2026-10-08',
      '[{"nombre":"Dominadas","volumen":100},{"nombre":"Press banca","volumen":600},{"nombre":"Fondos","volumen":200}]'::jsonb, 900);`);

  const r = await renombrar('Press banca', 'Press de banca');
  check('dice cuántas sesiones tocó', r.r.sesiones === 2, 'tocó ' + r.r.sesiones);

  const s = await uno(`select
      count(*) filter (where exercises @> '[{"nombre":"Press de banca"}]') as nuevas,
      count(*) filter (where exercises @> '[{"nombre":"Press banca"}]') as viejas
    from public.workout_sessions where user_id = '${YO}'`);
  check('ninguna sesión conserva el nombre viejo',
        Number(s.nuevas) === 2 && Number(s.viejas) === 0,
        'si queda una, la gráfica se parte: media progresión cuelga de un ' +
        'nombre que ya no existe en ninguna pantalla');

  const orden = await uno(`select exercises->0->>'nombre' as a,
                                  exercises->1->>'nombre' as b,
                                  exercises->2->>'nombre' as c
                             from public.workout_sessions
                            where user_id = '${YO}' and session_date = '2026-10-08'`);
  check('y los ejercicios de la sesión siguen en su orden',
        orden.a === 'Dominadas' && orden.b === 'Press de banca' && orden.c === 'Fondos',
        'salió ' + JSON.stringify(orden) + ': `jsonb_agg` sin `order by` puede ' +
        'devolverlos barajados y la sesión dejaría de contar lo que pasó');

  const resto = await uno(`select exercises->1->>'volumen' as v
                             from public.workout_sessions
                            where user_id = '${YO}' and session_date = '2026-10-08'`);
  check('y lo demás de cada ejercicio se queda', resto.v === '600',
        'se reescribe el nombre, no el ejercicio');
}

// ------------------------------------------------------------------
console.log('\nLa nota se va con él');
{
  await entrar(YO);
  await sembrar(YO, 'Remo con barra');
  await db.exec(`insert into public.exercise_notes (user_id, exercise_name, body)
                 values ('${YO}','Remo con barra','Codos pegados');`);
  const r = await renombrar('Remo con barra', 'Remo pendlay');
  check('dice que había nota', r.r.nota === true);
  const n = await uno(`select
      max(body) filter (where exercise_name = 'Remo pendlay') as nueva,
      count(*) filter (where exercise_name = 'Remo con barra') as vieja
    from public.exercise_notes where user_id = '${YO}'`);
  check('y viaja entera', n.nueva === 'Codos pegados' && Number(n.vieja) === 0);
}

// ------------------------------------------------------------------
console.log('\nY si las DOS tenían nota, se juntan en vez de elegir');
{
  await entrar(YO);
  await sembrar(YO, 'Curl mancuerna');
  await db.exec(`insert into public.exercise_notes (user_id, exercise_name, body)
                 values ('${YO}','Curl mancuerna','Sin balanceo'),
                        ('${YO}','Curl con mancuerna','Codo quieto');`);
  // Unir dos nombres del mismo ejercicio es justo para lo que se renombra.
  await renombrar('Curl mancuerna', 'Curl con mancuerna');
  const n = await uno(`select
      max(body) filter (where exercise_name = 'Curl con mancuerna') as queda,
      count(*) as cuantas
    from public.exercise_notes where user_id = '${YO}' and exercise_name like 'Curl%'`);
  check('no se pierde ninguna de las dos',
        /Codo quieto/.test(n.queda) && /Sin balanceo/.test(n.queda),
        'quedó «' + n.queda + '»: quedarse con una borra en silencio algo ' +
        'que la persona escribió a mano, y eso no se deshace desde la app');
  check('y queda una sola fila', Number(n.cuantas) === 1,
        'si sobrevive la vieja, queda una nota colgando de un nombre que ya no existe');
}

// ------------------------------------------------------------------
console.log('\nLo de otra persona no se toca');
{
  await entrar(OTRA);
  const h = await sembrar(OTRA, 'Zancadas');
  await db.exec(`insert into public.workout_sessions (id, user_id, session_date, exercises, total_volume)
    values ('${h('44444444-', 1)}','${OTRA}','2026-10-02',
            '[{"nombre":"Zancadas","volumen":300}]'::jsonb, 300);`);
  await entrar(YO);
  await sembrar(YO, 'Zancadas');
  const r = await renombrar('Zancadas', 'Zancadas con mancuernas');

  check('solo cuenta las propias', r.r.rutina === 1 && r.r.sesiones === 0,
        'rutina=' + r.r.rutina + ' sesiones=' + r.r.sesiones);
  const suyo = await uno(`select
      count(*) filter (where name = 'Zancadas') as intactas
    from public.routine_exercises where user_id = '${OTRA}'`);
  check('y la de ella sigue llamándose igual', Number(suyo.intactas) === 1,
        'la función es SECURITY DEFINER: se salta RLS, así que el filtro por ' +
        'usuario es lo ÚNICO que separa una rutina de la otra');
  const suHist = await uno(`select count(*) as n from public.workout_sessions
                             where user_id = '${OTRA}'
                               and exercises @> '[{"nombre":"Zancadas"}]'`);
  check('y su historial tampoco se movió', Number(suHist.n) === 1);
}

// ------------------------------------------------------------------
console.log('\nY lo que no se puede pedir');
{
  await entrar(YO);
  await sembrar(YO, 'Peso muerto');

  const vacio = await intentar(`select public.renombrar_ejercicio('Peso muerto','   ') as r`);
  check('un nombre en blanco se rechaza', !vacio.ok,
        'un nombre vacío dejaría el ejercicio sin forma de encontrarlo');

  const largo = await intentar(
    `select public.renombrar_ejercicio('Peso muerto','${'x'.repeat(81)}') as r`);
  check('y uno larguísimo también', !largo.ok,
        'sin tope, un nombre de mil letras se cuela en el JSON de TODAS las sesiones');

  const igual = await renombrar('Peso muerto', 'Peso muerto');
  check('y el mismo nombre no es un error, no hace nada',
        igual.r.rutina === 0 && igual.r.sesiones === 0,
        'es lo que pasa cuando alguien abre el campo, no cambia nada y acepta');

  await db.exec(`select set_config('request.jwt.claim.sub','',false)`);
  const sinSesion = await intentar(`select public.renombrar_ejercicio('Peso muerto','Otro') as r`);
  check('y sin sesión no se renombra nada', !sinSesion.ok,
        'sin esto, la función se salta RLS y cualquiera renombra lo de cualquiera');
}

console.log(`\n${ok} pasan · ${bad} fallan`);
process.exit(bad ? 1 : 0);
