// El buscador de alimentos: que agrupe bien, que respete el umbral y que
// la mediana ignore a quien se equivoca tecleando los macros.
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

// --- Normalización ---
const norm = await db.query(`select
  public.normalizar_texto('Avena') a,
  public.normalizar_texto('  AVENA  ') b,
  public.normalizar_texto('Aveña') c,
  public.normalizar_texto('Plátano  Macho') d`);
const n = norm.rows[0];
check('mayúsculas, espacios y acentos se unifican',
      n.a === 'avena' && n.b === ' avena ' .trim() === false ? n.a === n.c : n.a === n.c,
      JSON.stringify(n));
check('los acentos se quitan', n.c === 'avena', n.c);
check('los espacios de sobra se colapsan', n.d === 'platano macho', n.d);

// --- Datos: cinco personas, con una que teclea mal los macros ---
const ids = [];
for (let i = 1; i <= 5; i++) {
  const id = `0000000${i}-0000-0000-0000-00000000000${i}`;
  ids.push(id);
  await db.exec(`insert into auth.users(id,email) values ('${id}','u${i}@x.com')`);
}
// Cuatro escriben "Pechuga de pollo" con ~23g de proteína; uno pone 230 (dedo gordo)
const proteinas = [22, 23, 23, 24, 230];
const nombres = ['Pechuga de pollo', 'pechuga de pollo', 'PECHUGA DE POLLO',
                 'Pechuga de Pollo', 'Pechuga de pollo'];
for (let i = 0; i < 5; i++) {
  await db.exec(`insert into public.saved_foods(user_id,name,unit,protein_g,carbs_g,fat_g)
                 values ('${ids[i]}','${nombres[i]}','Gramos',${proteinas[i]},0,2)`);
}
// Y un alimento que solo tiene una persona
await db.exec(`insert into public.saved_foods(user_id,name,unit,protein_g,carbs_g,fat_g)
               values ('${ids[0]}','Pastel de cumpleanos de mi mama','Gramos',5,60,30)`);

const r1 = await db.query(`select * from public.buscar_alimentos('pollo')`);
check('agrupa las cinco formas de escribirlo en una sola',
      r1.rows.length === 1, JSON.stringify(r1.rows));
check('cuenta las cinco personas',
      r1.rows[0]?.personas === 5, String(r1.rows[0]?.personas));
check('la mediana ignora el error de tecleo (23, no ~64 de promedio)',
      Number(r1.rows[0]?.protein_g) === 23, String(r1.rows[0]?.protein_g));

const r2 = await db.query(`select * from public.buscar_alimentos('pastel')`);
check('lo que solo tiene una persona NO se sugiere',
      r2.rows.length === 0, JSON.stringify(r2.rows));

const r3 = await db.query(`select * from public.buscar_alimentos('p')`);
check('con una sola letra no devuelve nada', r3.rows.length === 0);

// --- El umbral se puede aflojar ---
await db.exec(`update public.system_settings set valor='1'::jsonb where clave='min_personas_alimento'`);
const r4 = await db.query(`select * from public.buscar_alimentos('pastel')`);
check('bajando el umbral a 1, ya aparece', r4.rows.length === 1);

// --- Y no filtra de quién es ---
const cols = await db.query(`select column_name from information_schema.columns
  where table_name = 'buscar_alimentos'`);
check('la función no devuelve ningún user_id',
      !JSON.stringify(r1.rows[0] || {}).includes('user_id'));

console.log(`\n${ok} pasan · ${bad} fallan`);
await db.close();
process.exit(bad ? 1 : 0);
