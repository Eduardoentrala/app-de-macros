-- ---------------------------------------------------------------------
--  Guardar lo que faltaba de la formula: sexo y dias de entreno
--
--  Sintoma: quien INICIA SESION (no quien se registra) y cambia su objetivo
--  desde Perfil recalculaba sus macros sobre casillas vacias. Salian 1.200
--  calorias y 0 g de proteina, y se guardaban asi en la base.
--
--  Causa: calcularMacros() lee los campos de la pantalla de REGISTRO. Al
--  iniciar sesion el perfil se restauraba a los <span> de Perfil, que son
--  otros elementos, y esos campos se quedaban en blanco.
--
--  Al ir a arreglarlo aparecio lo de verdad: aunque se rellenen peso, altura
--  y edad, `profiles` nunca guardo las otras dos entradas de la formula.
--
--    sexo         Mifflin-St Jeor suma +5 a un hombre y -161 a una mujer.
--                 166 calorias de diferencia que se decidian por el valor
--                 por defecto de la pantalla, no por la persona.
--    dias_entreno El factor de actividad va de 1,2 a 1,9. Es el multiplicador
--                 de TODO el gasto: quien entrena 6 dias y se recalculaba
--                 como si entrenara 3 perdia ~11% de sus calorias.
--
--  Sin estas dos columnas el arreglo de la pantalla dejaria el mismo fallo
--  con un numero menos escandaloso, que es peor: deja de notarse.
--
--  Ambas admiten null a proposito. Las seis cuentas que ya existen no las
--  tienen y no hay forma honesta de adivinarlas; la app usa su valor por
--  defecto hasta que esa persona pase por Perfil. Poner un default en la
--  columna seria afirmar algo que nadie ha dicho.
-- ---------------------------------------------------------------------

alter table public.profiles
  -- 'h' | 'm'. Un check y no un enum: son dos valores que no van a crecer,
  -- y un enum obliga a una migracion para cualquier retoque.
  add column if not exists sexo text
    check (sexo is null or sexo in ('h', 'm')),
  add column if not exists dias_entreno int
    check (dias_entreno is null or dias_entreno between 0 and 7);

comment on column public.profiles.sexo is
  'Para Mifflin-St Jeor. null = nunca lo dijo; la app usa su valor por defecto.';
comment on column public.profiles.dias_entreno is
  'Dias de entreno por semana, 0-7. Da el factor de actividad del gasto.';
