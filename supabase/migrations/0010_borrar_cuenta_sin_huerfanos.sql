-- =====================================================================
--  BORRAR UNA CUENTA NO DEBE DEJAR FILAS HUÉRFANAS
--
--  Fallo encontrado probando el borrado de una cuenta de prueba desde el
--  panel de Supabase:
--
--    antes  → auth.users: 1 · profiles: 1 · diary_entries: 1
--    borrar → auth.users: 0 · profiles: 1 · diary_entries: 0
--
--  El perfil sobrevive. Y no da error, que es lo peor: parece que salió
--  bien.
--
--  POR QUÉ. Las tablas cuelgan de auth.users con ON DELETE CASCADE, así
--  que borrar la cuenta manda un DELETE a cada una. Pero la 0007 les puso
--  un trigger que convierte los DELETE en archivado y CANCELA el borrado.
--  El resultado es una fila que apunta a un usuario que ya no existe.
--
--  `diary_entries` sí se borró porque no es archivable; las siete que sí
--  lo son (profiles, recipes, saved_foods, routine_days,
--  routine_exercises, exercise_sets, progress_photos) quedan huérfanas.
--
--  POR QUÉ IMPORTA. `admin_buscar_usuarios()` hace INNER JOIN contra
--  auth.users, así que esos perfiles no salen en la lista y parecen
--  borrados. Pero `admin_estadisticas()` cuenta directo sobre profiles:
--  las cuentas de prueba borradas seguirían inflando el tablero para
--  siempre, sin que nadie entienda de dónde salen.
--
--  LA SOLUCIÓN. Si el dueño de la fila ya no existe en auth.users, esto
--  no es alguien borrando algo suyo: es la cascada de una cuenta
--  eliminada. Ahí el borrado tiene que pasar.
--
--  Depende de 0009.
-- =====================================================================

create or replace function public.archivar_en_vez_de_borrar()
returns trigger
language plpgsql security definer set search_path = public, pg_temp, auth
as $$
declare
  v_dueno uuid;
begin
  -- Borrado real autorizado (borrar_usuario_definitivo): dejar pasar
  if coalesce(current_setting('app.borrado_definitivo', true), 'off') = 'on' then
    return old;
  end if;

  -- ¿De quién es esta fila? En `profiles` el dueño es la propia clave `id`;
  -- en las demás es `user_id`. Se lee del jsonb para que la misma función
  -- valga para las siete tablas, igual que hace el trigger de auditoría.
  v_dueno := coalesce(
    nullif(to_jsonb(old) ->> 'user_id', '')::uuid,
    nullif(to_jsonb(old) ->> 'id', '')::uuid
  );

  -- La cuenta ya no existe: esto es la cascada de un borrado de cuenta y
  -- cancelarlo dejaría basura apuntando a la nada.
  if v_dueno is not null
     and not exists (select 1 from auth.users u where u.id = v_dueno) then
    return old;
  end if;

  -- Ya estaba archivado: ni rehacer la marca ni volver a auditarlo
  if old.archivado_en is not null then
    return null;
  end if;

  execute format(
    'update public.%I set archivado_en = now(), archivado_por = auth.uid() where id = $1',
    tg_table_name
  ) using old.id;

  return null;   -- cancela el DELETE
end $$;


-- ---------------------------------------------------------------------
--  Limpiar lo que ya quedó huérfano
--
--  Si se borró alguna cuenta de prueba antes de este arreglo, su perfil
--  sigue ahí contando en el tablero. Esto lo barre de una vez.
--
--  Es un borrado de verdad, y es el correcto: son filas de usuarios que
--  ya no existen, no hay a quién devolvérselas.
-- ---------------------------------------------------------------------
do $$
declare
  t text;
  archivables text[] := array[
    'profiles', 'recipes', 'saved_foods',
    'routine_days', 'routine_exercises', 'exercise_sets',
    'progress_photos'
  ];
  v_col text;
  v_borradas int;
begin
  perform set_config('app.borrado_definitivo', 'on', true);

  foreach t in array archivables loop
    if to_regclass('public.' || t) is null then continue; end if;
    v_col := case when t = 'profiles' then 'id' else 'user_id' end;

    execute format(
      'delete from public.%I d
        where not exists (select 1 from auth.users u where u.id = d.%I)', t, v_col);

    get diagnostics v_borradas = row_count;
    if v_borradas > 0 then
      raise notice 'Huérfanas eliminadas en %: %', t, v_borradas;
    end if;
  end loop;

  perform set_config('app.borrado_definitivo', 'off', true);
end $$;


-- ---------------------------------------------------------------------
--  Comprobaciones
-- ---------------------------------------------------------------------
-- No debe quedar ningún perfil sin cuenta (debe dar 0):
--   select count(*) from public.profiles p
--    where not exists (select 1 from auth.users u where u.id = p.id);
--
-- Y borrar una cuenta desde el panel debe llevarse todo lo suyo:
--   -- borrar el usuario en Authentication > Users, y después:
--   select count(*) from public.profiles;   -- una menos
