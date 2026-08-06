// En qué se registra cada alimento del catálogo: gramos, piezas o servicios.
//
// Lo que había: la app DEDUCÍA la unidad del propio dato -"si tiene pieza_g,
// va por piezas"-. Valía mientras la pieza fuese la única forma de contar
// que no eran gramos y solo la pusiera una migración a mano. Desde que el
// panel puede dar de alta productos, cuánto pesa una unidad y cómo se llama
// esa unidad son dos datos distintos.
//
// La trampa que cubre este archivo: al añadir la columna `unidad` con valor
// por defecto 'Gramos', el huevo y la tortilla -que hoy se cuentan por
// piezas SOLO porque tienen pieza_g- se habrían caído a gramos sin que
// saltara ningún error. Nadie habría visto un fallo: simplemente el huevo
// habría dejado de contarse por huevos.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8');
const SQL = readFileSync(
  join(RAIZ, 'supabase', 'migrations', '0033_unidad_del_catalogo.sql'), 'utf8');

let ok = 0, mal = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { mal++; console.log(`  FALLA ${n}${extra ? '\n        ' + extra : ''}`); }
};

console.log('\n— El panel deja elegir las tres —');
{
  const i = HTML.indexOf('id="catUnidad"');
  const trozo = i > 0 ? HTML.slice(i, i + 400) : '';
  check('hay selector de unidad', i > 0);
  for (const u of ['Gramos', 'Pieza', 'Servicio'])
    check(`se puede elegir ${u}`, new RegExp(`value="${u}"`).test(trozo), trozo.slice(0, 200));
  check('hay campo para el peso de una unidad', /id="catPiezaG"/.test(HTML));
  // Empieza oculto: por defecto es gramos y ahí ese campo no pinta nada.
  check('el peso empieza oculto', /id="catPesoUnidad" hidden/.test(HTML));
  // Teclado numérico: es un peso en gramos, siempre entero.
  check('pide teclado numérico', /id="catPiezaG"[^>]*inputmode="numeric"/.test(HTML));
}

console.log('\n— Y no se confunde con la porción de USDA —');
{
  // Son dos cosas distintas y estaban a un campo de distancia: `porcion_g`
  // es la referencia de USDA ("cup, chopped") con la que se audita la fila
  // contra la fuente, y `pieza_g` es cuánto pesa una unidad de comer. De
  // confundirlas venía que "1 Pieza" de espagueti acabara siendo una taza.
  check('la porción de USDA se llama por su nombre', /Porción de USDA/.test(HTML));
  check('siguen siendo campos separados',
    /id="catPorcionG"/.test(HTML) && /id="catPiezaG"/.test(HTML));
}

console.log('\n— Se guarda lo que se eligió —');
{
  const i = APP.indexOf("var unidad = document.getElementById('catUnidad')");
  const trozo = i > 0 ? APP.slice(i, i + 1600) : '';
  check('el guardado lee la unidad', i > 0);
  check('la manda a la base', /unidad:\s*unidad/.test(trozo));
  check('manda también el peso de la unidad', /pieza_g:/.test(trozo));
  // Contar por piezas sin saber cuánto pesa una es imposible: los macros
  // están por 100 g y sin ese peso no hay con qué convertir.
  check('no deja guardar piezas sin peso',
    /if\(unidad !== 'Gramos' && piezaG <= 0\)/.test(trozo), trozo.slice(0, 300));
  check('y lo dice con palabras, no con un error de Postgres',
    /toast\('toastAdmin', 'Di cuánto pesa/.test(trozo));
  // En gramos se limpia: un peso por pieza colgando de un alimento que va
  // en gramos no significa nada y confunde al siguiente que lo abra.
  check('en gramos el peso se limpia a null',
    /unidad === 'Gramos' \? null : piezaG/.test(trozo));
}

console.log('\n— Al reabrirlo, sale como se dejó —');
{
  const i = APP.indexOf('function abrirCatalogo(');
  const trozo = APP.slice(i, i + 1800);
  check('recupera la unidad guardada', /catUnidad'\)\.value = \(a && a\.unidad\) \|\| 'Gramos'/.test(trozo));
  check('recupera el peso guardado', /catPiezaG'\)\.value  = \(a && a\.pieza_g\) \|\| ''/.test(trozo));
  check('y repinta el formulario', /pintarUnidadCatalogo\(\);/.test(trozo));
}

console.log('\n— El buscador lo ofrece en su unidad —');
{
  const i = APP.indexOf('var pz = Number(x.pieza_g) || 0;');
  const trozo = APP.slice(i, i + 500);
  check('la unidad la dice la fila, no se adivina',
    /var uni = x\.unidad \|\| 'Gramos';/.test(trozo));
  check('solo convierte si no son gramos y hay peso',
    /if\(uni !== 'Gramos' && pz > 0\)/.test(trozo), trozo.slice(0, 250));
  // Antes ponía 'Pieza' a pelo: un servicio habría salido como pieza.
  check('usa la unidad de verdad y no «Pieza» fijo',
    /u:uni, cant:1/.test(trozo) && !/u:'Pieza', cant:1/.test(trozo));
  // Los macros del catálogo son por 100 g SIEMPRE; la conversión es aquí.
  check('convierte los macros con el peso de la unidad',
    /Math\.round\(v \* pz \/ 100 \* 10\) \/ 10/.test(trozo));
}

console.log('\n— La base lo defiende sola —');
{
  check('la columna existe', /add column if not exists unidad text not null default 'Gramos'/.test(SQL));
  check('solo admite las tres', /unidad in \('Gramos', 'Pieza', 'Servicio'\)/.test(SQL));
  check('exige el peso si no son gramos',
    /unidad = 'Gramos' or pieza_g is not null/.test(SQL));

  // LO IMPORTANTE: el relleno va ANTES del check. Sin él, huevo y tortilla
  // -que hoy se cuentan por piezas solo porque tienen pieza_g- se habrían
  // quedado en 'Gramos' y habrían dejado de contarse por piezas en silencio.
  const iRelleno = SQL.indexOf("set unidad = 'Pieza'");
  const iCheck = SQL.indexOf('alimentos_catalogo_unidad_valida check');
  check('rellena lo que ya iba por piezas', iRelleno > 0);
  check('y lo hace ANTES de exigir el check', iRelleno > 0 && iCheck > 0 && iRelleno < iCheck,
    `relleno en ${iRelleno}, check en ${iCheck}`);
  check('solo toca lo que tiene peso de pieza',
    /where pieza_g is not null/.test(SQL));

  // La búsqueda tiene que devolverla o la app no puede saberla.
  check('buscar_catalogo devuelve la unidad',
    /pieza_g integer, unidad text/.test(SQL) && /a\.pieza_g, a\.unidad/.test(SQL));
  // `create or replace` no puede cambiar el tipo que devuelve una función.
  check('se suelta antes de recrearla',
    SQL.indexOf('drop function if exists public.buscar_catalogo') <
    SQL.indexOf('create or replace function public.buscar_catalogo'));
  check('no la puede llamar quien no tiene sesión',
    /revoke execute on function public\.buscar_catalogo\(text, integer\) from public, anon;/.test(SQL));
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);
