-- ---------------------------------------------------------------------
--  LA APP SABE CUÁNDO CUMPLES, Y TE DICE ALGO
--
--  La app guardaba `age`, un número suelto que se tecleó una vez. Con eso
--  se calcula la fórmula y no se puede hacer nada más: no se sabe qué día
--  es, no se sabe cuándo llega, y además envejece mal —quien se registró
--  con 40 sigue teniendo 40 tres años después—.
--
--  Aquí se guarda la FECHA. Solo para felicitar: el cálculo sigue usando
--  `age` exactamente igual que hasta ahora, porque cambiar de dónde sale
--  la edad movería las calorías de todo el mundo, y eso no es un regalo
--  de cumpleaños. Esa deuda queda apuntada aparte.
--
--  Es opcional, y de verdad: quien no la ponga no recibe nada y no se le
--  vuelve a preguntar. Un dato que solo sirve para una cosa bonita no se
--  cobra a la fuerza.
-- ---------------------------------------------------------------------

alter table public.profiles
  add column if not exists nacimiento date;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_nacimiento_sensata'
  ) then
    -- Sin `current_date`: un CHECK no admite nada que cambie con el
    -- tiempo, y una fila válida hoy no puede dejar de serlo mañana sola.
    -- El límite de arriba lo pone la app, que sí sabe qué día es.
    alter table public.profiles
      add constraint profiles_nacimiento_sensata
      check (nacimiento is null or nacimiento > date '1900-01-01');
  end if;
end;
$$;

comment on column public.profiles.nacimiento is
  'Fecha de nacimiento, opcional. SOLO para felicitar: la fórmula sigue '
  'usando age. Si está en nulo, no se felicita y no se vuelve a preguntar.';


-- ---------------------------------------------------------------------
--  Y LO QUE SE LE DIJO CADA AÑO
--
--  Dos razones para guardarlo, y las dos importan:
--
--  1. UNA POR AÑO. El mensaje lo escribe el modelo, y abrir la app cuatro
--     veces el día de tu cumpleaños no puede costar cuatro felicitaciones
--     distintas —ni cuatro llamadas—. El `unique (user_id, anio)` es el
--     freno, en la base y no en el navegador.
--
--  2. PARA QUE NO SE REPITA. Al escribir la del año que viene se le pasan
--     las de los años anteriores con el encargo de no parecerse. Sin
--     guardarlas, el modelo escribiría la misma felicitación genérica
--     cada año y dejaría de ser una sorpresa al segundo.
-- ---------------------------------------------------------------------

create table if not exists public.felicitaciones (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users(id) on delete cascade,
  anio      integer not null check (anio between 2020 and 2200),
  mensaje   text not null check (length(mensaje) between 1 and 1200),
  creado_en timestamptz not null default now(),

  unique (user_id, anio)
);

create index if not exists idx_felicitaciones_mias
  on public.felicitaciones (user_id, anio desc);

alter table public.felicitaciones enable row level security;

-- Cada quien ve las suyas, y las de antes también: son un recuerdo.
drop policy if exists "felicitaciones: ver" on public.felicitaciones;
create policy "felicitaciones: ver" on public.felicitaciones
  for select using (public.puede_ver(user_id));

-- El grant, que no es la política: sin él `authenticated` ni llega a que
-- se evalúe RLS. Solo `select`.
grant select on public.felicitaciones to authenticated;

-- NADIE LAS ESCRIBE DESDE EL NAVEGADOR. Las escribe la función del
-- asistente con la clave de servicio, que se salta RLS. Sin política de
-- insert, un cliente no puede meterse una felicitación a mano — y el
-- `unique` de arriba no serviría de nada si pudiera.

comment on table public.felicitaciones is
  'Una por persona y año. Guardadas para que no se repitan: al escribir la '
  'del año que viene se le pasan las anteriores con el encargo de no '
  'parecerse a ninguna.';


-- ---------------------------------------------------------------------
--  COMPROBAR
--
--    -- Ponte la tuya (la app también lo hace desde Perfil):
--    update public.profiles set nacimiento = date '1990-11-05'
--     where id = auth.uid();
--
--    select id, nacimiento from public.profiles where nacimiento is not null;
--
--    -- Y que no quepan dos del mismo año:
--    insert into public.felicitaciones (user_id, anio, mensaje)
--    values (auth.uid(), 2026, 'una'), (auth.uid(), 2026, 'otra');
--    -- ...tiene que fallar por el unique.
-- ---------------------------------------------------------------------
