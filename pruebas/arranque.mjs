// Que la app ARRANQUE y cargue los datos sin reventar.
//
// POR QUE EXISTE ESTA PRUEBA
//
// El 21 de agosto, con las 46 pruebas de esta carpeta en verde, la app
// llevaba DOS DIAS cargando a medias. Al sacar el llenado del diario a
// `llenarDiario()` se fue con el la declaracion `var hoy = isoDe(HOY)`,
// y `cargarDatos` la seguia usando mas abajo:
//
//     No se pudieron cargar tus datos: hoy is not defined
//
// Reventaba a la mitad. El diario ya estaba puesto —va antes— pero nada de
// lo de debajo llegaba a correr: alimentos guardados, frecuentes, recetas,
// peso de hoy, rutina, sesiones y fotos. Eduardo lo noto porque su despensa
// aparecia vacia.
//
// NINGUNA PRUEBA LO VIO, y no por descuido: las 46 son de TEXTO. Leen
// app.js y comprueban que ponga lo que tiene que poner. Un error que solo
// existe al EJECUTAR —una variable fuera de alcance, una funcion que se
// llama antes de definirse, un null que se desreferencia— pasa por delante
// de todas sin despeinarse.
//
// Esta corre la app de verdad: monta un DOM de mentira, un `fetch` que
// responde como Supabase, y comprueba que la carga llega hasta el final y
// deja las listas llenas. Es lenta y fea comparada con las otras. Es la
// unica que habria pillado esto.
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

// ---------------------------------------------------------------------
//  Un DOM de mentira
// ---------------------------------------------------------------------
// No imita un navegador: imita lo JUSTO para que app.js corra. Los ids
// salen del index.html de verdad, asi que si el codigo pide uno que no
// existe se nota —devuelve null y revienta igual que en el telefono—.
const IDS = new Set([...HTML.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));

function nodo(id) {
  const hijos = [];
  const el = {
    id: id || '', tagName: 'DIV', hidden: false, value: '', textContent: '',
    innerHTML: '', innerText: '', checked: false, disabled: false,
    dataset: {}, style: {}, children: hijos, offsetParent: {},
    classList: {
      _s: new Set(),
      add(...c){ c.forEach(x => this._s.add(x)); },
      remove(...c){ c.forEach(x => this._s.delete(x)); },
      toggle(c, f){ f ? this._s.add(c) : this._s.delete(c); },
      contains(c){ return this._s.has(c); }
    },
    addEventListener(){}, removeEventListener(){}, appendChild(n){ hijos.push(n); return n; },
    removeChild(){}, remove(){}, click(){}, focus(){}, blur(){}, select(){},
    setAttribute(){}, removeAttribute(){}, getAttribute(){ return null; },
    hasAttribute(){ return false; }, closest(){ return null; },
    // Igual que en `document`: un nodo, no null, y cacheado por selector
    // para que dos llamadas devuelvan el MISMO elemento.
    querySelector(sel){
      if (!this._sel) this._sel = new Map();
      if (!this._sel.has(sel)) this._sel.set(sel, nodo());
      return this._sel.get(sel);
    },
    querySelectorAll(){ return []; },
    getBoundingClientRect(){ return { top:0, left:0, right:0, bottom:0, width:100, height:20 }; },
    scrollIntoView(){}, insertAdjacentHTML(){}, cloneNode(){ return nodo(); }
  };
  return el;
}

function montar({ respuestas = {}, sesion = null } = {}) {
  const nodos = new Map();
  const faltan = [];
  const pedidos = [];
  const avisos = [];
  const dame = (id) => {
    if (!nodos.has(id)) nodos.set(id, nodo(id));
    return nodos.get(id);
  };
  // Por selector, cacheado: devolver un nodo nuevo cada vez romperia las
  // comparaciones por identidad que hace la app (`e.target === x`).
  const porSel = new Map();
  const dameSel = (sel) => {
    if (!porSel.has(sel)) porSel.set(sel, nodo());
    return porSel.get(sel);
  };

  const almacen = new Map();
  if (sesion) almacen.set('macros.sesion', JSON.stringify(sesion));

  const doc = {
    documentElement: nodo('html'),
    body: nodo('body'),
    hidden: false,
    // Solo devuelve algo si el id EXISTE en el index. Asi, pedir uno que no
    // existe da null y revienta aqui igual que en el telefono.
    getElementById: (id) => { if(!IDS.has(id)){ faltan.push(id); return null; } return dame(id); },
    // Devuelve un nodo y no null: en la pagina de verdad estos elementos
    // existen, y devolver null aqui inventaria fallos que no pasan.
    querySelector: (sel) => dameSel(sel),
    querySelectorAll: () => [],
    createElement: (t) => { const n = nodo(); n.tagName = String(t).toUpperCase(); return n; },
    createDocumentFragment: () => nodo(),
    addEventListener(){}, removeEventListener(){},
    getElementsByTagName: () => [],
    head: nodo('head'), title: ''
  };

  const ctx = {
    console, JSON, Math, Date, Promise, Error, TypeError, RegExp, Array, Object,
    String, Number, Boolean, isNaN, parseInt, parseFloat, encodeURIComponent,
    decodeURIComponent, Uint8Array, Set, Map, Intl,
    setTimeout: (fn) => { try { fn(); } catch (e) { avisos.push('timeout: ' + e.message); } return 0; },
    clearTimeout(){}, setInterval(){ return 0; }, clearInterval(){},
    requestAnimationFrame: (fn) => { fn(0); return 0; },
    document: doc,
    navigator: { onLine: true, serviceWorker: { register: () => Promise.resolve(), addEventListener(){} }, userAgent: 'node' },
    location: { protocol: 'https:', href: 'https://x/', reload(){}, origin: 'https://x' },
    localStorage: {
      getItem: (k) => (almacen.has(k) ? almacen.get(k) : null),
      setItem: (k, v) => almacen.set(k, String(v)),
      removeItem: (k) => almacen.delete(k),
      clear: () => almacen.clear()
    },
    crypto: { randomUUID: () => 'id-' + Math.random().toString(36).slice(2), getRandomValues: (a) => a },
    matchMedia: () => ({ matches: false, addEventListener(){}, addListener(){} }),
    alert(){}, confirm: () => false, prompt: () => null,
    // El fetch de mentira: responde segun la ruta.
    fetch: (url, op) => {
      const u = String(url);
      pedidos.push(u.replace(/^https?:\/\/[^/]+/, ''));
      let cuerpo = [];
      for (const clave of Object.keys(respuestas)) {
        if (u.includes(clave)) { cuerpo = respuestas[clave]; break; }
      }
      return Promise.resolve({
        ok: true, status: 200,
        text: () => Promise.resolve(JSON.stringify(cuerpo)),
        json: () => Promise.resolve(cuerpo),
        clone(){ return this; },
        headers: { get: () => 'application/json' }
      });
    }
  };
  // `window` es el propio contexto, pero con lo que el navegador le pone
  // encima y un objeto plano no trae.
  ctx.addEventListener = () => {};
  ctx.removeEventListener = () => {};
  ctx.dispatchEvent = () => true;
  ctx.scrollTo = () => {};
  ctx.getComputedStyle = () => ({ getPropertyValue: () => '' });
  ctx.Response = class { constructor(b){ this.body = b; } };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.self = ctx;

  vm.createContext(ctx);
  let arranco = true, error = '', pila = '';
  try { vm.runInContext(APP, ctx, { filename: 'app.js' }); }
  catch (e) { arranco = false; error = e.message; pila = String(e.stack || ''); }

  return { ctx, nodos, pedidos, avisos, arranco, error, pila, dame, faltan };
}

// ---------------------------------------------------------------------
// La carga es asincrona: `vm.runInContext` vuelve en cuanto acaba lo
// sincrono, y las promesas se resuelven despues. Sin esperar aqui, la
// prueba miraria las listas antes de que nadie las hubiera llenado.
const dejarQueTermine = async (vueltas = 40) => {
  for (let i = 0; i < vueltas; i++) await new Promise(r => setTimeout(r, 0));
};

console.log('\n— La app arranca sin reventar —');
const vacio = montar();
check('app.js corre entero', vacio.arranco,
  vacio.error + '\n        ' + vacio.pila.split('\n').slice(1, 4).join('\n        '));
// Si pidiera un id que no esta en el index, `getElementById` da null y
// cualquier `.value` o `.addEventListener` encima revienta. Esta prueba lo
// convierte en un fallo en vez de en un misterio en el telefono.
check('no pide ningun id que no exista en el index', vacio.arranco, vacio.error);

console.log('\n— Y la carga llega HASTA EL FINAL —');
{
  const UID = '11111111-1111-4111-8111-111111111111';
  const m = montar({
    sesion: { access_token: 't', refresh_token: 'r', user: { id: UID, email: 'e@e.com' } },
    respuestas: {
      '/saved_foods': [
        { id:'f1', name:'Arroz',  unit:'Gramos', protein_g:2.7, carbs_g:28, fat_g:0.3, veces_usado:9 },
        { id:'f2', name:'Pollo',  unit:'Gramos', protein_g:31,  carbs_g:0,  fat_g:3.6, veces_usado:12 }
      ],
      '/recipes':  [{ id:'r1', name:'Pollo al horno', servings:4, calories:1280, is_public:false }],
      '/profiles': [{ id:UID, role:'cliente', full_name:'Eduardo',
                      goal_protein_g:170, goal_carbs_g:240, goal_fat_g:75, week_start_dow:1 }]
    }
  });
  await dejarQueTermine();
  check('arranca con sesion', m.arranco, m.error);
  check('y pide los alimentos guardados',
    m.pedidos.some(p => p.includes('saved_foods')), m.pedidos.slice(0, 8).join(' | '));

  // EL FALLO DEL 21 DE AGOSTO. `cargarDatos` reventaba con «hoy is not
  // defined» ANTES de llegar a la despensa, y el error se lo tragaba su
  // propio catch. La señal de que llego al final es que escribio la copia
  // del telefono: eso pasa en la ULTIMA parte del bloque.
  const cache = m.ctx.localStorage.getItem('macros.despensa');
  check('la carga llega al final, no revienta a la mitad', !!cache,
    'si esto falla, mira el aviso de abajo: es el error que se trago el catch');

  if (cache) {
    const d = JSON.parse(cache);
    check('y deja los alimentos guardados puestos', (d.alimentos || []).length === 2,
      JSON.stringify(d.alimentos));
    check('y las recetas', (d.recetas || []).length === 1);
  }

  // Si algo revento, el propio codigo lo cuenta por el toast. Se enseña
  // para no tener que adivinar.
  const avisos = [...m.nodos.values()].map(n => n.textContent).filter(t => /No se pudieron cargar|is not defined|undefined/.test(t));
  check('y no deja ningun aviso de error', avisos.length === 0, avisos.join(' | '));
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);
