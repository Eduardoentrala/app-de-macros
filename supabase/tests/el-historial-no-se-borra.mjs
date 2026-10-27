// El historial de semanas NO se borra solo.
//
// La 0054 lo limpiaba a los doce meses con un disparador al escribir. La
// 0055 lo quita, y esta prueba existe para que no vuelva sin querer: es el
// tipo de cosa que se reintroduce de buena fe —«esto crece sin control»—
// sin medir cuánto crece.
//
// LO QUE SE MIDIÓ antes de quitarlo, en la base de produccion:
//   · chequeos_semanales entera, con el historial de todos ..... 96 kB
//   · una sola foto de progreso .............................. 182 kB
//   · son 52 filas al año por persona
//
// Y el defecto que lo condenaba: el borrado saltaba al ESCRIBIR tu propio
// chequeo. A quien contesta cada lunes se le llevaba su primer año; a
// quien dejó la app, nada. Castigaba al constante.
//
// Donde sí se borra todo es al borrar la cuenta (`purgar_persona`), que es
// donde esa decisión le toca a la persona.
//
// Se ejecuta contra Postgres de verdad (PGlite), con las migraciones tal y
// como se van a aplicar.

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const MIG = join(AQUI, '..', 'migrations');

const db = await PGlite.create();
await db.exec(readFileSync(join(AQUI, 'bootstrap.sql'), 'utf8'));
for (const f of readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort())
  await db.exec(readFileSync(join(MIG, f), 'utf8'));

let ok = 0, bad = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log('  PASA  ' + n); }
  else { bad++; console.log('  FALLA ' + n + (extra ? '\n        ' + extra : '')); }
};

const ANA = '11111111-1111-1111-1111-111111111111';
const BETO = '22222222-2222-2222-2222-222222222222';

await db.exec(`
  insert into auth.users (id, email) values
    ('${ANA}',  'ana@ejemplo.com'),
    ('${BETO}', 'beto@ejemplo.com')
  on conflict do nothing;
`);

// Se escribe SIN sesión, como el dueño de la base: aquí no se prueba quién
// puede escribir —eso lo cubren las políticas de la 0024— sino que nada se
// borre por antigüedad.
const meter = (quien, hace) => db.exec(
  `insert into public.chequeos_semanales (user_id, semana, hambre)
   values ('${quien}', (current_date - interval '${hace}')::date, 3)
   on conflict (user_id, semana) do update set hambre = excluded.hambre;`);

const cuantas = async (quien) =>
  Number((await db.query(
    `select count(*)::int as n from public.chequeos_semanales where user_id = '${quien}'`
  )).rows[0].n);

// ------------------------------------------------------------------
console.log('\n— Ni el disparador ni la función siguen ahí —');
{
  const t = Number((await db.query(
    `select count(*)::int n from pg_trigger
      where tgname = 'chequeos_limpiar' and not tgisinternal`)).rows[0].n);
  check('el disparador se fue', t === 0,
    'volvió `chequeos_limpiar`: eso borra el historial de quien sigue usando la app');

  const f = Number((await db.query(
    `select count(*)::int n from pg_proc
      where proname = 'limpiar_chequeos_viejos'`)).rows[0].n);
  check('y la función también', f === 0);
}

console.log('\n— Y lo viejo sobrevive a escribir encima —');
{
  // El caso exacto que antes lo borraba: tener historial viejo y contestar
  // el chequeo de esta semana.
  await meter(ANA, '26 months');
  await meter(ANA, '20 months');
  await meter(ANA, '13 months');
  await meter(ANA, '3 months');
  check('se puede sembrar historial viejo sin apagar nada', await cuantas(ANA) === 4,
    'hay ' + (await cuantas(ANA)) + ': antes hacía falta desactivar el disparador ' +
    'para montar este escenario, porque la fila se borraba al ponerla');

  await meter(ANA, '7 days');        // ESTA escritura era la que limpiaba
  check('escribir el de esta semana no se lleva nada', await cuantas(ANA) === 5,
    'quedan ' + (await cuantas(ANA)) + ' de 5');

  // Y repetir el mismo lunes, que entraba por la rama del update.
  await meter(ANA, '7 days');
  check('ni contestar dos veces el mismo lunes', await cuantas(ANA) === 5,
    'quedan ' + (await cuantas(ANA)) + ' de 5');
}

console.log('\n— Y nadie toca el historial de otro —');
{
  await meter(BETO, '30 months');
  await meter(ANA, '1 day');
  check('lo de Beto sigue entero', await cuantas(BETO) === 1,
    'el fallo que mas miedo daba del disparador era `delete` sin filtrar por ' +
    'persona: el lunes de cualquiera se llevaba el historial del resto');
}

console.log('\n— Pero borrar la cuenta sí se lo lleva —');
{
  // Ahí es donde el «no guardar para siempre» tiene que vivir: en la
  // decisión de la persona, no en un plazo silencioso.
  await db.exec(`delete from auth.users where id = '${ANA}'`);
  check('sin su cuenta no queda historial suyo', await cuantas(ANA) === 0,
    'quedan ' + (await cuantas(ANA)) + ': el borrado en cascada es lo que hace ' +
    'verdad el «se borra todo de verdad» del aviso de privacidad');
  check('y el de Beto sigue', await cuantas(BETO) === 1);
}

console.log(`\n${ok} pasan · ${bad} fallan`);
process.exit(bad ? 1 : 0);
