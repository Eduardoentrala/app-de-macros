// ¿Aplican las migraciones, en orden y sin errores?
// Corre PostgreSQL de verdad (compilado a WASM) en el propio proceso:
// no hace falta Docker, ni instalar un servidor, ni conexión a internet.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const MIG = join(AQUI, '..', 'migrations');

const db = await PGlite.create();
console.log('PostgreSQL:', (await db.query('select version()')).rows[0].version.split(',')[0]);

// Andamiaje: los esquemas auth y storage que pone Supabase
try {
  await db.exec(readFileSync(join(AQUI, 'bootstrap.sql'), 'utf8'));
  console.log('bootstrap                          OK\n');
} catch (e) {
  console.log('bootstrap                          FALLO:', e.message);
  process.exit(1);
}

const files = readdirSync(MIG).filter(f => f.endsWith('.sql')).sort();
let fallos = 0;

for (const f of files) {
  const sql = readFileSync(join(MIG, f), 'utf8');
  try {
    // Cada archivo en su propia transacción, como hace el CLI de Supabase
    await db.exec(sql);
    console.log(`${f.padEnd(34)} OK`);
  } catch (e) {
    fallos++;
    console.log(`${f.padEnd(34)} FALLO`);
    console.log(`   ${e.message.split('\n')[0]}`);
    if (e.position) {
      const linea = sql.slice(0, Number(e.position)).split('\n').length;
      console.log(`   línea ~${linea}: ${sql.split('\n')[linea - 1]?.trim().slice(0, 90)}`);
    }
  }
}

console.log(fallos ? `\n${fallos} migración(es) con error` : '\nTodas aplicaron');
await db.close();
process.exit(fallos ? 1 : 0);
