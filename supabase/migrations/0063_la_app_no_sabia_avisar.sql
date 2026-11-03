-- ---------------------------------------------------------------------
--  LA APP NO TENÍA FORMA DE DECIR QUE ALGO LE SALIÓ MAL
--
--  Todos los fallos encontrados hasta hoy se encontraron igual: alguien
--  mirando su teléfono y diciéndolo. El interruptor `ia` llevaba MESES
--  apagado. La cintura se descartaba en silencio cuando el peso estaba
--  vacío. «Guardar sesión» se quedaba muerto por un candado que no se
--  soltaba. El objetivo no volvía al iniciar sesión, y eso borraba meses
--  de ajuste. La comparación de fotos se guardó cortada a media frase.
--
--  Ninguno levantó la mano en ningún sitio, porque NO HAY SITIO DONDE
--  LEVANTARLA. No es que los errores se traguen —los `catch` mudos de la
--  app son sondeos de `localStorage` y están bien puestos—: es que cuando
--  algo falla de verdad, lo único que pasa es que no pasa nada.
--
--  Esta tabla es ese sitio. No arregla ningún fallo: hace que el
--  siguiente se encuentre en días en vez de en meses.
--
--  QUÉ NO LLEVA. Ni comida, ni pesos, ni medidas, ni nada que alguien
--  teclee. Lleva DÓNDE se rompió y QUÉ dijo el error, los dos recortados.
--  Un registro de fallos que acaba guardando datos personales es un
--  problema nuevo, no una herramienta.
--
--  QUIÉN LA LEE. Solo el super admin. Una persona no puede hacer nada con
--  esto y enseñárselo solo preocupa; el valor está en que alguien pueda
--  mirar la lista y ver que hay treinta iguales de esta semana.
-- ---------------------------------------------------------------------

create table if not exists public.errores (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users(id) on delete cascade,

  -- Un nombre corto y estable del sitio: 'guardar_sesion', 'subir_foto'.
  -- Es lo que permite contar «van treinta de estos», que es la señal.
  donde     text not null check (length(donde) between 1 and 60),

  -- El mensaje del error, recortado. 300 caracteres es de sobra para
  -- saber qué pasó y poco para que quepa algo que alguien escribió.
  que       text not null check (length(que) between 1 and 300),

  -- El sello de la app. Sin esto, «esto ya lo arreglé» no se puede
  -- comprobar: un error de hace una semana y uno de ahora se leen igual.
  version   text check (version is null or length(version) <= 40),

  creado_en timestamptz not null default now()
);

-- Se lee siempre igual: lo último primero.
create index if not exists idx_errores_recientes
  on public.errores (creado_en desc);

alter table public.errores enable row level security;

-- VER: solo el super admin. A quien le pasó no le sirve de nada.
drop policy if exists "errores: ver" on public.errores;
create policy "errores: ver" on public.errores
  for select using (public.es_super_admin());

-- Y NADIE ESCRIBE DIRECTO. Se entra por `apuntar_error()`, que es donde
-- está el freno. Sin política de insert, un cliente no puede meter filas
-- aunque lo intente: la función `security definer` sí.

-- EL GRANT, que no es lo mismo que la política. Sin él, `authenticated` ni
-- llega a que se evalúe RLS: Postgres corta antes con «permission denied».
-- Solo `select` — el insert va por la función de arriba.
grant select on public.errores to authenticated;


-- ---------------------------------------------------------------------
--  APUNTAR UNO, CON FRENO
--
--  Un fallo que se repite en bucle —un reintento dentro de un bucle, una
--  pantalla que repinta— escribiría miles de filas iguales en un minuto.
--  Y sería justo el fallo más grave el que llenara la tabla.
--
--  Tope de 50 al día por persona. Pasado eso se descarta en silencio y
--  se devuelve `false`: ya hay cincuenta diciendo lo mismo, el cincuenta
--  y uno no añade nada. Lo que no puede hacer esta función es fallar y
--  romper por encima lo que estaba fallando por debajo.
-- ---------------------------------------------------------------------

create or replace function public.apuntar_error(
  p_donde   text,
  p_que     text,
  p_version text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  hoy_van integer;
begin
  if auth.uid() is null then
    return false;
  end if;

  select count(*) into hoy_van
    from public.errores
   where user_id = auth.uid()
     and creado_en >= current_date;

  if hoy_van >= 50 then
    return false;
  end if;

  insert into public.errores (user_id, donde, que, version)
  values (
    auth.uid(),
    left(coalesce(nullif(trim(p_donde), ''), 'sin_sitio'), 60),
    left(coalesce(nullif(trim(p_que),   ''), 'sin mensaje'), 300),
    left(nullif(trim(p_version), ''), 40)
  );
  return true;
end;
$$;

revoke all on function public.apuntar_error(text, text, text) from public;
grant execute on function public.apuntar_error(text, text, text) to authenticated;


-- ---------------------------------------------------------------------
--  Y QUE NO CREZCA PARA SIEMPRE
--
--  Un error de hace cuatro meses no se va a investigar. Igual que
--  `limpiar_fotos_viejas()`: se llama cuando se quiera, no hay nada
--  programado que dependa de esto.
-- ---------------------------------------------------------------------

create or replace function public.limpiar_errores_viejos()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  delete from public.errores where creado_en < now() - interval '90 days';
  get diagnostics n = row_count;
  return n;
end;
$$;

comment on table public.errores is
  'Dónde y qué falló, sin datos de nadie. Solo lo lee el super admin: '
  'sirve para ver que hay treinta iguales esta semana, no para enseñárselo '
  'a quien le pasó. Se escribe por apuntar_error(), que topa a 50 al día.';


-- ---------------------------------------------------------------------
--  COMPROBAR
--
--    select public.apuntar_error('prueba', 'esto es una prueba', 'x');
--    select donde, que, version, creado_en
--      from public.errores order by creado_en desc limit 20;
--
--    -- Y que nadie más los vea: con la clave anónima, esto da 0 filas.
--    select count(*) from public.errores;
-- ---------------------------------------------------------------------
