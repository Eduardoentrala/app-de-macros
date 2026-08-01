// Comprueba que lunes_de_clave() coincida con lo que calcula la app.
// Si las dos cuentas se separan, la limpieza de seis meses borraría
// semanas equivocadas.
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

// La misma cuenta que hace la app en lunesDeClave()
function lunesApp(k) {
  const [anio, sem] = k.split('-W').map(Number);
  const ene4 = new Date(anio, 0, 4);
  const l1 = new Date(ene4);
  l1.setDate(l1.getDate() - ((l1.getDay() + 6) % 7));
  l1.setDate(l1.getDate() + (sem - 1) * 7);
  return l1.getFullYear() + '-' + String(l1.getMonth() + 1).padStart(2, '0') +
         '-' + String(l1.getDate()).padStart(2, '0');
}

const claves = ['2026-W01', '2026-W31', '2025-W52', '2024-W09', '2026-W53'];
let fallos = 0;
for (const k of claves) {
  const r = await db.query(`select public.lunes_de_clave('${k}')::text l`);
  const bd = r.rows[0].l, app = lunesApp(k);
  const ok = bd === app;
  if (!ok) fallos++;
  console.log(`  ${ok ? 'PASA ' : 'FALLA'} ${k} → base ${bd} · app ${app}`);
}
console.log(fallos ? `\n${fallos} no coinciden` : '\nLa base y la app cuentan igual');
await db.close();
process.exit(fallos ? 1 : 0);
