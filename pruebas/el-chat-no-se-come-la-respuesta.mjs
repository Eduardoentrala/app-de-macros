// El `catch` del chat quitaba «el último mensaje» a ciegas.
//
// Mientras se espera, la conversación lleva una burbuja de «…» al final. Al
// volver la respuesta se quita con un `IA_MSGS.pop()` y se pone la de
// verdad; si falla la llamada, el `catch` hace el mismo `pop()` y pone el
// error. Con la llamada fallando eso está bien, porque el último sigue
// siendo el «…».
//
// EL PROBLEMA ES QUE NO SIEMPRE LO ES. El `catch` cubre todo el bloque de
// arriba, y ese bloque hace cosas DESPUÉS de haber puesto la respuesta:
// guardar el evento que entendió el modelo —que repinta la semana entera—,
// guardar su memoria, cerrar el aviso del coach. Si cualquiera de esas
// tropieza, el `catch` corre con la respuesta ya puesta como último mensaje:
//
//   · se la lleva el `pop()`,
//   · y en su sitio queda un error.
//
// O sea que la respuesta llega, se paga, se descuenta de las consultas del
// día —y desaparece—. Y si el tropiezo es antes de la línea del `push`, lo
// que se come es la PREGUNTA de esa persona.
//
// Es el mismo fallo que ya se arregló en el peso: allí `ponerPesoDeLaBascula()`
// vivía dentro del `.then` y un tropiezo suyo llegaba al `catch` que deshace,
// deshaciendo un guardado que había salido bien.
//
// EL ARREGLO son dos cosas, y hacen falta las dos:
//
//   1. El «…» se quita POR REFERENCIA, no por posición. Así quitarlo es la
//      misma operación se haya quitado ya o no, y no puede alcanzar a otro.
//   2. Lo que va después de la respuesta se envuelve, para que un tropiezo
//      ahí no acabe en el camino del error teniendo la respuesta delante.

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

// `enviarIA` DE VERDAD, con dobles alrededor. `revienta` dice en qué paso
// de después de la respuesta se tropieza; null es que todo va bien.
function enviar({ revienta = null, fallaLlamada = false } = {}) {
  const IA_MSGS = [];
  const apuntados = [];
  const avisos = [];
  const lanzar = (donde) => () => {
    if (revienta === donde) throw new Error('tropiezo en ' + donde);
  };

  const api = new Function(
    'IA_MSGS', 'document', 'iaTexto', 'sesion', 'toast', 'pintarChat',
    'iaLlamar', 'progresoDelChat', 'macrosDeHoy', 'prepararAlimento',
    'pintarFotoIA', 'pintarQuedanIA', 'guardarEventoSiEstaCompleto',
    'guardarMemoriaIA', 'marcarAvisoVisto', 'traducirError', 'apuntarFallo',
    'Intl', `
    var iaOcupado = false;
    var IA_FOTOS = [];
    var iaQuedanNum = null;
    var MI_NIVEL_IA = null;
    var avisoEsperandoRespuesta = null;
    ${sinC(fn('function enviarIA(textoForzado){'))}
    return { enviar: enviarIA, ocupado: function(){ return iaOcupado; } };
  `)(
    IA_MSGS,
    { getElementById: () => ({ disabled: false }) },
    { value: '', style: {} },
    { user: { id: 'u1' } },
    (_, m) => avisos.push(m),
    () => {},
    () => (fallaLlamada
      ? Promise.reject(new Error('sin señal'))
      : Promise.resolve({ respuesta: 'Vas bien, sigue así.', alimentos: [] })),
    () => Promise.resolve({ objetivo: 'bajar' }),
    () => ({ meta_cal: 2300 }),
    (a) => a,
    () => {},
    () => {},
    lanzar('evento'),
    lanzar('memoria'),
    () => {},
    (m) => 'traducido: ' + m,
    (donde, e) => apuntados.push({ donde, e: String(e && e.message) }),
    { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: 'America/Mexico_City' }) }) }
  );

  api.enviar('¿cómo voy?');
  return new Promise((listo) => setTimeout(() => listo({
    IA_MSGS, apuntados, avisos, ocupado: api.ocupado()
  }), 0));
}

// ------------------------------------------------------------------
console.log('\nCuando todo va bien');
{
  const r = await enviar();
  ok(r.IA_MSGS.length === 2, 'quedan la pregunta y la respuesta',
     JSON.stringify(r.IA_MSGS.map((m) => m.texto)));
  ok(!r.IA_MSGS.some((m) => m.pensando), 'y el «…» se fue');
  ok(r.IA_MSGS[1] && r.IA_MSGS[1].texto === 'Vas bien, sigue así.',
     'con lo que contestó el modelo');
  ok(r.ocupado === false, 'y se puede volver a escribir');
}

console.log('\nY cuando la llamada falla');
{
  const r = await enviar({ fallaLlamada: true });
  ok(r.IA_MSGS.length === 2, 'quedan la pregunta y el error',
     JSON.stringify(r.IA_MSGS.map((m) => m.texto)));
  ok(r.IA_MSGS[0] && r.IA_MSGS[0].texto === '¿cómo voy?',
     'LA PREGUNTA NO SE TOCA',
     'quedó: ' + JSON.stringify(r.IA_MSGS.map((m) => m.texto)) +
     '\n         si el `pop()` del error alcanza a la pregunta, esa persona se ' +
     'queda\n         sin saber qué había escrito');
  ok(r.IA_MSGS[1] && /traducido/.test(r.IA_MSGS[1].texto), 'y se explica el fallo');
  ok(!r.IA_MSGS.some((m) => m.pensando), 'y el «…» también se fue');
}

// ------------------------------------------------------------------
console.log('\nY si tropieza DESPUÉS de haber contestado, la respuesta se queda');
{
  // Esto es el fallo. El `catch` corría con la respuesta de último mensaje
  // y se la llevaba, dejando un error en su sitio.
  for (const donde of ['evento', 'memoria']) {
    const r = await enviar({ revienta: donde });
    const textos = r.IA_MSGS.map((m) => m.texto);

    ok(textos.indexOf('Vas bien, sigue así.') >= 0,
       `un tropiezo al guardar la ${donde} no se come la respuesta`,
       'quedó: ' + JSON.stringify(textos) +
       '\n         esa respuesta ya se pagó y ya se descontó de las consultas ' +
       'del día:\n         cambiarla por un error la pierde para siempre');
    ok(!textos.some((t) => /^traducido/.test(String(t))),
       'y no se enseña un error de algo que sí llegó',
       'quedó: ' + JSON.stringify(textos));
    ok(r.IA_MSGS.length === 2,
       'y la conversación no se queda a medias',
       JSON.stringify(textos));
    ok(r.apuntados.some((x) => /tras_responder|respuesta/.test(x.donde)),
       'pero el tropiezo queda apuntado, no callado del todo',
       'apuntó: ' + JSON.stringify(r.apuntados) +
       '\n         si esto falla siempre, los eventos de esa persona dejan de ' +
       'guardarse\n         y nadie se entera');
    ok(r.ocupado === false, 'y el botón de enviar se suelta igual');
  }
}

// ------------------------------------------------------------------
console.log('\nY el «…» se quita por referencia, no por posición');
{
  const f = fn('function enviarIA(textoForzado){');
  ok(/IA_MSGS\.indexOf\(pensando\)/.test(f),
     'se busca la burbuja concreta',
     'con `pop()` lo que se quita es «el último», que para cuando el error ' +
     'puede\n         correr ya puede ser cualquier otra cosa');
  ok(!/IA_MSGS\.pop\(\)/.test(f),
     'y no queda ningún `pop()` suelto',
     'uno solo basta para traerse el fallo de vuelta');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
