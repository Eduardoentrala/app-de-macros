// Borrar una serie del medio podía chocar contra el índice único.
//
// `exercise_sets` tiene `unique (routine_exercise_id, sort_order)`, y al
// guardar la rutina el orden se recalcula desde la pantalla: 1, 2, 3…
// siempre seguido. Así que borrar una serie RENUMERA las de abajo.
//
// Y las escrituras salían todas a la vez —`Promise.all(borradas.concat(
// guardadas))`—, así que había dos carreras:
//
//   BORRADO CONTRA ACTUALIZACIÓN. Se borra la serie 1 y la 2 pasa a ser 1.
//   Si el UPDATE llega antes que el DELETE, la 1 todavía existe: choque.
//
//   ACTUALIZACIÓN CONTRA ACTUALIZACIÓN. La 3 pasa a 2 y la 2 pasa a 1. Si
//   la primera llega antes que la segunda, la 2 todavía vale 2: choque.
//   Esta no se arregla con el orden de envío, porque las dos son UPDATE.
//
// No es un caso raro: quitar una serie que no es la última es lo más normal
// del mundo, y el botón «×» está en cada fila.
//
// Lo que se ve al fallar es «No se pudo guardar», y parte de la rutina sí
// se guardó: la pantalla y la base se quedan diciendo cosas distintas.
//
// (El DELETE aquí no borra: la 0007 lo convierte en archivado, y sustituye
// el `unique` por un índice PARCIAL con `where archivado_en is null`. O sea
// que una serie archivada deja su hueco libre — pero solo cuando su
// archivado ha llegado, que es justo de lo que va la primera carrera.)
//
// EL ARREGLO tiene dos mitades, y las dos hacen falta:
//   1. Los borrados PRIMERO, esperando a que terminen.
//   2. Las actualizaciones DE UNA EN UNA y en orden ascendente de destino.
//      Como las series solo se pueden añadir al final o quitar —no se
//      arrastran—, el destino siempre es menor o igual que el actual, y
//      subiendo desde el 1 el hueco siempre está libre antes de ocuparlo.

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const MIG = join(AQUI, '..', 'migrations');
const APP = readFileSync(join(AQUI, '..', '..', 'docs', 'app.js'), 'utf8')
  .replace(/\r\n/g, '\n');

const db = await PGlite.create();
await db.exec(readFileSync(join(AQUI, 'bootstrap.sql'), 'utf8'));
for (const f of readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort())
  await db.exec(readFileSync(join(MIG, f), 'utf8'));

let ok = 0, bad = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { bad++; console.log(`  FALLA ${n}${extra ? '\n        ' + extra : ''}`); }
};

const U = '77777777-7777-7777-7777-777777777777';
await db.exec(`insert into auth.users (id, email)
               values ('${U}', 'eva@ejemplo.com') on conflict do nothing;`);

// Un día con un ejercicio y tres series. IDS NUEVOS EN CADA ESCENARIO: en
// esta base un DELETE no borra —la 0007 lo archiva—, así que reutilizar los
// mismos ids choca contra la clave primaria al resembrar.
let ronda = 0;
let EJ = '';
async function sembrar() {
  ronda++;
  const h = (p, n) => `${p}${String(ronda).padStart(4, '0')}-0000-0000-${String(n).padStart(12, '0')}`;
  const dia = h('11111111-', 1);
  EJ = h('22222222-', 1);
  await db.exec(`insert into public.routine_days (id, user_id, name, sort_order)
                 values ('${dia}','${U}','Empuje',0);`);
  await db.exec(`insert into public.routine_exercises (id, user_id, routine_day_id, name, sort_order)
                 values ('${EJ}','${U}','${dia}','Press banca',0);`);
  for (let n = 1; n <= 3; n++)
    await db.exec(`insert into public.exercise_sets
                     (id, user_id, routine_exercise_id, sort_order, reps, weight_kg)
                   values ('${h('33333333-', n)}','${U}','${EJ}',${n},10,50);`);
}

const ser = (n) => `'33333333-${String(ronda).padStart(4,'0')}-0000-0000-${String(n).padStart(12,'0')}'`;
const intentar = async (sql) => {
  try { await db.exec(sql); return 'ok'; } catch (e) { return e.message; }
};

// ------------------------------------------------------------------
console.log('\nEl índice único existe y muerde');
{
  await sembrar();
  const r = await intentar(
    `update public.exercise_sets set sort_order = 2 where id = ${ser(3)};`);
  check('subir la 3 al hueco de la 2, con la 2 aún ahí, choca', r !== 'ok',
        'sin este índice nada de lo de abajo importa; con él, el orden de ' +
        'las escrituras decide si la rutina se guarda o no');
}

console.log('\nY el orden malo rompe el guardado');
{
  await sembrar();
  // Se borra la serie 1 desde la pantalla. Las de abajo se renumeran.
  // ORDEN MALO: primero la que baja de 3 a 2, con la 2 todavía en 2.
  const r1 = await intentar(
    `update public.exercise_sets set sort_order = 2 where id = ${ser(3)};`);
  check('actualizar de arriba abajo choca', r1 !== 'ok',
        'las dos son UPDATE, así que mandarlas en un orden u otro no lo ' +
        'arregla: hace falta que vayan de una en una y de abajo arriba');

  await sembrar();
  // Y el borrado que llega tarde.
  const r2 = await intentar(
    `update public.exercise_sets set sort_order = 1 where id = ${ser(2)};`);
  check('y renumerar antes de borrar, también', r2 !== 'ok',
        'la serie 1 sigue existiendo hasta que el DELETE llega');
}

console.log('\nY el orden bueno lo guarda entero');
{
  await sembrar();
  // 1) Los borrados primero, esperando.
  await db.exec(`delete from public.exercise_sets where id = ${ser(1)};`);
  // 2) Las actualizaciones de una en una, ascendente por destino.
  const a = await intentar(
    `update public.exercise_sets set sort_order = 1 where id = ${ser(2)};`);
  const b = await intentar(
    `update public.exercise_sets set sort_order = 2 where id = ${ser(3)};`);
  check('la primera entra', a === 'ok', a);
  check('y la segunda también', b === 'ok', b);

  const filas = (await db.query(
    `select sort_order::int as n from public.exercise_sets
      where routine_exercise_id = '${EJ}' and archivado_en is null
      order by sort_order`)).rows.map((r) => r.n);
  check('y quedan renumeradas 1 y 2', JSON.stringify(filas) === '[1,2]',
        'quedaron ' + JSON.stringify(filas));
}

// ------------------------------------------------------------------
console.log('\nY la app las manda en ese orden');
{
  const i = APP.indexOf('function guardarEjercicio(diaId, ej){');
  let n = 0, j = APP.indexOf('{', i), fin = j;
  for (; j < APP.length; j++) {
    if (APP[j] === '{') n++;
    else if (APP[j] === '}') { n--; if (!n) { fin = j + 1; break; } }
  }
  const f = APP.slice(i, fin);

  check('los borrados van antes y se esperan',
        /Promise\.all\(borradas\)[\s\S]{0,120}?then/.test(f),
        'con `Promise.all(borradas.concat(guardadas))` salen todos a la vez ' +
        'y el UPDATE puede adelantar al DELETE');
  check('y las series se guardan de una en una',
        /reduce\(/.test(f) || /una a una|de una en una/.test(f),
        'en paralelo, la que baja de 3 a 2 puede adelantar a la que baja de ' +
        '2 a 1, y esa carrera no la arregla el orden de envío');
  // ASCENDENTE, no «ordenado». `b.orden - a.orden` también es un `sort` y
  // también casa con «orden -», pero baja de mayor a menor: la 3 iría a 2
  // antes de que la 2 dejara libre el 2, que es justo la carrera que se
  // quería quitar. Lo enseñó una mutación.
  check('en orden ascendente', /a\.orden\s*-\s*b\.orden/.test(f),
        'subiendo desde el 1 el hueco siempre está libre antes de ocuparlo; ' +
        'bajando, nunca lo está');
}

console.log('\nY los reps y el peso no se salen de lo que acepta la base');
{
  // La base exige `between 0 and 1000` en los dos. Los campos de la
  // pantalla no tienen `min` ni `max`, así que un dedo torpe —o alguien
  // apuntando libras— manda 1500 y se cae el guardado ENTERO de la rutina.
  const i = APP.indexOf('function fotoDeRutina') >= 0
    ? APP.indexOf('function fotoDeRutina') : APP.indexOf('var series = [];');
  const f = APP.slice(i, i + 1200);
  check('los reps se acotan por arriba', /Math\.min\(1000/.test(f),
        'sin tope, un 2000 rompe el guardado de toda la rutina, no solo de ' +
        'esa serie');
  check('y el peso también', (f.match(/Math\.min\(1000/g) || []).length >= 2,
        'mismo caso: `weight_kg between 0 and 1000`');

  const r = await intentar(
    `insert into public.exercise_sets (user_id, routine_exercise_id, sort_order, reps, weight_kg)
     values ('${U}','${EJ}', 9, 2000, 50);`);
  check('y la base los rechaza de verdad', r !== 'ok',
        'si dejara de rechazarlos, este acotado sobraría');
}

console.log(`\n${ok} bien, ${bad} mal`);
process.exit(bad ? 1 : 0);
