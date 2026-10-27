// La pestaña Plan, solo para quien tiene algo que ver ahí.
//
// No todo el mundo lleva plan de comidas. A quien no lo lleva, Plan le
// ocupaba un quinto de la barra de abajo para enseñarle siempre lo mismo:
// que no tiene plan. Y esa barra es el único sitio de la app donde el
// espacio está de verdad contado —cinco botones y no caben seis—.
//
// LO QUE HAY QUE NO ROMPER, y por eso esto se prueba ejecutando:
//
//   · El entrenador la conserva SIEMPRE, tenga plan propio o no: es donde
//     los escribe y donde inscribe a su gente.
//   · Un plan sin comidas no es un plan. La fila existe desde que el
//     entrenador le pone nombre, y con la lista vacía la pestaña llevaría
//     a «todavía no tienes un plan», que es justo lo que se quita.
//   · Un bache de red no se la quita a quien sí lo tiene. «No se pudo
//     preguntar» y «no tiene plan» no son lo mismo.
//   · Y se pregunta EN EL ARRANQUE. Mirarlo al abrir Plan -que es donde
//     estaba- sería preguntárselo a una puerta cerrada justamente por lo
//     que se va a contestar: quien tuviera plan no vería nunca la pestaña
//     para entrar a enterarse de que lo tiene.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const BASE = readFileSync(join(RAIZ, 'docs', 'estilos', 'base.css'), 'utf8');

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

const fuente = sacar('function tengoPlan(){') + '\n' + sacar('function refrescarPestanaPlan(){');

// Tres barras de pestañas en el HTML —Diario, Plan y Perfil tienen la suya—,
// así que esconder una sola dejaría la pestaña puesta en las otras dos.
function montar({ plan = null, rol = 'cliente', vista = 'diario', botones = 3 } = {}) {
  const bs = Array.from({ length: botones }, () => ({ hidden: false }));
  const idos = [];
  const doc = {
    querySelectorAll: (s) => (s === '[data-tabbar="plan"]' ? bs : []),
    querySelector: (s) => (s === '.app-view.active' ? { dataset: { view: vista } } : null),
  };
  const f = new Function('document', 'MI_PLAN', 'ROL', 'goto',
    fuente + '\nreturn refrescarPestanaPlan;')(doc, plan, rol, (id) => idos.push(id));
  f();
  return { escondidos: bs.filter(b => b.hidden).length, total: bs.length, idos };
}

const CON_PLAN = { nombre: 'Semana 1', comidas: [{ dia: 'Lunes', texto: 'Huevos' }] };

// ------------------------------------------------------------------
console.log('\nSin plan, la pestaña no está');
{
  const r = montar({ plan: null });
  ok(r.escondidos === r.total, 'se esconde en las tres barras',
     `escondidas ${r.escondidos} de ${r.total}: una barra sin tocar deja la ` +
     'pestaña puesta en esa pantalla');

  const vacio = montar({ plan: { nombre: 'Sin escribir', comidas: [] } });
  ok(vacio.escondidos === vacio.total, 'y un plan sin comidas tampoco cuenta',
     'la fila existe desde que le ponen nombre; llevaría a una pantalla vacía');
}

console.log('\nCon plan, sí está');
{
  const r = montar({ plan: CON_PLAN });
  ok(r.escondidos === 0, 'se enseña en las tres');
  ok(r.idos.length === 0, 'y no manda a nadie a ningún sitio');
}

console.log('\nEl entrenador la conserva siempre');
{
  for (const rol of ['coach', 'org_admin', 'super_admin']) {
    const r = montar({ plan: null, rol });
    ok(r.escondidos === 0, `${rol}: la tiene aunque no lleve plan propio`,
       'es donde escribe los planes y donde inscribe a su gente');
  }
  const cliente = montar({ plan: null, rol: 'cliente' });
  ok(cliente.escondidos === cliente.total, 'y el cliente sin plan, no');
}

console.log('\nSi se la quitan estando dentro, no se le deja ahí');
{
  const dentro = montar({ plan: null, vista: 'plan' });
  ok(dentro.idos[0] === 'diario', 'se vuelve al Diario',
     'la barra se quedaría con cuatro botones y ninguno encendido, que se ' +
     'lee como que la app se perdió');

  const fuera = montar({ plan: null, vista: 'diario' });
  ok(fuera.idos.length === 0, 'y si no estaba dentro, no se le mueve');

  const conPlan = montar({ plan: CON_PLAN, vista: 'plan' });
  ok(conPlan.idos.length === 0, 'ni a quien sí lo tiene');
}

// ------------------------------------------------------------------
console.log('\nUna sola definición de «tengo plan»');
{
  const pinta = sacar('function pintarMiPlan(sinRed){');
  ok(/if\(!tengoPlan\(\)\)/.test(pinta),
     'lo que se pinta dentro usa la misma',
     'con dos definiciones acabarían discrepando, y una pestaña que lleva a ' +
     '«todavía no tienes un plan» es justo lo que se quiere quitar');
  ok(!/MI_PLAN \|\| !\(MI_PLAN\.comidas/.test(APP),
     'y no queda ninguna copia suelta de la condición');
}

console.log('\nSe pregunta en el arranque, no al abrir la pestaña');
{
  const carga = sacar('function cargarDatos(){');
  ok(/sbPlanDe\(sesion\.user\.id\)/.test(carga), 'el plan viaja con los datos del arranque',
     '`cargarPlan()` solo corre al ENTRAR en Plan: mirarlo allí es ' +
     'preguntárselo a una puerta cerrada por lo que se va a contestar');
  ok(/cargarMiPlanGuardado\(\);\n\s*refrescarPestanaPlan\(\);/.test(carga),
     'y la copia del teléfono decide antes de que conteste la red',
     'si no, la barra pasa de cuatro botones a cinco al segundo de abrir');
}

console.log('\nUn bache de red no le quita la pestaña a quien sí lo tiene');
{
  const carga = sacar('function cargarDatos(){');
  ok(/sbPlanDe\([^)]*\)\['catch'\]\(function\(\)\{ return undefined; \}\)/.test(carga),
     'si falla devuelve undefined, no null');
  ok(/if\(res\[7\] !== undefined\)\{/.test(carga),
     'y undefined no toca el plan guardado',
     'null es «no tiene plan» y se cree; undefined es «no se pudo preguntar»');
}

console.log('\nY el HTML y el CSS sostienen todo esto');
{
  const botones = (HTML.match(/data-tabbar="plan"/g) || []).length;
  ok(botones === 3, 'hay tres botones de Plan, uno por barra',
     'salieron ' + botones + '; si aparece una barra nueva hay que contarla aquí');
  ok(/\[hidden\]\{display:none !important;\}/.test(BASE),
     'y `hidden` gana al display:flex de la barra',
     'sin el !important, `.bottom-tabs button{display:flex}` lo deja visible ' +
     'y la pestaña se esconde solo de mentira');
}

console.log(`\n${pasan} bien, ${fallan} mal`);
process.exit(fallan ? 1 : 0);
