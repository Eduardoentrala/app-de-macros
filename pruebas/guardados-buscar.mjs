// El buscador de Guardados y la entrada a Frecuentes.
//
// Dos fallos distintos que se veían igual desde fuera —"escribo y no pasa
// nada"— y que en realidad no tenían nada que ver el uno con el otro:
//
//   1. Los campos de búsqueda existían en el HTML desde el maquetado, pero
//      sin `id` y sin nadie escuchándolos. Eran un dibujo. Escribías y, en
//      efecto, no pasaba nada, porque no había código al que le importara.
//
//   2. `veces_usado` se creó en la migración 0001, con índice y todo, y
//      NUNCA se incrementaba. Frecuentes filtraba por `veces > 0`, así que
//      estaba vacía para todo el mundo desde el primer día. Una columna que
//      nadie escribe no da error: da una pantalla vacía que parece normal.
//
// Se prueba sobre el archivo de verdad, sacando las funciones con `vm`, no
// sobre una copia: una copia se queda atrás y deja de valer.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8');
const SQL = readFileSync(
  join(RAIZ, 'supabase', 'migrations', '0032_contar_uso_alimento.sql'), 'utf8');

let ok = 0, mal = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { mal++; console.log(`  FALLA ${n}${extra ? '\n        ' + extra : ''}`); }
};

// Saca una función del app.js de verdad y la deja ejecutable aquí.
function sacar(nombre, extra = '') {
  const i = APP.indexOf(`function ${nombre}(`);
  if (i < 0) throw new Error(`no encontré ${nombre}()`);
  // Cuenta llaves hasta cerrar. Basta: el código no tiene llaves sueltas
  // dentro de cadenas en estas funciones.
  let n = 0, j = APP.indexOf('{', i);
  const ini = j;
  for (; j < APP.length; j++) {
    if (APP[j] === '{') n++;
    else if (APP[j] === '}') { n--; if (!n) break; }
  }
  return `${extra}\n${APP.slice(i, j + 1)}`;
}

console.log('\n— Los campos existen y alguien los escucha —');
{
  check('el buscador de alimentos tiene id', /id="buscarMisAlim"/.test(HTML));
  check('el de recetas tiene id', /id="buscarRecetas"/.test(HTML));
  // Lo que faltaba de verdad: el oyente.
  const i = APP.indexOf("['buscarMisAlim', 'buscarRecetas']");
  check('los dos repintan al escribir',
    i > 0 && /addEventListener\('input', pintarListas\)/.test(APP.slice(i, i + 320)));
  // `input` y no `change`: con `change` habría que salir del campo para ver
  // resultados, que es casi tan inútil como no tener buscador.
  check('filtra mientras se teclea, no al salir del campo',
    i > 0 && !/addEventListener\('change', pintarListas\)/.test(APP.slice(i, i + 320)));
}

console.log('\n— Filtrar encuentra lo que hay —');
{
  const ctx = vm.createContext({});
  vm.runInContext(
    sacar('normalizarBusqueda') + '\n' + sacar('filtrar') + '\n' +
    'this.normalizarBusqueda = normalizarBusqueda; this.filtrar = filtrar;', ctx);

  const lista = [
    { n: 'Pechuga de pollo' }, { n: 'Plátano' },
    { n: 'Atún en agua' }, { n: 'Piña' }
  ];
  const nombres = (t) => ctx.filtrar(lista, ctx.normalizarBusqueda(t), 'n').map(x => x.n);

  check('sin texto no filtra nada', ctx.filtrar(lista, '', 'n').length === 4);
  check('encuentra por trozo de en medio',
    nombres('pollo').join() === 'Pechuga de pollo', nombres('pollo').join());
  // Lo que más se teclea mal: sin acentos y en minúscula.
  check('«platano» encuentra «Plátano»',
    nombres('platano').join() === 'Plátano', nombres('platano').join());
  check('«PIÑA» encuentra «Piña»',
    nombres('PIÑA').join() === 'Piña', nombres('PIÑA').join());
  check('lo que no está, no aparece', nombres('lentejas').length === 0);
}

console.log('\n— Y dice claramente cuando no hay —');
{
  const ctx = vm.createContext({});
  vm.runInContext(sacar('escapar') + '\n' + sacar('vacio') + '\n' +
    'this.vacio = vacio;', ctx);

  const SIN_NADA = 'Todavía no has guardado alimentos.';
  const SIN_ESO = 'No tienes «%s» entre tus alimentos guardados.';

  // Los dos vacíos NO pueden decir lo mismo: uno se arregla creando el
  // alimento y el otro borrando lo que escribiste.
  const nada = ctx.vacio(false, '', SIN_NADA, SIN_ESO);
  const noEsa = ctx.vacio(true, 'lentejas', SIN_NADA, SIN_ESO);
  check('sin nada guardado invita a crear', nada.includes('Todavía no has guardado'));
  check('con búsqueda sin resultado nombra lo buscado',
    noEsa.includes('«lentejas»'), noEsa);
  check('los dos mensajes son distintos', nada !== noEsa);

  // El fallo del `$`: en `replace` con cadena de reemplazo, `$&` significa
  // "lo que se acaba de encontrar". Buscar "$&" habría dejado el mensaje
  // como «%s» —el propio hueco— en vez de lo tecleado. Aquí sale escapado
  // (`&` → `&amp;`), que es lo correcto: en pantalla se lee «$&».
  const conDolar = ctx.vacio(true, '$&', SIN_NADA, SIN_ESO);
  check('un «$» tecleado no se expande',
    conDolar.includes('«$&amp;»') && !conDolar.includes('%s'), conDolar);
  // Y no se cuela HTML por el nombre del alimento.
  const conEtiqueta = ctx.vacio(true, '<b>x</b>', SIN_NADA, SIN_ESO);
  check('no se cuela HTML por lo tecleado',
    conEtiqueta.includes('&lt;b&gt;') && !conEtiqueta.includes('<b>'), conEtiqueta);
}

console.log('\n— Frecuentes: a las 5 veces, ni antes ni por vida —');
{
  const ctx = vm.createContext({ FRECUENTES: [], MIS_ALIMENTOS: [] });
  vm.runInContext(
    'var VECES_PARA_FRECUENTE = ' +
      (APP.match(/var VECES_PARA_FRECUENTE = (\d+)/) || [, 'null'])[1] + ';\n' +
    sacar('recalcularFrecuentes') + '\nthis.recalcularFrecuentes = recalcularFrecuentes;' +
    '\nthis.VECES_PARA_FRECUENTE = VECES_PARA_FRECUENTE;', ctx);

  check('el umbral es 5', ctx.VECES_PARA_FRECUENTE === 5, String(ctx.VECES_PARA_FRECUENTE));

  ctx.MIS_ALIMENTOS.push(
    { n: 'Huevo',   veces: 4 },
    { n: 'Avena',   veces: 5 },
    { n: 'Arroz',   veces: 9 },
    { n: 'Nuevo' }              // recién creado: sin `veces` siquiera
  );
  ctx.recalcularFrecuentes();
  const dentro = ctx.FRECUENTES.map(x => x.n);

  check('con 4 usos todavía no entra', !dentro.includes('Huevo'), dentro.join());
  check('con 5 justos entra', dentro.includes('Avena'), dentro.join());
  check('uno recién creado no entra', !dentro.includes('Nuevo'), dentro.join());
  check('el más repetido va primero', dentro[0] === 'Arroz', dentro.join());

  // Se recalcula EN SITIO: conectarLista() guarda una referencia a este
  // array, y reasignarlo le haría perder los clics.
  const mismoArray = ctx.FRECUENTES;
  ctx.MIS_ALIMENTOS[0].veces = 5;
  ctx.recalcularFrecuentes();
  check('no se cambia el array por otro', ctx.FRECUENTES === mismoArray);
  check('al llegar a 5 aparece', ctx.FRECUENTES.map(x => x.n).includes('Huevo'));
}

console.log('\n— El uso se cuenta, que era lo que faltaba —');
{
  const i = APP.indexOf('function contarUso(');
  const trozo = i > 0 ? APP.slice(i, i + 1400) : '';
  check('contarUso() existe', i > 0);
  check('llama a la función de la base',
    /rpc\/registrar_uso_alimento/.test(trozo), trozo.slice(0, 200));
  check('avisa solo la vez que entra, no cada vez',
    /=== VECES_PARA_FRECUENTE/.test(trozo));
  check('un fallo de red no corta el registro de la comida',
    /\['catch'\]/.test(trozo));

  // Que se llame de verdad al apuntar, no solo que exista.
  const j = APP.indexOf('function elegirAlimento(');
  const elegir = APP.slice(j, j + 900);
  check('se cuenta al agregar el alimento', /if\(guardado\) contarUso\(guardado\)/.test(elegir));

  // La ficha a la que se le suma llega de fuera, no se deduce aquí. Por el
  // `id` no valdría: sbAgregarAlimento se lo pisa con el de la fila del
  // diario, y un alimento creado sin conexión aún no tiene id ninguno.
  check('recibe la ficha original, no la busca por id',
    /function elegirAlimento\(a, guardado\)/.test(APP));
  check('se le suma al original, no a la copia que se apunta',
    /elegirAlimento\(Object\.assign\(\{\}, a\), a\)/.test(APP));

  // El catálogo de otras personas se elige por otro camino, con un solo
  // argumento: ahí `guardado` sale undefined y no cuenta, que es lo suyo.
  const k = APP.indexOf("elegirAlimento({ n:nombre");
  check('lo que viene del catálogo no cuenta', k > 0 &&
    !/elegirAlimento\(\{ n:nombre[^)]*\},/.test(APP.slice(k, k + 200)));
}

console.log('\n— La suma la hace la base —');
{
  check('la migración crea la función',
    /create or replace function public\.registrar_uso_alimento/.test(SQL));
  // Sumar desde el teléfono (leer, +1, escribir) pierde usos si apuntas en
  // dos dispositivos a la vez. Aquí la suma es atómica.
  check('suma sobre el valor actual, no manda un número fijo',
    /veces_usado = veces_usado \+ 1/.test(SQL));
  check('marca también cuándo fue', /ultimo_uso\s*=\s*now\(\)/.test(SQL));
  // RLS dice lo que PUEDES tocar; el where dice lo que QUIERES tocar. Un
  // coach ve a sus clientes: sin esto, un id ajeno le subiría el contador.
  check('solo toca lo tuyo', /user_id = auth\.uid\(\)/.test(SQL));
  // `from public` NO basta y esto se vio en la base, no se supuso: Supabase
  // le da execute a `anon` por permisos por defecto del esquema, y esa
  // concesión es suya, no la hereda de PUBLIC. Con solo el primer revoke,
  // has_function_privilege('anon', ...) seguía diciendo true.
  check('se le quita el permiso a PUBLIC',
    /revoke all on function public\.registrar_uso_alimento\(uuid\) from public;/.test(SQL));
  check('y también a anon, que lo tiene por su cuenta',
    /revoke all on function public\.registrar_uso_alimento\(uuid\) from anon;/.test(SQL));
  check('solo la usa quien tiene sesión',
    /grant execute on function public\.registrar_uso_alimento\(uuid\) to authenticated/.test(SQL));
  check('si el alimento ya no está, devuelve 0 en vez de reventar',
    /coalesce\(v_veces, 0\)/.test(SQL));
}

console.log('\n— Al registrar, los buscadores se vacían —');
{
  // Escribir "huevo", apuntarlo y tener que borrarlo a mano para buscar lo
  // siguiente es trabajo que la app puede ahorrarse.
  const i = APP.indexOf('function limpiarBuscadoresDeAlimento(');
  const trozo = i > 0 ? APP.slice(i, i + 900) : '';
  check('existe el vaciado', i > 0);
  check('vacía el de la comida', /mealSearch\.value = '';/.test(trozo));
  check('y también los de guardados y recetas',
    /\['buscarMisAlim', 'buscarRecetas'\]\.forEach/.test(trozo));
  check('quita las sugerencias que quedaban',
    /mealSugeridos\.innerHTML = '';/.test(trozo) && /SUGERIDOS = \[\];/.test(trozo));
  // Sin esto, una búsqueda ya lanzada llega tarde y repinta lo que se
  // acaba de quitar.
  check('corta la búsqueda que venía en camino', /clearTimeout\(relojBusqueda\);/.test(trozo));
  // Si no, las listas se quedan filtradas por una palabra que ya no está
  // escrita en ningún sitio.
  check('devuelve las listas enteras', /pintarListas\(\);/.test(trozo));
}

console.log('\n— Pero cancelar NO borra lo escrito —');
{
  // Entre tocar el alimento y registrarlo está la hoja de la cantidad.
  // Antes el buscador de comida se vaciaba al TOCAR, así que cancelar te
  // dejaba sin la búsqueda sin haber apuntado nada.
  const j = APP.indexOf('function elegirAlimento(');
  const elegir = APP.slice(j, j + 1200);
  check('se vacía al confirmar', /limpiarBuscadoresDeAlimento\(\);/.test(elegir));
  // Y va DESPUÉS de contar el uso: contarUso() repinta las listas y
  // dejarlas filtradas por el texto viejo sería el mismo fallo al revés.
  check('después de contar el uso',
    elegir.indexOf('contarUso(guardado)') < elegir.indexOf('limpiarBuscadoresDeAlimento()'));

  // El vaciado al tocar ya no debe existir en el click de las sugerencias.
  const k = APP.indexOf('mealSugeridos.addEventListener');
  const click = APP.slice(k, k + 900);
  check('el click de una sugerencia ya no lo vacía',
    !/mealSearch\.value = '';/.test(click), click.slice(0, 200));
}

console.log('\n— El del panel de admin se queda como estaba —');
{
  // No es el mismo caso: ahí se navega por el catálogo para editarlo, no
  // se registra nada. Vaciarlo al abrir un alimento perdería el sitio.
  const i = APP.indexOf('function limpiarBuscadoresDeAlimento(');
  check('no toca el buscador del catálogo',
    !/catBuscar/.test(APP.slice(i, i + 900)));
}

console.log('\n— Y la lista vacía explica la regla —');
{
  check('el mensaje dice cuántas veces hacen falta',
    /apuntes ' \+\s*\n?\s*VECES_PARA_FRECUENTE \+ ' veces/.test(APP) ||
    /VECES_PARA_FRECUENTE \+ ' veces/.test(APP));
  // Que no quede escrito "5" a mano en el texto: si mañana cambia el
  // umbral, el mensaje mentiría.
  check('el número no está escrito a mano',
    !/apuntes 5 veces/.test(APP));
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);
