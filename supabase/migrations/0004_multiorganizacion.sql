-- =====================================================================
--  MULTI-ORGANIZACIÓN (SaaS)
--  Plataforma → Organizaciones → Entrenadores → Clientes
--
--  Depende de 0002 (roles/RLS) y 0003 (panel admin).
--
--  NO rompe nada de lo existente: crea una organización por defecto,
--  mete ahí a todos los usuarios actuales y añade el aislamiento por
--  organización SIN cambiar una sola consulta de la app. La interfaz
--  no se entera de que existe `org_id`: lo rellenan triggers y lo
--  filtran las políticas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Organizaciones
-- ---------------------------------------------------------------------
create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  slug        text not null unique,
  activo      boolean not null default true,
  plan        text not null default 'basico',
  max_coaches  int not null default 10,
  max_clientes int not null default 500,
  creado_en   timestamptz not null default now()
);

create index if not exists idx_org_activo on public.organizations(activo) where activo;

-- Organización por defecto: aquí vive todo lo que ya existe
insert into public.organizations (nombre, slug, plan, max_coaches, max_clientes)
values ('Organización principal', 'principal', 'ilimitado', 1000, 100000)
on conflict (slug) do nothing;


-- ---------------------------------------------------------------------
-- 2. Cada usuario pertenece a una organización
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists org_id uuid references public.organizations(id) on delete restrict;

-- Traspasar a los usuarios que ya existían
update public.profiles
   set org_id = (select id from public.organizations where slug = 'principal')
 where org_id is null;

alter table public.profiles alter column org_id set not null;

create index if not exists idx_profiles_org      on public.profiles(org_id);
create index if not exists idx_profiles_org_rol  on public.profiles(org_id, role);

-- Nuevo rol: quien administra UNA organización (por debajo del super admin).
--
-- El `alter type ... add value 'org_admin'` NO va aquí: Postgres prohíbe
-- usar un valor de enum en la misma transacción en que se añade, y este
-- archivo lo usaría unas líneas más abajo. Probado: la migración entera
-- fallaba con "unsafe use of new value org_admin of enum type app_role".
--
-- El valor se añade en 0005, que no hace nada más precisamente para que
-- su transacción cierre antes de que alguien lo use.


-- ---------------------------------------------------------------------
-- 3. Funciones de organización
--    STABLE + SECURITY DEFINER, igual que las de 0002: se evalúan una
--    vez por consulta, no una por fila.
-- ---------------------------------------------------------------------
create or replace function public.mi_org()
returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$ select org_id from public.profiles where id = auth.uid() $$;

create or replace function public.es_org_admin()
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    -- `role::text` y no `role = 'org_admin'`: el valor del enum todavía no
    -- existe cuando corre esta migración (lo añade 0005). Comparar como
    -- texto es legal siempre y devuelve false hasta que exista.
    where id = auth.uid() and role::text = 'org_admin'
  )
$$;

create or replace function public.misma_org(objetivo uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = objetivo and p.org_id = public.mi_org()
  )
$$;

grant execute on function public.mi_org()          to authenticated;
grant execute on function public.es_org_admin()    to authenticated;
grant execute on function public.misma_org(uuid)   to authenticated;


-- ---------------------------------------------------------------------
-- 4. Reglas de visibilidad, ahora con organización
--
--    Se REEMPLAZAN las funciones de 0002. Como las políticas las llaman
--    por nombre, todas se actualizan solas: cero políticas que reescribir.
--    Esto es lo que evita duplicar reglas por tabla.
-- ---------------------------------------------------------------------
create or replace function public.puede_ver(objetivo uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select objetivo is not null and (
       objetivo = auth.uid()                                  -- lo mío
    or public.es_super_admin()                                -- la plataforma entera
    or (public.es_org_admin() and public.misma_org(objetivo)) -- mi organización
    or public.es_coach_de(objetivo)                           -- mis clientes asignados
  )
$$;

create or replace function public.puede_editar_entreno(objetivo uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select objetivo is not null and (
       objetivo = auth.uid()
    or public.es_super_admin()
    or (public.es_org_admin() and public.misma_org(objetivo))
    or public.es_coach_de(objetivo)
  )
$$;

-- Un coach solo ve a los clientes que le asignaron Y de su propia
-- organización: si alguien lo asignara mal entre organizaciones, la
-- segunda condición lo corta igual.
create or replace function public.es_coach_de(objetivo uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.coach_clientes cc
      join public.profiles pc on pc.id = cc.cliente_id
      join public.profiles pe on pe.id = cc.coach_id
     where cc.coach_id = auth.uid()
       and cc.cliente_id = objetivo
       and cc.activo
       and pc.org_id = pe.org_id
  )
$$;


-- ---------------------------------------------------------------------
-- 5. `org_id` en las tablas de datos
--
--    Se guarda la organización en cada fila (clave de inquilino
--    desnormalizada). Cuesta una columna, pero evita un JOIN contra
--    profiles en CADA política y CADA consulta — con millones de filas
--    es la diferencia entre índice y escaneo. También deja la puerta
--    abierta a particionar por organización más adelante.
--
--    La app NUNCA envía org_id: lo pone un trigger. Así ninguna
--    pantalla existente necesita cambiar.
-- ---------------------------------------------------------------------
create or replace function public.rellenar_org()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_org uuid;
begin
  select org_id into v_org from public.profiles where id = new.user_id;
  if v_org is null then
    raise exception 'El usuario % no pertenece a ninguna organización', new.user_id;
  end if;
  new.org_id := v_org;      -- se ignora lo que mande el cliente: manda el servidor
  return new;
end $$;

do $$
declare
  t text;
  tablas text[] := array[
    'diary_entries', 'saved_foods', 'recipes',
    'weight_logs', 'cardio_logs', 'progress_photos',
    'routine_days', 'routine_exercises', 'exercise_sets',
    'workout_sessions', 'exercise_notes'
  ];
begin
  foreach t in array tablas loop
    if to_regclass('public.' || t) is null then continue; end if;

    -- columna
    execute format('alter table public.%I add column if not exists org_id uuid references public.organizations(id)', t);

    -- rellenar lo que ya existe
    execute format('update public.%I d set org_id = p.org_id from public.profiles p
                     where p.id = d.user_id and d.org_id is null', t);

    execute format('alter table public.%I alter column org_id set not null', t);

    -- índice compuesto: la organización va primero porque es el filtro
    -- más selectivo en un SaaS con muchos inquilinos
    execute format('create index if not exists idx_%s_org_user on public.%I(org_id, user_id)', t, t);

    -- trigger que lo rellena solo
    execute format('drop trigger if exists trg_org_%s on public.%I', t, t);
    execute format('create trigger trg_org_%s before insert or update of user_id on public.%I
                    for each row execute function public.rellenar_org()', t, t);
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 6. Aislamiento por organización en las políticas
--
--    Defensa en profundidad: aunque `puede_ver` ya lo cubre, se añade
--    la condición de organización directamente en la política. Si
--    alguien introdujera un fallo en las funciones, el inquilino
--    seguiría aislado.
--
--    El super admin la salta a propósito: administra toda la plataforma.
-- ---------------------------------------------------------------------
create or replace function public.org_visible(fila_org uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$ select public.es_super_admin() or fila_org = public.mi_org() $$;
grant execute on function public.org_visible(uuid) to authenticated;

do $$
declare
  t text;
  personales text[] := array['diary_entries','saved_foods','recipes','weight_logs','cardio_logs','progress_photos'];
  entreno    text[] := array['routine_days','routine_exercises','exercise_sets','workout_sessions','exercise_notes'];
begin
  foreach t in array personales loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists "%s: ver" on public.%I', t, t);
    execute format('create policy "%s: ver" on public.%I for select
                    using (public.org_visible(org_id) and public.puede_ver(user_id))', t, t);
    execute format('drop policy if exists "%s: insertar" on public.%I', t, t);
    execute format('create policy "%s: insertar" on public.%I for insert
                    with check (public.puede_editar_propio(user_id))', t, t);
    execute format('drop policy if exists "%s: actualizar" on public.%I', t, t);
    execute format('create policy "%s: actualizar" on public.%I for update
                    using (public.org_visible(org_id) and public.puede_editar_propio(user_id))
                    with check (public.puede_editar_propio(user_id))', t, t);
    execute format('drop policy if exists "%s: borrar" on public.%I', t, t);
    execute format('create policy "%s: borrar" on public.%I for delete
                    using (public.org_visible(org_id) and public.puede_editar_propio(user_id))', t, t);
  end loop;

  foreach t in array entreno loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists "%s: ver" on public.%I', t, t);
    execute format('create policy "%s: ver" on public.%I for select
                    using (public.org_visible(org_id) and public.puede_ver(user_id))', t, t);
    execute format('drop policy if exists "%s: insertar" on public.%I', t, t);
    execute format('create policy "%s: insertar" on public.%I for insert
                    with check (public.puede_editar_entreno(user_id))', t, t);
    execute format('drop policy if exists "%s: actualizar" on public.%I', t, t);
    execute format('create policy "%s: actualizar" on public.%I for update
                    using (public.org_visible(org_id) and public.puede_editar_entreno(user_id))
                    with check (public.puede_editar_entreno(user_id))', t, t);
    execute format('drop policy if exists "%s: borrar" on public.%I', t, t);
    execute format('create policy "%s: borrar" on public.%I for delete
                    using (public.org_visible(org_id) and public.puede_editar_entreno(user_id))', t, t);
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 7. Políticas de las organizaciones
-- ---------------------------------------------------------------------
alter table public.organizations enable row level security;

drop policy if exists "orgs: ver la mía" on public.organizations;
create policy "orgs: ver la mía" on public.organizations
  for select using ( public.es_super_admin() or id = public.mi_org() );

drop policy if exists "orgs: solo super admin crea" on public.organizations;
create policy "orgs: solo super admin crea" on public.organizations
  for insert with check ( public.es_super_admin() );

drop policy if exists "orgs: editar" on public.organizations;
create policy "orgs: editar" on public.organizations
  for update using ( public.es_super_admin() or (public.es_org_admin() and id = public.mi_org()) )
             with check ( public.es_super_admin() or (public.es_org_admin() and id = public.mi_org()) );

drop policy if exists "orgs: solo super admin borra" on public.organizations;
create policy "orgs: solo super admin borra" on public.organizations
  for delete using ( public.es_super_admin() );


-- ---------------------------------------------------------------------
-- 8. No mezclar organizaciones al asignar clientes
-- ---------------------------------------------------------------------
create or replace function public.validar_asignacion()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_org_coach uuid; v_org_cliente uuid; v_tope int; v_actuales int;
begin
  select org_id into v_org_coach   from public.profiles where id = new.coach_id;
  select org_id into v_org_cliente from public.profiles where id = new.cliente_id;

  if v_org_coach is distinct from v_org_cliente then
    raise exception 'El coach y el cliente son de organizaciones distintas';
  end if;

  if new.activo then
    select max_coaches into v_tope from public.organizations where id = v_org_coach;
    select count(*) into v_actuales
      from public.coach_clientes cc join public.profiles p on p.id = cc.coach_id
     where p.org_id = v_org_coach and cc.activo;
  end if;

  return new;
end $$;

drop trigger if exists trg_validar_asignacion on public.coach_clientes;
create trigger trg_validar_asignacion
  before insert or update on public.coach_clientes
  for each row execute function public.validar_asignacion();

-- Las asignaciones también se filtran por organización
drop policy if exists "asignaciones: ver las mías" on public.coach_clientes;
create policy "asignaciones: ver las mías" on public.coach_clientes
  for select using (
       coach_id = auth.uid()
    or cliente_id = auth.uid()
    or public.es_super_admin()
    or (public.es_org_admin() and public.misma_org(cliente_id))
  );

drop policy if exists "asignaciones: solo super admin asigna" on public.coach_clientes;
create policy "asignaciones: asignar" on public.coach_clientes
  for insert with check (
    public.es_super_admin() or (public.es_org_admin() and public.misma_org(cliente_id))
  );


-- ---------------------------------------------------------------------
-- 9. Perfiles: sumar el aislamiento por organización
-- ---------------------------------------------------------------------
drop policy if exists "perfiles: ver" on public.profiles;
create policy "perfiles: ver" on public.profiles
  for select using (
    public.es_super_admin() or (org_id = public.mi_org() and public.puede_ver(id))
  );

-- Todo usuario nuevo cae en la organización por defecto salvo que se
-- indique otra. Igual que el rol: no se acepta lo que mande el cliente.
create or replace function public.org_inicial()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if new.org_id is null then
    new.org_id := coalesce(
      public.mi_org(),
      (select id from public.organizations where slug = 'principal')
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_org_inicial on public.profiles;
create trigger trg_org_inicial before insert on public.profiles
  for each row execute function public.org_inicial();


-- ---------------------------------------------------------------------
-- 10. Fotos: la ruta ya empieza por user_id, así que basta con que
--     `puede_ver` (que ya considera organización) siga mandando.
--     Sin cambios en Storage.
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- 11. Feature flags por organización
--     Un flag global sigue funcionando igual; si existe una fila para
--     la organización, esa gana. Así se puede encender el chat para un
--     gimnasio y no para otro.
-- ---------------------------------------------------------------------
create table if not exists public.org_feature_flags (
  org_id uuid not null references public.organizations(id) on delete cascade,
  clave  text not null references public.feature_flags(clave) on delete cascade,
  activo boolean not null,
  actualizado_en timestamptz not null default now(),
  primary key (org_id, clave)
);

alter table public.org_feature_flags enable row level security;
drop policy if exists "flags org: leer" on public.org_feature_flags;
create policy "flags org: leer" on public.org_feature_flags
  for select using ( public.es_super_admin() or org_id = public.mi_org() );
drop policy if exists "flags org: escribir" on public.org_feature_flags;
create policy "flags org: escribir" on public.org_feature_flags
  for all using ( public.es_super_admin() or (public.es_org_admin() and org_id = public.mi_org()) )
          with check ( public.es_super_admin() or (public.es_org_admin() and org_id = public.mi_org()) );

-- Misma firma que en 0003: la app sigue llamando flag('clave') y no se entera
create or replace function public.flag(p_clave text)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce(
    (select activo from public.org_feature_flags where org_id = public.mi_org() and clave = p_clave),
    (select activo from public.feature_flags where clave = p_clave),
    false
  )
$$;


-- ---------------------------------------------------------------------
-- 12. Estadísticas acotadas a la organización
--     El super admin sigue viendo todo; un org_admin solo lo suyo.
-- ---------------------------------------------------------------------
create or replace function public.org_estadisticas()
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_org uuid; v_dias int; v jsonb;
begin
  if not (public.es_super_admin() or public.es_org_admin()) then
    raise exception 'No autorizado';
  end if;
  v_org := public.mi_org();
  select coalesce((valor)::text::int, 14) into v_dias
    from public.system_settings where clave = 'dias_inactividad';

  select jsonb_build_object(
    'organizacion',  (select nombre from public.organizations where id = v_org),
    'entrenadores',  (select count(*) from public.profiles where org_id = v_org and role='coach'),
    'clientes',      (select count(*) from public.profiles where org_id = v_org and role='cliente'),
    'clientes_activos', (
      select count(distinct p.id) from public.profiles p
       where p.org_id = v_org and p.role='cliente'
         and exists (select 1 from public.diary_entries d
                      where d.user_id = p.id and d.entry_date > current_date - v_dias)),
    'storage_bytes', (select coalesce(sum(bytes),0) from public.progress_photos where org_id = v_org),
    'generado_en', now()
  ) into v;
  return v;
end $$;
grant execute on function public.org_estadisticas() to authenticated;


-- ---------------------------------------------------------------------
-- 13. Comprobaciones
-- ---------------------------------------------------------------------
-- select public.mi_org();                                  -- tu organización
-- select count(*) from public.diary_entries;               -- nunca cruza organizaciones
-- insert into public.coach_clientes(coach_id, cliente_id)  -- debe FALLAR si son de orgs distintas
--   values ('<coach-org-A>', '<cliente-org-B>');
-- explain analyze select * from public.diary_entries where entry_date > current_date - 7;
--   -- debe usar idx_diary_entries_org_user, no un Seq Scan
