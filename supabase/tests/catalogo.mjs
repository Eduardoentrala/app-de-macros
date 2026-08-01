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

// Datos de prueba con las cifras reales de USDA
await db.exec(`select set_config('request.jwt.claim.sub','',false)`);
await db.exec(`
  insert into public.alimentos_catalogo
    (nombre, categoria, estado, kcal, proteina, carbos, grasas, porcion, porcion_g, fdc_id, nombre_usda)
  values
    ('Pechuga de pollo','aves','crudo', 120, 22.5, 0,   2.6, '1 pieza', 174, 171077,
     'Chicken, broilers or fryers, breast, meat only, raw'),
    ('Pechuga de pollo','aves','cocido',165, 31.0, 0,   3.6, '1 pieza', 140, 171534,
     'Chicken, broilers or fryers, breast, meat only, cooked, roasted'),
    ('Arroz blanco','arroces','crudo', 365, 7.1, 80.0, 0.7, '1 taza', 185, 169756,
     'Rice, white, long-grain, regular, raw'),
    ('Arroz blanco','arroces','cocido',130, 2.7, 28.2, 0.3, '1 taza', 158, 169757,
     'Rice, white, long-grain, regular, cooked'),
    ('Papa','tuberculos','crudo', 77, 2.0, 17.5, 0.1, '1 pieza mediana', 173, 170026,
     'Potatoes, flesh and skin, raw'),
    ('Plátano','frutas','unico', 89, 1.1, 22.8, 0.3, '1 pieza mediana', 118, 173944,
     'Bananas, raw')`);

const idPapa = (await db.query(`select id from public.alimentos_catalogo where nombre='Papa'`)).rows[0].id;
const idPlat = (await db.query(`select id from public.alimentos_catalogo where nombre='Plátano'`)).rows[0].id;
await db.exec(`insert into public.alimentos_sinonimos(alimento_id, termino) values
  (${idPapa},'patata'),(${idPapa},'papas'),(${idPlat},'banana')`);

console.log('— Crudo y cocido son registros independientes —');
const pollo = (await db.query(
  `select estado::text e, kcal from public.alimentos_catalogo
    where nombre='Pechuga de pollo' order by estado`)).rows;
check('la misma pechuga existe dos veces', pollo.length === 2);
check('con valores distintos', Number(pollo[0].kcal) !== Number(pollo[1].kcal),
  JSON.stringify(pollo));
check('el mismo nombre+estado no se puede repetir',
  (await falla(ADMIN, `insert into public.alimentos_catalogo
     (nombre,categoria,estado,kcal,proteina,carbos,grasas)
     values ('Arroz blanco','arroces','cocido',130,2.7,28.2,0.3)`)) !== null);

console.log('\n— Quien puede ver la tabla —');
check('el super admin la ve entera',
  (await as(ADMIN, `select count(*)::int n from public.alimentos_catalogo`)).rows[0].n === 6);
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
check('un usuario normal encuentra pollo', r1.rows.length === 2, JSON.stringify(r1.rows));
check('y le llegan los macros', Number(r1.rows[0].kcal) > 0);

const r2 = await as(CLI, `select nombre from public.buscar_catalogo('platano')`);
check('busca sin acentos', r2.rows.length === 1 && r2.rows[0].nombre === 'Plátano');

console.log('\n— Sinonimos —');
const s1 = await as(CLI, `select nombre from public.buscar_catalogo('patata')`);
check('patata encuentra Papa', s1.rows.length === 1 && s1.rows[0].nombre === 'Papa');
const s2 = await as(CLI, `select nombre from public.buscar_catalogo('banana')`);
check('banana encuentra Plátano', s2.rows.length === 1 && s2.rows[0].nombre === 'Plátano');

console.log('\n— No se puede descargar el catalogo por la puerta de atras —');
check('texto vacio no devuelve nada',
  (await as(CLI, `select count(*)::int n from public.buscar_catalogo('')`)).rows[0].n === 0);
check('una sola letra tampoco',
  (await as(CLI, `select count(*)::int n from public.buscar_catalogo('a')`)).rows[0].n === 0);
check('el limite esta acotado aunque se pida mucho',
  (await as(CLI, `select count(*)::int n from public.buscar_catalogo('o', 9999)`)).rows[0].n <= 50);

console.log('\n— Orden de resultados —');
const o = await as(CLI, `select nombre from public.buscar_catalogo('arroz')`);
check('encuentra los dos arroces', o.rows.length === 2);

console.log(`\n${ok} pasan · ${bad} fallan`);
await db.close();
process.exit(bad ? 1 : 0);
