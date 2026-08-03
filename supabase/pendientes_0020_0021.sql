-- ---------------------------------------------------------------------
--  PEGAR ESTO EN EL EDITOR SQL DE SUPABASE
--
--  Son las migraciones 0020 y 0021 juntas. Se pueden volver a ejecutar sin
--  romper nada: todo va con "if not exists" o "create or replace".
--
--  0021 arregla el fallo que dejaba el panel en "Cargando usuarios..." y la
--  pestaña Plan con "structure of query does not match function result
--  type". Las dos comen de la misma funcion.
-- ---------------------------------------------------------------------
-- ---------------------------------------------------------------------
--  CONDICIONES DE SALUD
--
--  Para qué: una persona con diabetes, hipertensión o embarazo no debería
--  recibir las mismas calorías que calcula la fórmula a secas. Guardarlo
--  permite ajustar el objetivo y, sobre todo, avisar de lo que la app NO
--  puede decidir por nadie.
--
--  DÓNDE ESTÁ EL LÍMITE. Esto no convierte la app en consejo médico y no
--  debe presentarse así. La fórmula (Mifflin-St Jeor) sigue mandando y el
--  suelo de seguridad -nunca por debajo del metabolismo basal ni de 1200
--  calorías- se aplica igual, tenga la condición que tenga. Lo que la
--  condición cambia es el margen del ajuste y el aviso que se enseña.
--
--  Por qué una lista cerrada y no texto libre: sobre una lista se puede
--  razonar (ajustar, avisar, medir cuánta gente hay de cada tipo). Sobre
--  texto libre no. El texto libre existe aparte, para lo que no encaje, y
--  NO se usa para calcular nada.
--
--  Privacidad: esto es dato de salud. Lo protegen las mismas políticas RLS
--  de `profiles` que ya existen -cada quien ve lo suyo, el entrenador ve a
--  los suyos-. No se añade ninguna vista nueva que lo exponga.
-- ---------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'condicion_salud') then
    create type public.condicion_salud as enum (
      'diabetes_1',
      'diabetes_2',
      'prediabetes',
      'hipertension',
      'colesterol_alto',
      'hipotiroidismo',
      'higado_graso',
      'enfermedad_renal',
      'celiaquia',
      'embarazo',
      'lactancia'
    );
  end if;
end $$;

alter table public.profiles
  add column if not exists condiciones public.condicion_salud[] not null default '{}',
  -- Para lo que no está en la lista. Se enseña a quien corresponda, pero
  -- no entra en ningún cálculo: no hay forma honesta de razonar sobre
  -- texto libre sin inventarse lo que dice.
  add column if not exists nota_salud text
    check (nota_salud is null or length(nota_salud) <= 300);

-- Sin duplicados en el array: 'diabetes_2' dos veces no significa nada y
-- complicaría cualquier cuenta que se haga después.
--
-- Va en una función y no directo en el CHECK porque PostgreSQL no admite
-- subconsultas dentro de una restricción. Marcarla `immutable` es correcto
-- y necesario: solo depende de lo que se le pasa.
create or replace function public.sin_condiciones_repetidas(a public.condicion_salud[])
returns boolean
language sql immutable
as $$
  select a is null
      or cardinality(a) = cardinality(array(select distinct unnest(a)))
$$;

alter table public.profiles
  drop constraint if exists profiles_condiciones_sin_repetir;
alter table public.profiles
  add constraint profiles_condiciones_sin_repetir
  check (public.sin_condiciones_repetidas(condiciones));

-- Los dos tipos de diabetes a la vez no existen: es uno u otro. Se rechaza
-- en la base y no solo en la pantalla, porque la pantalla no es la única
-- puerta -la app habla por PostgREST y cualquiera puede llamar directo-.
alter table public.profiles
  drop constraint if exists profiles_una_sola_diabetes;
alter table public.profiles
  add constraint profiles_una_sola_diabetes
  check (not ('diabetes_1' = any(condiciones) and 'diabetes_2' = any(condiciones)));

comment on column public.profiles.condiciones is
  'Condiciones declaradas por la persona. Ajustan el margen del calculo y el aviso; NO sustituyen criterio medico.';
comment on column public.profiles.nota_salud is
  'Texto libre de salud. Se enseña, no se calcula con el.';

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
