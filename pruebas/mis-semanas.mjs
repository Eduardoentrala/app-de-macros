// Mis semanas: el historial que deja el cierre de cada lunes.
//
// Cada lunes se calculaba un montón de cosas para decidir si se movían las
// calorías —lo que comió de media, su peso medio, si el volumen del gym
// subió— y en cuanto se tomaba la decisión se tiraba todo. Lo único que
// quedaba era el hambre, la energía, el sueño, la nota y la decisión.
//
// Guardarlo es lo que permite ver el patrón que ninguna semana suelta
// enseña: que las semanas en que falta proteína son las mismas en que el
// peso no se mueve.
//
// LO QUE SE PRUEBA AQUÍ, ejecutando las funciones de verdad:
//
//   · Que la foto de la semana coja los números QUE LA IA ACABA DE JUZGAR
//     y no unos recalculados después.
//   · Que lo que no se sabe viaje como null y NO como cero. Un cero dice
//     «comió cero gramos de proteína»; en la pantalla saldría 0 % y
//     parecería un dato real.
//   · Que el color signifique algo. Bajar medio kilo es verde para quien
//     adelgaza y no para quien intenta ganar: pintarlo igual sería decirle
//     a la mitad de la gente que lo hace mal.
//   · Que una fila vieja —sin ninguno de los datos nuevos— se pinte con
//     guiones en vez de reventar o inventar ceros.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const CSS = readFileSync(join(RAIZ, 'docs', 'estilos', 'pantallas.css'), 'utf8');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8').replace(/\r\n/g, '\n');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

// Una función entera, contando llaves. Nada de ventanas de N caracteres:
// eso se rompe en cuanto la función crece, y hoy mismo ha pasado.
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

const fuente = [
  'function escapar(t){', 'function porcentaje(hecho, meta){', 'function celda(clase, valor, extra, rotulo){',
  'function celdaPeso(f){', 'function celdaComida(f){', 'function celdaProteina(f){',
  'function celdaGym(f){', 'function detalleSemana(f){', 'function pintarMisSemanas(){',
].map(sacar).join('\n');

// `reg` y `mil` y `fmtFecha` vienen de fuera; se le pasan.
const construir = (extra = '') => new Function('reg', 'mil', 'fmtFecha', 'SEMANAS', 'abiertaSemana', 'document',
  fuente + '\n' + extra);

const mil = (n) => Math.round(n).toLocaleString('es-MX');
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fmtFecha = (d) => d.getDate() + ' ' + MESES[d.getMonth()];

function pinta(filas, { objetivo = 'bajar', abierta = -1 } = {}) {
  let puesto = '';
  const doc = { getElementById: () => ({ set innerHTML(v) { puesto = v; } }) };
  construir('pintarMisSemanas();')({ objetivo }, mil, fmtFecha, filas, abierta, doc);
  return puesto;
}
// Una celda suelta, con su fila y el objetivo de esa persona.
function celdaDe(fn, f, objetivo = 'bajar') {
  const g = new Function('reg', 'mil', 'fmtFecha', 'f',
    fuente + '\n return ' + fn + '(f);');
  return g({ objetivo }, mil, fmtFecha, f);
}

const SEMANA_BUENA = {
  semana: '2026-08-18', dias_apuntados: 7, media_cal: 2380, cal_antes: 2451,
  media_p: 162, media_c: 235, media_g: 74, meta_p: 170, meta_c: 240, meta_g: 75,
  peso_medio: 84.3, peso_medio_antes: 84.7, volumen: 21500, volumen_antes: 20100,
  sesiones: 4, cintura: 88.5, ajusto: false, motivo: null, nota: null,
};

// ------------------------------------------------------------------
console.log('\nLa foto de la semana coge lo que la IA acaba de juzgar');
{
  const foto = new Function('anclaSemana', 'isoDe', 'CINTURAS', 'Date',
    sacar('function fotoDeLaSemana(d, sem, ent){') + '; return fotoDeLaSemana;');
  const isoDe = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
                       '-' + String(d.getDate()).padStart(2, '0');
  const ancla = new Date('2026-08-25T12:00:00');
  const f = foto(ancla, isoDe, [{ fecha: '2026-08-20', cm: 88.5 }], Date);

  const d = { dias_apuntados: 7, media_cal: 2380, media_p: 120, media_c: 200, media_g: 70,
              meta_p: 170, meta_c: 240, meta_g: 75 };
  const sem = [{ peso_medio: 85.2 }, { peso_medio: 84.9 }, { peso_medio: 84.7 }, { peso_medio: 84.3 }];
  const ent = { sesiones: 4, volumen: 21500, volumen_antes: 20100 };
  const r = f(d, sem, ent);

  ok(r.media_p === 120 && r.meta_p === 170, 'los macros comidos y sus metas');
  ok(r.peso_medio === 84.3, 'el peso medio de la semana que se cierra',
     'salió ' + r.peso_medio);
  ok(r.peso_medio_antes === 84.7, 'y el de la anterior, para poder restar',
     'salió ' + r.peso_medio_antes + ': sin él no hay flecha, y sacarlo luego ' +
     'de la fila anterior falla en cuanto alguien se salta un chequeo');
  ok(r.volumen === 21500 && r.volumen_antes === 20100, 'el volumen y el de antes');
  ok(r.sesiones === 4, 'las sesiones');
  ok(r.cintura === 88.5, 'y la cintura de esa semana');
}

console.log('\nY una cintura de hace un mes no se cuela en esta semana');
{
  const foto = new Function('anclaSemana', 'isoDe', 'CINTURAS', 'Date',
    sacar('function fotoDeLaSemana(d, sem, ent){') + '; return fotoDeLaSemana;');
  const isoDe = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
                       '-' + String(d.getDate()).padStart(2, '0');
  const ancla = new Date('2026-08-25T12:00:00');
  // Medida vieja, fuera de los siete días que se cierran.
  const f = foto(ancla, isoDe, [{ fecha: '2026-07-02', cm: 91 }], Date);
  const r = f({}, [], null);
  ok(r.cintura === null, 'sale como hueco',
     'salió ' + r.cintura + ': diría que se midió esa semana cuando no lo hizo');
}

console.log('\nLo que no se sabe es null, nunca cero');
{
  const foto = new Function('anclaSemana', 'isoDe', 'CINTURAS', 'Date',
    sacar('function fotoDeLaSemana(d, sem, ent){') + '; return fotoDeLaSemana;');
  const isoDe = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
                       '-' + String(d.getDate()).padStart(2, '0');
  const f = foto(new Date('2026-08-25T12:00:00'), isoDe, [], Date);

  // Nadie apuntó nada y no hay entreno: casi todo tiene que faltar.
  const r = f({ dias_apuntados: 0, media_cal: 0, media_p: 0, media_c: 0, media_g: 0 }, [], null);
  ok(r.media_p === null && r.media_cal === null,
     'un cero de «no apuntó» no se guarda como cero',
     'guardar 0 dice «comió cero gramos»; en la pantalla sale 0 % y parece ' +
     'un dato de verdad. Salió: ' + JSON.stringify(r));
  ok(r.volumen === null, 'y sin entreno el volumen falta');
  ok(r.dias_apuntados === 0, 'pero los días apuntados sí son cero de verdad',
     'ahí el cero SÍ es un dato: apuntó cero días');

  // Las sesiones también: «fue cero veces» es un dato, no un hueco.
  const r2 = f({}, [], { sesiones: 0, volumen: 0, volumen_antes: 0 });
  ok(r2.sesiones === 0, 'y las sesiones a cero también son un dato',
     'salió ' + r2.sesiones + ': «no fue» es justo lo que hay que poder ver');
}

// ------------------------------------------------------------------
console.log('\nEl peso se colorea según a dónde quería ir');
{
  const bajo = { peso_medio: 84.3, peso_medio_antes: 84.7 };
  ok(/sem-celda bien/.test(celdaDe('celdaPeso', bajo, 'bajar')),
     'bajar medio kilo es verde para quien adelgaza');
  ok(!/sem-celda bien/.test(celdaDe('celdaPeso', bajo, 'subir')),
     'y NO lo es para quien intenta ganar',
     'pintarlo igual para todos le diría a la mitad de la gente que lo hace mal');

  const subio = { peso_medio: 85.2, peso_medio_antes: 84.7 };
  ok(/sem-celda bien/.test(celdaDe('celdaPeso', subio, 'subir')),
     'y subir es verde para quien quiere subir');

  const quieto = { peso_medio: 84.75, peso_medio_antes: 84.7 };
  ok(/sem-celda bien/.test(celdaDe('celdaPeso', quieto, 'mantener')),
     'quedarse quieto es verde para quien mantiene');
  ok(/0\.0 kg/.test(celdaDe('celdaPeso', quieto, 'bajar')),
     'y 50 g se enseñan como quieto, que es lo que son',
     'medio kilo de agua entra y sale en un día: por debajo de 150 g no hay ' +
     'nada que leer');

  ok(/—/.test(celdaDe('celdaPeso', { peso_medio: null, peso_medio_antes: null })),
     'y sin datos sale un guion');
}

console.log('\nLa proteína es el único rojo de la pantalla');
{
  ok(/sem-celda mal/.test(celdaDe('celdaProteina', { media_p: 120, meta_p: 170 })),
     'quedarse en el 71 % sale en rojo');
  ok(/sem-celda bien/.test(celdaDe('celdaProteina', { media_p: 162, meta_p: 170 })),
     'y cumplirla, en verde');
  // Y que NO se pinte de rojo comer poco: eso es un dato, no una falta.
  ok(!/sem-celda mal/.test(celdaDe('celdaComida', { media_cal: 1900, cal_antes: 2451 })),
     'comer por debajo NO sale en rojo',
     'esta pantalla es para ver el patrón, no para regañar cada semana');
  ok(!/sem-celda mal/.test(celdaDe('celdaGym', { sesiones: 3, volumen: 18000, volumen_antes: 20000 })),
     'ni bajar el volumen',
     'puede ser una descarga; marcarla en rojo enseñaría a saltársela');
}

console.log('\nEl gym distingue no ir de ir y no progresar');
{
  ok(/no fue/.test(celdaDe('celdaGym', { sesiones: 0 })), 'no ir se dice');
  ok(/subió/.test(celdaDe('celdaGym', { sesiones: 4, volumen: 21500, volumen_antes: 20100 })),
     'subir el volumen se dice');
  ok(/igual/.test(celdaDe('celdaGym', { sesiones: 4, volumen: 20100, volumen_antes: 20050 })),
     'y quedarse igual también');
  // Sin volumen anterior no se puede comparar: se enseñan los días.
  ok(/2 días/.test(celdaDe('celdaGym', { sesiones: 2, volumen: 9000, volumen_antes: null })),
     'sin con qué comparar, se enseñan los días',
     'dividir entre un volumen que falta daría Infinity o NaN');
  ok(/2 días/.test(celdaDe('celdaGym', { sesiones: 2, volumen: 9000, volumen_antes: 0 })),
     'y con un cero detrás tampoco se divide',
     'volumen_antes = 0 da Infinity: la primera semana de cualquiera');
}

// ------------------------------------------------------------------
console.log('\nUna fila vieja se pinta con guiones y no revienta');
{
  const vieja = { semana: '2026-07-28', dias_apuntados: null, media_cal: null,
                  cal_antes: 2451, media_p: null, meta_p: null, peso_medio: null,
                  peso_medio_antes: null, volumen: null, sesiones: null, cintura: null };
  let html = '';
  try { html = pinta([vieja]); } catch (e) { html = 'REVENTÓ: ' + e.message; }
  ok(!/REVENTÓ/.test(html), 'se pinta', html.slice(0, 120));
  // LOS CUATRO, no «al menos tres». Con «>= 3» esta comprobación pasaba
  // mientras la casilla de comida enseñaba «0 %»: la fila vieja no trae
  // `media_cal` pero sí `cal_antes`, y `Number(null)` es 0. Un cero ahí
  // afirma que no comió nada esa semana. Se vio al pintarlo en el navegador,
  // no aquí.
  ok((html.match(/—/g) || []).length === 4, 'con guiones en los cuatro',
     'salieron ' + (html.match(/—/g) || []).length + ' guiones: alguna casilla ' +
     'está enseñando un número donde no hay dato. HTML: ' + html.slice(0, 400));
  ok(!/>0 %</.test(html), 'y ningún cero por ciento inventado',
     'un 0 % se lee como un dato real, no como un hueco');
  ok(!/NaN|undefined|null/.test(html), 'y sin NaN ni undefined a la vista',
     html.slice(0, 300));
}

console.log('\nY una semana normal sale entera');
{
  const html = pinta([SEMANA_BUENA]);
  ok(/Semana del 18 ago/.test(html), 'con su fecha');
  ok(/7 de 7 días/.test(html), 'y cuántos días apuntó',
     'es lo que da o quita valor a los otros cuatro números');
  ok((html.match(/sem-celda/g) || []).length === 4, 'y sus cuatro recuadros',
     'salieron ' + (html.match(/sem-celda/g) || []).length);
  ok(!/NaN|undefined/.test(html), 'sin NaN ni undefined');
}

console.log('\nEl detalle solo se pinta en la que está abierta');
{
  const dos = [SEMANA_BUENA, Object.assign({}, SEMANA_BUENA, { semana: '2026-08-11' })];
  ok(!/sem-mas/.test(pinta(dos)), 'cerradas, ninguna lo enseña');
  const abierta = pinta(dos, { abierta: 1 });
  ok((abierta.match(/sem-mas/g) || []).length === 1, 'y abierta, solo una',
     'dos detalles a la vez obligan a desplazarse para comparar');
}

console.log('\nEl detalle enseña los tres macros y lo que escribió cada uno');
{
  const con = Object.assign({}, SEMANA_BUENA, {
    nota: 'Me sentí bien aunque bajo de ánimo.',
    motivo: 'Vas bien, no te muevo nada.',
  });
  const html = pinta([con], { abierta: 0 });
  ok(/Carbohidratos/.test(html) && /Grasas/.test(html),
     'los carbos y las grasas, que no caben en el resumen');
  ok(/162 de 170 g/.test(html), 'con lo comido y su meta, no solo el porcentaje');
  ok(/Me sentí bien/.test(html), 'lo que escribió esa semana');
  ok(/Vas bien/.test(html), 'y lo que le contestó');
}

console.log('\nY el texto de otra gente no entra crudo');
{
  // La nota la escribe la persona y el motivo lo devuelve el modelo. Los dos
  // acaban dentro de un innerHTML.
  const malo = Object.assign({}, SEMANA_BUENA, {
    nota: '<img src=x onerror=alert(1)>', motivo: '<b>ojo</b>',
  });
  const html = pinta([malo], { abierta: 0 });
  ok(!/<img src=x/.test(html), 'la nota va escapada');
  ok(!/<b>ojo<\/b>/.test(html), 'y lo que devuelve el modelo también',
     'es texto de fuera puesto como HTML');
}

// ------------------------------------------------------------------
console.log('\nY la pantalla está enganchada donde tiene que estar');
{
  ok(/data-push="missemanas"/.test(HTML), 'se llega con un botón');
  ok(/data-view="missemanas"/.test(HTML), 'y la vista existe');
  ok(/id="semanasLista"/.test(HTML), 'con su lista');
  ok(/id === 'missemanas'.*cargarMisSemanas\(\)/.test(APP),
     'y al abrirla se cargan los datos',
     'sin esto la pantalla sale vacía la primera vez');

  // El botón vive en Progreso —la vista `ejercicio`, a la que se llega con
  // el botón «Progreso» del Diario—. Estuvo un rato en Peso; se movió porque
  // Peso es donde se APUNTA el peso de hoy y Progreso es donde ya se mira
  // cómo va la cosa con el tiempo.
  const i = HTML.indexOf('data-push="missemanas"');
  const vista = [...HTML.slice(0, i).matchAll(/data-view="([^"]+)"/g)].pop()[1];
  ok(vista === 'ejercicio', 'el botón está en Progreso', 'está en ' + vista);
  // Y se llega a Progreso desde el Diario: si ese botón desapareciera, el
  // historial quedaría sin camino y no habría nada que lo dijera.
  ok(/data-push="ejercicio"[^>]*>[\s\S]{0,120}?Progreso/.test(HTML),
     'y a Progreso se llega desde el Diario',
     'sin ese botón, «Mis semanas» queda enterrado en una vista inalcanzable');

  // Y NO hay hoja nueva: el detalle se despliega dentro de la tarjeta. Una
  // hoja dentro de una vista se abre midiendo 0×0, y ya pasó dos veces.
  const dentro = HTML.slice(HTML.indexOf('data-view="missemanas"'),
                            HTML.indexOf('data-view=', HTML.indexOf('data-view="missemanas"') + 10));
  ok(!/sheet-backdrop/.test(dentro), 'y no mete ninguna hoja dentro de la vista',
     'una hoja anidada en una vista se abre con 0×0 desde cualquier otra ' +
     'pantalla, sin un solo error');
}

console.log('\nY el estilo existe');
{
  for (const c of ['.sem-card', '.sem-rejilla', '.sem-celda', '.sem-mas', '.fila-ir'])
    ok(CSS.includes(c + '{') || CSS.includes(c + ' '), 'hay estilo para ' + c);
  ok(/\.sem-rejilla\{[^}]*grid-template-columns:1fr 1fr/.test(CSS.replace(/\s*\n\s*/g, '')),
     'los recuadros van en dos columnas');
  ok(/overflow-wrap:anywhere/.test(CSS),
     'y la nota parte las palabras largas',
     'la escribe una persona y la escribe una IA: las dos pueden traer un ' +
     'enlace o una palabra sin espacios');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
