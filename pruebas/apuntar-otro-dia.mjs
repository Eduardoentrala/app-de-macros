// Apuntar, ver y corregir la comida de otro día de la semana.
//
// Antes se podía apuntar en un día pasado, pero la lista seguía enseñando
// la comida de HOY: se guardaba bien y no había forma de ver lo que ya
// había ahí ni de corregirlo. Se apuntaba a ciegas.
//
// Y el calendario dejaba retroceder catorce días, o sea meterse en semanas
// que la app ya cerró y sobre las que quizá ya ajustó calorías. Cambiar un
// día de aquellas descuadra ese ajuste sin que nadie se entere.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8');

let ok = 0, mal = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { mal++; console.log(`  FALLA ${n}${extra ? '\n        ' + extra : ''}`); }
};

console.log('\n— Solo la semana que va corriendo —');
{
  const i = APP.indexOf('function pintarSelectorDia(');
  const trozo = i > 0 ? APP.slice(i, i + 900) : '';
  check('el mínimo es el inicio de SU semana', /inp\.min = isoDe\(anclaSemana\);/.test(trozo));
  check('y el máximo es hoy', /inp\.max = isoDe\(HOY\);/.test(trozo));
  // Semanas ya cerradas quedan fuera: la app pudo haber ajustado calorías
  // con esos datos, y cambiarlos ahora deja el ajuste sin sentido.
  check('ya no deja retroceder catorce días',
    !/inp\.min = isoDe\(haceDias\(DIAS_ATRAS_APUNTE\)\)/.test(APP),
    'con 14 días se podían tocar semanas que la app ya dio por cerradas');
  check('el botón dice «Hoy» o la fecha',
    /txt\.textContent = fuera \? fmtFecha\(diaDeApunte\(\)\) : 'Hoy'/.test(trozo));
}

console.log('\n— Al elegir un día se ve lo de ESE día —');
{
  const i = APP.indexOf('function cargarComidasDelDia(');
  const trozo = i > 0 ? APP.slice(i, i + 2400) : '';
  check('existe la carga por día', i > 0);
  check('pide solo ese día', /entry_date=eq\.' \+ isoDe\(fecha\)/.test(trozo));
  check('y solo lo suyo', /user_id=eq\.' \+ sesion\.user\.id/.test(trozo));
  check('vacía la lista antes, para no mezclar dos días',
    /COMIDAS\.Desayuno = \[\]; COMIDAS\.Comida = \[\]; COMIDAS\.Cena = \[\];/.test(trozo));
  // Si mientras llegaba se cambió de día otra vez, esa respuesta ya no vale.
  check('descarta una respuesta que llega tarde',
    /if\(isoDe\(diaDeApunte\(\)\) !== isoDe\(fecha\)\) return;/.test(trozo),
    'sin esto se pinta la lista de un día con el rótulo de otro');
  // La base admite 'Snack', que el Diario no lista.
  check('una comida que no se lista no revienta', /if\(!COMIDAS\[f\.meal\]\) return;/.test(trozo));
  // Las cantidades ya guardadas que hoy querrían decir otra cosa. Esto
  // comprobaba la regla LETRA POR LETRA, así que al llevarla a su propia
  // función —vivía copiada aquí y en el arranque— se puso roja sin que nada
  // se hubiera roto. Lo que importa es que este camino la aplique, no cómo
  // esté escrita; lo que hace se comprueba ejecutándola en onza-no-son-cien.
  check('respeta la compatibilidad de las cantidades viejas',
    /cantidad = cantidadDeLaFila\(unidad, cantidad\);/.test(trozo));

  // ESTO NO SE PUEDE CALLAR: una lista vacía significa "no comiste nada", y
  // si en realidad es "no pude leerlo", se vuelve a apuntar lo que ya estaba
  // y el día queda duplicado.
  check('si no puede leer el día, lo dice',
    /No pude leer ese día: ' \+ traducirError/.test(trozo),
    'callarlo hace que la persona duplique la comida de ese día');

  check('y se llama al cambiar la fecha', /cargarComidasDelDia\(diaDeApunte\(\)\);/.test(APP));
}

console.log('\n— Y se puede añadir, editar y quitar ahí —');
{
  const i = APP.indexOf('function agregarAlimento(');
  const trozo = APP.slice(i, i + 900);
  // Antes: `if(enHoy) COMIDAS[comida].push(a)`. Por eso lo apuntado en un
  // día pasado no aparecía en ninguna parte.
  check('lo añadido entra en la lista del día que se mira',
    /COMIDAS\[comida\]\.push\(a\);/.test(trozo) && !/if\(enHoy\) COMIDAS\[comida\]\.push/.test(APP));
  check('y se repinta siempre', /pintarComida\(\);/.test(trozo) && !/if\(enHoy\) pintarComida\(\)/.test(APP));
  // El anillo es de hoy; un día pasado cuenta para la semana, no para él.
  check('un día pasado rehace la semana', /if\(!enHoy\) actualizarSemana\(\);/.test(trozo));

  // Editar y quitar ya existían y siguen ahí.
  check('se puede editar', /data-editar="'\+i\+'"/.test(APP));
  check('se puede quitar', /data-quitar="'\+i\+'"/.test(APP));
  // El borrado va por id de fila, así que funciona en cualquier día.
  check('el borrado va por id, no por día', /sbQuitarAlimento\(quitado\.id\)/.test(APP));

  // Si el guardado falla se deshace sobre el día correcto.
  const j = APP.indexOf('var eraDia = DIA_APUNTE;');
  check('deshacer un fallo toca el día correcto', j > 0 &&
    /DIA_APUNTE = enHoy \? null : dia;/.test(APP.slice(j, j + 300)));
}

console.log('\n— Y al salir se vuelve a hoy —');
{
  // COMIDAS guarda el día que se estaba mirando. Sin esto, el Diario se
  // quedaría enseñando las comidas del lunes mientras el anillo cuenta las
  // de hoy.
  check('salir devuelve a hoy',
    /if\(DIA_APUNTE && typeof cargarComidasDelDia === 'function'\)\{[\s\S]{0,200}cargarComidasDelDia\(HOY\);/.test(APP));
  check('y entrar también, si se quedó en otro día',
    /if\(veniaDeOtroDia && typeof cargarComidasDelDia === 'function'\) cargarComidasDelDia\(HOY\);/.test(APP));
  // Entrar a apuntar siempre empieza en hoy: un selector que recuerda el día
  // anterior acaba metiendo la cena de hoy en el lunes pasado.
  check('entrar a apuntar empieza en hoy',
    /if\(push\.dataset\.push === 'mealadd'\)\{[\s\S]{0,120}DIA_APUNTE = null;/.test(APP));
}

console.log('\n— El selector sigue donde estaba —');
{
  check('la píldora del día existe', /id="mealFechaBtn"/.test(HTML));
  check('con su campo de fecha', /id="mealFecha"/.test(HTML) && /type="date"/.test(HTML));
  check('y se sabe para qué es', /aria-label="Día en que se apunta"/.test(HTML));
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);
