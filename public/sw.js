self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {
    title: 'MINI-WORLD',
    body: 'New message received',
    tag: 'mini-world-msg',
    forceShow: false
  };

  if (event.data) {
    try {
      data = Object.assign(data, event.data.json());
    } catch (e) {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Only suppress if user is actively typing/looking inside the focused chat window (unless it's a test push)
      const isActivelyFocused = clientList.some((client) => client.focused === true);
      if (isActivelyFocused && !data.forceShow) {
        return;
      }

      return self.registration.showNotification(data.title, {
        body: data.body,
        tag: data.tag || 'mini-world-msg',
        renotify: true,
        requireInteraction: data.tag === 'incoming-call',
        vibrate: [250, 120, 250],
        data: { url: self.location.origin }
      });
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    })
  );
});