// sw.js
const CACHE_VERSION = 'reef-map-v1';
const TILE_CACHE    = 'reef-tiles-v1';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './geojson/all_reefs.geojson',
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
  const url = new URL(e.request.url);

  // 지도 타일: Cache-First
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

  // 조석 API: Network-First
  if (url.hostname.includes('apis.data.go.kr')) {
    e.respondWith(
      fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE_VERSION).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // 그 외: Cache-First
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok && e.request.method === 'GET') {
        const clone = res.clone();
        caches.open(CACHE_VERSION).then(c => c.put(e.request, clone));
      }
      return res;
    }).catch(() => hit))
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


