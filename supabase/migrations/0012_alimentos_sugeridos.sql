-- =====================================================================
--  SUGERENCIAS DE ALIMENTOS, ALIMENTADAS POR QUIEN USA LA APP
--
--  Al escribir en el buscador aparecen alimentos que otras personas ya
--  crearon. No es un catálogo comprado ni una base mundial: es lo que la
--  gente de ESTA app ha ido registrando.
--
--  LA REGLA QUE LO HACE VIABLE: un alimento no se sugiere hasta que
--  varias personas lo han creado por separado. Eso resuelve dos problemas
--  a la vez:
--
--    1. PRIVACIDAD. Si se sugiriera todo lo que alguien guarda, el primero
--       que apunte "Pastel de cumpleaños de mi mamá" o "Batido de la dieta
--       del Dr. X" se lo estaría enseñando a desconocidos. Exigiendo que
--       coincidan varias personas, lo que se sugiere es solo lo que ya es
--       de dominio común.
--
--    2. CALIDAD. Si uno se equivoca tecleando los macros, su error no se
--       propaga: hacen falta varios que coincidan, y de sus valores se
--       toma la MEDIANA, que ignora los extremos.
--
--  El umbral se ajusta desde system_settings sin tocar código.
--
--  Depende de 0011.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Normalizar un nombre
--
--    "Avena", "avena ", "AVENA" y "Aveña" tienen que ser lo mismo, o la
--    agrupación no juntaría nada y nunca se alcanzaría el umbral.
--
--    Se hace con translate() y no con la extensión unaccent porque esta
--    no está garantizada en todos los proyectos, y para español basta.
--    IMMUTABLE es obligatorio para poder indexar por esta función.
-- ---------------------------------------------------------------------
create or replace function public.normalizar_texto(p_texto text)
returns text
language sql immutable
as $$
  select regexp_replace(
           translate(lower(coalesce(p_texto, '')),
                     'áàäâéèëêíìïîóòöôúùüûñç',
                     'aaaaeeeeiiiioooouuuunc'),
           '\s+', ' ', 'g')
$$;

-- Sin este índice, cada búsqueda recorrería la tabla entera de alimentos
-- de todo el mundo.
create index if not exists idx_saved_foods_normalizado
  on public.saved_foods (public.normalizar_texto(name))
  where archivado_en is null;


-- ---------------------------------------------------------------------
-- 2. Cuántas personas hacen falta para que algo se sugiera
-- ---------------------------------------------------------------------
insert into public.system_settings (clave, valor, descripcion) values
  ('min_personas_alimento', '3'::jsonb,
   'Cuántas personas distintas deben haber creado un alimento para que empiece a sugerirse a los demás.')
on conflict (clave) do nothing;


-- ---------------------------------------------------------------------
-- 3. La búsqueda
--
--    SECURITY DEFINER a propósito: tiene que mirar los alimentos de TODA
--    la gente, y el RLS de saved_foods solo deja ver los propios. Por eso
--    la función devuelve únicamente datos agregados —nombre, unidad y
--    macros— y NUNCA de quién son. No hay forma de saber quién guardó qué.
--
--    Devuelve la mediana de cada macro y la forma de escribir el nombre
--    más repetida.
-- ---------------------------------------------------------------------
create or replace function public.buscar_alimentos(p_texto text, p_limite int default 12)
returns table (
  nombre     text,
  unit       text,
  protein_g  numeric,
  carbs_g    numeric,
  fat_g      numeric,
  personas   int
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  v_min int;
  v_busca text := public.normalizar_texto(p_texto);
begin
  -- Menos de dos letras devuelve vacío: con una sola, la lista sería ruido
  if length(trim(v_busca)) < 2 then
    return;
  end if;

  select coalesce((valor)::text::int, 3) into v_min
    from public.system_settings where clave = 'min_personas_alimento';

  return query
  select
    mode() within group (order by f.name)                                    as nombre,
    f.unit,
    round(percentile_cont(0.5) within group (order by f.protein_g)::numeric, 1) as protein_g,
    round(percentile_cont(0.5) within group (order by f.carbs_g)::numeric, 1)   as carbs_g,
    round(percentile_cont(0.5) within group (order by f.fat_g)::numeric, 1)     as fat_g,
    count(distinct f.user_id)::int                                           as personas
  from public.saved_foods f
  where f.archivado_en is null
    and public.normalizar_texto(f.name) like '%' || v_busca || '%'
  group by public.normalizar_texto(f.name), f.unit
  having count(distinct f.user_id) >= v_min
  -- Primero lo que más gente tiene; a igualdad, lo que más se usa
  order by count(distinct f.user_id) desc, sum(f.veces_usado) desc
  limit least(greatest(p_limite, 1), 25);
end $$;

revoke execute on function public.buscar_alimentos(text, int) from public;
grant  execute on function public.buscar_alimentos(text, int) to authenticated;


-- ---------------------------------------------------------------------
-- 4. Comprobaciones
-- ---------------------------------------------------------------------
-- La normalización junta lo que debe (las tres deben dar 'avena'):
--   select public.normalizar_texto('Avena'), public.normalizar_texto('  AVENA '),
--          public.normalizar_texto('Aveña');
--
-- Buscar (vacío mientras no haya suficientes personas con ese alimento):
--   select * from public.buscar_alimentos('pollo');
--
-- Cuánto falta para que algo empiece a sugerirse:
--   select public.normalizar_texto(name) alimento, count(distinct user_id) personas
--     from public.saved_foods where archivado_en is null
--    group by 1 order by 2 desc limit 20;
--
-- Y para aflojar o endurecer el umbral:
--   update public.system_settings set valor = '2'::jsonb
--    where clave = 'min_personas_alimento';
