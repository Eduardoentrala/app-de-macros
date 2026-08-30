// Si el envío al asistente falla, las fotos adjuntas se perdían.
//
// `enviarIA()` vacía `IA_FOTOS` y el campo de texto ANTES de llamar, para
// que la pantalla quede limpia mientras se espera. Eso está bien. Lo que
// faltaba es el otro lado: cuando la llamada falla, nada las repone.
//
// Y duele más de lo que parece porque se pueden adjuntar CUATRO fotos y la
// burbuja de la conversación solo enseña la primera. Al fallar, las cuatro
// desaparecen y tres no dejan ni rastro: ni en la pantalla ni en el campo.
// Hay que volver a buscarlas o a hacerlas.
//
// Sin señal —que es cuando más falla— eso es exactamente lo contrario de lo
// que hace el resto de la app: apuntar una comida sin red NO borra lo que
// escribiste, lo guarda y avisa. Aquí se tiraba.
//
// El texto no se repone a propósito: sigue estando a la vista en la burbuja
// de la propia persona, así que no se pierde. Las fotos no.

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

const foto = (n) => ({ base64: 'b64-' + n, tipo: 'image/jpeg', vista: 'vista-' + n });

// `IA_FOTOS` se REASIGNA dentro (`IA_FOTOS = []`), así que pasarla como
// parámetro no deja ver el cambio desde fuera: se declara dentro del trozo
// que se evalúa y se devuelve un mirador.
function correr({ fotos = [], falla = false, texto = 'esto qué es' } = {}) {
  const ctx = {
    iaOcupado: false,
    IA_MSGS: [],
    iaTexto: { value: texto, style: {} },
    sesion: { user: { id: 'u1' } },
    avisos: [],
    pintados: 0,
    llamadas: [],
  };
  const doc = {
    getElementById: () => ({ set disabled(v) { ctx.botonApagado = v; } }),
  };
  const fuente =
    'var IA_FOTOS = __fotos;\n' +
    sacar('function enviarIA(textoForzado){') + '\n' +
    'enviarIA();\n' +
    'return function(){ return IA_FOTOS; };';

  const f = new Function('__fotos', 'document', 'iaOcupado', 'IA_MSGS', 'iaTexto',
    'sesion', 'toast', 'pintarFotoIA', 'pintarChat', 'iaLlamar', 'macrosDeHoy',
    'prepararAlimento', 'pintarQuedanIA', 'guardarEventoSiEstaCompleto',
    'guardarMemoriaIA', 'traducirError', 'Intl', 'Number', 'fuente_no_usada',
    fuente);

  const mirar = f(
    fotos.slice(), doc, ctx.iaOcupado, ctx.IA_MSGS, ctx.iaTexto, ctx.sesion,
    (id, t) => ctx.avisos.push(t),
    () => { ctx.pintados++; },
    () => {},
    (cuerpo) => {
      ctx.llamadas.push(cuerpo);
      return falla ? Promise.reject(new Error('sin red'))
                   : Promise.resolve({ respuesta: 'ok', alimentos: [] });
    },
    () => ({}), (a) => a, () => {}, () => {}, () => {}, (m) => m, Intl, Number, null);

  return { ctx, fotosAhora: mirar };
}

const esperar = () => new Promise((r) => setTimeout(r, 20));

// ------------------------------------------------------------------
console.log('\nSi el envío falla, las fotos vuelven');
{
  const { ctx, fotosAhora } = correr({ fotos: [foto(1), foto(2), foto(3), foto(4)], falla: true });
  await esperar();

  const quedan = fotosAhora();
  ok(quedan.length === 4, 'las cuatro siguen adjuntas',
     'quedan ' + quedan.length + ': la burbuja solo enseña la primera, así ' +
     'que las otras tres desaparecen sin dejar rastro y hay que volver a ' +
     'hacerlas');
  ok(quedan[0] && quedan[0].base64 === 'b64-1' && quedan[3] && quedan[3].base64 === 'b64-4',
     'y son las mismas, en el mismo orden',
     JSON.stringify(quedan.map((f) => f && f.base64)));
  ok(ctx.pintados >= 2, 'y la tira de miniaturas se repinta',
     'sin repintar, están en memoria pero la pantalla sigue vacía y se ' +
     'vuelven a adjuntar por encima');
}

console.log('\nY se dice que falló');
{
  const { ctx } = correr({ fotos: [foto(1)], falla: true });
  await esperar();
  const ultimo = ctx.IA_MSGS[ctx.IA_MSGS.length - 1];
  ok(ultimo && ultimo.rol === 'el' && /sin red/.test(ultimo.texto),
     'el error sale en la conversación', JSON.stringify(ultimo));
  ok(!ctx.IA_MSGS.some((m) => m.pensando), 'y el «pensando» se quita');
}

console.log('\nY el botón se vuelve a poder pulsar');
{
  const { ctx } = correr({ fotos: [foto(1)], falla: true });
  await esperar();
  ok(ctx.botonApagado === false, 'queda encendido tras el fallo',
     'si no, hay que recargar la app para reintentar');
}

console.log('\nSi el envío va bien, NO vuelven');
{
  const { ctx, fotosAhora } = correr({ fotos: [foto(1), foto(2)], falla: false });
  await esperar();
  ok(fotosAhora().length === 0, 'la tira queda limpia',
     'reponerlas siempre haría que la siguiente pregunta arrastrara las ' +
     'fotos de la anterior y se analizaran dos veces');
  ok(ctx.botonApagado === false, 'y el botón vuelve');
}

console.log('\nY lo que se manda lleva las fotos, no la lista ya vaciada');
{
  const { ctx } = correr({ fotos: [foto(1), foto(2)], falla: false });
  await esperar();
  const c = ctx.llamadas[0];
  ok(c && c.imagenes && c.imagenes.length === 2, 'van las dos',
     'se vacía `IA_FOTOS` antes de llamar: si se leyera de ahí, se mandarían ' +
     'cero fotos. Va: ' + JSON.stringify(c && c.imagenes));
  ok(c && c.imagen === 'b64-1', 'y la primera también en el campo viejo',
     'entre despliegues, la función antigua solo entiende `imagen`');
}

console.log('\nY sin fotos ni texto no se manda nada');
{
  const { ctx } = correr({ fotos: [], texto: '   ' });
  await esperar();
  ok(ctx.llamadas.length === 0, 'no se llama al asistente');
  ok(ctx.IA_MSGS.length === 0, 'ni se ensucia la conversación');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
