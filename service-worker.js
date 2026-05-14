// Service Worker — AMC Timesheet
// - Cache statica per offline app shell
// - Background Sync: rilancia le richieste in coda quando torna la connessione

const CACHE_VERSION = 'amc-timesheet-v2';
const SHELL = [
    './',
    './index.html',
    './manifest.json',
    './css/style.css',
    './js/app.js',
    './js/storage.js',
    './js/api.js',
    './js/queue.js',
    './config.js',
    './icons/icon-192.png',
    './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_VERSION)
            .then((cache) => cache.addAll(SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Cache-first per la app shell (stesso origine, GET)
    if (event.request.method === 'GET' && url.origin === self.location.origin) {
        event.respondWith(
            caches.match(event.request).then((cached) => cached || fetch(event.request))
        );
        return;
    }

    // Network-first per gli endpoint Odoo (no caching)
    event.respondWith(fetch(event.request));
});

// Background Sync — il client registra l'evento 'timesheet-queue' quando un
// submit/edit/delete fallisce per offline. Il SW lo elabora qui.
self.addEventListener('sync', (event) => {
    if (event.tag === 'timesheet-queue') {
        event.waitUntil(processQueue());
    }
});

async function processQueue() {
    const db = await openDB();
    const items = await getAll(db, 'queue');
    for (const item of items) {
        try {
            const r = await fetch(item.url, {
                method: item.method || 'POST',
                headers: {'Content-Type': 'application/json'},
                body: item.body || undefined,
            });
            if (r.ok) {
                await deleteItem(db, 'queue', item.id);
                const clients = await self.clients.matchAll({type: 'window'});
                for (const c of clients) {
                    c.postMessage({type: 'queue-item-synced', id: item.id});
                }
            } else if (r.status === 409) {
                // Conflict — sposta in pending_review
                let data = {};
                try { data = await r.json(); } catch (e) {}
                await putItem(db, 'pending_review', {
                    queueItemId: item.id,
                    method: item.method,
                    url: item.url,
                    body: item.body,
                    error: data,
                    createdAt: Date.now(),
                });
                await deleteItem(db, 'queue', item.id);
                const clients = await self.clients.matchAll({type: 'window'});
                for (const c of clients) {
                    c.postMessage({type: 'queue-item-conflict', id: item.id, error: data});
                }
            }
            // Altri errori HTTP: lascia in coda, ritenta dopo
        } catch (e) {
            // Network error: lascia in coda
        }
    }
}

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('amc-timesheet', 2);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains('queue')) {
                db.createObjectStore('queue', {keyPath: 'id', autoIncrement: true});
            }
            if (!db.objectStoreNames.contains('cache_projects')) {
                db.createObjectStore('cache_projects', {keyPath: 'key'});
            }
            if (!db.objectStoreNames.contains('cache_tasks')) {
                db.createObjectStore('cache_tasks', {keyPath: 'key'});
            }
            if (!db.objectStoreNames.contains('pending_review')) {
                db.createObjectStore('pending_review', {keyPath: 'queueItemId'});
            }
            if (!db.objectStoreNames.contains('last_entry')) {
                db.createObjectStore('last_entry', {keyPath: 'key'});
            }
            if (!db.objectStoreNames.contains('entries_history')) {
                db.createObjectStore('entries_history', {keyPath: 'date'});
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function getAll(db, storeName) {
    return new Promise((resolve, reject) => {
        const store = db.transaction(storeName, 'readonly').objectStore(storeName);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function deleteItem(db, storeName, id) {
    return new Promise((resolve, reject) => {
        const store = db.transaction(storeName, 'readwrite').objectStore(storeName);
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

function putItem(db, storeName, item) {
    return new Promise((resolve, reject) => {
        const store = db.transaction(storeName, 'readwrite').objectStore(storeName);
        const req = store.put(item);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}
