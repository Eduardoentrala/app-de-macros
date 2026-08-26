// Que no nazca una tabla sin candado.
//
// POR QUÉ ESTA PRUEBA EXISTE. En Postgres, una tabla sin `row level security`
// se la ve ENTERA cualquiera que tenga permiso de select — y `authenticated`
// lo tiene, porque es el rol con el que entra cada persona desde su teléfono.
// O sea que a una tabla nueva a la que se le olvide el `enable row level
// security` le pasa lo peor que puede pasarle a esta app: que quien abra la
// suya vea el diario, el peso y las fotos de los demás.
//
// No hay ningún aviso. La tabla funciona perfectamente. La app se ve igual.
// Y las consultas de cada quien traen sus filas porque todas llevan
// `.eq('user_id', ...)` puesto por la propia app — el agujero solo se nota si
// alguien quita ese filtro a mano, cosa que se hace con el navegador abierto
// en dos minutos.
//
// SE LE PREGUNTA A POSTGRES, no al texto de las migraciones. Se intentó
// leyendo los .sql con una expresión regular y dio catorce tablas «sin RLS»
// que sí lo tenían: en `alter table public.alimentos_catalogo  enable row
// level security` hay DOS espacios, y la expresión pedía uno. Trece más
// estaban dentro de un `foreach` de plpgsql que activa el RLS con
// `format('... public.%I ...')`, donde el nombre de la tabla ni siquiera
// aparece escrito. Ninguna de las dos cosas la ve un grep. Las dos las ve
// `pg_class`.
//
// Es la misma lección que ya dio `pg_get_constraintdef`, que normaliza a
// mayúsculas y hacía fallar un LIKE: si se puede preguntar a la base, se
// pregunta a la base.

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

// ------------------------------------------------------------------
const tablas = (await db.query(`
  select c.relname tabla,
         c.relrowsecurity rls,
         (select count(*) from pg_policy p where p.polrelid = c.oid)::int politicas
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
  order by c.relname`)).rows;

console.log('\n— Hay tablas que mirar —');
check(`se encuentran ${tablas.length} tablas`, tablas.length >= 30,
  'si salen pocas, las migraciones no se aplicaron y esto no está mirando nada');

// ------------------------------------------------------------------
console.log('\n— Todas con row level security —');
{
  const sin = tablas.filter((t) => !t.rls).map((t) => t.tabla);
  check('ninguna se quedó sin candado', sin.length === 0,
    'sin RLS, `authenticated` ve la tabla ENTERA: el diario, el peso y las ' +
    'fotos de todo el mundo.\n        Sin candado: ' + sin.join(', '));
}

// ------------------------------------------------------------------
console.log('\n— Y con RLS puesto, alguna política —');
{
  // RLS sin políticas no es un agujero: es lo contrario, niega TODO. Pero es
  // igual de malo, solo que se nota al revés — la pantalla sale vacía y no
  // hay ningún error que lo explique. Casi siempre es una migración a medias.
  const mudas = tablas.filter((t) => t.rls && t.politicas === 0).map((t) => t.tabla);
  check('ninguna niega todo por olvido', mudas.length === 0,
    'con RLS y cero políticas no se ve NADA, ni lo propio, y sin error: la ' +
    'pantalla sale vacía.\n        Mudas: ' + mudas.join(', '));
}

// ------------------------------------------------------------------
console.log('\n— Y anon no toca nada —');
{
  // `anon` es quien no ha iniciado sesión. En Supabase, `revoke ... from
  // public` NO le alcanza: hay que nombrarlo. Ya hay migraciones que lo
  // dicen expresamente; esto vale para las que vengan.
  const suyos = (await db.query(`
    select table_name tabla, string_agg(distinct privilege_type, ',') permisos
    from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'public'
    group by table_name
    order by table_name`)).rows;

  check('no se le concede nada a quien no ha entrado', suyos.length === 0,
    'anon es cualquiera con la URL del proyecto y la clave pública, que va en ' +
    'el JavaScript de la app.\n        Tiene permisos sobre: ' +
    suyos.map((s) => s.tabla + ' (' + s.permisos + ')').join(', '));
}

// ------------------------------------------------------------------
console.log('\n— Y esta prueba se entera si algo falla —');
{
  // Sin esto, un error en la consulta —un nombre de columna que cambie, un
  // `relkind` que deje de ser 'r'— dejaría las listas vacías y todo en verde
  // para siempre. Se crea una tabla sin candado a propósito y tiene que salir.
  await db.exec(`create table public.prueba_sin_candado (id int)`);
  const otra = (await db.query(`
    select c.relname tabla, c.relrowsecurity rls
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`)).rows;
  check('una tabla sin candado se detecta',
    otra.length === 1 && otra[0].tabla === 'prueba_sin_candado',
    'la consulta dejó de encontrar lo que buscaba: todo lo de arriba está ' +
    'pasando en falso. Devolvió: ' + JSON.stringify(otra));
  await db.exec(`drop table public.prueba_sin_candado`);
}

console.log(`\n${ok} pasan · ${bad} fallan`);
process.exit(bad ? 1 : 0);
