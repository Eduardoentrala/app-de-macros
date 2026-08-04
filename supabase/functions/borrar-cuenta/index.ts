// =====================================================================
//  BORRAR-CUENTA — el borrado que el navegador no puede terminar
//
//  Existe por una sola razón: las fotos.
//
//  Borrar la fila de `storage.objects` en SQL suelta la referencia pero NO
//  borra el archivo del bucket. El archivo sigue ahí, accesible con su
//  ruta, después de que alguien pidiera que no quedara nada suyo. La única
//  forma de borrarlo de verdad es la API de Storage, y esa exige o bien la
//  sesión del dueño o bien la clave de servicio.
//
//  Cuando alguien se borra a sí mismo, la app lo hace desde el navegador
//  con su propia sesión y esta función no hace falta. Pero cuando el super
//  admin borra a otra persona, esa sesión no existe en ningún sitio. De ahí
//  esto: la clave de servicio vive aquí, nunca en la app.
//
//  QUIÉN AUTORIZA
//
//  No esta función. La autorización sigue siendo la de siempre:
//  admin_borrar_cuenta() se llama CON EL TOKEN DE QUIEN PIDE, así que
//  vuelve a comprobar dentro de Postgres que sea super admin y que no se
//  esté borrando a sí mismo. Esta función no decide nada sobre permisos;
//  si lo hiciera, habría dos sitios donde mirar y un día dirían cosas
//  distintas.
//
//  La clave de servicio se usa para DOS cosas y ninguna más: leer las rutas
//  de las fotos antes de que desaparezcan, y borrar los archivos después.
//
//  Desplegar:
//    supabase functions deploy borrar-cuenta
// =====================================================================

import { createClient } from 'npm:@supabase/supabase-js@2';

// Misma lista que en `asistente`, y por el mismo motivo: si falta una sola
// cabecera de las que la app manda, el navegador ni siquiera envía la
// petición real y en el registro no aparece ningún error.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const BUCKET = 'progress-photos';

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const claveServicio = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;

  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return json({ error: 'Falta tu sesión.' }, 401);

  let cuerpo: Record<string, unknown>;
  try { cuerpo = await req.json(); }
  catch { return json({ error: 'Petición mal formada.' }, 400); }

  const objetivo = String(cuerpo.usuario ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(objetivo)) {
    return json({ error: 'Falta a quién borrar.' }, 400);
  }

  const admin = createClient(url, claveServicio);
  // Este cliente lleva el token de QUIEN PIDE: todo lo que haga se juzga
  // con sus permisos, no con los de la función.
  const suyo = createClient(url, anon, {
    global: { headers: { Authorization: auth } },
  });

  // 1. Las rutas, ANTES de borrar. Después de la cascada ya no habrá filas
  //    de dónde sacarlas y los archivos quedarían huérfanos para siempre.
  //    Se piden todas, archivadas incluidas: una foto archivada sigue
  //    siendo una foto de esa persona en un servidor.
  const { data: fotos } = await admin
    .from('progress_photos')
    .select('storage_path')
    .eq('user_id', objetivo);
  const rutas = (fotos ?? [])
    .map((f: { storage_path: string | null }) => f.storage_path)
    .filter((r): r is string => !!r);

  // 2. El borrado, con el token de quien pide. Aquí es donde Postgres
  //    comprueba que sea super admin y que no se esté borrando a sí mismo.
  const { error } = await suyo.rpc('admin_borrar_cuenta', { p_usuario: objetivo });
  if (error) {
    // Se devuelve el mensaje de Postgres tal cual: son mensajes escritos
    // para leerse ("No puedes borrar tu propia cuenta desde aquí").
    return json({ error: error.message }, 403);
  }

  // 3. Y ahora sí, los archivos. Si esto falla, la cuenta YA está borrada y
  //    no se puede deshacer: se dice cuántos quedaron sueltos en vez de
  //    fingir que salió todo bien.
  let sueltos = 0;
  if (rutas.length) {
    const { error: errFotos } = await admin.storage.from(BUCKET).remove(rutas);
    if (errFotos) sueltos = rutas.length;
  }

  return json({ ok: true, fotos: rutas.length, sueltos });
});
