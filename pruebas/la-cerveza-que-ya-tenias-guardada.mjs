// El sexto sitio donde el alcohol se caía por el camino.
//
// La pantalla de «Crear alimento» tiene TRES casillas —proteína,
// carbohidrato, grasa— y eso está bien: nadie sabe cuántos gramos de
// etanol lleva lo que se va a comer, y pedirlo sería pedir un dato que
// no existe.
//
// Lo que no está bien es lo que pasa cuando esa pantalla toca algo que
// SÍ tiene el dato. Si escribes el nombre de algo que ya está en tu
// despensa, la app lo detecta y pregunta:
//
//     «Cerveza» ya está en tus guardados por 100g: 43 cal.
//     Lo que acabas de escribir son 16. ¿Le cambio los macros?
//
// Contestes lo que contestes, lo que se apunta sale de
// `alimentoDelFormulario`, que arma la porción base así:
//
//     porBase: { P:P, C:C, G:G }
//
// Sin `A`. Y `aplicarCantidad` —que sí sabe del alcohol— lee
// `a.porBase.A || 0`, o sea cero. Una lata entraba por 58 calorías en
// vez de 137.
//
// LA DIFERENCIA DE 43 CONTRA 16 QUE DICE EL AVISO ES EXACTAMENTE ESTO:
// el 43 sale de la ficha guardada, que lleva su alcohol; el 16, de los
// tres macros tecleados. El aviso enseñaba el agujero en pantalla y
// nadie lo leyó así.
//
// EL ARREGLO NO ES AÑADIR UNA CASILLA. El alcohol que corresponde ya lo
// tiene la ficha guardada —entró con ella desde el catálogo— y es el
// único dato honesto que hay. Se arrastra. Y se arrastra TAMBIÉN a la
// línea de debajo del formulario, porque si el apunte dice 137 y la
// línea decía 58, se cambia una mentira por otra.
//
// Lo que se crea de cero sigue llevando cero: ahí no hay dato que
// arrastrar, y cero es la verdad.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8').replace(/\r\n/g, '\n');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

const LIMPIO = APP.replace(/^\s*\/\/.*$/gm, '');
function fn(cabecera) {
  const i = LIMPIO.indexOf(cabecera);
  if (i < 0) return null;
  let n = 0;
  for (let j = LIMPIO.indexOf('{', i); j < LIMPIO.length; j++) {
    if (LIMPIO[j] === '{') n++;
    else if (LIMPIO[j] === '}') { n--; if (!n) return LIMPIO.slice(i, j + 1); }
  }
  return null;
}

// ------------------------------------------------------------------
console.log('\nLo que se teclea, convertido en alimento');
{
  const fuente = [fn('function baseDeUnidad('), fn('function aplicarCantidad('),
                  fn('function alimentoDelFormulario(')];
  if (fuente.some((f) => !f)) {
    console.log('  FALLA  no encuentro el armado del formulario en app.js');
    console.log('\n0 bien, 1 mal');
    process.exit(1);
  }
  const crear = new Function(fuente.join('\n') + '; return alimentoDelFormulario;')();
  const cal = (a) => a.P * 4 + a.C * 4 + a.G * 9 + (a.A || 0) * 7;

  // Una lata de cerveza: la ficha guardada va por pieza y lleva 14 g de
  // alcohol dentro. Lo tecleado son los tres macros de siempre.
  const lata = crear('Cerveza', 1.8, 13, 0, 'Pieza', 1, 14);
  ok(Math.abs(cal(lata) - 157) < 6,
     'una lata con el alcohol de su ficha entra por sus ~157 calorías',
     'salió con ' + Math.round(cal(lata)) + ' · ' + JSON.stringify(lata) +
     '\n         sin la `A`, los 14 g de etanol —98 de las 157— no están en ' +
     'ninguna parte');

  // Y escala, que es la mitad que falla sola.
  const dos = crear('Cerveza', 1.8, 13, 0, 'Pieza', 2, 14);
  ok(Math.abs(cal(dos) - 2 * cal(lata)) < 1, 'y dos latas son el doble que una',
     'una `A` que no escala es peor que no tenerla: miente solo a veces');

  // Por gramos, la base son 100 y no 1.
  const medioLitro = crear('Cerveza', 0.5, 3.6, 0, 'Gramos', 500, 3.9);
  ok(Math.abs(medioLitro.A - 19.5) < 0.1,
     'y medio litro por gramos lleva cinco veces el alcohol de cien',
     'salió A' + medioLitro.A + ', esperaba 19.5');

  // LO QUE SE CREA DE CERO SIGUE EN CERO. Sin dato no se inventa uno, y
  // sobre todo no sale `undefined` camino de la base.
  const nuevo = crear('Avena', 13, 68, 7, 'Gramos', 40);
  ok(nuevo.A === 0, 'y lo que se crea de cero lleva cero, no `undefined`',
     'un `undefined` viajando hasta la base es un NaN esperando: ' +
     JSON.stringify(nuevo));
  ok(Math.abs(nuevo.P - 5.2) < 0.05, 'y los tres de siempre siguen igual',
     JSON.stringify(nuevo));
}

// ------------------------------------------------------------------
console.log('\nY el alcohol sale de la ficha que ya tenías');
{
  // Los dos sitios que llaman al armado teniendo delante la ficha
  // guardada. Si uno lo pasa y el otro no, la línea de debajo del
  // formulario y el apunte dicen números distintos.
  const guardar = LIMPIO.slice(LIMPIO.indexOf("var yaLoTiene = guardadoIgual("));
  const hastaElFinal = guardar.slice(0, guardar.indexOf('\n  });'));
  // Hasta el `;` de la llamada y no hasta el primer `)`: dentro va un
  // `document.getElementById('nfQty').value` con paréntesis propios.
  ok(/alimentoDelFormulario\([^;]*yaLoTiene/.test(hastaElFinal.replace(/\s+/g, ' ')),
     'al apuntar algo que ya tenías, el alcohol sale de su ficha',
     'es el único dato de alcohol que existe en esa pantalla');

  // Y LA LÍNEA, EJECUTADA. Comprobar por texto que nombra
  // `guardadoIgual` no vale: se puede llamar y tirar el resultado, que
  // es justo lo que hacía. Lo que importa es el número que escribe.
  const partes = [fn('function baseDeUnidad('), fn('function aplicarCantidad('),
                  fn('function alcoholDeFicha('), fn('function alimentoDelFormulario('),
                  fn('function calAlim('), fn('function un('),
                  fn('function pintarTotalNuevo(')];
  if (partes.some((p) => !p)) {
    ok(false, 'y la línea de debajo del formulario dice lo que se va a apuntar',
       'no encuentro alguna de las piezas en app.js');
  } else {
    const escrito = {};
    const cajas = {
      nfTotal: { set textContent(v) { escrito.total = v; } },
      nfQty:   { value: '1' },
      nfName:  { value: 'Cerveza' },
    };
    const correr = new Function(
      'document', 'guardadoIgual', 'unidadActual', 'nfP', 'nfC', 'nfG',
      'mil', 'textoUnidad',
      partes.join('\n') + '; pintarTotalNuevo();');

    const laFicha = { n: 'Cerveza', u: 'Pieza', P: 1.8, C: 13, G: 0, A: 14 };
    correr(
      { getElementById: (id) => cajas[id] || null },
      () => laFicha, 'Pieza',
      { value: '1.8' }, { value: '13' }, { value: '0' },
      (n) => String(n), () => 'piezas');

    const cal = Number((/· (\d+) cal/.exec(escrito.total || '') || [])[1]);
    ok(Math.abs(cal - 157) < 6,
       'y la línea de debajo del formulario dice lo que se va a apuntar',
       'escribió «' + escrito.total + '»\n         si el apunte cuenta el ' +
       'alcohol y la línea no, se cambia una mentira por otra:\n         ' +
       'diría «se apunta 59 cal» y entrarían 157');

    // Y sin ficha en la despensa, lo tecleado y nada más.
    escrito.total = null;
    correr(
      { getElementById: (id) => cajas[id] || null },
      () => null, 'Pieza',
      { value: '1.8' }, { value: '13' }, { value: '0' },
      (n) => String(n), () => 'piezas');
    const sinFicha = Number((/· (\d+) cal/.exec(escrito.total || '') || [])[1]);
    ok(sinFicha === 59,
       'y lo que no tienes guardado se queda en los tres macros tecleados',
       'escribió «' + escrito.total + '», esperaba 59 cal');
  }
}

// ------------------------------------------------------------------
console.log('\nY lo que ya funcionaba sigue funcionando');
{
  // `actualizarGuardado` NO toca el alcohol a propósito: el PATCH manda
  // los tres macros tecleados y `alcohol_g` se queda como estaba. Que
  // siga sin mandarlo es la conducta correcta, no un olvido.
  const act = fn('function actualizarGuardado(g, P, C, G){');
  ok(act && !/alcohol_g/.test(act),
     'corregir los macros de una ficha no le pisa el alcohol',
     'el formulario no puede saber el alcohol: mandar un cero lo borraría');

  // Y el aviso sigue comparando las dos cosas con los cuatro macros.
  ok(/A: a\.porBase \? \(a\.porBase\.A \|\| 0\) : \(a\.A \|\| 0\) \};/.test(APP),
     'y «son los mismos macros» sigue mirando los cuatro');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
