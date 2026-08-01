# Base de datos — modelo y decisiones

Plataforma → Organizaciones → Entrenadores → Clientes.

Hoy hay una sola organización (`slug = 'principal'`) y un entrenador, pero
nada en el esquema asume eso: añadir la segunda organización no pide ningún
cambio de estructura ni de consultas.

## Orden de las migraciones

Se aplican por número y **el orden importa**. Cada una depende de la anterior.

| Archivo | Qué añade |
|---|---|
| `0001_esquema_base.sql` | Las 13 tablas. Sin seguridad todavía. |
| `0002_roles_y_rls.sql` | Roles, `coach_clientes`, RLS en todo, bucket de fotos. |
| `0003_panel_super_admin.sql` | Cuentas activas/inactivas, feature flags, estadísticas, bitácora. |
| `0004_multiorganizacion.sql` | `organizations`, `org_id` en cada fila, rol `org_admin`. |
| `0005_rol_org_admin.sql` | Añade `org_admin` al enum, suelto y sin tragarse errores. |
| `0006_cupos_y_acceso.sql` | Aplica los cupos, las cuentas desactivadas y el mantenimiento. |
| `0007_archivado_y_estados.sql` | Borrado lógico, estado del cliente, consentimientos. |
| `0008_auditoria_y_versiones.sql` | Historial de cambios y versionado de metas de macros. |
| `0009_arranque_super_admin.sql` | Permite crear el primer super admin (sin esto la plataforma nace bloqueada). |

`0005` está solo en su archivo a propósito: un valor nuevo de un enum no se
puede usar en la misma transacción en que se añade.

## Las cuatro ideas que sostienen todo

**1. La interfaz nunca es la seguridad.** Ocultar un botón no protege nada.
Todo se aplica dentro de Postgres, así que da igual si alguien llama a la API
con `curl`. La clave anónima de Supabase es pública por diseño; lo que impide
que un usuario lea datos de otro es el RLS.

**2. Las políticas no repiten reglas: llaman funciones.** Todas las políticas
de las once tablas de datos se reducen a `puede_ver(user_id)`,
`puede_editar_propio(user_id)` o `puede_editar_entreno(user_id)`. Cambiar una
regla es reemplazar **una** función; las políticas se actualizan solas. Así se
añadió el aislamiento por organización en `0004` y la comprobación de cuenta
activa en `0006`, sin reescribir una sola política de tabla.

Las funciones son `security definer` y `stable` por dos razones concretas: sin
`definer` una política sobre `profiles` que consulte `profiles` entraría en
recursión infinita; sin `stable` Postgres las evaluaría una vez por fila en
lugar de una por consulta, y eso es lo que hace que esto escale.

**3. `org_id` va desnormalizado en cada fila.** Cuesta una columna, pero evita
un JOIN contra `profiles` en cada política y cada consulta. Con millones de
filas es la diferencia entre usar un índice y recorrer la tabla. La app nunca
envía `org_id`: lo rellena un trigger, así que ninguna pantalla se entera de
que existe. Índice compuesto `(org_id, user_id)` en las once tablas.

**4. Nada de tablas hijas sueltas.** `0002` y `0004` generan políticas y
triggers recorriendo **listas fijas de nombres de tabla**. Una tabla que no
esté en esas listas queda sin RLS, o sea legible por cualquiera con sesión.
Por eso lo que sería una tabla hija pequeña va como `jsonb` en su tabla padre:
`recipes.ingredients` y `workout_sessions.exercises`.

> **Si añades una tabla**: ponle `user_id uuid not null` y añádela a las listas
> de `0002` (sección 7) y `0004` (secciones 5 y 6). Si no, nace sin protección.

## Quién ve qué

| Rol | Alcance |
|---|---|
| `super_admin` | Toda la plataforma. Se salta el filtro de organización a propósito. |
| `org_admin` | Su organización completa. |
| `coach` | Solo los clientes que le asignaron, y solo de su organización. |
| `cliente` | Solo lo suyo. |

Un coach **ve** el diario, el peso y las fotos de sus clientes, pero **no los
edita**: no puede inventarle comidas a nadie. Sí puede editar su
entrenamiento (rutinas, ejercicios, series) — es justo el sentido de tener
entrenador. Esa es la diferencia entre `puede_editar_propio` y
`puede_editar_entreno`.

## Límites

- Por organización: `organizations.max_coaches` y `max_clientes`, vigilados por
  `trg_validar_cupo_org` sobre `profiles`.
- Por entrenador: `system_settings.max_clientes_por_coach`, vigilado por
  `trg_validar_asignacion` sobre `coach_clientes`.

Un coach y un cliente de organizaciones distintas no se pueden asignar: el
trigger lo rechaza aunque la llamada venga del super admin.

## Dos cosas que no se pueden hacer desde SQL

**Crear usuarios y reiniciar contraseñas** exigen la clave `service_role`, que
jamás debe viajar dentro del teléfono. Van en una Edge Function que comprueba
contra la base que quien llama es super admin antes de usarla. El esbozo está
en `0003`, sección 8.

## Nada se borra

Desde `0007`, un `DELETE` sobre clientes, dietas, rutinas, alimentos o fotos
no borra: un trigger lo convierte en `archivado_en = now()`. La app sigue
mandando `DELETE` exactamente igual que antes y lo archivado deja de verse,
así que para la interfaz no cambia nada.

- Para ver la papelera: `set_config('app.ver_archivados','on',true)` antes de
  consultar.
- Para recuperar: `select public.restaurar('<tabla>', '<id>');`
- Para borrar de verdad: `select public.borrar_usuario_definitivo('<id>');`
  Solo super admin, queda anotado en la bitácora, y **no** elimina la cuenta
  de `auth.users` ni las fotos del bucket — eso exige la Edge Function.

Las restricciones de unicidad se volvieron **parciales** (`where archivado_en
is null`) para que archivar un elemento no impida volver a crear otro con el
mismo nombre.

## Quién cambió qué

`auditoria` (0008) guarda cada UPDATE y DELETE con el valor anterior y el
nuevo en `jsonb`, quién lo hizo y cuándo. Es de solo lectura desde la API:
solo la escribe el trigger. No audita los INSERT a propósito — duplicaría el
diario entero y un INSERT no tiene valor anterior que probar.

Las metas de macros tienen además su propia tabla de versiones, porque la
pregunta habitual es "¿qué macros tenía este cliente el 3 de julio?":
`select * from public.metas_en('<cliente>', '2026-07-03');`

## Primer arranque

1. Regístrate en la app con tu correo, como un usuario normal.
2. En el editor SQL de Supabase:
   `select public.nombrar_super_admin('tu-correo@ejemplo.com');`
3. Cierra sesión y vuelve a entrar para que el token recoja el rol.

## Pruebas

`supabase/tests/` corre PostgreSQL de verdad (PGlite: Postgres compilado a
WASM) dentro del propio proceso de Node. No hace falta Docker, ni instalar un
servidor, ni internet.

```
cd supabase/tests
npm install
npm test
```

- `aplicar.mjs` — comprueba que las nueve migraciones aplican en orden.
- `seguridad.mjs` — 21 comprobaciones de comportamiento: aislamiento entre
  clientes, entre coaches y entre organizaciones; qué puede escribir cada rol;
  archivado y restauración; auditoría; cuentas suspendidas; cupos.

`seguridad.mjs` simula la sesión como lo hace Supabase: fija el `sub` del JWT
y cambia al rol `authenticated`. Ese `set role` es imprescindible — sin él
Postgres corre como superusuario, el RLS no se aplica y las pruebas pasarían
siempre sin comprobar nada.

## Estado

Las nueve migraciones **aplican y pasan las 21 pruebas** contra PostgreSQL 18.
Lo que eso no cubre: la integración real con Supabase (auth, Storage, Edge
Functions) y el rendimiento con volumen — el andamiaje de `bootstrap.sql` es
una imitación mínima de los esquemas `auth` y `storage`, no los de verdad.
