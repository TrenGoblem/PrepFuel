const CACHE='fuelr-v24-private-recipe-images';
const SHELL=['./','index.html','assets/styles.css','assets/app.js','assets/cloud-config.js','assets/cloud.js','assets/meal-placeholder.svg','assets/icon.svg','manifest.webmanifest'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url);
  if(url.pathname.endsWith('/data/recipes.json') || url.pathname.endsWith('data/recipes.json')){
    e.respondWith(fetch(e.request,{cache:'no-store'}).then(r=>r).catch(()=>caches.match(e.request)));
    return;
  }
  if(e.request.method==='GET') e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request).then(r=>{const cp=r.clone();caches.open(CACHE).then(cache=>cache.put(e.request,cp));return r;})));
});
