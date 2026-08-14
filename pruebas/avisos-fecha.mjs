// Los avisos del entrenador, con la fecha del teléfono.
//
// EL FALLO, MEDIDO EN PRODUCCIÓN el 13 de agosto de 2026 a las 19:39 de
// México:
//
//   now() en UTC ............................... 2026-08-14 01:39
//   current_date, el que usaban las funciones .. 2026-08-14
//   la fecha real en México .................... 2026-08-13
//   días apuntados en [current_date-6, current_date] ... 6
//   días apuntados en la ventana correcta ............. 7
//
// Las comidas se guardan con `entry_date` = la fecha del TELÉFONO. Las
// funciones leían con `current_date`, que va en UTC. Desde las 18:00 de
// México, para la base ya es mañana: la ventana de siete días incluía un
// día que todavía no podía tener nada apuntado y descartaba el más antiguo
// que sí lo tenía.
//
// Consecuencia: "racha" era IMPOSIBLE abriendo la app por la tarde. Nunca
// llegaba a 7 de 7 y salía "semana_buena" en su lugar. Encaja con los
// datos reales: el único aviso de racha se creó un día a las 14:56, cuando
// en UTC todavía era el mismo día.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');
const SQL = readFileSync(join(RAIZ, 'supabase', 'migrations',
  '0038_avisos_con_la_fecha_del_telefono.sql'), 'utf8');

let ok = 0, mal = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { mal++; console.log(`  FALLA ${n}${extra ? '\n        ' + extra : ''}`); }
};

console.log('\n— El teléfono dice qué día es —');
{
  const i = APP.indexOf('function revisarAvisoDelCoach(');
  const fn = APP.slice(i, i + 2200);
  check('la función existe', i > 0);
  check('se manda la fecha al preguntar si toca',
    /aviso_pendiente', \{ p_usuario: sesion\.user\.id, p_hoy: isoDe\(HOY\) \}/.test(fn),
    'sin esto se usa current_date, que va en UTC, y por la tarde mira un dia que no existe');
  check('y también al guardar',
    /guardar_aviso', \{ p_motivo: motivo, p_texto: r\.texto, p_hoy: isoDe\(HOY\) \}/.test(fn));

  // LAS DOS TIENEN QUE LLEVAR LA MISMA. guardar_aviso revalida el motivo:
  // con fechas distintas, se pide el aviso con una y se guarda comprobando
  // con otra, y el guardado falla DESPUES de haber pagado la consulta de IA.
  const a = fn.indexOf("aviso_pendiente'"), b = fn.indexOf("guardar_aviso'");
  const dosVeces = (fn.match(/p_hoy: isoDe\(HOY\)/g) || []).length;
  check('las dos con la misma fecha', a > 0 && b > a && dosVeces === 2,
    'con fechas distintas se paga la IA y luego el guardado la rechaza');

  // La misma que se usa para escribir las comidas.
  check('es la fecha con la que se apunta la comida', /isoDe\(HOY\)/.test(fn),
    'si el dato se escribe con la fecha del telefono, tiene que leerse igual');
}

console.log('\n— Y la base la usa en vez de la suya —');
{
  const i = SQL.indexOf('create or replace function public.motivo_de_aviso');
  const j = SQL.indexOf('revoke execute on function public.motivo_de_aviso');
  const fn = SQL.slice(i, j);
  check('recibe la fecha', /p_usuario uuid, p_hoy date default null/.test(fn));
  check('y la resuelve una sola vez', /v_hoy\s+date := public\.dia_de_la_persona\(p_hoy\)/.test(fn));

  // Los tres sitios donde estaba el fallo.
  check('«ausente» mira el día de la persona', /v_ultimo_diario < v_hoy - 3/.test(fn));
  check('«estancado» también', /log_date <= v_hoy - 14/.test(fn));
  check('y la ventana de la racha', /generate_series\(v_hoy - 6, v_hoy, '1 day'\)/.test(fn),
    'esta es la que hacia imposible la racha por las tardes');

  // Sin comentarios: que no quede ni un current_date suelto decidiendo días.
  const sinComentar = fn.replace(/--[^\n]*/g, '');
  check('no queda ningún current_date decidiendo', !/current_date/.test(sinComentar),
    'cualquiera que quede vuelve a traer el desfase de zona horaria');
}

console.log('\n— Con tope, para que nadie se fabrique una racha —');
{
  const i = SQL.indexOf('create or replace function public.dia_de_la_persona');
  const fn = SQL.slice(i, SQL.indexOf('comment on function public.dia_de_la_persona'));
  check('existe el tope', i > 0);
  check('sin fecha, la del servidor', /when p_hoy is null then current_date/.test(fn));
  // Un dia es todo el margen que necesita cualquier zona horaria. Mas que
  // eso no es una zona horaria: es un reloj mal puesto o alguien probando.
  check('más de un día de diferencia se ignora',
    /abs\(p_hoy - current_date\) > 1 then current_date/.test(fn),
    'sin tope, mandando una fecha inventada se consigue la racha que se quiera');
  check('y si es creíble, se usa', /else p_hoy/.test(fn));
}

console.log('\n— Las viejas se borran, no se quedan al lado —');
{
  // Añadir un parametro NO reemplaza la funcion: crea otra al lado. La
  // vieja -la que tiene el fallo- seguiria ahi y seguiria siendo llamable.
  check('se suelta guardar_aviso viejo',
    /drop function if exists public\.guardar_aviso\(public\.motivo_aviso, text\);/.test(SQL));
  check('se suelta aviso_pendiente viejo',
    /drop function if exists public\.aviso_pendiente\(uuid\);/.test(SQL));
  check('se suelta motivo_de_aviso viejo',
    /drop function if exists public\.motivo_de_aviso\(uuid\);/.test(SQL),
    'si se queda, la version con el fallo sigue siendo llamable');
  // De fuera hacia dentro: guardar_aviso llama a aviso_pendiente, que llama
  // a motivo_de_aviso.
  check('en el orden correcto',
    SQL.indexOf('drop function if exists public.guardar_aviso') <
    SQL.indexOf('drop function if exists public.aviso_pendiente') &&
    SQL.indexOf('drop function if exists public.aviso_pendiente') <
    SQL.indexOf('drop function if exists public.motivo_de_aviso'));
}

console.log('\n— Lo que NO cambia —');
{
  const i = SQL.indexOf('create or replace function public.aviso_pendiente');
  const fn = SQL.slice(i, SQL.indexOf('revoke execute on function public.aviso_pendiente'));
  // El descanso de siete dias entre avisos del mismo motivo es tiempo
  // transcurrido de verdad, no "que dia es para esta persona". Ahi now() es
  // lo correcto y cambiarlo seria arreglar lo que no estaba roto.
  check('el descanso de 7 días sigue con now()',
    /creado_en > now\(\) - interval '7 days'/.test(fn),
    'eso es tiempo transcurrido, no el dia de nadie');
  check('siguen sin amontonarse', /visto_en is null/.test(fn));
  // Y guardar_aviso sigue revalidando: si la app pudiera insertar a secas,
  // cualquiera se escribiria sus propios avisos.
  check('guardar sigue revalidando el motivo',
    /public\.aviso_pendiente\(v_yo, p_hoy\) is distinct from p_motivo/.test(SQL));
  check('y sigue exigiendo sesión', /if v_yo is null then/.test(SQL));
}

console.log('\n— Y los permisos se rehacen —');
{
  // Al borrar y recrear, los permisos de la funcion vieja se van con ella.
  for (const f of ['motivo_de_aviso(uuid, date)', 'aviso_pendiente(uuid, date)',
                   'guardar_aviso(public.motivo_aviso, text, date)',
                   'dia_de_la_persona(date)']) {
    const esc = f.replace(/[().,]/g, (c) => '\\' + c);
    check(`${f.split('(')[0]} fuera de anon`,
      new RegExp('revoke execute on function public\\.' + esc + ' from public, anon').test(SQL),
      '«revoke from public» por si solo NO alcanza a anon en Supabase');
    check(`  ...y disponible con sesión`,
      new RegExp('grant  execute on function public\\.' + esc + ' to authenticated').test(SQL));
  }
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);
