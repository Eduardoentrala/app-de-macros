-- ---------------------------------------------------------------------
--  Constancia de que aceptaron, y de QUE aceptaron
--
--  La app recoge peso, medidas, fotos del cuerpo y condiciones medicas, y
--  va a cobrar por ello. En Mexico eso cae bajo la LFPDPPP, y las
--  condiciones de salud son DATOS SENSIBLES: no basta con que nadie se
--  queje, hace falta consentimiento expreso y por separado.
--
--  DOS FECHAS Y NO UNA
--
--  `consentimiento_en` es el aviso de privacidad y los terminos, que valen
--  para todos. `consentimiento_salud_en` es aparte porque el consentimiento
--  para datos sensibles tiene que ser expreso y distinguible: una sola
--  casilla que mezcle "acepto los terminos" con "y que guarden mis datos
--  medicos" no sirve. Quien no declare ninguna condicion no necesita la
--  segunda, y por eso admite null.
--
--  LA VERSION
--
--  Sin ella, "acepto" no significa nada dentro de un ano: el texto habra
--  cambiado y no habra forma de saber que leyo esa persona. Se guarda cual
--  era, y cuando el texto cambie se vuelve a pedir a quien tenga una vieja.
--
--  NO SE BORRA AL DARSE DE BAJA DE NADA. Se va con la cuenta y nada mas:
--  es la prueba de que hubo consentimiento, y borrarla antes dejaria a
--  todos sin poder demostrar nada.
-- ---------------------------------------------------------------------

alter table public.profiles
  add column if not exists consentimiento_en       timestamptz,
  add column if not exists consentimiento_version  text
    check (consentimiento_version is null or length(consentimiento_version) <= 20),
  add column if not exists consentimiento_salud_en timestamptz;

comment on column public.profiles.consentimiento_en is
  'Cuando acepto el aviso de privacidad y los terminos.';
comment on column public.profiles.consentimiento_version is
  'Que version del texto acepto. Sin esto, "acepto" no significa nada dentro de un ano.';
comment on column public.profiles.consentimiento_salud_en is
  'Consentimiento EXPRESO para datos de salud. Aparte porque son datos sensibles.';


-- ---------------------------------------------------------------------
--  Sin consentimiento expreso no se guardan condiciones de salud
--
--  La restriccion vive aqui y no solo en la pantalla porque la pantalla no
--  es la unica puerta: la app habla por PostgREST y se puede llamar
--  directo. Si alguien mete condiciones sin haber aceptado, la base dice
--  que no.
-- ---------------------------------------------------------------------
--  Va como NOT VALID a proposito.
--
--  Quien declaro sus condiciones ANTES de que existiera esta casilla no
--  tiene fecha de consentimiento, y sin `not valid` el propio ALTER TABLE
--  fallaria al validar esas filas: la migracion no entraria y nadie sabria
--  por que.
--
--  Rellenarles una fecha inventada tampoco vale: seria escribir que
--  consintieron algo que nunca se les enseño, que es justo lo contrario de
--  lo que esta restriccion existe para conseguir. Se les vuelve a pedir la
--  proxima vez que toquen sus condiciones, y hasta entonces la fila se
--  queda como esta.
--
--  NOT VALID no es un agujero: las filas NUEVAS y las que se actualicen si
--  se comprueban. Solo se deja en paz lo que ya estaba.
alter table public.profiles
  drop constraint if exists profiles_salud_con_consentimiento;
alter table public.profiles
  add constraint profiles_salud_con_consentimiento
  check (
    condiciones is null
    or cardinality(condiciones) = 0
    or consentimiento_salud_en is not null
  ) not valid;
