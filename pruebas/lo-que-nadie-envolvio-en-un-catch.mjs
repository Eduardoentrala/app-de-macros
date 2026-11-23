// La tabla de errores llevaba meses vacía, y no porque no pasara nada.
//
// La 0063 creó `errores` y `apuntar_error()` con una frase: «ninguno
// levantó la mano, porque no había dónde levantarla. Esto es ese
// sitio». Y el sitio funciona — se comprobó contra la base de verdad:
// la función existe, con su firma y su permiso para `authenticated`.
//
// Lo que faltaba era quién lo usa. `apuntarFallo` se llama desde 24
// sitios, y los 24 son `catch` que alguien se acordó de escribir. O
// sea que solo se apunta lo que ya se estaba esperando.
//
// Un `TypeError` suelto a media función no lo ve nadie. Y es justo el
// que nunca se reporta: la app no se cierra ni sale un error en
// pantalla, se queda media lista sin pintar y parece «que va lenta».
//
// DOS REGLAS QUE NO SON NEGOCIABLES, y las dos vienen de lo que ya
// estaba escrito al lado de `apuntarFallo`:
//
//   · NO PUEDE FALLAR HACIA FUERA. Esto corre en el manejador de un
//     error: si él mismo revienta, el fallo original desaparece y
//     encima queda otro encima.
//   · NO LLEVA DATOS DE NADIE. Y aquí es MÁS delicado que en los 24
//     sitios de antes. Esos mensajes los escribimos nosotros; el de un
//     error suelto lo escribe el motor y arrastra lo que hubiera en la
//     variable — `JSON.parse` cita el texto que no pudo leer, y ese
//     texto puede ser la comida de alguien. Se tacha lo que va entre
//     comillas y los números largos antes de mandar nada.
//
// Y LOS DEL ARRANQUE SE GUARDAN. Sin sesión la base los rechaza, y los
// de antes de entrar son los peores de perder: si la app se rompe al
// cargar, no hay segunda oportunidad. Se quedan esperando —pocos, que
// esto no es un almacén— y salen cuando hay sesión.

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

const limpiar = fn('function sinDatosDeNadie(');
if (!limpiar) {
  console.log('\n  FALLA  no existe `sinDatosDeNadie`: no hay manejador global de errores,\n' +
              '         así que lo único que se apunta es lo que alguien ya esperaba');
  console.log('\n0 bien, 1 mal');
  process.exit(1);
}
const sinDatos = new Function(limpiar + '; return sinDatosDeNadie;')();

// ------------------------------------------------------------------
console.log('\nLo que se manda no lleva datos de nadie');
{
  // El caso que de verdad pasa: `JSON.parse` cita lo que no pudo leer.
  const real = `Unexpected token 'c', "chicharron de cerdo, 250 g" is not valid JSON`;
  const t = sinDatos(real);
  ok(!/chicharron/i.test(t), 'lo que va entre comillas se tacha',
     'salió: ' + t);
  ok(/JSON/.test(t), 'y lo que explica el fallo se queda', 'salió: ' + t);

  // Y ENTRE COMILLAS SIMPLES TAMBIÉN, que el navegador usa las dos. Este
  // es literal de Chrome cuando un selector lleva algo raro dentro, y lo
  // raro suele ser el nombre de lo que acabas de apuntar.
  const sel = sinDatos(
    "Failed to execute 'querySelector' on 'Document': " +
    "'#comida-chicharron de cerdo' is not a valid selector.");
  ok(!/chicharron/i.test(sel), 'y lo que va entre comillas simples igual',
     'salió: ' + sel);
  ok(/not a valid selector/.test(sel), 'sin perder de qué iba', 'salió: ' + sel);

  // CON EL DECIMAL DENTRO. «82.4» son dos cifras, un punto y otra: si se
  // tacha solo a partir de tres dígitos seguidos, el peso de alguien
  // sale entero por el hueco.
  const conPeso = sinDatos('peso 82.4 kg, meta 1947 cal, cintura 88 cm');
  ok(!/82|1947|88/.test(conPeso), 'y cualquier número de dos cifras o más',
     'salió: ' + conPeso);
  ok(/peso/.test(conPeso) && /cal/.test(conPeso),
     'y las palabras se quedan, que son las que explican dónde fue',
     'salió: ' + conPeso);

  const tipico = sinDatos("Cannot read properties of null (reading 'value')");
  ok(/Cannot read properties of null/.test(tipico),
     'y el error de siempre sigue siendo legible', 'salió: ' + tipico);

  ok(sinDatos('x'.repeat(900)).length <= 200,
     'y nada pasa de 200 caracteres, que es lo que admite la columna',
     'salió de ' + sinDatos('x'.repeat(900)).length);

  for (const v of [null, undefined, 0, '', NaN, {}, []]) {
    let reventó = false;
    try { sinDatos(v); } catch (e) { reventó = true; }
    ok(!reventó, 'y con ' + JSON.stringify(v) + ' no revienta');
  }
}

// ------------------------------------------------------------------
console.log('\nY los dos manejadores están puestos');
{
  ok(/addEventListener\('error'/.test(LIMPIO),
     'se escucha el error suelto de JavaScript',
     'es el que deja media pantalla sin pintar sin cerrar la app');
  ok(/addEventListener\('unhandledrejection'/.test(LIMPIO),
     'y la promesa que nadie atrapó',
     'media app son promesas: un `.then` sin `.catch` se pierde igual');

  // ARRIBA DEL TODO. Un manejador registrado en la línea 13.000 no ve
  // nada de lo que se rompa en las 12.999 de antes, que es justo donde
  // se monta la pantalla.
  const iError = LIMPIO.indexOf("addEventListener('error'");
  ok(iError > 0 && iError < LIMPIO.indexOf('function show(') + 4000,
     'y se registran al principio del fichero',
     'si se registran al final, no ven romperse nada de lo que va antes');
}

// ------------------------------------------------------------------
console.log('\nY nada de esto puede fallar hacia fuera');
{
  const suelto = fn('function apuntarSuelto(');
  ok(suelto && /try\{/.test(suelto) && /catch/.test(suelto),
     '`apuntarSuelto` se traga lo suyo',
     'corre dentro del manejador de un error: si revienta, tapa el fallo ' +
     'original');

  // Ejecutado de verdad, con `apuntarFallo` reventando a propósito.
  const correr = new Function(
    'sesion', 'apuntarFallo',
    // El tope sale del propio app.js: si allí sube a 50, esta prueba
    // tiene que medir 50 y no un número suyo.
    'var FALLOS_EN_ESPERA = [];\nvar ESPERA_TOPE = ' +
      (APP.match(/var ESPERA_TOPE = (\d+);/) || [, '0'])[1] + ';\n' + limpiar + '\n' + suelto +
    '; return { suelto: apuntarSuelto, cola: FALLOS_EN_ESPERA };');

  let reventó = false, recibido = null;
  try {
    const a = correr({ user: { id: 'x' } }, () => { throw new Error('la base dijo que no'); });
    a.suelto('js:app.js:10', 'TypeError: algo');
  } catch (e) { reventó = true; }
  ok(!reventó, 'y si `apuntarFallo` revienta, no sale de aquí');

  // Sin sesión se guarda en vez de perderse.
  const b = correr(null, (d, e) => { recibido = [d, e.message]; });
  b.suelto('js:app.js:10', 'TypeError: algo');
  ok(b.cola.length === 1 && recibido === null,
     'sin sesión se queda esperando, no se tira',
     'cola: ' + JSON.stringify(b.cola) + ' · mandado: ' + JSON.stringify(recibido));

  // Y no se convierte en un almacén.
  const c = correr(null, () => {});
  for (let i = 0; i < 40; i++) c.suelto('js:app.js:' + i, 'TypeError: algo ' + i);
  ok(c.cola.length <= 10, 'y la espera tiene tope',
     'se quedaron ' + c.cola.length + '; sin tope, una pantalla que repinta ' +
     'en bucle\n         llena la memoria con su propio fallo');

  // Con sesión va directo.
  const d = correr({ user: { id: 'x' } }, (dd, e) => { recibido = [dd, e.message]; });
  d.suelto('js:app.js:10', 'TypeError: algo');
  ok(d.cola.length === 0 && recibido && recibido[0] === 'js:app.js:10',
     'y con sesión se manda al momento', JSON.stringify(recibido));
}

// ------------------------------------------------------------------
console.log('\nY lo que esperaba sale al entrar');
{
  const guardar = fn('function guardarSesion(');
  ok(guardar && /soltarFallosEnEspera\(\)/.test(guardar),
     'al abrir sesión se sueltan los fallos del arranque',
     'si no, los de antes de entrar —los peores— no salen nunca');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
