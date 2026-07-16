self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch { payload = { body: event.data?.text() || '' }; }
  event.waitUntil(self.registration.showNotification(payload.title || 'Quantrift scanner', {
    body: payload.body || '新的 scanner 条件已命中',
    data: { url: payload.url || '/scan' },
    tag: payload.symbol ? `quantrift-${payload.symbol}` : 'quantrift-scanner',
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || '/scan'));
});
