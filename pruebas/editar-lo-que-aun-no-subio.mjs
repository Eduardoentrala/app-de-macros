// Editar la cantidad de algo que todavía no ha subido.
//
// Al apuntar sin señal, el id lo genera el teléfono (`idNuevo()`) y el
// apunte se queda en la cola. Pero `a.id` SÍ se asigna —el `catch` devuelve
// la fila que se iba a mandar— y `guardarCantidadEditada()` mira solo eso:
// `if(a.id && sesion)`. Con id, manda un PATCH.
//
// Y ahí hay dos caras, las dos malas:
//
//   SIN SEÑAL. El PATCH falla, se deshace la edición y sale «no se pudo
//   guardar». O sea que no se puede corregir lo que acabas de apuntar hasta
//   que vuelva la red, sin ninguna razón: el apunte está en el teléfono y es
//   editable.
//
//   JUSTO AL VOLVER LA SEÑAL, antes de que la cola suba. El PATCH sale, no
//   encuentra la fila —el alta todavía no ha llegado— y PostgREST contesta
//   204 tan tranquilo: cero filas cambiadas no es un error. Después la cola
//   sube el alta con la CANTIDAD VIEJA. La pantalla dice 150 g y el servidor
//   guarda 100, y nada avisa.
//
// El arreglo: si la fila sigue en la cola, se retoca ahí. El alta todavía no
// ha salido, así que se puede cambiar lo que va a mandar. Es lo mismo que ya
// hace `desencolar()` al borrar un apunte que no había subido: en vez de
// mandar un DELETE de algo que el servidor no ha visto, se cancela el alta.

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

// Un apunte en la cola, tal y como lo deja `encolar()`.
const enCola = (id, cant) => ({
  ruta: '/rest/v1/diary_entries',
  tipo: 'comida',
  fila: id,
  op: {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      id, user_id: 'u1', entry_date: '2026-08-25', meal: 'comida',
      food_name: 'Arroz', quantity: cant, unit: 'Gramos',
      protein_g: 5, carbs_g: 40, fat_g: 1,
    }),
  },
});

function montar({ cola = [] } = {}) {
  const ctx = {
    COLA: cola.slice(),
    peticiones: [],
    avisos: [],
    colaGuardar: () => { ctx.guardado = true; },
    pintarPendientes: () => {},
    sesion: { user: { id: 'u1' } },
    cantValor: { value: '150' },
    cerrarCantidad: () => {},
    pintarComida: () => {},
    toast: (id, t) => ctx.avisos.push(t),
    un: (x) => Math.round(x * 10) / 10,
    abreviarUnidad: () => 'g',
    traducirError: (m) => m,
    sumarAlRegistro: () => {},
    aplicarCantidad: (a, v) => {
      // Como la de verdad para lo que importa aquí: cambia la cantidad y
      // reescala los macros desde la base.
      const n = Number(v) || 100;
      a.cant = n;
      a.P = 5 * n / 100; a.C = 40 * n / 100; a.G = 1 * n / 100;
    },
    sbFetch: (ruta, op) => {
      ctx.peticiones.push({ ruta, metodo: (op && op.method) || 'GET',
                            cuerpo: op && op.body ? JSON.parse(op.body) : null });
      return Promise.resolve(null);
    },
  };
  return ctx;
}

function correr(ctx, alimento) {
  ctx.alimentoEditando = alimento;
  const nombres = Object.keys(ctx);
  const fuente = (APP.includes('function retocarEnCola(')
    ? sacar('function retocarEnCola(') + '\n' : '') +
    sacar('function guardarCantidadEditada(){');
  new Function(...nombres, fuente + '; guardarCantidadEditada();')(
    ...nombres.map((k) => ctx[k]));
}

// ------------------------------------------------------------------
console.log('\nSi el apunte sigue en la cola, se retoca ahí');
{
  const ctx = montar({ cola: [enCola('id-1', 100)] });
  const a = { id: 'id-1', n: 'Arroz', u: 'Gramos', cant: 100, P: 5, C: 40, G: 1 };
  correr(ctx, a);

  ok(ctx.peticiones.length === 0, 'no sale ningún PATCH',
     'salieron ' + ctx.peticiones.length + ': el alta todavía no ha llegado al ' +
     'servidor, así que ese PATCH no encuentra nada y contesta 204 tan ' +
     'tranquilo. Luego la cola sube la cantidad vieja');

  const puesto = JSON.parse(ctx.COLA[0].op.body);
  ok(puesto.quantity === 150, 'la cola queda con la cantidad nueva',
     'quedó en ' + puesto.quantity + ': la pantalla diría 150 y el servidor ' +
     'guardaría 100');
  ok(Math.abs(puesto.protein_g - 7.5) < 0.01, 'y con los macros reescalados',
     'quedó en ' + puesto.protein_g + ': cambiar la cantidad sin los macros ' +
     'deja la fila incoherente consigo misma');
  ok(puesto.id === 'id-1' && puesto.food_name === 'Arroz',
     'sin tocar lo demás de la fila');
  ok(ctx.guardado === true, 'y la cola se persiste',
     'sin esto el retoque se pierde al cerrar la app y sube lo viejo igual');
}

console.log('\nY se avisa de que sigue pendiente, no de que se guardó');
{
  const ctx = montar({ cola: [enCola('id-1', 100)] });
  correr(ctx, { id: 'id-1', n: 'Arroz', u: 'Gramos', cant: 100, P: 5, C: 40, G: 1 });
  ok(!ctx.avisos.some((t) => /no se pudo guardar/i.test(t)),
     'no dice que haya fallado', JSON.stringify(ctx.avisos));
}

console.log('\nSi ya subió, se manda el PATCH de siempre');
{
  const ctx = montar({ cola: [] });          // nada pendiente: ya está arriba
  const a = { id: 'id-9', n: 'Arroz', u: 'Gramos', cant: 100, P: 5, C: 40, G: 1 };
  correr(ctx, a);

  const p = ctx.peticiones[0];
  ok(!!p && p.metodo === 'PATCH', 'sale el PATCH',
     'peticiones: ' + JSON.stringify(ctx.peticiones.map((x) => x.metodo)));
  ok(p && /id=eq\.id-9/.test(p.ruta), 'a esa fila');
  ok(p && p.cuerpo && p.cuerpo.quantity === 150, 'con la cantidad nueva');
  ok(p && Math.abs(p.cuerpo.protein_g - 7.5) < 0.01, 'y sus macros');
}

console.log('\nY un apunte de otro tipo en la cola no se confunde');
{
  // La cola lleva de todo: pesos, fotos, borrados. Retocar por `fila` sin
  // mirar qué es podría reescribir el cuerpo de otra cosa.
  const otro = { ruta: '/rest/v1/weight_logs', tipo: 'peso', fila: 'id-1',
                 op: { method: 'POST', body: JSON.stringify({ weight_kg: 84 }) } };
  const ctx = montar({ cola: [otro] });
  const a = { id: 'id-1', n: 'Arroz', u: 'Gramos', cant: 100, P: 5, C: 40, G: 1 };
  correr(ctx, a);

  const cuerpoOtro = JSON.parse(ctx.COLA[0].op.body);
  ok(cuerpoOtro.weight_kg === 84 && cuerpoOtro.quantity === undefined,
     'el peso encolado se queda como estaba',
     'se le metió una cantidad dentro: ' + JSON.stringify(cuerpoOtro));
  ok(ctx.peticiones.length === 1 && ctx.peticiones[0].metodo === 'PATCH',
     'y la comida se manda por el camino normal',
     'si no es su alta lo que está en la cola, hay que mandar el PATCH');
}

console.log('\nY `retocarEnCola` se defiende sola, la llame quien la llame');
{
  // Se llama DIRECTAMENTE y no a través de `guardarCantidadEditada`, que ya
  // sale antes si no hay id: por ese camino la guarda es inalcanzable y una
  // mutación que la borrara pasaba sin que nada se enterara. Esto es el
  // contrato de la función, y el próximo que la use puede no filtrar antes.
  const borrado = { ruta: '/rest/v1/diary_entries?id=eq.id-9', tipo: 'comida',
                    op: { method: 'DELETE', body: JSON.stringify({ borrar: true }) } };
  const COLA = [borrado];
  const f = new Function('COLA', 'colaGuardar',
    sacar('function retocarEnCola(') + '; return retocarEnCola;')(COLA, () => {});

  ok(f(null, { quantity: 150 }) === false, 'con id nulo dice que no ha hecho nada');
  ok(f(undefined, { quantity: 150 }) === false, 'y con id ausente también',
     '`x.fila !== id` compara `undefined !== undefined`, que es falso: el ' +
     'primer borrado pendiente casaría y se le metería una cantidad dentro');
  ok(JSON.parse(COLA[0].op.body).quantity === undefined,
     'y la cola se queda intacta');
}

console.log('\nY no se toca el apunte de OTRA comida que también espera');
{
  // Lo normal sin señal es tener varias comidas en la cola. Retocar la que
  // no es le cambia la cantidad a un apunte que nadie ha editado.
  const ctx = montar({ cola: [enCola('id-otra', 200), enCola('id-1', 100)] });
  correr(ctx, { id: 'id-1', n: 'Arroz', u: 'Gramos', cant: 100, P: 5, C: 40, G: 1 });

  const otra = JSON.parse(ctx.COLA[0].op.body);
  const suya = JSON.parse(ctx.COLA[1].op.body);
  ok(otra.quantity === 200, 'la otra se queda con su cantidad',
     'quedó en ' + otra.quantity + ': se retocó la primera que había en la ' +
     'cola en vez de la suya');
  ok(suya.quantity === 150, 'y la suya cambia');
}

console.log('\nY sin id no se toca nada de la cola');
{
  // La cola lleva también borrados, y esos NO tienen `fila`. Sin la guarda
  // del id, `x.fila !== id` compara `undefined !== undefined`, que es falso:
  // el primer borrado pendiente casaría y se le metería una cantidad dentro.
  // Es la misma trampa que `desencolar()` ya avisa en su comentario.
  const borrado = { ruta: '/rest/v1/diary_entries?id=eq.id-9', tipo: 'comida',
                    op: { method: 'DELETE', body: JSON.stringify({ borrar: true }) } };
  const ctx = montar({ cola: [borrado] });
  let reventó = false;
  try { correr(ctx, { n: 'Arroz', u: 'Gramos', cant: 100, P: 5, C: 40, G: 1 }); }
  catch (e) { reventó = true; }
  ok(!reventó, 'se puede editar algo sin id');
  ok(ctx.peticiones.length === 0, 'y no se manda nada al servidor');
  const b = JSON.parse(ctx.COLA[0].op.body);
  ok(b.quantity === undefined && b.borrar === true,
     'y el borrado pendiente sigue siendo un borrado',
     'se le metió una cantidad: ' + JSON.stringify(b));
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
