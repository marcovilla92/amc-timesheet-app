// storage.js — IndexedDB wrapper per:
//   - queue: richieste pending da sincronizzare quando torna online
//   - cache_projects: lista progetti scaricata (TTL 24h)
//   - cache_tasks: lista task per progetto (TTL 24h)
//   - pending_review: richieste rifiutate con conflict 409, da rivedere manualmente

const Storage = (() => {
    const DB_NAME = 'amc-timesheet';
    const DB_VERSION = 2;
    const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
    const HISTORY_TTL_MS = 12 * 60 * 60 * 1000;

    function openDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
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
                // v2: store per "Ripeti ultima" + storia entries 7gg per i preset
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

    function tx(storeName, mode = 'readonly') {
        return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
    }

    function promisify(req) {
        return new Promise((resolve, reject) => {
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    return {
        // ---------- Queue ----------
        async enqueue(item) {
            const store = await tx('queue', 'readwrite');
            return promisify(store.add({...item, createdAt: Date.now()}));
        },
        async listQueue() {
            const store = await tx('queue');
            return promisify(store.getAll());
        },
        async removeQueueItem(id) {
            const store = await tx('queue', 'readwrite');
            return promisify(store.delete(id));
        },
        async countQueue() {
            const store = await tx('queue');
            return promisify(store.count());
        },

        // ---------- Cache progetti ----------
        async getCachedProjects() {
            const store = await tx('cache_projects');
            const row = await promisify(store.get('all'));
            if (!row) return null;
            if (Date.now() - row.ts > CACHE_TTL_MS) return null;
            return row.items;
        },
        async setCachedProjects(items) {
            const store = await tx('cache_projects', 'readwrite');
            return promisify(store.put({key: 'all', items, ts: Date.now()}));
        },

        // ---------- Cache task per progetto ----------
        async getCachedTasks(projectId) {
            const store = await tx('cache_tasks');
            const row = await promisify(store.get(String(projectId)));
            if (!row) return null;
            if (Date.now() - row.ts > CACHE_TTL_MS) return null;
            return row.items;
        },
        async setCachedTasks(projectId, items) {
            const store = await tx('cache_tasks', 'readwrite');
            return promisify(store.put({key: String(projectId), items, ts: Date.now()}));
        },

        // ---------- Pending review (conflict 409) ----------
        async addPendingReview(item) {
            const store = await tx('pending_review', 'readwrite');
            return promisify(store.put(item));
        },
        async listPendingReview() {
            const store = await tx('pending_review');
            return promisify(store.getAll());
        },
        async removePendingReview(queueItemId) {
            const store = await tx('pending_review', 'readwrite');
            return promisify(store.delete(queueItemId));
        },

        // ---------- Last entry (per "Ripeti ultima") ----------
        async getLastEntry() {
            const store = await tx('last_entry');
            const row = await promisify(store.get('singleton'));
            return row ? row.entry : null;
        },
        async setLastEntry(entry) {
            const store = await tx('last_entry', 'readwrite');
            return promisify(store.put({key: 'singleton', entry, ts: Date.now()}));
        },

        // ---------- Entries history (per quick-tap presets) ----------
        async cacheEntriesForDate(dateStr, entries) {
            const store = await tx('entries_history', 'readwrite');
            return promisify(store.put({date: dateStr, entries, ts: Date.now()}));
        },
        async getCachedEntries(dateStr) {
            const store = await tx('entries_history');
            const row = await promisify(store.get(dateStr));
            if (!row) return null;
            if (Date.now() - row.ts > HISTORY_TTL_MS) return null;
            return row.entries;
        },
        async listAllCachedEntries() {
            const store = await tx('entries_history');
            const rows = await promisify(store.getAll());
            const cutoff = Date.now() - HISTORY_TTL_MS;
            return rows.filter((r) => r.ts > cutoff);
        },
    };
})();
