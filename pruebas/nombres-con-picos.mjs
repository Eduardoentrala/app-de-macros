// Un nombre con un pico se come la fila que lo pinta.
//
// La app arma sus listas concatenando texto y metiéndolo con `innerHTML`.
// Para eso existe `escapar()`, y se usa en 56 sitios. Pero no en todos: en el
// panel de usuarios, el nombre y el correo de OTRA persona entran crudos.
//
// Eso no es una hipótesis de laboratorio. El nombre lo teclea cada quien al
// registrarse, y el correo también. Basta un `<` para que el navegador crea
// que empieza una etiqueta y se trague lo que viene detrás: la insignia del
// rol, el correo, los botones de apagar la IA y de suspender. La fila se
// queda a medias y los botones dejan de existir.
//
// Y hay un sitio peor, el título de un evento: no lo teclea una persona
// directamente, lo DEVUELVE EL MODELO a partir de lo que se le dijo en el
// chat. Texto de fuera, sin revisar, puesto como HTML.
//
// El caso curioso es `iniciales()`. En las listas del Plan el nombre sí va
// escapado —hay hasta un comentario diciéndolo— pero la bolita de las
// iniciales de al lado no, porque parece que devuelve algo inofensivo. Coge
// la primera letra de cada palabra, así que de «<b Juan» saca «<J». Dos
// caracteres bastan: el `<` abre una etiqueta igual.
//
// Por eso el arreglo de las iniciales va DENTRO de `iniciales()` y no en cada
// sitio que la llama: son cinco, y el próximo que la use no va a acordarse.
// Unas iniciales son letras. Que devuelva letras.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

// Se saca una función entera por su cabecera, contando llaves. Nada de
// ventanas de N caracteres: eso se rompe en cuanto la función crece.
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

// El texto hostil. No hace falta un ataque: con `<` sobra para romper.
const PICO = '<b onerror=x>Ana';

// ¿Sobrevive el pico del texto, o entró escapado?
const seCuela = (html) => html.includes('<b onerror=x>');

// ------------------------------------------------------------------
console.log('\nLas iniciales devuelven letras y nada más');
{
  const iniciales = new Function('return ' + sacar('function iniciales(nombre){'))();
  ok(iniciales('Ana Perez') === 'AP', 'siguen saliendo bien las normales');
  ok(iniciales('  Ana   Perez  ') === 'AP', 'y los espacios de más siguen sin contar');
  ok(iniciales('') === '', 'y un nombre vacío no revienta');
  ok(iniciales(null) === '', 'ni uno que falta');

  const r = iniciales(PICO);
  ok(!r.includes('<'), 'un nombre que empieza por pico no devuelve el pico',
     'devolvió «' + r + '»: ese `<` abre una etiqueta y se traga la fila entera');
  ok(/^[^<>&"']*$/.test(r), 'ni ningún otro carácter que signifique algo en HTML',
     'devolvió «' + r + '»');
  // Y que no se haya arreglado tirándolo todo: sigue habiendo iniciales.
  ok(iniciales('Élan Ñuñez') === 'ÉÑ', 'los acentos y la eñe siguen valiendo',
     'un arreglo a lo bruto que solo deje A-Z borraría media agenda');
}

// ------------------------------------------------------------------
console.log('\nEl panel de usuarios pinta nombres y correos de otra gente');
{
  const fuente = sacar('function escapar(t){') + '\n' +
                 sacar('function iniciales(nombre){') + '\n' +
                 sacar('function pintarUsuarios(){');
  const pintar = new Function('USUARIOS', 'admFiltro', 'NOMBRE_ROL',
    fuente + '; return pintarUsuarios();');

  const uno = {
    n: PICO, c: PICO + '@correo.com', r: 'cliente', on: true, ia: true,
    estado: 'activo', extra: 'Sin coach',
  };
  const html = pintar([uno], '', { cliente: 'Cliente' });

  ok(!seCuela(html), 'el nombre no entra crudo',
     'se cuela y a partir de ahí el navegador deja de ver la fila');
  ok(html.includes('&lt;'), 'entra escapado');
  // Lo que la fila tiene que seguir teniendo DESPUÉS del nombre. Si el pico
  // se cuela, esto es justo lo que se pierde.
  ok(html.includes('data-ia="0"'), 'y detrás del nombre siguen estando los botones');
  ok(html.includes('data-susp="0"'), 'el de suspender también');
  ok(html.includes('data-pass="0"'), 'y el de la contraseña');

  // El correo va en su propio hueco, detrás del nombre: tienen que salir los
  // dos escapados, no solo el primero.
  const veces = (html.match(/&lt;b onerror=x&gt;Ana/g) || []).length;
  ok(veces >= 2, 'el correo también va escapado',
     'solo aparece escapado ' + veces + ' vez: el otro entró crudo');

  // La caja de búsqueda guarda lo tecleado en un value="...": una comilla
  // doble ahí cierra el atributo.
  const conComilla = pintar([], 'pan "bimbo"', {});
  ok(!/value="pan "/.test(conComilla), 'y lo tecleado en el buscador no cierra su atributo',
     'una comilla doble parte el value y el resto del panel se descoloca');
  ok(conComilla.includes('&quot;'), 'va escapado');

  // El resto de la fila. Cada uno entra por una puerta distinta y ninguno
  // pasaba por `escapar()`.
  const otro = pintar([{
    n: 'Ana', c: 'a@a.com', r: 'cliente" onmouseover="x', on: true, ia: true,
    estado: 'susp' + PICO,                 // se pinta con toUpperCase() en medio
    extra: 'Coach: ' + PICO,               // el nombre del coach: otra persona más
  }], '', {});
  ok(!/onmouseover="x/.test(otro), 'el rol no se sale de su atributo class',
     'una comilla en el rol añade atributos a la etiqueta');
  ok(!seCuela(otro.toLowerCase()), 'ni el nombre del coach ni el estado entran crudos',
     'el estado se pinta en MAYÚSCULAS: hay que mirarlo sin distinguir, o esta ' +
     'comprobación pasa siempre sin mirar nada');
  ok(otro.includes('&lt;'), 'los dos entran escapados');

  // Y que escapar no se haya comido lo que sí era texto.
  ok(otro.includes('Coach:'), 'sin perder lo que sí se quería enseñar');
}

// ------------------------------------------------------------------
console.log('\nY el filtro del panel sigue filtrando');
{
  // El arreglo toca la misma línea que lee el filtro. Si se rompiera, el
  // panel se quedaría siempre vacío y no habría prueba que lo dijera.
  const fuente = sacar('function escapar(t){') + '\n' +
                 sacar('function iniciales(nombre){') + '\n' +
                 sacar('function pintarUsuarios(){');
  const pintar = new Function('USUARIOS', 'admFiltro', 'NOMBRE_ROL',
    fuente + '; return pintarUsuarios();');
  const gente = [
    { n: 'Ana',  c: 'ana@ejemplo.com', r: 'cliente', on: true, ia: true, estado: 'activo', extra: '' },
    { n: 'Beto', c: 'beto@otro.com',   r: 'cliente', on: true, ia: true, estado: 'activo', extra: '' },
  ];
  ok(pintar(gente, 'bet', {}).includes('Beto'), 'busca por nombre');
  ok(!pintar(gente, 'bet', {}).includes('>Ana '), 'y deja fuera al que no coincide');
  ok(pintar(gente, 'ejemplo', {}).includes('ana@'), 'y busca por correo');
}

// ------------------------------------------------------------------
console.log('\nY el título del evento, que lo devuelve el modelo');
{
  const fuente = sacar('function escapar(t){') + '\n' + sacar('function pintarEventos(){');
  let puesto = '';
  const doc = { getElementById: () => ({ set innerHTML(v) { puesto = v; }, set hidden(v) {} }) };
  const pintar = new Function('document', 'EVENTOS', 'anclaSemana', 'HOY', 'isoDe', 'DIAS', 'mil',
    fuente + '; pintarEventos();');

  const isoDe = (d) => d.toISOString().slice(0, 10);
  const hoy = new Date('2026-08-25T12:00:00Z');
  const EVENTOS = { [isoDe(hoy)]: { titulo: PICO, calorias: 900 } };
  pintar(doc, EVENTOS, hoy, hoy, isoDe, ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'], (n) => String(n));

  ok(puesto.length > 0, 'la tira de eventos se pinta');
  ok(!seCuela(puesto), 'el título no entra crudo',
     'lo devuelve el modelo a partir del chat: es texto de fuera y va como HTML');
  ok(puesto.includes('&lt;'), 'entra escapado');
  ok(/data-quitar="/.test(puesto), 'y el botón de quitarlo sigue ahí');
}

// ------------------------------------------------------------------
console.log('\nY no queda ningún nombre de persona sin escapar');
{
  // La red de seguridad: si mañana alguien añade otra lista con `u.n` o
  // `c.nombre` crudo, esto lo caza sin tener que acordarse de nada.
  const crudos = [];
  APP.split('\n').forEach((l, i) => {
    if (!/<[a-z][a-z0-9-]*[ >/]/i.test(l)) return;
    let m; const re = /'\s*\+\s*([^+]+?)\s*\+\s*'/g;
    while ((m = re.exec(l))) {
      const e = m[1].trim();
      if (/escapar\(/.test(e)) continue;
      // `u.r` (el rol) y `f.t` / `f.d` (título y descripción de un ajuste)
      // se añadieron después: los tres van dentro del HTML del panel y
      // ninguno estaba en esta lista, así que la red los dejaba pasar.
      // Y `.estado` con algo detrás —`u.estado.toUpperCase()`— tampoco
      // casaba con el patrón anclado, que es justo como se pinta.
      if (/^(u|c|a|x|p|e)\.(n|c|r|nombre|correo|full_name|titulo|estado|extra)\b/.test(e) ||
          /^f\.(t|d|src)$/.test(e) ||
          /^(admFiltro|catFiltro)$/.test(e)) crudos.push('app.js:' + (i + 1) + '  ' + e);
    }
  });
  ok(crudos.length === 0, 'ninguna lista mete texto de gente sin escapar',
     'quedan:\n         ' + crudos.join('\n         '));
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
