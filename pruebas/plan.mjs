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
  // meta, y «3 dias» depende de cuantos. La comparacion va PEGADA al valor
  // y no en una nota debajo de cada linea, que convertia la tarjeta en un
  // muro de texto donde no se veia ninguna cifra.
  check('las calorías llevan su meta al lado', /'de ' \+ mil\(m\.meta_cal\)/.test(p));
  check('la proteína también', /'de ' \+ m\.meta_p/.test(p));
  check('las sesiones llevan los días que le tocan', /'de ' \+ m\.dias_entreno/.test(p));
  check('y el cardio su meta', /'de ' \+ m\.meta_cardio/.test(p));
  // Es la trampa de la que avisa la propia funcion de base de datos.
  check('se avisa de que la media es por día apuntado',
    /no entre siete/i.test(p), 'sin eso se lee como media de la semana y se decide mal');
  check('los cambios de peso llevan signo', /d > 0 \? '\+' : ''/.test(APP));
  // Lo escribe una persona -la nota del chequeo- y acaba en innerHTML.
  check('lo que escribe la persona va escapado', /escapar\(etiqueta\)[\s\S]{0,200}escapar\(/.test(APP));

  // LO QUE HACE QUE ESTO SEA MINIMALISTA: sin datos, la tarjeta se colapsa
  // en una linea. La primera version pintaba las cuatro siempre, y para
  // alguien recien llegado eran VEINTE filas con un guion cada una.
  check('una tarjeta sin datos se colapsa', /function tarjetaVacia\(/.test(APP));
  check('y si no hay NADA, una sola frase',
    /Todavía no hay nada suyo que mirar/.test(p));
  check('lo de fotos se omite entero si no hay', /if\(haySentir\)\{/.test(p),
    'una tarjeta diciendo «no hay» de algo opcional es ruido puro');
  // El valor ya no usa .calc-line, que es de 22 px y hacia que «0 de los
  // ultimos 7» saliera enorme y partido encima de la etiqueta.
  check('las filas tienen estilo propio, no el del número grande',
    /class="fc-fila"/.test(APP) && !/calc-line/.test(p));
}

console.log('\n— El análisis se guarda para no volver a pagarlo —');
{
  const a = APP.slice(APP.indexOf("document.getElementById('fcAnalizar')"), APP.indexOf('// ---- Los paneles'));
  check('se pide con accion cliente', /accion: 'cliente'/.test(a));
  check('y se le mandan las métricas', /metricas: METRICAS/.test(a));
  // El servidor comprueba con este id que quien pide puede ver a esa
  // persona. Sin mandarlo, la funcion responde 400 y el boton no hace nada.
  check('y el id de quien es', /cliente: fichaDe\.id/.test(a),
    'el servidor lo exige para comprobar el permiso');
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

console.log('\n— Y el servidor no se fía del cuerpo —');
{
  const FN = readFileSync(join(RAIZ, 'supabase', 'functions', 'asistente', 'index.ts'), 'utf8');
  const a = FN.slice(FN.indexOf("if (accion === 'cliente')"),
                     FN.indexOf("return json({ error: 'Acción desconocida.' }"));
  check('existe la acción en la función', a.length > 100);
  // La app ya saca los números con `plan_metricas`, que comprueba
  // `puede_ver`. Pero la función los recibe por el CUERPO de la petición, y
  // cualquiera puede mandar lo que quiera: sin esto, un cliente pediría el
  // «análisis» de otro con solo su id.
  check('exige el id de la persona', /Falta a quién/.test(a));

  // ESTO COMPROBABA LA REGLA ESCRITA A MANO AQUÍ DENTRO, y por eso se puso
  // rojo al sacarla a `mandaSobre()`. Sacarla era el arreglo: la misma regla
  // hacía falta en la acción `plan`, que recibe un id ajeno igual y no
  // comprobaba nada. Escrita en un solo sitio, se arregla una vez.
  //
  // Lo que HACE la regla —quién puede sobre quién— se ejecuta de verdad en
  // plan-de-otro.mjs, con roles y asignaciones de mentira. Aquí solo importa
  // que esta acción la llame y CORTE con lo que devuelva.
  check('y comprueba si puede pedir sobre esa persona',
    /const noPuede = await mandaSobre\(admin, userId, cliente\)/.test(a),
    'sin esto cualquiera analizaría a cualquiera sabiendo su id');
  // NO BASTA CON QUE LA LLAMADA ESTÉ: hay que USAR lo que devuelve. Se probó
  // borrando solo esta línea y la comprobación de arriba seguía pasando.
  // Es el mismo tropiezo que ya hubo con sbQuitarAlimento y con el guardado
  // del alimento sin señal.
  check('y CORTA si no puede',
    /if \(noPuede\) return json\(\{ error: noPuede \}, 403\)/.test(a),
    'la llamada sola no protege nada si nadie mira lo que devuelve');

  // Y la regla, donde vive ahora.
  // Desde su comentario de cabecera, que es donde se explica por que no se
  // puede usar puede_ver aqui dentro.
  const regla = FN.slice(FN.indexOf('// ¿PUEDE ESTA PERSONA ACTUAR EN NOMBRE DE OTRA?'),
                         FN.indexOf('function json(cuerpo'));
  check('el super admin pasa igual', /rol === 'super_admin'/.test(regla));
  // Mirar solo que esté el MENSAJE «Esto es para entrenadores» no sirve,
  // porque el texto sigue ahí aunque la condición que lleva a él se ponga en
  // `false`. Se comprueba la CONDICIÓN.
  check('y un cliente normal no',
    /if \(rol !== 'coach' && rol !== 'org_admin'\)/.test(regla),
    'el mensaje puede estar ahí y no alcanzarse nunca');
  check('con su motivo', /Esto es para entrenadores/.test(regla));
  // `puede_ver` no sirve aquí: la función corre con clave de servicio y
  // dentro `auth.uid()` vale null, así que devolvería falso siempre.
  check('y se explica por qué no se usa puede_ver', /auth\.uid\(\)`? vale null/.test(regla));

  const p = FN.slice(FN.indexOf('const SISTEMA_CLIENTE'), FN.indexOf('Deno.serve('));
  // La tentación del modelo aquí es rellenar huecos con lo que suele pasar,
  // y un entrenador que lee eso decide sobre algo que nadie midió.
  check('se le prohíbe suponer', /SOLO LOS NÚMEROS QUE TE DOY/.test(p));
  check('lo primero es si está apuntando', /LO PRIMERO, SI ESTÁ APUNTANDO/.test(p));
  check('se le avisa de que las medias son por día apuntado',
    /POR DÍA APUNTADO/.test(p));
  check('y de que el peso de un día no es tendencia',
    /EL PESO DE UN DÍA NO ES UNA TENDENCIA/.test(p));
  check('no diagnostica ni receta', /NO DIAGNOSTICAS NI RECETAS/.test(p));
  // Es lo unico que se escribe SOBRE alguien y no PARA alguien.
  check('y sabe que no lo lee el cliente', /ella no va a leer esto/.test(p));
}

console.log('\n— Cuánto le toca comer, arriba del plan —');
{
  // Para que la persona sepa cuánto está comiendo sin contar, y el
  // entrenador vea contra qué números se armó.
  const t = APP.slice(APP.indexOf('function tiraDeMetas('), APP.indexOf('function pintarMiPlan('));
  check('están los cuatro', /CALORÍAS/.test(t) && /PROTEÍNA/.test(t) &&
                            /CARBOS/.test(t) && /GRASAS/.test(t));
  check('las calorías salen de los macros', /m\.P \* 4 \+ m\.C \* 4 \+ m\.G \* 9/.test(t));
  check('sale en el plan de la persona', /tiraDeMetas\(leerMetas\(\)\)/.test(APP));
  check('y en el editor, con las del cliente', /cliente\.metas \? tiraDeMetas\(cliente\.metas\)/.test(APP));
  check('hay sitio para ella en el editor', /id="peMetas"/.test(HTML));
  // Sale del PERFIL y no se guarda con el plan: si el entrenador cambia las
  // metas, la tira cambia y el plan no, y esa diferencia es justo la señal
  // de que hay que rearmarlo.
  check('se explica que sale del perfil', /Sale del PERFIL, no se guarda con el plan/.test(APP));
}

console.log('\n— El editor no corta el texto —');
{
  const e = APP.slice(APP.indexOf('function pintarEditorComidas('), APP.indexOf('function volcarDiaActual('));
  // Con `rows=3` fijo, una comida de cuatro renglones se queda con scroll
  // DENTRO del recuadro: se ve cortada arriba y abajo.
  check('los campos crecen con el texto', /scrollHeight/.test(e));
  check('y al escribir también', /addEventListener\('input', function\(\)\{ crecer\(t\); \}\)/.test(e));
}

console.log('\n— El entrenador ve QUÉ calorías se cambiaron y POR QUÉ —');
{
  // El cierre de semana lleva ajustando calorías desde la 0024 y el motivo
  // SIEMPRE se guardó —«para el historial, no para la pantalla»—. Pero no lo
  // leía nadie: el entrenador se encontraba a alguien comiendo distinto sin
  // saber por qué ni desde cuándo.
  const p = APP.slice(APP.indexOf('function pintarMetricas('),
                      APP.indexOf('function pintarAnalisisCliente('));
  check('se pintan los ajustes', /Ajustes de calorías/.test(p));
  check('con las dos cifras', /a\.antes[\s\S]{0,260}a\.despues/.test(p));
  check('y con el motivo, que es lo que se lee', /a\.motivo/.test(p),
    'la cifra sola no dice si fue por hambre, por sueño o por bajar rápido');
  check('con flecha según suba o baje', /sube \? '↑' : '↓'/.test(p));

  // ---- Y desde que el entrenador las mueve a mano, LAS DOS EN LA MISMA
  //      LISTA. Separadas, la tarjeta decía «bajó a 1800 el lunes» mientras
  //      la persona comía 1600 desde el miércoles, y nada explicaba el salto.
  check('los ajustes a mano se mezclan con los del cierre',
    /\.concat\(\(m\.ajustes_mano \|\| \[\]\)/.test(p),
    'unas calorías tienen UNA historia, no una de la máquina y otra de las personas');
  check('y la lista va ordenada por fecha', /\.sort\(function\(a, b\)/.test(p),
    'sin ordenar, lo de mano sale todo junto al final y no se lee la secuencia');
  check('diciendo de quién fue cada uno', /escapar\(a\.quien\)/.test(p),
    'con las dos fuentes juntas hay que poder distinguir quién decidió qué');
  // Las semanas sin ajuste ya se ven en el hambre y la energía de arriba;
  // listarlas diciendo «no se cambió nada» llena la tarjeta de filas mudas.
  check('solo las semanas en que SÍ se movió algo',
    /x\.ajusto && x\.cal_despues/.test(p));
  check('y la tarjeta no sale si no hubo ninguno', /if\(ajustes\.length\)\{/.test(p));
  check('se dice quién lo decide', /El cierre de cada semana las decide/.test(p));
  // Y DÓNDE se cambian. El pie decía «en su perfil», que es donde NO está:
  // el botón vive en esta misma ficha.
  check('y dónde cambiarlas a mano', /Ajustar sus [\s\S]{0,12}calorías/.test(p));

  // Y que el servidor los mande: sin esto la tarjeta nunca tendría datos.
  const SQL = readFileSync(join(RAIZ, 'supabase', 'migrations',
                                '0044_el_coach_ve_los_ajustes.sql'), 'utf8');
  check('plan_metricas devuelve los cierres', /'chequeos', \(/.test(SQL));
  check('con el motivo y las dos cifras',
    /'motivo',\s+x\.motivo/.test(SQL) && /'cal_antes',\s+x\.cal_antes/.test(SQL));
  // Seis y no uno: un ajuste suelto no dice nada, y lo que hace falta ver es
  // la secuencia —«le subimos dos semanas seguidas y siguió subiendo»—.
  check('y los seis últimos, no solo el último', /limit 6/.test(SQL));
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);
