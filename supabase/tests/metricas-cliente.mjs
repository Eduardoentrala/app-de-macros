// Las metricas de un cliente, para que el entrenador vea como va.
//
// LO QUE MAS IMPORTA AQUI ES LA PUERTA
//
// `plan_metricas` es SECURITY DEFINER: corre saltandose el RLS, porque tiene
// que leer siete tablas de OTRA persona. Todo lo que impide que sea una fuga
// es la llamada a `puede_ver` de la primera linea. Con solo saber un uuid,
// sin esa comprobacion, cualquiera leeria el peso, la comida y los
// entrenamientos de cualquiera.
//
// Por eso la mitad de esta prueba es intentar sacarla por donde no debe.
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

const COACH = '22222222-2222-2222-2222-222222222222';
const CLI   = '33333333-3333-3333-3333-333333333333';
const OTRO  = '44444444-4444-4444-4444-444444444444';   // coach de nadie
const ADMIN = '11111111-1111-1111-1111-111111111111';
for (const [k, id] of [['coach', COACH], ['cli', CLI], ['otro', OTRO], ['admin', ADMIN]])
  await db.exec(`insert into auth.users(id,email) values ('${id}','${k}@x.com')`);
await db.exec('alter table public.profiles disable trigger trg_bloquear_escalada_de_rol');
await db.exec(`update public.profiles set role='coach' where id in ('${COACH}','${OTRO}')`);
await db.exec(`update public.profiles set role='super_admin' where id='${ADMIN}'`);
await db.exec('alter table public.profiles enable trigger trg_bloquear_escalada_de_rol');
await db.exec(`update public.profiles set full_name='Ana', goal='bajar',
                 dias_entreno=4, cardio_goal_min=150 where id='${CLI}'`);
await db.exec(`insert into public.coach_clientes(coach_id,cliente_id) values ('${COACH}','${CLI}')`);

// Datos de las siete tablas, con fechas repartidas para que las ventanas de
// 7 y 30 dias den numeros DISTINTOS: si dieran lo mismo, la prueba pasaria
// aunque el filtro por fecha estuviera mal.
await como(CLI, `insert into public.weight_logs(user_id,log_date,weight_kg,cintura_cm) values
  ('${CLI}',current_date,80.5,86),
  ('${CLI}',current_date-8,81.4,null),
  ('${CLI}',current_date-31,83.0,89)`);
await como(CLI, `insert into public.diary_entries(user_id,entry_date,meal,food_name,quantity,unit,protein_g,carbs_g,fat_g) values
  ('${CLI}',current_date,  'Comida','Pollo',  200,'Gramos',60,10,8),
  ('${CLI}',current_date-2,'Cena',  'Pescado',150,'Gramos',35, 5,6),
  ('${CLI}',current_date-20,'Comida','Arroz', 200,'Gramos', 8,80,2)`);
await como(CLI, `insert into public.workout_sessions(user_id,session_date,day_name,total_volume) values
  ('${CLI}',current_date-1,'Pecho',4200), ('${CLI}',current_date-15,'Espalda',5100)`);
await como(CLI, `insert into public.cardio_logs(user_id,log_date,minutes,kind) values
  ('${CLI}',current_date-2,45,'bici'), ('${CLI}',current_date-20,30,'caminata')`);
await como(CLI, `insert into public.chequeos_semanales(user_id,semana,hambre,energia,sueno) values
  ('${CLI}',current_date,3,4,4)`);
await como(COACH, `insert into public.planes(user_id,nombre,comidas,activo,creado_por)
  values ('${CLI}','Plan de Ana','[{"momento":"Cena","texto":"sopa"}]'::jsonb,true,'${COACH}')`);

const m = (await como(COACH, `select public.plan_metricas('${CLI}') j`)).r.rows[0].j;

console.log('\n— Quien puede pedirlas —');
{
  check('su entrenador si', !!m);
  check('el super admin tambien', (await como(ADMIN, `select public.plan_metricas('${CLI}')`)).e === null);
  // ESTO ES LO QUE NO PUEDE FALLAR NUNCA.
  const ajeno = await como(OTRO, `select public.plan_metricas('${CLI}')`);
  check('un entrenador que no es el suyo NO', ajeno.e !== null,
    'leeria el peso y la comida de alguien que no lleva');
  const solo = await como(CLI, `select public.plan_metricas('${COACH}')`);
  check('y un cliente no puede pedir las de otro', solo.e !== null);
}

console.log('\n— Peso y cintura —');
{
  check('trae el ultimo peso', Number(m.peso.ultimo) === 80.5, JSON.stringify(m.peso));
  // Los dos extremos de cada ventana, no un solo numero: el peso de un dia
  // suelto varia dos kilos por agua y no dice nada.
  check('y el de hace una semana', Number(m.peso.hace_7) === 81.4);
  check('y el de hace un mes', Number(m.peso.hace_30) === 83.0);
  check('cuenta cuantas veces se peso en el mes', m.peso.apuntes_30 === 2,
    'el de hace 31 dias queda fuera: ' + m.peso.apuntes_30);
  check('y la ultima cintura con su fecha', Number(m.cintura.cm) === 86 && !!m.cintura.dia);
}

console.log('\n— Adherencia —');
{
  // Apuntar es la senal mas honesta: quien deja de apuntar suele haber
  // dejado el plan una semana antes.
  check('dias apuntados en la semana', m.diario.dias_7 === 2, JSON.stringify(m.diario));
  check('y en el mes', m.diario.dias_30 === 3);
  check('con la fecha del ultimo', !!m.diario.ultimo);
  // Media por DIA APUNTADO, no entre 7: dividir entre los dias del
  // calendario cuando solo apunto dos da una media falsa de la mitad.
  const cal7 = (60*4+10*4+8*9) + (35*4+5*4+6*9);
  check('las calorias son la media por dia apuntado',
    Number(m.diario.cal_dia_7) === Math.round(cal7 / 2),
    `esperaba ${Math.round(cal7/2)}, vino ${m.diario.cal_dia_7}`);
  check('y la media del mes es distinta', m.diario.cal_dia_30 !== m.diario.cal_dia_7,
    'si fueran iguales, el filtro por fecha no estaria haciendo nada');
  check('trae tambien la proteina', Number(m.diario.prot_dia_7) === Math.round((60+35)/2));
  check('y las metas contra las que compararlo', m.meta_cal === 2315 && m.meta_p === 170,
    JSON.stringify({ cal: m.meta_cal, p: m.meta_p }));
}

console.log('\n— Entrenamiento —');
{
  check('sesiones de la semana', m.entreno.sesiones_7 === 1, JSON.stringify(m.entreno));
  check('y del mes', m.entreno.sesiones_30 === 2);
  check('cardio de la semana', m.cardio.min_7 === 45, JSON.stringify(m.cardio));
  check('y del mes', m.cardio.min_30 === 75);
  check('con sus metas', m.dias_entreno === 4 && m.meta_cardio === 150);
}

console.log('\n— Fotos, chequeo y plan —');
{
  // De las fotos solo el RECUENTO. Ni rutas ni nada que permita mirarlas:
  // las fotos tienen su propio permiso y esto lo lee un entrenador.
  const txt = JSON.stringify(m.fotos);
  check('de las fotos solo se cuenta', !/storage_path|http|\.jpg/i.test(txt), txt);
  check('el chequeo trae como se siente',
    m.chequeo.hambre === 3 && m.chequeo.energia === 4 && m.chequeo.sueno === 4);
  check('y su plan, con cuantas comidas tiene',
    m.plan.nombre === 'Plan de Ana' && m.plan.comidas === 1, JSON.stringify(m.plan));
}

console.log('\n— Donde se guarda lo que escribe la IA —');
{
  const g = await como(COACH, `insert into public.analisis_cliente(cliente_id,pedido_por,mensaje,datos)
    values ('${CLI}','${COACH}','Va bien, bajo 2.5 kg en el mes.','{"x":1}'::jsonb)`);
  check('el entrenador puede guardarlo', g.e === null, g.e ?? '');
  check('y volver a leerlo sin pagar otra consulta',
    (await como(COACH, `select mensaje from public.analisis_cliente where cliente_id='${CLI}'`)).r.rows.length === 1);

  // Son notas de trabajo del entrenador, escritas SOBRE alguien y no PARA
  // alguien. Si el cliente las leyera, cambiaria lo que la IA puede decir.
  check('el cliente NO lo ve',
    (await como(CLI, `select mensaje from public.analisis_cliente`)).r.rows.length === 0,
    'son notas entre profesionales, con ese tono');
  check('ni un entrenador ajeno',
    (await como(OTRO, `select mensaje from public.analisis_cliente`)).r.rows.length === 0);
  check('y nadie se lo escribe a si mismo',
    (await como(CLI, `insert into public.analisis_cliente(cliente_id,pedido_por,mensaje)
                      values ('${CLI}','${CLI}','me va genial')`)).e !== null);
}

console.log(`\n${ok} pasan · ${bad} fallan`);
process.exit(bad ? 1 : 0);
