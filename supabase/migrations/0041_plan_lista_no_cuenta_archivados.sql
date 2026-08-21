-- La lista de Plan decia «con plan» de gente sin plan.
--
--  LO QUE PASABA
--
--  El entrenador abre Plan, entra en alguien, pulsa «Quitar el plan». La app
--  manda un DELETE, el cliente deja de ver su plan al instante... y en la
--  lista del entrenador esa persona sigue apareciendo como «con plan».
--
--  Comprobado contra Postgres:
--
--    con el plan escrito   ->  tiene_plan: true
--    la fila tras quitarlo ->  activo: true, archivado: true
--    lo que ve el coach    ->  tiene_plan: true   <- miente
--    lo que ve el cliente  ->  0 planes
--
--  POR QUE
--
--  Dos decisiones correctas que juntas fallan:
--
--   1. Borrar no borra. El trigger de la 0007 marca `archivado_en` y cancela
--      el DELETE. Pero NO toca `activo`, asi que la fila archivada sigue
--      teniendo activo = true.
--
--   2. `plan_lista` es SECURITY DEFINER, y eso se salta el RLS. La politica
--      «planes: ver» ya filtra `archivado_en is null`, asi que en cualquier
--      consulta normal lo archivado no existe. Aqui si existe, y el
--      `exists(... where pl.activo)` lo contaba.
--
--  El resto de la app no lo notaba porque todo lo demas pasa por PostgREST,
--  con RLS. Esta funcion era el unico sitio que miraba `planes` por debajo.
--
--  EL ARREGLO
--
--  Anadir `pl.archivado_en is null` al exists. Se prefiere eso a apagar
--  `activo` al archivar: `activo` significa «es el plan vigente de esta
--  persona» y `archivado_en` significa «esto ya no existe». Son dos cosas
--  distintas y mezclarlas haria que restaurar un archivado -que la 0007
--  permite- dejara el plan apagado sin motivo.
--
--  Lo demas de la funcion no cambia. Se reescribe entera porque
--  `create or replace` lo pide.

create or replace function public.plan_lista()
returns table (
  id uuid, nombre text, correo text, inscrito_en timestamptz, tiene_plan boolean
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  -- Esta lista es de quien entrena. Un cliente se veria a si mismo -no es
  -- una fuga, son sus datos- pero su plan lo lee por otro sitio, y una
  -- lista de una persona en la pantalla de coach solo confunde.
  --
  -- Devuelve vacio en vez de reventar: la app la pide en la misma carga
  -- para todos los roles, y una excepcion aqui llenaria de errores rojos
  -- la pantalla de gente que no ha hecho nada mal.
  if not (public.es_super_admin() or public.mi_rol() in ('coach', 'org_admin')) then
    return;
  end if;

  return query
  select p.id,
         p.full_name::text,
         u.email::text,
         i.inscrito_en,
         exists (select 1 from public.planes pl
                  where pl.user_id = p.id
                    and pl.activo
                    -- SIN ESTO la lista dice «con plan» de quien ya no lo
                    -- tiene. Aqui hace falta a mano: al ser security
                    -- definer, el RLS que lo filtra en el resto de la app
                    -- no se aplica.
                    and pl.archivado_en is null) as tiene_plan
    from public.plan_inscritos i
    join public.profiles p on p.id = i.cliente_id
    join auth.users u on u.id = p.id
   where i.baja_en is null
     and public.puede_ver(i.cliente_id)
   order by p.full_name;
end $$;

revoke execute on function public.plan_lista() from public, anon;
grant  execute on function public.plan_lista() to authenticated;


-- ---------------------------------------------------------------------
--  Comprobacion
-- ---------------------------------------------------------------------
-- Como coach, tras quitarle el plan a un cliente (debe dar false):
--   select nombre, tiene_plan from public.plan_lista();
