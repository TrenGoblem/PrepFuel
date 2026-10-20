const CACHE='fuelr-v31-full-cookbook-artwork';
const SHELL=['./','index.html','assets/styles.css','assets/app.js','assets/cloud-config.js','assets/cloud.js','assets/schools.js','assets/meal-placeholder.svg','assets/icon.svg','manifest.webmanifest',
'data/recipes.json','data/starter-breakfast.json',
'data/starter-lunch-1.json','data/starter-lunch-2.json','data/starter-lunch-3.json','data/starter-lunch-4.json',
'data/starter-dinner-1.json','data/starter-dinner-2.json','data/starter-dinner-3.json','data/starter-dinner-4.json',
'images/fuelr-breakfast.svg','images/fuelr-lunch.svg','images/fuelr-dinner.svg','images/featured-steak-burrito.svg','images/featured-buffalo-subs.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url);
  if(url.pathname.includes('/data/recipes.json') || url.pathname.includes('/data/starter-')){
    e.respondWith(fetch(e.request,{cache:'no-store'}).then(r=>r).catch(()=>caches.match(e.request)));
    return;
  }
  if(e.request.method==='GET') e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request).then(r=>{const cp=r.clone();caches.open(CACHE).then(cache=>cache.put(e.request,cp));return r;})));
});
