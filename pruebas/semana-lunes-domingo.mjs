// La semana va de lunes a domingo. Siempre, y para todos.
//
// Antes se movía sola: cambiar los macros o el objetivo ponía el inicio de
// semana en el día en que estuvieras. A quien tocaba sus macros un
// miércoles se le quedaba la semana de miércoles a martes.
//
// Eso se notaba justo en el calendario de apuntar comida, que solo deja
// moverse dentro de la semana en curso: empezaba en miércoles, y no había
// forma de volver al lunes de esa misma semana para corregir un día.
//
// Y era pegajoso: el día se guardaba en el perfil (`week_start_dow`) y se
// volvía a leer al abrir la app, así que arreglarlo en el navegador no
// servía de nada — a la siguiente apertura volvía a torcerse.
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

console.log('\n— El lunes es el día 1, y no se mueve —');
{
  check('el inicio de semana es lunes', /var inicioSemana = 1;/.test(APP));

  // Estas dos líneas eran el fallo. Si vuelven, la semana se tuerce otra vez
  // en cuanto alguien cambie sus macros.
  check('cambiar los macros no mueve el inicio',
    !/inicioSemana = HOY\.getDay\(\)/.test(APP),
    'con esto, tocar los macros un miércoles deja la semana de miércoles a martes');
  check('ni tampoco el ancla', !/anclaSemana\s+= new Date\(HOY\)/.test(APP));

  // Y lo pegajoso: el valor guardado en el perfil.
  check('no se relee el día guardado en el perfil',
    !/inicioSemana = Number\(p\.week_start_dow\)/.test(APP),
    'los perfiles viejos tienen ahí un día suelto; leerlo deshace el arreglo al abrir la app');
  check('ni se vuelve a guardar', !/week_start_dow: inicioSemana/.test(APP));
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
  check('y que la semana sigue', /sigue hasta el domingo/.test(HTML));
  // El aviso de la hoja de objetivo decía lo mismo y también sobraba.
  check('el aviso viejo del objetivo ya no está', !/id="objAviso"/.test(HTML));
  check('ni el código que lo encendía', !/getElementById\('objAviso'\)/.test(APP));
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);
