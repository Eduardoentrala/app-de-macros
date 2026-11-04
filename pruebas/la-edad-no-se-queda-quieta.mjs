// La edad era un número que se tecleó una vez y no envejecía.
//
// `profiles.age` se escribía al registrarse y ahí se quedaba: quien se dio
// de alta con 40 seguía teniendo 40 tres años después. Y de esa edad salen
// la fórmula de Mifflin-St Jeor y, desde ayer, el SUELO por debajo del cual
// el cierre ya no baja las calorías. O sea que el freno se iba quedando
// viejo sin que nada lo dijera.
//
// Se vio en una base de verdad: un perfil con `nacimiento` puesto —1997— y
// `age` en 28, a dos días de cumplir 29. El 5 de noviembre la fecha diría
// una cosa y el número guardado otra, para siempre.
//
// Con la fecha de nacimiento no hace falta adivinar. `age` pasa a ser lo que
// siempre debió ser: una copia que se refresca sola, no la fuente.
//
// Y SIN FECHA NO CAMBIA NADA. Es un dato opcional: quien no lo ponga sigue
// con su `age` tal cual. Un arreglo que deja sin edad a quien no rellenó
// algo opcional es peor que el problema.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

const sinComentarios = (s) => s.replace(/^\s*\/\/.*$/gm, '');

function sacar(cabecera) {
  const i = APP.indexOf(cabecera);
  if (i < 0) throw new Error('no encuentro: ' + cabecera);
  let n = 0, j = APP.indexOf('(', i);
  for (; j < APP.length; j++) {
    if (APP[j] === '(') n++;
    else if (APP[j] === ')') { n--; if (!n) break; }
  }
  n = 0;
  let k = APP.indexOf('{', j);
  for (; k < APP.length; k++) {
    if (APP[k] === '{') n++;
    else if (APP[k] === '}') { n--; if (!n) return APP.slice(i, k + 1); }
  }
  throw new Error('llaves sin cerrar en ' + cabecera);
}

// ------------------------------------------------------------------
console.log('\nLa cuenta, ejecutada');
{
  const edad = new Function(
    sacar('function esFecha(') + ';' +
    sacar('function edadDeNacimiento(') + '; return edadDeNacimiento;')();

  // Su caso, los tres días que importan.
  ok(edad('1997-11-05', '2026-11-03') === 28, 'dos días antes, todavía 28');
  ok(edad('1997-11-05', '2026-11-04') === 28, 'la víspera, todavía 28');
  ok(edad('1997-11-05', '2026-11-05') === 29, 'Y EL DÍA, 29',
     'es el día entero el que decide, no la hora');
  ok(edad('1997-11-05', '2026-11-06') === 29, 'y al día siguiente sigue en 29');

  // El salto de año, que es donde fallan estas cuentas.
  ok(edad('1997-12-31', '2027-01-01') === 29, 'nació el 31-dic y ya es enero: 29');
  ok(edad('1997-01-01', '2026-12-31') === 29, 'nació el 1-ene y es fin de año: 29');

  // 29 de febrero. Con una comparación de «MM-DD» como texto, el 28 de
  // febrero de un año normal todavía no es su día y el 1 de marzo sí, que
  // es lo que hace la gente.
  ok(edad('1996-02-29', '2027-02-28') === 30, 'el 29-feb, un 28 de febrero: aún no');
  ok(edad('1996-02-29', '2027-03-01') === 31, 'y el 1 de marzo, sí');

  // SIN FECHA, NADA. Y nada quiere decir `null`, no un cero: un cero se
  // colaría en la fórmula como una edad de verdad.
  // «1997-13-45» cumple la forma `\d{4}-\d{2}-\d{2}` y no es un día del
  // calendario. La primera versión de esto devolvía 28 tan tranquila, así
  // que la fecha se comprueba por existir, no por parecerlo. Y «2027-02-30»
  // por lo mismo.
  for (const malo of [null, undefined, '', 'mañana', '1997-13-45', '2027-02-30',
                      '97-11-05', 12345]) {
    ok(edad(malo, '2026-11-03') === null,
       'sin fecha válida no hay edad: ' + JSON.stringify(malo),
       'devolvió ' + edad(malo, '2026-11-03'));
    ok(edad('1997-11-05', malo) === null,
       'y sin un hoy válido tampoco: ' + JSON.stringify(malo));
  }
  ok(edad('2030-01-01', '2026-11-03') === null, 'una fecha futura no da una edad negativa');
  ok(edad('1850-01-01', '2026-11-03') === null, 'ni una de hace dos siglos');
}

// ------------------------------------------------------------------
console.log('\nY manda sobre el número guardado');
{
  const v = sinComentarios(sacar('function volcarPerfilEnRegistro('));
  const iFecha = v.indexOf('edadDeNacimiento(');
  const iGuardada = v.search(/p\.age != null/);
  ok(iFecha > 0, 'se calcula la edad de la fecha');
  ok(iFecha < iGuardada,
     'y se mira ANTES que el `age` guardado',
     'si el guardado gana, el arreglo no sirve de nada: es justo el número ' +
     'que no envejece');

  // Y SE DEVUELVE A LA BASE. `age` lo leen otras cosas —las métricas que ve
  // su entrenador— y arreglarlo solo en esta pantalla es dejarlo mal donde
  // no se mira.
  ok(/sbActualizarPerfil\(\{ age:/.test(v), 'y se refresca en la base');
  ok(/p\.age !== edadHoy/.test(v), 'solo cuando ya no coincide',
     'sin esa condición se escribiría en cada arranque: una llamada por ' +
     'apertura para no cambiar nada');

  // Quien no puso fecha no puede quedarse sin edad por esto.
  ok(/else if\(p\.age != null\)/.test(v),
     'y sin fecha se sigue usando la guardada',
     'la fecha es opcional: un arreglo que deja sin edad a quien no la puso ' +
     'es peor que el problema');
}

// ------------------------------------------------------------------
console.log('\nY la pantalla no pide lo que ya sabe');
{
  const abrir = sinComentarios(APP.slice(
    APP.indexOf("document.getElementById('profDatosBtn')"),
    APP.indexOf("document.getElementById('datSexo')")));
  ok(/campoEdad\.disabled = \(edadHoy != null\)/.test(abrir),
     'con fecha de nacimiento, la edad no se teclea',
     'dos fuentes para el mismo dato acaban siempre en que una miente, y la ' +
     'que mentiría es la tecleada');
  ok(/datEdadNota/.test(abrir) && HTML.includes('id="datEdadNota"'),
     'y se dice por qué está apagado',
     'un campo apagado sin explicación se lee como que la app está rota');
  ok(/Sale de tu cumpleaños/.test(HTML), 'con todas las letras');

  const g = sinComentarios(APP.slice(
    APP.indexOf("document.getElementById('datGuardar')"),
    APP.indexOf('// ---- Días de gimnasio ----')));
  ok(/!edadDeNacimiento\(/.test(g),
     'y al guardar no se manda una edad que ya sale de la fecha',
     'serían dos escritores del mismo dato, y el tecleado es el que no ' +
     'envejece');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
