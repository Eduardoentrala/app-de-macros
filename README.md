# App de macros

Aplicación de nutrición y entrenamiento para entrenadores y sus clientes:
diario de comidas, rutinas, peso, cardio y fotos de progreso.

Pensada como producto SaaS desde la base de datos: **Plataforma →
Organizaciones → Entrenadores → Clientes**. Hoy hay una sola organización,
pero añadir la segunda no pide ningún cambio de estructura.

## Cómo está montado

| Carpeta | Qué es |
|---|---|
| `mockup/index.html` | La app entera. Un solo archivo: HTML, CSS y JavaScript sin librerías ni compilación. |
| `supabase/migrations/` | El esquema y toda la seguridad, en nueve migraciones. |
| `supabase/tests/` | Pruebas que corren PostgreSQL de verdad en el propio Node. |
| `supabase/README.md` | El modelo de datos y las decisiones de diseño. |

**Un solo archivo, sin dependencias** es una decisión, no una casualidad: se
publica arrastrando una carpeta, se abre desde cualquier sitio y no hay nada
que compilar ni que se rompa al actualizar un paquete. Se mantiene así.

La seguridad vive en la base de datos, no en la app. La clave publicable de
Supabase viaja en el HTML —es pública por diseño— y lo que impide que alguien
lea datos ajenos son las políticas RLS. Por eso da igual que el código sea
visible.

> La clave `service_role` **nunca** debe aparecer en este repositorio ni en la
> app. Salta todas las políticas.

## Probar la base de datos

```bash
cd supabase/tests
npm install
npm test
```

Aplica las nueve migraciones y corre 21 comprobaciones de comportamiento:
aislamiento entre clientes, entre entrenadores y entre organizaciones; qué
puede escribir cada rol; archivado y restauración; auditoría; cuentas
suspendidas y cupos. No hace falta Docker ni conexión a internet.

## Publicar

El sitio se despliega solo en Netlify con cada cambio en `main`.
`netlify.toml` indica que la carpeta a publicar es `mockup/`.
