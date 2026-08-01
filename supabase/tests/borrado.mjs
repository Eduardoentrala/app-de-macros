// ¿Qué pasa al borrar una cuenta de auth.users?
//
// La 0007 convierte los DELETE en archivado, y profiles cuelga de auth.users
// con ON DELETE CASCADE. Si el trigger cancela ese borrado en cascada, la
// fila de profiles se queda sin su usuario y la operación revienta.
// Esto lo comprueba en lugar de suponerlo.
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

const ID = '99999999-9999-9999-9999-999999999999';
await db.exec(`insert into auth.users(id,email) values ('${ID}','prueba@x.com')`);
await db.exec(`insert into public.diary_entries(user_id,meal,food_name,protein_g)
               values ('${ID}','Desayuno','Avena',10)`);

const n = async (t) => (await db.query(`select count(*)::int c from ${t}`)).rows[0].c;
console.log('antes  → auth.users:', await n('auth.users'),
            '· profiles:', await n('public.profiles'),
            '· diary:', await n('public.diary_entries'));

console.log('\n--- 1) Borrar desde auth.users, como hace el panel de Supabase ---');
try {
  await db.exec(`delete from auth.users where id = '${ID}'`);
  console.log('   no dio error');
} catch (e) {
  console.log('   FALLA:', e.message.split('\n')[0]);
}
console.log('   auth.users:', await n('auth.users'),
            '· profiles:', await n('public.profiles'),
            '· diary:', await n('public.diary_entries'));

console.log('\n--- 2) Con la compuerta de borrado definitivo abierta ---');
try {
  await db.exec(`select set_config('app.borrado_definitivo','on',false)`);
  await db.exec(`delete from auth.users where id = '${ID}'`);
  await db.exec(`select set_config('app.borrado_definitivo','off',false)`);
  console.log('   no dio error');
} catch (e) {
  console.log('   FALLA:', e.message.split('\n')[0]);
}
console.log('   auth.users:', await n('auth.users'),
            '· profiles:', await n('public.profiles'),
            '· diary:', await n('public.diary_entries'));

await db.close();
