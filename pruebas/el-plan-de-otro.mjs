// El plan que arma la IA podía caer en el editor de otra persona.
//
// `generarPlan()` pide el plan y, cuando llega, lo vuelca en los campos del
// editor: nombre, nota y las comidas. Pero NO comprobaba que a esas alturas
// se siguiera editando a la misma persona.
//
// Armar un plan con IA tarda; la ventana es de segundos, no de milisegundos.
// En ese rato se puede volver atrás y abrir el plan de otra persona, y
// entonces:
//
//   se pide el plan de Ana  →  se abre el editor de Beto  →  llega el de Ana
//   y se escribe encima del de Beto
//
// Y lo que lo vuelve caro es el paso siguiente: `peGuardar` lee
// `planEditando.userId` en el momento del clic, o sea BETO. Guardar ahí
// escribe el plan de Ana en la ficha de Beto, con su nombre y sus comidas.
// Nadie se entera: la pantalla dice «Plan guardado».
//
// La app ya se defiende de esto en el mismo fichero: `abrirEditorPlan()`
// hace `if(!planEditando || planEditando.userId !== cliente.id) return;`
// cuando vuelve de pedir el plan guardado. Aquí faltaba.

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

// `planEditando` y `planComidas` se REASIGNAN desde fuera de la función, así
// que se declaran dentro del trozo que se evalúa y se devuelven miradores.
function montar() {
  const campos = {
    peNombre: { value: 'Plan de Beto' },
    peNota:   { value: 'sin cacahuate' },
    peGenerar:       { textContent: 'Que lo arme la IA', disabled: false },
    peGenerarSemana: { textContent: 'Armar la semana',   disabled: false },
  };
  const ctx = {
    campos,
    avisos: [],
    perfiles: { ana: { goal_protein_g: 170, goal_carbs_g: 240, goal_fat_g: 75 },
                beto: { goal_protein_g: 150, goal_carbs_g: 200, goal_fat_g: 60 } },
    llamadas: [],
    document: { getElementById: (id) => campos[id] || null },
    toast: (id, t) => ctx.avisos.push(t),
    traducirError: (m) => m,
    ponerDiaALosViejos: () => {},
    pintarEditorComidas: () => { ctx.pintados = (ctx.pintados || 0) + 1; },
    sesion: { user: { id: 'coach' } },
  };
  return ctx;
}

// Devuelve { generar, verEditando, verComidas, cambiarA }
function preparar(ctx, { tardaLaIA = 0 } = {}) {
  const fuente =
    'var planEditando = __editando;\n' +
    'var planComidas = [];\n' +
    sacar('function generarPlan(semana){') + '\n' +
    'return {\n' +
    '  generar: function(s){ return generarPlan(s); },\n' +
    '  verComidas: function(){ return planComidas; },\n' +
    '  cambiarA: function(e){ planEditando = e; },\n' +
    '};';

  const sbFetch = (ruta) => {
    const quien = /id=eq\.(\w+)/.exec(ruta);
    return Promise.resolve([ctx.perfiles[quien && quien[1]] || null].filter(Boolean));
  };
  const iaLlamar = (cuerpo) => {
    ctx.llamadas.push(cuerpo);
    const r = { nombre: 'Plan de ' + cuerpo.nombre, nota: 'nota de ' + cuerpo.nombre,
                comidas: [{ dia: 'lunes', momento: 'desayuno', texto: 'de ' + cuerpo.nombre }] };
    return new Promise((res) => setTimeout(() => res(r), tardaLaIA));
  };

  return new Function('__editando', 'document', 'sesion', 'sbFetch', 'iaLlamar',
    'toast', 'traducirError', 'ponerDiaALosViejos', 'pintarEditorComidas', fuente)(
      { userId: 'ana', nombre: 'Ana', plan: null }, ctx.document, ctx.sesion,
      sbFetch, iaLlamar, ctx.toast, ctx.traducirError,
      ctx.ponerDiaALosViejos, ctx.pintarEditorComidas);
}

const esperar = (ms = 40) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------
console.log('\nEl plan cae en el editor de quien se pidió');
{
  const ctx = montar();
  const api = preparar(ctx);
  api.generar(false);
  await esperar();

  ok(ctx.campos.peNombre.value === 'Plan de Ana', 'el nombre se vuelca',
     'quedó: ' + ctx.campos.peNombre.value);
  ok(api.verComidas().length === 1 && /de Ana/.test(api.verComidas()[0].texto),
     'y sus comidas', JSON.stringify(api.verComidas()));
  ok(ctx.llamadas[0] && ctx.llamadas[0].cliente === 'ana', 'y se pidió para Ana');
  ok(ctx.llamadas[0] && ctx.llamadas[0].calorias === 2315,
     'con sus calorías, sacadas de sus macros',
     'salió ' + (ctx.llamadas[0] || {}).calorias);
}

console.log('\nY si te vas a otra persona mientras llega, NO se escribe encima');
{
  const ctx = montar();
  const api = preparar(ctx, { tardaLaIA: 30 });
  api.generar(false);
  // El entrenador se va y abre el plan de Beto antes de que conteste la IA.
  api.cambiarA({ userId: 'beto', nombre: 'Beto', plan: null });
  ctx.campos.peNombre.value = 'Plan de Beto';
  ctx.campos.peNota.value = 'sin cacahuate';
  await esperar(80);

  ok(ctx.campos.peNombre.value === 'Plan de Beto',
     'el nombre de Beto se queda',
     'quedó «' + ctx.campos.peNombre.value + '»: y al guardar, `peGuardar` ' +
     'usa `planEditando.userId` —Beto— así que el plan de Ana se escribiría ' +
     'en la ficha de Beto, con su nombre y sus comidas, diciendo «Plan ' +
     'guardado»');
  ok(ctx.campos.peNota.value === 'sin cacahuate', 'y su nota también');
  ok(api.verComidas().length === 0, 'y sus comidas no se sustituyen',
     JSON.stringify(api.verComidas()));

  // Y LA PETICIÓN NO SE MEZCLA. Esto salió al escribir la prueba: el perfil
  // se pide con el id del momento del clic, pero `cliente` y `nombre` se
  // leían DESPUÉS, ya dentro del `then`. Cambiar de persona en medio mandaba
  // los macros de Ana con el nombre de Beto y —peor— con las llaves de IA
  // de Beto, que es lo que decide si esa consulta se puede hacer y a quién
  // se le cobra.
  const c = ctx.llamadas[0];
  ok(c && c.cliente === 'ana', 'se pidió para Ana, que es a quien se le dio',
     'salió para «' + (c || {}).cliente + '»');
  ok(c && c.nombre === 'Ana', 'y con su nombre',
     'salió «' + (c || {}).nombre + '»: el nombre y las calorías tienen que ' +
     'ser de la misma persona');
  ok(c && c.calorias === 2315, 'y con SUS calorías, no las de la otra',
     'salió ' + (c || {}).calorias + ' (Ana 2315, Beto 1940)');
}

console.log('\nY si se cierra el editor del todo, tampoco');
{
  const ctx = montar();
  const api = preparar(ctx, { tardaLaIA: 30 });
  api.generar(false);
  api.cambiarA(null);                    // se sale de la pantalla
  ctx.campos.peNombre.value = '(vacío)';
  await esperar(80);
  ok(ctx.campos.peNombre.value === '(vacío)', 'no se escribe en un editor cerrado',
     'quedó: ' + ctx.campos.peNombre.value);
}

console.log('\nY el botón se restaura pase lo que pase');
{
  const ctx = montar();
  const api = preparar(ctx, { tardaLaIA: 20 });
  api.generar(false);
  ok(ctx.campos.peGenerar.disabled === true, 'se apaga mientras piensa');
  api.cambiarA({ userId: 'beto', nombre: 'Beto', plan: null });
  await esperar(60);
  ok(ctx.campos.peGenerar.disabled === false, 'y se enciende aunque se cambie de persona',
     'si no, el botón se queda muerto y hay que recargar');
  ok(ctx.campos.peGenerar.textContent === 'Que lo arme la IA',
     'con su texto de siempre');
}

console.log('\nY sin macros calculados se dice, no se pide un plan a ciegas');
{
  const ctx = montar();
  ctx.perfiles.ana = null;
  const api = preparar(ctx);
  api.generar(false);
  await esperar();
  ok(ctx.llamadas.length === 0, 'no se llama a la IA',
     'un plan sin sus calorías no cuadra con nada de lo que la app le pide');
  ok(/macros/i.test(ctx.avisos.join(' ')), 'y se explica por qué',
     JSON.stringify(ctx.avisos));
  ok(ctx.campos.peGenerar.disabled === false, 'y el botón vuelve');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
