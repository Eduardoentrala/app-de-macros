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
