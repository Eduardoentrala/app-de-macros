// La medida de cintura se perdía sin decir una palabra.
//
// EL CASO, y es de todos los días: el asistente pide la medida de cintura
// —insiste, semana tras semana, porque es lo único que distingue perder grasa
// de no perder nada cuando la báscula se queda quieta—. Se abre Peso, se
// teclea el número en su campo, se pulsa Guardar... y no pasa nada. Ni aviso,
// ni error, ni toast. La medida desaparece.
//
// EL MOTIVO estaba en la segunda línea del botón:
//
//     var v = Number(document.getElementById('pesoInput').value);
//     if(!v || v <= 0) return;          ← se va sin decir nada
//
// El campo del peso llega vacío si hoy no te has pesado, así que quien viene
// SOLO a apuntar la cintura se va con las manos vacías. Y como
// `tocaMedirCintura()` mira si hay alguna guardada, la app sigue pidiéndola
// como si no te la hubieras medido nunca. Eso es lo que la hacía invisible:
// el sistema entero se comporta como si el usuario no hubiera hecho nada.
//
// `weight_kg` es `not null` en la base, así que una fila de cintura necesita
// un peso. Por eso el arreglo no es «guardar la cintura sola»: es reutilizar
// el peso de hoy si ya lo hay —quien viene a apuntar la cintura no viene a
// pesarse otra vez— y DECIRLO cuando no lo hay.
//
// Y de paso el otro silencio: una cintura fuera de rango se descartaba
// callando, y el toast felicitaba por el peso guardado sin mencionarla. Se
// mide una vez al mes.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');
const SQL = readFileSync(join(RAIZ, 'supabase', 'migrations', '0001_esquema_base.sql'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

// El manejador del botón, entero, contando llaves.
const fuente = (() => {
  const marca = "document.getElementById('saveWeightBtn').addEventListener('click', function(){";
  const i = APP.indexOf(marca);
  if (i < 0) throw new Error('no encuentro el botón de guardar peso');
  let n = 0, j = APP.indexOf('{', APP.indexOf('function(){', i));
  for (; j < APP.length; j++) {
    if (APP[j] === '{') n++;
    else if (APP[j] === '}') { n--; if (!n) return APP.slice(i, APP.indexOf(');', j) + 2); }
  }
  throw new Error('llaves sin cerrar');
})();

// Un navegador de mentira con lo justo para pulsar el botón.
function montar({ pesoTecleado = '', cinturaTecleada = '', pesoDeHoy = null } = {}) {
  const campos = {
    pesoInput: { value: String(pesoTecleado) },
    cinturaInput: { value: String(cinturaTecleada) },
  };
  const boton = { addEventListener: (_, fn) => { boton.pulsar = fn; } };
  const avisos = [];
  const guardados = [];
  const PESOS = {};
  if (pesoDeHoy != null) PESOS['2026-08-27'] = pesoDeHoy;
  let CINTURAS = [];

  new Function('document', 'toast', 'isoDe', 'HOY', 'PESOS', 'CINTURAS',
    'pintarPeso', 'pintarCintura', 'sbGuardarPeso', 'traducirError',
    'revisarRecordatorios', 'actualizarSemana', 'pintarRacha', 'recalcAll',
    fuente)(
    { getElementById: (id) => (id === 'saveWeightBtn' ? boton : campos[id] || { value: '' }) },
    (_, m) => avisos.push(m),
    () => '2026-08-27',
    new Date('2026-08-27T12:00:00'),
    PESOS,
    CINTURAS,
    () => {}, () => {},
    (fecha, kg, cintura) => { guardados.push({ fecha, kg, cintura }); return Promise.resolve(); },
    (m) => String(m),
    () => {}, () => {}, () => {}, () => {});

  return { boton, avisos, guardados, PESOS };
}

// ------------------------------------------------------------------
console.log('\nApuntar solo la cintura, habiéndose pesado hoy');
{
  // EL CASO QUE SE PERDÍA. Se pesó por la mañana; ahora viene a apuntar la
  // cintura y el campo del peso está vacío.
  const m = montar({ pesoTecleado: '', cinturaTecleada: '88.5', pesoDeHoy: 82.6 });
  m.boton.pulsar();
  ok(m.guardados.length === 1, 'se guarda',
     'antes se salía en la segunda línea y no se guardaba nada: ' +
     JSON.stringify(m.guardados));
  ok(m.guardados[0] && m.guardados[0].cintura === 88.5, 'con la cintura tecleada',
     JSON.stringify(m.guardados));
  ok(m.guardados[0] && m.guardados[0].kg === 82.6,
     'y reutilizando el peso de hoy, que ya estaba',
     'la columna del peso es `not null`: una fila de cintura necesita uno');
  ok(m.avisos.some((a) => /cintura 88\.5 cm/.test(a)), 'y se dice que entró',
     'salió: ' + JSON.stringify(m.avisos));
}

console.log('\nY si no hay peso de hoy, se dice en vez de callar');
{
  const m = montar({ pesoTecleado: '', cinturaTecleada: '88.5', pesoDeHoy: null });
  m.boton.pulsar();
  ok(m.guardados.length === 0, 'no se guarda nada, que no se puede');
  ok(m.avisos.length === 1 && /cintura/.test(m.avisos[0]) && /peso/.test(m.avisos[0]),
     'pero se explica por qué',
     'un botón que no responde y no explica por qué es indistinguible de uno ' +
     'roto, y aquí encima se pierde algo que solo se mide una vez al mes. ' +
     'Salió: ' + JSON.stringify(m.avisos));
}

console.log('\nY sin nada tecleado, también se dice');
{
  const m = montar({ pesoTecleado: '', cinturaTecleada: '', pesoDeHoy: null });
  m.boton.pulsar();
  ok(m.guardados.length === 0, 'no se guarda nada');
  ok(m.avisos.length === 1 && /Escribe tu peso/.test(m.avisos[0]),
     'y se pide el peso, sin mencionar una cintura que nadie tecleó',
     'salió: ' + JSON.stringify(m.avisos));
}

console.log('\nY lo de siempre sigue funcionando');
{
  const m = montar({ pesoTecleado: '82.4', cinturaTecleada: '', pesoDeHoy: null });
  m.boton.pulsar();
  ok(m.guardados.length === 1 && m.guardados[0].kg === 82.4, 'el peso solo se guarda');
  ok(m.guardados[0].cintura === null, 'sin inventarse una cintura',
     'mandar null la borraría: el upsert pisa la fila entera');

  const dos = montar({ pesoTecleado: '82.4', cinturaTecleada: '88', pesoDeHoy: null });
  dos.boton.pulsar();
  ok(dos.guardados[0].kg === 82.4 && dos.guardados[0].cintura === 88,
     'y los dos juntos, también');

  // El peso TECLEADO manda sobre el de hoy: si viene a repesarse, se repesa.
  const repesa = montar({ pesoTecleado: '81.9', cinturaTecleada: '', pesoDeHoy: 82.6 });
  repesa.boton.pulsar();
  ok(repesa.guardados[0].kg === 81.9, 'y si teclea un peso nuevo, manda el nuevo',
     'reutilizar el de hoy solo cuando no escribió ninguno');
}

console.log('\nUna cintura imposible no se traga en silencio');
{
  const m = montar({ pesoTecleado: '82.4', cinturaTecleada: '300', pesoDeHoy: null });
  m.boton.pulsar();
  ok(m.guardados.length === 1 && m.guardados[0].cintura === null,
     'no se guarda, que 300 cm no es una cintura');
  ok(m.avisos.some((a) => /no se guardó/.test(a)), 'pero se avisa',
     'antes el toast felicitaba por el peso y no la mencionaba, así que ' +
     'parecía que había entrado. Salió: ' + JSON.stringify(m.avisos));
  ok(m.avisos.some((a) => /Peso guardado/.test(a)), 'y el peso sí entra',
     'equivocarse tecleando la cintura no debe costarte el peso del día');
}

// ------------------------------------------------------------------
console.log('\nY por qué hace falta un peso: lo dice la base');
{
  const i = SQL.indexOf('create table if not exists public.weight_logs');
  const tabla = SQL.slice(i, SQL.indexOf(');', i));
  ok(/weight_kg\s+numeric\([^)]*\)\s+not null/.test(tabla),
     'weight_kg es `not null`',
     'si algún día deja de serlo, la cintura podría guardarse sola y este ' +
     'apaño sobra. Tabla: ' + tabla.replace(/\s+/g, ' ').slice(0, 200));
  ok(/unique \(user_id, log_date\)/.test(tabla),
     'y hay una fila por día, que es lo que permite reutilizar la de hoy');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
