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
                 dias_entreno=4, cardio_goal_min=150,
                 -- Su cuerpo: son las entradas de Mifflin, y de ahi sale el
                 -- tope de cordura con el que se cree o se descarta su gasto
                 -- medido. La formula vive en la app; aqui solo los datos.
                 weight_kg=80.5, height_cm=165, age=34, sexo='m',
                 aprendido_cierre='Responde mejor a subidas pequenas.'
               where id='${CLI}'`);
await db.exec(`insert into public.coach_clientes(coach_id,cliente_id) values ('${COACH}','${CLI}')`);

// Datos de las siete tablas, con fechas repartidas para que las ventanas de
// 7 y 30 dias den numeros DISTINTOS: si dieran lo mismo, la prueba pasaria
// aunque el filtro por fecha estuviera mal.
await como(CLI, `insert into public.weight_logs(user_id,log_date,weight_kg,cintura_cm) values
  ('${CLI}',current_date,80.5,86),
  ('${CLI}',current_date-8,81.4,null),
  ('${CLI}',current_date-31,83.0,89),
  -- Medio ano atras. La cintura se mide cada quince dias, asi que su
  -- ventana es un ano y esta tiene que entrar; la del peso son 90 dias y
  -- este pesaje tiene que quedarse fuera. Las dos cosas en una fila.
  ('${CLI}',current_date-200,88.0,97)`);
await como(CLI, `insert into public.diary_entries(user_id,entry_date,meal,food_name,quantity,unit,protein_g,carbs_g,fat_g) values
  ('${CLI}',current_date,  'Comida','Pollo',  200,'Gramos',60,10,8),
  ('${CLI}',current_date-2,'Cena',  'Pescado',150,'Gramos',35, 5,6),
  ('${CLI}',current_date-20,'Comida','Arroz', 200,'Gramos', 8,80,2)`);
await como(CLI, `insert into public.workout_sessions(user_id,session_date,day_name,total_volume) values
  ('${CLI}',current_date-1,'Pecho',4200), ('${CLI}',current_date-15,'Espalda',5100),
  ('${CLI}',current_date-40,'Pierna',3000)`);
// Y una CON EL DETALLE DE LAS SERIES, que es lo que hay que saber contar.
// Dos hechas de cuatro —las otras dos vienen rellenas por la rutina— y un
// ejercicio con el peso del cuerpo:
//   kg     = 2 x 10 x 60 = 1200   (las dos marcadas, no las cuatro)
//   libres = 12                   (las dominadas, que no son kilos)
await como(CLI, `insert into public.workout_sessions(user_id,session_date,day_name,total_volume,exercises)
  values ('${CLI}',current_date-2,'Full',9999,'[
    {"nombre":"Sentadilla","series":[
      {"reps":10,"peso":60,"hecho":true},{"reps":10,"peso":60,"hecho":true},
      {"reps":10,"peso":60,"hecho":false},{"reps":10,"peso":60,"hecho":false}]},
    {"nombre":"Dominadas","series":[{"reps":12,"peso":0,"hecho":true}]}
  ]'::jsonb)`);
await como(CLI, `insert into public.cardio_logs(user_id,log_date,minutes,kind) values
  ('${CLI}',current_date-2,45,'bici'), ('${CLI}',current_date-20,30,'caminata')`);
await como(CLI, `insert into public.chequeos_semanales(user_id,semana,hambre,energia,sueno) values
  ('${CLI}',current_date,3,4,4)`);
// Tres semanas CERRADAS, con lo que pide la medicion del gasto: lo que comio
// de media, su peso medio, cuantos dias apunto y cuantas veces se peso. Sin
// esto, de otra persona no hay forma de medir nada: su diario no esta en el
// telefono del entrenador.
await como(CLI, `insert into public.chequeos_semanales
    (user_id,semana,media_cal,peso_medio,dias_apuntados,dias_con_peso) values
  ('${CLI}',current_date-7, 2380,84.2,7,5),
  ('${CLI}',current_date-14,2410,84.8,6,4),
  ('${CLI}',current_date-21,2395,85.3,7,6),
  -- Y una a medias, de las que NO cuentan: tres dias apuntados no dicen lo
  -- que comio esa semana, dicen lo que comio tres dias de ella.
  ('${CLI}',current_date-28,2200,85.9,3,1)`);
await como(COACH, `insert into public.planes(user_id,nombre,comidas,activo,creado_por,cal_objetivo)
  values ('${CLI}','Plan de Ana','[{"momento":"Cena","texto":"sopa"}]'::jsonb,true,'${COACH}',2001)`);

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
  check('cuenta cuantas veces se peso en el mes', m.peso.apuntes_30 === 2,
    'el de hace 31 dias queda fuera: ' + m.peso.apuntes_30);
  check('y la ultima cintura con su fecha', Number(m.cintura.cm) === 86 && !!m.cintura.dia);

  // LA SERIE, QUE ES LO NUEVO. Antes iban `hace_7` y `hace_30`: el ultimo
  // pesaje contra el de hace una semana y contra el de hace un mes. Dos dias
  // sueltos, y el peso de un dia suelto varia dos kilos por agua y sal — si
  // el de hace siete cayo seco, la ficha decia que subio sin haber subido.
  // Ahora va la serie y la recta la hace la app, con el mismo codigo que usa
  // en las pantallas de esa persona.
  check('el peso viene como serie, no como dos extremos',
    Array.isArray(m.peso.serie) && m.peso.serie.length === 3,
    JSON.stringify(m.peso.serie));
  check('en orden, de la mas vieja a la mas nueva',
    m.peso.serie[0].d < m.peso.serie[2].d, JSON.stringify(m.peso.serie));
  check('con fecha y kilos en cada punto',
    Number(m.peso.serie[2].kg) === 80.5 && !!m.peso.serie[2].d,
    JSON.stringify(m.peso.serie));
  // El de hace 31 dias entra: la ventana de la serie son NOVENTA, no los
  // treinta de `apuntes_30`. Con un mes no hay tendencia que dibujar.
  check('y llega hasta noventa dias atras',
    m.peso.serie.some((p) => Number(p.kg) === 83.0),
    JSON.stringify(m.peso.serie));
  check('pero no mas: el de hace 200 dias se queda fuera',
    !m.peso.serie.some((p) => Number(p.kg) === 88.0),
    'quien se pesa a diario mandaria un ano de pares de numeros: ' +
    JSON.stringify(m.peso.serie));

  // Y LA CINTURA IGUAL, que antes era un numero suelto. Una cintura sola no
  // dice nada: 88 no significa nada, 91 -> 88 significa que esta perdiendo
  // grasa. Va a un ano porque se mide cada quince dias.
  check('la cintura tambien viene como serie',
    Array.isArray(m.cintura.serie) && m.cintura.serie.length === 3,
    JSON.stringify(m.cintura.serie));
  check('y solo con los dias en que se midio',
    m.cintura.serie.every((x) => x.cm != null), JSON.stringify(m.cintura.serie));
  check('y llega a un ano atras, no a noventa dias',
    m.cintura.serie.some((x) => Number(x.cm) === 97),
    'se mide cada quince dias: con noventa dias serian seis puntos y con ' +
    'seis puntos no se ve nada. ' + JSON.stringify(m.cintura.serie));
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
  check('sesiones de la semana', m.entreno.sesiones_7 === 2, JSON.stringify(m.entreno));
  check('y del mes', m.entreno.sesiones_30 === 3);
  check('cardio de la semana', m.cardio.min_7 === 45, JSON.stringify(m.cardio));
  check('y del mes', m.cardio.min_30 === 75);
  check('con sus metas', m.dias_entreno === 4 && m.meta_cardio === 150);
}

console.log('\n— El volumen, que no estaba —');
{
  const v = m.volumen || {};
  // «Subio, mantuvo o bajo» era la pregunta que no se podia contestar desde
  // la ficha: no estaba aqui, ni en la tarjeta, ni en lo que recibe la IA.
  //
  //   hace 1 dia  -> 4200 (sesion vieja, sin detalle: vale su total_volume)
  //   hace 2 dias -> 1200 kg y 12 repeticiones sin peso (con detalle)
  check('los kilos de la semana', Number(v.kg_7) === 5400, JSON.stringify(v));
  check('y los del mes', Number(v.kg_30) === 10500,
    '4200 + 1200 + los 5100 de hace 15 dias: ' + JSON.stringify(v));
  check('con el mes anterior para comparar', Number(v.kg_30_antes) === 3000,
    'la de hace 40 dias. Sin esto no hay «subio o bajo»: ' + JSON.stringify(v));

  // SOLO LAS SERIES MARCADAS. Las filas vienen rellenas con lo que dice la
  // rutina, asi que contarlas todas es contar lo que penso hacer: cuatro
  // series de 10 a 60 kg serian 2400, y solo hizo dos.
  check('y solo cuenta las series marcadas', Number(v.kg_7) !== 6600,
    'con las cuatro series saldrian 2400 en vez de 1200: ' + JSON.stringify(v));
  // Y EL `total_volume` DE ESA SESION NO SE USA: tiene detalle, asi que el
  // total guardado (9999) es el viejo, el que sumaba kilos con repeticiones.
  check('ni el total guardado cuando hay detalle', Number(v.kg_7) !== 14199,
    'teniendo las series, el total guardado sobra: ' + JSON.stringify(v));

  // LAS REPETICIONES SIN PESO, APARTE. Juntarlas con los kilos hace que
  // cambiar press de banca por dominadas se lea como un derrumbe.
  check('las repeticiones sin peso van por su lado', Number(v.libres_7) === 12,
    JSON.stringify(v));
  check('y no se cuelan en los kilos', Number(v.kg_7) === 5400,
    '5412 serian las dominadas sumadas como si fueran kilos');
}

console.log('\n— Lo que hace falta para medirle el gasto —');
{
  // El gasto medido es lo que de verdad mueve las calorias, y de otra
  // persona no se podia calcular: se saca del diario de 60 dias, que vive
  // en SU telefono. Lo que si existe son sus semanas cerradas.
  const s = m.semanas || [];
  check('vienen sus semanas guardadas', Array.isArray(s) && s.length === 4,
    JSON.stringify(s));
  check('de la mas vieja a la mas nueva',
    s.length > 1 && s[0].semana < s[s.length - 1].semana,
    'es el orden que espera la recta de la medicion');
  check('con las cuatro cosas que pide la medicion',
    s.every((x) => x.media_cal != null && x.peso_medio != null &&
                   x.dias_apuntados != null && x.dias_con_peso != null),
    JSON.stringify(s[0]));
  // La de tres dias viaja: filtrarla AQUI seria tener dos definiciones de
  // «semana completa», una en SQL y otra en la app. La app la descarta con
  // las mismas reglas que usa para las mias.
  check('la de tres dias tambien viaja, y la descarta la app',
    s.some((x) => Number(x.dias_apuntados) === 3),
    'el filtro vive en un solo sitio: ' + JSON.stringify(s.map((x) => x.dias_apuntados)));

  // Su cuerpo: las entradas de Mifflin, para el tope de cordura.
  check('y su cuerpo, para poder estimar su gasto',
    Number(m.cuerpo.peso) === 80.5 && Number(m.cuerpo.altura) === 165 &&
    Number(m.cuerpo.edad) === 34 && m.cuerpo.sexo === 'm',
    JSON.stringify(m.cuerpo));
  check('la formula NO se calcula en la base', !/tmb|mifflin/i.test(JSON.stringify(m)),
    'vive en un solo sitio de la app; calcularla aqui tambien seria tener ' +
    'dos que se separan el dia que se corrija una');

  check('y lo que el cierre del lunes aprendio de ella',
    /subidas pequenas/.test(m.aprendido || ''),
    'lo escribe el modelo cada semana y lo leia solo el propio cierre: su ' +
    'entrenador veia decisiones tomadas sin saber con que');
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
  // PARA CUANTAS CALORIAS SE ESCRIBIO. El plan es texto y no dice a que
  // apuntaba: sin esto, el dia que el cierre del lunes le mueva las calorias
  // nadie puede saber que se quedo viejo, y esa persona sigue comiendo lo de
  // antes porque su pantalla le ensena el plan, no sus calorias.
  check('y para cuantas calorias se escribio',
    Number(m.plan.cal_objetivo) === 2001, JSON.stringify(m.plan));
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
