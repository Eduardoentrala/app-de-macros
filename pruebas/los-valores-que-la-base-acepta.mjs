// Lo que la pantalla ofrece tiene que ser lo que la base acepta.
//
// Varias columnas llevan una lista cerrada de valores —`check (unit in
// ('Gramos','Pieza',…))`— y la app tiene, en otro fichero, las píldoras y
// las tablas que producen esos valores. Hoy coinciden. Nada obliga a que
// sigan coincidiendo.
//
// Y la forma de romperlo es la más natural del mundo: añadir una píldora.
// Alguien pone «Mililitros» en la pantalla, se ve bien, se puede elegir…
// y cada alimento que se guarde con esa unidad revienta la escritura
// entera, porque Postgres rechaza la fila. No falla la unidad: falla el
// guardado, y el alimento no se apunta.
//
// Es la misma familia que los topes numéricos: dos mitades del mismo
// contrato en ficheros distintos, sin nada en medio.
//
// DOS COSAS QUE ESTA PRUEBA NO PUEDE HACER, y que la primera versión hizo
// mal hasta que la mutación lo destapó:
//
//   · Los valores NO se copian aquí: se leen de las migraciones. Copiarlos
//     sería crear una TERCERA copia que también puede separarse.
//   · Y NO se buscan en la app por su nombre. Un `/(Gramos|Pieza|…)/` solo
//     puede encontrar valores válidos, así que pasa siempre, aunque la
//     pantalla ofrezca «Mililitros». Se sacan por ESTRUCTURA —los botones
//     que hay dentro del cajón de píldoras, las claves de la tabla— para
//     que lo que sobra también aparezca.

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const MIG = join(RAIZ, 'supabase', 'migrations');
const SQL = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => readFileSync(join(MIG, f), 'utf8')).join('\n');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

// --- Lado de la base: las listas cerradas de las migraciones ---------
const PERMITIDOS = {};
for (const m of SQL.matchAll(/check \(\s*(\w+)\s+in \(([^)]+)\)\)/g))
  PERMITIDOS[m[1]] = m[2].split(',').map((s) => s.trim().replace(/^'|'$/g, ''));

// --- Lado de la app: por estructura, nunca por nombre ----------------

// Los botones que hay dentro de un cajón de píldoras. El valor de una
// píldora ES su texto: no llevan `data-` de ningún tipo.
function pildorasDe(id) {
  const i = HTML.indexOf('id="' + id + '"');
  if (i < 0) return null;
  const fin = HTML.indexOf('</div>', i);
  return [...HTML.slice(i, fin).matchAll(/<button[^>]*>([^<]*)</g)]
    .map((m) => m[1].trim()).filter(Boolean);
}

// Las claves de un objeto literal `var X = {a:…, b:…}`.
function clavesDe(nombre) {
  const m = APP.match(new RegExp('var ' + nombre + '\\s*=\\s*\\{([^}]*)\\}'));
  return m ? m[1].split(',').map((p) => p.split(':')[0].trim()).filter(Boolean) : null;
}

console.log('\nSe leen las listas de las migraciones');
{
  ok(Object.keys(PERMITIDOS).length >= 4,
     `se encontraron ${Object.keys(PERMITIDOS).length} listas cerradas`,
     'si salen pocas, esto no compara con nada: ' + JSON.stringify(PERMITIDOS));
  for (const c of ['unit', 'pose', 'meal', 'goal'])
    ok(!!PERMITIDOS[c], `y entre ellas «${c}»`, JSON.stringify(Object.keys(PERMITIDOS)));
}

console.log('\nLas unidades que se pueden elegir son las que la base acepta');
{
  // Dos pantallas ofrecen unidades: crear alimento y el catálogo.
  for (const id of ['unitPills', 'catUnidadPills']) {
    const p = pildorasDe(id);
    ok(p && p.length >= 6, `«${id}» tiene ${p ? p.length : '?'} píldoras`,
       'si no se encuentra el cajón, esta comprobación pasa sin mirar nada');
    const fuera = (p || []).filter((v) => !(PERMITIDOS.unit || []).includes(v));
    ok(fuera.length === 0, `y las de «${id}» están todas permitidas`,
       'la pantalla ofrece ' + JSON.stringify(fuera) + ' y la base solo acepta ' +
       JSON.stringify(PERMITIDOS.unit) + '. No falla esa unidad: falla la ' +
       'escritura ENTERA, y el alimento no se guarda');
  }

  // Y las tres tablas que traducen la unidad tienen que cubrirlas todas:
  // una unidad sin fila sale como «undefined» en pantalla, o se cuela por
  // el `|| '100g'` de reserva y cuenta gramos donde había piezas.
  for (const tabla of ['UNIDAD_ABREV', 'UNIDAD_BASE', 'UNIDAD_UNA']) {
    const k = clavesDe(tabla);
    ok(k && k.length > 0, `se encuentra «${tabla}»`,
       'sin ella esta comprobación pasa sin mirar nada');
    const sobran = (k || []).filter((v) => !(PERMITIDOS.unit || []).includes(v));
    ok(sobran.length === 0, `y «${tabla}» no inventa unidades`,
       JSON.stringify(sobran) + ' no existe en la base');
    const faltan = (pildorasDe('unitPills') || []).filter((v) => !(k || []).includes(v));
    ok(faltan.length === 0, `y «${tabla}» cubre todas las píldoras`,
       'se puede elegir ' + JSON.stringify(faltan) + ' y esa tabla no lo tiene: ' +
       'sale «undefined» en pantalla o se cuenta como gramos');
  }
}

console.log('\nY las comidas, y el objetivo, y las poses');
{
  // Las comidas salen de dos sitios y ninguno se busca por nombre: el
  // atributo de las pestañas y las claves del objeto del día.
  const deHtml = [...new Set([...HTML.matchAll(/data-meal="([^"]*)"/g)].map((m) => m[1]))];
  const deApp = clavesDe('COMIDAS');
  ok(deHtml.length >= 3, `la pantalla tiene ${deHtml.length} comidas`);
  ok(deApp && deApp.length >= 3, `y la app maneja ${deApp ? deApp.length : '?'}`);
  for (const [de, lista] of [['la pantalla', deHtml], ['la app', deApp || []]]) {
    const fuera = lista.filter((v) => !(PERMITIDOS.meal || []).includes(v));
    ok(fuera.length === 0, `las de ${de} están permitidas`,
       JSON.stringify(fuera) + ' contra ' + JSON.stringify(PERMITIDOS.meal));
  }
  // Y las dos mitades entre sí: una pestaña que la app no conoce escribe
  // en un hueco que no existe y el alimento se pierde al pintar.
  const huerfanas = deHtml.filter((v) => !(deApp || []).includes(v));
  ok(huerfanas.length === 0, 'y la app conoce todas las de la pantalla',
     JSON.stringify(huerfanas) + ' se puede elegir y no tiene lista donde caer');

  const obj = [...new Set([...HTML.matchAll(/data-obj="([^"]*)"/g)].map((m) => m[1]))];
  ok(obj.length >= 3, `hay ${obj.length} objetivos en la pantalla`);
  ok(obj.every((v) => (PERMITIDOS.goal || []).includes(v)),
     'y todos están permitidos',
     JSON.stringify(obj) + ' contra ' + JSON.stringify(PERMITIDOS.goal));

  const pose = [...new Set([...HTML.matchAll(/data-pose="([^"]*)"/g)].map((m) => m[1]))];
  ok(pose.length === (PERMITIDOS.pose || []).length,
     `las poses de la pantalla son ${pose.length} y la base acepta ` +
     `${(PERMITIDOS.pose || []).length}`,
     'app: ' + JSON.stringify(pose) + ' · base: ' + JSON.stringify(PERMITIDOS.pose));
  ok(pose.every((v) => (PERMITIDOS.pose || []).includes(v)),
     'y todas están permitidas', JSON.stringify(pose));
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);
