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

// Cuánto se espera a la red antes de abrir con lo guardado.
//
// El caso de "sin señal" ya estaba resuelto: el navegador sabe que no hay red
// y el fetch falla al instante, así que el .catch() saca lo guardado y la app
// abre. El que faltaba es el de EN MEDIO -datos móviles flojos-, donde la red
// ni contesta ni falla: se queda esperando. Ahí no hay .catch() que valga
// porque todavía no ha fallado nada, y la app se quedaba en blanco los treinta
// y pico segundos que el navegador tarde en rendirse. Para quien la abre, eso
// es "no abre".
//
// Dos segundos y medio: si la red contesta, manda ella. Si tarda más, se abre
// con lo guardado, que es la misma app, y la petición que iba en camino sigue
// y deja el index nuevo en la caché para la próxima vez. Y si el sello cambió,
// el propio index se recarga solo en cuanto llegue version.txt.
const ESPERA_RED = 2500;

// Lo guardado para una navegación. `ignoreSearch` porque al publicar una
// versión nueva el index se recarga con `?v=nuevo` en la dirección: esa
// dirección exacta no está guardada, y sin esto el respaldo caía en el
// './index.html' del día que se instaló la app, que puede ser de hace meses.
function indexGuardado(req) {
  return caches.match(req, { ignoreSearch: true })
    .then((c) => c || caches.match('./index.html'));
}

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

  // Los iconos y el manifest, TAMBIÉN a la red, y por la misma razón.
  //
  // Sus direcciones no llevan `?v=SELLO` —el manifest lo lee el sistema
  // operativo y el apple-touch-icon lo lee iOS del HTML, y ninguno de los
  // dos pasa por el mecanismo del sello—. Sin sello en la dirección,
  // guardarlos aquí los dejaría fijos PARA SIEMPRE: se rediseña el icono,
  // se publica, y en el teléfono sigue el viejo sin forma de enterarse.
  // Es la misma trampa que este archivo evita para el JavaScript, solo que
  // por la puerta de atrás.
  //
  // No guardarlos no cuesta nada: el sistema se queda con el icono al
  // instalar la app, y el de la pestaña del navegador no hace falta sin
  // señal. Son cuatro archivos que se piden una vez y ya.
  if (url.pathname.includes('/iconos/') || url.pathname.endsWith('manifest.json')) return;

  // El index: red primero. Así, en cuanto hay señal, llega el sello nuevo y
  // el propio index se encarga de recargar con la versión nueva.
  if (req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('index.html')) {
    e.respondWith(new Promise((responder) => {
      // Aquí hay una carrera a propósito, y no hace falta guardarla: a una
      // promesa la resuelve la primera llamada y las demás no hacen nada. Si
      // la red llega después de que se abriera con lo guardado, lo suyo se
      // queda en la caché para la próxima y ya.
      const contestar = (r) => { if (r) responder(r); };

      // El reloj no cancela la petición: la deja seguir. Si la red acaba
      // llegando, lo que traiga se guarda igual y la próxima apertura ya es
      // la buena.
      const reloj = setTimeout(() => { indexGuardado(req).then(contestar); }, ESPERA_RED);

      fetch(req)
        .then((r) => {
          clearTimeout(reloj);
          const copia = r.clone();
          caches.open(CACHE).then((c) => c.put(req, copia)).catch(() => {});
          contestar(r);
        })
        .catch(() => {
          clearTimeout(reloj);
          // Si tampoco hay nada guardado -primera visita sin señal- se
          // contesta el error de red, que es lo que habría pasado de todas
          // formas. Callar aquí dejaría la promesa sin resolver para siempre.
          indexGuardado(req).then((c) => contestar(c || Response.error()));
        });
    }));
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
      const ruta = new URL(req.url).pathname;
      // Restos de una versión anterior de este archivo, que SÍ guardaba los
      // iconos y el manifest. Ahora no se guardan -está explicado arriba-,
      // pero lo que se guardó entonces no se borra solo: no lleva sello, así
      // que la regla de abajo no lo toca y se quedaría ahí para siempre.
      if (ruta.includes('/iconos/') || ruta.endsWith('manifest.json')) {
        c.delete(req);
        return;
      }
      const v = new URL(req.url).searchParams.get('v');
      // Solo se borra lo que TIENE sello y es de otra versión. Lo que no
      // lleva sello -el index- no se toca nunca: es lo que sostiene la app
      // sin señal.
      if (v && v !== d.sello) c.delete(req);
    });
  })).catch(() => {});
});
