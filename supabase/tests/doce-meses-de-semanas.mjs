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

// ------------------------------------------------------------------
//  Y LO QUE LA APP MANDA DE VERDAD, METIDO EN POSTGRES DE VERDAD.
//
//  Las dos mitades de esto viven en sitios distintos —los `check` aquí y el
//  acotado en `fotoDeLaSemana()`— y nada obliga a que coincidan. Comprobar
//  cada lado por su cuenta deja el hueco justo en medio: que un rango se
//  cambie aquí y no allí. Así que se coge la salida de la función de la app,
//  con datos hostiles, y se INSERTA. Si Postgres la acepta, coinciden.
//
//  Importa porque la foto viaja en la misma fila que la nota y la decisión:
//  un valor de más y se pierde el chequeo entero.
console.log('\nLo que la app manda cabe en la tabla, con datos hostiles');
{
  const { readFileSync: leer } = await import('node:fs');
  const APP = leer(join(AQUI, '..', '..', 'docs', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
  const cuerpoDe = (cab) => {
    const i = APP.indexOf(cab);
    let n = 0, j = APP.indexOf('{', i);
    for (; j < APP.length; j++) {
      if (APP[j] === '{') n++;
      else if (APP[j] === '}') { n--; if (!n) return APP.slice(i, j + 1); }
    }
  };
  const isoDe = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
                       '-' + String(d.getDate()).padStart(2, '0');
  const hacerFoto = new Function('anclaSemana', 'isoDe', 'CINTURAS', 'Date',
    cuerpoDe('function fotoDeLaSemana(d, sem, ent){') + '; return fotoDeLaSemana;')(
      new Date('2026-08-25T12:00:00'), isoDe, [{ fecha: '2026-08-20', cm: 9 }], Date);

  // Todo disparatado a la vez: un peso de 900, 28 sesiones, macros absurdos.
  const foto = hacerFoto(
    { dias_apuntados: 99, media_cal: 99000, media_p: 99999, media_c: -1,
      media_g: 99999, meta_p: 9999, meta_c: -3, meta_g: 99999 },
    [{ peso_medio: 900 }, { peso_medio: -2 }],
    { sesiones: 999, volumen: 50000, volumen_antes: 40000 });

  const EVA = '55555555-5555-5555-5555-555555555555';
  await db.exec(`insert into auth.users (id, email)
                 values ('${EVA}', 'eva@ejemplo.com') on conflict do nothing;`);

  const cols = Object.keys(foto);
  const vals = cols.map((k) => (foto[k] == null ? 'null' : String(foto[k])));
  let entro = true, porque = '';
  try {
    await db.exec(
      `insert into public.chequeos_semanales
         (user_id, semana, nota, ajusto, ${cols.join(',')})
       values ('${EVA}', current_date, 'mi nota de la semana', false, ${vals.join(',')});`);
  } catch (e) { entro = false; porque = e.message; }

  check('la fila entra con todo fuera de rango', entro,
        porque + '\n        con datos así se pierde el chequeo ENTERO: la nota, ' +
        'el motivo y la decisión, no solo el número raro');

  // Y lo que de verdad importaba sigue guardado.
  if (entro) {
    const f = (await db.query(
      `select nota, peso_medio, sesiones from public.chequeos_semanales
        where user_id = '${EVA}'`)).rows[0];
    check('y la nota se guardó', f.nota === 'mi nota de la semana');
    check('con los números raros fuera', f.peso_medio === null && f.sesiones === null,
          'peso_medio=' + f.peso_medio + ' sesiones=' + f.sesiones);
  }

  // Y una semana normal entra ENTERA, no recortada de más.
  const buena = hacerFoto(
    { dias_apuntados: 7, media_cal: 2380, media_p: 120, media_c: 200, media_g: 70,
      meta_p: 170, meta_c: 240, meta_g: 75 },
    [{ peso_medio: 84.7 }, { peso_medio: 84.3 }],
    { sesiones: 4, volumen: 21500, volumen_antes: 20100 });
  const c2 = Object.keys(buena);
  const v2 = c2.map((k) => (buena[k] == null ? 'null' : String(buena[k])));
  let entro2 = true, porque2 = '';
  try {
    await db.exec(`insert into public.chequeos_semanales
                     (user_id, semana, ${c2.join(',')})
                   values ('${EVA}', current_date - 7, ${v2.join(',')});`);
  } catch (e) { entro2 = false; porque2 = e.message; }
  check('y una semana normal entra entera', entro2, porque2);
  if (entro2) {
    const f = (await db.query(
      `select peso_medio, media_p, sesiones from public.chequeos_semanales
        where user_id = '${EVA}' and semana = current_date - 7`)).rows[0];
    check('sin recortarle nada',
          Number(f.peso_medio) === 84.3 && f.media_p === 120 && f.sesiones === 4,
          JSON.stringify(f) + ': el acotado no puede comerse los datos buenos');
  }
}

console.log(`\n${ok} bien, ${bad} mal`);
process.exit(bad ? 1 : 0);
