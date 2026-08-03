-- ---------------------------------------------------------------------
--  La IA deja de ser un interruptor y pasa a tener tres niveles
--
--  Hasta ahora `ia_habilitada` era si o no. Con eso no se puede vender la
--  diferencia entre "te reconozco un plato por foto" y "te llevo la semana
--  como un entrenador": o se da todo o no se da nada.
--
--    apagada  Sin IA. La app sigue entera: apuntar a mano, rutinas, peso,
--             fotos. Solo no hay asistente.
--    normal   El chat y la foto del platillo. Lo que resuelve el dia a dia.
--    plus     Todo lo anterior mas lo que necesita seguimiento: eventos que
--             reparten la semana, chequeo semanal y ajuste de calorias.
--             Esto es lo que cuesta tokens de verdad y lo que se parece a
--             tener un coach.
--
--  Se guarda el nivel y no dos booleanos. Dos booleanos permiten estados
--  que no existen -"plus si, normal no"- y tarde o temprano alguien los
--  crea sin querer.
--
--  `ia_habilitada` se queda por ahora y se mantiene en sintonia con un
--  trigger: la Edge Function desplegada todavia la lee, y apagarla de golpe
--  dejaria sin asistente a todo el mundo hasta el siguiente despliegue.
--  Migrar y romper a la vez es como se pierden usuarios un martes.
-- ---------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'nivel_ia') then
    -- El orden importa: `order by nivel` los saca de menos a mas, y hay
    -- comparaciones que se leen mucho mejor asi.
    create type public.nivel_ia as enum ('apagada', 'normal', 'plus');
  end if;
end $$;

alter table public.profiles
  add column if not exists nivel_ia public.nivel_ia not null default 'normal';

-- Quien tenia la IA apagada se queda apagado. El resto entra en 'normal':
-- subir a alguien a 'plus' es una decision, no un efecto secundario de una
-- migracion.
update public.profiles
   set nivel_ia = case when ia_habilitada then 'normal' else 'apagada' end::public.nivel_ia
 where nivel_ia = 'normal' and not ia_habilitada;

comment on column public.profiles.nivel_ia is
  'apagada | normal (chat y foto) | plus (ademas eventos, chequeo y ajuste semanal).';


-- ---------------------------------------------------------------------
--  Que los dos no se contradigan
--
--  Mientras convivan, `ia_habilitada` tiene que ser exactamente "el nivel
--  no es apagada". Se hace con un trigger y no a mano en cada UPDATE porque
--  la app no es la unica puerta: se puede escribir por PostgREST directo.
-- ---------------------------------------------------------------------
create or replace function public.sincronizar_ia_habilitada()
returns trigger language plpgsql as $$
begin
  new.ia_habilitada := (new.nivel_ia <> 'apagada');
  return new;
end $$;

drop trigger if exists profiles_sincronizar_ia on public.profiles;
create trigger profiles_sincronizar_ia
  before insert or update of nivel_ia on public.profiles
  for each row execute function public.sincronizar_ia_habilitada();

-- Y se cuadra lo que ya estaba escrito antes del trigger.
update public.profiles
   set ia_habilitada = (nivel_ia <> 'apagada')
 where ia_habilitada <> (nivel_ia <> 'apagada');


-- ---------------------------------------------------------------------
--  El super admin lo cambia
--
--  Funcion propia y no un UPDATE suelto: cambiarle el nivel a otra persona
--  es un poder, y los poderes se ejercen por una puerta que comprueba quien
--  llama. Las politicas de `profiles` no dejan editar filas ajenas, asi que
--  sin esto el panel no podria hacerlo aunque quisiera.
-- ---------------------------------------------------------------------
create or replace function public.admin_nivel_ia(p_usuario uuid, p_nivel public.nivel_ia)
returns public.nivel_ia
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_nivel public.nivel_ia;
begin
  if not public.es_super_admin() then
    raise exception 'Solo el super admin puede cambiar el nivel de IA';
  end if;

  update public.profiles set nivel_ia = p_nivel
   where id = p_usuario
   returning nivel_ia into v_nivel;

  -- Un UPDATE que no encaja con ninguna fila NO da error: sale bien sin
  -- tocar nada. Sin esto, el panel diria "hecho" ante un id inventado.
  if v_nivel is null then
    raise exception 'No existe esa persona';
  end if;
  return v_nivel;
end $$;

revoke execute on function public.admin_nivel_ia(uuid, public.nivel_ia) from public;
grant  execute on function public.admin_nivel_ia(uuid, public.nivel_ia) to authenticated;


-- La lista de usuarios tiene que traerlo o el panel no sabe que pintar.
--
-- Se suelta antes: `create or replace` no puede cambiar el tipo que
-- devuelve una funcion, y aqui se le anade una columna.
drop function if exists public.admin_buscar_usuarios(text, int);

create or replace function public.admin_buscar_usuarios(p_texto text default '', p_limite int default 50)
returns table (
  id uuid, nombre text, correo text, rol public.app_role, activo boolean,
  coach text, ultima_actividad date, creado_en timestamptz,
  ia_habilitada boolean, estado public.estado_cliente, nivel_ia public.nivel_ia
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if not public.es_super_admin() then
    raise exception 'Solo el super admin puede buscar usuarios';
  end if;

  return query
  select p.id,
         p.full_name::text,
         u.email::text,          -- varchar(255) en auth.users: hay que castear
         p.role,
         p.activo,
         c.full_name::text as coach,
         greatest(
           (select max(d.entry_date)   from public.diary_entries    d where d.user_id = p.id),
           (select max(w.session_date) from public.workout_sessions w where w.user_id = p.id)
         ) as ultima_actividad,
         p.created_at,
         p.ia_habilitada,
         p.estado,
         p.nivel_ia
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.coach_clientes cc on cc.cliente_id = p.id and cc.activo
    left join public.profiles c on c.id = cc.coach_id
   where p_texto = ''
      or p.full_name ilike '%' || p_texto || '%'
      or u.email    ilike '%' || p_texto || '%'
   order by p.created_at desc
   limit p_limite;
end $$;

revoke execute on function public.admin_buscar_usuarios(text, int) from public;
grant  execute on function public.admin_buscar_usuarios(text, int) to authenticated;
