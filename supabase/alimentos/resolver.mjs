// Cruza la lista curada con los datos de USDA y genera el SQL de carga.
//
// Regla de oro: lo que no encuentre se reporta y NO se inventa. Un
// alimento con macros aproximados "para no dejar el hueco" es peor que un
// alimento que falta: el hueco se ve, el dato malo no.
//
// Uso:  node resolver.mjs <crudo.json>  > ../migrations/0019_datos_catalogo.sql
import { readFileSync } from 'node:fs';
import { CATALOGO } from './curado.mjs';

const USDA = JSON.parse(readFileSync(process.argv[2], 'utf8'));

const esc = (s) => s === null || s === undefined ? 'null' : `'${String(s).replace(/'/g, "''")}'`;

const filas = [], sinonimos = [], fallos = [], ambiguos = [], conAlcohol = [];

for (const item of CATALOGO) {
  const cand = USDA.filter(u => item.u.test(u.en));

  if (cand.length === 0) { fallos.push(item); continue; }
  // Varios candidatos: se queda con el de descripción más corta, que en
  // USDA es siempre el más genérico ("Broccoli, raw" antes que
  // "Broccoli, raw, from Alaska"). Se anota para poder revisarlo.
  if (cand.length > 1) ambiguos.push({ item, cand });
  const u = cand.slice().sort((a, b) => a.en.length - b.en.length)[0];

  // AQUÍ NO VA `unidad` NI `pieza_g`, Y NO ES OLVIDO.
  //
  // Se intentó: el bolillo por piezas necesitaba su peso y parecía que
  // el sitio natural era este. Pero esta migración es la 0019 y esas dos
  // columnas no existen hasta la 0023 y la 0033. Al regenerar, el
  // esquema de prueba reventaba con «column "unidad" does not exist».
  //
  // El proyecto ya tiene el patrón bueno: la fila nace aquí en gramos y
  // una migración POSTERIOR le pone el peso por pieza, que es lo que
  // hacen la 0023 con el huevo y la 0028 con la tortilla.
  filas.push(
    `  (${esc(item.n)}, ${esc(item.cat)}, ${esc(item.e)}, ` +
    `${u.kcal}, ${u.p}, ${u.c}, ${u.g}, ` +
    `${esc(u.porcion)}, ${u.porcion_g === null ? 'null' : u.porcion_g}, ` +
    `${u.fdc}, ${esc(u.en)})`
  );
  // EL ALCOHOL VA APARTE, Y NO POR CAPRICHO. Su columna la crea la
  // 0073 y esta migración es la 0019: si fuera en el insert, el
  // esquema reventaría con «column "alcohol" does not exist». Igual
  // que pasó con `unidad` y `pieza_g`.
  //
  // Así que sale como un bloque de `update` al final del fichero, que
  // se ejecuta cuando la columna ya existe. Solo para los que lo
  // tienen: hoy son el 1% de USDA.
  if (u.alc > 0) conAlcohol.push({ n: item.n, e: item.e, alc: u.alc });

  for (const s of (item.s || [])) {
    sinonimos.push({ nombre: item.n, estado: item.e, termino: s });
  }
}

// --- Informe a stderr: no ensucia el SQL y se ve al ejecutar ---
console.error(`resueltos : ${filas.length} de ${CATALOGO.length}`);
console.error(`sinonimos : ${sinonimos.length}`);
if (ambiguos.length) {
  console.error(`\nvarios candidatos (${ambiguos.length}) — se tomo el nombre mas corto:`);
  for (const a of ambiguos.slice(0, 12)) {
    console.error(`  ${a.item.n} [${a.item.e}] -> ${a.cand.length} opciones`);
  }
}
if (fallos.length) {
  console.error(`\nNO ENCONTRADOS (${fallos.length}) — hay que corregir el patron:`);
  for (const f of fallos) console.error(`  ${f.n} [${f.e}]  ${f.u}`);
}

// --- SQL ---
const hoy = new Date().toISOString().slice(0, 10);
console.log(`-- =====================================================================
--  DATOS DEL CATÁLOGO DE ALIMENTOS
--
--  Generado por supabase/alimentos/resolver.mjs el ${hoy}.
--  NO editar a mano: se regenera desde curado.mjs + USDA SR Legacy.
--
--  ${filas.length} alimentos. Los macros son de USDA, por 100 g, sin tocar.
--  Cada fila lleva su fdc_id y la descripción original para poder
--  auditarla contra la fuente.
--
--  Depende de 0018.
-- =====================================================================

insert into public.alimentos_catalogo
  (nombre, categoria, estado, kcal, proteina, carbos, grasas,
   porcion, porcion_g, fdc_id, nombre_usda)
values
${filas.join(',\n')}
on conflict (nombre, estado) do update set
  kcal = excluded.kcal, proteina = excluded.proteina,
  carbos = excluded.carbos, grasas = excluded.grasas,
  porcion = excluded.porcion, porcion_g = excluded.porcion_g,
  fdc_id = excluded.fdc_id, nombre_usda = excluded.nombre_usda;


-- Sinónimos. Se resuelven por nombre+estado para no depender de los id,
-- que los asigna la base al insertar.
insert into public.alimentos_sinonimos (alimento_id, termino)
select a.id, v.termino
  from (values
${sinonimos.map(s => `    (${esc(s.nombre)}, ${esc(s.estado)}, ${esc(s.termino)})`).join(',\n')}
       ) as v(nombre, estado, termino)
  join public.alimentos_catalogo a
    on a.nombre = v.nombre and a.estado::text = v.estado
on conflict (alimento_id, termino) do nothing;

-- EL ALCOHOL NO SE EMITE AQUÍ, Y ES LA TERCERA VEZ QUE PASA LO MISMO.
--
-- Su columna la crea la 0073 y esta migración es la 0019: cualquier
-- cosa que la mencione revienta con «column "alcohol" does not exist»,
-- igual que pasó al intentar meter \`unidad\` y \`pieza_g\`.
--
-- Esta migración es la PRIMERA que toca el catálogo. Todo lo que no
-- existía ya en la 0018 tiene que ponerlo una migración posterior, y es
-- lo que hacen la 0023 con el peso del huevo, la 0072 con el del
-- bolillo y la 0073 con el alcohol de la cerveza.
--
-- \`extraer.mjs\` SÍ saca el alcohol de USDA —nutriente 1018, 73 de los
-- 7.793 lo traen— y lo deja en el volcado. Está ahí para el día que
-- haga falta, y para que el número no tenga que teclearlo nadie:
-- ${conAlcohol.length ? conAlcohol.map((x) => x.n + ' ' + x.alc + ' g').join(', ') : 'hoy ninguno del catálogo lo tiene'}.

-- ---------------------------------------------------------------------
--  Comprobaciones
-- ---------------------------------------------------------------------
-- Cuántos quedaron y de qué tipo:
--   select categoria, estado, count(*) from public.alimentos_catalogo
--    group by 1,2 order by 1,2;
--
-- Que ninguno tenga macros imposibles (debe dar 0 filas):
--
--   El tope eran 900 y NUNCA daba cero: la manteca de cerdo son 902 kcal
--   por 100 g, que es lo que pesa una grasa pura, y salía marcada desde
--   el primer día. Una comprobación que siempre enseña la misma fila no
--   la mira nadie.
--
--   select nombre, kcal, proteina, carbos, grasas
--     from public.alimentos_catalogo
--    where kcal > 920 or proteina > 100 or carbos > 100 or grasas > 100;
`);
