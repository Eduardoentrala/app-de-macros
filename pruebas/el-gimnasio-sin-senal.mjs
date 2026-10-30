// Sin señal no se pierde el entrenamiento.
//
// El gimnasio es donde el teléfono peor señal tiene y donde más se usa
// esta pantalla. Y hasta ahora «Guardar sesión» era de lo poco que NO se
// encolaba: fallaba, se deshacía todo lo de la pantalla —las palomitas, la
// racha, las gráficas— y si cerrabas la app el entrenamiento entero se
// había perdido. Una hora de trabajo.
//
// La comida se encola desde siempre. La sesión no, y es la única cosa de
// la app que te puede costar eso.
//
// LO QUE TIENE DE ESPECIAL, y por lo que no bastaba con llamar a
// `encolar()`: una comida es un alta y ya —dos altas iguales son dos
// comidas, y eso es lo que pasó—. Una sesión no: si ese día y ese día de
// rutina ya tienen fila, mandar otra DUPLICA el volumen. Ese fallo ya se
// arregló una vez, mirando antes de guardar... y sin señal no se puede
// mirar.
//
// Así que la pregunta se aplaza con el envío: el item guarda cómo
// buscarse, y se busca al subir, que es cuando por fin hay red.

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

function sacar(cab) {
  const i = APP.indexOf(cab);
  if (i < 0) throw new Error('no encuentro: ' + cab);
  let n = 0, j = APP.indexOf('{', i);
  for (; j < APP.length; j++) {
    if (APP[j] === '{') n++;
    else if (APP[j] === '}') { n--; if (!n) return APP.slice(i, j + 1); }
  }
  throw new Error('llaves sin cerrar en ' + cab);
}

// ------------------------------------------------------------------
console.log('\nSin señal se encola en vez de deshacerse');
{
  const guardar = sacar('function guardarSesionAhora(opciones){');
  // Y ahora tambien aplaza cuando no pudo PREGUNTAR si ya habia fila:
  // insertar a ciegas es lo que dejaba dos filas del mismo dia.
  const iQueue = guardar.indexOf('if(e === APLAZAR || sinConexion(e) || esperaMejorMomento(e))');
  const iDeshacer = guardar.indexOf('delete SESIONES[fecha];', iQueue > 0 ? iQueue : 0);

  ok(iQueue > 0, 'el fallo de red, el aplazado y el rechazo son tres cosas',
     'un «no hay red» y un «ese dato no vale» son cosas opuestas y se trataban igual');
  ok(iQueue > 0 && iDeshacer > iQueue, 'y se encola ANTES de deshacer nada',
     'la sesión cuenta desde ya, igual que la comida apuntada sin señal');
  ok(/encolar\(\{[\s\S]{0,400}?ruta: '\/rest\/v1\/workout_sessions'/.test(guardar),
     'se encola la fila de la sesión');
  ok(/buscar: busca/.test(guardar), 'y con CÓMO buscarse',
     'sin eso, subir la cola crea otra fila y duplica el volumen del día: el ' +
     'mismo fallo que ya se arregló mirando antes de guardar');
  ok(/clave: 'sesion:' \+ fecha \+ ':' \+ \(diaId \|\| ''\)/.test(guardar),
     'una por día y día de rutina',
     'volver a darle al botón sin señal reemplaza la que esperaba; dos días ' +
     'de rutina distintos el mismo día siguen siendo dos');
  ok(/pararCrono\(\);\n        toast\('toastRutina', 'Sesión guardada · se sube/.test(guardar),
     'el cronómetro se para y se dice la verdad',
     '«Sesión guardada» a secas sería mentir a medias; callarlo, del todo');
  ok(/return;\n      \}/.test(guardar.slice(iQueue)), 'y no se sigue al camino de deshacer');
}

// ------------------------------------------------------------------
console.log('\nY al subir, pregunta antes de insertar');
{
  // EJECUTADO. El envío de la cola, con `sbFetch` de mentira.
  const siguiente = sacar('    function siguiente(){');
  const hacer = (hayFila, conBuscar) => {
    const llamadas = [];
    const fn = new Function('llamadas', 'hayFila',
      'var subidos = 0, rechazados = 0;' +
      'var COLA = [' + (conBuscar
        ? "{ ruta:'/rest/v1/workout_sessions', buscar:'/rest/v1/workout_sessions?select=id&x', " +
          "dueno:'u1', op:{ method:'POST', headers:{}, body:'{\"total_volume\":900}' } }"
        : "{ ruta:'/rest/v1/diary_entries', dueno:'u1', op:{ method:'POST', body:'{}' } }") + '];' +
      'var yo = "u1";' +
      'function colaGuardar(){}' +
      'function sinConexion(){ return false; }' +
      'function esperaMejorMomento(){ return false; }' +
      'function sbFetch(ruta, op){ llamadas.push((op && op.method || "GET") + " " + ruta);' +
      '  if(/select=id/.test(ruta)) return Promise.resolve(hayFila ? [{ id:"s9" }] : []);' +
      '  return Promise.resolve(null); }' +
      siguiente + '\n' +
      'return siguiente().then(function(){ return { llamadas: llamadas, subidos: subidos }; });'
    )(llamadas, hayFila);
    return fn;
  };

  const nueva = await hacer(false, true);
  ok(/GET \/rest\/v1\/workout_sessions\?select=id/.test(nueva.llamadas[0]),
     'primero busca si ya había sesión ese día');
  ok(/POST \/rest\/v1\/workout_sessions$/.test(nueva.llamadas[1]),
     'y si no la había, la inserta', nueva.llamadas.join(' | '));
  ok(nueva.subidos === 1, 'y cuenta como subida');

  const repetida = await hacer(true, true);
  ok(/PATCH \/rest\/v1\/workout_sessions\?id=eq\.s9&user_id=eq\.u1/.test(repetida.llamadas[1]),
     'y si YA la había, la actualiza en vez de duplicarla',
     repetida.llamadas.join(' | ') + '\n         insertar otra duplica el ' +
     'volumen del día, que es el fallo que ya se arregló una vez');
  ok(!repetida.llamadas.some((l) => /^POST/.test(l)), 'sin insertar nada');

  // Y lo de siempre sigue yendo derecho: una comida no necesita preguntar.
  const comida = await hacer(false, false);
  ok(comida.llamadas.length === 1 && /POST \/rest\/v1\/diary_entries/.test(comida.llamadas[0]),
     'lo que no lleva `buscar` se manda de una, como siempre',
     'preguntar por cada apunte sería un viaje de más por comida');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
