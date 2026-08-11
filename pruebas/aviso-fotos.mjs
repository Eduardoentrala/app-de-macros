// "Prepara tus fotos para mañana".
//
// Las fotos se suben el día que cierra la semana. Avisar ESE día llega
// tarde: buscar luz, un espejo y un momento a solas no se improvisa. Por eso
// el aviso sale la víspera, y no todo el día sino a partir de las 7 de la
// tarde: el sábado por la mañana todavía queda un día entero por delante y
// "mañana" no significa nada urgente.
//
// Lo que se comprueba aquí es sobre todo lo que NO tiene que pasar:
//   · que salga cualquier otro día
//   · que salga el sábado a mediodía
//   · que vuelva a salir después de cerrarlo, aunque se cierre la app
//   · que NO vuelva nunca más (tiene que volver la semana siguiente)
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8');
const CSS = readFileSync(join(RAIZ, 'docs', 'estilos', 'diario.css'), 'utf8');

let ok = 0, mal = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { mal++; console.log(`  FALLA ${n}${extra ? '\n        ' + extra : ''}`); }
};

// La función de verdad, sacada del app.js real.
function sacar(nombre, extra = '') {
  const i = APP.indexOf(`function ${nombre}(`);
  if (i < 0) throw new Error(`no encontré ${nombre}()`);
  let n = 0, j = APP.indexOf('{', i);
  for (; j < APP.length; j++) {
    if (APP[j] === '{') n++; else if (APP[j] === '}') { n--; if (!n) break; }
  }
  return `${extra}\n${APP.slice(i, j + 1)}`;
}

console.log('\n— El último día de TU semana, y solo de noche —');
{
  // Cada persona elige el día en que empieza su semana, y se guarda en
  // `week_start_dow`. Atar el aviso a un sábado fijo estaría mal para
  // cualquiera que no empiece en lunes.
  const hora = (APP.match(/var HORA_AVISO_FOTOS = (\d+);/) || [, 'null'])[1];
  const ctx = vm.createContext({});
  vm.runInContext(`var HORA_AVISO_FOTOS = ${hora}; var inicioSemana = 1;\n` +
    sacar('esVisperaDeCerrarSemana') + '\nthis.f = esVisperaDeCerrarSemana;', ctx);
  const f = ctx.f;
  // Agosto de 2026: el 3 es lunes, el 8 sábado y el 9 domingo.
  const d = (dia, h) => new Date(2026, 7, dia, h, 0, 0);
  const DOM = 0, LUN = 1, MAR = 2, SAB = 6;

  check('la hora de corte son las 19', hora === '19', `es ${hora}`);

  // Semana que empieza en LUNES → último día domingo.
  check('empieza lunes: domingo 19:00 → sale', f(d(9, 19), LUN) === true);
  check('empieza lunes: domingo 12:00 → NO', f(d(9, 12), LUN) === false);
  check('empieza lunes: sábado noche → NO', f(d(8, 20), LUN) === false);

  // El caso que se pidió: empieza MARTES → último día lunes.
  check('empieza martes: lunes 19:00 → sale', f(d(10, 19), MAR) === true);
  check('empieza martes: lunes 22:00 → sale', f(d(10, 22), MAR) === true);
  check('empieza martes: lunes 18:59 → NO', f(d(10, 18), MAR) === false);
  // El martes ya es el primer día de la semana nueva: avisar de "mañana"
  // sería mentir.
  check('empieza martes: martes noche → NO', f(d(11, 20), MAR) === false);
  check('empieza martes: domingo noche → NO', f(d(9, 20), MAR) === false);

  // Y un caso raro para fijar la vuelta del módulo.
  check('empieza domingo: sábado noche → sale', f(d(8, 20), DOM) === true);
  check('empieza sábado: viernes noche → sale', f(d(7, 20), SAB) === true);

  // Que salga del perfil y no de un día escrito a mano.
  check('el día lo pone el perfil, no el código',
    /var arranca = inicio == null \? inicioSemana : inicio;/.test(APP));
  check('y el último día se calcula', /var ultimoDiaDeLaSemana = \(arranca \+ 6\) % 7;/.test(APP));
  check('sin ningún sábado escrito a mano',
    !/d\.getDay\(\) === 6 &&/.test(APP), 'eso solo valdría para quien empiece en domingo');

  // Día y hora de la MISMA fecha: quien deja la app abierta pasada la
  // medianoche tendría un "hoy" de ayer y una hora de hoy.
  check('el día y la hora salen de la misma fecha',
    /var d = cuando \|\| new Date\(\);[\s\S]{0,260}d\.getDay\(\) === ultimoDiaDeLaSemana && d\.getHours\(\)/.test(APP),
    'mezclar HOY con new Date() lo sacaría un día tarde');
}

console.log('\n— Se cierra y no vuelve… esta semana —');
{
  const i = APP.indexOf('function revisarAvisoDeFotos(');
  const trozo = i > 0 ? APP.slice(i, i + 900) : '';
  check('existe la revisión', i > 0);
  // Lo que se guarda es la SEMANA, no un "ya lo vio". Con un booleano no
  // volvería a salir nunca, y se pidió que saliera cada semana.
  check('guarda la semana, no un simple «visto»',
    /var semana = claveSemana\(HOY\);/.test(trozo) && /cerrado !== semana/.test(trozo));
  check('y por eso vuelve la semana siguiente',
    !/localStorage\.setItem\(CLAVE_AVISO_FOTOS, 'visto'\)/.test(APP));

  const j = APP.indexOf("getElementById('avisoFotosCerrar')");
  const cerrar = APP.slice(j, j + 500);
  check('el tache lo esconde', /avisoFotos'\)\.hidden = true;/.test(cerrar));
  check('y lo apunta para esta semana',
    /localStorage\.setItem\(CLAVE_AVISO_FOTOS, claveSemana\(HOY\)\)/.test(cerrar));
  // Sin el try, un navegador con el almacenamiento bloqueado -modo privado-
  // reventaría al cerrar el aviso.
  check('un almacenamiento bloqueado no revienta el cierre',
    /try\{ localStorage\.setItem\(CLAVE_AVISO_FOTOS/.test(cerrar));
  check('ni la lectura', /try\{ cerrado = localStorage\.getItem/.test(trozo));
}

console.log('\n— Se revisa al entrar, y para todo el mundo —');
{
  // Las fotos de progreso las sube cualquiera: no son parte de la IA.
  const i = APP.indexOf("if(MI_NIVEL_IA === 'plus'){");
  const trozo = APP.slice(i, i + 500);
  check('se revisa al entrar', /revisarAvisoDeFotos\(\);/.test(trozo));
  check('fuera del candado de IA Plus',
    trozo.indexOf('}') < trozo.indexOf('revisarAvisoDeFotos();'),
    'dentro del if, quien no tiene Plus no vería el aviso de sus propias fotos');
}

console.log('\n— Y se ve como se pidió —');
{
  check('el aviso está en el Diario', /id="avisoFotos"/.test(HTML));
  check('empieza escondido', /id="avisoFotos" hidden/.test(HTML));
  check('con su cámara', /class="af-ico">📸</.test(HTML));
  check('el título', /Prepara tus fotos para mañana/.test(HTML));
  check('y el detalle', /mañana toca subir tus 4 fotos de progreso/.test(HTML));
  check('tiene tache para cerrar', /id="avisoFotosCerrar"/.test(HTML));
  check('y se sabe para qué es', /aria-label="Cerrar aviso"/.test(HTML));

  // En azul: es lo único de esa pantalla que pide hacer algo FUERA de la
  // app -buscar luz, un espejo, tiempo-, y por eso destaca.
  check('destaca sobre las tarjetas grises', /\.aviso-fotos\{[^}]*background:#5b93e0/s.test(CSS));
  check('el tache es redondo', /\.af-cerrar\{[^}]*border-radius:50%/s.test(CSS));
  // Está pegado al borde de la pantalla: sin ampliar el blanco es fácil
  // fallar el toque.
  check('y se toca de verdad, no solo se ve', /\.af-cerrar::after\{content:'';position:absolute;inset:-7px;\}/.test(CSS));
  // Sin esto, un texto largo estira la caja y empuja la × fuera.
  check('el texto largo no echa fuera al tache', /\.af-texto\{flex:1;min-width:0;\}/.test(CSS));
}

console.log('\n— Y `hidden` esconde de verdad —');
{
  // El fallo que hubo: se pulsaba el tache, el atributo `hidden` quedaba
  // puesto... y el aviso seguía midiendo 85 px. El navegador esconde lo que
  // lleva `hidden` con una regla suya, pero cualquier `display` nuestro la
  // pisa —y `.aviso-fotos` es `display:flex`—.
  const BASE = readFileSync(join(RAIZ, 'docs', 'estilos', 'base.css'), 'utf8');
  check('el atributo gana a cualquier display',
    /\[hidden\]\{display:none !important;\}/.test(BASE),
    'sin esto, todo lo que tenga display propio ignora `hidden`');

  // Lo mismo le esperaba a la tira de eventos, que también es flex.
  check('la tira de eventos también es flex y también lo necesitaba',
    /\.eventos-tira\{display:flex/.test(CSS));

  // Y que el aviso siga siendo flex: la regla de arriba es lo que permite
  // tenerlo así sin romper el escondido.
  check('el aviso sigue pudiendo ser flex', /\.aviso-fotos\{[^}]*display:flex/s.test(CSS));
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);
