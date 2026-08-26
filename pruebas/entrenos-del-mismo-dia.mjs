// Dos entrenos el mismo día son un día, no dos.
//
// `workout_sessions` no tiene nada que impida dos filas con la misma fecha,
// y «Guardar sesión» hace un POST plano cada vez que se pulsa: no es un
// upsert. Guardar dos veces un martes —o darle dos veces al botón sin
// querer— deja dos filas.
//
// Y ahí se separaban dos cosas que tienen que decir lo mismo:
//
//   el anillo de Progreso cuenta DÍAS con sesión  →  «1 día de fuerza»
//   el cierre semanal contaba FILAS               →  «entrenó 2 veces»
//
// La IA leía el doble de entrenos de los que hubo, y su regla más cara
// —«peso plano y entrenó poco → le falta estímulo, no calorías»— se apoya
// justo en ese número.
//
// El volumen es al revés y a propósito: suma TODAS las filas. Si entrenó
// dos veces ese día, las dos cuentan como trabajo hecho.
//
// De paso, contar días hace que «veces» no pueda pasar de 7, que es lo que
// acepta la columna `sesiones` de la 0054.

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

const isoDe = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
                     '-' + String(d.getDate()).padStart(2, '0');
const ancla = new Date('2026-08-25T12:00:00');       // su semana empieza el martes
const dia = (n) => { const d = new Date(ancla); d.setDate(d.getDate() + n); return d; };

// Se ejecuta `datosDeEntreno()` de verdad, con un `sbFetch` de mentira que
// devuelve las filas que se le den.
function correr(filas, reg = { dias: 4 }) {
  const sbFetch = () => Promise.resolve(filas);
  // SIN el `catch` que devuelve null. Con él puesto, cualquier error dentro
  // de la función —un dato que falta en el banco de pruebas, por ejemplo—
  // se convierte en un `null` silencioso y las comprobaciones de abajo
  // fallan diciendo cosas que no tienen nada que ver. En la app ese catch
  // hace falta; aquí estorba y esconde.
  const src = sacar('function datosDeEntreno(){')
    .replace(/\['catch'\]\(function\(\)\{ return null; \}\)/, '');
  const f = new Function('sbFetch', 'sesion', 'anclaSemana', 'isoDe', 'reg', 'Date', 'Object',
    src + '; return datosDeEntreno();');
  return f(sbFetch, { user: { id: 'u1' } }, ancla, isoDe, reg, Date, Object);
}

const fila = (offset, vol) => ({
  session_date: isoDe(dia(offset)), total_volume: vol, exercises: [],
});

// ------------------------------------------------------------------
console.log('\nDos filas del mismo día cuentan como un día');
{
  // La semana que cierra son los siete días ANTES del ancla.
  const r = await correr([
    fila(-7, 5000), fila(-7, 4000),     // martes: guardó dos veces
    fila(-5, 6000),                     // jueves
    fila(-3, 6500),                     // sábado
  ]);
  ok(r.sesiones === 3, 'tres días, aunque haya cuatro filas',
     'salió ' + r.sesiones + ': contando filas, la IA lee el doble de ' +
     'entrenos de los que hubo, y el anillo de Progreso dice otra cosa');
  ok(r.volumen === 21500, 'y el volumen suma las cuatro',
     'salió ' + r.volumen + ': si entrenó dos veces ese día, las dos cuentan');
}

console.log('\nY lo mismo en la semana anterior, que es contra la que se compara');
{
  const r = await correr([
    fila(-14, 3000), fila(-14, 3000), fila(-14, 3000),   // un solo día, tres filas
    fila(-7, 5000),
  ]);
  ok(r.sesiones_antes === 1, 'un día, aunque haya tres filas',
     'salió ' + r.sesiones_antes + ': con esto inflado, «entrenó menos que la ' +
     'semana pasada» sale al revés');
  ok(r.volumen_antes === 9000, 'y su volumen suma las tres');
}

console.log('\nY nunca puede pasar de siete');
{
  // Cuatro entrenos al día durante los siete días: 28 filas.
  const filas = [];
  for (let d = -7; d <= -1; d++) for (let k = 0; k < 4; k++) filas.push(fila(d, 1000));
  const r = await correr(filas);
  ok(r.sesiones === 7, 'veintiocho filas son siete días',
     'salió ' + r.sesiones + ', y la columna `sesiones` de la 0054 solo ' +
     'acepta hasta 21: por encima, el chequeo entero deja de guardarse');
  ok(r.volumen === 28000, 'con todo su volumen');
}

console.log('\nY una semana normal no cambia');
{
  const r = await correr([fila(-7, 5000), fila(-5, 6000), fila(-3, 6500), fila(-2, 4000)]);
  ok(r.sesiones === 4, 'cuatro días, cuatro sesiones');
  ok(r.volumen === 21500, 'y su volumen');
}

console.log('\nY la semana en curso sigue sin contarse');
{
  // El ancla y lo que viene después es la semana NUEVA: al cerrar el lunes
  // todavía no tiene nada que juzgar.
  const r = await correr([fila(-7, 5000), fila(0, 9000), fila(1, 9000)]);
  ok(r.sesiones === 1, 'solo el de la semana cerrada',
     'salió ' + r.sesiones + ': la semana nueva no se juzga');
  ok(r.volumen === 5000, 'y solo su volumen');
}

console.log('\nY la tendencia de cuatro semanas cuenta igual');
{
  const r = await correr([
    fila(-28, 1000), fila(-28, 1000),   // un día, dos filas
    fila(-27, 1000),
    fila(-7, 5000),
  ]);
  const mas_vieja = r.por_semana[0];
  ok(mas_vieja.sesiones === 2, 'dos días en la más vieja, no tres filas',
     'salió ' + mas_vieja.sesiones + ': la tendencia es lo que distingue una ' +
     'descarga de un estancamiento, y con las filas infladas se lee mal');
  ok(mas_vieja.volumen === 3000, 'con su volumen entero');
}

console.log('\nY sin ninguna sesión no revienta');
{
  const r = await correr([]);
  ok(r.sesiones === 0 && r.sesiones_antes === 0, 'cero y cero');
  ok(r.volumen === 0, 'y cero volumen');
  ok(Array.isArray(r.por_semana) && r.por_semana.length === 4, 'con sus cuatro semanas');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
