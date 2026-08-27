// La tarjeta que se abre al tocar una semana.
//
// QUÉ ARREGLA. «Mis semanas» enseñaba cuatro celdas —peso, comida, proteína,
// gym— y al tocar desplegaba una lista de líneas dentro de la propia lista.
// En la práctica salían cuatro guiones por semana y siete semanas seguidas
// sin un solo número, porque las columnas de medias las añadió la 0054 y toda
// fila anterior las tiene en null.
//
// Los apuntes de aquellas semanas NO se perdieron: siguen en `diary_entries`,
// `cardio_logs` y `workout_sessions`. Solo había que ir a buscarlos. Por eso
// la tarjeta usa lo guardado cuando está y lo calcula cuando no, y así las
// semanas viejas dejan de ser una rejilla de guiones.
//
// LA MEDIA ES ENTRE LOS DÍAS APUNTADOS, no entre siete. Es la misma regla que
// usa el cierre semanal —`media_cal: dias ? suma/dias : 0`— y tenía que serlo:
// dos formas de promediar darían dos verdades distintas para la misma semana
// según por dónde se mire, y la que ve la IA es la del cierre.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8');
const CSS = readFileSync(join(RAIZ, 'docs', 'estilos', 'pantallas.css'), 'utf8');

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

// El código real, con lo justo alrededor para que corra.
const FUENTE = [
  sacar('function escapar(t){'),
  sacar('function isoDe(d){'),
  sacar('function calDe(m){'),
  sacar('function rangoDeSemana(iso){'),
  sacar('function semanaQueJuzga(f){'),
  sacar('function mediasDeApuntes(comidas, desde, hasta){'),
  sacar('function progresionDeFuerza(sesiones, desde, hasta, desdeAntes){'),
  sacar('function logroSusMacros(m){'),
  sacar('function armarSemana(f, crudos){'),
  sacar('function nombreDeQuienEs(){'),
  sacar('function rangoCorto(iso){'),
  sacar('function rangoEnPalabras(iso){'),
  sacar('function filaMacro(rotulo, hecho, meta, unidad){'),
  sacar('function tarjetaDeSemana(f, m){'),
].join('\n');

const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const hacer = (extra = {}) => new Function(
  'MESES_LARGO', 'reg', 'MI_PERFIL', 'document', 'PESOS', 'CINTURAS', 'leerMetas',
  FUENTE + '; return { mediasDeApuntes, progresionDeFuerza, logroSusMacros, ' +
           'armarSemana, tarjetaDeSemana, rangoEnPalabras, rangoCorto, semanaQueJuzga };')(
  MESES_LARGO,
  extra.reg || { dias: 7 },
  extra.perfil !== undefined ? extra.perfil : { full_name: 'Eduardo Entrala', cardio_goal_min: 120 },
  { getElementById: () => null },
  extra.PESOS || {},
  extra.CINTURAS || [],
  extra.leerMetas || (() => ({ P: 170, C: 230, G: 75 })));

// ------------------------------------------------------------------
console.log('\nLas medias se sacan de los apuntes, entre los días apuntados');
{
  const { mediasDeApuntes } = hacer();
  const dia = (f, p, c, g, cal) => ({ entry_date: f, protein_g: p, carbs_g: c, fat_g: g, calories: cal });
  // Cuatro días apuntados de una semana de siete.
  const m = mediasDeApuntes([
    dia('2026-08-18', 100, 200, 50, 1650), dia('2026-08-18', 50, 0, 0, 200),
    dia('2026-08-19', 150, 200, 50, 1850),
    dia('2026-08-20', 150, 200, 50, 1850),
    dia('2026-08-21', 150, 200, 50, 1850),
  ], '2026-08-18', '2026-08-24');
  ok(m.dias === 4, 'cuenta los días con algo apuntado, no las filas',
     'salió ' + (m && m.dias) + ': dos apuntes del mismo día son un día');
  ok(m.P === 150, 'y suma lo del mismo día antes de promediar', 'P=' + m.P);
  ok(m.cal === 1850, 'la media es entre esos días, no entre siete',
     'salió ' + m.cal + '; entre siete daría ' + Math.round(7400 / 7) +
     ', que inventa un déficit que no existió');

  // Lo de fuera de la semana no entra.
  const fuera = mediasDeApuntes([dia('2026-08-17', 999, 999, 999, 9999), dia('2026-08-18', 100, 100, 100, 1000)],
                                 '2026-08-18', '2026-08-24');
  ok(fuera.dias === 1 && fuera.cal === 1000, 'y lo de fuera del rango no cuenta',
     'entró el día anterior: ' + JSON.stringify(fuera));

  ok(mediasDeApuntes([], '2026-08-18', '2026-08-24') === null, 'sin apuntes devuelve nada, no ceros',
     'un cero dice «no comió»; un hueco dice «no se sabe», que es lo cierto');
  ok(mediasDeApuntes(null, '2026-08-18', '2026-08-24') === null, 'y sin red tampoco inventa');
}

// ------------------------------------------------------------------
console.log('\nProgresar es levantar más, no entrenar más veces');
{
  const { progresionDeFuerza } = hacer();
  // La forma REAL de lo que guarda la app: `detalle.push({nombre, volumen,
  // series})`, y cada serie `{reps, peso, hecho}`.
  const ses = (fecha, ejs) => ({ session_date: fecha, exercises: ejs });
  const ej = (nombre, series) => ({
    nombre,
    volumen: series.reduce((a, s) => a + s.reps * s.peso, 0),
    series: series.map((s) => Object.assign({ hecho: true }, s)),
  });
  const ANTES = '2026-08-11', DESDE = '2026-08-18', HASTA = '2026-08-24';
  const p = (ss) => progresionDeFuerza(ss, DESDE, HASTA, ANTES);

  // ESTE ES EL CASO QUE LO ROMPÍA TODO, y salió de mirar una semana real.
  //
  // Comparando el volumen de la SEMANA, hacer el mismo ejercicio dos veces
  // en vez de una duplica su número sin haber levantado un kilo más. En una
  // semana de verdad, al pasar de 2 a 5 sesiones, salía «subieron 10, igual
  // 0, bajaron 0»: eso no era progreso, era frecuencia disfrazada de
  // progreso. Y la sección se titula «progresión de fuerza».
  const masVeces = p([
    ses('2026-08-12', [ej('Press banca', [{ reps: 10, peso: 60 }])]),
    // La misma semana siguiente, pero entrenado TRES veces. Mismo mejor set.
    ses('2026-08-19', [ej('Press banca', [{ reps: 10, peso: 60 }])]),
    ses('2026-08-21', [ej('Press banca', [{ reps: 10, peso: 60 }])]),
    ses('2026-08-23', [ej('Press banca', [{ reps: 10, peso: 60 }])]),
  ]);
  ok(masVeces.iguales === 1 && masVeces.subieron === 0,
     'entrenar el triple de veces con el mismo peso NO es haber progresado',
     'con el volumen de la semana esto daba «subió» sin levantar un kilo más: ' +
     JSON.stringify(masVeces));

  // Lo que sí es progresar.
  ok(p([
    ses('2026-08-12', [ej('Press banca', [{ reps: 10, peso: 60 }])]),
    ses('2026-08-19', [ej('Press banca', [{ reps: 10, peso: 62.5 }])]),
  ]).subieron === 1, 'más peso a las mismas repeticiones, sí');
  ok(p([
    ses('2026-08-12', [ej('Press banca', [{ reps: 8, peso: 60 }])]),
    ses('2026-08-19', [ej('Press banca', [{ reps: 10, peso: 60 }])]),
  ]).subieron === 1, 'y el mismo peso a más repeticiones, también');
  ok(p([
    ses('2026-08-12', [ej('Press banca', [{ reps: 10, peso: 60 }])]),
    ses('2026-08-19', [ej('Press banca', [{ reps: 10, peso: 60 }])]),
  ]).iguales === 1, 'lo mismo es lo mismo');
  ok(p([
    ses('2026-08-12', [ej('Press banca', [{ reps: 10, peso: 60 }])]),
    ses('2026-08-19', [ej('Press banca', [{ reps: 10, peso: 55 }])]),
  ]).bajaron === 1, 'y menos peso es bajar');

  // El peso manda sobre las repeticiones: 62,5 × 6 es más fuerza que 60 × 12,
  // aunque el volumen diga lo contrario.
  ok(p([
    ses('2026-08-12', [ej('Press banca', [{ reps: 12, peso: 60 }])]),
    ses('2026-08-19', [ej('Press banca', [{ reps: 6, peso: 62.5 }])]),
  ]).subieron === 1, 'más peso cuenta aunque bajen las repeticiones',
     'es lo que distingue progresar de acumular volumen');

  // Se coge la MEJOR serie de la semana, no la última ni la media.
  ok(p([
    ses('2026-08-12', [ej('Press banca', [{ reps: 10, peso: 60 }])]),
    ses('2026-08-19', [ej('Press banca', [
      { reps: 12, peso: 40 }, { reps: 6, peso: 65 }, { reps: 10, peso: 50 }])]),
  ]).subieron === 1, 'y se coge la mejor serie, aunque después bajara el peso',
     'las series de bajada no borran la de arriba');

  // Una serie tecleada y sin palomita es una intención, no un levantamiento.
  const sinHacer = p([
    ses('2026-08-12', [ej('Press banca', [{ reps: 10, peso: 60 }])]),
    ses('2026-08-19', [{ nombre: 'Press banca', series: [
      { reps: 10, peso: 60, hecho: true }, { reps: 10, peso: 100, hecho: false }] }]),
  ]);
  ok(sinHacer.iguales === 1 && sinHacer.subieron === 0,
     'una serie sin hacer no cuenta como levantada',
     'si contara, teclear un peso sin levantarlo saldría como progreso: ' +
     JSON.stringify(sinHacer));

  // Un ejercicio nuevo NO es una bajada.
  const nuevo = p([
    ses('2026-08-12', [ej('Press banca', [{ reps: 10, peso: 60 }])]),
    ses('2026-08-19', [ej('Press banca', [{ reps: 10, peso: 60 }]),
                       ej('Peso muerto', [{ reps: 5, peso: 100 }])]),
  ]);
  ok(nuevo.bajaron === 0 && nuevo.iguales === 1,
     'un ejercicio que no estaba la semana pasada no cuenta como bajada',
     'contarlo convertiría cambiar de rutina en un suspenso: ' + JSON.stringify(nuevo));

  // Y el JSON puede llegar como texto desde PostgREST.
  const texto = progresionDeFuerza([
    { session_date: '2026-08-12', exercises: JSON.stringify([ej('Press', [{ reps: 10, peso: 60, hecho: true }])]) },
    { session_date: '2026-08-19', exercises: JSON.stringify([ej('Press', [{ reps: 10, peso: 70, hecho: true }])]) },
  ], DESDE, HASTA, ANTES);
  ok(texto && texto.subieron === 1, 'y da igual que el detalle llegue como texto',
     'si la base lo devuelve serializado y no se parsea, la progresión sale siempre vacía');

  ok(p([]) === null, 'sin sesiones no se inventa una progresión');
  // Es SEMANA CONTRA SEMANA: lo de hace tres semanas no entra.
  ok(p([
    ses('2026-07-20', [ej('Press banca', [{ reps: 10, peso: 40 }])]),
    ses('2026-08-19', [ej('Press banca', [{ reps: 10, peso: 60 }])]),
  ]) === null, 'y se compara contra la semana anterior, no contra hace un mes',
     'con una referencia vieja cualquiera «sube» siempre');
}

// ------------------------------------------------------------------
console.log('\nEl sello: logró o no logró sus macros');
{
  const { logroSusMacros } = hacer();
  const m = (P, C, G, cal) => ({ P, C, G, cal, metaP: 170, metaC: 230, metaG: 75, metaCal: 2275 });

  // Los números EXACTOS de la referencia: 88 % de proteína.
  ok(logroSusMacros(m(150, 195, 72, 2028)) === false,
     'los de la referencia dan «no logró», como en la referencia',
     'proteína al 88 %, y el listón está en el 90');
  ok(logroSusMacros(m(165, 225, 74, 2250)) === true, 'y cerca de todo, «sí logró»');

  // Los cuatro, no tres.
  ok(logroSusMacros(m(140, 230, 75, 2275)) === false,
     'con la proteína corta no vale aunque el resto esté',
     'dar por bueno «casi» en proteína es lo que hace que no se note que falta');
  // Pasarse cuenta igual que quedarse corto.
  ok(logroSusMacros(m(170, 300, 75, 2275)) === false, 'y pasarse de carbos tampoco vale');
  // Sin datos, ni sí ni no.
  ok(logroSusMacros(m(null, 195, 72, 2028)) === null,
     'si falta un dato no dice ni que sí ni que no',
     'un «no logró» por falta de datos es una acusación falsa');
  ok(logroSusMacros({ P:150, C:195, G:72, cal:2028, metaP:0, metaC:230, metaG:75, metaCal:2275 }) === null,
     'y una meta en cero tampoco se juzga');
}

// ------------------------------------------------------------------
console.log('\nLo guardado manda; lo que falta se rellena');
{
  const { armarSemana } = hacer();
  const crudos = {
    desde: '2026-08-18', hasta: '2026-08-24', desdeAntes: '2026-08-11',
    comidas: [{ entry_date: '2026-08-18', protein_g: 99, carbs_g: 99, fat_g: 99, calories: 999 }],
    cardio: [{ log_date: '2026-08-19', minutes: 30 }, { log_date: '2026-08-20', minutes: 15 },
             { log_date: '2026-08-30', minutes: 999 }],
    sesiones: [],
  };
  // Fila con medias guardadas: NO se pisan con lo calculado.
  const conDatos = armarSemana({ semana: '2026-08-18', media_p: 150, media_c: 195, media_g: 72,
    media_cal: 2028, meta_p: 170, meta_c: 230, meta_g: 75, cal_antes: 2275, dias_apuntados: 7,
    sesiones: 4 }, crudos);
  ok(conDatos.P === 150 && conDatos.cal === 2028,
     'una semana con medias guardadas conserva las suyas',
     'es lo que la IA vio al decidir; recalcularlo daría otra cifra');

  // Fila vieja, todo null: se rellena de los apuntes.
  const vieja = armarSemana({ semana: '2026-08-18', media_p: null, media_c: null, media_g: null,
    media_cal: null, meta_p: 170, meta_c: 230, meta_g: 75, cal_antes: 2275,
    dias_apuntados: null, sesiones: null }, crudos);
  ok(vieja.P === 99 && vieja.cal === 999,
     'y una vieja se rescata de sus apuntes',
     'esto es lo que quita los siete guiones seguidos');
  ok(vieja.dias === 1, 'con sus días apuntados');

  // El cardio: solo el de la semana.
  ok(conDatos.cardio === 45, 'el cardio suma solo los días de esa semana',
     'salió ' + conDatos.cardio + ': el del día 30 no es de esta semana');
  ok(conDatos.metaCardio === 120, 'y su meta sale del perfil');
  ok(conDatos.metaDias === 7, 'los días de entreno también');

  // Sin red no se rompe: se enseña lo guardado.
  const sinRed = armarSemana({ semana: '2026-08-18', media_p: 150, meta_p: 170,
    media_cal: 2028, cal_antes: 2275 }, null);
  ok(sinRed.P === 150 && sinRed.cardio === null,
     'sin red se enseña lo guardado y el resto queda en hueco');

  // Y si no hay meta de calorías guardada, se deduce de los macros.
  const sinMeta = armarSemana({ semana: '2026-08-18', meta_p: 170, meta_c: 230, meta_g: 75,
    cal_antes: null }, null);
  ok(sinMeta.metaCal === 170 * 4 + 230 * 4 + 75 * 9,
     'y la meta de calorías se deduce de los macros si no está guardada',
     'salió ' + sinMeta.metaCal);
}

// ------------------------------------------------------------------
console.log('\nY la tarjeta dice lo que tiene que decir');
{
  const { armarSemana, tarjetaDeSemana, rangoEnPalabras } = hacer();
  // La clave es la del 25 PORQUE ASI SE GUARDA: el cierre salta el 25 y
  // juzga del 18 al 24. La tarjeta tiene que decir 18 al 24.
  const f = {
    semana: '2026-08-25', dias_apuntados: 7,
    media_p: 150, meta_p: 170, media_c: 195, meta_c: 230,
    media_g: 72, meta_g: 75, media_cal: 2028, cal_antes: 2275, sesiones: 4,
    motivo: 'Ahí te dejo: apuntaste los siete días.', nota: 'Me sentí bien.',
  };
  const crudos = { desde: '2026-08-18', hasta: '2026-08-24', desdeAntes: '2026-08-11',
    comidas: [], cardio: [], sesiones: [
      { session_date: '2026-08-12', exercises: [{ nombre: 'Press', series: [{ reps: 10, peso: 60, hecho: true }] }] },
      { session_date: '2026-08-19', exercises: [{ nombre: 'Press', series: [{ reps: 10, peso: 70, hecho: true }] }] },
    ] };
  const html = tarjetaDeSemana(f, armarSemana(f, crudos));

  ok(rangoEnPalabras('2026-08-18') === '18 de agosto al 24 de agosto',
     'el rango se dice en palabras, como en la referencia',
     'salió «' + rangoEnPalabras('2026-08-18') + '»');
  ok(html.includes('18 de agosto al 24 de agosto'), 'y sale en la tarjeta');
  ok(html.includes('Eduardo Entrala'), 'con el nombre de quien es');
  ok(html.includes('No logró sus macros'), 'y el sello, que es lo primero que se busca');
  ok(html.includes('150g / 170g'), 'la proteína, hecho contra meta');
  ok(html.includes('195g / 230g') && html.includes('72g / 75g'), 'los carbos y las grasas');
  ok(html.includes('2028 / 2275'), 'y las calorías');
  ok(html.includes('4 / 7 días'), 'los días de fuerza contra su meta');
  ok(/0 \/ 120 min/.test(html), 'y el cardio contra la suya',
     'sin cardio apuntado son cero minutos, no un hueco: la semana pasó igual');
  ok(html.includes('Subieron <b>1</b>'), 'la progresión de fuerza');
  ok(html.includes('Ahí te dejo'), 'y lo que le contestó su coach',
     'es la parte que convierte una tabla de números en algo que se lee');
  ok(html.includes('Me sentí bien'), 'y lo que dijo ella');

  // Una semana sin nada no puede decir «no logró».
  const vacia = { semana: '2026-08-25' };
  const hv = tarjetaDeSemana(vacia, armarSemana(vacia, null));
  ok(!hv.includes('No logró'), 'una semana sin datos no acusa de nada',
     'decir «no logró» a quien no apuntó es inventarse un suspenso');
  ok(hv.includes('No hay datos suficientes'), 'lo dice tal cual');
  ok(hv.includes('—'), 'y lo que falta va con un guion');

  // Que el texto de fuera no entre crudo: lo escribe una persona y lo escribe
  // un modelo.
  const conPico = { semana: '2026-08-25', motivo: '<img src=x onerror=1>', nota: '<b>hola' };
  const hp = tarjetaDeSemana(conPico, armarSemana(conPico, null));
  ok(!hp.includes('<img src=x'), 'la respuesta del coach va escapada',
     'la escribe un modelo: es texto de fuera');
  ok(!hp.includes('<b>hola'), 'y la nota de la persona, también');
}

// ------------------------------------------------------------------
console.log('\nUna fila habla de la semana ANTERIOR a la que dice su columna');
{
  // ESTE ERA EL FALLO GORDO, y se veía sin buscarlo. La tarjeta que devuelve
  // el asistente decía «Semana 18 de agosto al 24 de agosto» y esa misma
  // respuesta salía en la lista como «Semana del 25 ago».
  //
  // El cierre salta cuando arranca una semana nueva y juzga la que acaba de
  // terminar —`datosDeLaSemana(true)`—, pero la fila se guarda con
  // `semana: isoDe(anclaSemana)`, que es la que EMPIEZA. Así que todas las
  // semanas salían etiquetadas una semana tarde.
  //
  // Y con la tarjeta habría sido peor que una etiqueta mal puesta: los
  // números guardados son de una semana y el cardio y la progresión se van a
  // buscar por fecha. Sin esta resta, la tarjeta mezclaba las medias de una
  // semana con el gimnasio de la siguiente.
  const fuente = sacar('function isoDe(d){') + '\n' + sacar('function semanaQueJuzga(f){');
  const semanaQueJuzga = new Function(fuente + '; return semanaQueJuzga;')();

  ok(semanaQueJuzga({ semana: '2026-08-25' }) === '2026-08-18',
     'la fila del 25 de agosto habla del 18 al 24',
     'salió ' + semanaQueJuzga({ semana: '2026-08-25' }));
  ok(semanaQueJuzga({ semana: '2026-01-05' }) === '2025-12-29',
     'y cruzando el año, también',
     'salió ' + semanaQueJuzga({ semana: '2026-01-05' }));
  ok(semanaQueJuzga({ semana: '2026-03-02' }) === '2026-02-23',
     'y cruzando el mes');
  ok(semanaQueJuzga({}) === null, 'sin fecha no inventa una');
  ok(semanaQueJuzga({ semana: 'lo que sea' }) === null, 'ni con una fecha rota');

  // Y que lo USE quien tiene que usarlo: el título de la lista, el rango de
  // la tarjeta y —sobre todo— la búsqueda de los datos crudos.
  ok(/rangoEnPalabras\(semanaQueJuzga\(f\)\)/.test(APP),
     'el rango de la tarjeta lo usa');
  ok(/crudosDeSemana\(semanaQueJuzga\(f\)\)/.test(APP),
     'y la búsqueda de los apuntes también',
     'sin esto se traen el cardio y las sesiones de la semana equivocada y ' +
     'se mezclan con unas medias que son de otra');
  ok(/rangoCorto\(semanaQueJuzga\(f\)\)/.test(APP),
     'y el título de cada fila de la lista');
  // Nadie debe volver a leer la columna cruda para hablar de la semana.
  ok(!/rangoEnPalabras\(f\.semana\)/.test(APP) && !/crudosDeSemana\(f\.semana\)/.test(APP),
     'y ya nadie usa la columna en crudo para eso');
}

// ------------------------------------------------------------------
console.log('\nY la progresión lee los campos que el guardado escribe');
{
  // Un acoplamiento que no avisa: la progresión saca `nombre` y `volumen` de
  // `workout_sessions.exercises`, y quien escribe esa columna está a nueve
  // mil líneas de distancia. Si allí se renombra un campo, aquí no falla
  // nada: la progresión sale vacía y la tarjeta se queda sin esa sección,
  // callada.
  const i = APP.indexOf('detalle.push({');
  ok(i > 0, 'se encuentra dónde se guarda el detalle de cada ejercicio');
  const escribe = APP.slice(i, APP.indexOf('}', i) + 1);
  ok(/nombre:/.test(escribe), 'el guardado escribe «nombre»', escribe);
  ok(/series:/.test(escribe), 'y «series»', escribe);

  const lee = sacar('function progresionDeFuerza(sesiones, desde, hasta, desdeAntes){');
  ok(/ej\.nombre/.test(lee), 'y la progresión lee «nombre»');
  ok(/ej\.series/.test(lee), 'y la progresión lee «series»');
  ok(/se\.peso/.test(lee) && /se\.reps/.test(lee) && /se\.hecho/.test(lee),
     'y de cada serie el peso, las repeticiones y si se hizo',
     'si dejan de coincidir con lo que escribe el guardado, la progresión ' +
     'sale vacía sin un solo error');
}

// ------------------------------------------------------------------
console.log('\nY la semana en curso no se queda cacheada');
{
  // Las pasadas ya no cambian; la de esta semana cambia cada vez que se
  // apunta algo. Con caché, apuntar la comida y volver a abrir la semana
  // enseñaba lo de antes, y eso se lee como que el apunte no se guardó.
  const f = sacar('function crudosDeSemana(iso){');
  ok(/enCurso/.test(f), 'se distingue la semana en curso');
  ok(/if\(!enCurso && CACHE_SEMANA\[iso\]\)/.test(f),
     'y solo se sirve de la caché lo que ya no puede cambiar');
  ok(/if\(!enCurso\) CACHE_SEMANA\[iso\] = d;/.test(f),
     'y solo se guarda en ella lo que ya no puede cambiar');
}

// ------------------------------------------------------------------
console.log('\nEl cuerpo: cuánto bajó y cuánto mide');
{
  // Ni una consulta más: `PESOS` y `CINTURAS` ya vienen cargados de un año al
  // arrancar la app —los usa la gráfica de Peso—, así que cualquier semana
  // del último año se reconstruye con lo que ya está en memoria.
  const PESOS = {
    // La semana anterior (11 al 17) y la que se juzga (18 al 24).
    '2026-08-12': 84.8, '2026-08-15': 84.6,
    '2026-08-19': 84.4, '2026-08-22': 84.2,
    // Y una de otro mes, que no debe colarse.
    '2026-07-01': 90.0,
  };
  const CINTURAS = [
    { fecha: '2026-07-20', cm: 90.0 },      // la de antes
    // DOS en la misma semana, a propósito: si se cogiera la primera en vez de
    // la última, con una sola medida no se notaría nunca. Lo cazó una
    // mutación que cambiaba `dentro[dentro.length-1]` por `dentro[0]` y no
    // hacía fallar nada.
    { fecha: '2026-08-19', cm: 89.2 },
    { fecha: '2026-08-20', cm: 88.5 },      // la buena: la última de la semana
  ];
  const { armarSemana, tarjetaDeSemana } = hacer({ PESOS, CINTURAS });
  const crudos = { desde: '2026-08-18', hasta: '2026-08-24', desdeAntes: '2026-08-11',
                   comidas: [], cardio: [], sesiones: [] };
  const f = { semana: '2026-08-25' };
  const m = armarSemana(f, crudos);

  // EL PESO ES LA MEDIA DE LA SEMANA, no el del día que se pesó: medio kilo
  // de agua y sal entra y sale en un día.
  ok(m.peso === 84.3, 'el peso es la media de esa semana',
     'salió ' + m.peso + '; (84,4 + 84,2) / 2 = 84,3');
  ok(m.pesoAntes === 84.7, 'y la de la anterior, para poder restar',
     'salió ' + m.pesoAntes);
  ok(m.cintura === 88.5, 'la cintura es la última medida DENTRO de la semana',
     'salió ' + m.cintura);
  ok(m.cinturaAntes === 90, 'y se compara con la anterior, venga de cuando venga',
     'se mide cada cuatro semanas: exigir una de la semana pasada dejaría ' +
     'la comparación vacía casi siempre. Salió ' + m.cinturaAntes);

  const html = tarjetaDeSemana(f, m);
  ok(/84,3 kg/.test(html), 'sale el peso');
  ok(/↓ 0,4 kg/.test(html), 'y cuánto bajó, con su flecha',
     '«84,3 kg» a secas no dice nada sin saber de dónde viene. Salió: ' +
     (html.match(/Peso<\/span><b>[^<]*/) || ['(nada)'])[0]);
  ok(/88,5 cm/.test(html) && /↓ 1,5 cm/.test(html), 'y la cintura, igual');

  // Los cuatro casos que faltaban.
  const subio = armarSemana({ semana: '2026-08-25', peso_medio: 85, peso_medio_antes: 84 }, null);
  ok(/↑ 1 kg/.test(tarjetaDeSemana({ semana: '2026-08-25' }, subio)), 'subir sale con flecha arriba');
  const igual = armarSemana({ semana: '2026-08-25', peso_medio: 84, peso_medio_antes: 84 }, null);
  ok(/84 kg  =/.test(tarjetaDeSemana({ semana: '2026-08-25' }, igual)),
     'y quedarse igual se dice, no se deja en blanco');
  const solo = armarSemana({ semana: '2026-08-25', peso_medio: 84 }, null);
  ok(/84 kg</.test(tarjetaDeSemana({ semana: '2026-08-25' }, solo)),
     'con un solo peso se enseña sin diferencia',
     'inventar una resta contra nada sería peor que no decirla');
  const nada = armarSemana({ semana: '2026-08-25' }, null);
  ok(!/Cuerpo/.test(tarjetaDeSemana({ semana: '2026-08-25' }, nada)),
     'y sin peso ni cintura el bloque no sale',
     'una sección con dos guiones ocupa sitio y no dice nada');

  // Lo guardado en la fila manda sobre lo calculado, como en todo lo demás.
  const guardada = armarSemana(
    { semana: '2026-08-25', peso_medio: 80, peso_medio_antes: 81, cintura: 70 }, crudos);
  ok(guardada.peso === 80 && guardada.cintura === 70,
     'y una semana que guardó los suyos conserva los suyos',
     'es lo que la IA vio al decidir');
}

// ------------------------------------------------------------------
console.log('\nY las metas que no se guardaron son las de hoy');
{
  // Sin esto la tarjeta enseñaba «152g / —» en los tres macros y el sello se
  // quedaba en «no hay datos suficientes» aunque estuviera todo lo demás:
  // `logroSusMacros` necesita los cuatro pares para poder decir nada. Se vio
  // en el teléfono.
  const { armarSemana, tarjetaDeSemana } = hacer();
  const f = { semana: '2026-08-25', media_p: 152, media_c: 210, media_g: 76,
              media_cal: 2134, cal_antes: 2451 };
  const m = armarSemana(f, null);
  ok(m.metaP === 170 && m.metaC === 230 && m.metaG === 75,
     'se rellenan con las de hoy cuando la fila no las trae',
     'salió ' + JSON.stringify([m.metaP, m.metaC, m.metaG]));
  const html = tarjetaDeSemana(f, m);
  ok(!/152g \/ —/.test(html), 'así que ya no sale «152g / —»');
  ok(!/No hay datos suficientes/.test(html), 'ni el sello se queda mudo',
     'con las metas en blanco no podía decir si logró o no');

  // Y una fila que SÍ guardó las suyas conserva las suyas.
  const propias = armarSemana({ semana: '2026-08-25', meta_p: 200 }, null);
  ok(propias.metaP === 200, 'y las suyas mandan sobre las de hoy',
     'son las que estaban en vigor esa semana');
}

// ------------------------------------------------------------------
console.log('\nLos dos textos van plegados');
{
  // Abiertos son diez o doce líneas cada uno y empujan los números fuera de
  // la pantalla, que es justo a lo que se entra. Se midió en un iPhone de
  // 812: plegada la tarjeta mide 573 px y CABE ENTERA sin arrastrar;
  // desplegada, 803. Plegar es lo que la hace legible de una ojeada.
  const { armarSemana, tarjetaDeSemana } = hacer();
  const f = { semana: '2026-08-25', motivo: 'Vas bien, no te muevo nada.',
              nota: 'Me sentí con poca energía.' };
  const html = tarjetaDeSemana(f, armarSemana(f, null));

  ok((html.match(/<details/g) || []).length === 2, 'los dos son plegables',
     'el del coach y el de lo que dijo esa persona');
  ok(!/<details[^>]*\sopen/.test(html), 'y nacen cerrados',
     'abiertos empujan las cifras fuera de la pantalla');
  ok(/<summary>/.test(html), 'con su cabecera tocable');
  ok(/Tu coach de Macros/.test(html) && /Lo que dijiste/.test(html),
     'y se sigue viendo de qué es cada uno sin abrirlo',
     'un plegable sin título no dice qué esconde');
  ok(/Vas bien/.test(html) && /poca energía/.test(html),
     'el texto está dentro, no se pierde');

  // `<details>` y no un botón con JavaScript: la tarjeta se repinta entera
  // cuando llegan los datos crudos, y un estado guardado a mano se perdería
  // en ese repintado.
  ok(!/onclick=/.test(html), 'sin JavaScript en línea',
     'la CSP lo bloquearía, y además el repintado se llevaría el estado');

  // Sin respuesta del coach queda solo la firma, y una firma no se pliega.
  const sinCoach = { semana: '2026-08-25' };
  const h2 = tarjetaDeSemana(sinCoach, armarSemana(sinCoach, null));
  ok(!/<details/.test(h2), 'y sin textos no hay nada que plegar');
  ok(/ts-firma/.test(h2), 'solo la firma');
}

// ------------------------------------------------------------------
console.log('\nY el estilo del plegable existe');
{
  ok(/\.ts-plegable summary\{/.test(CSS), 'la cabecera tiene estilo');
  ok(/min-height:44px/.test(CSS.replace(/\s/g, '')),
     'y llega a 44 de alto, que es lo que alcanza un dedo',
     'es una línea de texto de 16 px: sin esto se falla al tocarla');
  ok(/\.ts-plegable summary::after\{/.test(CSS), 'y lleva su flecha');
  ok(/\.ts-plegable\[open\] summary::after\{transform:rotate\(-90deg\)\}?/.test(CSS.replace(/;\}/g, '}')),
     'que gira al abrirse',
     'dice que hay algo debajo sin tener que leer nada');
  ok(/-webkit-details-marker\{display:none/.test(CSS.replace(/\s/g, '')),
     'y se quita el triángulo que pinta Safari por su cuenta',
     'sin esto salen dos marcas, la suya y la nuestra');
}

// ------------------------------------------------------------------
console.log('\nY la hoja está donde tiene que estar');
{
  // La regla que ya se pagó dos veces: una hoja dentro de una vista se abre
  // midiendo 0x0 desde cualquier otra pantalla.
  const pila = [];
  let dentroDe = 'no aparece';
  const re = /<div\b([^>]*)>|<\/div>/g;
  let m;
  while ((m = re.exec(HTML))) {
    if (m[0] === '</div>') { pila.pop(); continue; }
    const vista = (m[1].match(/data-view="([^"]+)"/) || [])[1] || null;
    pila.push(vista);
    if (/id="semanaSheet"/.test(m[1])) { dentroDe = pila.slice(0, -1).filter(Boolean).pop() || null; break; }
  }
  ok(dentroDe === null, 'semanaSheet vive fuera de las vistas',
     'vive dentro de «' + dentroDe + '»: se abriría midiendo 0×0 sin un solo error');
  ok(/id="tarjetaSem"/.test(HTML), 'y tiene su hueco donde pintarse');
  ok(/id="semanaCerrar"/.test(HTML), 'y con qué cerrarse');
}

// ------------------------------------------------------------------
console.log('\nY no quedó nada del desplegable anterior');
{
  ok(!/abiertaSemana/.test(APP), 'la variable del acordeón ya no está',
     'código muerto que engaña al siguiente que lo lea');
  ok(!/function detalleSemana/.test(APP), 'ni la función que pintaba el desplegable');
  ok(!/sem-mas/.test(CSS), 'ni su estilo');
  ok(/\.tarjeta-sem\{/.test(CSS), 'y el de la tarjeta sí está');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
