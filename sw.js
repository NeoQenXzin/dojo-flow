'use strict';

// The build replaces this marker with a content hash so releases refresh together.
const BUILD_ID = '__BUILD_ID__';
const PREFIX = `dojoflow:${self.registration.scope}:`;
const SHELL_CACHE = `${PREFIX}shell:${BUILD_ID}`;
const VENDOR_CACHE = `${PREFIX}vendor:${BUILD_ID}`;
const assetURL = path => new URL(path, self.registration.scope).href;
const SHELL = [
  './', 'index.html', 'styles.css', 'app.js', 'player.js', 'storage.js',
  'media.js', 'pwa.js', 'manifest.webmanifest', 'test-video.mp4',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
].map(assetURL);
const SHELL_URLS = new Set(SHELL);
const VIDEO_URL = assetURL('test-video.mp4');

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // All or nothing: a failed deployment must not displace a working offline app.
    await cache.addAll(SHELL.map(url => new Request(url, { cache: 'reload' })));
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== SHELL_CACHE && key !== VENDOR_CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
  if (event.data?.type === 'OFFLINE_STATUS' && event.ports[0]) {
    event.waitUntil((async () => {
      const cache = await caches.open(SHELL_CACHE);
      const ready = (await Promise.all(SHELL.map(url => cache.match(url)))).every(Boolean);
      event.ports[0].postMessage({ type: 'OFFLINE_STATUS', ready });
    })());
  }
});

async function videoResponse(request) {
  const cache = await caches.open(SHELL_CACHE);
  const full = await cache.match(VIDEO_URL);
  if (!full) return fetch(request);
  const range = request.headers.get('range');
  if (!range) return full;
  const bytes = await full.arrayBuffer();
  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  const invalid = () => new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${bytes.byteLength}` } });
  if (!match || (!match[1] && !match[2])) return invalid();
  const start = match[1] ? Number(match[1]) : Math.max(0, bytes.byteLength - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), bytes.byteLength - 1) : bytes.byteLength - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= bytes.byteLength) return invalid();
  const headers = new Headers(full.headers);
  headers.delete('Content-Encoding');
  headers.set('Content-Range', `bytes ${start}-${end}/${bytes.byteLength}`);
  headers.set('Content-Length', String(end - start + 1));
  headers.set('Accept-Ranges', 'bytes');
  return new Response(bytes.slice(start, end + 1), { status: 206, headers });
}

async function cachedOrFetch(request, key, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(key);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.status === 200 && response.type !== 'opaque') {
    // Insufficient cache space must not break successful online reads or conversion.
    try { await cache.put(key, response.clone()); } catch {}
  }
  return response;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  url.search = '';
  url.hash = '';

  if (url.href === VIDEO_URL) {
    event.respondWith(videoResponse(request));
    return;
  }
  // User videos are Blob URLs in IndexedDB. Never cache partial media responses.
  if (request.headers.has('range')) return;
  if (SHELL_URLS.has(url.href)) {
    event.respondWith(cachedOrFetch(request, url.href, SHELL_CACHE));
    return;
  }
  if (url.pathname.startsWith(new URL('vendor/', scope).pathname)) {
    // ESM modules, the worker and WebAssembly load only when conversion is used.
    event.respondWith(cachedOrFetch(request, url.href, VENDOR_CACHE));
  }
});
