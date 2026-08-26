// «rehacer» abría la puerta más cara de la app y la dejaba sin llave.
//
// EL FRENO DE LAS FOTOS NO ES EL TOPE DIARIO. La comparación mensual está
// excluida a propósito —«no tiene sentido que analizar sus fotos la deje sin
// poder apuntar la cena»— y a cambio tiene el suyo: una vez al mes. Si ya
// está hecha, se devuelve la guardada en vez de volver a pagarla.
//
// Ese «si ya está hecha» se podía apagar desde el teléfono:
//
//     if (yaEsta && cuerpo.rehacer !== true) { ...devolver la guardada... }
//
// `cuerpo` es el JSON de la petición. O sea que mandando `rehacer: true` se
// salta la caché del mes, y como `fotos` tampoco pasa por el tope diario, no
// queda NADA que lo pare. Cada vuelta baja ocho fotos y manda ocho imágenes
// al modelo, que es la llamada más cara que hace esta app. En bucle, sin
// límite.
//
// Y no hace falta mala intención: no hay ningún botón que mande `rehacer`.
// Está muerto en la app —se buscó, no aparece— así que lo único que puede
// mandarlo es algo que se salga de lo previsto. Justo por eso no puede ser
// gratis.
//
// LO IRÓNICO es que el comentario de al lado ya había pensado esto. Sobre el
// mes dice: «se calcula aquí y no se acepta del cliente, por lo mismo que el
// tope diario: quien pudiera decir en qué mes está, podría pedir el análisis
// las veces que quisiera, y son ocho imágenes cada vez». Se blindó el mes y
// se dejó abierto `rehacer`, que hace exactamente lo mismo por otra puerta.
//
// EL ARREGLO no es quitar `rehacer`: es cobrarlo. Las dos razones por las que
// las fotos no pagan el tope —que va sola y que es una al mes— dejan de ser
// ciertas en cuanto alguien pide rehacerla a mano. Entonces que pague, como
// todo lo que se pide a mano.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const FN = readFileSync(join(RAIZ, 'supabase', 'functions', 'asistente', 'index.ts'), 'utf8');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

// ------------------------------------------------------------------
console.log('\nQuién paga el tope diario');
{
  // Se saca la condición TAL CUAL está escrita y se ejecuta. Así la prueba
  // no comprueba que ponga una frase concreta, sino qué decide de verdad.
  const marca = FN.indexOf('await admin.rpc(\'gastar_consulta_ia\'');
  ok(marca > 0, 'se encuentra la llamada que gasta una consulta');

  const abre = FN.lastIndexOf('if (', marca);
  const cond = FN.slice(FN.indexOf('(', abre) + 1, FN.indexOf(') {', abre));
  const paga = new Function('accion', 'cuerpo', 'return (' + cond + ');');

  console.log('        condición: ' + cond);

  // Lo de siempre no cambia.
  ok(paga('chat', {}) === true, 'una pregunta de texto paga');
  ok(paga('semana', {}) === true, 'el chequeo semanal paga');
  ok(paga('plan', { semana: true }) === true, 'el plan de la semana paga');
  ok(paga('apuntar', {}) === true, 'apuntar una comida paga');

  // La excepción que se quería: la comparación automática mensual.
  ok(paga('fotos', {}) === false,
     'la comparación mensual automática NO paga, como estaba pensado',
     'si empieza a pagar, analizar sus fotos deja a alguien sin poder apuntar la cena');

  // Y la puerta que estaba abierta.
  ok(paga('fotos', { rehacer: true }) === true,
     'pero pedir que se rehaga SÍ paga',
     'sin esto no queda nada que lo pare: ocho imágenes por vuelta, en bucle');

  // Que no se haya arreglado mirando algo que se puede falsear de otra forma.
  ok(paga('fotos', { rehacer: 'true' }) === false &&
     paga('fotos', { rehacer: 1 }) === false,
     'y solo cuenta un `true` de verdad, no cualquier cosa que se le parezca',
     'con `==` un `rehacer: 0` o `""` cambiaría el sentido sin querer');
}

// ------------------------------------------------------------------
console.log('\nY la caché del mes sigue estando');
{
  // El arreglo cobra la vuelta extra, pero la vuelta extra tiene que seguir
  // siendo posible: si se hubiera quitado `rehacer`, no habría forma de
  // rehacer un análisis que salió mal.
  ok(/cuerpo\.rehacer !== true/.test(FN), 'se sigue pudiendo pedir que se rehaga');
  ok(/estado: 'ok', \.\.\.yaEsta, guardado: true/.test(FN),
     'y sin pedirlo se devuelve el guardado, sin pagar el modelo');
}

// ------------------------------------------------------------------
console.log('\nY el mes lo sigue poniendo el servidor');
{
  // Es la misma puerta por otro lado, y esta ya estaba cerrada. Que siga.
  const i = FN.indexOf('const mes = new Intl.DateTimeFormat');
  ok(i > 0, 'el mes se calcula en el servidor');
  const trozo = FN.slice(i, FN.indexOf(';', i));
  ok(/America\/Mexico_City/.test(trozo), 'en la zona de la app, no en UTC',
     'en UTC, el último día del mes por la tarde se guarda en el mes que viene');
  ok(!/cuerpo\.mes/.test(FN), 'y no se acepta del cliente',
     'quien pudiera decir en qué mes está pediría el análisis las veces que quisiera');
}

// ------------------------------------------------------------------
console.log('\nY sigue sin haber botón que mande rehacer');
{
  // Si algún día se añade uno, esta prueba avisa: habrá que mirar que el
  // botón no se pueda pulsar treinta veces seguidas.
  ok(!/rehacer\s*:\s*true/.test(APP), 'la app no manda `rehacer` desde ningún sitio',
     'si se ha añadido un botón, revisa que no se pueda repetir a voluntad: ' +
     'ahora paga tope diario, pero el tope de Plus es alto');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
