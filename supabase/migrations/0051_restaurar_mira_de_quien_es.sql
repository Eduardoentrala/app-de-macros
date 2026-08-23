-- ---------------------------------------------------------------------
--  `restaurar()` no miraba de quien era la fila
--
--  En esta base un DELETE no borra: un trigger archiva la fila (0007) para
--  que haya una papelera. `restaurar(tabla, id)` es lo que la saca de ahi, y
--  esta concedida a `authenticated`, o sea a cualquiera con sesion.
--
--  La inyeccion por el nombre de la tabla SI estaba tapada -lista blanca y
--  `%I`- y eso engaña, porque parece una funcion pensada. Lo que no habia era
--  comprobacion de DUEÑO: con el id de una fila ajena, cualquiera con sesion
--  la devolvia a la vida.
--
--  Y `profiles` esta en la lista blanca. Archivar un perfil es como se da de
--  baja una cuenta, asi que restaurarlo es REACTIVAR UNA CUENTA DADA DE BAJA.
--  Los ids de perfil no son ningun secreto: son los de usuario, un entrenador
--  ve los de su gente y `plan_buscar` los devuelve.
--
--  Se comprobo: Ana, una clienta cualquiera, reactivaba la cuenta de Beto que
--  el super admin acababa de dar de baja.
--
--  QUE REGLA SE APLICA. No una nueva: la MISMA que ya tiene cada tabla para
--  escribir, porque restaurar es escribir. Inventarse aqui otra distinta seria
--  una segunda regla que se desvia de la primera sin que nadie lo note.
--
--    - `profiles`         -> solo el super admin. Dar de baja lo decide el, y
--                            si el interesado pudiera deshacerlo no seria una
--                            baja.
--    - lo de entreno      -> `puede_editar_entreno`, que incluye a su coach.
--    - lo demas (personal) -> `puede_editar_propio`.
--
--  Nadie la llama todavia desde la app. Da igual: esta concedida, y una
--  funcion concedida es alcanzable escriba lo que escriba la app.
-- ---------------------------------------------------------------------

create or replace function public.restaurar(p_tabla text, p_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_permitidas text[] := array[
    'profiles','recipes','saved_foods',
    'routine_days','routine_exercises','exercise_sets','progress_photos'];
  -- Las que un entrenador tambien puede escribir, para armar rutinas.
  v_entreno text[] := array['routine_days','routine_exercises','exercise_sets'];
  v_dueno uuid;
begin
  -- Lista blanca: p_tabla llega desde fuera y se interpola en SQL.
  -- Sin esta comprobacion seria una inyeccion de manual.
  if not (p_tabla = any(v_permitidas)) then
    raise exception 'Tabla no restaurable: %', p_tabla;
  end if;

  -- DE QUIEN ES LA FILA. En `profiles` el dueño es la fila misma.
  if p_tabla = 'profiles' then
    select id into v_dueno from public.profiles where id = p_id;
  else
    execute format('select user_id from public.%I where id = $1', p_tabla)
      into v_dueno using p_id;
  end if;

  -- Sin fila no hay nada que restaurar, y callarlo deja creer que si lo hubo.
  if v_dueno is null then
    raise exception 'No hay nada que restaurar con ese id';
  end if;

  if p_tabla = 'profiles' then
    if not public.es_super_admin() then
      raise exception 'Solo el super admin reactiva una cuenta';
    end if;
  elsif p_tabla = any(v_entreno) then
    if not public.puede_editar_entreno(v_dueno) then
      raise exception 'No puedes restaurar lo que no es tuyo';
    end if;
  else
    if not public.puede_editar_propio(v_dueno) then
      raise exception 'No puedes restaurar lo que no es tuyo';
    end if;
  end if;

  execute format('update public.%I set archivado_en = null, archivado_por = null
                   where id = $1', p_tabla) using p_id;
end $$;

revoke execute on function public.restaurar(text, uuid) from public, anon;
grant  execute on function public.restaurar(text, uuid) to authenticated;
