// Dos cosas que salieron persiguiendo por qué un aviso mencionaba una
// barbacoa de la semana anterior.
//
//  1. EL TOPE DIARIO SE REINICIABA A LAS 6 DE LA TARDE
//
//     Medido en producción el 13 de agosto de 2026:
//       2026-08-14: 3 consultas  (la última el 13 ago a las 19:27)
//       2026-08-13: 1 consulta   (la última el 13 ago a las 11:xx)
//     Dos filas de días distintos, y las cuatro son del mismo día mexicano.
//
//     A quien lo usa le regala consultas, así que nadie se queja. Pero el
//     tope no está para racionar: está para que un token robado no vacíe la
//     cuenta en una noche. Así se podía gastar el DOBLE en un solo día.
//
//  2. LA MEMORIA DE LA IA NO TIENE FECHAS
//
//     Por eso juntó en la misma frase una barbacoa de la semana anterior y
//     un budín de ese mismo día. Para ella las dos son "lo que sé de esta
//     persona", sin cuándo.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SQL = readFileSync(join(RAIZ, 'supabase', 'migrations',
  '0039_el_tope_diario_se_reinicia_a_medianoche.sql'), 'utf8');
const FN = readFileSync(join(RAIZ, 'supabase', 'functions', 'asistente', 'index.ts'), 'utf8');

let ok = 0, mal = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { mal++; console.log(`  FALLA ${n}${extra ? '\n        ' + extra : ''}`); }
};

console.log('\n— El tope corta a medianoche —');
{
  check('el día se calcula en la zona de la app',
    /v_dia\s+date := \(now\(\) at time zone 'America\/Mexico_City'\)::date;/.test(SQL));

  // Sin comentarios: que no quede ni un current_date decidiendo el día.
  const codigo = SQL.replace(/--[^\n]*/g, '');
  check('no queda ningún current_date', !/current_date/.test(codigo),
    'cualquiera que quede vuelve a mover el corte a las 18:00');

  // Los tres sitios donde se usaba.
  check('se busca por ese día', /where user_id = usuario and dia = v_dia\s*\n\s*for update;/.test(SQL));
  check('se inserta con ese día', /values \(usuario, v_dia, 1\);/.test(SQL));
  check('y se suma sobre ese día',
    /set consultas = consultas \+ 1, ultima_en = now\(\)\s*\n\s*where user_id = usuario and dia = v_dia;/.test(SQL));

  // `ultima_en` SÍ sigue con now(): es un instante, no un día.
  check('la marca de hora sigue siendo un instante', /ultima_en = now\(\)/.test(SQL));
}

console.log('\n— Y el cliente NO decide cuándo se reinicia —');
{
  // AQUÍ SE APARTA DE 0038 A PROPÓSITO. En los avisos el arreglo fue que el
  // teléfono mandara su fecha, porque el dato que se lee -entry_date- se
  // escribe con la fecha del teléfono y había que leerlo igual.
  //
  // Aquí es al revés: si el cliente dijera qué día es, reiniciaría el tope
  // cuando quisiera. Un límite de gasto no puede depender de quien gasta.
  check('la función no acepta una fecha de fuera',
    !/p_hoy/.test(SQL),
    'con un parámetro de fecha, se reinicia el tope mandando otro día');
  check('ni usa dia_de_la_persona', !/dia_de_la_persona/.test(SQL),
    'esa tiene un margen de un día: aquí ese margen es el agujero');
  check('y está razonado por qué', /no puede depender de lo que diga quien gasta/.test(SQL));

  // Nadie la ejecuta desde el navegador: solo la función con clave de servicio.
  check('sigue fuera del alcance de todos',
    /revoke all on function public\.gastar_consulta_ia\(uuid, integer\) from public, anon, authenticated;/.test(SQL));
}

console.log('\n— El historial no se reescribe —');
{
  // Las filas partidas por el corte viejo son el único registro de lo que
  // de verdad se gastó. Cuadrarlas al corte nuevo sería falsearlo.
  check('no se tocan las filas viejas',
    !/update public\.ia_uso\s+set dia/.test(SQL) && !/delete from public\.ia_uso/.test(SQL),
    'reescribir el consumo pasado para que cuadre es falsear el registro');
  check('y está dicho por qué', /seria falsear el unico registro/.test(SQL));
}

console.log('\n— La memoria sabe que no tiene fechas —');
{
  const i = FN.indexOf('const SISTEMA_MEMORIA');
  const mem = FN.slice(i, FN.indexOf('const SISTEMA_EVENTOS'));
  check('existe el sistema de memoria', i > 0);

  check('se le dice que las notas no llevan fecha',
    /ESTAS NOTAS NO TIENEN FECHA/.test(mem),
    'sin saberlo, mezcla lo de hace un mes con lo de hoy');
  check('y qué hacer si algo la necesita',
    /ponla dentro de la frase/.test(mem));

  // Lo concreto que fallÓ: comidas sueltas.
  check('las comidas sueltas quedan fuera', /COMIDAS SUELTAS/.test(mem));
  check('con el ejemplo real', /barbacoa/.test(mem) && /bud[íi]n/.test(mem),
    'el caso que lo destapó, para que no vuelva por reescritura');
  check('y por qué importa, no solo que no se haga',
    /ya no se fía de nada de lo que recuerdas/.test(mem));

  // Lo que ya estaba y no se toca.
  check('sigue sin duplicar lo que está en la base', /no lo dupliques/.test(mem));
  check('sigue sin guardar diagnósticos', /Diagnósticos/.test(mem));
  check('y sigue teniendo tope', /1200 caracteres/.test(mem));
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);
