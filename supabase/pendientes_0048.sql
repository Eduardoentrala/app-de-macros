-- ======================================================================
--  PENDIENTE: 0048 - dos correcciones de la revision
--
--  Pegar entero y ejecutar. Se puede correr dos veces sin romper nada.
--  Rehace UNA sola funcion: calorias_movidas_a_mano().
--
--  DESPLEGAR TAMBIEN LA FUNCION DEL ASISTENTE: la otra correccion -que
--  la foto de comida cuente como foto y no como chat- va toda ahi.
-- ======================================================================

-- Dos correcciones de la revision: el freno del cierre y las llaves de IA.
--
-- ======================================================================
--  1. LO QUE LA 0046 DOCUMENTA MAL
-- ======================================================================
--
--  La 0046 dice que la llave `foto` cubre la accion `apuntar`, y que
--  `chat` cubre `chat` y `aviso`. Es FALSO, y no por poco:
--
--  La app NUNCA llama a `apuntar`. La camara vive dentro del asistente, asi
--  que mandar la foto de un plato es un `chat` que lleva imagenes. O sea:
--
--    * apagar «apuntar comida con foto» no paraba absolutamente nada;
--    * apagar «preguntas y avisos» paraba tambien las fotos de comida.
--
--  Justo al reves de lo que dicen los dos interruptores. Se arregla en la
--  Edge Function, que ahora mira si la peticion trae imagenes:
--
--    foto  ->  `chat` CON imagenes   (y `apuntar`, si algun dia se usa)
--    chat  ->  `chat` sin imagenes, y `aviso`
--
--  Aqui no hay nada que cambiar -las llaves son las mismas seis- pero queda
--  escrito, porque el comentario de la 0046 ya esta aplicado y quien lo lea
--  dentro de un ano se creera lo que dice.
--
-- ======================================================================
--  2. Que el freno del cierre de los lunes deje de funcionar por accidente
-- ======================================================================
--
--  QUE PASABA
--
--  `calorias_movidas_a_mano` la llama la Edge Function con la CLAVE DE
--  SERVICIO. Ahi dentro `auth.uid()` vale null, y con uid nulo:
--
--      acceso_permitido()  ->  false   (cuenta_habilitada hace coalesce a false)
--      puede_ver(x)        ->  false
--
--  Asi que la comprobacion era
--
--      if not (p_cliente = auth.uid() or public.puede_ver(p_cliente))
--
--  y lo que la salvaba era que `uuid = null` no da false: da NULL. NULL or
--  false es NULL, `not NULL` es NULL, y un `if NULL` no entra. Funcionaba.
--
--  POR QUE HAY QUE ARREGLARLO SI FUNCIONA
--
--  Porque funcionaba SIN QUERER. `plan_metricas`, que hace lo mismo pero
--  escrito como `if not public.puede_ver(...)` -sin el termino que da NULL-,
--  SI revienta con la clave de servicio; se comprobo en el panel.
--
--  O sea que las dos formas de escribir la misma comprobacion se comportan
--  distinto, y la que funciona lo hace por una regla de tres valores que no
--  esta escrita en ningun sitio. El dia que alguien "ordene" esa linea
--  dejando solo `puede_ver`, el freno del cierre de los lunes muere en
--  silencio: la IA volveria a moverle las calorias a quien se las acaba de
--  ajustar su entrenador, y nadie se enteraria hasta verlo comiendo otra
--  cosa.
--
--  Ahora se dice en voz alta: sin sesion es el servidor, y al servidor se le
--  deja pasar. `anon` no puede llegar aqui -no tiene el EXECUTE- y
--  `authenticated` siempre trae un uid, asi que el unico que entra por esa
--  puerta es la clave de servicio.

create or replace function public.calorias_movidas_a_mano(p_cliente uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v jsonb;
begin
  -- SIN SESION = LA EDGE FUNCTION. Es lo unico que puede llegar aqui sin
  -- uid: `anon` no tiene permiso de ejecucion y quien inicia sesion siempre
  -- trae uno. Con sesion, la regla de siempre.
  if auth.uid() is not null
     and not (p_cliente = auth.uid() or public.puede_ver(p_cliente)) then
    raise exception 'No puedes ver eso';
  end if;

  select jsonb_build_object(
           'cuando', a.creado_en, 'cal_antes', a.cal_antes,
           'cal_despues', a.cal_despues, 'motivo', a.motivo)
    into v
    from public.ajustes_calorias a
   where a.cliente_id = p_cliente
     and a.creado_en > now() - interval '7 days'
   order by a.creado_en desc limit 1;

  return v;   -- null si nadie las ha tocado a mano
end $$;

revoke execute on function public.calorias_movidas_a_mano(uuid) from public, anon;
grant  execute on function public.calorias_movidas_a_mano(uuid) to authenticated;


-- ---------------------------------------------------------------------
--  Comprobaciones
-- ---------------------------------------------------------------------
-- Desde el editor SQL, que corre sin sesion igual que la Edge Function
-- (debe DEVOLVER algo o null, no reventar):
--   select public.calorias_movidas_a_mano('<id>');
--
-- Y como una persona cualquiera sobre alguien ajeno (debe FALLAR):
--   select public.calorias_movidas_a_mano('<id-ajeno>');
