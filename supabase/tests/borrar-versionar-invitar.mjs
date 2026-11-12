// Tres disparadores que no tocaba ninguna prueba.
//
// De las 81 funciones del esquema había 32 que ninguna prueba nombraba
// siquiera. Estas tres son las que más consecuencia tienen:
//
//  · `archivar_en_vez_de_borrar` convierte un DELETE en una marca. Si una
//    tabla se queda fuera de su lista, ahí los borrados son DE VERDAD y
//    nadie lo nota hasta que alguien quiere recuperar algo. Y la lista
//    vive dentro de un `do $$ ... foreach` con `format('%I')`, así que no
//    hay búsqueda de texto que la encuentre: es la misma trampa que ya
//    me hizo creer que catorce tablas no tenían RLS.
//
//  · `versionar_metas` guarda el histórico de sus macros. Es de donde
//    sale «vienes de 2.400 y ahora estás en 2.250».
//
//  · `normalizar_correo_invitacion` decide si invitar a «Pepe@X.com»
//    sirve para quien se registra como «pepe@x.com».
//
// No se comprueba que el código diga lo que dice: se ejecutan contra un
// Postgres de verdad y se mira qué queda en las tablas.

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

let ok = 0, mal = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { mal++; console.log(`  FALLA ${n}${extra ? '\n        ' + extra : ''}`); }
};

const ADMIN = '11111111-1111-1111-1111-111111111111';
const LETY  = '33333333-3333-3333-3333-333333333333';
for (const [n, id] of [['admin', ADMIN], ['lety', LETY]])
  await db.exec(`insert into auth.users (id, email) values ('${id}', '${n}@x.com')`);

const uno = async (sql) => (await db.query(sql)).rows[0];
const todas = async (sql) => (await db.query(sql)).rows;

// ====================================================================
console.log('\n— Borrar no borra: archiva —');
{
  // Qué tablas tienen el disparador puesto, preguntándoselo a Postgres y
  // no leyendo el SQL: la lista está dentro de un `foreach` con `%I`.
  const conArchivo = (await todas(`
    select c.relname as tabla
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_proc p on p.oid = t.tgfoid
     where p.proname = 'archivar_en_vez_de_borrar' and not t.tgisinternal
     order by 1`)).map((r) => r.tabla);

  check(`el disparador está en ${conArchivo.length} tablas`, conArchivo.length >= 5,
    'salieron: ' + conArchivo.join(', '));

  // Y LAS QUE NO LO TIENEN, que es la pregunta de verdad: ahí un DELETE
  // borra de verdad. No está mal que las haya; lo que no puede ser es que
  // nadie sepa cuáles son.
  const conMarca = (await todas(`
    select table_name from information_schema.columns
     where table_schema = 'public' and column_name = 'archivado_en'
     order by 1`)).map((r) => r.table_name);
  const marcaSinDisparador = conMarca.filter((t) => !conArchivo.includes(t));
  check('ninguna tabla tiene la marca de archivado sin el disparador',
    marcaSinDisparador.length === 0,
    'tienen `archivado_en` y se borran de verdad: ' + marcaSinDisparador.join(', ') +
    '\n        la columna promete que se archiva y el DELETE se lo lleva');

  // Y el comportamiento, con una receta.
  await db.exec(`insert into public.recipes (id, user_id, name)
                 values ('aaaaaaaa-0000-0000-0000-000000000001', '${LETY}', 'Arroz')`);
  await db.exec(`delete from public.recipes where name = 'Arroz'`);
  const r = await uno(`select name, archivado_en from public.recipes where name = 'Arroz'`);
  check('la fila sigue ahí después del DELETE', !!r);
  check('y queda marcada con la fecha', !!(r && r.archivado_en),
    'sin la marca es una fila viva que nadie quería');

  // Borrarla otra vez no rehace la marca: la fecha de cuándo se borró es
  // la primera, no la última vez que alguien le dio.
  // CON MILISEGUNDOS. Esto se comparaba con `String(fecha)`, y `String()`
  // sobre un Date da «Thu Nov 12 2026 17:47:33 GMT+0000»: SIN milisegundos.
  // O sea que la fecha se movía 55 ms, la comprobación no veía nada y
  // pasaba en verde con el guardia quitado. Lo cazó la mutación.
  const antes = r && r.archivado_en && r.archivado_en.toISOString();
  await db.exec(`select pg_sleep(0.05)`);
  await db.exec(`delete from public.recipes where name = 'Arroz'`);
  const r2 = await uno(`select archivado_en from public.recipes where name = 'Arroz'`);
  const ahora = r2 && r2.archivado_en && r2.archivado_en.toISOString();
  check('y volver a borrarla no mueve la fecha', !!ahora && ahora === antes,
    'antes: ' + antes + ' · ahora: ' + ahora +
    '\n        la fecha es CUÁNDO se borró, no la última vez que alguien le dio');

  // Y con la llave puesta se borra de verdad. Es la que usa el borrado de
  // cuenta: si no funcionara, «borrar mi cuenta» dejaría todo donde estaba.
  await db.exec(`set app.borrado_definitivo = 'on'`);
  await db.exec(`delete from public.recipes where name = 'Arroz'`);
  await db.exec(`set app.borrado_definitivo = 'off'`);
  const r3 = await uno(`select name from public.recipes where name = 'Arroz'`);
  check('con `app.borrado_definitivo` sí se va', !r3,
    'es la llave del borrado de cuenta: sin ella, «bórralo todo» no borra nada');
}

// ====================================================================
console.log('\n— El histórico de los macros —');
{
  const versiones = () => todas(
    `select proteina_g, carbos_g, grasas_g, hasta from public.metas_macros_versiones
      where user_id = '${LETY}' order by desde, proteina_g nulls first`);

  const alPrincipio = await versiones();

  await db.exec(`update public.profiles
                    set goal_protein_g = 150, goal_carbs_g = 200, goal_fat_g = 60
                  where id = '${LETY}'`);
  const v1 = await versiones();
  check('poner macros abre una versión', v1.length === alPrincipio.length + 1,
    'había ' + alPrincipio.length + ', hay ' + v1.length);
  check('y queda abierta', v1[v1.length - 1].hasta === null);

  // Guardar lo mismo NO abre otra: si no, cada vez que se toca cualquier
  // cosa del perfil se apuntaría una versión igual a la anterior y el
  // histórico dejaría de decir nada.
  await db.exec(`update public.profiles set goal_protein_g = 150 where id = '${LETY}'`);
  check('y volver a guardar lo mismo no abre otra',
    (await versiones()).length === v1.length,
    'hay ' + (await versiones()).length);

  await db.exec(`update public.profiles set goal_carbs_g = 180 where id = '${LETY}'`);
  const v2 = await versiones();
  check('cambiar algo sí abre otra', v2.length === v1.length + 1);
  const abiertas = v2.filter((x) => x.hasta === null);
  check('y solo hay UNA abierta', abiertas.length === 1,
    'abiertas: ' + abiertas.length + '. Con dos, «cuáles son tus macros de ' +
    'ahora» tiene dos respuestas');
  check('la abierta es la nueva', abiertas[0] && Number(abiertas[0].carbos_g) === 180,
    JSON.stringify(abiertas[0]));
}

// ====================================================================
console.log('\n— Invitar a «Pepe@X.com » —');
{
  // OJO CON EL NOMBRE DE LA COLUMNA: aquí es `rol` y en `profiles` es
  // `role`. Las dos cosas son el papel de alguien y se llaman distinto, y
  // eso ya engañó a una búsqueda: buscando `new.rol` por todo el esquema
  // parecía que nadie impedía cambiarse el propio rol —que sería escalada
  // de privilegios—, y el guardia estaba ahí, escrito `new.role`.
  await db.exec(`insert into public.invitaciones (correo, rol, invitado_por)
                 values ('  Pepe@Ejemplo.COM  ', 'cliente', '${ADMIN}')`);
  const i = await uno(`select correo from public.invitaciones
                        where correo like '%ejemplo%'`);
  check('el correo se guarda en minúsculas y sin espacios',
    i && i.correo === 'pepe@ejemplo.com',
    'quedó: ' + JSON.stringify(i && i.correo) +
    '\n        quien se registre como «pepe@ejemplo.com» no encontraría su ' +
    'invitación y entraría como cliente suelto');

  // Y al CORREGIRLO también. El disparador dice `insert or update of
  // correo`; si solo cubriera el alta, arreglar una errata a mano dejaría
  // el correo torcido otra vez.
  await db.exec(`update public.invitaciones set correo = ' OTRO@Ejemplo.com '
                  where correo = 'pepe@ejemplo.com'`);
  const j = await uno(`select correo from public.invitaciones
                        where correo like '%otro%'`);
  check('y al corregirlo también', j && j.correo === 'otro@ejemplo.com',
    'quedó: ' + JSON.stringify(j && j.correo));
}

// ====================================================================
console.log('\n— «Borra mi cuenta» se lo tiene que llevar TODO —');
{
  // `borrar_usuario_definitivo` no lleva lista de tablas: abre la compuerta
  // y hace `delete from profiles`. Todo lo demás se va POR LAS CASCADAS de
  // las claves foráneas. O sea que la promesa del aviso de privacidad
  // —«se borra todo lo tuyo»— depende entera de que cada tabla con datos
  // de alguien cascadee.
  //
  // `borrar-cuenta` comprueba que se van el perfil, los pesos y el diario.
  // Esto comprueba LAS QUE HAYA, sin lista que mantener: se le pregunta al
  // esquema. Una tabla nueva sin cascada aparece aquí sola.
  const fks = await todas(`
    select c.conname, t.relname as tabla, a.attname as columna,
           dest.relname as apunta_a, c.confdeltype as al_borrar
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_class dest on dest.oid = c.confrelid
      join pg_namespace n on n.oid = t.relnamespace
      join unnest(c.conkey) as k(att) on true
      join pg_attribute a on a.attrelid = t.oid and a.attnum = k.att
     where c.contype = 'f' and n.nspname = 'public'
       and (dest.relname = 'profiles' or dest.relname = 'users')
     order by t.relname, a.attname`);

  check(`hay ${fks.length} claves foráneas que apuntan a una persona`, fks.length > 10,
    'si salen tres, la consulta no está mirando lo que cree');

  // «De quién son estos datos» frente a «quién hizo esto». Las segundas
  // NO deben cascadear: si un entrenador borra su cuenta, el ajuste que
  // le hizo a alguien no se borra, se queda sin firma.
  const DE_QUIEN = ['user_id', 'cliente_id', 'id'];
  const deQuien = fks.filter((f) => DE_QUIEN.includes(f.columna));
  const quienLoHizo = fks.filter((f) => !DE_QUIEN.includes(f.columna));

  const sinCascada = deQuien.filter((f) => f.al_borrar !== 'c');
  check('todo lo que es DE alguien se va con su cuenta',
    sinCascada.length === 0,
    'sin cascada: ' + sinCascada.map((f) => f.tabla + '.' + f.columna +
      ' (' + f.al_borrar + ')').join(', ') +
    '\n        sin `on delete cascade` esas filas sobreviven al borrado y la ' +
    'app estaría prometiendo en el aviso de privacidad algo que no cumple');

  // Y al revés: una firma que cascadee se llevaría por delante el dato de
  // OTRA persona cuando el entrenador se da de baja.
  //
  // DOS EXCEPCIONES, y conviene saber por qué son distintas:
  //
  //  · `coach_clientes.coach_id` cascadea y DEBE cascadear. Esa fila no es
  //    el dato de nadie: es la relación entre los dos. Si el entrenador se
  //    va, la relación se va. Mi primera versión de esta comprobación la
  //    marcó como fallo, y el fallo era la comprobación.
  //
  //  · `analisis_cliente.pedido_por` cascadea y NO debería. Esa fila está
  //    indexada por `cliente_id` —es el análisis DE esa persona— y se
  //    borra entera cuando el entrenador que lo pidió cierra su cuenta.
  //    Se deja anotado aquí en vez de cambiarlo a escondidas: cambiarlo
  //    pide una migración a mano y es decisión suya.
  const DE_RELACION = ['coach_clientes.coach_id'];
  const CONOCIDAS = ['analisis_cliente.pedido_por'];
  const firmaQueArrastra = quienLoHizo
    .filter((f) => f.al_borrar === 'c')
    .map((f) => f.tabla + '.' + f.columna)
    .filter((x) => !DE_RELACION.includes(x) && !CONOCIDAS.includes(x));
  check('y lo que solo dice QUIÉN lo hizo no arrastra el dato de nadie',
    firmaQueArrastra.length === 0,
    'cascadean: ' + firmaQueArrastra.join(', ') +
    '\n        si el entrenador borra su cuenta, el ajuste que le hizo a ' +
    'alguien desaparecería del historial de esa persona');
}

// ====================================================================
console.log('\n— Y lo que se exporta se puede leer de verdad —');
{
  // «Descargar mis datos» recorre `TABLAS_MIAS` pidiendo cada tabla con el
  // token de esa persona. Si una de esas tablas NO la puede leer, PostgREST
  // no da error: devuelve una lista vacía. O sea que el fichero descargado
  // dice «de esto no hay nada» sobre algo que sí hay.
  //
  // `analisis_cliente` es exactamente ese caso, y a propósito: su política
  // de lectura empieza por `cliente_id <> auth.uid()`, que excluye a la
  // propia persona. Son las notas que el entrenador escribe SOBRE ella.
  const LETY2 = '55555555-5555-5555-5555-555555555555';
  const COACH2 = '66666666-6666-6666-6666-666666666666';
  for (const [n, id] of [['lety2', LETY2], ['coach2', COACH2]])
    await db.exec(`insert into auth.users (id, email) values ('${id}', '${n}@x.com')`);
  await db.exec(`update public.profiles set role = 'coach' where id = '${COACH2}'`);
  await db.exec(`insert into public.coach_clientes (coach_id, cliente_id)
                 values ('${COACH2}', '${LETY2}')`);
  await db.exec(`insert into public.analisis_cliente (cliente_id, pedido_por, mensaje)
                 values ('${LETY2}', '${COACH2}', 'Va bien')`);

  const comoElla = async (sql) => {
    await db.exec(`select set_config('request.jwt.claim.sub','${LETY2}',false)`);
    await db.exec('set role authenticated');
    try { return (await db.query(sql)).rows; }
    finally { await db.exec('reset role'); }
  };
  const suyas = await comoElla(
    `select mensaje from public.analisis_cliente where cliente_id = '${LETY2}'`);

  check('la fila existe en la base',
    (await todas(`select 1 from public.analisis_cliente
                   where cliente_id = '${LETY2}'`)).length === 1);
  check('pero ella no la ve: la política la excluye a propósito',
    suyas.length === 0,
    'devolvió ' + suyas.length + ' filas. Si esto cambia, cambió la ' +
    'política y hay que revisar la decisión de abajo');

  // ASÍ QUE LA EXPORTACIÓN LA PIDE PARA NADA. No se cambia aquí —si las
  // notas del entrenador deben poder descargarse es una decisión suya, no
  // de una prueba—, pero queda escrito que hoy esa línea del fichero sale
  // vacía siempre, diga lo que diga la base.
  const APP = readFileSync(join(AQUI, '..', '..', 'docs', 'app.js'), 'utf8');
  const i = APP.indexOf('var TABLAS_MIAS');
  const enLaLista = APP.slice(i, APP.indexOf('];', i)).includes("'analisis_cliente'");
  check('y sigue estando en la lista de la descarga (queda dicho)', enLaLista,
    'si se quitó, bien: entonces hay que borrar esta comprobación y su ' +
    'explicación, porque ya no describe nada');
}

console.log('\n' + ok + ' pasan · ' + mal + ' fallan');
process.exit(mal ? 1 : 0);
