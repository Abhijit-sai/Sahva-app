self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const app = windows.find(client => new URL(client.url).pathname.startsWith("/app"));
    if (app) return app.focus();
    return self.clients.openWindow("/app");
  })());
});
