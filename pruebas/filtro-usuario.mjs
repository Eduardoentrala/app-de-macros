// Que las pantallas "mías" pidan SOLO lo mío.
//
// El fallo que cierra esto: la gráfica de peso mezclaba los registros del
// super admin con los de sus usuarios. Reiniciar el peso borraba los suyos
// -filtrando por user_id- pero la lectura no filtraba nada, así que al
// recargar volvían a salir los ajenos y parecía que el borrado no servía.
//
// La causa de fondo es un malentendido fácil de repetir: se daba por hecho
// que RLS ya devuelve "lo tuyo". Y es verdad para un cliente. Pero un
// coach ve a sus clientes y un super admin ve a TODOS, así que la misma
// consulta devuelve cosas distintas según quién mire.
//
//   RLS decide lo que PUEDES ver. La consulta decide lo que QUIERES ver.
//   No son lo mismo, y confundirlos no da error: da datos de más.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');

let ok = 0, mal = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { mal++; console.log(`  FALLA ${n}${extra ? '\n        ' + extra : ''}`); }
};

// Tablas donde cada fila es de una persona. Las comunes -catálogo,
// feature_flags, vistas de coach- quedan fuera a propósito.
const PERSONALES = [
  'weight_logs', 'diary_entries', 'saved_foods', 'recipes',
  'routine_days', 'routine_exercises', 'exercise_sets', 'workout_sessions',
  'progress_photos', 'eventos', 'chequeos_semanales', 'avisos_coach',
  // Las notas por ejercicio pasaron a guardarse de verdad, así que entran
  // aquí: un coach ve a sus clientes, y sin filtro sus notas saldrían
  // marcadas en la rutina de otro.
  'exercise_notes'
];

console.log('\n— Toda lectura personal dice de quién —');
{
  const re = /sbFetch\(\s*'\/rest\/v1\/([a-z_]+)/g;
  const sinFiltro = [];
  let m;
  while ((m = re.exec(APP))) {
    const tabla = m[1];
    if (!PERSONALES.includes(tabla)) continue;
    // Ventana generosa: el filtro puede ir concatenado varias líneas
    // después, o en una variable (`+ q`) definida justo antes.
    const trozo = APP.slice(m.index, m.index + 460);
    // Ventana amplia hacia atrás: en la ficha del panel hay cuatro
    // consultas seguidas y la definición de `q` queda lejos de la última.
    const antes = APP.slice(Math.max(0, m.index - 900), m.index);
    // Y si el cuerpo es una variable —`JSON.stringify(fila)`—, se sigue esa
    // variable hasta donde se declara y se mira ALLÍ. Antes esto se
    // resolvía mirando 900 caracteres hacia atrás, y bastó con que entre la
    // declaración y el envío se metieran unas líneas de comentario para que
    // la comprobación diera por «sin dueño» un POST que sí lo llevaba.
    // Seguir el nombre no depende de la distancia.
    const porVariable = (() => {
      const v = (trozo.match(/JSON\.stringify\((\w+)\)/) || [])[1];
      if (!v) return false;
      const decl = APP.lastIndexOf('var ' + v + ' = {', m.index);
      if (decl < 0) return false;
      return /user_id: sesion/.test(APP.slice(decl, APP.indexOf('};', decl)));
    })();

    const filtra =
      /user_id=eq\./.test(trozo) ||            // el caso normal
      // Un POST con su dueño. Se mira también hacia atrás porque el cuerpo
      // suele armarse en una variable unas líneas antes de mandarlo.
      /user_id: sesion/.test(trozo) || /user_id: sesion/.test(antes) ||
      porVariable ||
      /[&?']id=eq\./.test(trozo) ||            // una fila concreta por id
      /routine_day_id=eq\.|routine_exercise_id=eq\./.test(trozo) ||
      (/\+ q\)/.test(trozo) && /var q = '&user_id=eq\./.test(antes));
    if (!filtra) {
      const linea = APP.slice(0, m.index).split('\n').length;
      sinFiltro.push(`${tabla} en la línea ${linea}`);
    }
  }
  check('ninguna se apoya solo en RLS', sinFiltro.length === 0,
    sinFiltro.join('\n        '));
}

console.log('\n— Las que dieron el problema, una por una —');
{
  // Se comprueban por nombre las que se corrigieron, para que quede escrito
  // cuáles eran y no se "simplifiquen" de vuelta.
  const casos = [
    // Con `order=log_date.asc`: sin eso encuentra antes la consulta de la
    // ficha del panel, que es otra cosa y sí debe llevar el id de otro.
    ['la gráfica de peso',      "function sbPesos(desde)"],
    // El cardio se quitó: era un campo que pedía trabajo al usuario y no
    // alimentaba nada —ni el cálculo de calorías, ni el ajuste semanal—.
    ['el diario',               "?select=id,entry_date,meal,food_name"],
    ['los alimentos guardados', "saved_foods?select=id,name,unit"],
    ['las recetas',             "recipes?select=id,name,servings"],
    ['los días de rutina',      "routine_days?select=id,name,sort_order"],
    ['los ejercicios',          "routine_exercises?select=id,routine_day_id"],
    ['las series',              "exercise_sets?select=id,routine_exercise_id"],
    ['las sesiones de entreno', "workout_sessions?select=session_date,exercises"],
    ['los eventos',             "?select=fecha,titulo,calorias"]
  ];
  for (const [nombre, aguja] of casos) {
    const i = APP.indexOf(aguja);
    const trozo = i >= 0 ? APP.slice(i, i + 320) : '';
    check(nombre + ' filtra por usuario',
      i >= 0 && /user_id=eq\.' \+ sesion\.user\.id/.test(trozo),
      i < 0 ? 'no se encontró la consulta' : trozo.split('\n').slice(0, 3).join(' '));
  }
}

console.log('\n— El panel sigue pudiendo mirar a otra persona —');
{
  // Esto NO es el mismo caso: ahí se mira a alguien a propósito, y el
  // filtro lleva SU id. Arreglar de más aquí rompería la ficha del panel.
  const i = APP.indexOf("var q = '&user_id=eq.' + u.id");
  check('la ficha del panel filtra por el id de esa persona', i > 0);
  check('y lo usa en sus cuatro consultas',
    (APP.slice(i, i + 900).match(/\+ q\)/g) || []).length >= 4);
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);
