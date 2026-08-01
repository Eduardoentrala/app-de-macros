-- =====================================================================
--  PLANES DE COMIDA
--
--  No todo el mundo quiere contar macros. Para mucha gente —los padres de
--  uno, por ejemplo— lo útil es abrir la app y que le diga qué comer hoy,
--  sin pesar nada ni apuntar nada.
--
--  Un plan lo escribe el entrenador (o el super admin) PARA un cliente.
--  El cliente solo lo lee.
--
--  OJO CON ESTA TABLA. 0002 y 0004 generan las políticas recorriendo
--  listas fijas de nombres, y `planes` no está en ellas: si no se le
--  escriben aquí sus políticas, nace sin RLS y la lee cualquiera con la
--  clave anónima. Por eso van explícitas más abajo, y por eso las comidas
--  van en jsonb en vez de en una tabla hija —una tabla hija tendría el
--  mismo problema—.
--
--  Depende de 0013.
-- =====================================================================

create table if not exists public.planes (
  id          uuid primary key default gen_random_uuid(),

  -- De quién es el plan (el cliente), no quién lo escribió
  user_id     uuid not null references auth.users(id) on delete cascade,
  org_id      uuid references public.organizations(id),

  nombre      text not null default 'Mi plan',
  nota        text,

  -- [{ "momento": "Desayuno", "texto": "2 huevos, pan integral, café" }, …]
  -- El orden del array es el orden en que se muestra.
  comidas     jsonb not null default '[]'::jsonb,

  -- Un solo plan vigente por persona; los anteriores quedan de historial
  activo      boolean not null default true,

  creado_por  uuid references auth.users(id),
  archivado_en  timestamptz,
  archivado_por uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_planes_user on public.planes(user_id) where activo;
create index if not exists idx_planes_org  on public.planes(org_id, user_id);


-- ---------------------------------------------------------------------
--  Los mismos automatismos que el resto de tablas de datos
-- ---------------------------------------------------------------------
drop trigger if exists trg_org_planes on public.planes;
create trigger trg_org_planes
  before insert or update of user_id on public.planes
  for each row execute function public.rellenar_org();

drop trigger if exists trg_tocar_planes on public.planes;
create trigger trg_tocar_planes before update on public.planes
  for each row execute function public.tocar_actualizado();

-- Borrar un plan lo archiva, como todo lo demás desde la 0007
drop trigger if exists trg_archivar_planes on public.planes;
create trigger trg_archivar_planes before delete on public.planes
  for each row execute function public.archivar_en_vez_de_borrar();

-- Y queda registrado quién lo cambió y qué decía antes
drop trigger if exists ztrg_auditoria_planes on public.planes;
create trigger ztrg_auditoria_planes
  after update or delete on public.planes
  for each row execute function public.registrar_auditoria();


-- ---------------------------------------------------------------------
--  Quién ve y quién escribe
--
--  Leer: el dueño del plan, su entrenador y el super admin — que es lo
--  que hace puede_ver().
--
--  Escribir: puede_editar_entreno(), la misma regla que las rutinas. El
--  entrenador SÍ puede escribir el plan de su cliente; es justo el
--  sentido de tener entrenador. Un cliente no puede escribirle el plan a
--  otro, aunque conozca su id.
-- ---------------------------------------------------------------------
alter table public.planes enable row level security;

drop policy if exists "planes: ver" on public.planes;
create policy "planes: ver" on public.planes
  for select using (
    (archivado_en is null or public.ver_archivados())
    and public.org_visible(org_id)
    and public.puede_ver(user_id)
  );

drop policy if exists "planes: crear" on public.planes;
create policy "planes: crear" on public.planes
  for insert with check ( public.puede_editar_entreno(user_id) );

drop policy if exists "planes: actualizar" on public.planes;
create policy "planes: actualizar" on public.planes
  for update using ( public.org_visible(org_id) and public.puede_editar_entreno(user_id) )
             with check ( public.puede_editar_entreno(user_id) );

drop policy if exists "planes: borrar" on public.planes;
create policy "planes: borrar" on public.planes
  for delete using ( public.org_visible(org_id) and public.puede_editar_entreno(user_id) );

grant select, insert, update, delete on public.planes to authenticated;


-- ---------------------------------------------------------------------
--  Comprobaciones
-- ---------------------------------------------------------------------
-- La tabla NO debe quedarse sin RLS (debe dar true):
--   select relrowsecurity from pg_class where relname = 'planes';
--
-- Un cliente no puede escribirle el plan a otro (debe FALLAR):
--   insert into public.planes(user_id, nombre) values ('<otro-cliente>', 'X');
--
-- Y el suyo sí lo ve:
--   select nombre, comidas from public.planes where user_id = auth.uid() and activo;
