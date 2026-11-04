// Las calorías podían bajar sin fondo.
//
// El cierre de los lunes mueve 100-200 cada semana, y eso está bien pensado:
// un paso pequeño, con el gasto medido delante, y sin tocar nada cuando no
// hay material. Lo que no había era un SUELO. Nada en el camino —ni el
// prompt, ni `aplicarCaloriasNuevas`— decía «por aquí ya no se baja».
//
// Y 150 calorías por semana no asustan a nadie una semana. En dos meses son
// 1.200.
//
// CÓMO SE LLEGA AHÍ SIN QUE NADIE MIENTA. El gasto medido sale de restar lo
// que comió de lo que pesó, así que vive en las MISMAS unidades que lo que
// apunta: si alguien apunta de menos de forma parecida siempre, la cifra lo
// absorbe sola y la meta sigue siendo correcta en sus unidades. Eso el
// prompt ya lo dice y es verdad.
//
// Pero si lo que falta por apuntar CRECE —empieza el estrés, o el fin de
// semana se descontrola y no se escribe— el peso deja de bajar, la medición
// se hunde, y cada lunes recorta otro escalón sobre una cifra cada vez menos
// real. Nadie mintió en ningún momento y la meta acaba donde no debe.
//
// EL SUELO ES SU METABOLISMO BASAL. No es un número redondo elegido a ojo:
// es lo que su cuerpo gasta en reposo, con su edad, su altura, su peso y su
// sexo. Que una app decida por su cuenta dejar a alguien por debajo de eso
// semana tras semana no es una decisión de software.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');
const FN = readFileSync(join(RAIZ, 'supabase', 'functions', 'asistente', 'index.ts'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

const sinComentarios = (s) => s.replace(/^\s*\/\/.*$/gm, '');

function sacar(cabecera, texto = APP) {
  const i = texto.indexOf(cabecera);
  if (i < 0) throw new Error('no encuentro: ' + cabecera);
  let n = 0, j = texto.indexOf('(', i);
  for (; j < texto.length; j++) {
    if (texto[j] === '(') n++;
    else if (texto[j] === ')') { n--; if (!n) break; }
  }
  n = 0;
  let k = texto.indexOf('{', j);
  for (; k < texto.length; k++) {
    if (texto[k] === '{') n++;
    else if (texto[k] === '}') { n--; if (!n) return texto.slice(i, k + 1); }
  }
  throw new Error('llaves sin cerrar en ' + cabecera);
}

// ------------------------------------------------------------------
console.log('\nEl suelo se calcula, y se ejecuta para verlo');
{
  const sueloDeCalorias = new Function(
    sacar('function sueloDeCalorias(') + '; return sueloDeCalorias;')();

  // RECIBE EL BASAL YA CALCULADO. La fórmula de Mifflin-St Jeor vive en
  // `gastoEstimado()` y en ningún sitio más: hay una comprobación en
  // `gasto-medido` puesta a propósito para eso, y cazó la primera versión
  // de esto, que la recalculaba por su cuenta.
  ok(sueloDeCalorias(1733) === 1733, 'un basal normal sirve de suelo tal cual');
  ok(sueloDeCalorias(1282) === 1282, 'y otro más bajo también');
  ok(sueloDeCalorias(1732.5) === 1733, 'y se redondea');

  // SIN DATO NO SE INVENTA UN SUELO. Un suelo falso es peor que ninguno:
  // frenaría un ajuste que sí tocaba.
  for (const malo of [null, undefined, NaN, 0, '', 'x', {}]) {
    ok(sueloDeCalorias(malo) === null,
       'sin basal no hay suelo: ' + String(malo),
       'devolvió ' + sueloDeCalorias(malo));
  }

  // Y nada absurdo se cuela como freno de nada.
  ok(sueloDeCalorias(400) === null, 'un basal imposiblemente bajo no es un suelo');
  ok(sueloDeCalorias(4200) === null, 'ni uno imposiblemente alto');

  // Y SALE DEL MISMO SITIO QUE TODO LO DEMÁS.
  const deAhora = sinComentarios(sacar('function sueloDeAhora('));
  ok(/gastoEstimado\(\)\.tmb/.test(deAhora),
     'y el de ahora sale del basal de `gastoEstimado`',
     'copiar la fórmula aquí la dejaría en dos sitios: un día se corrige ' +
     'una y el suelo frena contra un número que ya no usa nadie más');
}

// ------------------------------------------------------------------
console.log('\nY se aplica aunque el modelo diga otra cosa');
{
  // SE FUERZA ADEMÁS DE DECIRSE. Es la lección que este proyecto ya pagó
  // una vez: forzándolo solo, el mensaje diría «te bajo a 1500» y las
  // calorías se quedarían en otro sitio; diciéndolo solo, el modelo puede
  // no hacer caso. Las dos cosas.
  // SE EJECUTA. Esto antes miraba cómo estaba escrito el `if`, y por ahí se
  // escapó una mutación: cambiarlo por `if(false && nuevas < suelo)` dejaba
  // el recorte muerto y la prueba en verde, porque el texto seguía estando.
  const conSuelo = new Function(sacar('function conSuelo(') + '; return conSuelo;')();

  ok(conSuelo(1500, 1733).cal === 1733, 'lo que viene por debajo sube al suelo',
     'sin esto, el cierre podía bajar 150 cada lunes sin fondo: en dos ' +
     'meses son 1200');
  ok(conSuelo(1500, 1733).mordio === true, 'y se nota que mordió');
  ok(conSuelo(1900, 1733).cal === 1900, 'y lo que está por encima no se toca');
  ok(conSuelo(1900, 1733).mordio === false, 'ni se avisa de nada');
  ok(conSuelo(1733, 1733).cal === 1733, 'justo en el suelo se queda igual');

  // Sin suelo no se inventa un recorte: a quien le falte un dato del perfil
  // se le ajusta como siempre, no se le congela la meta.
  for (const sinSuelo of [null, undefined, 0, NaN, 'x']) {
    ok(conSuelo(1500, sinSuelo).cal === 1500 && conSuelo(1500, sinSuelo).mordio === false,
       'sin suelo (' + String(sinSuelo) + ') no se recorta nada');
  }

  const f = sinComentarios(sacar('function aplicarCaloriasNuevas('));
  ok(/conSuelo\(/.test(f), 'y `aplicarCaloriasNuevas` lo llama',
     'la función puede estar perfecta y no llamarse desde ningún sitio');
  // Y SE QUEDA CON EL RESULTADO. Llamarla y tirar lo que devuelve deja el
  // recorte calculado y sin efecto, que es lo mismo que no tenerlo. Se vio
  // mutando `nuevas = r.cal` por `nuevas = nuevas`: ninguna comprobación
  // saltaba, porque la llamada seguía ahí.
  const vuelta = f.match(/(\w+)\s*=\s*conSuelo\([^)]*\);[\s\S]{0,200}/);
  ok(!!vuelta && new RegExp('nuevas\\s*=\\s*' + vuelta[1] + '\\.cal').test(f),
     'y se queda con lo que devuelve',
     'quedó: ' + (vuelta ? vuelta[0].replace(/\s+/g, ' ').slice(0, 120) : 'nada'));

  // Y SE LE DICE A LA PERSONA. Un recorte silencioso significa que el
  // mensaje del lunes dice un número y la pantalla enseña otro.
  // Dentro del bloque que recorta, no en cualquier parte de la función:
  // un `toast` suelto más abajo no explicaría este recorte.
  const iClamp = f.search(/conSuelo\(/);
  ok(iClamp > 0 && /toast\(/.test(f.slice(iClamp, iClamp + 420)),
     'y si el suelo mordió, se dice',
     'si no, el mensaje del cierre diría «te bajo a 1500» y la app pondría ' +
     '1732 sin que nadie lo explique');
}

// ------------------------------------------------------------------
console.log('\nY el cierre lo sabe antes de decidir');
{
  // LA RAÍZ DEL CUERPO, que es de donde el servidor lee `cuerpo.suelo`.
  // Nació metido dentro de `entreno` por un corta y pega y así no habría
  // llegado nunca: el servidor lo habría leído como `undefined` y se habría
  // quedado sin suelo en silencio. Por eso esto mira el ENVÍO y no si la
  // palabra aparece en alguna parte del fichero.
  const i0 = APP.indexOf("accion: 'semana'");
  const envio = sinComentarios(APP.slice(i0, APP.indexOf('}).then(', i0)));
  // Solo las líneas con la sangría de la raíz del objeto: ocho espacios.
  // Las de dentro de `datos` o `entreno` van más adentro.
  const raiz = envio.split(/\r?\n/).filter((l) => /^ {8}\w+:/.test(l)).join('\n');
  ok(/^\s*suelo:/m.test(raiz), 'la app le manda el suelo EN LA RAÍZ del cuerpo',
     'el servidor lo lee de `cuerpo.suelo`; dentro de `datos` o de `entreno` ' +
     'no llega, y se queda sin suelo sin que nada lo diga');

  const SEM = sinComentarios(FN.slice(
    FN.indexOf("if (accion === 'semana') {"), FN.indexOf("if (accion === 'fotos')")));
  ok(/cuerpo\.suelo/.test(SEM), 'y el cierre lo lee del cuerpo de la petición',
     'con la palabra basta para que esto pase aunque el valor venga de la ' +
     'nada: lo que hace falta es que llegue el de esa persona');
  ok(/metabolismo basal|basal/i.test(SEM),
     'y le dice qué es, no solo el número',
     'un número suelto se lee como una preferencia; «su metabolismo basal» ' +
     'se lee como lo que es');
}

// ------------------------------------------------------------------
console.log('\nY el prompt se lo prohíbe con todas las letras');
{
  const i = FN.indexOf('const SISTEMA_SEMANA = `');
  const P = FN.slice(i, FN.indexOf('`.trim();', i));
  const iSuelo = P.search(/EL SUELO/);
  ok(iSuelo >= 0, 'el prompt del cierre tiene su apartado del suelo');
  // En SU apartado, no en cualquier parte: el prompt está lleno de «nunca»
  // sobre otras cosas, y sin anclar, quitar esta regla entera dejaba la
  // comprobación en verde. Pasó al mutarlo.
  const regla = P.slice(iSuelo, iSuelo + 500);
  ok(/NUNCA/.test(regla),
     'y ahí dice NUNCA, no «procura»',
     'quedó: ' + regla.slice(0, 160).replace(/\s+/g, ' '));
  ok(/cal_nueva/.test(regla),
     'y nombra el campo que no puede bajar de ahí');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
