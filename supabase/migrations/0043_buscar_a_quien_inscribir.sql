-- Inscribir en Plan escribiendo el NOMBRE, no el correo exacto.
--
--  LO QUE HABIA
--
--  Un `prompt()` del navegador pidiendo el correo. Tal cual:
--
--      ¿Que correo? Tiene que ser alguien ya registrado en la app.
--
--  Para inscribir a Lety habia que saberse su correo de memoria y
--  escribirlo entero y sin erratas. Una letra mal y sale «No hay ninguna
--  cuenta con ese correo», sin decir cual de las que hay se le parece.
--
--  Ahora se escribe «lety» y salen las personas que se llaman asi, con su
--  correo debajo para distinguir a dos que se llamen igual.
--
--  A QUIEN DEJA VER
--
--  A los mismos que `plan_inscribir` deja inscribir, y esto NO es un
--  detalle: si buscara entre todos, un entrenador escribiria una letra y
--  leeria los nombres y correos de los clientes de otros. La lista sale de
--  `puede_ver`, la misma regla del RLS, asi que un coach solo ve a los
--  suyos y el super admin a todos.
--
--  Y devuelve `ya_inscrito` para poder decirlo en la lista. Sin eso, quien
--  ya esta dentro se vuelve a tocar, no pasa nada visible —el insert es
--  `on conflict do nothing`— y parece que la app no responde.

create or replace function public.plan_buscar(p_texto text default '', p_limite int default 20)
returns table (id uuid, nombre text, correo text, ya_inscrito boolean)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  v_busca text := public.normalizar_texto(coalesce(p_texto, ''));
begin
  -- Vacio en vez de excepcion, igual que `plan_lista`: la app la llama al
  -- teclear y un error aqui llenaria la pantalla de rojo a quien solo
  -- estaba escribiendo.
  if not (public.es_super_admin() or public.mi_rol() in ('coach', 'org_admin')) then
    return;
  end if;

  -- Sin texto no se devuelve nada. Es a proposito: una lista con TODOS al
  -- abrir es justo lo que hacia inutil la pantalla de clientes del panel,
  -- y aqui ademas se busca para inscribir a alguien concreto.
  if length(v_busca) < 2 then
    return;
  end if;

  return query
  select p.id,
         -- A text los dos: `full_name` es text pero `email` es varchar(255),
         -- y una funcion que declare `correo text` y devuelva la columna a
         -- pelo revienta AL EJECUTARSE, no al crearse. Ya tumbo esta misma
         -- pantalla una vez.
         p.full_name::text,
         u.email::text,
         exists (select 1 from public.plan_inscritos i
                  where i.cliente_id = p.id and i.baja_en is null) as ya_inscrito
    from public.profiles p
    join auth.users u on u.id = p.id
   where public.puede_ver(p.id)
     -- Uno mismo fuera: nadie se inscribe a si mismo en su propia lista de
     -- clientes, y aparecer ahi solo confunde.
     and p.id <> auth.uid()
     -- Una cuenta suspendida no puede llevar plan.
     and coalesce(p.activo, true)
     -- Por nombre O por correo, las dos sin acentos ni mayusculas: quien
     -- busca "lety" tiene que encontrar a "Leticia" y a "LETY".
     and (public.normalizar_texto(p.full_name) like '%' || v_busca || '%'
       or public.normalizar_texto(u.email::text) like '%' || v_busca || '%')
   order by p.full_name
   limit least(greatest(coalesce(p_limite, 20), 1), 50);
end $$;

revoke execute on function public.plan_buscar(text, int) from public, anon;
grant  execute on function public.plan_buscar(text, int) to authenticated;


-- ---------------------------------------------------------------------
--  Y que se pueda inscribir por id, no solo por correo
-- ---------------------------------------------------------------------
--  `plan_inscribir(correo)` se queda como esta —la usa quien prefiera
--  teclear el correo, y no hay motivo para romperla—. Esta es para cuando
--  ya se eligio a alguien de la lista: mandar su correo de vuelta para que
--  el servidor lo busque otra vez seria dar un rodeo y, si dos cuentas
--  compartieran correo por lo que fuera, elegir a ciegas.
create or replace function public.plan_inscribir_id(p_cliente uuid)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not (public.es_super_admin() or public.mi_rol() in ('coach', 'org_admin')) then
    raise exception 'No puedes inscribir a nadie en Plan';
  end if;

  -- LA MISMA PUERTA QUE LA OTRA. Un id se adivina peor que un correo, pero
  -- "peor" no es "no": sin esto, un coach inscribiria en su Plan a
  -- cualquiera cuyo id se hubiera cruzado por delante.
  if not public.puede_ver(p_cliente) then
    raise exception 'Esa persona no es cliente tuyo';
  end if;

  insert into public.plan_inscritos (cliente_id, inscrito_por)
  values (p_cliente, auth.uid())
  on conflict (cliente_id) where baja_en is null do nothing;

  return p_cliente;
end $$;

revoke execute on function public.plan_inscribir_id(uuid) from public, anon;
grant  execute on function public.plan_inscribir_id(uuid) to authenticated;


-- ---------------------------------------------------------------------
--  Comprobaciones
-- ---------------------------------------------------------------------
-- Como coach, buscando a alguien suyo (debe devolver filas):
--   select * from public.plan_buscar('lety');
--
-- Buscando a alguien de otro entrenador (debe devolver VACIO):
--   select * from public.plan_buscar('<nombre-ajeno>');
