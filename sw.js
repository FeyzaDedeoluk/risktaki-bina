const CACHE='risktaki-bina-v5';
const FILES=['./','index.html','style.css','data.js','map.js','ai.js','report.js','ui.js','ucus.js','manifest.webmanifest','icon-192-1.png','icon-512.png'];
const CDN=['unpkg.com','cdn.jsdelivr.net','cdnjs.cloudflare.com','fonts.googleapis.com','fonts.gstatic.com'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES.map(f=>new Request(f,{cache:'reload'})))).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const u=new URL(e.request.url);
  if(u.hostname.endsWith('openstreetmap.org'))return; // harita karoları önbelleğe alınmaz
  const same=u.origin===location.origin;
  if(!same&&!CDN.includes(u.hostname))return;
  // kendi dosyalarımız her seferinde sunucuya sorulur (10 dk'lık tarayıcı önbelleği beklenmez), çevrimdışıyken kayıtlı kopya kullanılır
  const req=same?new Request(e.request,{cache:'no-cache'}):e.request;
  e.respondWith(fetch(req).then(r=>{
    if(r.ok||r.type==='opaque'){const c=r.clone();caches.open(CACHE).then(x=>x.put(e.request,c));}
    return r;
  }).catch(()=>caches.match(e.request).then(m=>m||caches.match('index.html'))));
});
