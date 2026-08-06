// La migración que suelta tablas muertas.
//
// Es la única del proyecto que BORRA y no se deshace, así que lo que se
// comprueba aquí no es que funcione: es que se niegue a funcionar cuando no
// debe. Un `drop table` que se ejecuta a ciegas un martes cualquiera, meses
// después de haberlo escrito, es la forma más fácil de perder datos de
// alguien.
//
// Lo que casi se me escapa, y por eso hay tantas comprobaciones de ataduras:
// las tres tablas están VACÍAS, así que una guarda que solo contara filas
// habría dado luz verde. Pero `routine_exercises` -que está muy viva- tenía
// una clave foránea a exercise_library, y la función `acepto()` leía
// consentimientos. Ninguna de las dos cosas se ve contando filas.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SQL = readFileSync(
  join(RAIZ, 'supabase', 'migrations', '0034_soltar_tablas_muertas.sql'), 'utf8');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8');

let ok = 0, mal = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { mal++; console.log(`  FALLA ${n}${extra ? '\n        ' + extra : ''}`); }
};

const MUERTAS = ['exercise_library', 'exercise_notes', 'consentimientos'];

console.log('\n— Primero se niega, después borra —');
{
  const iGuarda = SQL.indexOf('do $guarda$');
  const iPrimerBorrado = Math.min(
    ...['alter table public.routine_exercises drop column',
        'drop function if exists public.acepto',
        'drop table if exists'].map(s => {
      const i = SQL.indexOf(s); return i < 0 ? Infinity : i;
    }));
  check('hay guarda', iGuarda >= 0);
  check('la guarda va ANTES de cualquier borrado', iGuarda >= 0 && iGuarda < iPrimerBorrado,
    `guarda en ${iGuarda}, primer borrado en ${iPrimerBorrado}`);
  // `raise notice` avisaría y seguiría borrando. Tiene que ABORTAR.
  check('aborta de verdad, no solo avisa',
    (SQL.match(/raise exception/g) || []).length >= 2);
  check('y lo dice claro', /No se borra NADA/.test(SQL));
}

console.log('\n— Cuenta filas en las tres —');
{
  for (const t of MUERTAS)
    check(`${t} está en la lista de la guarda`,
      new RegExp(`'${t}'`).test(SQL.slice(SQL.indexOf('foreach t in array'), SQL.indexOf('loop') + 400)));
  check('cuenta de verdad', /select count\(\*\) from public\.%I/.test(SQL));
  check('una sola fila ya lo para', /if n > 0 then/.test(SQL));
  // Si la tabla ya no está, no es un error: la migración puede reejecutarse.
  check('si ya no existe, sigue sin quejarse',
    /to_regclass\('public\.' \|\| t\) is null/.test(SQL) && /continue;/.test(SQL));
}

console.log('\n— Y también las ataduras, que no se ven contando filas —');
{
  // ESTA es la comprobación que salva la migración. Las tres tablas están
  // vacías; lo que las sujetaba no lo estaba.
  check('mira la columna que sujeta la clave foránea',
    /routine_exercises.*exercise_id is not null/s.test(SQL));
  check('y aborta si alguien la usa',
    /ABORTADO: % ejercicio\(s\) de rutina usan exercise_id/.test(SQL));
  // Sin esto, volver a ejecutar la migración revienta al compilar la
  // consulta, porque la columna ya no está.
  check('pregunta si la columna existe antes de contarla',
    /information_schema\.columns/.test(SQL) &&
    SQL.indexOf('information_schema.columns') < SQL.indexOf('exercise_id is not null'));
}

console.log('\n— Se borra en el orden que no rompe nada —');
{
  const orden = [
    ['la columna que apunta', 'alter table public.routine_exercises drop column if exists exercise_id'],
    ['la función que leía consentimientos', 'drop function if exists public.acepto(text, text)'],
    ['exercise_notes', 'drop table if exists public.exercise_notes'],
    ['consentimientos', 'drop table if exists public.consentimientos'],
    ['exercise_library', 'drop table if exists public.exercise_library']
  ];
  let previo = -1;
  for (const [nombre, aguja] of orden) {
    const i = SQL.indexOf(aguja);
    check(`suelta ${nombre}`, i > 0, aguja);
    if (i > 0 && previo >= 0) check(`  ...y va después de lo anterior`, i > previo);
    if (i > 0) previo = i;
  }
  // La columna primero: así exercise_library se suelta sin cascade.
  check('la columna se suelta antes que su tabla',
    SQL.indexOf('drop column if exists exercise_id') <
    SQL.indexOf('drop table if exists public.exercise_library'));
}

console.log('\n— Nada de CASCADE —');
{
  // Con cascade, algo que dependiera de estas tablas sin que lo supiéramos
  // se iría por delante en silencio. Sin él, el borrado falla y lo dice.
  //
  // Se miran las ÓRDENES, no los comentarios: el archivo explica por qué no
  // se usa cascade, y buscar la palabra a secas encontraba esa explicación.
  const ordenes = SQL.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
  check('ninguna orden lleva cascade', !/cascade/i.test(ordenes),
    (ordenes.match(/.*cascade.*/i) || [''])[0]);
  check('y está dicho por qué', /NADA DE `CASCADE`, a proposito/.test(SQL));
}

console.log('\n— Y la app ya no las nombra —');
{
  // Si la app siguiera pidiéndolas, esto no sería limpieza: sería romperla.
  for (const t of MUERTAS)
    check(`la app no usa ${t}`, !APP.includes(t) && !HTML.includes(t));
  check('la app tampoco llama a acepto()', !/rpc\/acepto/.test(APP));
  // Y la rutina sigue guardando el ejercicio por nombre, que es lo que
  // hacía que exercise_id sobrara.
  check('la rutina sigue leyendo el ejercicio por nombre',
    /routine_exercises\?select=id,routine_day_id,name,sort_order/.test(APP));
  check('y nunca pide exercise_id', !/[?&]select=[^']*\bexercise_id\b/.test(APP));
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);
