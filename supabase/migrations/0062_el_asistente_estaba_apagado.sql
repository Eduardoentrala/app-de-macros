-- ---------------------------------------------------------------------
--  El asistente llevaba apagado desde el primer día, y nadie lo sabía
--
--  SÍNTOMA: «el botón de asistente ya ni sale». De golpe, sin tocar nada.
--
--  QUÉ PASÓ. El interruptor `ia` se sembró en `false` en la 0003:
--
--    ('ia', false, 'Funciones de IA', 'Asistente, foto de plato y ...')
--
--  y ahí se quedó, inofensivo, porque NADIE LO LEÍA. La app enseñaba el
--  asistente a todo el mundo sin preguntar por él.
--
--  Hasta que los interruptores del panel empezaron a hacer algo (0061). Ese
--  día la app pasó a obedecer un flag que llevaba meses diciendo «apagado»,
--  y el asistente desapareció para todos a la vez. No lo rompió el cambio:
--  lo destapó. El cambio hizo lo que prometía.
--
--  Y es el peor tipo de apagado que hay. `public.flag()` hace:
--
--    coalesce((select activo from feature_flags where clave = p_clave), false)
--
--  o sea que un flag en `false` y un flag que NO EXISTE dan exactamente lo
--  mismo. Desde fuera, «lo apagué» y «nunca lo encendí» son el mismo
--  silencio: ningún error, ningún aviso, solo un botón que ya no está.
--
--  POR QUÉ UNA MIGRACIÓN Y NO UN UPDATE A MANO. Porque esto no es un dato
--  de alguien: es la configuración de la app, y la configuración se versiona
--  igual que el código. Un `update` suelto en el editor arregla hoy y se
--  pierde el día que alguien levante el proyecto de cero — que volvería a
--  nacer con el asistente apagado y con el mismo silencio.
--
--  OJO: ESTA VA DESPUÉS DE LA 0061. La 0061 añade la columna `listo`, y sin
--  ella el panel de interruptores no carga —pide `listo` en su `select` y la
--  base contesta con un error—. O sea que ahora mismo el asistente está
--  apagado Y la pantalla donde se encendería no abre. Aplicar solo esta deja
--  el asistente arreglado pero el panel seguirá sin pintar sus interruptores.
-- ---------------------------------------------------------------------

update public.feature_flags
   set activo = true
 where clave = 'ia'
   and activo = false;


-- ---------------------------------------------------------------------
--  Y QUE NO VUELVA A NACER APAGADO
--
--  La 0003 sigue sembrando `false`, así que un proyecto nuevo arrancaría con
--  el mismo problema. No se edita aquella —una migración aplicada no se
--  reescribe— : se corrige aquí, que es donde se mira la historia.
--
--  `fotografias` nació en `true` y `ia` en `false`, en la misma lista y el
--  mismo día. No hay ninguna razón escrita para esa diferencia, y la app
--  trata las dos igual: las dos esconden una pantalla entera. Era un
--  descuido, y estuvo meses sin notarse porque el código no las miraba.
-- ---------------------------------------------------------------------

comment on column public.feature_flags.activo is
  'Si la función está encendida. OJO: public.flag() devuelve false tanto si '
  'está apagada como si la fila NO EXISTE, así que un flag que la app lee y '
  'que nadie sembró apaga esa función en silencio. Si añades un interruptor '
  'nuevo, siémbralo en la misma migración que lo empieza a leer.';
