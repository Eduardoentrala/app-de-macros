// El cronómetro de la sesión, y el día que ya no se borra de un toque.
//
// DOS COSAS QUE PEDÍA LA PANTALLA DE RUTINA:
//
//   · Saber cuánto llevas entrenando. No había nada: el único reloj era el
//     del descanso entre series, que es otra cosa.
//   · Y que «Borrar día» no se lleve por delante el día entero —pestaña,
//     ejercicios y series— con un solo toque, sin preguntar, desde un
//     botón de quince píxeles que flota encima de las tarjetas.
//
// Lo delicado del cronómetro no es contar: es CUÁNDO arranca, cuándo se
// para y qué pasa si la app se cierra a mitad. Se guarda el instante de
// arranque y no los segundos contados, porque entrenar con el teléfono en
// el bolsillo es lo normal.
//
// Y lo que nunca puede pasar: que al abrir la app diga «llevas diecinueve
// horas entrenando» porque quedó uno de ayer encendido. Eso es peor que no
// enseñar nada.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const CSS = readFileSync(join(RAIZ, 'docs', 'estilos', 'pantallas.css'), 'utf8');

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
console.log('\nEl tiempo se dice como se lee');
{
  const fmtLargo = new Function('return ' + sacar('function fmtLargo(seg){'))();
  for (const [seg, txt] of [[0, '0:00'], [9, '0:09'], [61, '1:01'], [599, '9:59'],
                            [2901, '48:21'], [3600, '1:00:00'], [3912, '1:05:12']]) {
    ok(fmtLargo(seg) === txt, `${seg} s se dice «${txt}»`, 'salió «' + fmtLargo(seg) + '»');
  }
  ok(!/0:48:21/.test(fmtLargo(2901)), 'y por debajo de la hora no sobra un cero',
     'un «0:48:21» en una rutina de 48 minutos se lee como un reloj roto');
}

// ------------------------------------------------------------------
console.log('\nArranca al marcar la primera serie, no al entrar');
{
  const chk = APP.slice(APP.indexOf("var chk = e.target.closest('.set-check');"));
  ok(/var marcada = chk\.classList\.toggle\('done'\);[\s\S]{0,200}?if\(marcada\) arrancarCrono\(\);/.test(chk),
     'solo al MARCAR, no al desmarcar',
     'desmarcar es corregirse, no empezar a entrenar');
  ok(!/arrancarCrono\(\)[\s\S]{0,80}loadDay/.test(APP),
     'y no al abrir la pantalla',
     'entrar a mirar qué toca hoy no es empezar: un cronómetro que arranca al ' +
     'abrir miente en cuanto alguien echa un vistazo y se va');

  // El reloj de descanso TAMBIÉN marca la serie, así que también arranca.
  const reloj = APP.slice(APP.indexOf("var clock = e.target.closest('.clock-btn');"));
  ok(/palomita\.classList\.add\('done'\);[\s\S]{0,300}?arrancarCrono\(\);/.test(reloj),
     'y poner el descanso también lo arranca',
     'si poner el descanso cuenta como marcar la serie —y el código dice que ' +
     'sí—, cuenta como haber empezado');
}

// ------------------------------------------------------------------
console.log('\nY se para al guardar la sesión');
{
  ok((APP.match(/pararCrono\(\);/g) || []).length >= 2,
     'por los dos caminos del guardado',
     'hay una salida temprana cuando no hay sesión, y es la que más se olvida');
  ok(/pararCrono\(\);\n      toast\('toastRutina', \(opciones && opciones\.sola/.test(APP),
     'y en el camino bueno, justo antes de avisar');
  ok(/'Llevabas dos horas: guardé tu sesión sola · '/.test(APP),
     'y el aviso dice si la cerró la app',
     '«Sesión guardada» a secas, sin haberla pulsado, se lee como un fallo');
}

// ------------------------------------------------------------------
console.log('\nSobrevive a cerrar la app, al cambio de día y a lo que haga falta');
{
  // EJECUTADO, con el reloj y el almacén de mentira. Cada caso con su
  // cierre nuevo: `sesionInicio` vive dentro y arrastraría el anterior.
  const crear = (guardado, hoy, ahora) => new Function('guardado', 'hoy', 'ahora',
    'var sesionInicio = null, cronoTick = null, quitado = false;' +
    'var CLAVE_SESION = "k";' +
    'var localStorage = { getItem: function(){ return guardado; },' +
    '  removeItem: function(){ quitado = true; }, setItem: function(){} };' +
    'var Date = { now: function(){ return ahora; } };' +
    'function iso(){ return hoy; }' +
    'var HOY = null;' +
    'function setInterval(){ return 1; }' +
    'function clearInterval(){}' +
    'function pintarCrono(){}' +
    'function pararCrono(){ sesionInicio = null; }' +
    sacar('function recuperarCrono(){') + '\n' +
    'recuperarCrono();' +
    'return { sesionInicio: sesionInicio, quitado: quitado };'
  )(guardado, hoy, ahora);

  const HOY = '2026-10-27';
  const AHORA = Date.parse(HOY + 'T18:00:00Z');
  const haceUnaHora = AHORA - 3600 * 1000;

  const vivo = crear(HOY + '|' + haceUnaHora, HOY, AHORA);
  ok(vivo.sesionInicio === haceUnaHora, 'uno de hace una hora se recupera',
     'cerrar la app a mitad del entrenamiento es lo normal');

  // NADA DE LO QUE PASE CON EL TIEMPO LO CORTA. Aquí había dos condiciones
  // —que fuera de HOY y de menos de seis horas— y las dos cortan
  // entrenamientos de verdad:
  //
  //  · El día cambia a mitad de la serie si se entrena de noche: empezar a
  //    las 23:40 y guardar a las 00:20 borraba el cronómetro al recargar.
  //  · Y seis horas era decidir por la persona cuánto puede durar lo suyo.
  //
  // Lo único que lo para es guardar la sesión.
  const ayer = crear('2026-10-26|' + haceUnaHora, HOY, AHORA);
  ok(ayer.sesionInicio === haceUnaHora && !ayer.quitado,
     'y uno empezado ayer también, aunque el día haya cambiado',
     'entrenar de noche cruza la medianoche, y eso no es un fallo');

  const largo = crear(HOY + '|' + (AHORA - 7 * 3600 * 1000), HOY, AHORA);
  ok(largo.sesionInicio === AHORA - 7 * 3600 * 1000 && !largo.quitado,
     'y uno de hace siete horas sigue ahí',
     'no se corta el tiempo de algo que todavía no se ha guardado');

  // Lo que sí se descarta: lo que no es un instante, y uno en el FUTURO
  // —eso no es un entrenamiento largo, es un reloj movido, y enseñaría
  // tiempo en negativo—.
  const futuro = crear(HOY + '|' + (AHORA + 60000), HOY, AHORA);
  ok(futuro.sesionInicio === null && futuro.quitado,
     'pero un arranque en el futuro no',
     'daría un cronómetro en negativo');

  for (const [q, v] of [['vacío', ''], ['basura', 'xxxx'],
                        ['sin número', HOY + '|'], ['nulo', null]]) {
    const r = crear(v, HOY, AHORA);
    ok(r.sesionInicio === null, `y ${q} no arranca nada`,
       'salió ' + r.sesionInicio);
  }
  // Y el formato viejo, con fecha delante, se sigue entendiendo: hay
  // teléfonos con uno guardado ahora mismo.
  const soloInstante = crear(String(haceUnaHora), HOY, AHORA);
  ok(soloInstante.sesionInicio === haceUnaHora, 'y vale con o sin la fecha delante');
}

// ------------------------------------------------------------------
console.log('\nA las dos horas se cierra sola, GUARDANDO');
{
  // No es un tope que corte el tiempo y lo tire —eso es justo lo que se
  // quitó—: es guardar la sesión. Dos horas es más de lo que dura
  // cualquier entrenamiento, así que llegar ahí significa que se olvidó el
  // botón, y lo que no puede pasar es que el trabajo de esa tarde se quede
  // sin registrar porque nadie lo pulsó.
  const correr = (segundos, inicio) => {
    const llamadas = [];
    return new Function('segundos', 'inicio', 'llamadas',
      'var sesionInicio = inicio, cronoTick = 1, guardandoSesion = false;' +
      // EL UMBRAL SE LEE DEL CÓDIGO, no se copia aquí. Escrito a mano, esta
      // prueba seguía pasando con el tope cambiado a una hora: comprobaba
      // su propia copia. Se vio mutando.
      (APP.match(/var TOPE_AUTO = [^;]+;/) || ['var TOPE_AUTO = 0;'])[0] +
      'var cerrandoSola = false;' +
      'var CLAVE_SESION = "k";' +
      'var localStorage = { removeItem: function(){}, setItem: function(){}, getItem: function(){ return ""; } };' +
      'var ahora = inicio + segundos * 1000;' +
      'var Date = function(ms){ this.ms = ms; };' +
      'Date.now = function(){ return ahora; };' +
      'function isoDe(d){ return "dia(" + d.ms + ")"; }' +
      'function clearInterval(){}' +
      'function toast(_i, t){ llamadas.push({ aviso: t }); }' +
      'function traducirError(m){ return m; }' +
      'function guardarSesionAhora(o){ llamadas.push({ guardado: o }); }' +
      'var pintado = null;' +
      'var document = { getElementById: function(){ return { hidden: true,' +
      '  querySelector: function(){ return { set textContent(v){ pintado = v; } }; } }; } };' +
      sacar('function fmtLargo(seg){') + '\n' +
      sacar('function pintarCrono(){') + '\n' +
      sacar('function cerrarSesionSola(seg){') + '\n' +
      sacar('function pararCrono(){') + '\n' +
      'pintarCrono();' +
      'return { llamadas: llamadas, sesionInicio: sesionInicio, pintado: pintado };'
    )(segundos, inicio, llamadas);
  };
  const INICIO = 1700000000000;
  const guardadoDe = (r) => (r.llamadas.find((x) => x.guardado) || {}).guardado;

  const antes = correr(119 * 60, INICIO);
  ok(!guardadoDe(antes) && antes.sesionInicio !== null,
     'a la hora cincuenta y nueve sigue corriendo',
     'cerrar antes de tiempo seria cortar un entrenamiento de verdad');
  ok(antes.pintado === '1:59:00', 'y pinta el tiempo', 'pintó ' + antes.pintado);

  const justo = correr(120 * 60, INICIO);
  const g = guardadoDe(justo);
  ok(!!g, 'a las dos horas en punto, guarda');
  ok(g && g.sola === true, 'y marcada como cerrada por la app',
     'el aviso tiene que poder decir que no la guardó la persona');
  // SIN DURACIÓN, A PROPÓSITO. Este cierre salta SIEMPRE a las dos horas
  // en punto, se siguiera entrenando o se hubiera olvidado el botón: 120
  // sería mentira en uno de los dos casos. Y desde que el cierre del lunes
  // mira si las sesiones se acortan, ese 120 inventado le enseñaría lo
  // contrario de lo que pasó. «No lo sé» es un dato; 120 no lo es.
  ok(g && g.minutos === null, 'y SIN duración',
     'salió ' + (g && g.minutos) + ': ver `sesiones-que-se-acortan`');
  ok(justo.sesionInicio === null, 'y el cronómetro se para');

  // LA FECHA ES LA DEL ARRANQUE, no la de hoy. Empezar a las 23:40, cerrar
  // la app y abrirla a las 10:00 salta este cierre: esa sesión es del día
  // en que se entrenó.
  ok(g && g.fecha === 'dia(' + INICIO + ')',
     'y la fecha es la del arranque, no la de hoy',
     'salió ' + (g && g.fecha) + ': guardarla con la de hoy mete el ' +
     'entrenamiento de anoche en el día de mañana');

  const pasado = correr(135 * 60, INICIO);
  ok(!!guardadoDe(pasado) && pasado.sesionInicio === null,
     'y si la app estuvo cerrada y ya se pasó, también cierra',
     'el cierre se mira al pintar, así que salta en cuanto se vuelve a abrir');

  // SE PARA ANTES DE GUARDAR: `pintarCrono` corre cada segundo, así que si
  // el guardado no encontrara nada —una rutina sin pesos— y el cronómetro
  // siguiera vivo, esto se repetiría sesenta veces por minuto.
  const cerrar = sacar('function cerrarSesionSola(seg){');
  ok(cerrar.indexOf('pararCrono();') < cerrar.indexOf('guardarSesionAhora('),
     'y se para ANTES de intentar guardar',
     'si no, una rutina sin pesos lo reintentaría cada segundo');
  ok(/if\(cerrandoSola \|\| guardandoSesion\) return;/.test(cerrar),
     'y no se pisa con un guardado a mano en curso');
}

console.log('\nY la sesión guarda cuánto duró');
{
  // `workout_sessions.duration_min` existe desde la 0001 y no la llenaba
  // nadie. Ahora hay cronómetro, así que hay dato.
  const g = sacar('function guardarSesionAhora(opciones){');
  ok(/duration_min: minutos/.test(g), 'se manda en la fila');
  ok(/Math\.min\(600, Math\.max\(0, Math\.round\(minutos\)\)\)/.test(g),
     'acotado a lo que acepta la columna',
     'fuera de rango no falla ese campo: falla la fila entera y la sesión ' +
     'no se guarda');
  ok(/sesionInicio \? Math\.round\(\(Date\.now\(\) - sesionInicio\) \/ 60000\) : null/.test(g),
     'y sale del cronómetro cuando lo hay');
  ok(/\(opciones && opciones\.minutos != null\)/.test(g),
     'o de quien llama, que es como lo sabe el cierre automático',
     'ahí el cronómetro ya se paró, así que el dato tiene que viajar');
}

// ------------------------------------------------------------------
console.log('\nY mientras corre tampoco se corta');
{
  const pintar = sacar('function pintarCrono(){');
  ok(!/TOPE_SESION/.test(pintar), 'no hay tope que lo retire',
     'retirarlo solo es cortar el tiempo de un entrenamiento sin guardar');
  ok(/if\(seg < 0\)\{ pararCrono\(\); return; \}/.test(pintar),
     'y solo se retira si saliera negativo',
     'eso no es un entrenamiento, es el reloj del teléfono moviéndose');

  // LO ÚNICO QUE LO PARA ES GUARDAR. Tres sitios: los dos caminos del
  // guardado y el de encolarlo sin señal, que también es guardarlo.
  const paradas = (APP.match(/pararCrono\(\);/g) || []).length;
  ok(paradas === 5, `se para en ${paradas} sitios`,
     'tres son los del guardado —con sesión, sin sesión y encolado—, el ' +
     'cuarto el del reloj movido y el quinto el cierre de las dos horas, ' +
     'que guarda antes. Uno más y hay que mirar cuál: cada sitio que lo ' +
     'pare sin guardar es tiempo de entrenamiento que se tira');
}

// ------------------------------------------------------------------
console.log('\nEl chip tiene su sitio y nace escondido');
{
  ok(/id="cronoSesion" hidden/.test(HTML), 'nace oculto',
     'sin sesión en marcha no hay nada que contar');
  ok(/id="cronoSesion"[^>]*>[\s\S]{0,400}?<b class="t">/.test(HTML),
     'y el número tiene su propio hueco');
  ok(!/<button[^>]*id="cronoSesion"/.test(HTML), 'y no es un botón',
     'es un dato, no se toca: el que se toca es el del descanso');
  ok(/<p class="crono-sesion"[^>]*id="cronoSesion"/.test(HTML),
     'y es texto, no un chip',
     'un chip pide que lo toques; esto solo se lee');
}

// ------------------------------------------------------------------
console.log('\nY borrar un día pregunta antes');
{
  const h = APP.slice(APP.indexOf("document.getElementById('deleteDayBtn').addEventListener"));
  ok(/if\(!btn\.classList\.contains\('confirmando'\)\)\{/.test(h),
     'el primer toque pregunta en vez de borrar',
     'antes un toque se llevaba la pestaña, sus ejercicios y sus series');
  ok(/btn\.textContent = '¿Borrar «' \+ active\.textContent\.trim\(\) \+ '»\?'/.test(h),
     'y dice QUÉ día va a borrar',
     'un «¿seguro?» a secas no ayuda a quien se equivocó de pestaña');
  ok(/setTimeout\(reposarBorrado, 4000\)/.test(h), 'y se desarma solo',
     'un botón que se queda armado sin que nadie mire es el mismo fallo con ' +
     'un paso más');
  ok(/reposarBorrado\(\);\n    var t = activeTab\(\);/.test(APP),
     'renombrar lo desarma');
  ok(/function loadDay\(tab\)\{\n[^\n]*\n    if\(typeof reposarBorrado === 'function'\) reposarBorrado\(\);/.test(APP),
     'y cambiar de día también',
     'una pregunta armada en otra pestaña borraría la que no es');

  ok(/\.day-actions \.btn-delete-day\{color:var\(--ink-faint\)\}/.test(CSS.replace(/\s+/g, ' ').replace(/; \}/g, '}')) ||
     /\.btn-delete-day\{color:var\(--ink-faint\);\}/.test(CSS),
     'en reposo va en gris, no en rojo',
     'el rojo ya no es lo único que protege: ahora pregunta');
  ok(/\.btn-delete-day\.confirmando\{/.test(CSS),
     'y el rojo se guarda para cuando pregunta',
     'pegado a `.btn-delete-day`: la regla del gris lleva las mismas clases y ' +
     'va más abajo, así que suelto empataba y ganaba ella');
}

// ------------------------------------------------------------------
console.log('\nY no satura la cabecera: vive debajo de «Guardar sesión»');
{
  // Nació arriba, al lado del chip del descanso, y eran dos relojes con
  // número pegados: a catorce píxeles los iconos se parecen y había que
  // pararse a leer cuál era cuál, justo en la pantalla donde menos se
  // mira. Y encima empujaba al título, que se posiciona con un hueco fijo
  // de 78 px para UN chip: «Mi Rutina» salía montada encima del reloj.
  //
  // Abajo no compite con nada, y está donde se mira al terminar, que es
  // cuando el número importa.
  ok(!/<div class="back-header[\s\S]{0,900}?id="cronoSesion"/.test(HTML),
     'no está en la cabecera',
     'ahí eran dos relojes y un título peleando por la misma fila');
  ok(/<div class="bottom-bar">[\s\S]{0,1400}?id="cronoSesion"/.test(HTML),
     'está en la barra de abajo');
  ok(/id="saveSessionBtn"[\s\S]{0,900}?id="cronoSesion"/.test(HTML),
     'y debajo de «Guardar sesión», no encima',
     'encima empujaría el botón, que es lo que se busca con el pulgar');

  // Y la cabecera vuelve a tener un solo reloj, con su número.
  ok(/id="timerChip"[\s\S]{0,600}?<span class="t">3:00<\/span>/.test(HTML),
     'y el del descanso conserva el suyo',
     'se le quitó mientras convivían; al separarlos ya no hace falta');

  // El chip del descanso mide 68x32: alto corto para un dedo.
  ok(/#timerChip::after\{/.test(CSS) && /#timerChip[\s\S]{0,220}?min-height:44px/.test(CSS),
     'y tiene su zona de 44, que no tenía',
     'no se agranda el chip: crecerlo movería la cabecera entera');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
