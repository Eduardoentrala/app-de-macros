// El historial de semanas se limpia solo a los doce meses.
//
// Se guarda un resumen por semana para poder mirar atrás. Doce meses son
// cincuenta y dos filas por persona: nada. Pero sin límite eso crece para
// siempre, y guardar indefinidamente lo que come y pesa alguien no se
// sostiene ni aunque ocupe poco.
//
// La limpieza va en un disparador AL ESCRIBIR y no en un programador de
// tareas: `pg_cron` no está en todos los planes, y además así a quien deja
// de usar la app no se le vacía el historial mientras no está.
//
// LAS DOS COSAS QUE PUEDEN SALIR MAL, y por eso esta prueba:
//
//   · Que borre lo de TODOS. `delete ... where semana < ...` sin el
//     `user_id = new.user_id` hace que el lunes de cualquiera se lleve por
//     delante el historial del resto. No se nota hasta que ya pasó.
//
//   · Que no salte al REPETIR. La app escribe con `on_conflict` +
//     `merge-duplicates`, o sea `insert ... on conflict do update`.
//     Contestar dos veces el mismo lunes entra por la rama del update: con
//     el disparador solo en `insert`, a quien repite no se le limpia nunca.
//
// Se ejecuta contra Postgres de verdad (PGlite), con las migraciones tal y
// como se van a aplicar.

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

const ANA = '11111111-1111-1111-1111-111111111111';
const BETO = '22222222-2222-2222-2222-222222222222';

await db.exec(`
  insert into auth.users (id, email) values
    ('${ANA}',  'ana@ejemplo.com'),
    ('${BETO}', 'beto@ejemplo.com')
  on conflict do nothing;
`);

// Se escribe SIN sesión, como el dueño de la base: aquí no se está probando
// quién puede escribir —eso ya lo cubren las políticas de la 0024— sino qué
// hace el disparador.
const meter = (quien, hace) => db.exec(
  `insert into public.chequeos_semanales (user_id, semana, hambre)
   values ('${quien}', (current_date - interval '${hace}')::date, 3)
   on conflict (user_id, semana) do update set hambre = excluded.hambre;`);

// PARA MONTAR EL ESCENARIO HAY QUE APAGAR EL DISPARADOR.
//
// Es un `after insert`, así que meter una fila vieja la borra en ese mismo
// insert: cuando la limpieza corre, la fila recién puesta ya está en la
// tabla y cumple la condición. En la app real da igual —solo se escribe la
// semana en curso— pero aquí impide dejar historial viejo para luego
// comprobar que una escritura posterior se lo lleva.
//
// Sin esto la primera versión de esta prueba PASABA SIN PROBAR NADA: las
// filas viejas desaparecían solas al ponerlas, quedaban las tres recientes,
// y el recuento cuadraba por el motivo equivocado.
const sembrar = async (quien, hace) => {
  await db.exec('alter table public.chequeos_semanales disable trigger chequeos_limpiar;');
  await meter(quien, hace);
  await db.exec('alter table public.chequeos_semanales enable trigger chequeos_limpiar;');
};

const cuantas = async (quien) =>
  Number((await db.query(
    `select count(*)::int as n from public.chequeos_semanales where user_id = '${quien}'`
  )).rows[0].n);

const semanas = async (quien) =>
  (await db.query(
    `select semana::text from public.chequeos_semanales
      where user_id = '${quien}' order by semana`)).rows.map((r) => r.semana);

// ------------------------------------------------------------------
console.log('\nLo viejo se va, lo de dentro de doce meses se queda');
{
  await sembrar(ANA, '20 months');    // fuera
  await sembrar(ANA, '14 months');   // fuera
  await sembrar(ANA, '11 months');   // dentro, por poco
  await sembrar(ANA, '3 months');    // dentro
  // Sembradas con el disparador apagado: las cuatro siguen ahí, dos de
  // ellas viejas. La quinta escritura es la que tiene que barrerlas.
  check('el escenario está montado', await cuantas(ANA) === 4,
        'hay ' + (await cuantas(ANA)) + ': si no son cuatro, lo de abajo no ' +
        'prueba que la limpieza se lleve nada');

  await meter(ANA, '7 days');        // ESTA escritura es la que limpia

  const q = await semanas(ANA);
  check('quedan tres semanas', q.length === 3, 'quedan ' + q.length + ': ' + q.join(', '));

  const hoy = new Date();
  const hace12 = new Date(hoy); hace12.setMonth(hace12.getMonth() - 12);
  check('y ninguna es de hace más de doce meses',
        q.every((s) => new Date(s + 'T12:00:00') >= hace12),
        'sobrevivió algo viejo: ' + q.join(', '));
  check('la de hace once meses sigue ahí',
        q.some((s) => {
          const d = new Date(s + 'T12:00:00');
          const m = (hoy - d) / (1000 * 60 * 60 * 24 * 30.4);
          return m > 10 && m < 12;
        }),
        'se llevó por delante una que estaba dentro del año: ' + q.join(', '));
}

// ------------------------------------------------------------------
console.log('\nY solo toca a quien está escribiendo');
{
  await sembrar(BETO, '20 months');
  await sembrar(BETO, '18 months');
  check('Beto tiene dos semanas viejas', await cuantas(BETO) === 2);

  // Ana escribe. Lo de Beto no es asunto suyo.
  await meter(ANA, '1 day');
  check('el lunes de Ana no toca el historial de Beto',
        await cuantas(BETO) === 2,
        'le quedan ' + (await cuantas(BETO)) + ': el delete no filtra por ' +
        'persona y el chequeo de cualquiera limpia el de todos');

  // Y cuando Beto escribe, se limpia el suyo y solo el suyo.
  const antesAna = await cuantas(ANA);
  await meter(BETO, '2 days');
  check('y al escribir Beto sí se limpia el suyo', await cuantas(BETO) === 1,
        'le quedan ' + (await cuantas(BETO)));
  check('sin tocar el de Ana', await cuantas(ANA) === antesAna);
}

// ------------------------------------------------------------------
console.log('\nY salta también al contestar dos veces el mismo lunes');
{
  const CARLA = '33333333-3333-3333-3333-333333333333';
  await db.exec(`insert into auth.users (id, email)
                 values ('${CARLA}', 'carla@ejemplo.com') on conflict do nothing;`);

  await sembrar(CARLA, '30 months');
  // Se comprueba que la de arriba entró: si el disparador la borrase a ella
  // misma, el resto de esta sección probaría el vacío.
  check('la vieja de Carla está puesta', await cuantas(CARLA) === 1);

  // Ahora escribe una semana que YA EXISTE, para entrar por la rama del
  // update y no por la del insert.
  //
  // Esta fila TAMBIEN se siembra con el disparador apagado, y es la parte
  // que se me habia pasado: si se mete con un insert normal, ese insert ya
  // limpia lo viejo y el update de despues no tiene nada que barrer. La
  // prueba pasaba con el disparador puesto solo en `insert`, que es justo
  // el fallo que queria cazar. Lo enseño una mutacion.
  await sembrar(CARLA, '0 days');
  const tras = await cuantas(CARLA);
  check('con la semana en curso ya puesta, siguen siendo dos', tras === 2,
        'hay ' + tras + ': el escenario no deja al update como unica ocasion ' +
        'de limpiar y esta seccion no prueba lo que cree');
  await db.exec(`
    insert into public.chequeos_semanales (user_id, semana, hambre)
    values ('${CARLA}', current_date, 5)
    on conflict (user_id, semana) do update set hambre = excluded.hambre;`);

  check('repetir el chequeo entra por el update',
        Number((await db.query(
          `select hambre from public.chequeos_semanales
            where user_id = '${CARLA}' and semana = current_date`)).rows[0].hambre) === 5,
        'no se actualizó: esta sección no está probando lo que cree');
  check('y la limpieza salta igual', await cuantas(CARLA) === 1,
        'quedan ' + (await cuantas(CARLA)) + ' (antes del update había ' + tras +
        '): el disparador solo está en insert y a quien repite no se le limpia');
}

// ------------------------------------------------------------------
console.log('\nY las columnas nuevas aguantan lo que se les va a meter');
{
  const val = async (sql) => {
    try { await db.exec(sql); return 'entra'; } catch (e) { return 'rechaza'; }
  };
  const DANI = '44444444-4444-4444-4444-444444444444';
  await db.exec(`insert into auth.users (id, email)
                 values ('${DANI}', 'dani@ejemplo.com') on conflict do nothing;`);

  check('una semana normal entra entera',
        await val(`insert into public.chequeos_semanales
          (user_id, semana, dias_apuntados, media_cal, media_p, media_c, media_g,
           meta_p, meta_c, meta_g, peso_medio, peso_medio_antes,
           volumen, volumen_antes, sesiones, cintura)
          values ('${DANI}', current_date, 7, 2380, 120, 200, 70,
                  170, 240, 75, 84.3, 84.7, 21500, 20100, 4, 88.5)`) === 'entra');

  check('ocho días apuntados no',
        await val(`insert into public.chequeos_semanales (user_id, semana, dias_apuntados)
                   values ('${DANI}', current_date - 7, 8)`) === 'rechaza',
        'la semana tiene siete días; un ocho es un error de cuenta en la app');

  check('ni un volumen negativo',
        await val(`insert into public.chequeos_semanales (user_id, semana, volumen)
                   values ('${DANI}', current_date - 14, -5)`) === 'rechaza');

  check('ni un peso de tres cifras largas',
        await val(`insert into public.chequeos_semanales (user_id, semana, peso_medio)
                   values ('${DANI}', current_date - 21, 999.9)`) === 'rechaza');

  // Y lo importante para las filas que ya existen: todo puede faltar.
  check('una semana sin ninguno de los datos nuevos sigue entrando',
        await val(`insert into public.chequeos_semanales (user_id, semana, hambre)
                   values ('${DANI}', current_date - 28, 3)`) === 'entra',
        'las filas de antes no tienen estos datos y no se pueden romper');

  // Y se leen como HUECO, no como cero. Un `not null default 0` tambien
  // dejaria entrar la fila, pero diria que esa semana comio cero gramos de
  // proteina en vez de decir que no se sabe: en la pantalla salen 0 % donde
  // tiene que salir un guion. Sin esta comprobacion la mutacion escapaba.
  const hueca = (await db.query(
    `select media_p, media_cal, peso_medio, volumen, dias_apuntados
       from public.chequeos_semanales
      where user_id = '${DANI}' and semana = current_date - 28`)).rows[0];
  check('y sus datos nuevos se leen como hueco, no como cero',
        Object.values(hueca).every((v) => v === null),
        'salio ' + JSON.stringify(hueca) + ': un cero se pinta como 0 % y ' +
        'parece un dato real');
}

console.log(`\n${ok} bien, ${bad} mal`);
process.exit(bad ? 1 : 0);
