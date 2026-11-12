// Que un dato raro no acabe escrito en la pantalla.
//
// Las pruebas de esta carpeta le dan a la app datos BUENOS. Pero lo que
// llega del servidor no siempre lo es, y no hace falta mala fe:
//
//  · PostgREST devuelve las columnas `numeric` COMO TEXTO. '2.7', no 2.7.
//    Multiplicar funciona —JavaScript convierte— pero sumar concatena, y
//    '2.7' + 3 es '2.73'.
//  · Una columna que se añadió después viene `null` en las filas viejas.
//  · Un campo que se quitó del `select` llega `undefined`.
//  · Y un peso de 0 hace dividir entre cero.
//
// Nada de eso revienta la app: lo que hace es escribir «NaN», «undefined»
// o «Infinity» en un hueco de la pantalla, con toda naturalidad. Esa es la
// forma más tonta de que una app deje de parecer seria, y la más fácil de
// no ver, porque hay que estar mirando el hueco concreto.
//
// Esto arranca la app de verdad —el mismo arnés que `arranque`— con datos
// hostiles, la deja terminar, y luego BARRE TODO EL DOM buscando esas
// palabras. No comprueba que los números sean correctos: comprueba que
// sean números.

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
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

const IDS = new Set([...HTML.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));

function nodo(id) {
  const hijos = [];
  return {
    id: id || '', tagName: 'DIV', hidden: false, value: '', textContent: '',
    innerHTML: '', innerText: '', checked: false, disabled: false,
    dataset: {}, style: {}, children: hijos, offsetParent: {},
    classList: {
      _s: new Set(),
      add(...c) { c.forEach((x) => this._s.add(x)); },
      remove(...c) { c.forEach((x) => this._s.delete(x)); },
      toggle(c, f) { f ? this._s.add(c) : this._s.delete(c); },
      contains(c) { return this._s.has(c); },
    },
    addEventListener() {}, removeEventListener() {},
    appendChild(n) { hijos.push(n); return n; },
    removeChild() {}, remove() {}, click() {}, focus() {}, blur() {}, select() {},
    setAttribute() {}, removeAttribute() {}, getAttribute() { return null; },
    hasAttribute() { return false; }, closest() { return null; },
    querySelector(sel) {
      if (!this._sel) this._sel = new Map();
      if (!this._sel.has(sel)) this._sel.set(sel, nodo());
      return this._sel.get(sel);
    },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0, width: 100, height: 20 }; },
    scrollIntoView() {}, insertAdjacentHTML() {}, cloneNode() { return nodo(); },
  };
}

function montar({ respuestas = {}, sesion = null } = {}) {
  const nodos = new Map();
  const avisos = [];
  const dame = (id) => { if (!nodos.has(id)) nodos.set(id, nodo(id)); return nodos.get(id); };
  const porSel = new Map();
  const almacen = new Map();
  if (sesion) almacen.set('macros.sesion', JSON.stringify(sesion));

  const doc = {
    documentElement: nodo('html'), body: nodo('body'), hidden: false,
    getElementById: (id) => (IDS.has(id) ? dame(id) : null),
    querySelector: (sel) => { if (!porSel.has(sel)) porSel.set(sel, nodo()); return porSel.get(sel); },
    querySelectorAll: () => [],
    createElement: (t) => { const n = nodo(); n.tagName = String(t).toUpperCase(); return n; },
    createDocumentFragment: () => nodo(),
    addEventListener() {}, removeEventListener() {},
    getElementsByTagName: () => [], head: nodo('head'), title: '',
  };

  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    JSON, Math, Date, Promise, Error, TypeError, RegExp, Array, Object,
    String, Number, Boolean, isNaN, isFinite, parseInt, parseFloat,
    encodeURIComponent, decodeURIComponent, Uint8Array, Set, Map, Intl,
    setTimeout: (fn) => { try { fn(); } catch (e) { avisos.push('timeout: ' + e.message); } return 0; },
    clearTimeout() {}, setInterval() { return 0; }, clearInterval() {},
    requestAnimationFrame: (fn) => { fn(0); return 0; },
    document: doc,
    navigator: { onLine: true, serviceWorker: { register: () => Promise.resolve(), addEventListener() {} }, userAgent: 'node' },
    location: { protocol: 'https:', href: 'https://x/', reload() {}, origin: 'https://x' },
    localStorage: {
      getItem: (k) => (almacen.has(k) ? almacen.get(k) : null),
      setItem: (k, v) => almacen.set(k, String(v)),
      removeItem: (k) => almacen.delete(k), clear: () => almacen.clear(),
    },
    crypto: { randomUUID: () => 'id-' + Math.random().toString(36).slice(2), getRandomValues: (a) => a },
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    alert() {}, confirm: () => false, prompt: () => null,
    fetch: (url) => {
      const u = String(url);
      let cuerpo = [];
      for (const clave of Object.keys(respuestas)) if (u.includes(clave)) { cuerpo = respuestas[clave]; break; }
      return Promise.resolve({
        ok: true, status: 200,
        text: () => Promise.resolve(JSON.stringify(cuerpo)),
        json: () => Promise.resolve(cuerpo),
        clone() { return this; }, headers: { get: () => 'application/json' },
      });
    },
  };
  ctx.addEventListener = () => {}; ctx.removeEventListener = () => {};
  ctx.dispatchEvent = () => true; ctx.scrollTo = () => {};
  ctx.getComputedStyle = () => ({ getPropertyValue: () => '' });
  ctx.Response = class { constructor(b) { this.body = b; } };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;

  vm.createContext(ctx);
  let arranco = true, error = '', pila = '';
  try { vm.runInContext(APP, ctx, { filename: 'app.js' }); }
  catch (e) { arranco = false; error = e.message; pila = String(e.stack || ''); }
  return { ctx, nodos, avisos, arranco, error, pila };
}

const dejarQueTermine = async (v = 60) => { for (let i = 0; i < v; i++) await new Promise((r) => setTimeout(r, 0)); };

// Todo el texto que ha quedado puesto en cualquier nodo.
//
// SE CONVIERTE A TEXTO, como hace el navegador. Esto miraba solo los
// valores que YA eran cadena, y el DOM de mentira guarda `textContent =
// NaN` tal cual, como número. O sea que rompiendo una cuenta a propósito
// —`Math.round(peso * undefined)`— la pantalla acababa con un NaN dentro
// y este barrido no veía nada: pasaba en verde por no mirar. En el
// teléfono de verdad el navegador lo convierte y sale «NaN» escrito.
function barrer(m) {
  const trozos = [];
  for (const [id, n] of m.nodos) {
    for (const campo of ['innerHTML', 'textContent', 'value']) {
      const v = n[campo];
      if (v === '' || v === null || v === undefined) continue;
      trozos.push({ id, campo, v: String(v) });
    }
  }
  return trozos;
}
const FEOS = /\bNaN\b|\bundefined\b|\bInfinity\b|\b-Infinity\b|\[object Object\]|\bnull\b/;

const UID = '11111111-1111-4111-8111-111111111111';
const SESION = { access_token: 't', refresh_token: 'r', user: { id: UID, email: 'e@e.com' } };

// ------------------------------------------------------------------
console.log('\n— Con los números como TEXTO, que es como llegan —');
{
  // PostgREST manda `numeric` como cadena. No es una rareza: es lo normal.
  const m = montar({
    sesion: SESION,
    respuestas: {
      '/profiles': [{
        id: UID, full_name: 'Eduardo', weight_kg: '84.2', height_cm: '170',
        age: '29', sex: 'male', goal: 'bajar', dias_entreno: '4',
        goal_protein_g: '170', goal_carbs_g: '240', goal_fat_g: '75',
        nivel_ia: 'plus', role: 'cliente',
      }],
      '/saved_foods': [{ id: 'f1', name: 'Arroz', unit: 'Gramos', protein_g: '2.7', carbs_g: '28', fat_g: '0.3', veces_usado: '9' }],
      '/diary_entries': [{ id: 'd1', entry_date: '2026-11-12', meal: 'desayuno', food_name: 'Arroz', qty_g: '150', protein_g: '4.05', carbs_g: '42', fat_g: '0.45' }],
      '/weight_logs': [{ log_date: '2026-11-12', weight_kg: '84.2' }, { log_date: '2026-11-05', weight_kg: '85.0' }],
    },
  });
  await dejarQueTermine();
  check('la app arranca', m.arranco, m.error);
  const sucios = barrer(m).filter((t) => FEOS.test(t.v));
  check('y no queda ningún NaN ni undefined en pantalla', sucios.length === 0,
    sucios.slice(0, 6).map((t) => '#' + t.id + '.' + t.campo + ' = ' +
      JSON.stringify(t.v.slice(0, 110))).join('\n        '));
  check('y no saltó ningún error por el camino', m.avisos.length === 0,
    m.avisos.slice(0, 3).join('\n        '));
}

// ------------------------------------------------------------------
console.log('\n— Con columnas en null, que es como vienen las filas viejas —');
{
  const m = montar({
    sesion: SESION,
    respuestas: {
      '/profiles': [{
        id: UID, full_name: null, weight_kg: null, height_cm: null, age: null,
        sex: null, goal: null, dias_entreno: null,
        goal_protein_g: null, goal_carbs_g: null, goal_fat_g: null,
        nivel_ia: null, role: 'cliente', nacimiento: null,
      }],
      '/saved_foods': [{ id: 'f1', name: 'Arroz', unit: null, protein_g: null, carbs_g: null, fat_g: null, veces_usado: null }],
      '/diary_entries': [{ id: 'd1', entry_date: '2026-11-12', meal: 'desayuno', food_name: 'Arroz', qty_g: null, protein_g: null, carbs_g: null, fat_g: null }],
      '/weight_logs': [{ log_date: '2026-11-12', weight_kg: null }],
    },
  });
  await dejarQueTermine();
  check('la app arranca', m.arranco, m.error);
  const sucios = barrer(m).filter((t) => FEOS.test(t.v));
  check('y tampoco ensucia la pantalla', sucios.length === 0,
    sucios.slice(0, 6).map((t) => '#' + t.id + '.' + t.campo + ' = ' +
      JSON.stringify(t.v.slice(0, 110))).join('\n        '));
}

// ------------------------------------------------------------------
console.log('\n— Y con lo que ni siquiera viene —');
{
  // Filas a las que les faltan campos: un `select` que cambió, o una
  // columna que todavía no existe en esa base.
  //
  // SOLO SE QUITA LO QUE LA BASE PERMITE QUE FALTE. Aquí se quitó también
  // `weight_logs.weight_kg`, y la pantalla sacó un NaN precioso en el
  // campo del peso... pero esa columna es `not null` en el esquema, así
  // que esa fila no puede existir. Probar imposibles solo produce
  // fantasmas: dos veces seguidas creí haber encontrado un fallo gordo y
  // las dos el fallo era el dato que yo había inventado.
  const m = montar({
    sesion: SESION,
    respuestas: {
      '/profiles': [{ id: UID }],
      '/saved_foods': [{ id: 'f1', name: 'Arroz' }],
      '/diary_entries': [{ id: 'd1', entry_date: '2026-11-12', meal: 'desayuno', food_name: 'Arroz' }],
      '/weight_logs': [{ log_date: '2026-11-12', weight_kg: '84.2' }],
      '/recipes': [{ id: 'r1', name: 'Pollo con arroz' }],
    },
  });
  await dejarQueTermine();
  check('la app arranca', m.arranco, m.error);
  const sucios = barrer(m).filter((t) => FEOS.test(t.v));
  check('y aguanta sin escribir basura', sucios.length === 0,
    sucios.slice(0, 6).map((t) => '#' + t.id + '.' + t.campo + ' = ' +
      JSON.stringify(t.v.slice(0, 110))).join('\n        '));
}

// ------------------------------------------------------------------
console.log('\n— Y con un peso de cero, que hace dividir entre nada —');
{
  const m = montar({
    sesion: SESION,
    respuestas: {
      '/profiles': [{ id: UID, full_name: 'Eduardo', weight_kg: 0, height_cm: 0, age: 0,
        sex: 'male', goal: 'bajar', goal_protein_g: 0, goal_carbs_g: 0, goal_fat_g: 0,
        nivel_ia: 'normal', role: 'cliente' }],
      '/weight_logs': [{ log_date: '2026-11-12', weight_kg: 0 }],
    },
  });
  await dejarQueTermine();
  check('la app arranca', m.arranco, m.error);
  const sucios = barrer(m).filter((t) => FEOS.test(t.v));
  check('y no sale ningún Infinity', sucios.length === 0,
    sucios.slice(0, 6).map((t) => '#' + t.id + '.' + t.campo + ' = ' +
      JSON.stringify(t.v.slice(0, 110))).join('\n        '));
}

// ------------------------------------------------------------------
console.log('\n— Y esta prueba se entera si algo se ensucia —');
{
  // Si el barrido no mirara de verdad, todo lo de arriba sería verde por
  // no mirar. Se mete basura a mano y tiene que verse.
  const m = montar({ sesion: SESION, respuestas: {} });
  await dejarQueTermine();
  const antes = barrer(m).filter((t) => FEOS.test(t.v)).length;
  const cualquiera = [...m.nodos.values()][0];
  cualquiera.textContent = 'Te quedan NaN consultas hoy';
  const despues = barrer(m).filter((t) => FEOS.test(t.v)).length;
  check('el barrido encuentra lo que se le pone delante', despues === antes + 1,
    'antes ' + antes + ', después ' + despues);
  check('y había nodos que barrer', m.nodos.size > 20, 'nodos: ' + m.nodos.size);
}

// ------------------------------------------------------------------
console.log('\n— Y los objetivos que la app conoce son los que caben —');
{
  // ESTO SALE DE HABERME EQUIVOCADO. Escribiendo las pruebas de arriba
  // puse `goal: 'cut'` en el perfil de mentira y la pantalla sacó un NaN
  // enorme. Parecía un fallo gordo y no lo era: la base tiene
  // `check (goal in ('bajar','mantener','subir'))`, así que 'cut' no
  // puede existir y yo estaba probando un imposible.
  //
  // Pero el camino que recorrió ese NaN es real y vale la pena cerrarlo.
  // `reg.objetivo = p.goal` se cree lo que venga; `AJUSTE[reg.objetivo]`
  // da `undefined` para una clave que no conoce; `gasto * undefined` es
  // NaN; y —esto es lo que importa—
  //
  //     Math.max(NaN, tmb, 1200)  →  NaN
  //
  // o sea que el suelo de 1.200 calorías, que está ahí por seguridad, NO
  // SUJETA un NaN. Hoy nada puede llegar ahí porque la base lo impide.
  // Lo que esta comprobación vigila es que siga siendo así: que los tres
  // sitios —la base, la tabla de ajustes y la de nombres— digan los
  // mismos objetivos. Añadir uno en dos de los tres es lo que abre esa
  // puerta.
  const SQL = readFileSync(join(RAIZ, 'supabase', 'migrations', '0001_esquema_base.sql'), 'utf8');
  const enLaBase = (SQL.match(/check \(goal in \(([^)]+)\)\)/) || [, ''])[1]
    .split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean).sort();

  const trozo = (nombre) => {
    const i = APP.indexOf('var ' + nombre + ' = {');
    return APP.slice(i, APP.indexOf('}', i));
  };
  const enAjuste = [...trozo('AJUSTE').matchAll(/([a-z]+):/g)].map((m) => m[1]).sort();
  const enNombres = [...trozo('NOMBRE_OBJ').matchAll(/([a-z]+):/g)].map((m) => m[1]).sort();

  check(`la base acepta ${enLaBase.length}: ${enLaBase.join(', ')}`, enLaBase.length === 3,
    'si no salen tres, el `check` cambió de forma y esto no está leyendo nada');
  check('y la tabla de ajustes tiene exactamente esos',
    enAjuste.join() === enLaBase.join(),
    'base: ' + enLaBase.join(' ') + ' · AJUSTE: ' + enAjuste.join(' ') +
    '\n        uno que esté en la base y no aquí saca un NaN en la pantalla, ' +
    'y el suelo de 1.200 no lo sujeta');
  check('y la de nombres también',
    enNombres.join() === enLaBase.join(),
    'base: ' + enLaBase.join(' ') + ' · NOMBRE_OBJ: ' + enNombres.join(' ') +
    '\n        uno que falte aquí sale como «—» en la ficha del entrenador');
}

console.log('\n' + ok + ' pasan · ' + mal + ' fallan');
process.exit(mal ? 1 : 0);
