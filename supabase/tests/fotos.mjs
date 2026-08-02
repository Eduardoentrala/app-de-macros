// Borrar una foto de progreso tiene que quedarse borrada.
//
// El fallo que motivó esto: la app quitaba la foto solo del mapa en
// memoria y nunca mandaba nada a la base, así que reaparecía al recargar.
// Estas comprobaciones cubren la mitad de abajo: que el DELETE que la app
// manda ahora deje la foto fuera de lo que se lee después.
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

const YO   = '11111111-1111-1111-1111-111111111111';
const OTRO = '22222222-2222-2222-2222-222222222222';
await db.exec(`insert into auth.users(id,email) values
  ('${YO}','yo@x.com'),('${OTRO}','otro@x.com')`);

const SEMANA = '2026-W31';
const alta = async (uid, pose, ruta) => as(uid,
  `insert into public.progress_photos(user_id, week_key, pose, storage_path, bytes)
   values ('${uid}','${SEMANA}','${pose}','${ruta}', 1000)`);

console.log('— Una foto se sube y se ve —');
await alta(YO, 'frente', YO + '/' + SEMANA + '/frente-1.webp');
await alta(YO, 'espalda', YO + '/' + SEMANA + '/espalda-1.webp');
const vistas = await as(YO, `select pose from public.progress_photos order by pose`);
check('se ven las dos que subió', vistas.rows.length === 2, JSON.stringify(vistas.rows));

console.log('\n— Borrarla la quita de lo que se lee —');
// Exactamente lo que manda la app: DELETE por dueño + semana + pose.
await as(YO, `delete from public.progress_photos
              where user_id='${YO}' and week_key='${SEMANA}' and pose='frente'`);
const tras = await as(YO, `select pose from public.progress_photos`);
check('la borrada ya no aparece',
  !tras.rows.some(r => r.pose === 'frente'), JSON.stringify(tras.rows));
check('la otra sigue ahí',
  tras.rows.some(r => r.pose === 'espalda'), JSON.stringify(tras.rows));

// Esta es LA comprobación del fallo: la app recarga con sbCargarFotos(),
// que consulta igual. Si volviera aquí, volvería en la pantalla.
const recarga = await as(YO,
  `select week_key, pose from public.progress_photos
    where user_id='${YO}' and week_key >= '2026-W01' order by week_key desc`);
check('al recargar NO vuelve',
  recarga.rows.length === 1 && recarga.rows[0].pose === 'espalda',
  JSON.stringify(recarga.rows));

console.log('\n— Pero no se pierde: queda archivada —');
const arch = await db.query(
  `select pose, archivado_en is not null arch from public.progress_photos
    where user_id='${YO}' order by pose`);
check('la fila sigue existiendo', arch.rows.length === 2, JSON.stringify(arch.rows));
check('marcada como archivada',
  arch.rows.find(r => r.pose === 'frente')?.arch === true, JSON.stringify(arch.rows));
check('su archivo se puede recuperar para limpiarlo luego',
  (await db.query(`select storage_path from public.progress_photos
                    where pose='frente'`)).rows[0].storage_path.includes('frente-1.webp'));

console.log('\n— Volver a subir esa pose funciona —');
// Con la unicidad mal puesta, esto fallaría por duplicado contra una fila
// que la persona ya no ve: el error imposible de entender.
let error = null;
try {
  await alta(YO, 'frente', YO + '/' + SEMANA + '/frente-2.webp');
} catch (e) { error = e.message.split('\n')[0]; }
check('se puede volver a poner foto en ese hueco', error === null, error || '');
const final = await as(YO, `select pose, storage_path from public.progress_photos order by pose`);
check('y se ve la nueva, no la borrada',
  final.rows.length === 2 &&
  final.rows.find(r => r.pose === 'frente').storage_path.includes('frente-2'),
  JSON.stringify(final.rows));

console.log('\n— Nadie borra la foto de otro —');
await alta(OTRO, 'frente', OTRO + '/' + SEMANA + '/frente-1.webp');
await as(YO, `delete from public.progress_photos
              where user_id='${OTRO}' and week_key='${SEMANA}' and pose='frente'`);
const deOtro = await as(OTRO, `select pose from public.progress_photos`);
check('la de otro sigue intacta', deOtro.rows.length === 1, JSON.stringify(deOtro.rows));

console.log(`\n${ok} pasan · ${bad} fallan`);
await db.close();
process.exit(bad ? 1 : 0);
