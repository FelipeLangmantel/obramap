// ObraMap Service Worker — modo offline-first para o app shell
// Estratégia: network-first com fallback para cache. Nunca intercepta:
// - Chamadas para a API do Supabase (banco/storage/auth)
// - Rotas de OAuth callback
// - Métodos não-GET
const CACHE_NAME = 'obramap-shell-v3';
const SHELL_ASSETS = ['/', '/index.html', '/manifest.json'];

// Hosts que NUNCA devem ser cacheados — sempre rede
const BYPASS_HOST_PATTERNS = [
  /supabase\.co$/i,
  /supabase\.in$/i,
];

// Caminhos que NUNCA devem ser interceptados
const BYPASS_PATH_PATTERNS = [
  /^\/~oauth/,
  /^\/auth\/callback/,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function shouldBypass(request) {
  if (request.method !== 'GET') return true;
  const url = new URL(request.url);
  if (BYPASS_HOST_PATTERNS.some((p) => p.test(url.hostname))) return true;
  if (BYPASS_PATH_PATTERNS.some((p) => p.test(url.pathname))) return true;
  return false;
}

self.addEventListener('fetch', (event) => {
  if (shouldBypass(event.request)) return;

  // Para navegações: network-first, cai pro index.html offline
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request).then((c) => c || caches.match('/index.html')))
    );
    return;
  }

  // Para assets estáticos: cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((res) => {
          if (res.ok && res.type === 'basic') {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return res;
        })
        .catch(() => cached);
    })
  );
});

// Permite que o app peça para o SW cachear o shell sob demanda
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
