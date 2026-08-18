// Para que la app ABRA sin señal.
//
//  POR QUÉ EXISTE ESTO
//
//  La app parecía instalable —etiquetas de Apple, pantalla completa, icono
//  en el escritorio— pero por dentro no había nada: cada apertura se bajaba
//  los 390 KB del JavaScript otra vez. Con señal mala no llegaban y salía
//  una pantalla en blanco; sin señal, ni eso.
//
//  Pasó de verdad: en Celaya la app no abría.
//
//  Y duele donde más se usa: se apunta comida en restaurantes, en el
//  gimnasio, viajando. Justo donde la señal es peor.
//
//  QUÉ ARREGLA Y QUÉ NO
//
//  Arregla que la app ABRA siempre, y que cargue al instante en vez de
//  bajarse todo cada vez. NO hace que se pueda apuntar sin red: la comida,
//  el peso y la IA viven en Supabase y eso sigue necesitando conexión.
//  Guardar apuntes sin señal y sincronizarlos luego es otra cosa, bastante
//  más grande, y no viene incluida aquí.
//
//  LA TRAMPA QUE HAY QUE EVITAR
//
//  Un service worker mal hecho sirve una versión vieja PARA SIEMPRE, y eso
//  es peor que no tener ninguno: se arregla un fallo, se despliega, y en el
//  teléfono sigue roto sin forma de enterarse.
//
//  Aquí no puede pasar, y no por cuidado sino por cómo está montada la app:
//  el JavaScript y las hojas se piden con `?v=SELLO` en la dirección. Cada
//  versión es una dirección DISTINTA, así que servir de la caché nunca
//  devuelve una versión vieja: devuelve exactamente la que se pidió.
//
//  El único archivo con dirección fija es el index. Ese va a la red primero
//  y solo cae en la caché si no hay señal, que es justo lo que se quiere.

const CACHE = 'macros-esqueleto';

// Lo mínimo para que la pantalla exista. El JavaScript y las hojas NO se
// listan aquí: sus direcciones llevan el sello, que este archivo no conoce.
// Se guardan solas la primera vez que se piden.
const MINIMO = ['./', './index.html'];

self.addEventListener('install', (e) => {
  // skipWaiting: sin esto, un service worker nuevo se queda esperando a que
  // se cierren todas las pestañas. En una app instalada eso puede no pasar
  // en semanas.
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(MINIMO))
      .catch(() => {})        // sin red en la primera visita no se instala nada, y ya
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ns) => Promise.all(ns.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // FUERA DE AQUÍ TODO LO QUE NO SEA LA APP.
  // Supabase es otro dominio, así que se cae solo por esta condición: sus
  // respuestas nunca se guardan. Guardar la comida de alguien en la caché
  // del navegador sería enseñarle datos viejos como si fueran de ahora.
  if (url.origin !== self.location.origin) return;

  // `version.txt` SIEMPRE a la red. Es la señal que dispara la
  // actualización: servirlo de la caché sería decirle a la app que ya está
  // al día para siempre.
  if (url.pathname.endsWith('version.txt')) return;

  // El index: red primero. Así, en cuanto hay señal, llega el sello nuevo y
  // el propio index se encarga de recargar con la versión nueva.
  if (req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('index.html')) {
    e.respondWith(
      fetch(req)
        .then((r) => {
          const copia = r.clone();
          caches.open(CACHE).then((c) => c.put(req, copia)).catch(() => {});
          return r;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match('./index.html')))
    );
    return;
  }

  // El resto de lo nuestro -JavaScript, hojas- de la caché primero. Su
  // dirección lleva el sello, así que lo guardado SIEMPRE corresponde a lo
  // que se está pidiendo. Si no está, se baja y se guarda.
  e.respondWith(
    caches.match(req).then((guardado) => {
      if (guardado) return guardado;
      return fetch(req).then((r) => {
        // Solo se guarda lo que salió bien. Guardar un 404 lo convertiría en
        // permanente.
        if (r && r.ok) {
          const copia = r.clone();
          caches.open(CACHE).then((c) => c.put(req, copia)).catch(() => {});
        }
        return r;
      });
    })
  );
});

// La página manda su sello al arrancar y aquí se tira lo de versiones
// viejas. Sin esto la caché crece sin fin: cada despliegue añade un
// app.js?v=nuevo y el anterior se queda para siempre ocupando sitio.
self.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.tipo !== 'limpiar' || !d.sello) return;
  caches.open(CACHE).then((c) => c.keys().then((claves) => {
    claves.forEach((req) => {
      const v = new URL(req.url).searchParams.get('v');
      // Solo se borra lo que TIENE sello y es de otra versión. Lo que no
      // lleva sello -el index- no se toca nunca: es lo que sostiene la app
      // sin señal.
      if (v && v !== d.sello) c.delete(req);
    });
  })).catch(() => {});
});
