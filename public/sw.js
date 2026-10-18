const SHELL = 'censor-shell-v2';
const SHELL_FILES = ['/', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('censor-shell-') && k !== SHELL).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function receiveShare(request) {
  const form = await request.formData();
  const inbox = await caches.open('share-inbox');
  let i = 0;
  for (const file of form.getAll('images')) {
    if (!(file instanceof File) || !file.type.startsWith('image/')) continue;
    await inbox.put(`/shared/${Date.now()}-${i++}`, new Response(file, {
      headers: { 'content-type': file.type, 'x-name': encodeURIComponent(file.name || 'shared.png') },
    }));
  }
  return Response.redirect('/?shared=1', 303);
}

async function networkFirst(request) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    return (await cache.match(request)) || (await cache.match('/'));
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(request);
  const fresh = fetch(request).then(res => { if (res.ok || res.type === 'opaque') cache.put(request, res.clone()); return res; }).catch(() => hit);
  return hit || fresh;
}

self.addEventListener('fetch', e => {
  const { request } = e, url = new URL(request.url);
  if (request.method === 'POST' && url.origin === location.origin && url.pathname === '/share') {
    e.respondWith(receiveShare(request));
    return;
  }
  if (request.method !== 'GET') return;
  if (request.mode === 'navigate') { e.respondWith(networkFirst(request)); return; }
  if (url.origin === location.origin || url.hostname === 'cdnjs.cloudflare.com') e.respondWith(staleWhileRevalidate(request));
});
