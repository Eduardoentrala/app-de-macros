-- ---------------------------------------------------------------------
--  ARREGLO: admin_buscar_usuarios reventaba
--
--  Sintoma: el panel de super admin se quedaba en "Cargando usuarios..."
--  para siempre, y la pestana Plan mostraba
--      "structure of query does not match function result type".
--  Las dos pantallas comen de esta misma funcion, por eso fallaban juntas.
--
--  Causa: la funcion declara `returns table (... correo text ...)` pero
--  devuelve `u.email`, y en Supabase `auth.users.email` es
--  `character varying(255)`, no `text`. PostgreSQL no lo convierte solo en
--  el tipo de retorno de una funcion: compara los tipos exactos y aborta.
--
--  El error solo aparece AL EJECUTARLA, no al crearla, asi que la 0017 se
--  aplico sin quejarse y el fallo salio meses despues, en produccion.
--
--  Arreglo: castear a text lo que la firma dice que es text. Se castean
--  tambien los otros dos campos de texto que salen de columnas ajenas
--  (`full_name`), por si alguna vez cambian de tipo: cuesta nada y cierra
--  la misma clase de fallo.
-- ---------------------------------------------------------------------

create or replace function public.admin_buscar_usuarios(p_texto text default '', p_limite int default 50)
returns table (
  id uuid, nombre text, correo text, rol public.app_role, activo boolean,
  coach text, ultima_actividad date, creado_en timestamptz,
  ia_habilitada boolean, estado public.estado_cliente
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
         p.estado
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


-- ---------------------------------------------------------------------
--  Cuanto se ha gastado hoy en el asistente
--
--  El tope diario impide que se dispare, pero no avisa de nada. Esto
--  devuelve el gasto de hoy para poder verlo en el panel sin entrar a
--  Anthropic.
--
--  Cuenta consultas, no dinero: el precio depende del modelo y cambia, y
--  guardar un precio en la base seria mentira en cuanto se toque. El coste
--  aproximado lo pone la app, que es donde ya vive el modelo.
-- ---------------------------------------------------------------------
create or replace function public.admin_uso_ia_hoy()
returns table (consultas int, personas int, tope_por_persona int)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if not public.es_super_admin() then
    raise exception 'Solo el super admin puede ver el uso';
  end if;

  return query
  select coalesce(sum(iu.consultas), 0)::int,
         count(*)::int,
         -- El tope real vive en la Edge Function; aqui va como referencia
         -- para que el panel pueda decir "3 de 5" sin inventarselo.
         5::int
    from public.ia_uso iu
   where iu.dia = current_date;
end $$;

revoke execute on function public.admin_uso_ia_hoy() from public;
grant  execute on function public.admin_uso_ia_hoy() to authenticated;
