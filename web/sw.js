// Service worker mínimo: permite instalar la app. Network-first (usa siempre la
// versión nueva si el servidor está prendido) y nunca guarda /api/*.
// Subir VERSION cada vez que cambie la cáscara: en "activate" se borran los cachés de versiones viejas.
const VERSION = "14";
const PREFIJO = "editor-braille-";
const CACHE = PREFIJO + "v" + VERSION;
const CASCARA = ["./", "index.html", "estilos.css", "tema.css", "manifest.webmanifest",
  "iconos/logo.png", "iconos/icono-192.png", "iconos/icono-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CASCARA)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith(PREFIJO) && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  e.respondWith(fetch(req).then((resp) => {
    if (resp.ok) { const copia = resp.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); }
    return resp;
  }).catch(() => caches.match(req).then((r) => r || Response.error())));
});
