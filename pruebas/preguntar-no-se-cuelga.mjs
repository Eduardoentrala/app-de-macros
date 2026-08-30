// `preguntar()` no puede quedarse esperando una respuesta que no va a
// llegar.
//
// Devuelve una promesa que SOLO se resuelve cuando alguien pulsa un botón
// de su hoja. Si la hoja no se está pintando, no hay pulsación posible y la
// promesa se queda colgada para siempre: el flujo que la esperaba —apuntar
// una comida, guardar un alimento— no continúa nunca y no hay un solo error
// en ninguna consola. Desde fuera es «le doy a guardar y no pasa nada».
//
// NO ES HIPOTÉTICO: pasó. La hoja vivía dentro de una vista, y las vistas
// que no están activas son `display:none`, así que desde cualquier otra
// pantalla se abría midiendo 0×0 —con la clase `open` puesta, `display:flex`
// y `opacity:1`— y el alimento no se apuntaba. Eso ya se arregló sacando la
// hoja de las vistas, y tiene su prueba en `hojas-fuera-de-las-vistas`.
//
// Esto es lo otro: que si vuelve a pasar por CUALQUIER motivo —alguien mueve
// la hoja, le cambia el id, la deja oculta— el peor caso sea «no pasa nada y
// te lo digo» en vez de «no pasa nada y nunca sabrás por qué».
//
// Se responde que NO, que es lo prudente: cancelar. Los que llaman ya saben
// tratarlo, y en el caso que dolió —«¿le cambio los macros?»— cancelar
// significa no tocar la ficha Y APUNTAR LA COMIDA IGUAL, que es justo lo
// que la persona vino a hacer.
//
// La comprobación es `offsetParent === null`, la misma que ya usa `toast()`:
// cubre a la vez que el elemento no exista y que no se esté pintando.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const CSS = readFileSync(join(RAIZ, 'docs', 'estilos', 'pantallas.css'), 'utf8');

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

// Una hoja de mentira. `pintada:false` imita una vista apagada.
function montar({ pintada = true, falta = null } = {}) {
  const avisos = [];
  const oyentes = {};
  const hoja = {
    clases: new Set(),
    classList: { add: (c) => hoja.clases.add(c), remove: (c) => hoja.clases.delete(c) },
    get offsetParent() { return pintada ? {} : null; },
    addEventListener: (ev, fn) => { (oyentes.hoja = oyentes.hoja || []).push(fn); },
    removeEventListener: () => {},
  };
  const boton = (n) => ({
    textContent: '',
    addEventListener: (ev, fn) => { oyentes[n] = fn; },
    removeEventListener: () => {},
  });
  const els = {
    preguntaSheet: hoja,
    preguntaSi: boton('si'),
    preguntaNo: boton('no'),
    preguntaTitulo: { textContent: '' },
    preguntaTexto: { textContent: '' },
  };
  if (falta) delete els[falta];
  const document = { getElementById: (id) => els[id] || null };
  return { document, oyentes, avisos, hoja,
           toast: (id, t) => avisos.push(t) };
}

const preguntarCon = (ctx) => new Function('document', 'toast',
  sacar('function preguntar(titulo, texto, textoSi){') + '; return preguntar;')(
    ctx.document, ctx.toast);

// Una carrera: o contesta la promesa, o se declara colgada.
const conTope = (p, ms = 60) => Promise.race([
  p, new Promise((r) => setTimeout(() => r('COLGADA'), ms)),
]);

// ------------------------------------------------------------------
console.log('\nCon la hoja a la vista, funciona como siempre');
{
  const ctx = montar({ pintada: true });
  const preguntar = preguntarCon(ctx);
  const p = preguntar('¿Seguro?', 'texto', 'Sí, va');
  ok(ctx.hoja.clases.has('open'), 'la hoja se abre');
  ctx.oyentes.si();
  ok(await conTope(p) === true, 'y pulsar «sí» contesta que sí');

  const ctx2 = montar({ pintada: true });
  const preguntar2 = preguntarCon(ctx2);
  const p2 = preguntar2('¿Seguro?', 'texto');
  ctx2.oyentes.no();
  ok(await conTope(p2) === false, 'y «no» contesta que no');
  ok(!ctx2.hoja.clases.has('open'), 'y la hoja se cierra');
}

console.log('\nY si la hoja no se está pintando, contesta que no en vez de colgarse');
{
  const ctx = montar({ pintada: false });
  const preguntar = preguntarCon(ctx);
  const r = await conTope(preguntar('¿Seguro?', 'texto'));
  ok(r !== 'COLGADA', 'contesta',
     'la promesa solo se resuelve al pulsar, y sin hoja no hay pulsación: ' +
     'el flujo que la esperaba —apuntar la comida— no continúa nunca y no ' +
     'hay ningún error en ninguna consola');
  ok(r === false, 'y contesta que NO, que es cancelar',
     'salió ' + r + '. Cancelar es lo prudente: en el caso que dolió ' +
     'significa no tocar la ficha y apuntar la comida igual');
}

console.log('\nY lo dice, no se calla');
{
  const ctx = montar({ pintada: false });
  await conTope(preguntarCon(ctx)('¿Seguro?', 'texto'));
  ok(ctx.avisos.length > 0, 'sale un aviso',
     'sin decirlo, «no pasa nada» sigue siendo un misterio');
  ok(/no pude|no se pudo|inténtalo|intentalo/i.test(ctx.avisos.join(' ')),
     'y se entiende que algo falló', JSON.stringify(ctx.avisos));
}

console.log('\nY si a la hoja le falta una pieza, tampoco se cuelga');
{
  for (const pieza of ['preguntaSheet', 'preguntaSi', 'preguntaNo']) {
    const ctx = montar({ pintada: true, falta: pieza });
    let r;
    try { r = await conTope(preguntarCon(ctx)('¿Seguro?', 'texto')); }
    catch (e) { r = 'REVENTÓ: ' + e.message; }
    ok(r === false, 'sin «' + pieza + '» contesta que no',
     'salió ' + r + ': un id que cambia de nombre no puede dejar la app ' +
     'esperando para siempre');
  }
}

// ------------------------------------------------------------------
console.log('\nY la comprobación sigue teniendo sentido');
{
  // `offsetParent` solo vale si la hoja es `absolute`. Con `fixed` sería
  // null siempre y esto cancelaría TODAS las confirmaciones.
  const regla = (CSS.match(/\.sheet-backdrop\{[^}]*\}/) || [''])[0].replace(/\s+/g, '');
  ok(/position:absolute/.test(regla), 'las hojas siguen siendo `absolute`',
     'con `position:fixed`, `offsetParent` es null aunque se vea, y esta ' +
     'guarda cancelaría todas las confirmaciones. Regla: ' + regla);
  const f = sacar('function preguntar(titulo, texto, textoSi){');
  ok(/offsetParent/.test(f), 'y la guarda mira si se está pintando');
}

console.log('\nY se sigue usando desde varias pantallas');
{
  // Es lo que hace que esto importe: si solo se usara desde una vista, la
  // hoja podría vivir dentro y nada de esto haría falta.
  const usos = (APP.match(/\n\s*preguntar\(/g) || []).length;
  ok(usos >= 2, `se llama desde ${usos} sitios`);
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
