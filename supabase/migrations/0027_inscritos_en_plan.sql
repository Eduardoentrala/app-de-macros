-- ---------------------------------------------------------------------
--  Plan deja de ser "todo el mundo"
--
--  Hasta ahora Plan listaba a TODAS las personas registradas: al super
--  admin le salian los seis usuarios y al coach todos sus asignados. Pero
--  no todo el mundo lleva plan de comidas. La lista crecia con cada alta y
--  se llenaba de gente a la que nadie iba a armarle nada, con lo cual
--  encontrar a quien si lo lleva costaba mas cada semana.
--
--  Ahora hay que inscribir a alguien. Es una decision, no una consecuencia
--  de haberse registrado.
--
--  POR CORREO Y NO POR UNA LISTA DESPLEGABLE
--
--  Un desplegable con todos los usuarios es la misma lista larga en otro
--  sitio. Escribir el correo obliga a saber a quien se esta inscribiendo,
--  y el correo es lo unico que distingue de verdad a dos personas que se
--  llamen igual.
--
--  SE DA DE BAJA, NO SE BORRA
--
--  Si alguien deja el plan y vuelve en marzo, interesa saber que ya estuvo.
--  `baja_en` guarda esa historia; el indice unico parcial permite volver a
--  inscribirle sin chocar con la fila vieja.
-- ---------------------------------------------------------------------

create table if not exists public.plan_inscritos (
  id           bigint generated always as identity primary key,
  cliente_id   uuid not null references auth.users(id) on delete cascade,
  inscrito_por uuid references auth.users(id) on delete set null,
  inscrito_en  timestamptz not null default now(),
  baja_en      timestamptz
);

-- Uno solo activo por persona. Parcial, para que las bajas antiguas no
-- impidan volver a inscribir a quien regresa.
create unique index if not exists plan_inscritos_uno_activo
  on public.plan_inscritos (cliente_id) where baja_en is null;

create index if not exists plan_inscritos_quien
  on public.plan_inscritos (inscrito_por) where baja_en is null;


-- ---------------------------------------------------------------------
--  Quien ve y quien toca
--
--  Se apoya en `puede_ver`, que ya sabe que un coach ve a los suyos y el
--  super admin a todos. Repetir esa logica aqui garantizaria que un dia se
--  corrija en un sitio y no en el otro.
-- ---------------------------------------------------------------------
alter table public.plan_inscritos enable row level security;

drop policy if exists "plan_inscritos: ver" on public.plan_inscritos;
create policy "plan_inscritos: ver" on public.plan_inscritos
  for select using (public.puede_ver(cliente_id));

-- Escribir va por las funciones de abajo, no directo: inscribir requiere
-- buscar por correo en auth.users, que la app no puede leer.
revoke all on public.plan_inscritos from anon, authenticated;
grant select on public.plan_inscritos to authenticated;


-- ---------------------------------------------------------------------
--  Inscribir por correo
-- ---------------------------------------------------------------------
create or replace function public.plan_inscribir(p_correo text)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_id  uuid;
  v_rol public.app_role;
begin
  if not (public.es_super_admin() or public.mi_rol() in ('coach', 'org_admin')) then
    raise exception 'No puedes inscribir a nadie en Plan';
  end if;

  select u.id, p.role into v_id, v_rol
    from auth.users u
    join public.profiles p on p.id = u.id
   where lower(u.email) = lower(btrim(p_correo));

  if v_id is null then
    raise exception 'No hay ninguna cuenta con ese correo';
  end if;

  -- Un coach solo inscribe a los suyos. Sin esto podria meter en su Plan a
  -- cualquiera con solo saberle el correo.
  if not public.es_super_admin() and not public.puede_ver(v_id) then
    raise exception 'Esa persona no es cliente tuyo';
  end if;

  insert into public.plan_inscritos (cliente_id, inscrito_por)
  values (v_id, auth.uid())
  on conflict (cliente_id) where baja_en is null do nothing;

  return v_id;
end $$;

revoke execute on function public.plan_inscribir(text) from public, anon;
grant  execute on function public.plan_inscribir(text) to authenticated;


-- ---------------------------------------------------------------------
--  Dar de baja
-- ---------------------------------------------------------------------
create or replace function public.plan_dar_baja(p_cliente uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.puede_ver(p_cliente) then
    raise exception 'No puedes tocar el plan de esa persona';
  end if;
  update public.plan_inscritos
     set baja_en = now()
   where cliente_id = p_cliente and baja_en is null;
end $$;

revoke execute on function public.plan_dar_baja(uuid) from public, anon;
grant  execute on function public.plan_dar_baja(uuid) to authenticated;


-- ---------------------------------------------------------------------
--  La lista de Plan
--
--  Una sola funcion para los dos roles. `puede_ver` ya filtra: el super
--  admin recibe a todos los inscritos y el coach solo a los suyos, sin que
--  la app tenga que pedir cosas distintas segun quien mire.
--
--  Devuelve el correo, que es lo que un coach nunca habia podido ver: la
--  vista `mis_clientes` no lo trae porque vive en auth.users. Y va casteado
--  a text a proposito: `auth.users.email` es varchar(255), y una funcion
--  que declare `correo text` y devuelva la columna a pelo revienta AL
--  EJECUTARSE, no al crearse. Ya paso una vez y tumbo esta misma pantalla.
-- ---------------------------------------------------------------------
create or replace function public.plan_lista()
returns table (
  id uuid, nombre text, correo text, inscrito_en timestamptz, tiene_plan boolean
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  -- Esta lista es de quien entrena. Un cliente se veria a si mismo -no es
  -- una fuga, son sus datos- pero su plan lo lee por otro sitio, y una
  -- lista de una persona en la pantalla de coach solo confunde.
  --
  -- Devuelve vacio en vez de reventar: la app la pide en la misma carga
  -- para todos los roles, y una excepcion aqui llenaria de errores rojos
  -- la pantalla de gente que no ha hecho nada mal.
  if not (public.es_super_admin() or public.mi_rol() in ('coach', 'org_admin')) then
    return;
  end if;

  return query
  select p.id,
         p.full_name::text,
         u.email::text,
         i.inscrito_en,
         exists (select 1 from public.planes pl
                  where pl.user_id = p.id and pl.activo) as tiene_plan
    from public.plan_inscritos i
    join public.profiles p on p.id = i.cliente_id
    join auth.users u on u.id = p.id
   where i.baja_en is null
     and public.puede_ver(i.cliente_id)
   order by p.full_name;
end $$;

revoke execute on function public.plan_lista() from public, anon;
grant  execute on function public.plan_lista() to authenticated;
