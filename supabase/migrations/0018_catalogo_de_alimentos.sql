-- =====================================================================
--  CATÁLOGO DE ALIMENTOS (base USDA SR Legacy, en español de México)
--
--  Un catálogo curado: alimentos base, sin marcas, con nombres de aquí.
--  Los datos nutricionales vienen de USDA SR Legacy, que son 7.793
--  alimentos GENÉRICOS -ni una sola marca- y ya trae crudo y cocido como
--  registros distintos. De ahí se selecciona lo que de verdad se come.
--
--  DOS COSAS QUE NO SE HACEN, A PROPÓSITO:
--
--  1. Crudo y cocido NO se convierten. Son filas independientes con sus
--     propios valores. 100 g de arroz crudo y 100 g de arroz cocido no
--     tienen nada que ver -uno absorbió agua- y calcular uno desde el
--     otro es la fuente de error más común en las apps de conteo.
--
--  2. No se guarda "por porción" como dato aparte. Todo va por 100 g,
--     que es como lo publica USDA, y la porción casera se guarda como
--     cuántos gramos pesa. Así solo hay una fuente de verdad y la app
--     multiplica; guardar las dos cosas invita a que se contradigan.
--
--  QUIÉN LO VE:
--     El catálogo entero, solo el super admin. Todos los demás no pueden
--     ni listarlo: lo usan a través de buscar_catalogo(), que devuelve
--     resultados pero no deja descargarse la tabla. Es trabajo de
--     curación y no tiene por qué ser público.
--
--  Depende de 0017.
-- =====================================================================

-- pg_trgm acelera las búsquedas por "contiene" (ver el índice más abajo).
-- Va en un bloque que traga el error a propósito: Supabase la tiene, pero
-- el Postgres en WASM con el que corren las pruebas no. Sin ella todo
-- funciona igual — con mil alimentos, recorrer la tabla entera tarda
-- décimas de milisegundo — así que no vale la pena bloquear por esto.
do $$ begin
  create extension if not exists pg_trgm;
exception when others then
  raise notice 'pg_trgm no disponible; se seguirá sin índice de similitud';
end $$;

do $$ begin
  create type public.estado_alimento as enum ('crudo', 'cocido', 'unico');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.categoria_alimento as enum (
    'carnes', 'aves', 'pescados', 'mariscos', 'huevos', 'lacteos',
    'verduras', 'frutas', 'legumbres', 'cereales', 'pastas', 'arroces',
    'tuberculos', 'semillas', 'frutos_secos', 'aceites', 'grasas',
    'condimentos', 'bebidas', 'harinas', 'panes', 'azucares', 'otros');
exception when duplicate_object then null;
end $$;


create table if not exists public.alimentos_catalogo (
  id            bigint generated always as identity primary key,

  nombre        text not null,
  categoria     public.categoria_alimento not null,
  -- 'unico' para lo que no cambia al cocinarse (un aceite, una manzana).
  -- Obliga a decidirlo en vez de dejarlo en blanco y que la app adivine.
  estado        public.estado_alimento not null default 'unico',

  -- Siempre por 100 g. Ver la nota de arriba sobre por qué solo esto.
  kcal          numeric(6,1) not null check (kcal >= 0),
  proteina      numeric(5,1) not null check (proteina >= 0),
  carbos        numeric(5,1) not null check (carbos  >= 0),
  grasas        numeric(5,1) not null check (grasas  >= 0),

  -- La medida de casa: "1 pieza mediana", "1 taza". Lo que pesa va aparte.
  porcion       text,
  porcion_g     integer check (porcion_g is null or porcion_g > 0),

  -- De dónde salió el dato, para poder auditarlo contra la fuente.
  fdc_id        integer,
  nombre_usda   text,

  activo        boolean not null default true,
  creado_en     timestamptz not null default now(),

  -- El mismo alimento en el mismo estado no se repite.
  unique (nombre, estado)
);

comment on table public.alimentos_catalogo is
  'Catálogo curado de alimentos base. Valores por 100 g, de USDA SR Legacy. '
  'Crudo y cocido son filas independientes: nunca se convierte de uno a otro.';


-- ---------------------------------------------------------------------
--  Búsqueda
--
--  normalizar_texto() viene de la 0012: quita acentos y baja a
--  minúsculas, para que "platano" encuentre "plátano". La columna es
--  generada y va indexada, así que normalizar no cuesta en cada consulta.
--
--  El índice es trigram (pg_trgm) y no de prefijo: quien escribe "pechuga"
--  espera encontrar "Pechuga de pollo", pero quien escribe "pollo"
--  también. Un índice de prefijo solo sirve para lo primero.
-- ---------------------------------------------------------------------
alter table public.alimentos_catalogo
  add column if not exists nombre_norm text
  generated always as (public.normalizar_texto(nombre)) stored;

-- El índice trigram solo si la extensión está. Donde no esté, la búsqueda
-- funciona igual recorriendo la tabla.
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_trgm') then
    create index if not exists idx_catalogo_norm
      on public.alimentos_catalogo using gin (nombre_norm gin_trgm_ops);
  end if;
end $$;

create index if not exists idx_catalogo_cat
  on public.alimentos_catalogo(categoria) where activo;


-- ---------------------------------------------------------------------
--  Sinónimos
--
--  Tabla aparte y no una columna con lista dentro: así cada sinónimo se
--  indexa y buscar por él cuesta lo mismo que buscar por el nombre.
--  "papa"→"patata", "elote"→"maíz", "jitomate"→"tomate".
-- ---------------------------------------------------------------------
create table if not exists public.alimentos_sinonimos (
  id          bigint generated always as identity primary key,
  alimento_id bigint not null references public.alimentos_catalogo(id) on delete cascade,
  termino     text not null,
  termino_norm text generated always as (public.normalizar_texto(termino)) stored,
  unique (alimento_id, termino)
);

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_trgm') then
    create index if not exists idx_sinonimos_norm
      on public.alimentos_sinonimos using gin (termino_norm gin_trgm_ops);
  end if;
end $$;


-- ---------------------------------------------------------------------
--  buscar_catalogo(texto)
--
--  La única puerta de entrada para todo el que no sea super admin.
--  Devuelve filas, pero no permite listar la tabla entera: con texto
--  vacío no devuelve nada, y el límite está acotado.
--
--  Ordena por: coincidencia exacta primero, luego los que empiezan por
--  el texto, luego el resto por parecido. Sin eso, buscar "pollo"
--  devolvía antes "Ensalada de pollo" que "Pollo".
-- ---------------------------------------------------------------------
create or replace function public.buscar_catalogo(
  p_texto  text,
  p_limite integer default 25
)
returns table (
  id bigint, nombre text, categoria public.categoria_alimento,
  estado public.estado_alimento, kcal numeric, proteina numeric,
  carbos numeric, grasas numeric, porcion text, porcion_g integer
)
language sql stable security definer set search_path = public, pg_temp
as $$
  with q as (select public.normalizar_texto(coalesce(p_texto, '')) t)
  select distinct on (a.id)
         a.id, a.nombre, a.categoria, a.estado,
         a.kcal, a.proteina, a.carbos, a.grasas, a.porcion, a.porcion_g
    from public.alimentos_catalogo a
    left join public.alimentos_sinonimos s on s.alimento_id = a.id
   cross join q
   where a.activo
     and length(q.t) >= 2
     and (a.nombre_norm like '%' || q.t || '%' or s.termino_norm like '%' || q.t || '%')
   order by a.id,
            (a.nombre_norm = q.t) desc,
            (a.nombre_norm like q.t || '%') desc,
            length(a.nombre)
   limit least(greatest(p_limite, 1), 50);
$$;

revoke execute on function public.buscar_catalogo(text, integer) from public, anon;
grant  execute on function public.buscar_catalogo(text, integer) to authenticated;


-- ---------------------------------------------------------------------
--  Quién ve la tabla
--
--  Solo el super admin. Los demás no tienen política de SELECT, así que
--  para ellos la tabla no existe: solo llegan a los datos por la función
--  de arriba, que devuelve resultados sueltos y nunca el catálogo entero.
-- ---------------------------------------------------------------------
alter table public.alimentos_catalogo  enable row level security;
alter table public.alimentos_sinonimos enable row level security;

drop policy if exists "catalogo: solo super admin" on public.alimentos_catalogo;
create policy "catalogo: solo super admin" on public.alimentos_catalogo
  for all using ( public.es_super_admin() ) with check ( public.es_super_admin() );

drop policy if exists "sinonimos: solo super admin" on public.alimentos_sinonimos;
create policy "sinonimos: solo super admin" on public.alimentos_sinonimos
  for all using ( public.es_super_admin() ) with check ( public.es_super_admin() );

grant select, insert, update, delete on public.alimentos_catalogo  to authenticated;
grant select, insert, update, delete on public.alimentos_sinonimos to authenticated;
grant usage, select on sequence public.alimentos_catalogo_id_seq  to authenticated;
grant usage, select on sequence public.alimentos_sinonimos_id_seq to authenticated;


-- ---------------------------------------------------------------------
--  Comprobaciones
-- ---------------------------------------------------------------------
-- Un usuario normal NO puede listar el catálogo (debe dar 0 filas):
--   select count(*) from public.alimentos_catalogo;
--
-- Pero sí buscar:
--   select nombre, kcal from public.buscar_catalogo('pollo');
--
-- Y con texto vacío no se descarga nada (debe dar 0):
--   select count(*) from public.buscar_catalogo('');
