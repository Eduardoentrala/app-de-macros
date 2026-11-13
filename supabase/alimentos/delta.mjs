// Saca la migración 0067 con SOLO lo que 0019 no tenía antes.
//
// El delta se calcula comparando el 0019 generado contra la copia del
// 0019 que estaba en el repo. Mecánico, y así no hay forma de colar en
// producción un `update` sobre una fila que ya estaba.
import { readFileSync, writeFileSync } from 'node:fs';

const D = 'C:/Users/coman/AppData/Local/Temp/claude/072b26855eb02816/1197e5e2-c1ff-472f-a39c-000229ed16ce/scratchpad';
const RAIZ = 'C:/Users/coman/OneDrive/Desktop/app de macros';
// Uso:  node delta.mjs <0019-de-antes.sql> <migracion-de-salida.sql>
const BASE   = process.argv[2] || (D + '/0019.viejo.sql');
const SALIDA = process.argv[3] || (RAIZ + '/supabase/migrations/0067_mas_alimentos.sql');
const viejo = readFileSync(BASE, 'utf8');
const nuevo = readFileSync(RAIZ + '/supabase/migrations/0019_datos_catalogo.sql', 'utf8');

// Las filas de alimentos: líneas que empiezan por "  ('" dentro del
// primer insert.
const filasDe = (s) => {
  const i = s.indexOf('insert into public.alimentos_catalogo');
  const j = s.indexOf('on conflict (nombre, estado)', i);
  return s.slice(i, j).split('\n').filter((l) => l.startsWith("  ('"))
    .map((l) => l.replace(/,\s*$/, ''));
};
// Los sinónimos: líneas "    ('nombre', 'estado', 'termino')".
const sinsDe = (s) => {
  const i = s.indexOf('insert into public.alimentos_sinonimos');
  const j = s.indexOf('on conflict (alimento_id, termino)', i);
  return s.slice(i, j).split('\n').filter((l) => l.trim().startsWith("('"))
    .map((l) => l.trim().replace(/,\s*$/, ''));
};

// Las columnas del insert se LEEN del 0019 generado en vez de
// escribirlas aquí. Estaban a mano y se quedaron en once cuando el
// generador pasó a emitir trece: el delta habría salido con más
// valores que nombres.
const columnasDe = (s) => {
  const i = s.indexOf('insert into public.alimentos_catalogo');
  const j = s.indexOf('values', i);
  return s.slice(s.indexOf('(', i), j).trimEnd();
};

const clave = (fila) => {
  const m = fila.match(/^ *\('((?:[^']|'')*)', '([a-z_]+)', '([a-z]+)'/);
  return m ? m[1] + '|' + m[3] : fila;
};

const antes = new Set(filasDe(viejo).map(clave));
const filasNuevas = filasDe(nuevo).filter((f) => !antes.has(clave(f)));

const nombresNuevos = new Set(filasNuevas.map((f) => clave(f)));
const sinsAntes = new Set(sinsDe(viejo));
const sinsNuevos = sinsDe(nuevo).filter((s) => {
  const m = s.match(/^\('((?:[^']|'')*)', '([a-z]+)', /);
  const k = m ? m[1] + '|' + m[2] : '';
  return nombresNuevos.has(k) && !sinsAntes.has(s);
});

const hoy = new Date().toISOString().slice(0, 10);
const sql = `-- =====================================================================
--  MÁS ALIMENTOS EN EL CATÁLOGO
--
--  ${filasNuevas.length} alimentos nuevos y ${sinsNuevos.length} sinónimos. Mismo origen que los 164
--  de la 0019: USDA SR Legacy, por 100 g, sin tocar, cada uno con su
--  fdc_id y la descripción original para poder auditarlo.
--
--  POR QUÉ ESTA MIGRACIÓN Y NO REGENERAR LA 0019
--
--  La 0019 es el fichero generado y ya tiene estos dentro: se regeneró
--  entera desde curado.mjs el ${hoy}. Pero en producción ya corrió, y
--  volver a pegarla haría un \`on conflict do update\` sobre los 164 que
--  ya estaban. Eso normalmente no cambia nada —los números de USDA son
--  los mismos— salvo en un caso: un alimento que alguien haya corregido
--  a mano desde el panel de admin. Ese se perdería, y en silencio.
--
--  Así que aquí van SOLO los nuevos. El delta se sacó comparando la 0019
--  regenerada contra la que estaba en el repo, no a mano.
--
--  Generado por supabase/alimentos/delta (ver el commit) el ${hoy}.
--  Depende de 0018 y 0019.
-- =====================================================================

insert into public.alimentos_catalogo
${columnasDe(nuevo)}
values
${filasNuevas.join(',\n')}
on conflict (nombre, estado) do nothing;


-- Sinónimos. Se resuelven por nombre+estado para no depender de los id.
--
-- \`do nothing\` y no \`do update\`: si esto se corre dos veces no pasa nada,
-- y si alguien añadió un sinónimo suyo desde el panel, se queda.
insert into public.alimentos_sinonimos (alimento_id, termino)
select a.id, v.termino
  from (values
${sinsNuevos.map((s) => '    ' + s).join(',\n')}
  ) as v(nombre, estado, termino)
  join public.alimentos_catalogo a
    on a.nombre = v.nombre and a.estado::text = v.estado
on conflict (alimento_id, termino) do nothing;


-- ---------------------------------------------------------------------
--  Comprobaciones
-- ---------------------------------------------------------------------
-- Cuántos ingredientes hay ahora (debe dar ${filasDe(nuevo).length}):
--
--   Este número se calcula al generar, no se escribe a mano. Llegó a
--   decir 224 cuando eran 222, porque se quitaron dos alimentos de la
--   lista DESPUÉS de generar el comentario. Un número de comprobación
--   que no cuadra enseña a desconfiar de la comprobación.
--
--   Cuenta solo los ingredientes: los platillos de la 0069 suman aparte.
--   select count(*) from public.alimentos_catalogo;
--
-- Que ninguno tenga macros imposibles (debe dar 0 filas):
--   select nombre, kcal, proteina, carbos, grasas
--     from public.alimentos_catalogo
--    where kcal > 900 or proteina > 100 or carbos > 100 or grasas > 100;
--
-- Y que los nuevos se encuentren al buscar:
--   select * from public.buscar_catalogo('chorizo', 5);
--   select * from public.buscar_catalogo('refritos', 5);
`;

writeFileSync(SALIDA, sql);
console.log(`${SALIDA.split('/').pop()}: ${filasNuevas.length} alimentos, ${sinsNuevos.length} sinónimos`);
console.log('nuevos:', filasNuevas.map((f) => clave(f).split('|')[0]).join(', '));
