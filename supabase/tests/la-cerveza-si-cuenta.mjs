// Una cerveza entraba al anillo como 16 kcal por 100 g. Son 43.
//
// No era un error de los datos: el catálogo siempre dijo 43. Era que la
// app no sabe contar lo que no es proteína, carbohidrato o grasa, y las
// calorías del diario son una columna GENERADA con esas tres:
//
//     calories = protein_g*4 + carbs_g*4 + fat_g*9
//
// El alcohol tiene 7 kcal por gramo y no es ninguna de las tres. Para la
// base, una cerveza era agua con 3,6 g de carbohidrato. Un tarro de 355
// ml son unas 153 kcal reales y se apuntaban 58.
//
// Y NO ERA SOLO EL NÚMERO DE LA PANTALLA. `gastoMedido()` saca su gasto
// real cruzando lo que come con cómo se mueve su peso. Comer más de lo
// apuntado le atribuye el cambio de peso a una ingesta menor, o sea le
// calcula un gasto MÁS BAJO del que tiene; y de ese gasto salen las
// calorías que le pone el cierre de los lunes. La cerveza no contada le
// apretaba la dieta en silencio, semana a semana.
//
// Se descartó el apaño de meter esas calorías en el carbohidrato: la
// cuenta de calorías saldría bien y el número de carbos sería falso, y
// sus metas son POR MACRO. Sería cambiar una mentira por otra.

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

let ok = 0, mal = 0;
const check = (n, c, e = '') => {
  if (c) { ok++; console.log(`  PASA  ${n}`); }
  else { mal++; console.log(`  FALLA ${n}${e ? '\n        ' + e : ''}`); }
};
const todas = async (sql) => (await db.query(sql)).rows;
const uno = async (sql) => (await todas(sql))[0];

const YO = '77777777-7777-7777-7777-777777777777';
await db.exec(`insert into auth.users (id, email) values ('${YO}', 'yo@x.com')`);

// ====================================================================
console.log('\n— La cerveza sabe cuánto alcohol lleva —');
{
  const c = await uno(`select kcal, proteina, carbos, grasas, alcohol
                         from public.alimentos_catalogo where nombre = 'Cerveza'`);
  check('está en el catálogo', !!c);
  check('y declara 3,9 g de alcohol por 100 g', c && Number(c.alcohol) === 3.9,
    'alcohol: ' + (c || {}).alcohol);

  // LA CUENTA TIENE QUE CERRAR CONTRA USDA. Si no cierra, el valor del
  // alcohol está mal puesto y nadie lo notaría: las dos cifras viven en
  // columnas distintas de la misma fila.
  const soloMacros = Number(c.proteina) * 4 + Number(c.carbos) * 4 + Number(c.grasas) * 9;
  const conAlcohol = soloMacros + Number(c.alcohol) * 7;
  check(`sin alcohol salían ${soloMacros.toFixed(1)} kcal y USDA dice ${c.kcal}`,
    Math.abs(soloMacros - Number(c.kcal)) > 20,
    'si estas dos ya cuadraban, este arreglo no hacía falta');
  check(`y con alcohol salen ${conAlcohol.toFixed(1)}`,
    Math.abs(conAlcohol - Number(c.kcal)) <= 1,
    'la cuenta no cierra contra USDA: el alcohol está mal puesto');
}

// ====================================================================
console.log('\n— Y el diario ya las cuenta —');
{
  const meter = async (nombre, p, c, g, a) => {
    await db.exec(`insert into public.diary_entries
      (user_id, entry_date, meal, food_name, quantity, unit,
       protein_g, carbs_g, fat_g, alcohol_g)
      values ('${YO}', '2026-11-13', 'Cena', '${nombre}', 355, 'Gramos',
              ${p}, ${c}, ${g}, ${a})`);
    return uno(`select calories from public.diary_entries where food_name = '${nombre}'`);
  };

  // Un tarro de 355 ml: los macros de 100 g por 3,55.
  const tarro = await meter('Cerveza', 1.8, 12.8, 0, 13.8);
  const cal = Number(tarro.calories);
  check(`un tarro de 355 ml cuenta ${Math.round(cal)} kcal`,
    Math.abs(cal - 153) <= 6,
    'antes contaba 58: los 13,8 g de alcohol valen 97 kcal y se perdían');

  // Y lo que no lleva alcohol cuenta exactamente igual que siempre.
  const pollo = await meter('Pechuga', 31, 0, 3.6, 0);
  check('y lo que no lleva alcohol no cambia',
    Math.abs(Number(pollo.calories) - (31 * 4 + 3.6 * 9)) < 0.01,
    'salió ' + pollo.calories);
}

// ====================================================================
console.log('\n— Y lo apuntado antes no se movió —');
{
  // La columna entra con `default 0`, así que una fila que no la
  // menciona cuenta lo mismo que contaba ayer. Reescribir el historial
  // para que cuadre con una regla nueva sería cambiarle a alguien lo
  // que vio en su día.
  await db.exec(`insert into public.diary_entries
    (user_id, entry_date, meal, food_name, quantity, unit, protein_g, carbs_g, fat_g)
    values ('${YO}', '2026-01-01', 'Comida', 'De antes', 100, 'Gramos', 10, 20, 5)`);
  const v = await uno(`select alcohol_g, calories from public.diary_entries
                        where food_name = 'De antes'`);
  check('una fila sin alcohol trae 0', Number(v.alcohol_g) === 0);
  check('y sus calorías son las de siempre',
    Math.abs(Number(v.calories) - (10 * 4 + 20 * 4 + 5 * 9)) < 0.01,
    'salió ' + v.calories + ', se esperaban 165');

  const sucias = await uno(`select count(*)::int as n from public.diary_entries
                             where alcohol_g <> 0 and food_name <> 'Cerveza'`);
  check('y nada más quedó con alcohol', sucias.n === 0, 'filas: ' + sucias.n);
}

// ====================================================================
console.log('\n— Y las tres tablas con macros lo llevan —');
{
  // `saved_foods` y `recipes` tienen la misma columna generada. Si se
  // quedaran fuera, guardar la cerveza en la despensa o meterla en una
  // receta volvería a perder las calorías por la puerta de al lado.
  for (const t of ['diary_entries', 'saved_foods', 'recipes']) {
    const col = await uno(`select 1 as hay from information_schema.columns
                            where table_name = '${t}' and column_name = 'alcohol_g'`);
    check(`${t} tiene alcohol_g`, !!col);

    const gen = await uno(`select pg_get_expr(d.adbin, d.adrelid) as expr
                             from pg_attrdef d
                             join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
                            where a.attrelid = '${t}'::regclass and a.attname = 'calories'`);
    // Postgres NO guarda la fórmula como se escribió: la reescribe con
    // sus paréntesis y sus conversiones, así que lo que hay dentro es
    // `(alcohol_g * (7)::numeric)` y no `alcohol_g * 7`. Buscar el texto
    // literal daba rojo con la columna perfectamente bien puesta.
    check(`y sus calorías lo suman`,
      !!gen && /alcohol_g \* \(?7\)?/.test(gen.expr),
      'la fórmula es: ' + ((gen || {}).expr || '(no hay)'));
  }
}

// ====================================================================
console.log('\n— Y el gasto medido ve las calorías buenas —');
{
  // `gastoMedido` suma `calories` de la base, no recalcula macros. Así
  // que arreglar la columna generada arregla la medición sola. Esto lo
  // comprueba: la suma del día tiene que incluir el alcohol.
  const d = await uno(`select round(sum(calories)) as cal from public.diary_entries
                        where entry_date = '2026-11-13'`);
  check('la suma del día incluye el alcohol', Number(d.cal) > 200,
    'salió ' + d.cal + '. Sin alcohol serían unas 160, y de ahí salía un ' +
    'gasto medido más bajo del real y un cierre de lunes más apretado');
}

// ====================================================================
console.log('\n— Y la búsqueda se lo pasa a la app —');
{
  // ESTO ES LO QUE SE ESCAPÓ. Con la 0073 aplicada en producción y la
  // app ya desplegada, buscar «cerveza» seguía dando 16 kcal. El dato
  // estaba en la tabla y el diario sabía sumarlo, pero entre los dos
  // va `buscar_catalogo()`, que devuelve una lista FIJA de columnas y
  // no incluía el alcohol. A la app le llegaba `undefined`, su `|| 0`
  // lo hacía cero y nadie se enteraba.
  //
  // Las dos comprobaciones de arriba pasaban en verde mientras la
  // pantalla mentía, porque probaban los dos extremos y no el tubo.
  const r = await db.query(`select * from public.buscar_catalogo('cerveza', 5)`);
  const fila = r.rows.find((x) => x.nombre === 'Cerveza');
  check('la búsqueda encuentra la cerveza', !!fila);
  check('y la devuelve con su alcohol', fila && Number(fila.alcohol) === 3.9,
    'alcohol: ' + (fila || {}).alcohol + '. Si sale undefined, la función ' +
    'no lo devuelve y la app lo convierte en cero');

  const cal = fila && (Number(fila.proteina) * 4 + Number(fila.carbos) * 4 +
                       Number(fila.grasas) * 9 + Number(fila.alcohol) * 7);
  check('y con lo que devuelve salen las calorías de verdad',
    fila && Math.abs(cal - Number(fila.kcal)) <= 1,
    'con lo devuelto salen ' + cal + ' y USDA dice ' + (fila || {}).kcal);

  // Y AHORA LO GENERAL, QUE ES LO QUE EVITA EL PRÓXIMO. La app lee la
  // fila del catálogo por nombre de propiedad. Cualquiera que la
  // función no devuelva llega como `undefined` —sin error, sin aviso—
  // así que se comprueban TODAS contra lo que la función devuelve de
  // verdad, no contra una lista escrita a mano aquí.
  const APP = join(AQUI, '..', '..', 'docs', 'app.js');
  const src = readFileSync(APP, 'utf8').replace(/\r\n/g, '\n');
  const desde = src.indexOf('var cat = (r[0]');
  const hasta = src.indexOf('var gente = (r[1]', desde);
  check('se localiza el trozo que mapea el catálogo', desde > 0 && hasta > desde);

  // Sin comentarios: ya hubo comprobaciones que pasaban por encontrar
  // lo que buscaban dentro de un comentario recién escrito.
  const bloque = src.slice(desde, hasta)
    .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  const leidas = [...new Set((bloque.match(/\bx\.[a-z_]+/g) || [])
    .map((s) => s.slice(2)))];
  const devueltas = r.fields.map((f) => f.name);
  check('la app lee varias columnas de la fila', leidas.length >= 5,
    'encontradas: ' + leidas.join(', '));

  const huerfanas = leidas.filter((p) => devueltas.indexOf(p) < 0);
  check('y la función devuelve todas las que lee', huerfanas.length === 0,
    'la app lee ' + huerfanas.join(', ') + ' y buscar_catalogo() no lo' +
    (huerfanas.length === 1 ? '' : 's') + ' devuelve: llegará undefined');
}

console.log('\n' + ok + ' pasan · ' + mal + ' fallan');
process.exit(mal ? 1 : 0);
