// queue.js — Offline queue per submit/edit/delete che falliscono per offline.
//
// Trigger sync:
//   1. Background Sync API (Chrome Android) — il SW elabora anche con app chiusa
//   2. Fallback: window 'online' event nel main thread

const Queue = (() => {

    async function enqueueSubmit(data) {
        return enqueueRaw({
            method: 'POST',
            url: Api.url('/amc/timesheet/submit'),
            body: Api.bodyForSubmit(data),
            kind: 'submit',
            preview: {
                date: data.date,
                project_id: data.project_id,
                project_name: data.project_name || '',
                task_name: data.task_name || '',
                unit_amount: data.unit_amount,
                name: data.name || '/',
            },
        });
    }

    async function enqueueEdit(id, patch, preview) {
        return enqueueRaw({
            method: 'PUT',
            url: Api.url(`/amc/timesheet/${id}`),
            body: Api.bodyForEdit(patch),
            kind: 'edit',
            targetId: id,
            preview,
        });
    }

    async function enqueueDelete(id, preview) {
        return enqueueRaw({
            method: 'DELETE',
            url: `${Api.url('/amc/timesheet/' + id)}?token=${encodeURIComponent(CONFIG.PWA_TOKEN)}`,
            body: null,
            kind: 'delete',
            targetId: id,
            preview,
        });
    }

    async function enqueueRaw(item) {
        const id = await Storage.enqueue(item);
        await registerBackgroundSync();
        return id;
    }

    async function registerBackgroundSync() {
        if ('serviceWorker' in navigator && 'SyncManager' in window) {
            try {
                const reg = await navigator.serviceWorker.ready;
                await reg.sync.register('timesheet-queue');
                return true;
            } catch (e) {
                console.warn('Background sync non disponibile:', e.message);
            }
        }
        return false;
    }

    async function processNow() {
        const items = await Storage.listQueue();
        if (!items.length) return {processed: 0, failed: 0, conflicts: 0};
        let processed = 0, failed = 0, conflicts = 0;
        for (const item of items) {
            try {
                const r = await fetch(item.url, {
                    method: item.method || 'POST',
                    headers: item.body ? {'Content-Type': 'application/json'} : undefined,
                    body: item.body || undefined,
                });
                if (r.ok) {
                    await Storage.removeQueueItem(item.id);
                    processed++;
                } else if (r.status === 409) {
                    let data = {};
                    try { data = await r.json(); } catch (e) {}
                    await Storage.addPendingReview({
                        queueItemId: item.id,
                        method: item.method,
                        url: item.url,
                        body: item.body,
                        kind: item.kind,
                        preview: item.preview,
                        error: data,
                        createdAt: Date.now(),
                    });
                    await Storage.removeQueueItem(item.id);
                    conflicts++;
                } else {
                    failed++;
                }
            } catch (e) {
                failed++;
            }
        }
        return {processed, failed, conflicts};
    }

    function watchConnection(onChange) {
        const update = () => onChange(navigator.onLine);
        window.addEventListener('online', update);
        window.addEventListener('offline', update);
        update();
    }

    return {
        enqueueSubmit,
        enqueueEdit,
        enqueueDelete,
        processNow,
        registerBackgroundSync,
        watchConnection,
    };
})();
