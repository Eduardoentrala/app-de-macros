// Un tropiezo dejaba «Guardar sesión» muerto para el resto del día.
//
// EL CANDADO. Guardar una sesión hace un viaje de ida y vuelta —«¿ya hay una
// de hoy?»— y dos toques seguidos no le dan tiempo: las dos consultas
// contestarían «no hay» y se crearían dos filas. Por eso hay un `guardandoSesion`
// que impide disparar otra vez mientras la primera está en marcha. Eso está
// bien y hace falta.
//
// EL PROBLEMA ERA DÓNDE SE PONÍA. En la primera línea del manejador, y detrás
// venían cincuenta líneas que leen el DOM: el nombre de cada ejercicio, las
// filas de series, las celdas de cada fila. Si cualquiera de ellas lanzaba
// —una tarjeta con una forma que no se esperaba— el candado se quedaba
// cerrado PARA SIEMPRE. A partir de ese momento el botón no hacía
// absolutamente nada: sin aviso, sin toast, sin nada en pantalla. Hasta
// cerrar la app y volver a abrirla.
//
// Y LO QUE SE VE ENTONCES es lo peor que puede verse en esta app: entrenaste,
// le diste a guardar, y tu semana dice «0 días de fuerza de 3». Ni siquiera
// parece un fallo de guardado; parece que la app se olvidó de ti.
//
// El arreglo no toca la lógica del candado: solo garantiza que se suelte
// también cuando algo revienta antes de empezar.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

function sacar(cabecera) {
  const i = APP.indexOf(cabecera);
  if (i < 0) throw new Error('no encuentro: ' + cabecera);
  let n = 0, j = APP.indexOf('{', i);
  for (; j < APP.length; j++) {
    if (APP[j] === '{') n++;
    else if (APP[j] === '}') { n--; if (!n) return APP.slice(i, j + 1); }
  }
  throw new Error('llaves sin cerrar en ' + cabecera);
}

// ------------------------------------------------------------------
console.log('\nEl candado se suelta aunque algo reviente');
{
  // Se monta el manejador DE VERDAD —el que engancha el botón— con una
  // función de guardado que lanza, y se comprueba que un segundo toque
  // sigue llegando. Si el candado se queda cerrado, no llega.
  const fuente = APP.slice(APP.indexOf("  document.getElementById('saveSessionBtn')"),
                           APP.indexOf('  function guardarSesionAhora(){'));

  // EL CANDADO SE DECLARA DENTRO, compartido entre el manejador de verdad y
  // el doble. Se intentó primero pasándolo como parámetro a `new Function` y
  // la prueba pasaba SIN MIRAR NADA: un parámetro es una variable local, así
  // que el `guardandoSesion = false` del manejador no llegaba al doble y el
  // segundo toque entraba siempre, hubiera arreglo o no. Lo cazó una mutación
  // que borraba justo la línea del arreglo y no rompía nada.
  //
  // El doble imita las DOS primeras líneas de `guardarSesionAhora` —mirar el
  // candado y cerrarlo— y luego lanza, que es exactamente lo que pasaba
  // cuando reventaba leyendo una tarjeta de ejercicio.
  const avisos = [];
  const boton = { addEventListener: (_, fn) => { boton.pulsar = fn; } };
  const api = new Function('document', 'toast', 'traducirError', `
    var guardandoSesion = false;
    var intentos = 0;
    function guardarSesionAhora(){
      if(guardandoSesion) return;
      guardandoSesion = true;
      intentos++;
      throw new TypeError("Cannot read properties of null (reading 'textContent')");
    }
    ${fuente}
    return { intentos: function(){ return intentos; },
             candado: function(){ return guardandoSesion; } };
  `)({ getElementById: () => boton }, (_, m) => avisos.push(m), (m) => String(m));

  ok(typeof boton.pulsar === 'function', 'el botón queda enganchado');
  const intentos = () => api.intentos();

  // Primer toque: revienta.
  let salio = null;
  try { boton.pulsar(); } catch (e) { salio = e; }
  ok(intentos() === 1, 'el primer toque intenta guardar');
  ok(salio instanceof TypeError, 'y el error sigue saliendo, no se traga',
     'tragárselo dejaría el fallo invisible también en la consola');
  ok(avisos.length === 1 && /No se pudo guardar/.test(avisos[0]),
     'y se avisa en pantalla', 'salió: ' + JSON.stringify(avisos));

  // SEGUNDO TOQUE: esto es lo que fallaba.
  try { boton.pulsar(); } catch (e) { /* vuelve a reventar, da igual */ }
  ok(intentos() === 2, 'y el segundo toque VUELVE A INTENTARLO',
     'aquí es donde el botón se quedaba muerto: el candado seguía cerrado y ' +
     'a partir de ese momento no pasaba nada de nada, sin un solo aviso');
}

// ------------------------------------------------------------------
console.log('\nY el candado sigue haciendo su trabajo');
{
  // No vaya a ser que el arreglo lo haya dejado sin efecto: sigue teniendo
  // que impedir el doble guardado mientras uno está en marcha.
  const f = sacar('  function guardarSesionAhora(){');
  ok(/if\(guardandoSesion\) return;/.test(f), 'un toque con otro en marcha no dispara');
  ok(/guardandoSesion = true;/.test(f), 'y se cierra al empezar');

  // Y se suelta en los cuatro caminos: los dos returns tempranos, el final
  // bueno y el fallo de red.
  const sueltas = (f.match(/guardandoSesion = false/g) || []).length;
  ok(sueltas >= 4, `se suelta en ${sueltas} sitios`,
     'los dos returns tempranos, el guardado que sale bien y el que falla');
  ok(/\)\['catch'\]\(function\(e\)\{\s*\n\s*guardandoSesion = false;/.test(f),
     'incluido el fallo de red',
     'sin esto, un guardado que falla deja el botón muerto igual');
}

// ------------------------------------------------------------------
console.log('\nY lo que se ve cuando no hay nada que guardar');
{
  const f = sacar('  function guardarSesionAhora(){');
  // Un `return` mudo aquí se lee como que el botón está roto.
  ok(/No hay series con peso que guardar/.test(f),
     'se dice que no hay series, en vez de no hacer nada',
     'un botón que no responde y no explica por qué es indistinguible de uno roto');
  ok(/if\(!detalle\.length\)\{ guardandoSesion = false;/.test(f),
     'y ahí también se suelta el candado');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
