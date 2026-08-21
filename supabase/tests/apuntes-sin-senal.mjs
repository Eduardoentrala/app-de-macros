// Que el mecanismo anti-duplicados de "apuntar sin señal" funcione contra
// Postgres de verdad, y no solo en la cabeza de quien lo escribió.
//
// QUÉ SE JUEGA AQUÍ
//
// Desde el cambio de la cola, el teléfono manda el `id` y el `created_at`
// de cada apunte en vez de dejar que los ponga la base. Es lo que hace que
// reintentar sea seguro: si `fetch` se cortó al volver la respuesta, el
// apunte YA está guardado, y el reintento tiene que chocar contra la clave
// primaria en vez de crear un duplicado.
//
// Eso descansa en tres suposiciones que nadie había comprobado:
//
//   1. que la política de RLS deje insertar con un `id` puesto a mano
//      —solo valida `user_id`, pero eso hay que verlo, no suponerlo—
//   2. que no haya un trigger que pise el `created_at` que se manda
//   3. que el segundo intento falle con un mensaje que la app RECONOZCA
//
// La 3 es la delicada: `docs/app.js` decide si un error es "ya estaba" o
// "algo salió mal" mirando el TEXTO del mensaje. Si Postgres dijera otra
// cosa, la app contaría un apunte ya guardado como rechazado y le diría a
// la persona que no se pudo guardar algo que sí está.
//
// Y la 1 tiene un filo: que se pueda poner el id NO puede significar que se
// pueda escribir en la fila de otro. Eso también se comprueba.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const MIG = join(AQUI, '..', 'migrations');
const APP = readFileSync(join(AQUI, '..', '..', 'docs', 'app.js'), 'utf8');

const db = await PGlite.create();
await db.exec(readFileSync(join(AQUI, 'bootstrap.sql'), 'utf8'));
for (const f of readdirSync(MIG).filter(f => f.endsWith('.sql')).sort())
  await db.exec(readFileSync(join(MIG, f), 'utf8'));

let ok = 0, bad = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { bad++; console.log(`  FALLA ${n}${extra ? ' — ' + extra : ''}`); }
};

// Como en seguridad.mjs: sin `set role authenticated` PGlite corre de
// superusuario, el RLS no se aplica y la prueba pasaría siempre.
const as = async (uid, sql) => {
  await db.exec(`select set_config('request.jwt.claim.sub','${uid}',false)`);
  await db.exec('set role authenticated');
  try { return { fila: await db.query(sql), error: null }; }
  catch (e) { return { fila: null, error: e.message.split('\n')[0] }; }
  finally { await db.exec('reset role'); }
};

const YO   = '33333333-3333-3333-3333-333333333333';
const OTRO = '44444444-4444-4444-4444-444444444444';
for (const [k, id] of [['yo', YO], ['otro', OTRO]])
  await db.exec(`insert into auth.users(id,email) values ('${id}','${k}@x.com')`);

// El id y la hora que "manda el teléfono".
const ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const HORA = '2026-08-19T14:30:00.000Z';

console.log('\n— El teléfono puede poner el id y la hora —');
{
  const r = await as(YO, `
    insert into public.diary_entries
      (id, user_id, entry_date, meal, food_name, quantity, unit, protein_g, carbs_g, fat_g, created_at)
    values ('${ID}', '${YO}', current_date, 'Comida', 'Arroz', 150, 'Gramos', 4, 40, 1, '${HORA}')
    returning id, created_at`);
  check('la inserción con id propio pasa el RLS', r.error === null, r.error ?? '');

  if (!r.error) {
    const f = r.fila.rows[0];
    // Si la base lo ignorara y pusiera uno suyo, el reintento no chocaría
    // con nada y crearía el duplicado que todo esto viene a evitar.
    check('y el id guardado es el que se mandó', f.id === ID, String(f.id));
    // Si un trigger lo pisara, todo lo apuntado sin señal aparecería en el
    // diario a la hora en que se sincronizó y no a la que se comió.
    check('y la hora también, sin que la pise un trigger',
      new Date(f.created_at).toISOString() === new Date(HORA).toISOString(),
      String(f.created_at));
  }
}

console.log('\n— Reintentar el mismo apunte no lo duplica —');
{
  // El caso real: `fetch` se cortó al volver la respuesta, así que la app
  // cree que no se guardó y lo manda otra vez.
  const r = await as(YO, `
    insert into public.diary_entries
      (id, user_id, entry_date, meal, food_name, quantity, unit, protein_g, carbs_g, fat_g, created_at)
    values ('${ID}', '${YO}', current_date, 'Comida', 'Arroz', 150, 'Gramos', 4, 40, 1, '${HORA}')`);
  check('el segundo intento falla', r.error !== null,
    'si pasara, habría dos veces la misma comida');

  const n = await as(YO, `select count(*)::int as n from public.diary_entries where id='${ID}'`);
  check('y sigue habiendo una sola fila', n.fila.rows[0].n === 1, 'hay ' + n.fila.rows[0].n);

  // AQUÍ ESTÁ LO IMPORTANTE. La app lee este mensaje para decidir si fue
  // "ya estaba" o "algo salió mal". Se comprueba contra el patrón REAL que
  // usa docs/app.js, sacado del archivo, no contra una copia escrita aquí
  // que podría quedarse vieja.
  console.log('        mensaje de Postgres: ' + r.error);
  const m = /if\(\/([^/]+)\/i\.test\(String\(e\.message \|\| ''\)\)\) subidos\+\+;/.exec(APP);
  check('el patrón de la app sigue estando donde se cree', !!m,
    'si cambió de forma, esta prueba deja de comprobar lo que dice');
  if (m) {
    console.log('        patrón de la app:    /' + m[1] + '/i');
    check('y reconoce lo que dice Postgres', new RegExp(m[1], 'i').test(r.error),
      'la app contaría como rechazado un apunte que SÍ está guardado');
  }
}

console.log('\n— Poner el id no abre la puerta a la fila de otro —');
{
  // Que el cliente elija el id es cómodo, pero no puede convertirse en
  // "escribo donde quiera". El RLS sigue mandando.
  const r = await as(OTRO, `
    insert into public.diary_entries
      (id, user_id, entry_date, meal, food_name, quantity, unit, protein_g, carbs_g, fat_g)
    values ('bbbbbbbb-cccc-4ddd-8eee-ffffffffffff', '${YO}', current_date, 'Cena', 'Colado', 100, 'Gramos', 1, 1, 1)`);
  check('no se puede apuntar comida en el diario ajeno', r.error !== null,
    'entró sin protestar');

  // Y tampoco robar el id de un apunte que ya existe para pisarlo.
  const u = await as(OTRO, `update public.diary_entries set food_name='Cambiado' where id='${ID}'`);
  const v = await as(YO, `select food_name from public.diary_entries where id='${ID}'`);
  check('ni cambiar el apunte de otro conociendo su id',
    v.fila.rows[0].food_name === 'Arroz', 'quedó como ' + v.fila.rows[0].food_name);
}

console.log('\n— Borrar lo propio sigue funcionando —');
{
  // La cola encola borrados cuando el alta ya había subido. Si el DELETE no
  // pasara el RLS, esos borrados se quedarían atascados.
  const r = await as(YO, `delete from public.diary_entries where id='${ID}'`);
  check('el borrado propio pasa', r.error === null, r.error ?? '');
  const n = await as(YO, `select count(*)::int as n from public.diary_entries where id='${ID}'`);
  check('y la fila deja de verse', n.fila.rows[0].n === 0);
}

console.log(`\n${ok} pasan · ${bad} fallan`);
process.exit(bad ? 1 : 0);
