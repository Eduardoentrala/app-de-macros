// Ocho interruptores en el panel, y siete no encendían nada.
//
// Guardaban en `feature_flags`, se volvían a pintar, y debajo ponía «se
// aplican al instante para todos, sin publicar una versión nueva de la
// app». De los ocho, UNO se aplicaba:
//
//   · `modo_mantenimiento` SÍ, y al nivel más fuerte que hay. `flag()` lo
//     lee desde `acceso_permitido()`, que está dentro de `puede_ver()`,
//     `puede_editar_propio()` y `puede_editar_entreno()` — y esas tres las
//     llaman 73 políticas. Encenderlo cierra la base entera salvo para el
//     super admin. Eso ya estaba bien y no se toca.
//
//   · Los otros siete, no. `flag()` tenía UN solo sitio que la llamaba, y
//     era el del mantenimiento.
//
// Ahora: tres se cablean de verdad, cuatro dicen que todavía no.
//
// LO QUE DISTINGUE UN INTERRUPTOR DE OPERACIÓN DE UNA CERRADURA, que es lo
// que más fácil se confunde:
//
//   · `ia` se comprueba EN EL SERVIDOR, porque ahí es donde se paga. Una
//     llamada con `curl` esquiva la pantalla; no esquiva la función.
//   · `fotografias` y `registro_clientes` son de pantalla. Apagan la
//     función para todo el mundo, y eso es su trabajo. No pretenden ser
//     una cerradura, y el código lo dice donde hay que decirlo.
//
// Y ANTE LA DUDA, ABIERTO. Si no se puede leer un interruptor, se deja
// encendido: un bache de red no puede dejar a nadie sin su app. El que sí
// cierra de verdad lo aplica la base por su cuenta.

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const FN = readFileSync(join(RAIZ, 'supabase', 'functions', 'asistente', 'index.ts'), 'utf8')
  .replace(/\r\n/g, '\n');
const MIG = join(RAIZ, 'supabase', 'migrations');
const SQL = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => readFileSync(join(MIG, f), 'utf8')).join('\n');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

function sacar(txt, cab) {
  const i = txt.indexOf(cab);
  if (i < 0) throw new Error('no encuentro: ' + cab);
  let n = 0, j = txt.indexOf('{', i);
  for (; j < txt.length; j++) {
    if (txt[j] === '{') n++;
    else if (txt[j] === '}') { n--; if (!n) return txt.slice(i, j + 1); }
  }
  throw new Error('llaves sin cerrar en ' + cab);
}

// ------------------------------------------------------------------
console.log('\nLos ocho siguen siendo ocho, y se sabe cuáles encienden algo');
{
  const alta = SQL.slice(SQL.indexOf('insert into public.feature_flags'),
                         SQL.indexOf('on conflict (clave) do nothing'));
  const claves = [...alta.matchAll(/\('([a-z_]+)',/g)].map((m) => m[1]);
  ok(claves.length === 8, 'ocho interruptores dados de alta', claves.join(', '));

  const dormidos = (SQL.match(/set listo = false[\s\S]*?where clave in \(([^)]*)\)/) || [])[1] || '';
  const marcados = [...dormidos.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  ok(JSON.stringify(marcados) ===
     JSON.stringify(['chat', 'notificaciones', 'registro_entrenadores', 'suscripciones']),
     'y los cuatro que no encienden nada están marcados',
     'marcados: ' + marcados.join(', ') + '. Chat no tiene tabla de mensajes, ' +
     'notificaciones no tiene una línea de PushManager, suscripciones no tiene ' +
     'cobros, y a los entrenadores los crea el super admin');
  ok(/add column if not exists listo boolean not null default true/.test(SQL),
     'y lo que ya había queda por defecto como listo',
     'los que sí funcionan no tienen que marcarse uno a uno');
}

console.log('\nY el panel los enseña como lo que son');
{
  const f = sacar(APP, 'function pintarConfig(){');
  ok(/var listo = f\.listo !== false;/.test(f), 'el panel mira la marca');
  ok(/Próximamente/.test(f), 'y lo dice con el mismo «Próximamente» del resto de la app');
  ok(/\(listo\?'':' disabled'\)/.test(f), 'y el botón no se puede pulsar');
  ok(/\(f\.on&&listo\?' on':''\)/.test(f),
     'y sale apagado aunque la fila diga lo contrario',
     'una fila vieja puede tener `activo = true` de antes; enseñarlo encendido ' +
     'volvería a prometer lo que no hace');

  const h = sacar(APP, "var fl = e.target.closest('[data-flag]');");
  ok(/if\(!f \|\| f\.listo === false\) return;/.test(h),
     'y tocarlo por delegación tampoco lo mueve',
     '`disabled` para el botón, pero esto va por delegación y un clic en el ' +
     '<i> de dentro llega igual');
}

// ------------------------------------------------------------------
console.log('\nLos tres que sí se cablean');
{
  const lector = sacar(APP, 'function flagActiva(clave){');
  ok(/sbRpc\('flag', \{ p_clave: clave \}\)/.test(lector),
     'se pregunta por `flag(clave)`, no leyendo la tabla',
     'leer `feature_flags` desde la pantalla de alta -sin sesión- sería ' +
     'enseñarle el panel de ajustes entero a cualquiera');
  ok(/\['catch'\]\(function\(\)\{ return true; \}\)/.test(lector),
     'y si no se puede preguntar, queda ENCENDIDO',
     'un interruptor que no se pudo leer no puede dejar a la gente fuera de ' +
     'su propia app');

  // registro_clientes
  const alta = sacar(APP, "btnEmpezar.addEventListener('click', function(){");
  // EJECUTADO, no buscado. La primera versión miraba que la cadena
  // `flagActiva('registro_clientes')` estuviera y que el aviso estuviera, y
  // pasaba en verde con la condición cambiada a `if(false)`: se preguntaba,
  // se ignoraba la respuesta y se creaba la cuenta igual. Lo enseñó una
  // mutación.
  const correr = (abiertas) => {
    const hecho = { creada: false, aviso: null, aDonde: null };
    new Function(
      'validarRegistro', 'campoPass', 'marcarError', 'avisoPass', 'campoCorreo',
      'ocupado', 'btnEmpezar', 'flagActiva', 'goto', 'avisarLogin', 'crearLaCuenta',
      'hecho', 'Promise',
      'var manejador; var addEventListener = function(_, f){ manejador = f; };' +
      'var btn = { addEventListener: addEventListener };' +
      // `sacar` corta en la llave que cierra, así que el paréntesis de la
      // llamada se queda fuera: se devuelve.
      alta.replace('btnEmpezar.addEventListener', 'btn.addEventListener') + ');' +
      'return manejador();'
    )(() => true, { value: 'secreta' }, () => {}, {}, { value: { trim: () => 'yo@ejemplo.com' } },
      () => {}, {}, () => Promise.resolve(abiertas),
      (v) => { hecho.aDonde = v; }, (m) => { hecho.aviso = m; },
      () => { hecho.creada = true; return Promise.resolve(); }, hecho, Promise);
    // El manejador no devuelve la promesa —es un `click`—, así que se deja
    // correr un tic antes de mirar qué pasó.
    return new Promise((r) => setTimeout(() => r(hecho), 0));
  };

  const cerradas = await correr(false);
  ok(cerradas.creada === false, 'con las altas cerradas, NO se crea la cuenta',
     'se preguntó y se ignoró la respuesta: ' + JSON.stringify(cerradas));
  ok(cerradas.aDonde === 'login', 'y se va al login');
  ok(/Las altas están cerradas/.test(String(cerradas.aviso)), 'y se dice por qué',
     'dijo: ' + cerradas.aviso);

  const abiertas = await correr(true);
  ok(abiertas.creada === true, 'y con las altas abiertas, se crea igual que siempre',
     'cerrar lo que no está cerrado es el fallo contrario y es peor');
  ok(abiertas.aviso === null, 'y sin avisos de nada');
  ok(!/flagActiva\('registro_clientes'\)/.test(sacar(APP, 'function cargarDatos(){')),
     'y se pregunta al pulsar, no al pintar la pantalla',
     'entre abrir la app y rellenar el formulario pasan minutos: preguntándolo ' +
     'antes, quien tuviera la pantalla abierta cuando se cerraron entraría igual');

  // fotografias
  const fotos = sacar(APP, 'function refrescarPestanaFotos(){');
  ok(/\[data-tabbar="fotos"\]/.test(fotos) && /hidden = !FOTOS_ENCENDIDAS/.test(fotos),
     'las fotos se pueden apagar para todos');
  ok(/querySelectorAll/.test(fotos) && /for\(var i = 0; i < bs\.length; i\+\+\)/.test(fotos),
     'y en las TRES barras, no solo en la primera',
     'la barra de abajo está escrita tres veces, una por pantalla');
  ok(/goto\('diario', false\)/.test(fotos),
     'y a quien esté dentro se le saca',
     'quedarse en una pantalla sin pestaña encendida es la peor mitad de las dos');
  ok(/recFotos/.test(fotos) && /avisoFotos/.test(fotos),
     'y los recordatorios que llevan allí se callan',
     'mandar a una pantalla que ya no está es peor que no avisar');

  // ia
  const llaves = sacar(APP, 'function aplicarLlavesIa(){');
  ok(/IA_ENCENDIDA && l\.foto !== false/.test(llaves) &&
     /IA_ENCENDIDA && l\.chat !== false/.test(llaves),
     'el interruptor global manda sobre las llaves de cada persona',
     'si la IA está apagada para todos, da igual lo que le dejara su entrenador');
}

console.log('\nY se piden con todo lo demás, no en una petición aparte');
{
  const carga = sacar(APP, 'function cargarDatos(){');
  ok(/flagActiva\('fotografias'\),\n\s*flagActiva\('ia'\)/.test(carga),
     'los dos van en la misma tanda',
     'llegando tarde, la pestaña de Fotos se pintaría y se quitaría sola ' +
     'delante de la persona');
  ok(/FOTOS_ENCENDIDAS = res\[9\] !== false;/.test(carga) &&
     /IA_ENCENDIDA = res\[10\] !== false;/.test(carga),
     'y se recogen en su sitio');
  ok(/refrescarPestanaFotos\(\);/.test(carga), 'y se aplica al pintar');
}

// ------------------------------------------------------------------
console.log('\nEl de la IA se comprueba donde se paga: en el servidor');
{
  ok(/admin\.rpc\('flag', \{ p_clave: 'ia' \}\)/.test(FN),
     'la función pregunta por el interruptor global',
     'la app también lo mira y esconde los botones, pero eso es presentación: ' +
     'una llamada con curl esquiva la pantalla y no la función');
  ok(/if \(!errFlag && iaGlobal === false\)/.test(FN),
     'y un fallo al preguntarlo deja pasar',
     '`flag()` caída no puede dejar sin asistente a todo el mundo');
  ok(/grant execute on function public\.flag\(text\) to service_role;/.test(SQL),
     'y el servidor tiene permiso para preguntarlo',
     'el rol de servicio se salta las políticas, pero NO el permiso de ' +
     'ejecutar una función: sin esto el interruptor no apagaría nada');
  ok(/grant execute on function public\.flag\(text\) to anon;/.test(SQL),
     'y quien se está dando de alta también',
     'todavía no tiene sesión, y es justo cuando hace falta saber si las ' +
     'altas están abiertas');

  // Y el orden importa: antes de gastar.
  const iFlag = FN.indexOf("admin.rpc('flag', { p_clave: 'ia' })");
  const iGasto = FN.indexOf("admin.rpc('gastar_consulta_ia'");
  ok(iFlag > 0 && iGasto > iFlag, 'y se pregunta ANTES de cobrar la consulta',
     'al revés le gastaría el tope del día a alguien para decirle que no');
}

console.log('\nY las dos formas de apagarle la IA a alguien dicen lo mismo');
{
  ok(/if \(nivel === 'apagada'\)/.test(FN),
     'el nivel «apagada» se rechaza con su motivo',
     'antes se colaba hasta el tope diario, que para ese nivel vale 0, y la ' +
     'persona recibía «Llegaste a las 0 consultas de hoy. Mañana se reinicia»: ' +
     'ni había llegado a nada ni se reiniciaba');
  const iNivel = FN.indexOf("if (nivel === 'apagada')");
  const iTope = FN.indexOf("admin.rpc('gastar_consulta_ia'");
  ok(iNivel > 0 && iTope > iNivel, 'y antes de llegar al tope');
  ok(/u\.ia_habilitada !== false && u\.nivel_ia !== 'apagada'/.test(APP),
     'y el chip de la lista mira las dos',
     'miraba solo `ia_habilitada`, así que a quien tuviera el nivel en ' +
     '«apagada» la lista le decía «on» mientras el servidor le decía que no');
  ok(/nivel_ia public\.nivel_ia/.test(SQL),
     'y la consulta de usuarios trae el nivel, que es lo que el chip necesita');
}

// ------------------------------------------------------------------
console.log('\nY el botón de crear entrenador hace el trabajo');
{
  const f = sacar(APP, "if(e.target.closest('#admCrear')){");
  ok(!/Se enviaría la invitación por correo/.test(f),
     'ya no es un aviso en condicional',
     'era eso y nada más: ni una llamada en toda la app. El mismo fallo que ' +
     'el botón de recuperar contraseña, que decía «ya te lo mandé» sobre un ' +
     'correo que no existía');
  ok(/rest\/v1\/invitaciones/.test(f), 'escribe la invitación de verdad');
  ok(/rol: 'coach'/.test(f), 'y con el rol de entrenador',
     'sin el rol entraría como cliente, que es lo que hace el otro botón');
  ok(/duplicate|unique/.test(f), 'y si ya estaba invitado, lo dice');
  ok(!/Crear entrenador con contraseña/.test(APP),
     'y el botón se llama por lo que hace',
     'prometer una contraseña necesita la clave de servicio, que nunca puede ' +
     'viajar al teléfono, y la Edge Function que haría falta no existe');
  ok(!/clave de servicio nunca viaja en el teléfono/.test(APP),
     'y el pie del panel tampoco promete esa Edge Function');
}

console.log('\nY el mantenimiento, que era el único que ya funcionaba, sigue igual');
{
  ok(/not public\.flag\('modo_mantenimiento'\)/.test(SQL),
     'lo sigue leyendo `acceso_permitido()`');
  const usos = (SQL.match(/puede_ver\(|puede_editar_propio\(|puede_editar_entreno\(/g) || []).length;
  ok(usos > 50, `y esas puertas las usan ${usos} sitios`,
     'es lo que convierte un interruptor en una cerradura de verdad');
  ok(/Mantenimiento<\/b> lo aplica la propia base de datos/.test(APP),
     'y el panel lo dice, para que no se confunda con los otros');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
