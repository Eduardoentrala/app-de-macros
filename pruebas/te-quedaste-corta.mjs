// El cierre de los lunes le dijo a un hombre «te quedaste corta de proteína».
//
// En español no se puede escribir «te quedaste cort_» sin decidir. Cada
// adjetivo obliga a elegir, así que un modelo que no tiene el dato no se
// queda callado: acierta o falla, y la mitad de las veces falla.
//
// Y EL DATO ESTABA. `profiles.sexo` existe desde la 0022 —se guardó porque
// Mifflin-St Jeor suma +5 a un hombre y -161 a una mujer— pero no salía de
// la fórmula. La palabra «sexo» no aparecía en toda la función del
// asistente: ni en el cierre, ni en el chat, ni en la comparación de fotos.
//
// NO ES UN DETALLE DE ESTILO. Es la app hablándole a otra persona. Quien lo
// lee entiende, con razón, que esto no lo escribió nadie mirándole a él — y
// la próxima cosa que le diga, aunque sea cierta, ya se lee distinto. Es el
// mismo daño que el «se te notó parejo hasta el sábado» que ya costó un
// prompt entero (SISTEMA_AVISO), por otro camino.
//
// Y SIN DATO NO SE ADIVINA. La columna admite nulo y hay perfiles sin
// rellenar. Adivinar con un 50% es escribirle a la mitad de la gente en el
// género de otra; se escribe sin género y ya.

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

// Sin los comentarios: esta prueba viene con uno arriba lleno de «sexo» y
// «masculino», y sin esto se aprobaría sola.
const sinComentarios = (s) => s.replace(/^\s*\/\/.*$/gm, '');

// El cuerpo empieza después de los paréntesis, no en la primera llave: los
// tipos de los parámetros llevan llaves dentro.
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

function bloqueDeAccion(nombre) {
  const marca = `if (accion === '${nombre}') {`;
  const i = FN.indexOf(marca);
  if (i < 0) throw new Error('no encuentro la acción ' + nombre);
  let n = 0, j = FN.indexOf('{', i);
  for (; j < FN.length; j++) {
    if (FN[j] === '{') n++;
    else if (FN[j] === '}') { n--; if (!n) return sinComentarios(FN.slice(i, j + 1)); }
  }
  throw new Error('llaves sin cerrar en ' + nombre);
}

// ------------------------------------------------------------------
console.log('\nEl dato sale de la base, donde ya se estaba leyendo');
{
  // Hay un `select` del perfil que corre para TODAS las acciones, antes de
  // repartirlas. Ahí cabe sin pagar un viaje más.
  //
  // Se busca POR SU CONTENIDO y no por ser el primero: hay varios `select`
  // del perfil —el del rol, el de la memoria, el del permiso de fotos— y el
  // que corre siempre, antes de repartir las acciones, es el que mira si le
  // dejan usar el asistente. Coger el primero que aparezca daba el del rol.
  const i = FN.indexOf("select('ia_habilitada");
  ok(i > 0, 'se encuentra el `select` que corre para todas las acciones');
  const trozo = sinComentarios(FN.slice(i - 80, i + 200));
  ok(/select\('[^']*\bsexo\b/.test(trozo),
     'el `select` que ya corre para todas las acciones trae el sexo',
     'quedó: ' + (trozo.match(/select\('[^']*'\)/) || ['nada'])[0] +
     '. En un select aparte sería un viaje más en cada petición');

  // De la base, nunca del cuerpo: lo de abajo decide cómo se le habla a
  // alguien, y por el cuerpo lo decidiría quien mandara la petición.
  ok(!/cuerpo\.sexo/.test(sinComentarios(FN)),
     'y nunca del cuerpo de la petición');
}

// ------------------------------------------------------------------
console.log('\nY se convierte en una instrucción, ejecutándola de verdad');
{
  const js = stripTypeScriptTypes(sacar('function comoHablarle('));
  const comoHablarle = new Function(js + '; return comoHablarle;')();

  const h = comoHablarle('h');
  const m = comoHablarle('m');
  ok(/masculino/i.test(h), 'a un hombre se le habla en masculino');
  ok(/femenino/i.test(m), 'y a una mujer en femenino');
  ok(h !== m, 'y no son la misma frase');

  // LO QUE MÁS IMPORTA DE LOS TRES. La columna admite nulo y hay perfiles
  // sin rellenar: ahí la respuesta correcta no es elegir, es no elegir.
  for (const vacío of [null, undefined, '', '  ', 'x']) {
    const n = comoHablarle(vacío);
    ok(!/en masculino|en femenino/i.test(n),
       `con «${String(vacío)}» no se inventa un género`,
       'quedó: ' + JSON.stringify(n.slice(0, 90)) +
       '. Adivinar con un 50% es escribirle a la mitad de la gente como a otra');
    ok(n.length > 40,
       `y con «${String(vacío)}» sí se le dice qué hacer en su lugar`,
       'escribir sin género en español cuesta: sin una instrucción que lo ' +
       'diga, el modelo elige igual');
  }
}

// ------------------------------------------------------------------
console.log('\nY llega a todo lo que le escribe a esa persona');
{
  // El cierre de los lunes es donde se vio, pero el problema no era del
  // cierre: era que el dato no salía de la fórmula. Cualquiera de estos
  // escribe prosa sobre alguien y puede equivocarse igual.
  for (const [accion, qué] of [
    ['semana', 'el cierre de los lunes, que es donde se vio'],
    ['chat', 'el chat'],
    ['fotos', 'la comparación de fotos'],
    ['aviso', 'el mensaje que escribe él solo'],
    ['plan', 'el plan de comidas'],
    ['cumple', 'y la felicitación de cumpleaños'],
  ]) {
    ok(/comoHablarle\(/.test(bloqueDeAccion(accion)), qué);
  }
}

// ------------------------------------------------------------------
console.log('\nY en el chat no rompe la caché');
{
  // El primer bloque del prompt del chat lo comparten TODOS: once mil tokens
  // cacheados una vez para toda la gente. Meter ahí algo que cambia por
  // persona partiría esa caché en una por género.
  const CHAT = bloqueDeAccion('chat');
  const iCorte = CHAT.indexOf('cache_control');
  const iSexo = CHAT.indexOf('comoHablarle(');
  ok(iSexo > 0 && iCorte > 0, 'se encuentran las dos cosas');
  ok(iSexo < iCorte || CHAT.indexOf('loQueCambia') < iCorte,
     'va en el bloque que no se cachea, con la memoria',
     'en el bloque compartido habría una caché por género en vez de una ' +
     'para todos, y se paga por escribirla');
  ok((CHAT.match(/cache_control/g) || []).length === 2,
     'y los dos cortes de caché siguen siendo dos');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
