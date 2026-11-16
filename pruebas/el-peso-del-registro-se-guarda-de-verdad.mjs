// El peso del registro: inventado en cada apertura, y nunca guardado.
//
// `aplicarRegistro()` acababa con tres líneas y un comentario que decía
// «el peso del registro cuenta como el primero»:
//
//     PESOS[isoDe(HOY)] = Math.round(m.peso * 10) / 10;
//     document.getElementById('pesoInput').value = PESOS[isoDe(HOY)];
//     pintarPeso();
//
// No contaba: `sbGuardarPeso` se llama desde UN solo sitio, el botón de
// Guardar. En `weight_logs` no quedaba nada del alta.
//
// Y lo que esas líneas hacían de verdad era peor. `restaurarCuenta()` llama
// a `aplicarRegistro()` EN CADA APERTURA, con el formulario que se guardó en
// `localStorage` el día del alta —`guardarCuenta()` solo se llama al crear la
// cuenta, así que ese número está congelado ahí—. O sea que en cada arranque
// entraba en `PESOS` un pesaje con la fecha de hoy y el peso de hace meses.
//
// Con señal se corregía al segundo, cuando la carga hace `PESOS = {}`. Sin
// señal, o si la carga falla, se quedaba: la nota «No se ha registrado el
// peso hoy» escondida, el campo relleno, y un toque en Guardar escribiendo
// ese peso viejo con la fecha de hoy —en una tabla donde solo se puede
// escribir el día de hoy y donde lo único que borra es «Empezar de cero»—.
//
// Un pesaje inventado es peor que uno que falta, porque parece dato: entra en
// el `peso_medio` de la semana y de ahí en la medición del gasto.
//
// Las dos mitades del arreglo se prueban aparte, y las tres secciones
// EJECUTAN el código: que `aplicarRegistro` ya no toque el peso, que
// `primerPesaje` lo guarde, y que el alta lo llame ANTES de la carga —que es
// lo que hace que el primer pesaje vuelva en ella—.

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

// LOS COMENTARIOS SE QUITAN ANTES DE CONTAR LLAVES. Contar sobre el fuente
// crudo deja el corte a merced de un `{}` escrito en una explicación —y la
// explicación de este arreglo nombra `PESOS = {}`—, que es justo la forma de
// prueba que se rompe sola sin que nada esté mal.
const sinC = (s) => s.replace(/^\s*\/\/.*$/gm, '');
const LIMPIO = sinC(APP);

function fn(cabecera) {
  const i = LIMPIO.indexOf(cabecera);
  if (i < 0) throw new Error('no encuentro: ' + cabecera);
  let n = 0;
  for (let j = LIMPIO.indexOf('{', i); j < LIMPIO.length; j++) {
    if (LIMPIO[j] === '{') n++;
    else if (LIMPIO[j] === '}') { n--; if (!n) return LIMPIO.slice(i, j + 1); }
  }
  throw new Error('llaves sin cerrar: ' + cabecera);
}

// Un documento de mentira que recuerda lo que se le escribió.
function domFalso() {
  const campos = {};
  const dame = (id) => campos[id] || (campos[id] = { value: '', textContent: '', innerHTML: '' });
  return { campos, document: { getElementById: dame } };
}

const HOY = new Date(2026, 10, 15);
const isoDe = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
                     '-' + String(d.getDate()).padStart(2, '0');

// ------------------------------------------------------------------
console.log('\nPintar el formulario no es apuntar un pesaje');
{
  const dom = domFalso();
  dom.document.getElementById('regNombre').value = 'Eduardo';
  dom.document.getElementById('regCorreo').value = 'edu@ejemplo.com';

  const PESOS = {};
  let pintados = 0;
  const armar = new Function(
    'document', 'calcularMacros', 'pintarDatosPerfil', 'pintarObjetivoPerfil',
    'goalP', 'goalC', 'goalG', 'actualizarMetas', 'PESOS', 'isoDe', 'HOY', 'pintarPeso',
    fn('function aplicarRegistro(){') + '; return aplicarRegistro;'
  );
  const aplicarRegistro = armar(
    dom.document,
    () => ({ peso: 92.4, P: 185, C: 210, G: 72 }),
    () => {}, () => {},
    { value: 0 }, { value: 0 }, { value: 0 }, () => {},
    PESOS, isoDe, HOY, () => { pintados++; }
  );

  aplicarRegistro();

  // QUE SIGA HACIENDO SU TRABAJO. Sin esto, borrar la función entera dejaría
  // pasar las dos comprobaciones de abajo.
  ok(/92\.4 kg/.test(dom.campos.profPeso.innerHTML),
     'el perfil queda con el peso del formulario',
     'salió: ' + JSON.stringify(dom.campos.profPeso.innerHTML));
  ok(dom.campos.saludoNombre.textContent === 'Eduardo', 'y el saludo con el nombre');

  ok(Object.keys(PESOS).length === 0,
     'y no mete ningún pesaje con la fecha de hoy',
     'metió ' + JSON.stringify(PESOS) + '. Esto corre en CADA apertura con el ' +
     'peso del día del alta: sin señal se queda, y un toque en Guardar lo ' +
     'escribe como el peso de hoy');
  // Se lee así y no `dom.campos.pesoInput.value` porque lo normal ahora es
  // que ese campo no se haya tocado y no exista en el registro de escrituras:
  // pedirlo directo reventaría la prueba justo cuando todo está bien.
  const puestoEnElCampo = dom.campos.pesoInput ? dom.campos.pesoInput.value : '';
  ok(puestoEnElCampo === '',
     'ni rellena el campo de Peso',
     'puso «' + puestoEnElCampo + '». El campo lo llena la carga con lo que ' +
     'hay en la base, que es lo único que de verdad se midió');
  ok(pintados === 0, 'y no repinta la gráfica, que ya no cambia nada aquí');
}

// ------------------------------------------------------------------
console.log('\nY el peso del alta se guarda donde está el historial');
{
  const correr = (valor) => {
    const dom = domFalso();
    dom.document.getElementById('regPeso').value = valor;
    const llamadas = [], fallos = [];
    const armar = new Function(
      'document', 'sbGuardarPeso', 'isoDe', 'HOY', 'apuntarFallo',
      fn('function primerPesaje(){') + '; return primerPesaje;'
    );
    const primerPesaje = armar(
      dom.document,
      (fecha, kg, cintura) => { llamadas.push([fecha, kg, cintura]); return Promise.resolve(); },
      isoDe, HOY,
      (donde, e) => { fallos.push(donde); }
    );
    return { llamadas, fallos, hecho: primerPesaje() };
  };

  const r = correr('92.4');
  await r.hecho;
  ok(r.llamadas.length === 1, 'se guarda una vez', JSON.stringify(r.llamadas));
  ok(r.llamadas[0] && r.llamadas[0][0] === '2026-11-15',
     'con la fecha de hoy', JSON.stringify(r.llamadas[0]));
  ok(r.llamadas[0] && r.llamadas[0][1] === 92.4,
     'y el peso del formulario', JSON.stringify(r.llamadas[0]));
  ok(r.llamadas[0] && r.llamadas[0][2] === null,
     'y sin cintura: el alta no la pregunta',
     'mandar un valor ahí sería inventarse una medida del cuerpo');

  const redondo = correr('92.47');
  await redondo.hecho;
  ok(redondo.llamadas[0] && redondo.llamadas[0][1] === 92.5,
     'redondeado a un decimal, como todo lo demás',
     JSON.stringify(redondo.llamadas[0]));

  // FUERA DE RANGO NO SE MANDA. La columna solo acepta 20–400 y la fila
  // rebota ENTERA: mandarla es gastar una petición en un 400 seguro.
  for (const malo of ['', '0', '12', '850', 'ochenta']) {
    const x = correr(malo);
    await x.hecho;
    ok(x.llamadas.length === 0, 'con el peso en «' + malo + '» no se manda nada',
       JSON.stringify(x.llamadas));
    ok(x.fallos.length === 0, '  y tampoco se apunta como fallo',
       'no es un fallo de red: es un número que no cabe en la columna');
  }
}

console.log('\nY si el guardado falla, el alta no se cae');
{
  const dom = domFalso();
  dom.document.getElementById('regPeso').value = '92.4';
  const fallos = [];
  const armar = new Function(
    'document', 'sbGuardarPeso', 'isoDe', 'HOY', 'apuntarFallo',
    fn('function primerPesaje(){') + '; return primerPesaje;'
  );
  const primerPesaje = armar(
    dom.document,
    () => Promise.reject(new Error('servidor de mal día')),
    isoDe, HOY,
    (donde) => { fallos.push(donde); }
  );

  let reventó = false;
  await primerPesaje()['catch'](() => { reventó = true; });
  ok(!reventó, 'la promesa se resuelve igual',
     'la cuenta ya existe y la sesión está activa: tratar esto como un error ' +
     'del registro dejaría a alguien fuera de una cuenta que ya es suya');
  ok(fallos.length === 1, 'pero el fallo queda apuntado',
     'callarlo del todo sería no enterarse nunca de que ninguna cuenta nueva ' +
     'tiene su primer pesaje');
}

// ------------------------------------------------------------------
console.log('\nY el alta lo llama, antes de la carga');
{
  const correr = (perfilFalla) => {
    const orden = [];
    const armar = new Function(
      'sbRegistrar', 'campoNombre', 'guardarSesion', 'aplicarRegistro', 'guardarCuenta',
      'sbGuardarPerfil', 'goto', 'primerPesaje', 'cargarDatos', 'ocupado', 'btnEmpezar',
      'toast', 'traducirError', 'marcarError', 'campoCorreo', 'avisoCorreo',
      'logCorreo', 'avisarLogin',
      fn('function crearLaCuenta(correo, pass){') + '; return crearLaCuenta;'
    );
    const crearLaCuenta = armar(
      () => Promise.resolve({ access_token: 't', user: { id: 'yo' } }),
      { value: 'Eduardo' },
      () => {}, () => { orden.push('aplicarRegistro'); }, () => {},
      () => perfilFalla ? Promise.reject(new Error('no pude')) : Promise.resolve(),
      () => {},
      () => { orden.push('primerPesaje'); return Promise.resolve(); },
      () => { orden.push('cargarDatos'); return Promise.resolve(); },
      () => {}, {}, () => {}, (m) => m, () => {}, {}, {}, { value: '' }, () => {}
    );
    return { orden, hecho: crearLaCuenta('edu@ejemplo.com', 'x') };
  };

  const bien = correr(false);
  await bien.hecho;
  ok(bien.orden.indexOf('primerPesaje') >= 0,
     'el alta normal guarda el primer pesaje',
     'salió ' + JSON.stringify(bien.orden) + '. Una función que nadie llama no ' +
     'arregla nada');
  ok(bien.orden.indexOf('primerPesaje') < bien.orden.indexOf('cargarDatos'),
     'y lo hace ANTES de la carga',
     'salió ' + JSON.stringify(bien.orden) + ': detrás de la carga, el pesaje ' +
     'no vuelve en ella y el primer día la gráfica sigue vacía hasta la ' +
     'siguiente apertura');

  // Y SI EL PERFIL NO SE GUARDA, EL PESAJE VA IGUAL: son dos tablas y dos
  // peticiones. Ese camino existe de verdad —tiene su aviso escrito— y es
  // justo donde se olvidaría.
  const malo = correr(true);
  await malo.hecho;
  ok(malo.orden.indexOf('primerPesaje') >= 0,
     'y aunque el perfil no se haya podido guardar, el pesaje también va',
     'salió ' + JSON.stringify(malo.orden));
  ok(malo.orden.indexOf('primerPesaje') < malo.orden.indexOf('cargarDatos'),
     '  y también antes de la carga', JSON.stringify(malo.orden));
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
