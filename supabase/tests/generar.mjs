// Une las migraciones en un solo supabase/instalar.sql, listo para pegar
// en el editor SQL de Supabase — y comprueba que el resultado aplica.
//
// Ejecutar tras cualquier cambio en migrations/:  npm run generar
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const AQUI = dirname(fileURLToPath(import.meta.url));
const BASE = join(AQUI, '..');
const MIG = join(BASE, 'migrations');
const files = readdirSync(MIG).filter(f => f.endsWith('.sql')).sort();

const cabecera = `-- =====================================================================
--  INSTALACIÓN COMPLETA — pega este archivo entero en el editor SQL
--  de Supabase y pulsa Run. Una sola vez.
--
--  Son las ${files.length} migraciones de supabase/migrations/ unidas en orden.
--  Se ejecutan como una sola transacción: si algo fallara, no queda nada
--  a medias — se deshace todo y la base se queda como estaba.
--
--  Generado automáticamente. NO lo edites: edita los archivos de
--  migrations/ y vuelve a generarlo con  npm run generar
--
--  Después de que termine, crea tu super admin:
--    1. Regístrate en la app con tu correo, como usuario normal.
--    2. Vuelve aquí y ejecuta:
--         select public.nombrar_super_admin('tu-correo@ejemplo.com');
-- =====================================================================

`;

const cuerpo = files.map(f =>
  `\n-- ============================ ${f} ============================\n\n` +
  readFileSync(join(MIG, f), 'utf8')
).join('\n');

const salida = cabecera + cuerpo;
writeFileSync(join(BASE, 'instalar.sql'), salida, 'utf8');

// No basta con generarlo: hay que probar que el archivo generado aplica.
const db = await PGlite.create();
await db.exec(readFileSync(join(AQUI, 'bootstrap.sql'), 'utf8'));
try {
  await db.exec(salida);
  const t = await db.query(`select count(*)::int n from information_schema.tables
                            where table_schema='public' and table_type='BASE TABLE'`);
  const p = await db.query(`select count(*)::int n from pg_policies where schemaname='public'`);
  console.log(`instalar.sql generado: ${(salida.length / 1024).toFixed(0)} KB, ${files.length} migraciones`);
  console.log(`aplica OK — ${t.rows[0].n} tablas, ${p.rows[0].n} políticas de seguridad`);
} catch (e) {
  console.log('FALLO al aplicar el archivo generado:', e.message.split('\n')[0]);
  process.exit(1);
}
await db.close();
