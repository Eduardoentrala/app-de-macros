-- ---------------------------------------------------------------------
--  Lo que el asistente sabe de cada persona
--
--  Hoy olvida todo entre conversaciones: guarda los ultimos doce turnos y
--  se acabo. Cada vez hay que volver a contarle que odias el brocoli, que
--  entrenas de noche o que los martes viajas.
--
--  Un entrenador no funciona asi, y es exactamente lo que separa "una app
--  que responde" de "alguien que me conoce". Esto es lo mas parecido a un
--  coach que se puede construir por unos centimos de tokens.
--
--  POR QUE UN TEXTO Y NO UNA TABLA DE HECHOS
--
--  Una tabla obligaria a decidir de antemano que categorias existen
--  -alergias, horarios, gustos, lesiones- y siempre faltaria una. El texto
--  libre lo escribe el propio asistente con sus palabras y lo vuelve a leer
--  el mismo. No hay nada que consultar por SQL aqui.
--
--  SE REESCRIBE ENTERA, NO SE AÑADE
--
--  Si cada dato nuevo se anadiera al final, en tres meses seria un ladrillo
--  de mil lineas que cuesta tokens en CADA mensaje y donde lo importante
--  queda enterrado. El asistente devuelve la version completa y actualizada,
--  ya depurada. El limite de 1200 caracteres no es decoracion: es lo que
--  fuerza a que elija.
--
--  DATO PERSONAL
--
--  Aqui acaban cosas como "le cuesta comer despues de discutir con su
--  madre". Va en `profiles`, que ya tiene sus politicas: el coach lo ve,
--  solo el dueno lo edita. Y se borra con la cuenta, como todo lo demas.
-- ---------------------------------------------------------------------

alter table public.profiles
  add column if not exists memoria_ia text
    check (memoria_ia is null or length(memoria_ia) <= 1200);

comment on column public.profiles.memoria_ia is
  'Lo que el asistente ha aprendido de esta persona. Lo escribe el modelo, '
  'se reescribe entero en cada actualizacion y se le inyecta en el sistema.';
