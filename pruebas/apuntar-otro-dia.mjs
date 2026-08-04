// Apuntar comida en un día pasado.
//
// "Ayer comí esto y no lo registré" es de las cosas que más pasan, y hasta
// ahora no habia forma: `HOY` estaba fijo dentro de las dos funciones que
// guardan.
//
// Lo que puede salir mal aqui no da error en pantalla, y por eso se prueba:
//   · Que la comida de ayer aparezca en la lista de HOY (contaria dos veces
//     en el anillo y la persona creeria que se paso).
//   · Que el selector recuerde el dia anterior y alguien apunte una semana
//     entera en la fecha equivocada sin notarlo.
//   · Que al deshacer un guardado fallido se reste del dia que no era.
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

console.log('\n— El día de apunte existe y se declara pronto —');
{
  const decl = APP.indexOf('var DIA_APUNTE = null;');
  check('DIA_APUNTE se declara una sola vez',
    (APP.match(/var DIA_APUNTE = null;/g) || []).length === 1);
  // Mismo error que tumbó la app entera con EVENTOS: `var` iza la
  // declaracion pero no la asignacion, y las funciones que lo leen corren
  // al arrancar.
  check('antes que el balance diario', decl > 0 && decl < APP.indexOf('var hoyEsEvento'),
    `declaracion en ${decl}`);
  check('null significa hoy', /return DIA_APUNTE \|\| HOY/.test(APP));
}

console.log('\n— Guardar usa el día elegido, no HOY —');
{
  const s = APP.slice(APP.indexOf('function sumarAlRegistro('), APP.indexOf('function sumarAlRegistro(') + 300);
  check('el registro se suma al día elegido', /var k = isoDe\(diaDeApunte\(\)\)/.test(s),
    'con isoDe(HOY) fijo, lo de ayer se apunta hoy');
  const g = APP.slice(APP.indexOf('function sbAgregarAlimento('),
                      APP.indexOf('function sbAgregarAlimento(') + 500);
  check('y la base guarda esa fecha', /entry_date: isoDe\(diaDeApunte\(\)\)/.test(g));
}

console.log('\n— Lo de ayer NO entra en la lista de hoy —');
{
  const a = APP.slice(APP.indexOf('function agregarAlimento('),
                      APP.indexOf('function agregarAlimento(') + 1800);
  // COMIDAS es la lista de HOY. Meter ahi lo de ayer lo haria aparecer en
  // el desayuno de hoy y contar dos veces en el anillo.
  check('solo se mete en COMIDAS si es hoy', /if\(enHoy\) COMIDAS\[comida\]\.push\(a\)/.test(a));
  check('y solo se repinta la comida si es hoy', /if\(enHoy\) pintarComida\(\)/.test(a));
  // Un dia pasado si cuenta para la semana: es el punto de apuntarlo.
  check('pero la semana se actualiza igual', /else actualizarSemana\(\)/.test(a));
  check('y el aviso dice en qué día quedó', /' del ' \+ fmtFecha\(dia\)/.test(a));
}

console.log('\n— El borrado de un día vacío no se lleva lo de ayer —');
{
  const s = APP.slice(APP.indexOf('function sumarAlRegistro('),
                      APP.indexOf('function sumarAlRegistro(') + 1400);
  // Esa comprobacion mira COMIDAS, que es de hoy. Aplicada a un dia pasado
  // borraria justo lo que se acaba de apuntar en el.
  check('el borrado por día vacío solo aplica a hoy', /if\(apuntandoEnHoy\(\)\)\{/.test(s),
    'sin esto, apuntar en ayer se borra solo al instante');
}

console.log('\n— Deshacer resta del día correcto —');
{
  const a = APP.slice(APP.indexOf('function agregarAlimento('),
                      APP.indexOf('function agregarAlimento(') + 2400);
  // Para cuando falla la red, la persona puede haber cambiado la fecha.
  check('se restaura el día al deshacer', /var eraDia = DIA_APUNTE;[\s\S]{0,120}DIA_APUNTE = enHoy \? null : dia;/.test(a));
  check('y se devuelve como estaba', /DIA_APUNTE = eraDia;/.test(a));
}

console.log('\n— Siempre empieza en hoy —');
{
  // Un selector que recuerda el dia anterior acaba metiendo la cena de hoy
  // en el martes pasado, y nadie revisa una fecha que ya estaba puesta.
  check('entrar a apuntar lo reinicia',
    /push\.dataset\.push === 'mealadd'\)\{[\s\S]{0,120}DIA_APUNTE = null/.test(APP));
  check('hay selector en pantalla', HTML.includes('id="mealFecha"'));
  // Antes había un botón aparte de "Volver a hoy". Se quitó: la fila con
  // etiqueta, control nativo a ancho completo y botón pesaba demasiado para
  // algo que el 99% de las veces dice "hoy". Ahora es una píldora que
  // muestra el estado y abre el selector.
  check('la píldora dice "Hoy" cuando es hoy',
    /txt\.textContent = fuera \? fmtFecha\(diaDeApunte\(\)\) : 'Hoy'/.test(APP),
    'una fecha completa ahí obliga a comprobarla cada vez');
  check('y ya no queda el botón viejo', !HTML.includes('mealFechaHoy'));
}

console.log('\n— Con límites —');
{
  const p = APP.slice(APP.indexOf('function pintarSelectorDia('),
                      APP.indexOf('function pintarSelectorDia(') + 700);
  check('no deja apuntar en el futuro', /inp\.max = isoDe\(HOY\)/.test(p));
  // Mas atras ya no es "se me olvido", es reescribir semanas que la app dio
  // por cerradas y sobre las que quiza ya ajusto calorias.
  check('ni más de dos semanas atrás', /inp\.min = isoDe\(haceDias\(DIAS_ATRAS_APUNTE\)\)/.test(p));
  check('el límite está escrito, no suelto', /var DIAS_ATRAS_APUNTE = 14/.test(APP));
  check('se marca cuando no es hoy', /classList\.toggle\('otro-dia', fuera\)/.test(p));
}

console.log('\n— La zona horaria no corre el día —');
{
  // Con las horas a cero, una zona por detras de UTC convierte la fecha en
  // el dia anterior. Es el clasico "aparecio en el dia de antes".
  check('la fecha se lee a mediodía', /new Date\(this\.value \+ 'T12:00:00'\)/.test(APP),
    "con 'T00:00:00' el dia se corre en zonas negativas");
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);
