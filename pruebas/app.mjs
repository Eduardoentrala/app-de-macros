// Red de seguridad de la app antes de partirla en modulos.
//
// La base de datos tiene 130+ pruebas; la app no tenia ninguna. "Verificar"
// era mirar la pantalla, y eso ya ha fallado dos veces: las metricas de
// fuente del iPhone y el CORS que curl no llega a ver.
//
// No comprueba que la app este bonita: comprueba las tres cosas que una
// refactorizacion rompe de verdad y que mirando no se notan hasta que un
// usuario toca el boton equivocado.
//
//   1. Que todo el JavaScript compila.
//   2. Que cada elemento que el JavaScript busca existe en algun sitio.
//   3. Que cada vista a la que se navega existe.
//
// Sin dependencias, como el resto del proyecto: se corre con `node`.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = join(RAIZ, 'docs', 'index.html');

let ok = 0, mal = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { mal++; console.log(`  FALLA ${n}${extra ? '\n        ' + extra : ''}`); }
};

const html = readFileSync(INDEX, 'utf8');

// ---------------------------------------------------------------------
//  De donde sale el JavaScript
// ---------------------------------------------------------------------
// Hoy vive dentro de index.html. Segun avancen las fases ira saliendo a
// modulos; esta funcion es el unico sitio que hay que tocar para que las
// pruebas los sigan.
function fuentes() {
  const out = [];

  for (const m of html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g))
    out.push({ nombre: 'index.html <script>', codigo: m[1], modulo: /type=["']module["']/.test(m[0]) });

  // Un script clasico y un modulo no se comprueban igual: el modulo va en
  // modo estricto y el clasico no, asi que hay que mirar la etiqueta en vez
  // de suponerlo.
  for (const m of html.matchAll(/<script[^>]*\ssrc=["']([^"']+)["'][^>]*>/g)) {
    const ruta = join(RAIZ, 'docs', m[1]);
    const modulo = /type=["']module["']/.test(m[0]);
    if (existsSync(ruta)) out.push({ nombre: m[1], codigo: readFileSync(ruta, 'utf8'), modulo });
    else out.push({ nombre: m[1], codigo: null });
  }

  // Los modulos que se importan entre si no aparecen en el HTML: se siguen
  // los import desde los que si aparecen.
  const vistos = new Set(out.map(f => f.nombre));
  for (let i = 0; i < out.length; i++) {
    const f = out[i];
    if (!f.codigo || !f.nombre.endsWith('.js')) continue;
    for (const m of f.codigo.matchAll(/^\s*(?:import|export)[^'"]*from\s*['"](\.[^'"]+)['"]/gm)) {
      const rel = relative(join(RAIZ, 'docs'), join(dirname(join(RAIZ, 'docs', f.nombre)), m[1]))
        .replace(/\\/g, '/');
      if (vistos.has(rel)) continue;
      vistos.add(rel);
      const ruta = join(RAIZ, 'docs', rel);
      out.push({ nombre: rel, codigo: existsSync(ruta) ? readFileSync(ruta, 'utf8') : null, modulo: true });
    }
  }
  return out;
}

const JS = fuentes();

// Un modulo no compila como script suelto (import y export son ilegales
// ahi), asi que hay que pedirselo a Node de otra manera.
//
// Cuidado con `node --check archivo.js`: si el archivo lleva sintaxis de
// modulo, Node intenta leerlo como CommonJS, falla, y SALE CON 0 sin decir
// nada. Comprobado. Por stdin con --input-type=module si da error de
// verdad, que es lo unico que sirve para una prueba.
function compila(codigo, esModulo) {
  if (!esModulo) {
    try { new vm.Script(codigo); return null; }
    catch (e) { return e.message.split('\n')[0]; }
  }
  const r = spawnSync(process.execPath, ['--input-type=module', '--check'],
    { input: codigo, encoding: 'utf8' });
  if (r.status === 0) return null;
  return (r.stderr || '').split('\n').find(l => /Error/.test(l)) || 'no compila';
}

console.log('— Todo el JavaScript compila —');
for (const f of JS) {
  if (f.codigo === null) { check(`${f.nombre} existe`, false, 'el <script src> apunta a un archivo que no esta'); continue; }
  const err = compila(f.codigo, f.modulo);
  check(`${f.nombre} compila`, err === null, err || '');
}

// ---------------------------------------------------------------------
//  Cada elemento que se busca, existe
// ---------------------------------------------------------------------
// Esta es la que caza el fallo tipico de mover codigo: la funcion se va a
// otro archivo y el markup que la sostenia se queda -o al reves-. El id
// puede estar en el HTML o dentro de una plantilla del JavaScript, porque
// media interfaz se pinta con innerHTML; las dos cuentan.
const todo = html + JS.map(f => f.codigo || '').join('\n');
const declarados = new Set([...todo.matchAll(/\bid=["']([A-Za-z0-9_-]+)["']/g)].map(m => m[1]));
// Los que se construyen a trozos ('toast' + nombre) no se pueden resolver
// leyendo: se declaran aqui a mano para que la prueba no mienta.
const buscados = new Map();
for (const f of JS) {
  if (!f.codigo) continue;
  for (const m of f.codigo.matchAll(/getElementById\(\s*["']([A-Za-z0-9_-]+)["']\s*\)/g))
    if (!buscados.has(m[1])) buscados.set(m[1], f.nombre);
  for (const m of f.codigo.matchAll(/querySelector(?:All)?\(\s*["']#([A-Za-z0-9_-]+)["']/g))
    if (!buscados.has(m[1])) buscados.set(m[1], f.nombre);
}

console.log('\n— Cada elemento que el JavaScript busca, existe —');
const huerfanos = [...buscados].filter(([id]) => !declarados.has(id));
check(`los ${buscados.size} elementos buscados existen`, huerfanos.length === 0,
  huerfanos.map(([id, d]) => `${id}  (${d})`).join('\n        '));

// ---------------------------------------------------------------------
//  Cada vista a la que se navega, existe
// ---------------------------------------------------------------------
// Se llega a una vista por tres sitios: goto(), volverA() y los botones de
// la barra de abajo (data-tabbar). Los tres se escriben literales, asi que
// los tres se pueden comprobar.
console.log('\n— Cada vista a la que se navega, existe —');
const vistas = new Set([...html.matchAll(/data-view=["']([a-z]+)["']/g)].map(m => m[1]));
const navegadas = new Set([...html.matchAll(/data-tabbar=["']([a-z]+)["']/g)].map(m => m[1]));
for (const f of JS) {
  if (!f.codigo) continue;
  for (const m of f.codigo.matchAll(/\b(?:goto|volverA)\(\s*["']([a-z]+)["']/g)) navegadas.add(m[1]);
}
const perdidas = [...navegadas].filter(v => !vistas.has(v));
check(`las ${navegadas.size} vistas navegadas existen`, perdidas.length === 0, perdidas.join(', '));

// ---------------------------------------------------------------------
//  Tamano: para ver el reparto segun avanzan las fases
// ---------------------------------------------------------------------
console.log('\n— Reparto —');
const lineas = t => t.split('\n').length;
console.log(`  index.html            ${String(lineas(html)).padStart(5)} lineas`);
for (const f of JS) if (f.codigo && f.nombre.endsWith('.js'))
  console.log(`  ${f.nombre.padEnd(22)}${String(lineas(f.codigo)).padStart(5)} lineas`);
const css = [...html.matchAll(/<link[^>]*href=["'](estilos\/[^"']+)["']/g)].map(m => m[1]);
for (const c of css) {
  const ruta = join(RAIZ, 'docs', c);
  console.log(`  ${c.padEnd(22)}${String(existsSync(ruta) ? lineas(readFileSync(ruta, 'utf8')) : 0).padStart(5)} lineas`);
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);
