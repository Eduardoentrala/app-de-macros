// LOS PLATILLOS. Lo que de verdad se apunta: unos chilaquiles, un pozole,
// una torta.
//
//  POR QUÉ NO SE COPIAN LOS NÚMEROS DE NINGÚN LADO
//
//  USDA tiene «taco», «burrito» y «enchilada», pero en su sección de
//  comida rápida: son la versión americana y un taco de ahí no es un taco
//  de aquí. Copiar esas cifras sería poner un número con pinta de
//  auditado que no describe lo que esa persona se comió.
//
//  Así que un platillo NO LLEVA MACROS PROPIAS. Lleva una receta: qué
//  ingredientes del catálogo y cuántos gramos de cada uno. Las macros se
//  SUMAN de ahí, y cada ingrediente ya trae su `fdc_id`. La cuenta es
//  comprobable hasta el final, que es más de lo que puede decir una fila
//  copiada de una tabla de otro país.
//
//  Y se puede discutir: si en tu casa los chilaquiles llevan más queso,
//  se cambia el número aquí y se regenera. Discutir un gramaje es una
//  conversación; discutir un «273 kcal» sacado de una tabla no lo es.
//
//  LO QUE ESTO NO ES
//
//  No es «la receta de los chilaquiles». Es un promedio razonable de un
//  plato servido, para poder apuntarlo sin pesar cinco cosas. Quien pese
//  sus ingredientes uno a uno siempre tendrá un número mejor, y para eso
//  está el catálogo de ingredientes.
//
//  Uso:  node platillos.mjs  > ../migrations/0069_platillos.sql
//        (lee los ingredientes de ../migrations/0019_datos_catalogo.sql,
//         así que se regenera desde el repo, sin bajar nada)

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------
//  LA LISTA
//
//  g = gramos de ese ingrediente EN UNA PORCIÓN servida.
//  Los pesos son de plato servido, no de receta para cuatro.
// ---------------------------------------------------------------------
export const PLATILLOS = [
  { n:'Chilaquiles verdes con pollo', s:['chilaquiles','chilaquil'],
    porcion:'1 plato', ing:[
      ['Totopos','unico',60], ['Salsa verde','unico',90],
      ['Pechuga de pollo','cocido',70], ['Crema','unico',20],
      ['Queso fresco','unico',25], ['Cebolla','crudo',10] ] },

  { n:'Huevos con chorizo', s:['huevo','chorizo','huevos'],
    porcion:'1 plato', ing:[
      ['Huevo entero','crudo',100], ['Chorizo','crudo',40],
      ['Aceite vegetal','unico',3] ] },

  { n:'Huevos a la mexicana', s:['huevo','huevos','mexicana'],
    porcion:'1 plato', ing:[
      ['Huevo entero','crudo',100], ['Jitomate','crudo',50],
      ['Cebolla','crudo',20], ['Chile serrano','unico',8],
      ['Aceite vegetal','unico',5] ] },

  { n:'Taco de pollo', s:['taco','tacos','pollo'],
    porcion:'1 taco', ing:[
      ['Tortilla de maíz','unico',28], ['Pechuga de pollo','cocido',40],
      ['Salsa verde','unico',15], ['Cebolla','crudo',5],
      ['Cilantro','unico',2] ] },

  { n:'Taco de carne asada', s:['taco','tacos','asada','carne'],
    porcion:'1 taco', ing:[
      ['Tortilla de maíz','unico',28], ['Arrachera','cocido',45],
      ['Salsa roja','unico',15], ['Cebolla','crudo',5],
      ['Cilantro','unico',2] ] },

  { n:'Quesadilla de queso', s:['quesadilla','queso'],
    porcion:'1 quesadilla', ing:[
      ['Tortilla de maíz','unico',28], ['Queso Oaxaca','unico',40] ] },

  { n:'Sincronizada', s:['sincronizada','jamon','queso'],
    porcion:'1 pieza', ing:[
      ['Tortilla de harina','unico',70], ['Queso Oaxaca','unico',40],
      ['Jamón de pierna','unico',30] ] },

  { n:'Torta de jamón', s:['torta','jamon'],
    porcion:'1 torta', ing:[
      ['Bolillo','unico',90], ['Jamón de pierna','unico',60],
      ['Queso panela','unico',30], ['Aguacate','unico',30],
      ['Jitomate','crudo',20], ['Mayonesa','unico',10] ] },

  { n:'Molletes', s:['molletes','mollete'],
    porcion:'2 mitades', ing:[
      ['Bolillo','unico',90], ['Frijoles refritos','unico',80],
      ['Queso Oaxaca','unico',40] ] },

  { n:'Pozole de pollo', s:['pozole'],
    porcion:'1 plato hondo', ing:[
      ['Elote','cocido',120], ['Pechuga de pollo','cocido',80],
      ['Caldo de pollo','unico',220], ['Lechuga romana','crudo',30],
      ['Rábano','unico',20], ['Cebolla','crudo',15] ] },

  { n:'Enchiladas verdes', s:['enchilada','enchiladas'],
    porcion:'3 piezas', ing:[
      ['Tortilla de maíz','unico',84], ['Pechuga de pollo','cocido',80],
      ['Salsa verde','unico',100], ['Crema','unico',25],
      ['Queso fresco','unico',30] ] },

  { n:'Arroz a la mexicana', s:['arroz','mexicana'],
    porcion:'1 taza', ing:[
      ['Arroz blanco','cocido',150], ['Jitomate','crudo',25],
      ['Chícharo','cocido',20], ['Zanahoria','crudo',20],
      ['Aceite vegetal','unico',6] ] },

  { n:'Sopa de fideo', s:['sopa','fideo'],
    porcion:'1 plato', ing:[
      ['Pasta','cocido',120], ['Jitomate','crudo',50],
      ['Caldo de pollo','unico',150], ['Aceite vegetal','unico',5] ] },

  { n:'Frijoles charros', s:['frijol','frijoles','charros'],
    porcion:'1 taza', ing:[
      ['Frijol pinto','cocido',150], ['Tocino','cocido',15],
      ['Chorizo','crudo',20], ['Jitomate','crudo',25],
      ['Cebolla','crudo',15] ] },

  { n:'Guacamole', s:['guacamole','aguacate'],
    porcion:'1/2 taza', ing:[
      ['Aguacate','unico',100], ['Jitomate','crudo',25],
      ['Cebolla','crudo',15], ['Cilantro','unico',5],
      ['Limón','unico',5] ] },

  { n:'Pico de gallo', s:['pico de gallo','salsa'],
    porcion:'1/2 taza', ing:[
      ['Jitomate','crudo',60], ['Cebolla','crudo',25],
      ['Chile serrano','unico',8], ['Cilantro','unico',5],
      ['Limón','unico',5] ] },

  { n:'Licuado de plátano', s:['licuado','platano','malteada'],
    porcion:'1 vaso', ing:[
      ['Leche entera','unico',250], ['Plátano','unico',120],
      ['Avena','crudo',20] ] },

  { n:'Ensalada de nopales', s:['nopal','nopales','ensalada'],
    porcion:'1 taza', ing:[
      ['Nopal','cocido',120], ['Jitomate','crudo',40],
      ['Cebolla','crudo',20], ['Queso fresco','unico',25],
      ['Cilantro','unico',5] ] },
];

// ---------------------------------------------------------------------
//  Los ingredientes salen de la 0019, que es el fichero generado.
// ---------------------------------------------------------------------
function leerCatalogo() {
  const sql = readFileSync(join(AQUI, '..', 'migrations', '0019_datos_catalogo.sql'), 'utf8');
  const i = sql.indexOf('insert into public.alimentos_catalogo');
  const j = sql.indexOf('on conflict (nombre, estado)', i);
  const mapa = new Map();
  for (const linea of sql.slice(i, j).split('\n')) {
    const m = linea.match(
      /^ *\('((?:[^']|'')*)', '([a-z_]+)', '([a-z]+)', ([\d.]+), ([\d.]+), ([\d.]+), ([\d.]+),/);
    if (!m) continue;
    mapa.set(m[1].replace(/''/g, "'") + '|' + m[3], {
      kcal: Number(m[4]), p: Number(m[5]), c: Number(m[6]), g: Number(m[7]),
    });
  }
  return mapa;
}

const CAT = leerCatalogo();
const esc = (s) => `'${String(s).replace(/'/g, "''")}'`;
const r1 = (x) => Math.round(x * 10) / 10;

const filas = [], sinonimos = [], fallos = [];

for (const pl of PLATILLOS) {
  let peso = 0, kcal = 0, P = 0, C = 0, G = 0, falta = false;
  for (const [nombre, estado, gramos] of pl.ing) {
    const base = CAT.get(nombre + '|' + estado);
    if (!base) { fallos.push(`${pl.n}: no existe «${nombre}» [${estado}]`); falta = true; continue; }
    const f = gramos / 100;
    peso += gramos;
    kcal += base.kcal * f; P += base.p * f; C += base.c * f; G += base.g * f;
  }
  // Lo que no se puede calcular NO se inventa, igual que en resolver.mjs.
  if (falta) continue;

  // La tabla guarda por 100 g, como todo lo demás, y la porción aparte.
  const por100 = (x) => r1(x * 100 / peso);
  // La composición, para poder auditar la cuenta hasta el final.
  const comp = JSON.stringify({
    porcion_g: Math.round(peso),
    ingredientes: pl.ing.map(([n, e, g]) => ({ nombre: n, estado: e, gramos: g })),
  });

  // SE PIDEN POR PORCIÓN, NO POR GRAMOS, y es la mitad de la gracia.
  //
  // La app ofrece el catálogo en gramos a propósito: la «porción» de
  // USDA es texto como «cup, chopped» y no dice cuánto pesa una unidad
  // de comer, así que «1 pieza» de espagueti acababa siendo una taza.
  // Está explicado en app.js con todas sus letras.
  //
  // Un platillo sí lo sabe: un taco pesa 90 g porque los sumé yo. Así
  // que puede usar el camino que ya existe —`unidad` + `pieza_g`— y
  // pedirse como «1 taco» en vez de «90 gramos de taco». Los macros
  // siguen por 100 g (`macros_por` se queda en su valor por omisión) y
  // la app convierte con el peso.
  filas.push(
    `  (${esc(pl.n)}, 'otros', 'unico', ` +
    `${por100(kcal)}, ${por100(P)}, ${por100(C)}, ${por100(G)}, ` +
    `${esc(pl.porcion)}, ${Math.round(peso)}, 'Servicio', ${Math.round(peso)}, ` +
    `${esc(comp)}::jsonb)`
  );
  for (const s of pl.s) sinonimos.push(`    (${esc(pl.n)}, ${esc(s)})`);
}

if (fallos.length) {
  console.error('NO SE GENERÓ NADA. Ingredientes que no están en el catálogo:');
  for (const f of fallos) console.error('  ' + f);
  process.exit(1);
}

const hoy = new Date().toISOString().slice(0, 10);
process.stdout.write(`-- =====================================================================
--  PLATILLOS
--
--  ${filas.length} platos mexicanos de diario. Generado por
--  supabase/alimentos/platillos.mjs el ${hoy}. NO editar a mano.
--
--  NO LLEVAN MACROS COPIADAS DE NINGUNA TABLA. Cada uno es una receta
--  —qué ingredientes del catálogo y cuántos gramos— y sus macros se
--  suman de ahí. La receta va en \`composicion\`, así que la cuenta se
--  puede rehacer entera, y cada ingrediente trae su propio fdc_id.
--
--  USDA tiene «taco» y «enchilada», pero en su sección de comida rápida:
--  son la versión americana. Copiar esas cifras habría sido poner un
--  número con pinta de auditado que no describe lo que nadie se comió.
--
--  Van en la categoría 'otros': lo que los distingue es tener
--  \`composicion\`, no una etiqueta. El porqué está en la 0068.
--
--  Depende de 0019 (los ingredientes) y de 0068 (la columna).
-- =====================================================================

insert into public.alimentos_catalogo
  (nombre, categoria, estado, kcal, proteina, carbos, grasas,
   porcion, porcion_g, unidad, pieza_g, composicion)
values
${filas.join(',\n')}
on conflict (nombre, estado) do update set
  kcal = excluded.kcal, proteina = excluded.proteina,
  carbos = excluded.carbos, grasas = excluded.grasas,
  porcion = excluded.porcion, porcion_g = excluded.porcion_g,
  unidad = excluded.unidad, pieza_g = excluded.pieza_g,
  composicion = excluded.composicion;


-- Sinónimos: «chilaquil», «taco», «licuado».
insert into public.alimentos_sinonimos (alimento_id, termino)
select a.id, v.termino
  from (values
${sinonimos.join(',\n')}
  ) as v(nombre, termino)
  join public.alimentos_catalogo a
    on a.nombre = v.nombre and a.composicion is not null
on conflict (alimento_id, termino) do nothing;


-- ---------------------------------------------------------------------
--  Comprobaciones
-- ---------------------------------------------------------------------
-- Los platillos y de qué están hechos:
--   select nombre, porcion, porcion_g, kcal,
--          jsonb_array_length(composicion->'ingredientes') as ingredientes
--     from public.alimentos_catalogo where composicion is not null
--    order by nombre;
--
-- Y que se encuentren:
--   select * from public.buscar_catalogo('chilaquiles', 5);
--   select * from public.buscar_catalogo('pozole', 5);
`);

console.error(`${filas.length} platillos, ${sinonimos.length} sinónimos`);
