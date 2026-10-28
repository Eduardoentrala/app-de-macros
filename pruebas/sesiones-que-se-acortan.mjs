// Media hora menos en el gimnasio, semana tras semana.
//
// Las veces y el volumen no distinguen «entrenó igual» de «entrenó las
// mismas veces pero a medias». Y lo segundo es una señal temprana: la
// sesión se acorta antes de que se note en el peso o en la encuesta.
//
// `workout_sessions.duration_min` existe desde la 0001 y no la llenaba
// nadie. Ahora hay cronómetro, así que hay dato, y el cierre del lunes
// puede verlo.
//
// LO DELICADO NO ES LA MEDIA, ES CUÁNDO CALLARSE:
//
//   · El dato es NUEVO. Casi todas las sesiones guardadas no lo tienen, y
//     contar un null como cero diría «entrenó cero minutos», que es una
//     afirmación y no un hueco. Es el mismo fallo que ya se pagó con los
//     macros.
//   · Una sola tarde corta no es una tendencia. Con menos de dos sesiones
//     cronometradas no se manda nada.
//   · Y una sesión cerrada sola a las dos horas marca 120 SIEMPRE, se
//     siguiera entrenando o se hubiera olvidado el botón. Ese número no
//     significa nada, así que esas van sin duración.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const FN = readFileSync(join(RAIZ, 'supabase', 'functions', 'asistente', 'index.ts'), 'utf8')
  .replace(/\r\n/g, '\n');
const MIG = readFileSync(join(RAIZ, 'supabase', 'migrations', '0001_esquema_base.sql'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

function sacar(txt, cab) {
  const i = txt.indexOf(cab);
  if (i < 0) throw new Error('no encuentro: ' + cab);
  let n = 0, j = txt.indexOf('{', i);
  for (; j < txt.length; j++) {
    if (txt[j] === '{') n++;
    else if (txt[j] === '}') { n--; if (!n) return txt.slice(i, j + 1); }
  }
  throw new Error('llaves sin cerrar en ' + cab);
}

// ------------------------------------------------------------------
console.log('\nSe pide a la base y cabe en su columna');
{
  ok(/select=session_date,total_volume,exercises,duration_min/.test(APP),
     'la consulta del cierre trae la duración',
     'sin pedirla no llega, por mucho que esté guardada');
  const rango = MIG.match(/duration_min\s+int check \(duration_min is null or duration_min between (\d+) and (\d+)\)/);
  ok(!!rango, 'la columna existe con su rango', 'si cambia, el acotado del guardado sobra o falta');
  const g = sacar(APP, 'function guardarSesionAhora(opciones){');
  ok(rango && new RegExp('Math\\.min\\(' + rango[2] + ', Math\\.max\\(' + rango[1] + ',').test(g),
     `y el guardado se acota a ese rango (${rango && rango[1]}–${rango && rango[2]})`,
     'fuera de rango no falla ese campo: falla la fila entera y la sesión no ' +
     'se guarda');
}

// ------------------------------------------------------------------
console.log('\nUna sesión cerrada sola NO inventa duración');
{
  const cerrar = sacar(APP, 'function cerrarSesionSola(seg){');
  ok(/minutos: null, sola: true/.test(cerrar),
     'va sin duración',
     'ese cierre salta SIEMPRE a las dos horas en punto, se siguiera ' +
     'entrenando o se hubiera olvidado el botón: 120 sería mentira en uno ' +
     'de los dos casos, y ahora la duración ya no es decoración');
  ok(!/var minutos = Math\.round\(seg \/ 60\);/.test(cerrar),
     'y ni siquiera se calcula',
     'dejarlo calculado invita a volver a mandarlo');
}

// ------------------------------------------------------------------
console.log('\nLa media se hace con lo que hay, o no se hace');
{
  // EJECUTADO: el agregado real, con el `forEach` y la `media` del código.
  const cuerpo = (() => {
    const i = APP.indexOf('        var estaSemana = [], anterior = [];');
    const f = APP.indexOf('        // Y las cuatro semanas por separado', i);
    return APP.slice(i, f);
  })();
  ok(cuerpo.length > 400, 'se encuentra el agregado', cuerpo.length + ' caracteres');

  const correr = (filas) => new Function('filas', 'corte', 'finCerrada',
    cuerpo + '\n return { minEsta: minEsta, minAntes: minAntes, ' +
    'mediaEsta: media(minEsta), mediaAntes: media(minAntes) };'
  )(filas, '2026-10-20', '2026-10-27');

  const s = (fecha, vol, min) => ({ session_date: fecha, total_volume: vol, duration_min: min });

  // Cuatro sesiones cronometradas esta semana, cuatro la anterior.
  const lleno = correr([
    s('2026-10-13', 1000, 60), s('2026-10-15', 1000, 58),
    s('2026-10-21', 1000, 32), s('2026-10-23', 1000, 28),
  ]);
  ok(lleno.mediaEsta === 30 && lleno.mediaAntes === 59,
     'con datos en las dos semanas, sale la media de cada una',
     JSON.stringify([lleno.mediaEsta, lleno.mediaAntes]));

  // Lo normal HOY: la columna es nueva y casi nada la tiene.
  const sinDato = correr([
    s('2026-10-13', 1000, null), s('2026-10-15', 1000, null),
    s('2026-10-21', 1000, null), s('2026-10-23', 1000, null),
  ]);
  ok(sinDato.mediaEsta === null && sinDato.mediaAntes === null,
     'y sin el dato, null y no cero',
     'un cero diría «entrenó cero minutos», que es una afirmación y no un ' +
     'hueco: el mismo fallo que ya se pagó con los macros');

  const unaSola = correr([
    s('2026-10-13', 1000, 60), s('2026-10-15', 1000, 58),
    s('2026-10-21', 1000, 25), s('2026-10-23', 1000, null),
  ]);
  ok(unaSola.mediaEsta === null && unaSola.mediaAntes === 59,
     'y con una sola sesión cronometrada, tampoco',
     'una tarde corta no es una tendencia; mandarla como «duración de la ' +
     'semana» invita a leerla como si lo fuera. Salió ' + unaSola.mediaEsta);

  const cero = correr([s('2026-10-21', 1000, 0), s('2026-10-23', 1000, 0)]);
  ok(cero.minEsta.length === 0,
     'y un cero guardado no cuenta como sesión cronometrada',
     'cero minutos no es un entrenamiento, es un dato roto');

  // La semana en curso no entra: lo que se cierra es la anterior.
  const enCurso = correr([
    s('2026-10-21', 1000, 40), s('2026-10-23', 1000, 40),
    s('2026-10-28', 1000, 5), s('2026-10-29', 1000, 5),
  ]);
  ok(enCurso.mediaEsta === 40,
     'y las sesiones de la semana en curso se quedan fuera',
     'salió ' + enCurso.mediaEsta + ': el cierre juzga la semana que acabó');
}

// ------------------------------------------------------------------
console.log('\nY al modelo solo le llega si de verdad se sabe');
{
  ok(/minutos: media\(minEsta\)/.test(APP) && /minutos_antes: media\(minAntes\)/.test(APP),
     'la app manda las dos medias');
  ok(/const duracion = \(e && e\.minutos != null && e\.minutos_antes != null\)/.test(FN),
     'y el servidor solo escribe la línea si tiene las DOS',
     'con una sola no hay comparación: «40 min esta semana» a secas no dice ' +
     'si es mucho o poco para esta persona');
  ok(/- Duración media: \$\{e\.minutos\} min por sesión esta semana/.test(FN),
     'y se dice en minutos por sesión, no en total',
     'el total sube solo por entrenar más días, que ya se cuenta aparte');
}

// ------------------------------------------------------------------
console.log('\nY el prompt sabe leerlo, incluido el caso al revés');
{
  ok(/Y CUÁNTO DURÓ CADA SESIÓN, si te paso la duración media\./.test(FN),
     'tiene su regla, dentro de la del entreno');
  ok(/Duración bastante más corta Y volumen abajo → está rindiendo menos/.test(FN),
     'el caso de fatiga');
  ok(/Mira el sueño y el hambre antes de tocar calorías/.test(FN),
     'y manda mirar el sueño primero',
     'dormir mal da las mismas señales que un déficit excesivo, y son ' +
     'problemas opuestos: esa regla ya existe arriba y esta no puede ' +
     'contradecirla');
  ok(/Más corta pero el volumen IGUAL O MEJOR → eso no es fatiga/.test(FN),
     'y el caso contrario, que es el que se leería mal',
     'quien aprieta el descanso entre series entrena menos tiempo y MEJOR: ' +
     'regañarle por eso es castigar justo lo que hay que premiar');
  ok(/Más larga y el volumen igual → está tardando más en lo mismo/.test(FN),
     'y el de alargarse sin rendir más');
  ok(/NO LO MENCIONES SI NO TE LO PASO/.test(FN),
     'y tiene prohibido hablar de lo que no recibe',
     'al principio esto va a llegar vacío casi siempre');
  ok(/no lo conviertas en el motivo del\n   ajuste/.test(FN),
     'y que no sea el motivo del ajuste',
     'es una pista para mirar en la dirección correcta, no una medición');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
