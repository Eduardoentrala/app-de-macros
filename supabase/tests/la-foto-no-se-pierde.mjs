// Reemplazar una foto podía dejar el hueco vacío.
//
// Son tres pasos: subir el archivo, BORRAR la ficha de la vieja —un trigger
// la archiva— y METER la ficha de la nueva. Entre el segundo y el tercero no
// había nada. Si el tercero no llegaba, la vieja ya estaba archivada (o sea,
// invisible) y la nueva no tenía ficha: hueco vacío.
//
// Y es un hueco de los que no se reponen. Una foto de progreso de hace tres
// meses no se vuelve a tomar.
//
// `reemplazar_foto()` mete los dos pasos en una transacción. Lo que esta
// prueba comprueba NO es que exista la función: es que cuando la inserción
// falla, EL BORRADO SE DESHACE. Eso solo se ve ejecutándolo.

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const MIG = join(AQUI, '..', 'migrations');

const db = await PGlite.create();
await db.exec(readFileSync(join(AQUI, 'bootstrap.sql'), 'utf8'));
for (const f of readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort()) {
  await db.exec(readFileSync(join(MIG, f), 'utf8'));
}

let ok = 0, bad = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { bad++; console.log(`  FALLA ${n}${extra ? '\n        ' + extra : ''}`); }
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

const S = '2026-W44';
// Lo que de verdad se enseña: lo que no está archivado.
const vivas = async (uid, semana = S, pose = 'frente') => (await as(uid,
  `select storage_path from public.progress_photos
    where user_id='${uid}' and week_key='${semana}' and pose='${pose}'
      and archivado_en is null`)).rows;

// ------------------------------------------------------------------
console.log('— Se cambia una foto y queda la nueva —');
{
  await as(YO, `insert into public.progress_photos
    (user_id, week_key, pose, storage_path, bytes)
    values ('${YO}','${S}','frente','${YO}/${S}/frente-1.webp', 1000)`);

  await as(YO, `select public.reemplazar_foto(
    '${S}','frente','${YO}/${S}/frente-2.webp', 2000, 1080, 1440)`);

  const v = await vivas(YO);
  check('queda una sola foto viva en ese hueco', v.length === 1, JSON.stringify(v));
  check('y es la nueva', v[0]?.storage_path.endsWith('frente-2.webp'), JSON.stringify(v));

  // SIN RLS a propósito. Lo archivado está escondido por política (0007,
  // sección 3), así que mirándolo como el usuario no se ve NUNCA y esta
  // comprobación pasaría igual con la función borrando de verdad. Lo que se
  // quiere saber es si la fila sigue en la tabla, y eso se pregunta por
  // debajo de RLS.
  const arch = (await db.query(
    `select storage_path from public.progress_photos
      where user_id='${YO}' and archivado_en is not null`)).rows;
  check('y la vieja quedó archivada, no borrada',
    arch.some((r) => r.storage_path.endsWith('frente-1.webp')),
    'el archivado es la papelera de la que se restaura, y el borrado dentro ' +
    'de una función `security definer` podría saltárselo: ' + JSON.stringify(arch));
}

// ------------------------------------------------------------------
console.log('\n— Y SI LA NUEVA NO ENTRA, LA VIEJA SIGUE AHÍ —');
{
  // Esta es la prueba entera. Se provoca el fallo con una ruta repetida,
  // que es lo que choca con el índice único de `storage_path`.
  await as(YO, `insert into public.progress_photos
    (user_id, week_key, pose, storage_path, bytes)
    values ('${YO}','${S}','espalda','${YO}/${S}/ocupada.webp', 1000)`);

  const antes = await vivas(YO);
  check('se parte de una foto viva', antes.length === 1, JSON.stringify(antes));

  let reventó = false;
  try {
    await as(YO, `select public.reemplazar_foto(
      '${S}','frente','${YO}/${S}/ocupada.webp', 2000)`);
  } catch { reventó = true; }
  check('la operación falla, como tiene que fallar', reventó);

  const después = await vivas(YO);
  check('Y LA DE ANTES SIGUE VIVA', después.length === 1, JSON.stringify(después));
  check('y es exactamente la misma',
    después[0]?.storage_path === antes[0]?.storage_path,
    'antes: ' + JSON.stringify(antes) + '\n        después: ' + JSON.stringify(después) +
    '\n        si el hueco queda vacío, esa foto no se recupera: es de hace meses');
}

// ------------------------------------------------------------------
console.log('\n— Y una semana mal escrita tampoco se lleva nada por delante —');
{
  const antes = await vivas(YO);
  let reventó = false;
  try {
    await as(YO, `select public.reemplazar_foto(
      'esto-no-es-semana','frente','${YO}/otra.webp', 1)`);
  } catch { reventó = true; }
  check('falla por el formato de la clave', reventó);
  check('y la foto de frente sigue donde estaba',
    (await vivas(YO)).length === 1 &&
    (await vivas(YO))[0].storage_path === antes[0]?.storage_path,
    JSON.stringify(await vivas(YO)));
}

// ------------------------------------------------------------------
console.log('\n— Y nadie toca las de otro —');
{
  // La función es `security definer`: corre saltándose RLS. Si el dueño
  // viniera de un parámetro en vez de `auth.uid()`, cambiar una cadena
  // borraría las fotos de cualquiera.
  await as(OTRO, `insert into public.progress_photos
    (user_id, week_key, pose, storage_path, bytes)
    values ('${OTRO}','${S}','frente','${OTRO}/${S}/suya.webp', 1000)`);

  await as(YO, `select public.reemplazar_foto('${S}','frente','${YO}/${S}/mia-3.webp', 1)`);

  const suyas = (await as(OTRO,
    `select storage_path from public.progress_photos
      where user_id='${OTRO}' and archivado_en is null`)).rows;
  check('la foto del otro sigue intacta',
    suyas.length === 1 && suyas[0].storage_path.endsWith('suya.webp'),
    JSON.stringify(suyas));
}

// ------------------------------------------------------------------
console.log('\n— Y sin sesión no hace nada —');
{
  let reventó = false;
  try {
    await db.exec(`select set_config('request.jwt.claim.sub','',false)`);
    await db.query(`select public.reemplazar_foto('${S}','frente','x/y.webp', 1)`);
  } catch { reventó = true; }
  check('sin sesión se niega', reventó,
    'con `security definer` y sin esta comprobación, la clave anónima ' +
    'escribiría fotos a nombre de nadie');
}

console.log(`\n${ok} pasan · ${bad} fallan`);
process.exit(bad ? 1 : 0);
