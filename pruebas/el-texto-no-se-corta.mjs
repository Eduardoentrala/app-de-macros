// El coach se quedaba a media frase, y la frase a medias se guardaba un mes.
//
// SÍNTOMA: la comparación mensual de fotos terminaba así, tal cual:
//
//   «...puede venir de que las nuevas se tomaron con luz más pareja y la
//    cámara más cerca. El peso»
//
// Y ahí se acababa. Ni puntos suspensivos ni aviso: el texto simplemente no
// seguía.
//
// QUÉ PASÓ. `max_tokens` no es el tope del texto: es el tope de TODO lo que
// sale del modelo, Y EL PENSAMIENTO VA DENTRO. Con `thinking: adaptive` es el
// modelo quien decide cuánto piensa, así que un tope ajustado a lo que se
// espera leer se lo come el pensamiento y lo que queda para escribir es lo
// que sobre. Aquí sobraron menos de cien tokens de mil.
//
// Y el prompt empuja justo en esa dirección: pide «tres o cuatro frases»
// —poco texto— sobre un trabajo que es comparar ocho fotos contra el peso y
// la cintura de un mes —mucho pensamiento—. Cuanto más corta se le pide la
// respuesta, más desproporcionado es el tope.
//
// LO QUE CONVIRTIÓ UN TROPIEZO EN UN MES DE BUG. El texto cortado SE GUARDÓ.
// La comparación es una al mes y se cachea a propósito —son ocho imágenes al
// modelo, no se pagan dos veces—, así que la media frase se quedó en la
// pantalla hasta diciembre. Nada miraba `stop_reason`, que es el campo donde
// la API dice «esto no acabó, se me acabó el sitio».
//
// Esa es la parte que de verdad importa y es la que fija esta prueba: un
// texto que vino cortado NO SE GUARDA, y uno que ya está guardado a medias no
// cuenta como hecho. Los topes se suben también, pero subir un tope es
// adivinar; no guardar lo que vino roto es no depender de haber adivinado
// bien.

import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const FN = readFileSync(join(RAIZ, 'supabase', 'functions', 'asistente', 'index.ts'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

// SIN LOS COMENTARIOS. Ya hubo tres comprobaciones que pasaban porque
// encontraban lo que buscaban dentro de un comentario recién escrito — y esta
// prueba viene con un comentario arriba que habla de `stop_reason` y de
// `max_tokens`, así que sin esto se aprobaría a sí misma.
const sinComentarios = (s) => s.replace(/^\s*\/\/.*$/gm, '');

// Una función de nivel superior, contando llaves. Nada de ventanas de N
// caracteres: el día que la función crezca, una ventana corta por la mitad y
// la prueba se pone verde o roja por el sitio equivocado.
//
// Y EL CUERPO EMPIEZA DESPUÉS DE LOS PARÉNTESIS, no en la primera llave que
// aparezca. Los tipos de los parámetros llevan llaves dentro —`r: { content:
// ... }`— así que contar desde la primera devuelve el TIPO y no la función.
// Se vio aquí mismo: la prueba reventó con «Expected ',', got '<eof>'» en
// cuanto la firma creció.
function sacar(cabecera) {
  const i = FN.indexOf(cabecera);
  if (i < 0) throw new Error('no encuentro: ' + cabecera);
  let n = 0, j = FN.indexOf('(', i);
  for (; j < FN.length; j++) {
    if (FN[j] === '(') n++;
    else if (FN[j] === ')') { n--; if (!n) break; }
  }
  n = 0;
  let k = FN.indexOf('{', j);
  for (; k < FN.length; k++) {
    if (FN[k] === '{') n++;
    else if (FN[k] === '}') { n--; if (!n) return FN.slice(i, k + 1); }
  }
  throw new Error('llaves sin cerrar en ' + cabecera);
}

// Se ejecuta el código DE VERDAD, no se mira si está escrito. `new Function`
// con el cuerpo tal cual sale del fichero, sin los tipos.
function ejecutar(cabecera, nombre) {
  const js = stripTypeScriptTypes(sacar(cabecera));
  return new Function(js + '; return ' + nombre + ';')();
}

// ------------------------------------------------------------------
//  1. LAS LLAMADAS QUE PIENSAN TIENEN SITIO PARA ESCRIBIR
// ------------------------------------------------------------------
console.log('\nSi piensa, le queda de dónde escribir');
{
  // Cada `messages.create(` / `messages.stream(` con sus opciones, contando
  // paréntesis desde el de la llamada.
  const llamadas = [];
  const re = /ia\.messages\.(create|stream)\(/g;
  let m;
  while ((m = re.exec(FN))) {
    let n = 0, j = m.index + m[0].length - 1;
    for (; j < FN.length; j++) {
      if (FN[j] === '(') n++;
      else if (FN[j] === ')') { n--; if (!n) break; }
    }
    llamadas.push({
      linea: FN.slice(0, m.index).split('\n').length,
      cuerpo: sinComentarios(FN.slice(m.index, j + 1)),
    });
  }

  ok(llamadas.length >= 6,
     `se encuentran las ${llamadas.length} llamadas al modelo`,
     'si salen menos, el troceo no está mirando lo que cree');

  // EL SUELO: 3000. No es un número redondo por gusto — es que el
  // pensamiento adaptativo de una tarea de verdad se come del orden de mil
  // tokens, y lo que queda tiene que dar para el texto entero CON holgura,
  // porque la holgura que no se deja la paga el último párrafo. Lo que se
  // gasta de más no se paga: `max_tokens` es un techo, no una compra.
  const SUELO = 3000;

  for (const l of llamadas) {
    if (!/thinking:/.test(l.cuerpo)) continue;
    const topes = [...l.cuerpo.matchAll(/max_tokens:[^,\n]*?(\d+)/g)].map((x) => Number(x[1]));
    // Donde hay un ternario —`imagen ? 4000 : 2000`— la rama que piensa es la
    // generosa, así que manda la mayor. Afinar más sería interpretar el
    // ternario, y eso es escribir un intérprete dentro de una prueba.
    const tope = topes.length ? Math.max(...topes) : 0;
    ok(tope >= SUELO,
       `la llamada de la línea ${l.linea} piensa y le quedan ${tope} tokens`,
       'con pensamiento adaptativo el modelo decide cuánto piensa y eso sale ' +
       `de este mismo tope. Con ${tope} el texto puede salir cortado a media ` +
       'frase, que es exactamente lo que pasó con la comparación de fotos');
  }
}

// ------------------------------------------------------------------
//  2. SE SABE CUÁNDO VINO CORTADO
// ------------------------------------------------------------------
console.log('\nY se nota cuando el modelo se quedó sin sitio');
{
  const textoDe = ejecutar('function textoDe(', 'textoDe');

  const entera = textoDe({
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: '  Este mes no se ve cambio.  ' }],
  });
  ok(entera.texto === 'Este mes no se ve cambio.', 'el texto sale limpio');
  ok(entera.cortada === false, 'y una respuesta que acabó sola no viene cortada');

  const rota = textoDe({
    stop_reason: 'max_tokens',
    content: [{ type: 'text', text: 'luz más pareja y la cámara más cerca. El peso' }],
  });
  ok(rota.cortada === true, 'y una que se quedó sin tokens SÍ',
     '`stop_reason: max_tokens` es la API diciendo «no acabé, me quedé sin ' +
     'sitio». Era el campo que nadie miraba');

  // El pensamiento no es el mensaje. Si un bloque `thinking` se colara en el
  // texto, al coach le saldría en pantalla su propio razonamiento.
  const pensada = textoDe({
    stop_reason: 'end_turn',
    content: [
      { type: 'thinking', thinking: 'a ver, el peso bajó 0.3' },
      { type: 'text', text: 'Vas bien.' },
    ],
  });
  ok(pensada.texto === 'Vas bien.', 'y lo que pensó por el camino no es el mensaje');
}

// ------------------------------------------------------------------
//  3. Y LO CORTADO NO SE GUARDA
// ------------------------------------------------------------------
console.log('\nY lo que vino cortado no se guarda');
{
  const i = FN.indexOf("if (accion === 'fotos') {");
  let n = 0, j = FN.indexOf('{', i);
  for (; j < FN.length; j++) {
    if (FN[j] === '{') n++;
    else if (FN[j] === '}') { n--; if (!n) break; }
  }
  const FOTOS = sinComentarios(FN.slice(i, j + 1));

  ok(/textoDe\(/.test(FOTOS), 'la comparación de fotos mira si vino cortada');

  const iCorte = FOTOS.search(/if \(\s*cortada/);
  const iGuardar = FOTOS.indexOf('.upsert(');
  ok(iCorte > 0, 'y hay una salida para cuando lo está');
  ok(iCorte > 0 && iGuardar > 0 && iCorte < iGuardar,
     'y sale ANTES de guardar, no después',
     'guardar y luego avisar deja la media frase en la base, y como esto es ' +
     'una caché mensual ahí se queda hasta el mes que viene');

  // Las dos llamadas: la que mira las fotos y la que lo cuenta. La primera no
  // se ve en ninguna pantalla —su texto alimenta a la segunda— así que si se
  // corta no se entera nadie: el coach escribe su mensaje sobre media
  // observación y suena igual de seguro.
  ok((FOTOS.match(/textoDe\(/g) || []).length >= 2,
     'las dos: la que mira y la que cuenta',
     'la primera no se enseña en ninguna parte, así que un corte ahí es ' +
     'invisible — y el mensaje final se escribe encima de media observación');
}

// ------------------------------------------------------------------
//  4. Y UNA GUARDADA A MEDIAS NO CUENTA COMO HECHA
// ------------------------------------------------------------------
console.log('\nY una guardada a medias no cuenta como hecha');
{
  // Para las que ya se guardaron cortadas no hay `stop_reason` que mirar: se
  // perdió al guardarlas. Lo que queda es el texto, y un texto que acaba sin
  // cerrar la frase no acabó.
  const completa = ejecutar('function textoCompleto(', 'textoCompleto');

  ok(completa('Este mes no se ve cambio claro. Sigue así.') === true,
     'una que termina en punto está completa');
  ok(completa('la cámara más cerca. El peso') === false,
     'y la de noviembre, que acaba en «El peso», no',
     'es la que se quedó un mes entero en su pantalla');
  ok(completa('') === false, 'una vacía tampoco');
  ok(completa(null) === false, 'ni algo que no es texto');
  ok(completa('¿Lo ves?') === true, 'y una pregunta cierra igual de bien');
  ok(completa('Vas bien.  \n') === true, 'aunque le sobren espacios al final');

  const FOTOS = sinComentarios(FN.slice(
    FN.indexOf("if (accion === 'fotos') {"), FN.indexOf("if (accion === 'plan')")));
  const iYa = FOTOS.indexOf('yaEsta');
  ok(iYa > 0 && /textoCompleto\(\s*yaEsta/.test(FOTOS),
     'y la caché del mes solo sirve lo que está entero',
     'si no, el arreglo no le devuelve el mes a quien ya tiene una cortada ' +
     'guardada: le seguiría saliendo la misma media frase');
}

// ------------------------------------------------------------------
//  5. Y EL CIERRE DE LOS LUNES, QUE DEVUELVE JSON, AVISA DE LO MISMO
// ------------------------------------------------------------------
console.log('\nY un JSON cortado se explica, no se calla');
{
  // El cierre pide un JSON con esquema. Si se corta, `JSON.parse` revienta
  // con «Unexpected end of JSON input», que no le dice a nadie que lo que
  // pasó fue un tope corto. Una vez por semana, y sin pista de por qué.
  //
  // SE EJECUTA, no se busca escrito. Buscar `stop_reason` en la función daba
  // verde con la comprobación QUITADA: el nombre seguía estando en el tipo de
  // la firma. La mutación se escapó por ahí y así se encontró.
  const leerJson = ejecutar('function leerJson(', 'leerJson');

  let reventó = null;
  try {
    leerJson({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"ajusto": tr' }] });
  } catch (e) { reventó = e; }
  ok(reventó !== null, 'un JSON cortado no se intenta leer');
  ok(reventó !== null && /cortad/i.test(reventó.message),
     'y el error dice que vino cortado',
     'quedó en «' + (reventó && reventó.message) + '». Esto corre una vez por ' +
     'semana: si el error no lo explica, no hay por dónde empezar a mirar');

  const bien = leerJson({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"ajusto":false}' }] });
  ok(bien.ajusto === false, 'y uno entero se lee como siempre');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
