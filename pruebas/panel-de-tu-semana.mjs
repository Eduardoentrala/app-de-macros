// El panel de «Tu semana» contaba mal y regañaba sin motivo.
//
// Es la pantalla a la que se llega con «📈 Progreso» desde el Diario: un
// anillo, un número grande de días de fuerza y la tabla de los siete días.
//
// CINCO COSAS, y las dos primeras le decían a la persona que iba mal
// cuando iba perfecta:
//
//  1. EL ANILLO SE MEDÍA CONTRA 7. Nadie entrena siete días. Quien dijo al
//     registrarse que entrena cuatro y entrenó los cuatro veía el anillo a
//     poco más de la mitad y un «4 días de fuerza de 7». Su semana era
//     perfecta y la pantalla la pintaba a medias. El dato bueno —`reg.dias`,
//     los días que dijo que entrena— ya estaba cargado y se usa para
//     calcular sus calorías; aquí simplemente no se miraba.
//
//  2. UN DÍA QUE NO HA LLEGADO SE PINTABA COMO UN DÍA FALLADO. La función
//     calculaba `esFuturo` y no lo usaba para nada —una sola aparición en
//     todo el archivo, señal de una intención a medio escribir—. El martes,
//     con la semana recién empezada, cinco filas decían «—» exactamente
//     igual que un día saltado.
//
//  3. EL ANILLO SE PASABA DE VUELTA. `182 - 182*(hechos/meta)` se vuelve
//     negativo en cuanto se entrena más de lo previsto, y el trazo se
//     dibuja al revés. Entrenar de más no puede romper la pantalla.
//
//  4. «Día 1», «Día 2»… La semana de cada quien empieza un día distinto,
//     así que «Día 1» no dice nada; para saber cuál fue el sábado había que
//     mirar la fecha y contar.
//
//  5. Y EL RÓTULO «de 7» ESTABA ESCRITO EN EL HTML, así que aunque el
//     número de arriba se arreglara, debajo seguía poniendo «de 7».

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8').replace(/\r\n/g, '\n');

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

const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
                   '-' + String(d.getDate()).padStart(2, '0');
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fmtFecha = (d) => d.getDate() + ' ' + MESES[d.getMonth()];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
// La de verdad, sacada de app.js: el nombre del día sale de una lista fija,
// pero si mañana saliera de otro sitio esto seguiría escapándolo.
const escapar = new Function('return ' + sacar('function escapar(t){'))();

// Se pinta de verdad y se recoge lo que pone en cada hueco.
// `reg` aparte de `dias` a propósito: con solo `dias = 4`, pasarle
// `undefined` activaba ESE valor por defecto y el caso «no se sabe cuántos
// días entrena» nunca llegaba a la función. Pasaba en verde sin probarlo.
function pintar({ sesiones = {}, dias = 4, ancla, hoy, reg }) {
  const puesto = {};
  const doc = {
    getElementById: (id) => ({
      set innerHTML(v) { puesto[id] = v; },
      set textContent(v) { puesto[id] = v; },
      setAttribute(a, v) { puesto[id + ':' + a] = v; },
    }),
  };
  const f = new Function('document', 'SESIONES', 'anclaSemana', 'HOY', 'iso', 'fmtFecha',
    'DIAS', 'reg', 'escapar', 'Date',
    sacar('function pintarEjercicio(){') + '; pintarEjercicio();');
  // `=== undefined` y no `||`: con `||`, pasarle `reg: null` —el primer
  // arranque, antes de que la carga del perfil conteste— caía en el
  // respaldo de aquí y ese caso no llegaba nunca a la función.
  f(doc, sesiones, ancla, hoy, iso, fmtFecha, DIAS,
    reg === undefined ? { dias } : reg, escapar, Date);
  return puesto;
}

// Su semana empieza el martes.
const ancla = new Date('2026-08-25T12:00:00');          // martes
const dia = (n) => { const d = new Date(ancla); d.setDate(d.getDate() + n); return d; };

// ------------------------------------------------------------------
console.log('\nEl anillo se mide contra los días que dijo que entrena');
{
  // Entrena cuatro y fue los cuatro: la semana es perfecta.
  const ses = {};
  for (const n of [0, 1, 3, 4]) ses[iso(dia(n))] = true;
  const r = pintar({ sesiones: ses, dias: 4, ancla, hoy: dia(6) });

  ok(r.ejDias === 4 || r.ejDias === '4', 'cuenta los cuatro días',
     'salió ' + r.ejDias);
  ok(Number(r['ejRing:stroke-dashoffset']) === 0,
     'y el anillo se cierra entero',
     'salió ' + r['ejRing:stroke-dashoffset'] + ': midiéndolo contra 7 se ' +
     'queda a poco más de la mitad y una semana perfecta parece a medias');
  ok(String(r.ejMeta) === '4', 'y el rótulo dice «de 4», no «de 7»',
     'dice: ' + r.ejMeta);
}

console.log('\nY entrenar de más no rompe el anillo');
{
  const ses = {};
  for (const n of [0, 1, 2, 3, 4, 5]) ses[iso(dia(n))] = true;   // seis, dijo cuatro
  const r = pintar({ sesiones: ses, dias: 4, ancla, hoy: dia(6) });
  const off = Number(r['ejRing:stroke-dashoffset']);
  ok(off >= 0, 'el trazo no se va a negativo',
     'salió ' + off + ': el anillo se dibuja al revés');
  ok(off === 0, 'y se queda cerrado del todo');
  ok(Number(r.ejDias) === 6, 'pero el número enseña los seis que hizo',
     'salió ' + r.ejDias + ': lo de más también cuenta, no se recorta');
}

console.log('\nUn día que todavía no ha llegado no es un día fallado');
{
  // Segundo día de la semana. Fue ayer, hoy todavía no.
  const ses = { [iso(dia(0))]: true };
  const r = pintar({ sesiones: ses, dias: 4, ancla, hoy: dia(1) });
  const filas = r.ejFilas || '';

  const cuantos = (re) => (filas.match(re) || []).length;
  ok(cuantos(/pill-si/g) === 1, 'el día que entrenó sale como hecho');
  ok(cuantos(/pill-futuro/g) === 5, 'los cinco que no han llegado salen aparte',
     'salieron ' + cuantos(/pill-futuro/g) + ': sin distinguirlos, el martes ' +
     'la pantalla enseña cinco «—» que se leen como cinco días saltados');
  // Y el que SÍ pasó y no entrenó sigue saliendo como saltado.
  ok(cuantos(/pill-dash/g) === 1, 'y el que pasó sin entrenar sigue marcado',
     'salieron ' + cuantos(/pill-dash/g) + ': si se pierde esto, no queda ' +
     'forma de ver un día saltado');
}

console.log('\nY el último día de la semana no se cuenta como futuro');
{
  // El borde: hoy es el séptimo día. Ninguno es futuro.
  const r = pintar({ sesiones: {}, dias: 4, ancla, hoy: dia(6) });
  ok(!/pill-futuro/.test(r.ejFilas || ''), 'ninguno queda por llegar',
     'el día de hoy no puede contarse como futuro');
}

console.log('\nLa tabla dice qué día de la semana fue');
{
  const r = pintar({ sesiones: {}, dias: 4, ancla, hoy: dia(6) });
  const filas = r.ejFilas || '';
  ok(/martes/i.test(filas), 'el primero es martes, que es cuando empieza su semana',
     'sigue diciendo «Día 1», y con la semana empezando en martes eso no ' +
     'dice nada: para saber cuál fue el sábado hay que contar');
  ok(/s[áa]bado/i.test(filas), 'y el sábado se puede encontrar de un vistazo');
  ok(/25\/8/.test(filas), 'sin perder la fecha');
}

console.log('\nY hoy se sigue señalando');
{
  const r = pintar({ sesiones: {}, dias: 4, ancla, hoy: dia(2) });
  ok(/class="today"/.test(r.ejFilas || ''), 'la fila de hoy va marcada');
  ok(/hoy/.test(r.ejFilas || ''), 'y se dice');
}

console.log('\nSin saber cuántos días entrena, no se inventa un número raro');
{
  // Se le pasa el `reg` entero para que `undefined` llegue de verdad. Y el
  // caso «ni siquiera hay perfil» (`reg` nulo), que es el del primer
  // arranque, antes de que la carga conteste.
  for (const malo of [0, null, undefined, 99, -3, 'cuatro', 3.7]) {
    const r = pintar({ sesiones: {}, reg: { dias: malo }, ancla, hoy: dia(6) });
    const m = Number(r.ejMeta);
    ok(m >= 1 && m <= 7, 'con dias=' + malo + ' cae en algo entre 1 y 7 (' + m + ')',
       'una meta de 0 divide entre cero y el anillo sale NaN; una de 99 lo ' +
       'deja siempre vacío');
  }
  const r = pintar({ sesiones: {}, reg: { dias: 0 }, ancla, hoy: dia(6) });
  ok(!/NaN/.test(String(r['ejRing:stroke-dashoffset'])), 'y el anillo no sale NaN',
     'salió ' + r['ejRing:stroke-dashoffset'] + ': dividir entre cero');

  // Y sin perfil ninguno, que es el primer arranque antes de que la carga
  // conteste. `reg.dias` sobre un `reg` nulo revienta la pantalla entera.
  let sinPerfil = '(reventó)';
  try { sinPerfil = String(pintar({ sesiones: {}, reg: null, ancla, hoy: dia(6) }).ejMeta); }
  catch (e) { sinPerfil = 'REVENTÓ: ' + e.message; }
  ok(sinPerfil === '7', 'y sin perfil todavía cargado se enseña la semana entera',
     'salió «' + sinPerfil + '»');
}

console.log('\nY el rango de la semana sigue saliendo');
{
  const r = pintar({ sesiones: {}, dias: 4, ancla, hoy: dia(6) });
  ok(/25 ago/.test(r.ejWeekRange || '') && /31 ago/.test(r.ejWeekRange || ''),
     'del 25 al 31 de agosto', 'dice: ' + r.ejWeekRange);
}

// ------------------------------------------------------------------
console.log('\nY el rótulo de debajo ya no lleva el 7 escrito a mano');
{
  ok(/id="ejMeta"/.test(HTML), 'el rótulo tiene su hueco',
     'con el «de 7» escrito en el HTML, arreglar el número de arriba no ' +
     'sirve de nada: debajo sigue poniendo «de 7»');
  const i = HTML.indexOf('class="week-sub"');
  const linea = HTML.slice(i, HTML.indexOf('</div>', i));
  ok(!/de 7/.test(linea), 'y ya no dice «de 7» fijo', 'dice: ' + linea);
}

console.log('\nY hay estilo para el día que no ha llegado');
{
  const CSS = ['componentes.css', 'pantallas.css', 'vistas.css', 'diario.css']
    .map((f) => readFileSync(join(RAIZ, 'docs', 'estilos', f), 'utf8')).join('\n');
  // Con la llave pegada: `.pill-futuro` a secas también casa con
  // `.pill-futuro-no`, así que renombrar la regla dejaba pasar la
  // comprobación. Lo enseñó una mutación.
  ok(/\.pill-futuro\s*[,{]/.test(CSS), 'la píldora de «todavía no» tiene su estilo',
     'sin estilo sale como texto suelto y no se distingue de un día saltado');
  // Y que se distinga del día saltado. Vale por color propio o por
  // opacidad: hoy es lo segundo —media fuerza de la raya— porque un color
  // fijo daba 1.24:1 y no se veía en ninguno de los dos temas.
  const regla = (CSS.match(/\.pill-futuro\s*\{[^}]*\}/) || [''])[0];
  const dash = (CSS.match(/\.pill-dash\s*\{[^}]*\}/) || [''])[0];
  const color = (s) => (s.match(/(?:^|[;{])color:\s*([^;}]+)/) || [])[1];
  const opaco = (s) => Number((s.match(/opacity:\s*([\d.]+)/) || [])[1] ?? 1);
  ok(color(regla) !== color(dash) || opaco(regla) < opaco(dash),
     'y se lee más flojo que el día saltado',
     'mismo color («' + color(dash) + '») y misma opacidad: se vuelven a ' +
     'leer igual y el martes vuelven a parecer cinco días fallados');
  // Pero NO invisible. Media fuerza es el suelo: por debajo es un hueco.
  ok(opaco(regla) >= 0.35, 'sin llegar a ser invisible',
     'opacidad ' + opaco(regla) + ': un marcador que no se ve no distingue ' +
     'nada y parece un fallo de pintado');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
