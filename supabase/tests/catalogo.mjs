// El catalogo de alimentos: que lo vea solo el super admin, que todos
// puedan buscarlo sin poder descargarlo, y que los sinonimos funcionen.
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
const as = async (uid, sql) => {
  await db.exec(`select set_config('request.jwt.claim.sub','${uid}',false)`);
  await db.exec('set role authenticated');
  try { return await db.query(sql); } finally { await db.exec('reset role'); }
};
const falla = async (uid, sql) => {
  await db.exec(`select set_config('request.jwt.claim.sub','${uid}',false)`);
  await db.exec('set role authenticated');
  try { await db.query(sql); return null; }
  catch (e) { return e.message.split('\n')[0]; }
  finally { await db.exec('reset role'); }
};

const ADMIN = '11111111-1111-1111-1111-111111111111';
const CLI   = '22222222-2222-2222-2222-222222222222';
await db.exec(`insert into auth.users(id,email) values
  ('${ADMIN}','admin@x.com'),('${CLI}','cli@x.com')`);
await db.exec(`select public.nombrar_super_admin('admin@x.com')`);

// No se inventan datos de prueba: se prueba contra el catálogo real que
// carga la 0019. Si algo esta mal ahi, estas comprobaciones lo cazan.
await db.exec(`select set_config('request.jwt.claim.sub','',false)`);

console.log('— Crudo y cocido son registros independientes —');
const pollo = (await db.query(
  `select estado::text e, kcal from public.alimentos_catalogo
    where nombre='Pechuga de pollo' order by estado`)).rows;
check('la misma pechuga existe dos veces', pollo.length === 2, JSON.stringify(pollo));
check('con valores distintos', pollo.length === 2 && Number(pollo[0].kcal) !== Number(pollo[1].kcal),
  JSON.stringify(pollo));
check('el mismo nombre+estado no se puede repetir',
  (await falla(ADMIN, `insert into public.alimentos_catalogo
     (nombre,categoria,estado,kcal,proteina,carbos,grasas)
     values ('Arroz blanco','arroces','cocido',130,2.7,28.2,0.3)`)) !== null);

console.log('\n— Quien puede ver la tabla —');
check('el super admin la ve entera',
  (await as(ADMIN, `select count(*)::int n from public.alimentos_catalogo`)).rows[0].n > 100);
check('un usuario normal NO ve NADA',
  (await as(CLI, `select count(*)::int n from public.alimentos_catalogo`)).rows[0].n === 0);
check('ni los sinonimos',
  (await as(CLI, `select count(*)::int n from public.alimentos_sinonimos`)).rows[0].n === 0);
check('ni puede meter nada',
  (await falla(CLI, `insert into public.alimentos_catalogo
     (nombre,categoria,estado,kcal,proteina,carbos,grasas)
     values ('Colado','otros','unico',1,1,1,1)`)) !== null);

console.log('\n— Pero sí lo usa al buscar —');
const r1 = await as(CLI, `select nombre, estado::text e, kcal from public.buscar_catalogo('pollo')`);
check('un usuario normal encuentra pollo', r1.rows.length >= 2, JSON.stringify(r1.rows));
check('y le llegan los macros', r1.rows.length > 0 && Number(r1.rows[0].kcal) > 0);

const r2 = await as(CLI, `select nombre from public.buscar_catalogo('platano')`);
check('busca sin acentos', r2.rows.some(x => x.nombre === 'Plátano'), JSON.stringify(r2.rows));

console.log('\n— Sinonimos —');
const s1 = await as(CLI, `select nombre from public.buscar_catalogo('patata')`);
check('patata encuentra Papa', s1.rows.some(x => x.nombre.startsWith('Papa')), JSON.stringify(s1.rows));
const s2 = await as(CLI, `select nombre from public.buscar_catalogo('banana')`);
check('banana encuentra Plátano', s2.rows.some(x => x.nombre === 'Plátano'), JSON.stringify(s2.rows));
const s3 = await as(CLI, `select nombre from public.buscar_catalogo('elote')`);
check('elote encuentra el maiz', s3.rows.length > 0, JSON.stringify(s3.rows));

console.log('\n— No se puede descargar el catalogo por la puerta de atras —');
check('texto vacio no devuelve nada',
  (await as(CLI, `select count(*)::int n from public.buscar_catalogo('')`)).rows[0].n === 0);
check('una sola letra tampoco',
  (await as(CLI, `select count(*)::int n from public.buscar_catalogo('a')`)).rows[0].n === 0);
check('el limite esta acotado aunque se pida mucho',
  (await as(CLI, `select count(*)::int n from public.buscar_catalogo('o', 9999)`)).rows[0].n <= 50);

console.log('\n— Orden de resultados —');
const o = await as(CLI, `select nombre from public.buscar_catalogo('arroz')`);
check('encuentra blanco e integral, crudo y cocido', o.rows.length >= 4, JSON.stringify(o.rows));

// ---------------------------------------------------------------------
//  Los datos reales de la 0019, ya cargados por el bucle de migraciones
// ---------------------------------------------------------------------
console.log('\n— El catalogo cargado —');
const total = (await db.query(
  `select count(*)::int n from public.alimentos_catalogo where fdc_id is not null`)).rows[0].n;
check('hay alimentos de USDA cargados', total > 100, `${total}`);

// Que ninguna cifra sea imposible. Un error de escala -confundir por
// porcion con por 100 g- saldria justo aqui.
//
// El tope de calorias es 950 y no 900: la grasa pura existe y son ~900
// kcal por 100 g. La manteca da 902 y esta bien. Poner 900 marcaba como
// error un dato correcto, que es la peor clase de prueba.
const raros = (await db.query(
  `select nombre, kcal, proteina, carbos, grasas from public.alimentos_catalogo
    where kcal > 950 or proteina > 100 or carbos > 100 or grasas > 100
       or proteina + carbos + grasas > 105`)).rows;
check('ninguna cifra es imposible', raros.length === 0, JSON.stringify(raros));

// Las calorias deben cuadrar con los macros (4/4/9), con margen: USDA usa
// factores especificos por alimento y la fibra cuenta distinto.
const descuadre = (await db.query(
  `select nombre, kcal, round(proteina*4 + carbos*4 + grasas*9) calc
     from public.alimentos_catalogo
    where kcal > 50
      and abs(kcal - (proteina*4 + carbos*4 + grasas*9)) > kcal * 0.30`)).rows;
check('las calorias cuadran con los macros', descuadre.length <= 3,
  JSON.stringify(descuadre.slice(0, 4)));

// Lo que se pidio explicitamente: crudo y cocido con cifras distintas.
const pares = (await db.query(
  `select nombre from public.alimentos_catalogo
    group by nombre having count(distinct estado) > 1`)).rows;
check('varios alimentos tienen crudo Y cocido', pares.length >= 8, `${pares.length}`);

// Ojo: `order by estado` sobre un enum ordena por como se declaro
// ('crudo','cocido','unico'), NO alfabeticamente. Se busca por nombre para
// no depender de eso.
const arroz = Object.fromEntries((await db.query(
  `select estado::text e, kcal from public.alimentos_catalogo
    where nombre='Arroz blanco'`)).rows.map(r => [r.e, Number(r.kcal)]));
check('el arroz crudo tiene casi el triple de calorias que el cocido',
  arroz.crudo > arroz.cocido * 2.3, JSON.stringify(arroz));

console.log('\n— Buscar en el catalogo real —');
for (const [texto, esperado] of [['pollo','Pechuga de pollo'], ['frijol','Frijol'],
                                 ['aguacate','Aguacate'], ['tortilla','Tortilla']]) {
  const r = await as(CLI, `select nombre from public.buscar_catalogo('${texto}')`);
  check(`"${texto}" encuentra algo con ${esperado}`,
    r.rows.some(x => x.nombre.includes(esperado)), JSON.stringify(r.rows.slice(0,3)));
}
const sin = await as(CLI, `select nombre from public.buscar_catalogo('palta')`);
check('"palta" encuentra Aguacate por sinonimo',
  sin.rows.some(x => x.nombre === 'Aguacate'), JSON.stringify(sin.rows));

console.log('\n— El huevo se cuenta por piezas (0023) —');
// La busqueda tiene que devolver pieza_g o la app no puede saber que hay
// pieza: se quedaria ofreciendo 100 g de huevo, que no pide nadie.
const hv = await as(CLI, `select nombre, pieza_g, proteina
                            from public.buscar_catalogo('huevo')`);
check('la busqueda devuelve pieza_g', hv.rows.length > 0 && 'pieza_g' in hv.rows[0],
  JSON.stringify(hv.rows[0] || null));
const entero = hv.rows.find(x => x.nombre === 'Huevo entero');
check('el huevo entero pesa 50 g la pieza', entero && Number(entero.pieza_g) === 50,
  JSON.stringify(entero || null));
// El cocido llevaba 136 g de 'cup, chopped'. Una taza de huevo picado no es
// un huevo, y ofrecerla como "1 pieza" era el fallo que se quiere evitar.
const cocido = await db.query(`select pieza_g, porcion_g from public.alimentos_catalogo
                                where nombre = 'Huevo cocido'`);
check('el cocido ya no hereda los 136 g de la taza',
  Number(cocido.rows[0].pieza_g) === 50, JSON.stringify(cocido.rows[0]));
check('pero porcion_g sigue siendo el dato de USDA, sin tocar',
  Number(cocido.rows[0].porcion_g) === 136, JSON.stringify(cocido.rows[0]));
console.log('\n— La tortilla también (0028) —');
const tor = await db.query(`select nombre, pieza_g, porcion, porcion_g
                              from public.alimentos_catalogo
                             where nombre like 'Tortilla%' order by nombre`);
check('la de harina pesa 48 g la pieza',
  Number(tor.rows.find(r => r.nombre === 'Tortilla de harina')?.pieza_g) === 48,
  JSON.stringify(tor.rows));
check('la de maiz pesa 30 g la pieza',
  Number(tor.rows.find(r => r.nombre === 'Tortilla de maíz')?.pieza_g) === 30,
  JSON.stringify(tor.rows));
// La de maiz tenia 'oz' de porcion: una onza no es una tortilla, y ese es
// justo el error que `pieza_g` existe para no cometer.
check('la de maiz no hereda la onza de USDA',
  Number(tor.rows.find(r => r.nombre === 'Tortilla de maíz')?.porcion_g) === 28 &&
  Number(tor.rows.find(r => r.nombre === 'Tortilla de maíz')?.pieza_g) !== 28,
  JSON.stringify(tor.rows));
// Una tortilla de maiz ronda las 67 calorias. Si algun dia alguien toca el
// peso, esto salta antes de que la app empiece a mentir por 20 cal.
const calTor = await db.query(`select round(kcal * pieza_g / 100) c
                                 from public.alimentos_catalogo
                                where nombre = 'Tortilla de maíz'`);
check('y sale a ~67 cal la pieza', Math.abs(Number(calTor.rows[0].c) - 67) <= 4,
  `salieron ${calTor.rows[0].c} cal`);

// La lista de lo que se cuenta por piezas, entera. Si algun dia se rellena
// a lo loco -o se olvida rellenar algo que se anadio- esto salta.
const conPieza = await db.query(`select nombre from public.alimentos_catalogo
                                  where pieza_g is not null order by nombre`);
const esperados = ['Clara de huevo', 'Huevo cocido', 'Huevo entero', 'Huevo estrellado',
                   'Huevo revuelto', 'Tortilla de harina', 'Tortilla de maíz',
                   'Yema de huevo'];
check('solo se cuentan por pieza los huevos y las tortillas',
  JSON.stringify(conPieza.rows.map(r => r.nombre)) === JSON.stringify(esperados),
  JSON.stringify(conPieza.rows.map(r => r.nombre)));
// Nada con pieza puede quedarse sin peso: seria ofrecer "1 pieza" de algo
// que no se sabe cuanto pesa, que es de donde venia el fallo del espagueti.
const cero = await db.query(`select count(*)::int n from public.alimentos_catalogo
                              where pieza_g is not null and pieza_g <= 0`);
check('ninguna pieza pesa cero', cero.rows[0].n === 0);

console.log(`\n${ok} pasan · ${bad} fallan`);
await db.close();
process.exit(bad ? 1 : 0);
