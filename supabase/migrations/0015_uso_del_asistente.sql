-- =====================================================================
--  CUÁNTO USA CADA QUIEN EL ASISTENTE
--
--  Cada consulta al asistente cuesta dinero de verdad, y se paga con una
--  sola clave: la del dueño de la app. Sin un tope, a un solo usuario
--  -o a alguien que consiga un token válido- le basta un bucle para
--  vaciar la cuenta en una noche.
--
--  Esta tabla lleva la cuenta por persona y día. Quien la escribe es la
--  Edge Function con la clave de servicio; desde la API nadie puede
--  tocarla, solo leer lo suyo para ver cuánto le queda.
--
--  Depende de 0014.
-- =====================================================================

create table if not exists public.ia_uso (
  user_id    uuid not null references auth.users(id) on delete cascade,
  dia        date not null default current_date,
  consultas  integer not null default 0,
  ultima_en  timestamptz not null default now(),
  primary key (user_id, dia)
);

-- Para barrer los días viejos sin recorrer la tabla entera
create index if not exists idx_ia_uso_dia on public.ia_uso(dia);


-- ---------------------------------------------------------------------
--  El tope
--
--  Sube uno y dice si se pasó. Va en SECURITY DEFINER porque la llama la
--  Edge Function, y así el tope no depende de que quien llame tenga
--  permisos de escritura sobre la tabla.
--
--  Devuelve las consultas que quedan; si ya no quedan, devuelve -1 y NO
--  suma. Así la función no puede "gastar" una consulta al rechazarla.
-- ---------------------------------------------------------------------
create or replace function public.gastar_consulta_ia(
  usuario uuid,
  tope    integer default 40
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  usadas integer;
begin
  select consultas into usadas
    from public.ia_uso
   where user_id = usuario and dia = current_date
   for update;

  if usadas is null then
    insert into public.ia_uso(user_id, dia, consultas)
    values (usuario, current_date, 1);
    return tope - 1;
  end if;

  if usadas >= tope then
    return -1;                       -- se acabó por hoy; no se suma nada
  end if;

  update public.ia_uso
     set consultas = consultas + 1, ultima_en = now()
   where user_id = usuario and dia = current_date;

  return tope - usadas - 1;
end;
$$;

revoke all on function public.gastar_consulta_ia(uuid, integer) from public, anon, authenticated;


-- ---------------------------------------------------------------------
--  Limpieza: el historial de uso no sirve de nada pasado un mes
-- ---------------------------------------------------------------------
create or replace function public.limpiar_uso_ia()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare borradas integer;
begin
  delete from public.ia_uso where dia < current_date - 30;
  get diagnostics borradas = row_count;
  return borradas;
end;
$$;


-- ---------------------------------------------------------------------
--  Quién ve qué
--
--  Cada quien ve solo su propio consumo, para poder enseñarle "te quedan
--  N consultas hoy". NADIE escribe desde la API: sumar es cosa de la
--  Edge Function, que usa la clave de servicio y se salta RLS. Sin
--  política de insert/update, cualquier intento de escritura falla.
-- ---------------------------------------------------------------------
alter table public.ia_uso enable row level security;

drop policy if exists "ia_uso: ver lo mio" on public.ia_uso;
create policy "ia_uso: ver lo mio" on public.ia_uso
  for select using ( user_id = auth.uid() or public.es_super_admin() );

grant select on public.ia_uso to authenticated;


-- ---------------------------------------------------------------------
--  Comprobaciones
-- ---------------------------------------------------------------------
-- Gastar 3 consultas con tope 3: la tercera deja 0 y la cuarta da -1
--   select public.gastar_consulta_ia('<uuid>', 3);  -- 2
--   select public.gastar_consulta_ia('<uuid>', 3);  -- 1
--   select public.gastar_consulta_ia('<uuid>', 3);  -- 0
--   select public.gastar_consulta_ia('<uuid>', 3);  -- -1
--
-- Y que nadie pueda escribirla desde la API (debe FALLAR):
--   insert into public.ia_uso(user_id, consultas) values (auth.uid(), 0);
