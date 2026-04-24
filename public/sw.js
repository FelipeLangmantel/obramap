// ObraMap Service Worker — modo offline-first para o app shell + assets pesados
// Estratégia:
//  - App shell: network-first com fallback para cache
//  - Assets estáticos (JS/CSS/imagens/modelos 3D): cache-first
//  - Tiles de mapa (OpenStreetMap): cache-first com cap
//  - Storage do Supabase (imagens de layout, logos, modelos GLB): cache-first
// NUNCA intercepta:
//  - APIs do Supabase (REST/Auth/Realtime) — sempre rede
//  - Rotas de OAuth callback
//  - Métodos não-GET
const SHELL_CACHE = 'obramap-shell-v4';
const ASSET_CACHE = 'obramap-assets-v4';
const TILES_CACHE = 'obramap-tiles-v4';
const STORAGE_CACHE = 'obramap-storage-v4';
const ALL_CACHES = [SHELL_CACHE, ASSET_CACHE, TILES_CACHE, STORAGE_CACHE];
const SHELL_ASSETS = ['/', '/index.html', '/manifest.json'];

// Caps para evitar estourar quota em celulares
const TILES_MAX_ENTRIES = 500;
const STORAGE_MAX_ENTRIES = 200;

// Hosts que NUNCA devem ser cacheados — sempre rede
// IMPORTANTE: não bloqueamos *.supabase.co inteiro porque o Storage
// (imagens, modelos 3D) precisa ser cacheado para offline. Diferenciamos
// pelo path mais abaixo.
const BYPASS_PATH_PATTERNS = [
  /^\/~oauth/,
  /^\/auth\/callback/,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !ALL_CACHES.includes(k)).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function isSupabaseHost(host) {
  return /supabase\.(co|in)$/i.test(host);
}

// REST/Auth/Realtime do Supabase = SEMPRE rede
function isSupabaseApi(url) {
  if (!isSupabaseHost(url.hostname)) return false;
  const p = url.pathname;
  return (
    p.startsWith('/rest/') ||
    p.startsWith('/auth/') ||
    p.startsWith('/realtime/') ||
    p.startsWith('/functions/') ||
    p.startsWith('/graphql/')
  );
}

// Storage do Supabase (object/render) = OK cachear
function isSupabaseStorage(url) {
  return isSupabaseHost(url.hostname) && url.pathname.startsWith('/storage/');
}

function isMapTile(url) {
  return /\.tile\.openstreetmap\.org$/i.test(url.hostname);
}

function isStaticAsset(url, request) {
  if (request.destination === 'image' || request.destination === 'font' || request.destination === 'style' || request.destination === 'script') return true;
  return /\.(?:js|css|woff2?|ttf|otf|png|jpe?g|webp|svg|gif|ico|glb|gltf|bin|hdr|exr)$/i.test(url.pathname);
}

async function trimCache(cacheName, max) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length <= max) return;
    const toDelete = keys.length - max;
    for (let i = 0; i < toDelete; i++) await cache.delete(keys[i]);
  } catch (e) {
    // ignore
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Bypass duro
  if (BYPASS_PATH_PATTERNS.some((p) => p.test(url.pathname))) return;
  if (isSupabaseApi(url)) return;

  // Tiles do mapa Leaflet — cache-first com cap
  if (isMapTile(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(TILES_CACHE);
      const hit = await cache.match(request);
      if (hit) return hit;
      try {
        const res = await fetch(request);
        if (res.ok) { cache.put(request, res.clone()); trimCache(TILES_CACHE, TILES_MAX_ENTRIES); }
        return res;
      } catch {
        return hit || Response.error();
      }
    })());
    return;
  }

  // Storage do Supabase (imagens de layout, logos, modelos 3D) — cache-first
  if (isSupabaseStorage(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(STORAGE_CACHE);
      const hit = await cache.match(request);
      if (hit) return hit;
      try {
        const res = await fetch(request);
        if (res.ok) { cache.put(request, res.clone()); trimCache(STORAGE_CACHE, STORAGE_MAX_ENTRIES); }
        return res;
      } catch {
        return hit || Response.error();
      }
    })());
    return;
  }

  // Navegações: network-first → fallback ao app shell para abrir offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request).then((c) => c || caches.match('/index.html')))
    );
    return;
  }

  // Demais assets estáticos — cache-first
  if (isStaticAsset(url, request)) {
    event.respondWith((async () => {
      const cache = await caches.open(ASSET_CACHE);
      const hit = await cache.match(request);
      if (hit) return hit;
      try {
        const res = await fetch(request);
        if (res.ok && (res.type === 'basic' || res.type === 'cors')) cache.put(request, res.clone());
        return res;
      } catch {
        return hit || Response.error();
      }
    })());
  }
});

// Permite que o app peça para o SW cachear o shell sob demanda
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
