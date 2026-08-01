// Comprueba que el pegado de pendientes_0010_0015.sql aplica limpio sobre
// una base que solo tiene hasta la 0009 — que es justo la situacion real.
// Y que aplicarlo dos veces tampoco rompe nada.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const MIG = join(AQUI, '..', 'migrations');
const PEGADO = join(AQUI, '..', 'pendientes_0010_0015.sql');

const db = await PGlite.create();
await db.exec(readFileSync(join(AQUI, 'bootstrap.sql'), 'utf8'));

// Solo hasta la 0009: el estado en el que esta su Supabase
const previas = readdirSync(MIG)
  .filter(f => f.endsWith('.sql') && f < '0010')
  .sort();
for (const f of previas) await db.exec(readFileSync(join(MIG, f), 'utf8'));
console.log(`Base con ${previas.length} migraciones (0001-0009).`);

let ok = 0, bad = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { bad++; console.log(`  FALLA ${n}${extra ? ' — ' + extra : ''}`); }
};

const pegado = readFileSync(PEGADO, 'utf8');

try {
  await db.exec(pegado);
  check('el pegado entero aplica de una vez', true);
} catch (e) {
  check('el pegado entero aplica de una vez', false, e.message.split('\n')[0]);
}

// Repetirlo no debe romper: si ya aplico alguna suelta, no pasa nada
try {
  await db.exec(pegado);
  check('aplicarlo dos veces tampoco rompe', true);
} catch (e) {
  check('aplicarlo dos veces tampoco rompe', false, e.message.split('\n')[0]);
}

console.log('\n— Quedo todo lo que traian —');
const tabla = async (t) => (await db.query(
  `select count(*)::int n from information_schema.tables
    where table_schema='public' and table_name='${t}'`)).rows[0].n === 1;
const func = async (f) => (await db.query(
  `select count(*)::int n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
    where ns.nspname='public' and p.proname='${f}'`)).rows[0].n >= 1;

check('tabla planes (0014)',        await tabla('planes'));
check('tabla ia_uso (0015)',        await tabla('ia_uso'));
check('buscar_alimentos (0012)',    await func('buscar_alimentos'));
check('limpiar_fotos_viejas (0011)',await func('limpiar_fotos_viejas'));
check('gastar_consulta_ia (0015)',  await func('gastar_consulta_ia'));

const sinRls = (await db.query(
  `select string_agg(c.relname, ', ') t from pg_class c
     join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname='public' and c.relkind='r' and not c.relrowsecurity`)).rows[0].t;
check('ninguna tabla se quedo sin RLS', sinRls === null, sinRls);

console.log(`\n${ok} pasan · ${bad} fallan`);
await db.close();
process.exit(bad ? 1 : 0);
