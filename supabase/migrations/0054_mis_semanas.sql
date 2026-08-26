-- ---------------------------------------------------------------------
--  MIS SEMANAS: que el cierre deje huella.
--
--  Cada lunes se calcula un montón de cosas para decidir si se mueven las
--  calorías —lo que comió de media, su peso medio, si el volumen del gym
--  subió— y en cuanto se toma la decisión se tiran todas. Lo único que
--  quedaba guardado era el hambre, la energía, el sueño, la nota y la
--  decisión.
--
--  Así que no había forma de mirar atrás. Y mirar atrás es justo donde se
--  ve el patrón que ninguna semana suelta enseña: que las semanas en que
--  falta proteína son las mismas en que el peso no se mueve.
--
--  NO ES UNA TABLA NUEVA. `chequeos_semanales` ya es una fila por persona
--  y por semana, con su `unique (user_id, semana)`, su índice y sus
--  políticas —el dueño edita, su coach ve—. Todo eso se hereda añadiendo
--  columnas; una tabla aparte habría que volver a protegerla entera y
--  sería otro sitio donde equivocarse.
--
--  LOS `_antes` NO SON REDUNDANTES. Se podría sacar el peso de la semana
--  anterior leyendo la fila anterior, pero solo si esa fila existe: quien
--  se salta un chequeo no tiene fila, y entonces «la anterior» es de hace
--  dos semanas y la resta miente sin avisar. Guardar lo que se comparó en
--  el momento cuesta dos columnas pequeñas y no puede desalinearse.
--
--  TODO ES OPCIONAL. Las filas que ya existen se quedan sin estos datos y
--  la pantalla las enseña con un guion. Rellenarlas hacia atrás pediría
--  reconstruir el diario de meses que el teléfono ya no tiene, y un número
--  inventado en un historial es peor que un hueco.
-- ---------------------------------------------------------------------

alter table public.chequeos_semanales
  -- Cuántos de los siete apuntó. Es lo que da o quita valor a todo lo demás.
  add column if not exists dias_apuntados smallint
    check (dias_apuntados is null or dias_apuntados between 0 and 7),

  -- Lo que comió DE VERDAD, de media, entre los días que apuntó. La meta
  -- que tenía esa semana ya está en `cal_antes`, así que el porcentaje sale
  -- de dividir estas dos y no hace falta guardarlo.
  add column if not exists media_cal integer
    check (media_cal is null or media_cal between 0 and 20000),
  add column if not exists media_p smallint
    check (media_p is null or media_p between 0 and 1000),
  add column if not exists media_c smallint
    check (media_c is null or media_c between 0 and 2000),
  add column if not exists media_g smallint
    check (media_g is null or media_g between 0 and 1000),

  -- Y las metas de los tres. Las calorías tienen `cal_antes`; los macros no
  -- tenían dónde, y un promedio sin su meta al lado no dice nada.
  add column if not exists meta_p smallint
    check (meta_p is null or meta_p between 0 and 600),
  add column if not exists meta_c smallint
    check (meta_c is null or meta_c between 0 and 900),
  add column if not exists meta_g smallint
    check (meta_g is null or meta_g between 0 and 400),

  -- El peso MEDIO de la semana, no el del día que se pesó: es lo que quita
  -- el ruido del agua y la sal. Es la misma cuenta que ya hace la app para
  -- decidir, aquí solo se guarda.
  add column if not exists peso_medio numeric(5,1)
    check (peso_medio is null or peso_medio between 20 and 400),
  add column if not exists peso_medio_antes numeric(5,1)
    check (peso_medio_antes is null or peso_medio_antes between 20 and 400),

  -- El gym. El volumen es lo que dice si progresó; las sesiones, si fue.
  add column if not exists volumen integer
    check (volumen is null or volumen >= 0),
  add column if not exists volumen_antes integer
    check (volumen_antes is null or volumen_antes >= 0),
  add column if not exists sesiones smallint
    check (sesiones is null or sesiones between 0 and 21),

  -- La cintura de esa semana, si se midió. La báscula no distingue grasa de
  -- agua ni de músculo; esto sí.
  add column if not exists cintura numeric(5,1)
    check (cintura is null or cintura between 40 and 200);


-- ---------------------------------------------------------------------
--  DOCE MESES Y SE BORRA SOLO
--
--  Se limpia AL ESCRIBIR y no con un programador de tareas, por dos
--  razones. La primera, práctica: `pg_cron` no está en todos los planes y
--  esto tiene que funcionar sin depender de eso. La segunda es mejor: a
--  quien deja de usar la app no se le vacía el historial por su cuenta
--  mientras no está. Se limpia cuando vuelve a haber algo que guardar.
--
--  `after insert or update` y no solo insert: la app escribe esto con
--  `on_conflict=user_id,semana` y `merge-duplicates`, o sea un
--  `insert ... on conflict do update`. Contestar dos veces el mismo lunes
--  entra por la rama del update, y con el disparador solo en insert la
--  limpieza no llegaría a saltar nunca para quien repite.
--
--  Y borra SOLO lo de esa persona (`user_id = new.user_id`). Sin esa
--  condición, el lunes de cualquiera limpiaría el historial de todos, que
--  es la clase de error que no se nota hasta que ya pasó.
--
--  No se recursiona: el disparador es de insert/update y lo que hace es un
--  delete.
-- ---------------------------------------------------------------------

create or replace function public.limpiar_chequeos_viejos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.chequeos_semanales
   where user_id = new.user_id
     and semana < (current_date - interval '12 months');
  return null;              -- after trigger: lo que devuelva da igual
end $$;

comment on function public.limpiar_chequeos_viejos() is
  'Deja doce meses de historial por persona. Salta al guardar un chequeo.';

drop trigger if exists chequeos_limpiar on public.chequeos_semanales;
create trigger chequeos_limpiar
  after insert or update on public.chequeos_semanales
  for each row execute function public.limpiar_chequeos_viejos();
