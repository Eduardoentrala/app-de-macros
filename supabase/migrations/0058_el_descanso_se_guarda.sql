-- ---------------------------------------------------------------------
-- EL DESCANSO ENTRE SERIES, GUARDADO
--
-- El cronómetro de la rutina se podía cambiar —3:00, 2:00, lo que fuera—,
-- decía «Descanso: 2:00» como si se hubiera guardado, y al cerrar y abrir
-- la app volvía a 3:00. No era un fallo al guardar: NO SE GUARDABA EN
-- NINGÚN SITIO. `restSeconds` era una variable que nacía valiendo 180 en
-- cada arranque, y el aviso de abajo se enseñaba igual.
--
-- Es la peor forma de perder un ajuste: el que te dice que lo hizo.
--
-- POR QUÉ AQUÍ Y NO EN `routine_exercises.rest_seconds`, que existe desde
-- la 0001 y no la usa nadie: esa columna es POR EJERCICIO y la pantalla
-- tiene un solo cronómetro para toda la rutina. Guardar el mismo número en
-- cada ejercicio sería escribir veinte veces lo mismo y dejar abierta la
-- pregunta de cuál gana cuando dos no coincidan. El ajuste es de la
-- persona, así que va con la persona.
--
-- La columna vieja se deja quieta: un día puede querer descansos distintos
-- por ejercicio —no es lo mismo una sentadilla pesada que un curl—, y ese
-- día está donde tiene que estar.
--
-- EL RANGO ES EL MISMO QUE ACOTA LA PANTALLA (5 a 900). La 0001 puso
-- `between 0 and 3600` en la otra columna, que acepta un descanso de cero
-- segundos y otro de una hora; ninguno de los dos es un descanso. Y los
-- dos topes tienen que seguir siendo el mismo número: si se separan, o se
-- pierde lo tecleado o rebota la fila entera. Hay una prueba que los
-- compara.
-- ---------------------------------------------------------------------

alter table public.profiles
  -- Nulo quiere decir «nunca lo ha tocado», y entonces manda el valor con
  -- el que arranca la pantalla. No se pone un `default` para no inventar
  -- una preferencia que la persona no ha expresado.
  add column if not exists descanso_seg smallint
    check (descanso_seg is null or descanso_seg between 5 and 900);

comment on column public.profiles.descanso_seg is
  'Segundos de descanso entre series que eligio la persona. Null = no lo '
  'ha tocado y vale el de la pantalla.';
