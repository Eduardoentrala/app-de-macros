// El cierre concluía algo cada lunes y lo tiraba.
//
// La única memoria larga de la app era `memoria_ia`, y la escribía SOLO el
// chat: `SISTEMA_MEMORIA` se añade únicamente en la acción `chat`. O sea
// que a quien no conversa con el asistente la app no llegaba a conocerlo
// nunca, por mucho que apuntara.
//
// Y el cierre semanal —que es el momento con MÁS información de toda la
// app: el peso, lo comido con sus macros, el gimnasio ejercicio por
// ejercicio, el sueño, el hambre, la cintura— solo leía. Lo que entendía
// de esa persona el lunes no llegaba al lunes siguiente.
//
// Ahora deja su propia nota, `aprendido_cierre`, SEPARADA de la del chat.
// No es un capricho: las dos se reescriben enteras cada vez, y con dos
// escritores sobre el mismo texto se pisan. Eso ya estaba documentado en el
// código como el motivo de que el cierre no escribiera; separarlas lo
// resuelve sin renunciar a nada.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const FN = readFileSync(join(RAIZ, 'supabase', 'functions', 'asistente', 'index.ts'), 'utf8')
  .replace(/\r\n/g, '\n');
const MIG = readFileSync(join(RAIZ, 'supabase', 'migrations',
  '0056_lo_que_el_cierre_aprende.sql'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

const sacarDe = (texto, cabecera) => {
  const i = texto.indexOf(cabecera);
  if (i < 0) throw new Error('no encuentro: ' + cabecera);
  let n = 0, j = texto.indexOf('{', i);
  for (; j < texto.length; j++) {
    if (texto[j] === '{') n++;
    else if (texto[j] === '}') { n--; if (!n) return texto.slice(i, j + 1); }
  }
  throw new Error('llaves sin cerrar en ' + cabecera);
};

function prompt(nombre) {
  const i = FN.indexOf('const ' + nombre + ' = `');
  if (i < 0) return '';
  const desde = FN.indexOf('`', i) + 1;
  const sig = FN.indexOf('\nconst SISTEMA_', desde);
  const trozo = FN.slice(desde, sig < 0 ? FN.length : sig);
  const cierre = trozo.lastIndexOf('`');
  return cierre > 0 ? trozo.slice(0, cierre) : trozo;
}

const SEMANA = prompt('SISTEMA_SEMANA');
const CIERRE = sacarDe(FN, "if (accion === 'semana') {");

// ------------------------------------------------------------------
console.log('\nLa columna existe y es suya');
{
  ok(/add column if not exists aprendido_cierre text/.test(MIG), 'la 0056 la crea');
  ok(/length\(aprendido_cierre\) <= 800/.test(MIG), 'con su tope de 800',
     'menos que los 1200 del chat: aquí no se guardan gustos sino qué se ' +
     'probó y cómo respondió el cuerpo, y eso cabe en menos');
  ok(/comment on column public\.profiles\.aprendido_cierre/.test(MIG),
     'y dice para qué sirve, en la propia base');
}

console.log('\nY no se pisa con la del chat');
{
  ok(/aprendido_cierre/.test(CIERRE), 'el cierre usa la suya');
  // La del chat la escribe `guardarMemoriaIA`. Si el cierre escribiera ahí
  // también, dos textos que se reescriben enteros se machacarían.
  const guardado = sacarDe(APP, 'function guardarMemoriaIA(');
  ok(/memoria_ia/.test(guardado) && !/aprendido_cierre/.test(guardado),
     'y el chat sigue con la suya, sin mezclarse');
  const chat = sacarDe(FN, "if (accion === 'chat') {");
  ok(!/aprendido_cierre:/.test(chat), 'el chat no la escribe',
     'leerla sí; escribirla desde dos sitios es lo que se está evitando');
}

console.log('\nEl modelo la devuelve, y la app la guarda');
{
  ok(/aprendido: \{ anyOf: \[\{ type: 'null' \}, \{ type: 'string' \}\] \}/.test(FN),
     'el esquema la pide, y acepta null',
     'no todas las semanas enseñan algo; forzar texto es forzar relleno');
  ok(/required: \['mensaje', 'ajusto', 'cal_nueva', 'motivo', 'aprendido'\]/.test(FN),
     'y la pide siempre, aunque venga vacía');

  const cierreApp = APP.slice(APP.indexOf('guardarChequeo(r, laFoto);'));
  ok(/aprendido_cierre: recortarTexto\(r\.aprendido, 800\)/.test(cierreApp),
     'la app la guarda recortada al tope de la columna',
     'sin el recorte, 801 caracteres rebotan contra el check y se pierde entera');

  // EJECUTADO, no mirado. Antes esto comprobaba que en el código pusiera
  // `.slice(0, 800)`, que es mirar la letra y no lo que hace: un `.slice`
  // cumplía el tope y partía la palabra por la mitad. El motivo del cierre
  // salió así en la tarjeta —«… Proteína 1»— y eso vuelve al modelo como
  // historial, así que se lee cortado cada lunes.
  const recortar = new Function('return ' + sacarDe(APP, 'function recortarTexto(txt, tope){'))();
  const largo = 'palabra '.repeat(200);          // 1600, de sobra
  ok(recortar(largo, 800).length <= 800, 'y lo recortado cabe en la columna',
     'salió ' + recortar(largo, 800).length + ': el check la rechaza y se pierde entera');
  ok(!/palabr$|palab$|pala$|pal$|pa$|p$/.test(recortar(largo, 800).replace(/…$/, '')),
     'sin partir la última palabra',
     'acabó en «' + recortar(largo, 800).slice(-14) + '»');
  ok(recortar('a'.repeat(900), 800).length <= 800,
     'y un texto sin un solo espacio también cabe',
     'sin sitio donde cortar limpio sigue habiendo que cumplir el tope');
  ok(recortar('x'.repeat(798) + '😀 y más', 800).length <= 800 &&
     !/[\uD800-\uDFFF]/.test(recortar('x'.repeat(798) + '😀 y más', 800)),
     'y un emoji justo en el corte no deja media letra',
     'medio carácter no es UTF-8 válido: Postgres rechaza la fila ENTERA, ' +
     'así que no se pierde la nota, se pierde el chequeo');
  ok(recortar(null, 800) === null && recortar('   ', 800) === null,
     'y sin nada que guardar devuelve null',
     'un texto vacío borraría la nota que ya había');
  ok(recortar('nota corta', 800) === 'nota corta', 'y lo que cabe no se toca');
  ok(/typeof r\.aprendido === 'string' && r\.aprendido\.trim\(\)/.test(cierreApp),
     'y solo si vino algo', 'un null no puede borrar la nota que ya había');
}

console.log('\nSe le lee al empezar el cierre siguiente');
{
  ok(/\.select\('memoria_ia, goal, aprendido_cierre'\)/.test(CIERRE),
     'se trae con el resto del perfil, sin otra consulta');
  ok(/LO QUE APRENDISTE DE ELLA EN CIERRES ANTERIORES/.test(CIERRE),
     'y entra en el prompt con su rótulo');
  ok(/NO mediciones/.test(CIERRE), 'marcada como nota y no como medición',
     'la escribe el modelo, así que entra con la misma cautela que la del chat');
}

console.log('\nY el prompt sabe qué escribir en ella');
{
  ok(/LO QUE APRENDES DE ELLA, PARA LA PRÓXIMA VEZ/.test(SEMANA), 'tiene su sección');
  ok(/completa y reescrita|versión completa y reescrita/.test(SEMANA),
     'entera y reescrita, no un añadido',
     'por trozos acaba siendo un ladrillo que se paga en tokens cada lunes');
  // Con los espacios aplastados: el prompt va justificado a 76 columnas y
  // la frase se parte por donde toque. Una prueba no puede depender de
  // dónde cae el salto de línea.
  ok(/devuelve null y se queda la que había/.test(SEMANA.replace(/\s+/g, ' ')),
     'y si no hay nada nuevo, null');
  ok(/CÓMO RESPONDIÓ su cuerpo/.test(SEMANA),
     'sirve para qué se probó y cómo respondió',
     'que es justo lo que ninguna tabla guarda');
  ok(/PONLE FECHA DENTRO DE LA FRASE/.test(SEMANA),
     'con fecha dentro de la frase',
     'es la limitación que el propio prompt de la memoria del chat reconoce ' +
     'como la que más traiciona: se lee meses después sin saber cuándo se escribió');
  ok(/800 caracteres/.test(SEMANA), 'y con el mismo tope que la columna',
     'si el prompt pidiera más de lo que la columna acepta, se perdería al guardar');
}

console.log(`\n${pasan} bien, ${fallan} mal`);
process.exit(fallan ? 1 : 0);
