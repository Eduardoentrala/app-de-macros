-- ---------------------------------------------------------------------
--  El catalogo, en cualquiera de las unidades que ya usa la app
--
--  La pantalla de «Agregar alimento» ofrece seis: Gramos, Pieza, Servicio,
--  Taza, Cucharada y Onzas. El catalogo solo admitia tres, asi que el super
--  admin no podia dar de alta «una cucharada de aceite de oliva» ni «una taza
--  de arroz cocido» sin traducirlo antes a gramos de cabeza.
--
--  No hay nada que inventar para las tres nuevas: la app ya sabe contarlas
--  -`baseDeUnidad` las trata como unidades sueltas, igual que la pieza- y ya
--  sabe escribirlas en singular y en plural. Lo unico que faltaba era que la
--  base las dejara entrar.
--
--  El resto del check no se toca: sigue exigiendo el peso cuando los macros
--  van por 100 g y se cuenta por unidades, porque ahi si hay que convertir.
-- ---------------------------------------------------------------------

alter table public.alimentos_catalogo
  drop constraint if exists alimentos_catalogo_unidad_valida;

alter table public.alimentos_catalogo
  add constraint alimentos_catalogo_unidad_valida check (
    unidad in ('Gramos', 'Pieza', 'Servicio', 'Taza', 'Cucharada', 'Onzas')
    and macros_por in ('100g', 'unidad')
    -- «Por unidad» solo significa algo si se cuenta por unidades. Con gramos
    -- la unidad ES el gramo y «los macros de un gramo» no es como se escribe
    -- ni como viene de ninguna fuente.
    and (macros_por = '100g' or unidad <> 'Gramos')
    -- Y si los macros van por 100 g, contar por unidades sigue necesitando
    -- saber cuanto pesa una: eso no ha cambiado.
    and (macros_por = 'unidad' or unidad = 'Gramos' or pieza_g is not null)
  );

comment on column public.alimentos_catalogo.unidad is
  'Como se le pide la cantidad a quien lo apunta: Gramos, Pieza, Servicio, '
  'Taza, Cucharada u Onzas. Con Gramos los macros van por 100 g; con el '
  'resto, mira macros_por.';
