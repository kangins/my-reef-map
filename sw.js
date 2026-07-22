const CACHE_VERSION = 'reef-map-v3';
const TILE_CACHE    = 'reef-tiles-v1';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js',
  'https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.css',
  'https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.js',
  'https://unpkg.com/leaflet.locatecontrol@0.79.0/dist/L.Control.Locate.min.css',
  'https://unpkg.com/leaflet.locatecontrol@0.79.0/dist/L.Control.Locate.min.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_VERSION)
      .then(c => Promise.allSettled(APP_SHELL.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_VERSION && k !== TILE_CACHE).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // 1. 지도 타일: Cache-First
  if (url.hostname.includes('tile.openstreetmap.org') ||
      url.hostname.includes('tiles.openseamap.org')) {
    e.respondWith(
      caches.open(TILE_CACHE).then(cache =>
        cache.match(e.request).then(hit => {
          const fetchPromise = fetch(e.request).then(res => {
            if (res.ok) cache.put(e.request, res.clone());
            return res;
          }).catch(() => hit);
          return hit || fetchPromise;
        })
      )
    );
    return;
  }

  // 2. HTML / 루트: Network-First (항상 최신 코드)
  if (e.request.mode === 'navigate' ||
      url.pathname.endsWith('.html') ||
      url.pathname === '/' ||
      url.pathname.endsWith('/my-reef-map/')) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match(e.request).then(hit => hit || caches.match('./index.html')))
    );
    return;
  }

  // 3. GeoJSON / 조석 API: Network-First
  if (url.pathname.endsWith('.geojson') ||
      url.hostname.includes('khoa.go.kr') ||
      url.hostname.includes('apis.data.go.kr') ||
      url.hostname.includes('workers.dev')) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // 4. 그 외 (라이브러리 등): Cache-First
  e.respondWith(
    caches.match(e.request).then(hit => {
      if (hit) return hit;
      return fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(e.request, clone));
        }
        return res;
      });
    })
  );
});

// 출항 전 사전 다운로드
self.addEventListener('message', async e => {
  if (e.data?.type === 'PRECACHE_TILES') {
    const { urls } = e.data;
    const cache = await caches.open(TILE_CACHE);
    let done = 0;
    for (const u of urls) {
      try { await cache.add(u); } catch (err) {}
      done++;
      if (done % 20 === 0) e.source.postMessage({ type: 'PROGRESS', done, total: urls.length });
    }
    e.source.postMessage({ type: 'DONE', done, total: urls.length });
  }
});


