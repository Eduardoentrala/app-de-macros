// Edad, altura, sexo y nombre se ponían UNA VEZ, al registrarse.
//
// Los cuatro viven en la pantalla de registro. Quien se registró antes de
// que existieran esas columnas los tiene en nulo, y no había dónde ponerlos:
// la pantalla de Perfil los enseña, pero solo para leer.
//
// Y EN NULO NO SE NOTA, que es lo peor de todo. `volcarPerfilEnRegistro`
// solo rellena lo que viene, así que los campos se quedan con el valor por
// defecto DE LA PANTALLA —28 años, 170 cm— y la fórmula calcula con eso tan
// tranquila. Nadie ve un hueco: ve un número que no es el suyo.
//
// Se vio en una base de verdad el 4 nov 2026: un perfil con `weight_kg` 82,
// su cumpleaños y sus días de gimnasio puestos, y `age`, `height_cm`, `sexo`
// y `full_name` en nulo. Consecuencias, las tres reales:
//
//   · El suelo de las calorías —que se calcula con la edad y la altura— se
//     estaba calculando con 28 años y 170 cm.
//   · El asistente le escribía sin género, porque `sexo` en nulo le dice
//     «no lo adivines». El arreglo funcionando sobre un dato que falta.
//   · Y la felicitación de cumpleaños iba a salir sin su nombre.
//
// LO QUE NO HACE, y es una decisión: no recalcula los macros. Lo que decide
// las calorías es el gasto medido; rehacer la fórmula aquí tiraría de un
// toque lo que el cierre lleva meses ajustando.

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
console.log('\nHay dónde ponerlos, y se dice cuáles faltan');
{
  for (const [id, qué] of [
    ['profDatosBtn', 'la fila en Perfil'],
    ['datNombre', 'el nombre'],
    ['datSexo', 'el sexo'],
    ['datEdad', 'la edad'],
    ['datAltura', 'y la altura'],
  ]) {
    ok(HTML.includes('id="' + id + '"'), qué);
  }

  // SE EJECUTA: lo que importa es qué acaba enseñando la fila, no cómo
  // está escrita la función.
  const pintar = new Function('MI_PERFIL', 'document',
    sacar('function pintarDatosPerfil(') + '; return pintarDatosPerfil;');
  const texto = (perfil) => {
    let puesto = '';
    pintar(perfil, { getElementById: () => ({ set innerHTML(v) { puesto = v; } }) })();
    return puesto;
  };

  ok(/Falta/.test(texto({})), 'con el perfil vacío dice que falta algo');

  // LA EDAD YA NO SE MIRA AQUÍ. Dejó de tener fila propia: sale del
  // cumpleaños, que tiene la suya. Pedirla en dos sitios es como se acaba
  // con dos respuestas distintas para lo mismo.
  for (const [campo, palabra] of [
    ['full_name', 'nombre'], ['sexo', 'sexo'], ['height_cm', 'altura'],
  ]) {
    const completo = { full_name: 'Eduardo', sexo: 'h', height_cm: 175 };
    delete completo[campo];
    ok(texto(completo).includes(palabra),
       'y si falta ' + campo + ' lo nombra',
       'quedó: ' + texto(completo));
  }
  ok(!texto({ full_name: 'E', sexo: 'h', height_cm: 175 }).includes('edad'),
     'y la edad no se le pide aquí',
     'quedó: ' + texto({ full_name: 'E', sexo: 'h', height_cm: 175 }));

  // CON TODO PUESTO ENSEÑA LA ALTURA, que es de lo que va la fila. Decir
  // «Completos» sería gastar la fila en no decir nada.
  const lleno = texto({ full_name: 'Eduardo', sexo: 'h', height_cm: 175 });
  ok(/175\.0 cm/.test(lleno), 'y con todo puesto enseña la altura', 'quedó: ' + lleno);
  ok(!/Falta/.test(lleno), 'sin avisar de nada');

  // Y SI FALTA ALGO, LO DICE EN LUGAR DE LA ALTURA. Un «175 cm» tranquilo
  // escondería que no hay sexo ni nombre, y esos los necesitan la fórmula
  // y el asistente.
  const aMedias = texto({ height_cm: 175 });
  ok(/Falta/.test(aMedias) && !/175/.test(aMedias),
     'y lo que falta tapa a la altura, no se pone al lado',
     'quedó: ' + aMedias);

  // Un cero es un dato, no un hueco.
  ok(!texto({ full_name: 'E', sexo: 'h', height_cm: 0 }).includes('altura'),
     'y un 0 cuenta como puesto, no como que falta',
     'con `if(!p.height_cm)` un cero se leería como hueco');
}

// ------------------------------------------------------------------
console.log('\nSe guarda solo lo que de verdad escribió');
{
  const g = sinComentarios(APP.slice(
    APP.indexOf("document.getElementById('datGuardar')"),
    APP.indexOf('// ---- Días de gimnasio ----')));

  ok(/sbActualizarPerfil\(cambios\)/.test(g), 'se manda al perfil');
  // La edad lleva una condición más desde que sale del cumpleaños: con
  // fecha de nacimiento no viaja desde aquí, para no ser el segundo
  // escritor del mismo dato. Ver `la-edad-no-se-queda-quieta`.
  ok(/if\(nombre\)/.test(g) && /if\(datSexo\)/.test(g) &&
     /if\(edad &&/.test(g) && /if\(alt\)/.test(g),
     'y solo los campos que rellenó',
     'mandar `null` por un campo que dejó vacío borraría lo que ya hubiera');

  ok(/14 && edad <= 99/.test(g), 'una edad imposible no entra');
  ok(/120 && alt <= 230/.test(g), 'ni una altura imposible');

  // LA PARTE QUE SE OLVIDA. La fórmula no lee el perfil: lee los campos de
  // la pantalla de registro. Guardar sin volcarlos ahí deja el suelo
  // calculándose con los 28 años y los 170 cm hasta la próxima sesión.
  ok(/getElementById\('regEdad'\)\.value = /.test(g) &&
     /getElementById\('regAltura'\)\.value = /.test(g) &&
     /reg\.sexo = /.test(g),
     'y los campos del registro se enteran en el momento',
     'si no, el suelo se sigue calculando con 28 años y 170 cm hasta que ' +
     'esa persona vuelva a entrar');

  // Y NO RECALCULA LOS MACROS, igual que los días de gimnasio.
  ok(!/calcularMacros\(\)|actualizarMetas\(\)/.test(g),
     'y NO se recalculan los macros',
     'lo que decide las calorías es el gasto medido: rehacer la fórmula ' +
     'aquí tiraría meses de ajuste del cierre de un toque');
}

// ------------------------------------------------------------------
console.log('\nY la fila se pinta al cargar el perfil');
{
  const i = APP.indexOf('pintarObjetivoPerfil();\n          pintarDatosPerfil();');
  ok(i > 0, 'se pinta con las demás al entrar',
     'una fila que solo se pinta al guardarla se queda en «—» para quien ' +
     'nunca la abre, que es justo quien la necesita');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
