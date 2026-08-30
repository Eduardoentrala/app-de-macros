// Borrar o editar un alimento guardado que todavía no había subido.
//
// Los alimentos de «Guardados» también se encolan cuando no hay señal
// —`encolar({ ruta:'/rest/v1/saved_foods', … })`— y el id lo pone el
// teléfono. Así que existe el mismo hueco que ya se tapó en el Diario, en
// tres sitios más:
//
//   BORRARLO. Sale un DELETE de una fila que el servidor no ha visto nunca.
//   No borra nada y no da error —cero filas es un 204 normal—, así que
//   desaparece de la lista… y luego la cola sube el alta. El alimento
//   RESUCITA al recargar.
//
//   EDITARLO desde «Crear», y ACTUALIZARLE LOS MACROS desde el diálogo de
//   «ya lo tienes guardado». Sale un PATCH que no encuentra la fila,
//   contesta que sí, y después la cola sube los valores VIEJOS. La pantalla
//   dice una cosa y el servidor guarda otra.
//
// `sbQuitarAlimento` ya se defendía de esto para el diario con
// `desencolar()`, y `guardarCantidadEditada` con `retocarEnCola()`. Aquí
// faltaba, en los tres.

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

// Un alta de alimento guardado esperando en la cola.
const enCola = (id, extra) => ({
  ruta: '/rest/v1/saved_foods', tipo: 'despensa', fila: id,
  op: { method: 'POST', headers: {}, body: JSON.stringify(Object.assign({
    id, user_id: 'u1', name: 'Pechuga', unit: 'Gramos',
    protein_g: 23, carbs_g: 0, fat_g: 2,
  }, extra)) },
});

function montar({ cola = [] } = {}) {
  const ctx = {
    COLA: cola.slice(),
    peticiones: [],
    avisos: [],
    MIS_ALIMENTOS: [],
    colaGuardar: () => { ctx.guardado = true; },
    pintarPendientes: () => {},
    recalcularFrecuentes: () => {},
    pintarListas: () => {},
    toast: (id, t) => ctx.avisos.push(t),
    traducirError: (m) => m,
    confirm: () => true,
    sesion: { user: { id: 'u1' } },
    sbFetch: (ruta, op) => {
      ctx.peticiones.push({ ruta, metodo: (op && op.method) || 'GET',
                            cuerpo: op && op.body ? JSON.parse(op.body) : null });
      return Promise.resolve(null);
    },
  };
  return ctx;
}

const conFuente = (ctx, cabeceras, llamada, extras = {}) => {
  // Por NOMBRE, no por la firma entera: `retocarEnCola` gano un parametro
  // —la tabla— y este extractor, que buscaba el texto exacto, dejo de
  // encontrarla. La prueba reventaba con «no esta definida» en vez de decir
  // lo que probaba.
  const auxiliares = ['desencolar', 'retocarEnCola'].map((n) => {
    const m = new RegExp('^\\s*function ' + n + '\\s*\\(', 'm').exec(APP);
    if (!m) throw new Error('no encuentro la funcion ' + n);
    return sacar(APP.slice(m.index, APP.indexOf('{', m.index) + 1).replace(/^\s+/, ''));
  });
  // `COLA` se declara DENTRO y se devuelve un mirador: `desencolar()` la
  // REASIGNA (`COLA = COLA.filter(...)`), y una reasignación sobre un
  // parámetro no se ve desde fuera. Sin esto, la prueba decía que el alta
  // seguía en la cola cuando sí se había quitado.
  const todo = Object.assign({}, ctx, extras);
  delete todo.COLA;
  const nombres = Object.keys(todo);
  const fuente =
    'var COLA = __cola;\n' +
    auxiliares.join('\n') + '\n' + cabeceras.map(sacar).join('\n') + '\n' +
    llamada + '\nreturn function(){ return COLA; };';
  const mirar = new Function('__cola', ...nombres, fuente)(
    ctx.COLA, ...nombres.map((k) => todo[k]));
  ctx.verCola = mirar;
  return mirar;
};

const esperar = (ms = 20) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------
console.log('\nBorrar uno que sigue en la cola lo cancela, no manda un DELETE');
{
  const ctx = montar({ cola: [enCola('id-1')] });
  const a = { id: 'id-1', n: 'Pechuga', u: 'Gramos', P: 23, C: 0, G: 2 };
  ctx.MIS_ALIMENTOS.push(a);
  conFuente(ctx, ['function borrarGuardado(a){'], 'borrarGuardado(sujeto);', { sujeto: a });
  await esperar();

  ok(ctx.peticiones.length === 0, 'no sale ningún DELETE',
     'salieron ' + ctx.peticiones.length + ': ese DELETE no borra nada —cero ' +
     'filas es un 204 normal— y luego la cola sube el alta. El alimento ' +
     'RESUCITA al recargar');
  ok(ctx.verCola().length === 0, 'y el alta pendiente se cancela',
     'quedan ' + ctx.verCola().length + ' en la cola');
  ok(ctx.MIS_ALIMENTOS.length === 0, 'y desaparece de la lista');
}

console.log('\nY si ya subió, se manda el DELETE de siempre');
{
  const ctx = montar({ cola: [] });
  const a = { id: 'id-9', n: 'Pechuga', u: 'Gramos', P: 23, C: 0, G: 2 };
  ctx.MIS_ALIMENTOS.push(a);
  conFuente(ctx, ['function borrarGuardado(a){'], 'borrarGuardado(sujeto);', { sujeto: a });
  await esperar();
  const p = ctx.peticiones[0];
  ok(p && p.metodo === 'DELETE' && /id=eq\.id-9/.test(p.ruta), 'sale el DELETE',
     JSON.stringify(ctx.peticiones));
}

console.log('\nY editarle los macros retoca la cola en vez de mandar un PATCH');
{
  const ctx = montar({ cola: [enCola('id-1')] });
  const g = { id: 'id-1', n: 'Pechuga', u: 'Gramos', P: 23, C: 0, G: 2 };
  conFuente(ctx, ['function actualizarGuardado(g, P, C, G){'],
            'actualizarGuardado(sujeto, 30, 1, 3);', { sujeto: g });
  await esperar();

  ok(ctx.peticiones.length === 0, 'no sale ningún PATCH',
     'un PATCH de una fila que no existe contesta que sí, y luego la cola ' +
     'sube los macros VIEJOS');
  const cuerpo = JSON.parse(ctx.verCola()[0].op.body);
  ok(cuerpo.protein_g === 30 && cuerpo.carbs_g === 1 && cuerpo.fat_g === 3,
     'y la cola queda con los macros nuevos', JSON.stringify(cuerpo));
  ok(cuerpo.name === 'Pechuga', 'sin tocar lo demás');
}

console.log('\nY si ya subió, el PATCH sale como siempre');
{
  const ctx = montar({ cola: [] });
  const g = { id: 'id-9', n: 'Pechuga', u: 'Gramos', P: 23, C: 0, G: 2 };
  conFuente(ctx, ['function actualizarGuardado(g, P, C, G){'],
            'actualizarGuardado(sujeto, 30, 1, 3);', { sujeto: g });
  await esperar();
  const p = ctx.peticiones[0];
  ok(p && p.metodo === 'PATCH' && p.cuerpo.protein_g === 30, 'sale el PATCH',
     JSON.stringify(ctx.peticiones));
}

console.log('\nY la tercera vía —editarlo desde «Crear»— también');
{
  // Esta no pasa por `actualizarGuardado`: es el guardado del formulario
  // cuando el alimento ya existía. Mismo hueco, otro sitio.
  const APP2 = APP;
  const i = APP2.indexOf("        sbFetch('/rest/v1/saved_foods?id=eq.' + ed.id, {");
  ok(i > 0, 'se encuentra esa rama');
  const antes = APP2.slice(Math.max(0, i - 400), i);
  ok(/retocarEnCola\(ed\.id/.test(antes),
     'mira la cola antes de mandar el PATCH',
     'sin esto, editar el nombre o los macros de algo que aún no subió se ' +
     'pierde: el PATCH no encuentra la fila y la cola sube lo viejo');
  ok(/'\/saved_foods'/.test(antes), 'y dice de qué tabla',
     'sin la tabla podría retocar un apunte del diario con el mismo id');
}

// ------------------------------------------------------------------
console.log('\nY el retoque distingue la tabla');
{
  // La cola lleva comidas y alimentos guardados a la vez. Retocar por id sin
  // mirar la ruta le metería los macros de un guardado a un apunte del
  // diario, o al revés.
  const comida = { ruta: '/rest/v1/diary_entries', tipo: 'comida', fila: 'id-1',
                   op: { method: 'POST', body: JSON.stringify({ id: 'id-1', quantity: 100 }) } };
  const ctx = montar({ cola: [comida, enCola('id-1')] });
  const g = { id: 'id-1', n: 'Pechuga', u: 'Gramos', P: 23, C: 0, G: 2 };
  conFuente(ctx, ['function actualizarGuardado(g, P, C, G){'],
            'actualizarGuardado(sujeto, 30, 1, 3);', { sujeto: g });
  await esperar();

  const laComida = JSON.parse(ctx.verCola()[0].op.body);
  const elGuardado = JSON.parse(ctx.verCola()[1].op.body);
  ok(laComida.quantity === 100 && laComida.protein_g === undefined,
     'el apunte del diario se queda como estaba',
     'se le metieron macros dentro: ' + JSON.stringify(laComida));
  ok(elGuardado.protein_g === 30, 'y el guardado sí cambia');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
