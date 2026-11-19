// Guardar sin saber si ya tenía plan le dejaba DOS activos.
//
// Guardar es un PATCH si ya hay plan y un POST si no, y eso se decide con
// `planEditando.plan`. Ese campo nace en `null` y se llena cuando vuelve la
// consulta, un segundo después de abrir el editor. En ese segundo —y para
// siempre, si la consulta FALLA, que es justo cuando el editor sale vacío y
// más ganas dan de escribir— `null` significaba «no tiene plan».
//
// El resultado: un POST, y esa persona con dos filas activas. La tabla dice
// «un solo plan vigente por persona» y nada lo impide: el índice de `activo`
// no es único. Y como la consulta pedía `limit 1` SIN ORDEN, cuál de los dos
// veía lo decidía Postgres — podía ver el viejo y su entrenador creer que lo
// que escribió se había perdido.
//
// Dos cosas, entonces: no guardar a ciegas, y que si ya hay duplicados de
// antes gane siempre el último escrito.
//
// Y DE PASO, EL ORDEN DE LAS COMIDAS. La columna dice que el orden del array
// es el orden en que se muestran, y el array se llenaba según se tecleaba:
// quien escribía la cena del martes antes que el desayuno le dejaba a esa
// persona la cena arriba.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const MIG = readFileSync(join(RAIZ, 'supabase', 'migrations', '0014_planes_de_comida.sql'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

const sinC = (s) => s.replace(/^\s*\/\/.*$/gm, '');
const LIMPIO = sinC(APP);
function fn(cabecera) {
  const i = LIMPIO.indexOf(cabecera);
  if (i < 0) throw new Error('no encuentro: ' + cabecera);
  let n = 0;
  for (let j = LIMPIO.indexOf('{', i); j < LIMPIO.length; j++) {
    if (LIMPIO[j] === '{') n++;
    else if (LIMPIO[j] === '}') { n--; if (!n) return LIMPIO.slice(i, j + 1); }
  }
  throw new Error('llaves sin cerrar: ' + cabecera);
}
// El cuerpo de un `addEventListener('click', …)`, sin la cabecera.
function cuerpoDelBoton(id) {
  const marca = "document.getElementById('" + id + "').addEventListener('click', function(){";
  const i = LIMPIO.indexOf(marca);
  if (i < 0) throw new Error('no encuentro el botón ' + id);
  let n = 0, j = LIMPIO.indexOf('{', i + marca.length - 1);
  const abre = j;
  for (; j < LIMPIO.length; j++) {
    if (LIMPIO[j] === '{') n++;
    else if (LIMPIO[j] === '}') { n--; if (!n) return LIMPIO.slice(abre + 1, j); }
  }
  throw new Error('llaves sin cerrar en ' + id);
}

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const MOMENTOS = [{ k: 'Desayuno' }, { k: 'Comida' }, { k: 'Cena' }, { k: 'Snack' }];

// ------------------------------------------------------------------
console.log('\nLa base no impide dos planes activos, así que lo impide la app');
{
  ok(/create index if not exists idx_planes_user on public\.planes\(user_id\) where activo;/.test(MIG),
     'el índice de `activo` NO es único',
     'si algún día se hace único, esto deja de ser la última defensa — pero ' +
     'hoy lo es');
  ok(/Un solo plan vigente por persona/.test(MIG),
     'aunque la tabla diga que solo debe haber uno',
     'la regla está escrita y no está impuesta: eso es lo que hay que cubrir');
}

console.log('\nY se lee el ÚLTIMO, no uno cualquiera');
{
  const f = fn('function sbPlanDe(userId){');
  ok(/activo=is\.true/.test(f), 'se pide el activo');
  ok(/order=created_at\.desc/.test(f),
     'y en orden, el más nuevo primero',
     'con `limit 1` y sin orden, cuál de dos duplicados se lee lo decide la ' +
     'base: la misma persona veía un día uno y otro día el otro');
  ok(/limit=1/.test(f), 'y uno solo');
}

// ------------------------------------------------------------------
console.log('\nGuardar sin saber si ya tenía plan: no');
{
  const guardar = ({ editando, comidas }) => {
    const campos = { peNombre: { value: 'Plan de Ana' }, peNota: { value: '' } };
    const peticiones = [], avisos = [];
    new Function(
      'planEditando', 'sesion', 'document', 'toast', 'leerEditorPlan',
      'sbFetch', 'traducirError', 'back', 'cargarPlan', 'peticiones',
      cuerpoDelBoton('peGuardar')
    )(
      editando, { user: { id: 'coach' } },
      { getElementById: (id) => campos[id] || null },
      (donde, msg) => avisos.push(msg),
      () => comidas,
      (ruta, op) => { peticiones.push({ ruta: ruta, metodo: op.method }); return Promise.resolve(); },
      (m) => m, () => {}, () => Promise.resolve(), peticiones
    );
    return { peticiones, avisos };
  };

  const comidas = [{ dia: 'Lunes', momento: 'Desayuno', texto: 'Huevos' }];

  // EL CASO DEL FALLO: la consulta no ha vuelto todavía.
  const aCiegas = guardar({ editando: { userId: 'ana', plan: null, cargado: false }, comidas });
  ok(aCiegas.peticiones.length === 0, 'mientras no se sabe, no se guarda',
     JSON.stringify(aCiegas.peticiones) + ' — un POST aquí le deja dos planes ' +
     'activos y la app elige entre ellos a suertes');
  ok(/todavía no sé si ya tiene un plan/.test(aCiegas.avisos[0] || ''),
     'y se dice por qué, con qué hacer',
     'un botón que no responde es indistinguible de uno roto. Dijo: «' +
     (aCiegas.avisos[0] || '') + '»');

  // Y SABIÉNDOLO, cada camino el suyo.
  const conPlan = guardar({
    editando: { userId: 'ana', plan: { id: 'p1' }, cargado: true }, comidas });
  ok(conPlan.peticiones.length === 1 && conPlan.peticiones[0].metodo === 'PATCH',
     'con plan conocido se actualiza el suyo', JSON.stringify(conPlan.peticiones));
  ok(/id=eq\.p1/.test(conPlan.peticiones[0].ruta), 'el de esa fila',
     conPlan.peticiones[0].ruta);

  const sinPlan = guardar({
    editando: { userId: 'ana', plan: null, cargado: true }, comidas });
  ok(sinPlan.peticiones.length === 1 && sinPlan.peticiones[0].metodo === 'POST',
     'y sabiendo que no tiene, se le crea uno', JSON.stringify(sinPlan.peticiones));

  const vacio = guardar({ editando: { userId: 'ana', plan: null, cargado: true }, comidas: [] });
  ok(vacio.peticiones.length === 0, 'y un plan sin comidas no se guarda');

  // `creado_por` SOLO AL CREARLO: iba también en el PATCH, así que el
  // segundo entrenador que tocara el plan figuraba como quien lo escribió.
  const g = LIMPIO.slice(LIMPIO.indexOf("document.getElementById('peGuardar')"));
  const corte = g.indexOf('method:\'POST\'');
  ok(g.indexOf('creado_por') > corte && corte > 0,
     'y «creado por» solo viaja en el alta',
     'la columna se llama «creado por», no «tocado por»');
}

console.log('\nY quitar el plan tampoco se hace a ciegas');
{
  // El mismo `plan: null` con dos significados. Sin distinguirlos, quitar
  // el plan de alguien mientras carga cerraba el editor sin quitar nada.
  const q = LIMPIO.slice(LIMPIO.indexOf("document.getElementById('peQuitar')"));
  const cuerpo = q.slice(0, q.indexOf('});'));
  ok(/if\(!planEditando\.cargado\)/.test(cuerpo), 'se mira si ya se sabe',
     cuerpo.slice(0, 200));
  ok(cuerpo.indexOf('cargado') < cuerpo.indexOf('method:\'DELETE\''),
     'antes de borrar nada');
  ok(/todavía no sé si tiene un plan/.test(cuerpo),
     'y se dice, en vez de cerrar el editor como si nada',
     'cerrar sin quitar y sin avisar deja a esa persona con su plan puesto ' +
     'y a quien lo quitó creyendo que ya no lo tiene');
}

console.log('\nY lo que ya escribiste no lo pisa el plan que llega tarde');
{
  // La consulta vuelve un segundo después de abrir. En ese segundo se puede
  // teclear o armar con la IA —que tarda, pero puede acabar antes si esta se
  // atascó—. Volcar el plan guardado encima borraba ese trabajo sin avisar.
  const t = fn('function abrirEditorPlan(cliente){');
  ok(/planEditando\.cargado = true;/.test(t), 'al volver, ya se sabe si tenía plan');
  const dentro = t.slice(t.indexOf('sbPlanDe('));
  ok(/volcarDiaActual\(\);/.test(dentro),
     'se vuelca lo que está en pantalla antes de decidir',
     'lo tecleado vive en los `textarea` hasta que se cambia de día o se guarda');
  const corte = dentro.indexOf('if(planComidas.length)');
  ok(corte > 0, 'y si hay algo escrito, se respeta');
  ok(dentro.indexOf('planComidas = ((p && p.comidas)') > corte,
     'volcando el plan guardado SOLO si no había nada',
     'al revés, el plan de la base borra lo que esa persona acaba de armar');
  // Pero el id se queda: es lo que hace que guardar ACTUALICE en vez de
  // crear otro plan. Sin esto, respetar lo escrito causaría el duplicado que
  // esta prueba existe para evitar.
  const guardaId = t.indexOf('planEditando.plan = p;');
  ok(guardaId > 0 && guardaId < t.indexOf('volcarDiaActual();'),
     'y el id del plan se guarda igual, antes de decidir nada',
     guardaId < 0
       ? 'no se guarda en ninguna parte: guardar haría un POST y le dejaría dos planes'
       : 'si se guardara después del corte, respetar lo tecleado acabaría en ' +
         'un POST y en dos planes');
}

// ------------------------------------------------------------------
console.log('\nY las comidas se guardan en orden, no en el que se tecleó');
{
  const correr = (comidas) => new Function(
    'planComidas', 'volcarDiaActual', 'DIAS_SEMANA', 'MOMENTOS',
    sinC(fn('function ordenMomento(k){')) +
    sinC(fn('function leerEditorPlan(){')) + '; return leerEditorPlan();'
  )(comidas, () => {}, DIAS_SEMANA, MOMENTOS);

  // Alguien que escribe la cena del martes y luego vuelve al desayuno.
  const comoSeTecleo = [
    { dia: 'Martes', momento: 'Cena',     texto: 'pescado' },
    { dia: 'Lunes',  momento: 'Cena',     texto: 'sopa' },
    { dia: 'Martes', momento: 'Desayuno', texto: 'avena' },
    { dia: 'Lunes',  momento: 'Desayuno', texto: 'huevos' },
  ];
  const r = correr(comoSeTecleo.slice());
  ok(r.map((c) => c.dia + ' ' + c.momento).join(' · ') ===
     'Lunes Desayuno · Lunes Cena · Martes Desayuno · Martes Cena',
     'por día y, dentro del día, por momento',
     r.map((c) => c.dia + ' ' + c.momento).join(' · '));

  const vacias = correr([{ dia: 'Lunes', momento: 'Comida', texto: '   ' },
                         { dia: 'Lunes', momento: 'Cena', texto: 'algo' }]);
  ok(vacias.length === 1 && vacias[0].texto === 'algo',
     'y las que están en blanco no se guardan',
     'un plan de dos comidas no debe enseñar dos tarjetas vacías');

  // Un momento desconocido no se pierde: va al final, pero va.
  const raro = correr([{ dia: 'Lunes', momento: 'Merienda', texto: 'fruta' },
                       { dia: 'Lunes', momento: 'Desayuno', texto: 'huevos' }]);
  ok(raro.length === 2 && raro[1].momento === 'Merienda',
     'y lo que no está en la lista va al final, no desaparece',
     JSON.stringify(raro.map((c) => c.momento)));
}

console.log('\nY a ella se le enseñan en orden aunque estén guardadas al revés');
{
  // Los planes escritos ANTES de esto ya están en la base desordenados, y
  // esos no se arreglan solos.
  const cont = { innerHTML: '' };
  const campos = { planMio: cont, planSub: { textContent: '' } };
  const MI_PLAN = {
    nombre: 'Plan', nota: null,
    comidas: [
      { dia: 'Lunes', momento: 'Cena',     texto: 'sopa' },
      { dia: 'Lunes', momento: 'Desayuno', texto: 'huevos' },
    ],
    diaVisto: 'Lunes',
  };
  new Function(
    'MI_PLAN', 'document', 'tengoPlan', 'tiraDeMetas', 'leerMetas', 'MOMENTOS',
    'iconoMomento', 'escapar', 'DIAS_SEMANA',
    sinC(fn('function ordenMomento(k){')) +
    sinC(fn('function pintarMiPlan(sinRed){')) + '; pintarMiPlan(false);'
  )(
    MI_PLAN, { getElementById: (id) => campos[id] || null },
    () => true, () => '', () => ({}), MOMENTOS, () => '', (s) => String(s),
    DIAS_SEMANA
  );

  ok(cont.innerHTML.indexOf('huevos') < cont.innerHTML.indexOf('sopa'),
     'el desayuno sale antes que la cena',
     'guardado al revés y pintado tal cual, esa persona abre la app y lee ' +
     'primero lo que cena');
  ok(/huevos/.test(cont.innerHTML) && /sopa/.test(cont.innerHTML),
     'y no se pierde ninguna');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
