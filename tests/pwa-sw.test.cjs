const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8');

function serviceWorker() {
  const listeners = {};
  const stores = new Map();
  const networkCalls = [];
  const scope = 'https://example.test/DojoFlow/';
  let online = true;
  let claimed = false;
  const caches = {
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async addAll(requests) {
          const responses = await Promise.all(requests.map(request => fetch(request)));
          requests.forEach((request, index) => store.set(request.url, responses[index]));
        },
        async match(key) { return store.get(typeof key === 'string' ? key : key.url)?.clone(); },
        async put(key, response) { store.set(typeof key === 'string' ? key : key.url, response.clone()); }
      };
    }
  };
  async function fetch(request) {
    const url = typeof request === 'string' ? request : request.url;
    networkCalls.push(url);
    if (!online) throw new Error('offline');
    return new Response(url.endsWith('.mp4') ? Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7]) : url, {
      headers: { 'Content-Type': url.endsWith('.mp4') ? 'video/mp4' : 'text/plain' }
    });
  }
  vm.runInNewContext(source, {
    URL, Request, Response, Headers, caches, fetch,
    self: {
      registration: { scope },
      clients: { async claim() { claimed = true; } },
      async skipWaiting() {},
      addEventListener(type, callback) { listeners[type] = callback; }
    }
  });
  return {
    scope, stores, networkCalls, caches,
    get claimed() { return claimed; },
    setOnline(value) { online = value; },
    async lifecycle(type) {
      let pending;
      listeners[type]({ waitUntil(promise) { pending = promise; } });
      await pending;
    },
    async request(relativePath, options) {
      let pending;
      listeners.fetch({ request: new Request(new URL(relativePath, scope), options), respondWith(promise) { pending = promise; } });
      return pending;
    },
    async readiness() {
      let result;
      let pending;
      listeners.message({ data: { type: 'OFFLINE_STATUS' }, ports: [{ postMessage(value) { result = value; } }], waitUntil(promise) { pending = promise; } });
      await pending;
      return result.ready;
    }
  };
}

test('installs a complete app under a GitHub Pages subpath without downloading the converter', async () => {
  const sw = serviceWorker();
  await sw.lifecycle('install');
  assert.equal(await sw.readiness(), true);
  assert.equal(sw.networkCalls.length, 14);
  assert.ok(sw.networkCalls.every(url => url.startsWith(sw.scope) && !url.includes('/vendor/')));
  sw.setOnline(false);
  assert.equal(await (await sw.request('./')).text(), sw.scope);
  assert.equal(await (await sw.request('app.js?v=123')).text(), `${sw.scope}app.js`);
  assert.equal(await sw.request('https://another.test/app.js'), undefined);
  assert.equal(await sw.request('/other-site/app.js'), undefined);
});

test('reports missing shell assets instead of promising offline readiness', async () => {
  const sw = serviceWorker();
  assert.equal(await sw.readiness(), false);
  await sw.lifecycle('install');
  assert.equal(await sw.readiness(), true);
  [...sw.stores.values()][0].delete(`${sw.scope}media.js`);
  assert.equal(await sw.readiness(), false);
});

test('serves correct Safari video byte ranges offline, including suffix and open ended ranges', async () => {
  const sw = serviceWorker();
  await sw.lifecycle('install');
  sw.setOnline(false);
  const first = await sw.request('test-video.mp4', { headers: { Range: 'bytes=0-1' } });
  assert.equal(first.status, 206);
  assert.equal(first.headers.get('Content-Range'), 'bytes 0-1/8');
  assert.equal(first.headers.get('Content-Length'), '2');
  assert.deepEqual([...new Uint8Array(await first.arrayBuffer())], [0, 1]);
  for (const range of ['bytes=-2', 'bytes=6-', 'bytes=6-99']) {
    const result = await sw.request('test-video.mp4', { headers: { Range: range } });
    assert.equal(result.status, 206);
    assert.deepEqual([...new Uint8Array(await result.arrayBuffer())], [6, 7]);
  }
  const whole = await sw.request('test-video.mp4');
  assert.equal(whole.status, 200);
  assert.equal((await whole.arrayBuffer()).byteLength, 8);
});

test('rejects invalid ranges without returning an incorrect 200 response', async () => {
  const sw = serviceWorker();
  await sw.lifecycle('install');
  for (const range of ['bytes=9-', 'bytes=5-2', 'bytes=-0', 'bytes=-', 'invalid']) {
    const result = await sw.request('test-video.mp4', { headers: { Range: range } });
    assert.equal(result.status, 416);
    assert.equal(result.headers.get('Content-Range'), 'bytes */8');
  }
});

test('downloads converter assets on demand and reuses them offline', async () => {
  const sw = serviceWorker();
  await sw.lifecycle('install');
  const asset = 'vendor/core/ffmpeg-core.wasm';
  assert.equal(await (await sw.request(asset)).text(), `${sw.scope}${asset}`);
  assert.equal(sw.networkCalls.length, 15);
  sw.setOnline(false);
  assert.equal(await (await sw.request(asset)).text(), `${sw.scope}${asset}`);
  assert.equal(sw.networkCalls.length, 15);
  // Partial responses must never be placed in the whole-file converter cache.
  assert.equal(await sw.request(asset, { headers: { Range: 'bytes=0-1' } }), undefined);
});

test('activation removes only obsolete caches belonging to this app scope', async () => {
  const sw = serviceWorker();
  const old = `dojoflow:${sw.scope}:shell:old`;
  const unrelated = 'dojoflow:https://example.test/another/:shell:old';
  await sw.caches.open(old);
  await sw.caches.open(unrelated);
  await sw.lifecycle('install');
  await sw.lifecycle('activate');
  assert.equal(sw.stores.has(old), false);
  assert.equal(sw.stores.has(unrelated), true);
  assert.equal(sw.claimed, true);
  assert.equal(await sw.readiness(), true);
});
