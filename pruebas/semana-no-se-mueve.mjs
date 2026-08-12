// La semana de cada quien no se mueve sola.
//
// EL FALLO NO ERA QUE CADA PERSONA TUVIERA SU DÍA. Era que ese día SE
// REESCRIBÍA SOLO: cambiar los macros o el objetivo lo ponía en el día en
// que estuvieras. Quien tocaba sus macros un miércoles se despertaba con
// la semana de miércoles a martes sin haber pedido nada, y el calendario
// de apuntar -que solo deja moverse dentro de la semana en curso- ya no le
// dejaba volver al lunes de su propia semana.
//
// Al arreglarlo se quitó la columna del perfil entera y se puso lunes fijo
// para todos. Eso fue pasarse, y se notó enseguida: le cambió la semana a
// quien la tenía bien puesta a propósito.
//
// Así que la columna vuelve y el ajuste automático no. Leer el día no
// torcía la semana de nadie; escribirlo sin permiso, sí.
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

const DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];

console.log('\n— Nadie le mueve el día a nadie —');
{
  check('lunes por defecto', /var inicioSemana = 1;/.test(APP));

  // ESTAS DOS LÍNEAS ERAN EL FALLO, y son lo único que no puede volver.
  check('cambiar los macros no mueve el inicio',
    !/inicioSemana = HOY\.getDay\(\)/.test(APP),
    'con esto, tocar los macros un miércoles deja la semana de miércoles a martes');
  check('ni tampoco el ancla', !/anclaSemana\s+= new Date\(HOY\)/.test(APP));
  // Ni se escribe la columna sola desde ningún guardado de perfil.
  check('no se guarda el día por su cuenta', !/week_start_dow: inicioSemana/.test(APP),
    'escribirlo al vuelo es justo lo que torcia la semana sin que nadie lo pidiera');
}

console.log('\n— Pero cada quien puede tener el suyo —');
{
  // Quitar la columna entera fue pasarse: le cambió la semana a quien la
  // tenía puesta a propósito. Leerla no torcía nada.
  check('se lee el día del perfil', /inicioSemana = dow;/.test(APP));
  check('y el ancla lo sigue', /anclaSemana {2}= ultimoDia\(inicioSemana\);/.test(APP));
  // Un valor raro en la base dejaría el ancla en una fecha inválida, y con
  // ella la semana, el calendario de apuntar y el chequeo.
  check('un valor fuera de rango se ignora',
    /dow >= 0 && dow <= 6/.test(APP),
    'sin esto, un 9 en la base deja el ancla en Invalid Date y se cae todo lo que cuelga de ella');
  check('y si no hay valor, se queda el de por defecto',
    /if\(p\.week_start_dow != null &&/.test(APP));
}

console.log('\n— Y los textos hablan de SU semana —');
{
  // Escribir "de lunes a domingo" a mano le miente en su propia pantalla de
  // ajustes a quien empieza en martes.
  check('el Perfil no dice un día fijo', !/lunes a domingo|cada lunes/.test(HTML));
  check('lo rellena la app con su día',
    /'de ' \+ DIAS\[inicioSemana\] \+ ' a ' \+ finSem/.test(APP));
  check('y el fin de semana se calcula, no se escribe',
    /DIAS\[\(inicioSemana \+ 6\) % 7\]/.test(APP));
}

console.log('\n— La cuenta, con los siete días posibles —');
{
  // Se saca la función DE VERDAD del fuente, no una copia: una copia se
  // queda vieja el día que se toque el original y la prueba seguiría verde.
  const i = APP.indexOf('function ultimoDia(dow)');
  check('la función existe', i > 0);
  const cuerpo = APP.slice(i, APP.indexOf('\n  }', i) + 4);

  const hacer = (HOY) => {
    const fn = new Function('HOY', cuerpo + '\n return ultimoDia(1);');
    return fn(HOY);
  };

  // Del lunes 10 al domingo 16 de agosto de 2026.
  const esperado = '2026-08-10';
  for (let d = 10; d <= 16; d++) {
    const hoy = new Date(2026, 7, d);
    const ancla = hacer(hoy);
    const iso = ancla.getFullYear() + '-08-' + String(ancla.getDate()).padStart(2, '0');
    check(`el ${DIAS[hoy.getDay()]} ${d} arranca el lunes 10`, iso === esperado, `dio ${iso}`);
  }
  // Y el lunes siguiente ya es semana nueva: es lo que hace que se
  // "reinicie" sola sin que nadie toque nada.
  const lunes17 = hacer(new Date(2026, 7, 17));
  check('el lunes 17 ya es semana nueva', lunes17.getDate() === 17,
    'si no cambiara, la semana no se reiniciaría nunca');
}

console.log('\n— El calendario solo deja moverse por esa semana —');
{
  const i = APP.indexOf('function pintarSelectorDia(');
  const trozo = i > 0 ? APP.slice(i, i + 900) : '';
  check('desde el lunes de esta semana', /inp\.min = isoDe\(anclaSemana\);/.test(trozo));
  // Nadie comió mañana. Y sin tope se podrían apuntar días del futuro, que
  // luego cuentan en la media de la semana como si se hubieran comido.
  check('hasta hoy, no más allá', /inp\.max = isoDe\(HOY\);/.test(trozo));
}

console.log('\n— Y no se promete un reinicio que ya no pasa —');
{
  // Lo importante no es la redacción sino que no MIENTA: si la hoja dice
  // que el conteo vuelve a cero y no vuelve, quien lo lea no va a cambiar
  // sus macros por miedo a perder la semana.
  check('la hoja de macros no dice que el conteo vuelve a cero',
    !/el conteo vuelve a cero y hoy pasa a ser tu día 1/.test(HTML));
  check('ni que se pierde el avance',
    !/Pierdes el avance de esta semana/.test(HTML));
  check('dice que valen desde hoy', /Valen a partir de hoy/.test(HTML));
  // Sin nombrar el día: "hasta el domingo" le mentía a quien acaba en lunes.
  check('y que la semana sigue', /sigue hasta que termine/.test(HTML));
  // El aviso de la hoja de objetivo decía lo mismo y también sobraba.
  check('el aviso viejo del objetivo ya no está', !/id="objAviso"/.test(HTML));
  check('ni el código que lo encendía', !/getElementById\('objAviso'\)/.test(APP));
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);
