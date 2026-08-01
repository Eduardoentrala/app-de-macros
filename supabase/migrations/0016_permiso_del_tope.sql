-- =====================================================================
--  DEVOLVERLE A LA EDGE FUNCTION EL PERMISO DE CONTAR CONSULTAS
--
--  La 0015 termina con:
--      revoke all on function gastar_consulta_ia(...) from public, anon,
--             authenticated;
--
--  La intención era que ningún usuario pudiera llamarla y regalarse
--  consultas. Eso está bien. El problema es que `service_role` -la
--  identidad con la que la Edge Function habla con la base- no tenía
--  permiso propio: dependía del que Postgres le da a `public` por
--  defecto en toda función nueva. Al quitárselo a `public`, se lo quité
--  también a ella.
--
--  Resultado: la función arrancaba, pedía el tope, la base le decía que
--  no, y devolvía "No se pudo comprobar tu uso" por un camino que NO
--  escribe en el registro. De ahí que el asistente fallara sin dejar ni
--  una línea de error, que fue lo que costó encontrarlo.
--
--  SECURITY DEFINER decide con qué privilegios corre el cuerpo de la
--  función. No exime a quien la llama de tener permiso para llamarla.
--  Son dos cosas distintas y aquí se confundieron.
--
--  Depende de 0015.
-- =====================================================================

grant execute on function public.gastar_consulta_ia(uuid, integer) to service_role;

-- anon y authenticated siguen SIN permiso, que era el objetivo real: el
-- tope solo lo mueve el servidor, nunca el teléfono de nadie.

-- La de limpieza la llamará una tarea programada con la misma identidad.
grant execute on function public.limpiar_uso_ia() to service_role;


-- ---------------------------------------------------------------------
--  Comprobaciones
-- ---------------------------------------------------------------------
-- El servidor sí, los usuarios no (debe dar true, false, false):
--   select has_function_privilege('service_role',
--            'public.gastar_consulta_ia(uuid,integer)','execute'),
--          has_function_privilege('authenticated',
--            'public.gastar_consulta_ia(uuid,integer)','execute'),
--          has_function_privilege('anon',
--            'public.gastar_consulta_ia(uuid,integer)','execute');
