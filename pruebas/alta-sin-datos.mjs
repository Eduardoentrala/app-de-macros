// Se podía terminar el alta sin edad ni altura, y salían calorías de mentira.
//
// LO QUE PASABA. Los tres campos que deciden todo —edad, altura, peso— tienen
// su `min` y su `max` en el HTML, pero ninguno es obligatorio y nada los
// miraba. El botón «Empezar» solo se bloqueaba por la casilla de los
// términos. Así que se podía llegar al final con la edad y la altura en
// blanco.
//
// Y entonces la cuenta sigue funcionando, que es lo peor que podía hacer.
// `gastoEstimado()` hace `Number(campo.value) || 0`, o sea que un hueco vale
// cero, y la fórmula de Mifflin con altura 0 y edad 0 da un metabolismo
// basal ridículo. Medido en el navegador con 80 kg y los otros dos vacíos:
//
//     «Gastas ~1,248 cal al día»          → y 1.248 de objetivo
//
// Para alguien de 80 kg lo real ronda las 2.200-2.800. Esa persona se lleva
// un déficit enorme que nadie quiso, se queda guardado en su perfil, y el
// anillo del Diario le va a decir todos los días que se pasó.
//
// No salta ningún aviso porque el número PARECE correcto: pasa el suelo de
// 1.200 que protege de los déficits absurdos, así que el suelo tampoco lo
// caza. Un número siempre parece correcto.
//
// EL ARREGLO es exigir los tres, y dentro de su rango. Los rangos ya estaban
// escritos en el HTML —14-99, 120-230, 30-300—; lo que faltaba era mirarlos.
// Se leen de ahí y no se copian aquí: dos listas de límites se separan.

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
console.log('\nLos límites siguen escritos en la pantalla');
{
  // Si se quitan de ahí, la comprobación se queda sin rangos que mirar.
  const limites = {};
  for (const id of ['regEdad', 'regAltura', 'regPeso']) {
    const i = HTML.indexOf('id="' + id + '"');
    const eti = HTML.slice(HTML.lastIndexOf('<input', i), HTML.indexOf('>', i) + 1);
    limites[id] = {
      min: Number((eti.match(/min="(\d+)"/) || [])[1]),
      max: Number((eti.match(/max="(\d+)"/) || [])[1]),
    };
    ok(limites[id].min > 0 && limites[id].max > limites[id].min,
       `${id} tiene su rango (${limites[id].min}-${limites[id].max})`,
       'sin min/max en el HTML no hay contra qué comprobar');
  }
  globalThis.__limites = limites;
}

// ------------------------------------------------------------------
console.log('\nY el botón de empezar los exige');
{
  // Se ejecuta la comprobación de verdad, con campos de mentira.
  const fuente = sacar('function datosCompletos(){');
  const campos = {};
  const doc = { getElementById: (id) => campos[id] || null };
  const datosCompletos = new Function('document', fuente + '; return datosCompletos;')(doc);

  const poner = (edad, alt, peso) => {
    const L = globalThis.__limites;
    campos.regEdad   = { value: String(edad), min: String(L.regEdad.min),   max: String(L.regEdad.max) };
    campos.regAltura = { value: String(alt),  min: String(L.regAltura.min), max: String(L.regAltura.max) };
    campos.regPeso   = { value: String(peso), min: String(L.regPeso.min),   max: String(L.regPeso.max) };
  };

  poner(30, 175, 80);
  ok(datosCompletos() === true, 'con los tres puestos y sensatos, deja pasar');

  // El caso medido: peso puesto, los otros dos en blanco.
  poner('', '', 80);
  ok(datosCompletos() === false, 'sin edad ni altura, NO deja pasar',
     'así se llegaba a «gastas 1.248 cal al día» con 80 kg');

  poner(30, '', 80);
  ok(datosCompletos() === false, 'sin la altura tampoco',
     'la altura pesa 6,25 por centímetro en la fórmula: sin ella el gasto se hunde');
  poner('', 175, 80);
  ok(datosCompletos() === false, 'ni sin la edad');
  poner(30, 175, '');
  ok(datosCompletos() === false, 'ni sin el peso');

  // Fuera de rango: un cero, un número absurdo, letras.
  poner(0, 175, 80);
  ok(datosCompletos() === false, 'una edad de cero no vale');
  poner(30, 5, 80);
  ok(datosCompletos() === false, 'ni una altura de 5',
     'el min del HTML es 120 y estaba ahí sin que nadie lo mirara');
  poner(30, 175, 900);
  ok(datosCompletos() === false, 'ni un peso de 900');
  poner('abc', 175, 80);
  ok(datosCompletos() === false, 'ni letras en la edad');

  // Y los bordes, que tienen que seguir valiendo.
  const L = globalThis.__limites;
  poner(L.regEdad.min, L.regAltura.min, L.regPeso.min);
  ok(datosCompletos() === true, 'los mínimos exactos sí valen',
     'dejar fuera a quien está justo en el borde sería un fallo nuevo');
  poner(L.regEdad.max, L.regAltura.max, L.regPeso.max);
  ok(datosCompletos() === true, 'y los máximos exactos también');
  poner(30, 175.5, 80.4);
  ok(datosCompletos() === true, 'y los decimales, que el peso los lleva');
}

// ------------------------------------------------------------------
console.log('\nY quien decide si el botón se apaga la tiene en cuenta');
{
  const rev = sacar('function revisarConsentimiento(){');
  ok(/datosCompletos\(\)/.test(rev),
     'la comprobación entra en la decisión de apagar el botón',
     'escrita y no usada, no sirve de nada');
  ok(/boton\.disabled\s*=/.test(rev), 'que es lo que apaga el botón');
  // Y que los tres campos la vuelvan a lanzar al escribir: si solo se
  // comprobara al arrancar, el botón se quedaría apagado para siempre.
  const i = APP.indexOf("['regEdad','regAltura','regPeso'].forEach");
  const trozo = APP.slice(i, APP.indexOf('});', i));
  ok(/revisarConsentimiento/.test(trozo),
     'y al teclear en los tres campos se vuelve a mirar',
     'sin esto el botón no se enciende nunca aunque se rellenen: ' + trozo);
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
