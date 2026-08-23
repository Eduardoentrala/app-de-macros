// Guardar la rutina dos veces a la vez duplica el día.
//
// EL FALLO. El guardado va con 900 ms de retardo para no mandar una petición
// por tecla. Eso evita las ráfagas, pero no que dos guardados se SOLAPEN:
// con la red lenta, el anterior sigue en el aire cuando sale el siguiente.
//
// Y el id del día no existe hasta que vuelve el POST. Así que los dos leen
// `tab.dataset.id` vacío, los dos se creen el primero, y se insertan DOS
// filas en routine_days: el día entero repetido en la rutina. Igual con cada
// ejercicio nuevo dentro de él.
//
// Es fácil de provocar y no hace falta mala fe: crear un día, ponerle nombre
// -eso guarda por su cuenta, sin pasar por el retardo- y añadir un ejercicio
// antes de que conteste el servidor.
//
// EL SEGUNDO FALLO, que sale al arreglar el primero. Poner los guardados en
// fila obliga a decidir CUÁNDO se lee la pantalla. Si se lee cuando le toca
// el turno, para entonces puede estar enseñando otro día -se cambió de
// pestaña mientras subía- y se guardarían los ejercicios de ese otro día con
// el id del anterior. Se lee al pedir el turno, no al recibirlo.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

const hasta = (desde, fin) => {
  const i = APP.indexOf(desde);
  if (i < 0) throw new Error('no encuentro: ' + desde);
  return APP.slice(i, APP.indexOf(fin, i) + fin.length);
};

// Todo el bloque del guardado, de un corte: lo que se añada entre medias
// viene solo en vez de quedarse fuera y dar un ReferenceError.
const FUENTE = APP.slice(
  APP.indexOf('  function leerEjerciciosDelDOM(){'),
  APP.indexOf('  // ---- Cuándo se guarda ----'));

// ---- Un DOM de mentira, con lo justo que lee el guardado ----
const nodo = (clase, hijos = []) => {
  const n = {
    clase, hijos, dataset: {}, textContent: '',
    childNodes: [{ textContent: '' }],
    querySelectorAll(sel) {
      const q = sel.split(' ').pop();
      const out = [];
      (function hondo(x) {
        x.hijos.forEach((h) => { if (h.clase === q.replace('.', '')) out.push(h); hondo(h); });
      })(n);
      return out;
    },
    querySelector(sel) { return n.querySelectorAll(sel)[0] || null; },
  };
  return n;
};
const serie = (reps, peso, id) => {
  const tr = nodo('tr');
  tr.dataset.id = id || undefined;
  const a = nodo('set-input'), b = nodo('set-input');
  a.value = String(reps); b.value = String(peso);
  tr.hijos.push(a, b);
  return tr;
};
const ejercicio = (nombre, series, id) => {
  const card = nodo('exercise-card');
  if (id) card.dataset.id = id;
  const nom = nodo('ex-name');
  nom.childNodes = [{ textContent: nombre }];
  const tabla = nodo('sets-table');
  series.forEach((s) => tabla.hijos.push(s));
  card.hijos.push(nom, tabla);
  return card;
};

function montar(tarjetas, comoContesta) {
  const visto = { peticiones: [], cuerpos: [] };
  let sueltas = [];
  const sbFetch = (ruta, op) => {
    const metodo = (op && op.method) || 'GET';
    const tabla = ruta.split('?')[0].replace('/rest/v1/', '');
    visto.peticiones.push(metodo + ' ' + ruta.split('?')[0]);
    visto.cuerpos.push({
      metodo, tabla,
      datos: op && op.body ? JSON.parse(op.body) : null,
    });
    return new Promise((listo, falla) => {
      const contestar = () => {
        if (metodo === 'GET') return listo([]);
        const raro = comoContesta && comoContesta(tabla, metodo);
        if (raro === 'vacio') return listo([]);
        if (raro === 'falla') return falla(new Error('Error 500'));
        listo([{ id: 'id' + visto.peticiones.length }]);
      };
      sueltas.push(contestar);
    });
  };

  const exList = nodo('lista');
  tarjetas.forEach((t) => exList.hijos.push(t));
  const dayTabs = nodo('tabs');
  const tab = nodo('day-tab');
  tab.textContent = 'Empuje';
  dayTabs.hijos.push(tab);

  const caja = new Function('exList', 'dayTabs', 'sesion', 'sbFetch', 'Array', `
    ${FUENTE}
    return { guardarDia: guardarDia, leer: leerEjerciciosDelDOM };`)(
    exList, dayTabs, { user: { id: 'yo' } }, sbFetch, Array);

  return {
    visto, tab, exList,
    guardar: (t) => caja.guardarDia(t || tab),
    // Contesta todo lo que esté esperando, en oleadas.
    soltar: async () => {
      for (let i = 0; i < 12; i++) {
        const ahora = sueltas; sueltas = [];
        ahora.forEach((f) => f());
        await new Promise((r) => setImmediate(r));
      }
    },
    posts: (tabla) => visto.peticiones.filter((p) => p === 'POST /rest/v1/' + tabla).length,
  };
}

// ------------------------------------------------------------------
console.log('\nEl día no se puede crear dos veces');
{
  const m = montar([ejercicio('Press banca', [serie(10, 60)])]);

  // Dos guardados seguidos, sin que el servidor haya contestado al primero.
  // Es exactamente confirmar el nombre del día y tocar algo acto seguido.
  const a = m.guardar();
  const b = m.guardar();
  await m.soltar();
  await Promise.all([a, b]);

  ok(m.posts('routine_days') === 1,
     'solo se crea UNA vez el día',
     'se crearon ' + m.posts('routine_days') + ': el día sale repetido en la rutina');
  ok(m.tab.dataset.id, 'y el id queda apuntado en la pestaña');
  ok(m.posts('routine_exercises') === 1,
     'y el ejercicio nuevo, una sola vez',
     'se creó ' + m.posts('routine_exercises') + ' veces');
  ok(m.posts('exercise_sets') === 1,
     'y su serie, una sola vez',
     'se creó ' + m.posts('exercise_sets') + ' veces');
}

// ------------------------------------------------------------------
console.log('\nY el segundo guardado ya sabe que el día existe');
{
  const m = montar([ejercicio('Press banca', [serie(10, 60)])]);
  const a = m.guardar(); await m.soltar(); await a;
  const b = m.guardar(); await m.soltar(); await b;

  ok(m.posts('routine_days') === 1, 'no se vuelve a crear');
  ok(m.visto.peticiones.some((p) => p === 'PATCH /rest/v1/routine_days'),
     'se actualiza el que ya había');
}

// ------------------------------------------------------------------
console.log('\nSe lee la pantalla al PEDIR el turno, no al recibirlo');
{
  const m = montar([ejercicio('Press banca', [serie(10, 60)])]);
  const a = m.guardar();

  // Mientras sube, se cambia de día: la pantalla ya enseña otra cosa.
  m.exList.hijos.length = 0;
  m.exList.hijos.push(ejercicio('Sentadilla', [serie(8, 100)]));
  const b = m.guardar();

  await m.soltar();
  await Promise.all([a, b]);

  const nuevos = m.visto.cuerpos
    .filter((c) => c.tabla === 'routine_exercises' && c.metodo === 'POST')
    .map((c) => c.datos.name);

  ok(nuevos[0] === 'Press banca',
     'el primer guardado sube el press, que es lo que había cuando se pidió',
     'subió «' + nuevos[0] + '»: se guardaron los ejercicios del día que se ' +
     'estaba mirando después, con el id del anterior');
  ok(nuevos.indexOf('Sentadilla') > 0,
     'y el segundo sube la sentadilla, cada uno con lo suyo',
     JSON.stringify(nuevos));
  ok(nuevos.length === 2, 'ni uno más', JSON.stringify(nuevos));
}

// ------------------------------------------------------------------
console.log('\nY el id acaba en el ejercicio que se leyó, no en el que ocupe su sitio');
{
  // Entre que sale la petición y vuelve, la lista puede haberse reordenado.
  // Buscando por posición, el id del press acababa en la sentadilla: el
  // siguiente guardado le haría PATCH a la fila de otro.
  const press = ejercicio('Press banca', [serie(10, 60)]);
  const m = montar([press]);
  const a = m.guardar();

  const sentadilla = ejercicio('Sentadilla', [serie(8, 100)]);
  m.exList.hijos.unshift(sentadilla);          // se cuela por delante

  await m.soltar();
  await a;

  ok(press.dataset.id, 'el press se queda con su id', JSON.stringify(press.dataset));
  ok(!sentadilla.dataset.id,
     'y la sentadilla, que no se guardó, no se queda con el id de nadie',
     'le cayó el id del press: el próximo guardado le haría PATCH a la fila de otro');
}

// ------------------------------------------------------------------
console.log('\nUna respuesta sin la fila se dice, no se sigue a ciegas');
{
  // Si el servidor contesta 200 con la lista vacía, `r[0].id` era un
  // TypeError a media escritura: el guardado se quedaba por la mitad y en
  // pantalla no pasaba nada. Y de seguir, los ejercicios se irían con
  // routine_day_id undefined.
  const m = montar([ejercicio('Press banca', [serie(10, 60)])],
                   (tabla, metodo) => (tabla === 'routine_days' && metodo === 'POST' ? 'vacio' : null));
  const a = m.guardar();
  await m.soltar();
  const e = await a.then(() => null, (x) => x);

  ok(e !== null, 'el guardado falla en vez de seguir',
     'siguió: los ejercicios se irían con el día en blanco');
  ok(e && /no devolvió/.test(e.message),
     'y dice qué pasó, no un TypeError',
     'dijo: ' + (e && e.message));
  ok(m.posts('routine_exercises') === 0, 'y no se escribe nada colgando de nada');
}

// ------------------------------------------------------------------
console.log('\nY un guardado que falla no deja la fila rota para el siguiente');
{
  const sueltos = [];
  const oyente = (e) => sueltos.push(e);
  process.on('unhandledRejection', oyente);

  const m = montar([ejercicio('Press banca', [serie(10, 60)])],
                   (tabla, metodo) => (tabla === 'routine_days' && metodo === 'POST' ? 'falla' : null));
  const a = m.guardar();
  await m.soltar();
  await a.catch(() => {});
  await new Promise((r) => setImmediate(r));
  process.off('unhandledRejection', oyente);

  ok(sueltos.length === 0,
     'el fallo no queda suelto en la promesa que hace de fila',
     'quedó una promesa rechazada sin recoger: en el navegador eso es un ' +
     'error rojo en la consola por cada guardado que falla');

  // Y lo que importa: después de fallar, el siguiente guardado entra.
  const m2 = montar([ejercicio('Press banca', [serie(10, 60)])]);
  const p = m2.guardar(); await m2.soltar(); await p;
  ok(m2.posts('routine_days') === 1, 'y el siguiente guardado sigue funcionando');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
