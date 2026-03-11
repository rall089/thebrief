const CACHE_NAME = 'the-brief-v2';
const urlsToCache = ['/'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache)));
  self.skipWaiting();
});

self.addEventListener('fetch', event => {
  if (event.request.url.includes('api.anthropic.com') || 
      event.request.url.includes('generativelanguage.googleapis.com') ||
      event.request.url.includes('fonts.googleapis.com') ||
      event.request.url.includes('unpkg.com')) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
  );
  self.clients.claim();
});
