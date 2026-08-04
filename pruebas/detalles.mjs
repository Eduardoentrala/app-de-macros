// Cinco arreglos que no se ven fallar hasta que molestan mucho.
//
// El del cronómetro se ejercita de verdad: es el único con aritmética, y el
// que más fácil se rompe otra vez si alguien vuelve a contar restando uno.
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

console.log('\n— Fuera las flechas de Mis alimentos —');
{
  // No hacían nada: dos botones cuya única función era no agregar el
  // alimento al tocarlos.
  check('no se pintan', !APP.includes('fc-arrows'));
  check('ni queda su estilo', !CSS.includes('fc-arrows'));
  check('pero Editar y Borrar siguen', APP.includes('btn-mini edit') && APP.includes('btn-mini del'));
}

console.log('\n— Teclado numérico donde hay números —');
{
  // 'decimal' y no 'numeric': los pesos y los macros llevan punto, y
  // 'numeric' lo esconde en iPhone.
  const sinModo = [...HTML.matchAll(/<input[^>]*type="number"[^>]*>/g)]
    .filter(m => !/inputmode=/.test(m[0]));
  check('ningún campo numérico se quedó sin él', sinModo.length === 0,
    sinModo.map(m => (m[0].match(/id="(\w+)"/) || [])[1]).join(', '));
  // `numeric` es correcto para lo que solo admite enteros —segundos,
  // minutos, gramos de una porción— y de hecho es mejor: da un teclado sin
  // punto, que es un objetivo menos donde equivocarse. `decimal` hace falta
  // solo donde se escriben decimales de verdad; ahí `numeric` esconde el
  // punto en iPhone y no se puede poner 82.5.
  const conDecimales = ['regPeso', 'pesoInput', 'nfP', 'nfC', 'nfG', 'nfQty'];
  for (const id of conDecimales) {
    const el = (HTML.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`)) || [''])[0];
    check(`${id} admite decimales`, /inputmode="decimal"/.test(el), el.slice(0, 90));
  }

  // Las series de rutina se crean desde JS: era justo donde salía el
  // teclado completo.
  const series = [...APP.matchAll(/<input class="set-input"[^>]*>/g)].map(m => m[0]);
  check('las series de rutina existen', series.length > 0);
  check('y todas llevan teclado numérico',
    series.every(s => /inputmode="decimal"/.test(s)),
    series.filter(s => !/inputmode/.test(s)).join(' | '));
}

console.log('\n— El cronómetro cuenta contra el reloj, no por ticks —');
{
  const ini = APP.indexOf('function segundosQueFaltan(');
  const fin = APP.indexOf('\n  function startRest(');
  const ctx = vm.createContext({ Date, Math, finRest: 0 });
  vm.runInContext(APP.slice(ini, fin), ctx);

  ctx.finRest = Date.now() + 90000;
  check('90 s por delante dan 90', Math.abs(ctx.segundosQueFaltan() - 90) <= 1,
    String(ctx.segundosQueFaltan()));

  // Lo que pasaba al salir de la app: los ticks se congelan. Contando
  // contra el reloj, volver con el tiempo ya cumplido da cero, no el
  // segundo en que te fuiste.
  ctx.finRest = Date.now() - 30000;
  check('si terminó mientras no mirabas, da 0', ctx.segundosQueFaltan() === 0,
    String(ctx.segundosQueFaltan()));
  check('nunca da negativo', ctx.segundosQueFaltan() >= 0);

  check('se recalcula al volver a la app',
    /visibilitychange[\s\S]{0,260}segundosQueFaltan\(\)/.test(APP));
  // Sonar cinco pitidos de golpe al volver es peor que no sonar.
  check('no dispara los avisos que se saltó', /antes - remaining > 1/.test(APP));
  // Si al reanudar no se corre la hora de fin, el tiempo pausado habria
  // seguido corriendo por dentro.
  check('la pausa corre la hora de fin',
    /if\(!paused\) finRest = Date\.now\(\) \+ remaining \* 1000;/.test(APP));
  check('y los +30 s son de verdad',
    /finRest = Date\.now\(\) \+ remaining \* 1000;\s+\/\/ \+30/.test(APP));
}

console.log('\n— La foto de perfil se guarda —');
{
  // Antes solo se pintaba en pantalla: al cerrar la app desaparecia.
  check('se guarda en el perfil', /sbActualizarPerfil\(\{ avatar_url: url \}\)/.test(APP));
  check('y se recupera al entrar', /pintarAvatarGuardado\(p\.avatar_url\)/.test(APP));
  check('alguien llama a esa función',
    (APP.match(/pintarAvatarGuardado\(/g) || []).length >= 2);
}

console.log('\n— Y se puede encuadrar —');
{
  check('hay pantalla para acomodarla', HTML.includes('id="avatarSheet"'));
  check('se arrastra', /marco\.addEventListener\('pointerdown'/.test(APP));
  check('y se acerca', HTML.includes('id="avaZoom"'));
  // Guardar ya recortada evita tener que guardar tambien la posicion y
  // volver a recortar cada vez que se pinta.
  check('se guarda ya recortada', /c\.width = c\.height = LADO_AVATAR/.test(APP));
  check('a un tamaño sensato', /var LADO_AVATAR = 256/.test(APP));
  // El marco es redondo y del tamaño real: encuadrar en un cuadrado para
  // luego recortar en circulo es como se corta la barbilla de la gente.
  const CU = readFileSync(join(RAIZ, 'docs', 'estilos', 'cuenta.css'), 'utf8');
  check('el marco es redondo', /\.ava-marco\{[^}]*border-radius:50%/.test(CU));
  check('y no se lleva el gesto la hoja', /touch-action:none/.test(CU),
    'sin esto, arrastrar la foto desplaza la pantalla entera');

  // Un JPEG no tiene transparencia: lo que no se pinta sale NEGRO, no
  // vacío. Con las medidas en 0 las cuentas dan NaN, drawImage no pinta
  // nada y se guarda una foto negra sin un solo error por ningún lado.
  check('el tamaño se lee de la imagen al guardar',
    /var natW = avaImg\.naturalWidth \|\| ava\.natW/.test(APP),
    'fiarse de lo guardado al abrir es como se acaba con una foto negra');
  check('y si falta, avisa en vez de guardar negro',
    /if\(!natW \|\| !natH \|\| !lado\)\{/.test(APP));
  check('el fondo se pinta blanco antes', /g\.fillStyle = '#ffffff'/.test(APP),
    'un PNG con transparencia se volveria negro al pasarlo a JPEG');
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);
