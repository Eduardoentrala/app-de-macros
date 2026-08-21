// La pestaña de Plan: que los avisos se vean, y que sin señal no se quede
// en blanco.
//
// LOS TRES FALLOS QUE CIERRA ESTO
//
// 1. Los toast del editor no se veían. Cada toast vive DENTRO de una vista,
//    y las vistas que no están activas son `display:none`. El editor
//    (`planedit`) no tiene toast propio y pedía el de `plan` o el de
//    `admin`: se añadía la clase, el elemento medía 0×0 y nadie lo veía.
//    Se perdían SEIS mensajes, entre ellos «No pude cargar su plan: no
//    guardes o lo sobrescribes», que existe justo para que un entrenador no
//    borre sin querer el plan de alguien.
//
//    Lo mismo pasaba con los errores de carga: piden `toastComida`, que vive
//    en `mealadd`, y salen estando en `diario`.
//
// 2. Tras «Quitar el plan», la lista del entrenador seguía diciendo «con
//    plan». Se arregla en la 0041 y se prueba en supabase/tests/plan.mjs.
//
// 3. Sin señal la pestaña se quedaba EN BLANCO. `planMio` nace vacío y solo
//    se pintaba dentro del `.then()`; si la carga fallaba no se pintaba
//    nada, ni siquiera el «todavía no tienes un plan».
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8');

let ok = 0, mal = 0;
const check = (n, c, e = '') => {
  if (c) { ok++; console.log(`  PASA  ${n}`); }
  else { mal++; console.log(`  FALLA ${n}${e ? '\n        ' + e : ''}`); }
};

// Qué vistas tienen toast propio. Se calcula del HTML en vez de escribirlo
// a mano: la lista cambia y una copia se queda vieja sin avisar.
function vistasConToast() {
  const re = /<div class="app-view" data-view="([^"]+)"/g;
  const marcas = [];
  let m;
  while ((m = re.exec(HTML))) marcas.push({ v: m[1], i: m.index });
  marcas.push({ v: '(fin)', i: HTML.length });
  const con = new Set(), todas = [];
  for (let k = 0; k < marcas.length - 1; k++) {
    todas.push(marcas[k].v);
    if (/class="toast" id="/.test(HTML.slice(marcas[k].i, marcas[k + 1].i))) con.add(marcas[k].v);
  }
  return { con, todas };
}

console.log('\n— Un aviso que no se ve es un aviso perdido —');
{
  const { con, todas } = vistasConToast();
  // No es un caso raro: la mayoría de las vistas no tiene toast, así que
  // arreglarlo una a una dejaría el agujero abierto para la siguiente.
  check('hay vistas sin toast propio', todas.length > con.size,
    `${con.size} de ${todas.length} lo tienen`);
  check('y planedit es una de ellas', !con.has('planedit'),
    'si algún día se le pone uno, este arreglo sigue siendo correcto');
  check('y diario también', !con.has('diario'));

  const fn = APP.slice(APP.indexOf('function toast(id, msg)'),
                       APP.indexOf('function toast(id, msg)') + 1200);
  // La comprobación barata que cubre las dos cosas: que el elemento no
  // exista, y que exista pero esté en una vista oculta.
  check('toast mira si de verdad se está pintando', /offsetParent === null/.test(fn),
    'sin esto se le añade la clase a algo invisible y no pasa nada');
  check('y busca uno en la vista activa', /\.app-view\.active[\s\S]{0,200}querySelector\('\.toast'\)/.test(fn));
  check('y si no hay, lo crea', /createElement\('div'\)[\s\S]{0,120}className = 'toast'/.test(fn),
    'doce vistas no tienen toast; sin esto seguirían mudas');
  // Cuando el pedido SÍ se ve —que es lo normal— no puede cambiar nada.
  check('el camino normal sigue igual', /var el = document\.getElementById\(id\);/.test(fn));
  check('y sigue quitándose solo', /classList\.remove\('show'\); \}, 1600\)/.test(fn));
}

console.log('\n— El editor ya no manda avisos a otra pantalla —');
{
  const ed = APP.slice(APP.indexOf('function abrirEditorPlan('),
                       APP.indexOf("document.getElementById('peQuitar')"));
  // Iba a `toastAdmin`, que vive en la vista `admin`.
  check('el aviso de no sobrescribir ya no va al toast de admin',
    !/toast\('toastAdmin'/.test(ed),
    'ese vive en la vista admin y desde el editor no se ve');
  check('y sigue diciendo lo importante', /No guardes o lo sobrescribes/.test(ed),
    'es lo que evita que un entrenador borre el plan de alguien');
}

console.log('\n— El plan se guarda en el teléfono —');
{
  check('hay copia local', /var PLAN_KEY = 'macros\.plan';/.test(APP));
  check('se guarda tras cargar con señal', /guardarMiPlan\(\);/.test(APP));
  check('y se lee antes de pedir nada',
    /if\(cargarMiPlanGuardado\(\)\) pintarMiPlan\(\);/.test(APP));
  // Por usuario: la comida de alguien no puede salir en la sesión de otro.
  const cg = APP.slice(APP.indexOf('function cargarMiPlanGuardado('),
                       APP.indexOf('function pintarMiPlan('));
  check('y es de quien es', /d\.dueno !== sesion\.user\.id/.test(cg));
  check('al cerrar sesión se borra', /removeItem\(PLAN_KEY\)/.test(APP));
  // Si le quitaron el plan, la copia tiene que irse: si no, el teléfono
  // seguiría enseñando un plan que ya no existe.
  const gm = APP.slice(APP.indexOf('function guardarMiPlan('),
                       APP.indexOf('function cargarMiPlanGuardado('));
  check('sin plan, la copia se tira', /else localStorage\.removeItem\(PLAN_KEY\)/.test(gm));
}

console.log('\n— Y sin señal no se queda en blanco —');
{
  const cp = APP.slice(APP.indexOf('function cargarPlan('),
                       APP.indexOf("document.getElementById('planMio').addEventListener"));
  // ANTES: el catch solo avisaba. Como `planMio` nace vacío, la pestaña se
  // quedaba sin nada: ni el plan, ni el «todavía no tienes uno».
  check('el catch pinta, no solo avisa', /pintarMiPlan\(red && !MI_PLAN\)/.test(cp),
    'sin esto la pestaña se queda vacía justo cuando más falta hace');
  check('y distingue la falta de red', /var red = sinConexion\(e\);/.test(cp));
  // «Todavía no tienes un plan» es una afirmación, y sin conexión no se ha
  // podido comprobar: quien la lee se queda esperando a un entrenador que a
  // lo mejor ya se lo escribió.
  const pm = APP.slice(APP.indexOf('function pintarMiPlan('), APP.indexOf('function escapar('));
  check('sin red no se afirma que no hay plan', /function pintarMiPlan\(sinRed\)/.test(pm));
  check('se dice que no se pudo comprobar', /No pude comprobar si tienes un plan/.test(pm));
  check('y el mensaje de siempre sigue para cuando sí hay red',
    /Todavía no tienes un plan/.test(pm));
  // Y no se suelta «este es tu último plan guardado» cuando no hay ninguno.
  check('no se promete un plan guardado que no existe',
    /if\(red && !MI_PLAN\) return;/.test(cp));
}

console.log('\n— Tocar un nombre abre cómo va, no el editor —');
{
  check('existe la ficha', /data-view="cliente"/.test(HTML));
  // El plan se escribe una vez y se consulta veinte: lo que se quiere al
  // tocar un nombre es saber como va esa persona.
  const lista = APP.slice(APP.indexOf("caja.addEventListener('click'"), APP.indexOf('// ---- Editor ----'));
  check('el nombre lleva a la ficha', /abrirFichaCliente\(c\)/.test(lista));
  check('y ya no al editor', !/abrirEditorPlan\(c\)/.test(lista));
  check('el editor queda en un botón de la ficha', HTML.includes('id="fcEditarPlan"'));
  check('y la ficha tiene toast propio', /id="toastCliente"/.test(HTML));

  const f = APP.slice(APP.indexOf('function abrirFichaCliente('), APP.indexOf("document.getElementById('fcEditarPlan')"));
  // Si mientras llegan los numeros se abre otra persona, pintarlos mezclaria
  // las cifras de uno con el nombre de otro.
  check('una respuesta que llega tarde se descarta',
    /if\(!fichaDe \|\| fichaDe\.id !== c\.id\) return;/.test(f));
  // «Cargando…» puesto para siempre parece que la app se colgo.
  check('si falla, no se queda en «Cargando»', /No pude traer sus números/.test(f));
}

console.log('\n— Los números van con su comparación —');
{
  const p = APP.slice(APP.indexOf('function pintarMetricas('), APP.indexOf('function pintarAnalisisCliente('));
  // Un numero solo no dice nada: 1.850 calorias es mucho o poco segun la
  // meta, y «3 dias» depende de cuantos.
  check('las calorías llevan su meta al lado', /Su meta son ' \+ mil\(m\.meta_cal\)/.test(p));
  check('la proteína también', /Su meta son ' \+ m\.meta_p/.test(p));
  check('las sesiones llevan los días que le tocan', /Su plan son ' \+ m\.dias_entreno/.test(p));
  check('y el cardio su meta', /Su meta son ' \+ m\.meta_cardio/.test(p));
  // Es la trampa de la que avisa la propia funcion de base de datos.
  check('se avisa de que la media es por día apuntado',
    /no entre siete/i.test(p), 'sin eso se lee como media de la semana y se decide mal');
  check('los cambios de peso llevan signo', /d > 0 \? '\+' : ''/.test(APP));
  // Lo escribe una persona -la nota del chequeo- y acaba en innerHTML.
  check('lo que escribe la persona va escapado', /escapar\(etiqueta\)[\s\S]{0,200}escapar\(/.test(APP));
}

console.log('\n— El análisis se guarda para no volver a pagarlo —');
{
  const a = APP.slice(APP.indexOf("document.getElementById('fcAnalizar')"), APP.indexOf('// ---- Los paneles'));
  check('se pide con accion cliente', /accion: 'cliente'/.test(a));
  check('y se le mandan las métricas', /metricas: METRICAS/.test(a));
  // Un analisis cuesta una consulta del tope; con veinte clientes, abrir
  // cada ficha se comeria el tope antes de acabar la lista.
  check('se guarda al momento', /analisis_cliente\?on_conflict=cliente_id/.test(a));
  check('pisando el anterior, no acumulando', /merge-duplicates/.test(a));
  check('con los números que lo generaron', /datos: METRICAS/.test(a));
  // El texto ya esta en pantalla: que no se guarde solo significa que la
  // proxima costara otra consulta, no que se haya perdido.
  check('si no se puede guardar, se dice sin borrarlo',
    /costará otra consulta/.test(a));
  check('nace oculto hasta que se pide', /id="fcAnalisisCard"[^>]*hidden/.test(HTML));
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);
