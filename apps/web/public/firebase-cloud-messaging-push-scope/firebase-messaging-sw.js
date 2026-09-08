/* VÉLORA Web/PWA Firebase Messaging worker.
 * Dedicated scope keeps Angular ngsw-worker.js intact.
 */

function resolveVeloraRoute(data) {
  const route =
    typeof data?.route === 'string'
      ? data.route.trim()
      : '';

  if (
    route === '/mis-pedidos' ||
    route === 'mis-pedidos' ||
    route === 'orders' ||
    route === 'ORDERS'
  ) {
    return '/mis-pedidos';
  }

  if (route.startsWith('/')) {
    return route;
  }

  const type =
    typeof data?.type === 'string'
      ? data.type
      : '';

  if (
    type.startsWith('ORDER_') ||
    type.startsWith('PAYMENT_')
  ) {
    return '/mis-pedidos';
  }

  return '/mis-pedidos';
}

/*
 * Register custom click handling BEFORE importing Firebase Messaging.
 * This prevents the library from replacing our notificationclick flow.
 */
self.addEventListener(
  'install',
  () => {
    void self.skipWaiting();
  }
);

self.addEventListener(
  'notificationclick',
  (event) => {
    event.notification.close();

    const route =
      resolveVeloraRoute(
        event.notification.data || {}
      );

    const targetUrl =
      new URL(
        route,
        self.location.origin
      ).href;

    event.waitUntil(
      (async () => {
        const clientList =
          await self.clients.matchAll({
            type: 'window',
            includeUncontrolled: true
          });

        for (const client of clientList) {
          try {
            await client.focus();

            client.postMessage({
              type: 'VELORA_PUSH_NAVIGATE',
              route
            });

            return;
          }
          catch {
            // Try another VÉLORA window if available.
          }
        }

        await self.clients.openWindow(
          targetUrl
        );
      })()
    );
  }
);

importScripts(
  'https://www.gstatic.com/firebasejs/12.18.0/firebase-app-compat.js'
);
importScripts(
  'https://www.gstatic.com/firebasejs/12.18.0/firebase-messaging-compat.js'
);

firebase.initializeApp({
  apiKey: 'AIzaSyDLp_CBWsXQsh9TEvhclMu0SSeB0SbLY7c',
  authDomain: 'velora-784de.firebaseapp.com',
  projectId: 'velora-784de',
  storageBucket: 'velora-784de.firebasestorage.app',
  messagingSenderId: '1051623939328',
  appId: '1:1051623939328:web:5d8846572c58d7166ea7e5'
});

const messaging = firebase.messaging();

function defaultTitle(type) {
  switch (type) {
    case 'ORDER_CONFIRMED':
      return 'Pedido confirmado';
    case 'PAYMENT_CONFIRMED':
      return 'Pago confirmado';
    case 'ORDER_READY_PICKUP':
      return 'Pedido listo para recoger';
    case 'ORDER_SHIPPED':
      return 'Tu pedido va en camino';
    case 'ORDER_CANCELLED':
      return 'Pedido cancelado';
    default:
      return 'Actualización de tu pedido';
  }
}

messaging.onBackgroundMessage((payload) => {
  const data = payload?.data || {};
  const type = data.type || '';

  const title =
    data.title ||
    payload?.notification?.title ||
    defaultTitle(type);

  const body =
    data.body ||
    payload?.notification?.body ||
    'Hay una actualización disponible en VÉLORA.';

  const route =
    resolveVeloraRoute(data);

  const entityId =
    data.entityId || '';

  const tag =
    entityId
      ? `velora-${type || 'update'}-${entityId}`
      : `velora-${type || 'update'}`;

  self.registration.showNotification(
    title,
    {
      body,
      icon: '/icons/velora-notification-192.png',
      badge: '/icons/velora-notification-badge-96.png',
      tag,
      renotify: false,
      data: {
        route,
        type,
        entityId
      }
    }
  );
});
