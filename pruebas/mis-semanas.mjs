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
//   · Que la foto que se guarda al cerrar la semana coja los números QUE LA
//     IA ACABA DE JUZGAR y no unos recalculados después.
//   · Que lo que no se sabe viaje como null y NO como cero. Un cero dice
//     «comió cero gramos de proteína», que es una afirmación, no un hueco.
//   · Que la LISTA diga de qué semana a qué semana, y que una fila vieja no
//     la reviente ni le haga inventarse nada.
//
// LO QUE YA NO SE PRUEBA AQUÍ, y por qué. Había cuatro secciones sobre los
// recuadros de peso, comida, proteína y gym —que el peso se coloreara según
// el objetivo, que la proteína fuera el único rojo, que el gym distinguiera
// «no fue» de «fue y no progresó»—. Esos recuadros se quitaron a petición:
// leían SOLO lo guardado en la fila, y las semanas anteriores a la 0054 no
// tienen nada guardado, así que la pantalla era una columna de guiones de
// arriba abajo. Cuatro huecos no informan de nada y ocupaban el sitio de lo
// único que la lista tiene que hacer, que es dejarte encontrar una semana.
//
// Lo que había dentro está ahora en su tarjeta, que además sabe
// reconstruirlo de los apuntes cuando la fila está vacía. Se prueba en
// tarjeta-de-la-semana.

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
  'function escapar(t){', 'function isoDe(d){', 'function rangoDeSemana(iso){',
  'function semanaQueJuzga(f){', 'function rangoCorto(iso){',
  'function pintarMisSemanas(){',
].map(sacar).join('\n');

const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function pinta(filas) {
  let puesto = '';
  const doc = { getElementById: () => ({ set innerHTML(v) { puesto = v; } }) };
  new Function('MESES_LARGO', 'SEMANAS', 'document',
    fuente + '\npintarMisSemanas();')(MESES_LARGO, filas, doc);
  return puesto;
}

// La clave es la del 25 PORQUE ASÍ SE GUARDA: el cierre salta cuando arranca
// la semana nueva y juzga la que acaba de terminar, pero la fila se guarda
// con la clave de la que EMPIEZA. O sea que esta fila habla del 18 al 24.
// Ver `semanaQueJuzga` y tarjeta-de-la-semana.
const SEMANA_BUENA = {
  semana: '2026-08-25', dias_apuntados: 7, media_cal: 2380, cal_antes: 2451,
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
     'guardar 0 dice «comió cero gramos». Salió: ' + JSON.stringify(r));
  ok(r.volumen === null, 'y sin entreno el volumen falta');
  ok(r.dias_apuntados === 0, 'pero los días apuntados sí son cero de verdad',
     'ahí el cero SÍ es un dato: apuntó cero días');

  const r2 = f({}, [], { sesiones: 0, volumen: 0, volumen_antes: 0 });
  ok(r2.sesiones === 0, 'y las sesiones a cero también son un dato',
     'salió ' + r2.sesiones + ': «no fue» es justo lo que hay que poder ver');
}

// ------------------------------------------------------------------
console.log('\nLa lista dice de qué semana a qué semana');
{
  const html = pinta([SEMANA_BUENA]);
  ok(/del 18 al 24 de agosto/.test(html),
     'el rango entero, no solo el día en que empieza',
     '«Semana del 18 ago» no dice hasta cuándo llega. Salió: ' +
     (html.match(/Semana[^<]*/) || ['(nada)'])[0]);
  ok(/7 de 7 días/.test(html), 'y cuántos días apuntó',
     'es lo que da o quita valor a lo que hay dentro');
  ok(/data-sem="0"/.test(html), 'y la fila es tocable, que es lo que abre la tarjeta',
     'sin `data-sem` el toque no encuentra a qué semana se refiere');
  ok(!/NaN|undefined/.test(html), 'sin NaN ni undefined');
}

console.log('\nY una semana que cruza de mes nombra los dos');
{
  // Con un solo mes se lee como si empezara y acabara en el mismo.
  const cruza = Object.assign({}, SEMANA_BUENA, { semana: '2026-09-07' });
  const html = pinta([cruza]);
  ok(/del 31 de agosto al 6 de septiembre/.test(html),
     '«del 31 de agosto al 6 de septiembre»',
     'salió: ' + (html.match(/Semana[^<]*/) || ['(nada)'])[0]);
}

console.log('\nUna fila vieja no revienta ni inventa nada');
{
  const vieja = { semana: '2026-07-28', dias_apuntados: null, media_cal: null,
                  cal_antes: 2451, media_p: null, meta_p: null, peso_medio: null,
                  peso_medio_antes: null, volumen: null, sesiones: null, cintura: null };
  let html = '';
  try { html = pinta([vieja]); } catch (e) { html = 'REVENTO: ' + e.message; }
  ok(!/REVENTO/.test(html), 'se pinta', html.slice(0, 160));
  ok(/del 21 al 27 de julio/.test(html), 'con su rango, que no depende de lo guardado',
     'salió: ' + (html.match(/Semana[^<]*/) || ['(nada)'])[0]);
  ok(!/\d+ de 7 días/.test(html), 'y sin inventarse los días que no tiene',
     'un «0 de 7 días» afirma que no apuntó nada; el hueco dice que no se sabe');
  ok(!/NaN|undefined|null/.test(html), 'y sin NaN ni undefined a la vista',
     html.slice(0, 300));
}

console.log('\nLa lista es solo lista');
{
  // Si vuelve a llevar el detalle dentro, hay dos sitios que dicen lo mismo y
  // se separan. Lo de dentro va en la tarjeta.
  const dos = [SEMANA_BUENA, Object.assign({}, SEMANA_BUENA, { semana: '2026-08-18' })];
  const html = pinta(dos);
  ok(!/sem-mas|sem-celda/.test(html), 'no despliega ningún detalle ni recuadros');
  ok(!/Carbohidratos/.test(html), 'ni enseña los macros uno a uno',
     'eso es lo que va en la tarjeta; repetirlo aquí son dos verdades que se separan');
  ok((html.match(/data-sem="/g) || []).length === 2, 'y cada semana es tocable');
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
  ok(/data-push="ejercicio"[^>]*>[\s\S]{0,120}?Progreso/.test(HTML),
     'y a Progreso se llega desde el Diario',
     'sin ese botón, «Mis semanas» queda enterrado en una vista inalcanzable');

  // Y LA HOJA DE LA TARJETA VA FUERA DE LA VISTA. Una hoja anidada en una
  // vista se abre midiendo 0×0 desde cualquier otra pantalla, sin un solo
  // error. Ya pasó dos veces.
  const dentro = HTML.slice(HTML.indexOf('data-view="missemanas"'),
                            HTML.indexOf('data-view=', HTML.indexOf('data-view="missemanas"') + 10));
  ok(!/sheet-backdrop/.test(dentro), 'no hay ninguna hoja dentro de la vista');
  ok(/id="semanaSheet"/.test(HTML), 'y la de la tarjeta existe, fuera de ella');
}

console.log('\nY el estilo existe');
{
  for (const c of ['.sem-card', '.sem-sola', '.sem-ir', '.fila-ir'])
    ok(CSS.includes(c + '{') || CSS.includes(c + ' '), 'hay estilo para ' + c);
  // Se fueron con lo que estilaban. El CSS de algo que se borra se borra: si
  // no, queda ahí para siempre y nadie se atreve a tocarlo.
  ok(!CSS.includes('.sem-mas'), 'y el del desplegable se fue con él');
  ok(!CSS.includes('.sem-celda') && !CSS.includes('.sem-rejilla'),
     'y el de los recuadros, también');
  ok(/overflow-wrap:anywhere/.test(CSS),
     'y el texto largo parte las palabras',
     'lo escribe una persona y lo escribe una IA: las dos pueden traer un ' +
     'enlace o una palabra sin espacios');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
