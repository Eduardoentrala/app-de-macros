# Conectar el asistente

El asistente usa la API de Anthropic. La clave **no puede estar en la app**:
`mockup/index.html` se descarga entero en cada teléfono y el repositorio es
público, así que cualquiera la sacaría y gastaría la cuenta. Vive en una Edge
Function, en el servidor.

## 1. Sacar la clave

En [console.anthropic.com](https://console.anthropic.com) → **API Keys** →
*Create Key*. Empieza por `sk-ant-`.

Se ve **una sola vez**. Cópiala antes de cerrar.

> Si alguna vez se te escapa —la pegas en un chat, la subes por error—,
> bórrala desde esa misma pantalla y crea otra. Anular una clave es
> instantáneo; recuperar el dinero gastado no.

## 2. Cargarle saldo

Anthropic cobra por uso, no por mes. En **Billing** metes saldo.

Cuesta menos de lo que parece. Con el modelo que usa la app:

| | Precio | Lo que sale |
|---|---|---|
| Apuntar una comida | ~$0.01 | unas 100 comidas por dólar |
| Armar un plan de un día | ~$0.05 | unos 20 planes por dólar |

Para ti y tus papás, **5 dólares duran meses**. Pon un límite de gasto en
Billing de todos modos: es la red de seguridad si algo se descontrola.

## 3. Guardar la clave en Supabase

Instala la CLI de Supabase si no la tienes ([guía](https://supabase.com/docs/guides/cli)),
y desde la carpeta del proyecto:

```bash
supabase login
supabase link --project-ref jeeoxcsbkcthpwtkimdt
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

La clave queda en el servidor de Supabase. La app nunca la ve.

## 4. Publicar la función

```bash
supabase functions deploy asistente
```

## 5. Aplicar la migración

En el SQL Editor de Supabase, `0015_uso_del_asistente.sql`. Sin ella la
función no puede contar el uso y rechazará todo.

---

## El tope

Cada persona tiene **40 consultas al día**. Es la única defensa contra que un
usuario —o alguien que consiga un token válido— vacíe la cuenta con un bucle
mientras duermes.

Está en `TOPE_DIARIO`, arriba de `functions/asistente/index.ts`. Si lo cambias,
vuelve a publicar la función.

Rechazar **no** gasta consulta: quien llega a 40 se queda en 40, no sigue
sumando. Hay pruebas de eso en `tests/ia.mjs`.

## Qué hace y qué no

Hace dos cosas: convertir «me comí dos huevos con pan» en alimentos con sus
macros, y armar planes de comida que cuadren con las calorías de alguien.

**No escribe en la base.** Devuelve una propuesta; guardarla es cosa de la app,
por el camino de siempre y con RLS. Por eso la función no necesita permisos de
escritura y no puede saltarse ninguna regla de quién ve qué.

## Los macros son estimaciones

El asistente calcula a ojo, como lo haría una persona que sabe de comida. Un
huevo lo clava; un guisado casero del que no conoce la receta, no.

Por eso cada alimento viene marcado —*aprox*, *a ojo*— y la app avisa antes de
guardar. Quien cuenta macros en serio debería revisar lo que va marcado.

## Si algo falla

| Lo que ves | Qué pasa |
|---|---|
| «El asistente no está configurado» | Falta el paso 3: no hay `ANTHROPIC_API_KEY` |
| «Tu sesión caducó» | Vuelve a entrar en la app |
| «Llegaste a las 40 consultas» | Se reinicia mañana |
| «No pudo responder» | Mira los logs: `supabase functions logs asistente` |

El detalle de los errores va a los logs de la función, nunca al teléfono: un
mensaje de error de la API puede llevar dentro trozos de la petición.
