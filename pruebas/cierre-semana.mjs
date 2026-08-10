// El cierre de semana, contado al entrar.
//
// Antes había que ir a buscarlo: abrir el chequeo, contestar las tres
// preguntas y pulsar "Revisar mi semana". Quien no lo abría no se enteraba
// de nada — y es justo a quien más falta le hace.
//
// Lo que se comprueba aquí, además de que exista:
//
//  1. Que use la MISMA acción que el chequeo manual. Dos caminos que
//     deciden calorías acaban decidiendo cosas distintas.
//  2. Que mire la semana PASADA y no la que está corriendo, que todavía no
//     tiene nada que contar.
//  3. Que salga el primero de los motivos: una racha puede esperar siete
//     días, las calorías de los próximos siete no.
//  4. Que se calle cuando no hay con qué. Un cierre sacado de dos días
//     sueltos es una tendencia inventada.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');
const FN = readFileSync(join(RAIZ, 'supabase', 'functions', 'asistente', 'index.ts'), 'utf8');
const M36 = readFileSync(join(RAIZ, 'supabase', 'migrations', '0036_cierre_de_semana.sql'), 'utf8');
const M37 = readFileSync(join(RAIZ, 'supabase', 'migrations', '0037_aviso_de_cierre_de_semana.sql'), 'utf8');

let ok = 0, mal = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { mal++; console.log(`  FALLA ${n}${extra ? '\n        ' + extra : ''}`); }
};

console.log('\n— El motivo existe y va en dos pasos —');
{
  check('la 0036 da de alta el valor',
    /alter type public\.motivo_aviso add value if not exists 'cierre_semana';/.test(M36));
  // Un valor nuevo de enum no se puede USAR en la misma transacción en que
  // se añade: si van juntos, el segundo trozo falla.
  check('y la 0036 no lo usa todavía', !/motivo_de_aviso/.test(M36),
    'usar el valor en la misma transacción que lo crea revienta');
  check('la 0037 es la que lo usa', /return 'cierre_semana';/.test(M37));
  check('y está dicho por qué van separadas',
    /misma transaccion en la que se anade/.test(M36));
}

console.log('\n— Sale el primero de todos —');
{
  const i = M37.indexOf("return 'cierre_semana';");
  for (const otro of ['ausente', 'estancado', 'racha', 'semana_buena'])
    check(`va antes que ${otro}`, i > 0 && i < M37.indexOf(`return '${otro}';`));
}

console.log('\n— Mira la semana que cerró, no la de ahora —');
{
  check('arranca en el lunes de hoy', /date_trunc\('week', current_date\)::date/.test(M37));
  check('y cuenta los siete días de ANTES',
    /entry_date >= v_lunes - 7[\s\S]{0,60}entry_date <  v_lunes/.test(M37));
}

console.log('\n— Se calla cuando no hay con qué —');
{
  check('exige al menos tres días apuntados', /if v_dias_semana >= 3/.test(M37));
  // Uno por semana. Se mira cuándo se creó y no si se leyó: marcarlo como
  // visto no debe hacer que vuelva a salir el mismo cierre.
  check('no repite el cierre de la misma semana',
    /motivo\s*=\s*'cierre_semana'[\s\S]{0,300}creado_en >= v_lunes/.test(M37));
  check('y lo mira por fecha de creación, no por si se leyó',
    !/motivo\s*=\s*'cierre_semana'[\s\S]{0,200}visto_en/.test(M37));
}

console.log('\n— La app lo pide por el mismo camino que el chequeo manual —');
{
  const i = APP.indexOf('function avisoDeCierreDeSemana(');
  const trozo = i > 0 ? APP.slice(i, i + 1500) : '';
  check('existe', i > 0);
  // Dos caminos que deciden calorías acabarían decidiendo cosas distintas.
  check('usa la acción «semana», no una propia', /accion: 'semana'/.test(trozo));
  check('con los datos de la semana pasada', /datos: datosDeLaSemanaPasada\(\)/.test(trozo));
  check('manda el entreno', /entreno: r\[0\]/.test(trozo),
    'sin entreno, un peso plano siempre parece estancamiento');
  check('y el chequeo si lo contestó', /chequeo: r\[1\] \|\| \{\}/.test(trozo));

  // El aviso se enruta antes de gastar la llamada de «aviso» normal.
  const j = APP.indexOf("if(motivo === 'cierre_semana')");
  check('se enruta aparte del aviso de ánimo', j > 0);
  check('y antes de pedir el aviso normal',
    j > 0 && j < APP.indexOf("accion: 'aviso'", j));
}

console.log('\n— Y aplica lo que decida, antes de enseñarlo —');
{
  const i = APP.indexOf('function avisoDeCierreDeSemana(');
  const trozo = APP.slice(i, i + 1800);
  check('aplica las calorías nuevas', /if\(r\.ajusto && r\.cal_nueva\) aplicarCaloriasNuevas\(r\.cal_nueva\)/.test(trozo));
  // Si se enseñara primero, el mensaje diría "te dejo en 2100" con el
  // anillo todavía en 2250 mientras se lee.
  check('antes de pintarlo',
    trozo.indexOf('aplicarCaloriasNuevas') < trozo.indexOf('pintarAvisoCoach'));
  check('lo guarda como aviso', /guardar_aviso'[\s\S]{0,90}p_motivo: 'cierre_semana'/.test(trozo));
}

console.log('\n— La semana pasada se calcula bien —');
{
  const i = APP.indexOf('function datosDeLaSemanaPasada(');
  const trozo = APP.slice(i, i + 700);
  check('existe', i > 0);
  check('retrocede siete días desde el lunes', /desde\.setDate\(desde\.getDate\(\) - 7\)/.test(trozo));
  check('recorre siete días exactos', /for\(var i = 0; i < 7; i\+\+\)/.test(trozo));
  // La de siempre va del lunes a HOY: para un cierre no vale.
  check('no reutiliza la de la semana en curso', !/anclaSemana/.test(trozo));

  const j = APP.indexOf('function chequeoDeLaSemanaPasada(');
  const chq = APP.slice(j, j + 700);
  check('busca el chequeo de esa semana', /semana=eq\.' \+ isoDe\(lunes\)/.test(chq));
  check('y filtra por usuario', /user_id=eq\.' \+ sesion\.user\.id/.test(chq));
  check('si no está, no impide el cierre', /\['catch'\]\(function\(\)\{ return null; \}\)/.test(chq));
}

console.log('\n— El mensaje dice las tres cosas que se pidieron —');
{
  const i = FN.indexOf('QUÉ TIENE QUE LLEVAR EL MENSAJE');
  const trozo = i > 0 ? FN.slice(i, i + 1400) : '';
  check('el texto se lo exige', i > 0);
  check('1: en cuántas calorías está', /EN CUÁNTAS CALORÍAS ESTÁ/.test(trozo));
  check('2: si se mueven y por qué', /SI SE MUEVEN O NO, Y POR QUÉ/.test(trozo));
  check('3: una cosa para la semana que entra', /UNA COSA para la semana que entra/.test(trozo));
  // La regla vieja prohibía cifras, y sin el número nadie sabe de qué le
  // hablan cuando el mensaje sale sin haberlo pedido.
  check('ya no prohíbe decir el número',
    !/"mensaje" no lleva cifras salvo las calorías nuevas/.test(FN));
  check('pero sigue sin listas', /Nada de listas ni viñetas/.test(trozo));
  // Distinguir los dos "no te muevo nada" es lo que hace útil el aviso.
  check('exige distinguir los dos motivos de no ajustar',
    /"no te muevo nada porque el peso bajó como debía" y "no te muevo nada\s*\n?\s*porque no tengo con qué leer tu semana"/.test(trozo) ||
    /porque no tengo con qué leer tu semana/.test(trozo));
}

console.log('\n— Y se quita con el botón —');
{
  // Esto ya existía; se comprueba para que siga existiendo.
  check('el aviso trae su botón', /'<button data-visto="' \+ id \+ '">Entendido<\/button>'/.test(APP));
  check('al pulsarlo desaparece', /pintarAvisoCoach\(null\);/.test(APP));
  check('y queda marcado como visto', /visto_en: new Date\(\)\.toISOString\(\)/.test(APP));
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);
