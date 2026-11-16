// Un peso mal tecleado entraba, contaba, y no se podía quitar.
//
// Lo único que revisaba el peso era `v > 0`. La cintura, al lado, lleva su
// rango en el HTML y otra vez en el código; el peso no llevaba ninguno de los
// dos, y el `check` de la columna —20 a 400— no atrapa el error que de verdad
// se comete: 185 en vez de 85, o 58 en vez de 85. Esos números caben.
//
// Y era permanente. En Peso solo se escribe el día de HOY, así que pasada la
// medianoche no había forma de tocarlo: lo único que borraba era «Empezar de
// cero», con el historial entero. Mientras estuviera, ese número contaba en
// el `peso_medio` de su semana y de ahí en la medición del gasto —y una
// semana envenenada se arrastra las ocho que mira `serieParaMedir`—.
//
// Tres cosas se prueban aquí, y las tres EJECUTANDO el código:
//
//   · el rango duro, que no deja ni pintarlo;
//   · la pregunta cuando no cuadra con el pesaje anterior, que es lo único
//     capaz de distinguir un 185 de un peso de verdad;
//   · y quitar un pesaje, con lo que eso arrastra: la cintura de esa fila, el
//     campo de hoy, y lo que estuviera esperando en la cola sin subir.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8').replace(/\r\n/g, '\n');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

// Los comentarios fuera ANTES de contar llaves: las explicaciones de este
// arreglo nombran `{}` y `PESOS[k]`, y un corte que cuente sobre el fuente
// crudo se rompe solo sin que nada esté mal.
const sinC = (s) => s.replace(/^\s*\/\/.*$/gm, '');
const LIMPIO = sinC(APP);

function desde(i) {
  let n = 0;
  for (let j = LIMPIO.indexOf('{', i); j < LIMPIO.length; j++) {
    if (LIMPIO[j] === '{') n++;
    else if (LIMPIO[j] === '}') { n--; if (!n) return LIMPIO.slice(i, j + 1); }
  }
  throw new Error('llaves sin cerrar en ' + i);
}
function fn(cabecera) {
  const i = LIMPIO.indexOf(cabecera);
  if (i < 0) throw new Error('no encuentro: ' + cabecera);
  return desde(i);
}
// El cuerpo del `click`, sin la cabecera: lo que corre al pulsar Guardar.
function cuerpoDelBoton() {
  const marca = "document.getElementById('saveWeightBtn').addEventListener('click', function(){";
  const i = LIMPIO.indexOf(marca);
  if (i < 0) throw new Error('no encuentro el botón de guardar');
  const todo = desde(i + marca.length - 1);
  return todo.slice(todo.indexOf('{') + 1, todo.lastIndexOf('}'));
}

const HOY = new Date(2026, 10, 15);
const isoDe = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
                     '-' + String(d.getDate()).padStart(2, '0');
const fmtFecha = (d) => d.getDate() + ' nov';
const haceDias = (n) => { const d = new Date(HOY); d.setDate(d.getDate() - n); return isoDe(d); };

function domFalso(valores) {
  const campos = {};
  const dame = (id) => campos[id] || (campos[id] = { value: (valores || {})[id] || '', textContent: '' });
  Object.keys(valores || {}).forEach(dame);
  return { campos, document: { getElementById: dame } };
}

// ------------------------------------------------------------------
console.log('\nUn peso que no cabe en la columna no se guarda ni se pinta');
{
  const pulsar = ({ peso, cintura, pesoDeHoy, raro }) => {
    const dom = domFalso({ pesoInput: String(peso), cinturaInput: cintura == null ? '' : String(cintura) });
    const PESOS = {};
    if (pesoDeHoy != null) PESOS[isoDe(HOY)] = pesoDeHoy;
    const avisos = [], guardados = [], preguntas = [];
    new Function(
      'document', 'PESOS', 'isoDe', 'HOY', 'toast', 'PESO_MIN', 'PESO_MAX',
      'pesoRaro', 'preguntarPesoRaro', 'guardarElPeso',
      cuerpoDelBoton()
    )(
      dom.document, PESOS, isoDe, HOY,
      (donde, msg) => avisos.push(msg), 20, 400,
      () => raro || null,
      (v, cin, fuera, r) => preguntas.push([v, cin, fuera, r]),
      (v, cin, fuera) => guardados.push([v, cin, fuera])
    );
    return { avisos, guardados, preguntas };
  };

  const bien = pulsar({ peso: 85.2 });
  ok(bien.guardados.length === 1 && bien.guardados[0][0] === 85.2,
     'un peso normal se guarda', JSON.stringify(bien));

  for (const malo of [850, 8.5, 19.9, 400.1, 1850]) {
    const r = pulsar({ peso: malo });
    ok(r.guardados.length === 0, 'con ' + malo + ' kg no se guarda nada',
       'salió ' + JSON.stringify(r.guardados) + '. La columna lo rechaza con un ' +
       '400 y la pantalla ya habría felicitado por un peso que no existe');
    ok(/20 y 400/.test(r.avisos[0] || ''), '  y se dice por qué',
       'dijo: «' + (r.avisos[0] || '') + '»');
  }

  // Lo que ya funcionaba y no puede romperse al meter el rango: apuntar solo
  // la cintura reutiliza el peso de hoy, y una cintura imposible no se lleva
  // por delante el peso.
  const soloCintura = pulsar({ peso: 0, cintura: 88, pesoDeHoy: 85.2 });
  ok(soloCintura.guardados.length === 1 && soloCintura.guardados[0][0] === 85.2,
     'y apuntar solo la cintura sigue valiendo, con el peso de hoy',
     JSON.stringify(soloCintura));
  const cinturaMala = pulsar({ peso: 85.2, cintura: 900 });
  ok(cinturaMala.guardados.length === 1 && cinturaMala.guardados[0][1] === null &&
     cinturaMala.guardados[0][2] === true,
     'y una cintura imposible se descarta sin perder el peso',
     JSON.stringify(cinturaMala));

  // Y la pregunta corta el guardado: lo que no puede pasar es que pregunte
  // y guarde igual.
  const conRaro = pulsar({ peso: 185, raro: { kg: 85.2, fecha: haceDias(1), dias: 1, dif: 99.8 } });
  ok(conRaro.preguntas.length === 1, 'y si el peso no cuadra, se pregunta',
     JSON.stringify(conRaro));
  ok(conRaro.guardados.length === 0, '  y NO se guarda mientras tanto',
     'preguntar y guardar igual es no preguntar');
}

// ------------------------------------------------------------------
console.log('\nY lo que distingue un 185 de un peso de verdad');
{
  const mirar = (pesos, v) => {
    const PESOS = {};
    Object.keys(pesos).forEach((k) => { PESOS[k] = pesos[k]; });
    return new Function('PESOS', 'isoDe', 'HOY',
      sinC(fn('function pesajeAnterior(){')) + sinC(fn('function tolerarCambio(dias){')) +
      sinC(fn('function pesoRaro(v){')) + '; return pesoRaro(' + v + ');'
    )(PESOS, isoDe, HOY);
  };

  ok(mirar({}, 85) === null, 'el primer pesaje de todos no se discute',
     'no hay con qué compararlo');

  ok(mirar({ [haceDias(1)]: 85.2 }, 86.0) === null,
     'y el vaivén de un día tampoco',
     'un kilo largo por agua, sal y lo que haya en el estómago: preguntar ahí ' +
     'sería preguntar todos los días, y a eso se le da «sí» sin leerlo');
  ok(mirar({ [haceDias(1)]: 85.2 }, 88.0) === null, 'ni tres kilos arriba');

  const digito = mirar({ [haceDias(1)]: 85.2 }, 185);
  ok(digito && Math.round(digito.dif) === 100,
     'un dígito de más sí', JSON.stringify(digito));
  const cambiado = mirar({ [haceDias(1)]: 85.2 }, 58);
  ok(cambiado && Math.round(cambiado.dif) === -27,
     'y dos cifras cambiadas de sitio también', JSON.stringify(cambiado));

  // EL QUE NO PUEDE PREGUNTAR: quien vuelve después de meses con un cambio
  // de verdad. Si se le discute su propio peso, la app deja de servirle.
  ok(mirar({ [haceDias(90)]: 95 }, 85) === null,
     'y diez kilos en tres meses no se discuten',
     'salió ' + JSON.stringify(mirar({ [haceDias(90)]: 95 }, 85)));
  ok(mirar({ [haceDias(90)]: 95 }, 70) !== null,
     'pero veinticinco en tres meses sí');

  // EL CASO DE LA CORRECCIÓN, que es el que decide con cuál se compara: si se
  // mirara el de hoy, corregir el 185 a 85 preguntaría por la corrección.
  const corrigiendo = mirar({ [haceDias(1)]: 85.2, [isoDe(HOY)]: 185 }, 85);
  ok(corrigiendo === null,
     'y corregir el error de hoy no vuelve a preguntar',
     'salió ' + JSON.stringify(corrigiendo) + ': se compara con el pesaje ' +
     'ANTERIOR a hoy, no con el que se está pisando');
}

// ------------------------------------------------------------------
console.log('\nY un pesaje se puede quitar, con lo que arrastra');
{
  const quitar = async ({ falla, sinRed, enLaCola, perfilRevienta }) => {
    const fecha = haceDias(3);
    const PESOS = { [haceDias(5)]: 86, [fecha]: 185, [isoDe(HOY)]: 85 };
    const dom = domFalso({ pesoInput: '85' });
    const borrados = [], claves = [], avisos = [], perfil = [], fallos = [];
    const armar = new Function(
      'PESOS', 'CINTURAS', 'isoDe', 'HOY', 'document', 'pintarPeso', 'pintarCintura',
      'toast', 'fmtFecha', 'sbBorrarPeso', 'quitarDeLaCola', 'sinConexion', 'traducirError',
      'ponerPesoDeLaBascula', 'apuntarFallo',
      sinC(fn('function quitarPesaje(fecha){')) +
      '; return { quitarPesaje: quitarPesaje, cinturas: function(){ return CINTURAS; } };'
    );
    const caja = armar(
      PESOS, [{ fecha: fecha, cm: 90 }, { fecha: haceDias(20), cm: 92 }],
      isoDe, HOY, dom.document, () => {}, () => {},
      (donde, msg) => avisos.push(msg), fmtFecha,
      (f) => { borrados.push(f); return falla ? Promise.reject(new Error('no pude')) : Promise.resolve(); },
      (c) => { claves.push(c); return !!enLaCola; },
      () => !!sinRed, (m) => m,
      () => { perfil.push(1); if(perfilRevienta) throw new Error('el perfil reventó'); },
      (donde) => { fallos.push(donde); }
    );
    caja.quitarPesaje(fecha);
    await new Promise((r) => setTimeout(r, 0));
    return { fecha, PESOS, cinturas: caja.cinturas(), borrados, claves, avisos, perfil, fallos, dom };
  };

  const r = await quitar({});
  ok(r.PESOS[r.fecha] === undefined, 'el pesaje se va de la lista',
     JSON.stringify(r.PESOS));
  ok(Object.keys(r.PESOS).length === 2, 'y solo ese', JSON.stringify(r.PESOS));
  ok(r.borrados.length === 1 && r.borrados[0] === r.fecha,
     'se borra en la base, por su fecha', JSON.stringify(r.borrados));

  // LA CINTURA VIVE EN LA MISMA FILA. Si se queda en pantalla, `tocaMedirCintura`
  // cree que ya se midió y no la vuelve a pedir en quince días.
  ok(!r.cinturas.some((m) => m.fecha === r.fecha),
     'la cintura de esa fila se va con él',
     JSON.stringify(r.cinturas) + ' — va en la MISMA fila de la base: si se ' +
     'queda en pantalla, nadie la vuelve a pedir en quince días');
  ok(r.cinturas.length === 1, 'y las otras medidas se quedan', JSON.stringify(r.cinturas));
  ok(/cintura/.test(r.avisos[0] || ''), 'y se avisa de que se la llevó',
     'dijo: «' + (r.avisos[0] || '') + '»');

  // Y LA COLA. Un pesaje guardado sin señal espera ahí: sin quitarlo, la
  // próxima vez que haya red sube el número borrado y reaparece solo.
  ok(r.claves.length === 1 && r.claves[0] === 'peso:' + r.fecha,
     'y lo que esperaba en la cola para ese día se quita también',
     JSON.stringify(r.claves));

  // EL ORDEN. Vaciar la cola antes del borrado deja el pesaje en pantalla y a
  // nadie encargado de subirlo si el servidor no contesta.
  const malo = await quitar({ falla: true });
  ok(malo.PESOS[malo.fecha] === 185, 'si el borrado falla, el pesaje vuelve',
     JSON.stringify(malo.PESOS));
  ok(malo.cinturas.some((m) => m.fecha === malo.fecha), 'y su cintura también',
     JSON.stringify(malo.cinturas));
  ok(malo.claves.length === 0, 'y la cola NO se toca',
     'se llamó con ' + JSON.stringify(malo.claves) + ': quitarlo de la cola ' +
     'antes de saber que el borrado salió bien deja el pesaje sin nadie que ' +
     'lo suba');

  const sinRed = await quitar({ falla: true, sinRed: true });
  ok(/[Ss]in señal/.test(sinRed.avisos[1] || ''),
     'y sin señal se dice que hace falta conexión',
     'dijo: «' + (sinRed.avisos[1] || '') + '»');

  // EL PESO DEL PERFIL ES LA MEDIA DE SIETE DÍAS: quitar un pesaje la mueve
  // igual que apuntarlo, y si el que se va era el malo la mueve mucho.
  ok(r.perfil.length === 1, 'y el peso del perfil se recalcula',
     'de él salen la meta de proteína y el suelo de calorías');
  ok(malo.perfil.length === 0, 'pero no si el borrado falló',
     'no cambió nada que recalcular');

  // LO QUE NO PUEDE PASAR: que un fallo PINTANDO el perfil deshaga un borrado
  // que ya salió bien en la base. Lo enseñó esta misma prueba: al añadir la
  // llamada sin protegerla, la excepción caía en el `catch` del borrado y el
  // pesaje volvía a la pantalla sin estar en el servidor.
  const revienta = await quitar({ perfilRevienta: true });
  ok(revienta.PESOS[revienta.fecha] === undefined,
     'y si el perfil revienta, el pesaje sigue quitado',
     JSON.stringify(revienta.PESOS) + ' — ya no está en la base: devolverlo a ' +
     'la pantalla sería enseñar algo que no existe');
  ok(revienta.fallos.length === 1, '  y el fallo queda apuntado',
     'callarlo del todo deja un perfil viejo sin que nadie se entere');
  ok(!/No se pudo quitar/.test(revienta.avisos.join(' ')),
     '  y no se dice que no se pudo, porque sí se pudo',
     'dijo: ' + JSON.stringify(revienta.avisos));
}

console.log('\nY quitar de la cola quita solo lo suyo');
{
  const COLA = [
    { clave: 'peso:2026-11-12', tipo: 'peso' },
    { clave: 'peso:2026-11-13', tipo: 'peso' },
    { tipo: 'comida', fila: 'abc' },
  ];
  let guardados = 0;
  const armar = new Function('COLA', 'colaGuardar', 'pintarPendientes',
    sinC(fn('function quitarDeLaCola(clave){')) +
    '; return { quitar: quitarDeLaCola, cola: function(){ return COLA; } };');
  const caja = armar(COLA, () => { guardados++; }, () => {});

  ok(caja.quitar('peso:2026-11-13') === true, 'quita la que se le pide');
  ok(caja.cola().length === 2, 'y deja las demás', JSON.stringify(caja.cola()));
  ok(!caja.cola().some((x) => x.clave === 'peso:2026-11-13'), 'la de esa fecha ya no está');
  ok(guardados === 1, 'y lo guarda en el teléfono',
     'sin esto vuelve entera al abrir la app');

  ok(caja.quitar('peso:2026-01-01') === false, 'si no había nada, dice que no');
  ok(caja.quitar(undefined) === false, 'y sin clave no se lleva nada por delante',
     'filtrar por `undefined` vaciaría de golpe todo lo que no lleva clave');
  ok(caja.cola().length === 2, 'la cola sigue igual', JSON.stringify(caja.cola()));
}

// ------------------------------------------------------------------
console.log('\nY la pantalla existe de verdad');
{
  ok(/data-view="pesajes"/.test(HTML), 'la vista de Pesajes está en el index');
  ok(/data-push="pesajes"/.test(HTML), 'y algo que lleve a ella',
     'una vista sin puerta no la abre nadie');
  for (const id of ['pesajeFilas', 'pesajeTitulo', 'pesajesIr', 'pesajesResumen',
                    'pesajeQuitarSheet', 'pesajeQuitarTexto', 'pesajeQuitarOk',
                    'pesajeQuitarNo', 'pesoRaroSheet', 'pesoRaroTexto',
                    'pesoRaroOk', 'pesoRaroNo']) {
    ok(new RegExp('id="' + id + '"').test(HTML), '  y el id «' + id + '»');
  }
  // La lista se repinta desde `pintarPeso`, que es por donde pasa cualquier
  // cambio del peso, y ANTES de su `return` de «aún no hay registros»: con un
  // solo pesaje —que es justo el que puede estar mal— la fila no aparecería.
  const p = sinC(fn('function pintarPeso(){'));
  const corte = p.indexOf('if(pts.length < 2)');
  ok(corte > 0, 'se encuentra el corte de «aún no hay registros»');
  ok(p.indexOf('pintarPantallaPesajes()') > 0 &&
     p.indexOf('pintarPantallaPesajes()') < corte,
     'y la lista de pesajes se pinta antes de ese corte',
     'puesta después, con un solo pesaje no se pintaría nunca — y uno solo es ' +
     'justo el caso en que puede estar mal tecleado');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
