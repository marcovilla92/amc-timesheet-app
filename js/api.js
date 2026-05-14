// api.js — Wrapper su endpoint pubblici Odoo /amc/timesheet/*
//
// Tutti i metodi ritornano la promessa del JSON parsato.
// In caso di errore HTTP/network, lanciano un Error con `code` e `status`
// così l'UI può gestire conflict (409) o auth (401) in modo specifico.

const Api = (() => {

    function url(path) {
        return `${CONFIG.ODOO_URL}${path}`;
    }

    async function _fetch(path, options = {}) {
        const r = await fetch(url(path), {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {}),
            },
        });
        let data = null;
        try {
            data = await r.json();
        } catch (e) {
            // ignored — gestiamo come body vuoto
        }
        if (!r.ok) {
            const err = new Error(data?.detail || data?.error || `HTTP ${r.status}`);
            err.status = r.status;
            err.code = data?.error;
            err.data = data;
            throw err;
        }
        return data;
    }

    function _bodyForSubmit(data) {
        return JSON.stringify({
            token: CONFIG.PWA_TOKEN,
            date: data.date,
            project_id: data.project_id,
            task_id: data.task_id || null,
            unit_amount: data.unit_amount,
            name: data.name || '/',
            tipo: data.tipo || 'lavoro',
        });
    }

    function _bodyForEdit(patch) {
        return JSON.stringify({token: CONFIG.PWA_TOKEN, ...patch});
    }

    return {
        url,
        bodyForSubmit: _bodyForSubmit,
        bodyForEdit: _bodyForEdit,

        async submit(data) {
            return _fetch('/amc/timesheet/submit', {
                method: 'POST',
                body: _bodyForSubmit(data),
            });
        },

        async edit(id, patch) {
            return _fetch(`/amc/timesheet/${id}`, {
                method: 'PUT',
                body: _bodyForEdit(patch),
            });
        },

        async remove(id) {
            const params = new URLSearchParams({token: CONFIG.PWA_TOKEN});
            return _fetch(`/amc/timesheet/${id}?${params}`, {method: 'DELETE'});
        },

        async today(dateStr) {
            const params = new URLSearchParams({token: CONFIG.PWA_TOKEN, date: dateStr});
            return _fetch(`/amc/timesheet/today?${params}`);
        },

        async projects() {
            const params = new URLSearchParams({token: CONFIG.PWA_TOKEN});
            return _fetch(`/amc/timesheet/projects?${params}`);
        },

        async tasks(projectId) {
            const params = new URLSearchParams({
                token: CONFIG.PWA_TOKEN,
                project_id: String(projectId),
            });
            return _fetch(`/amc/timesheet/tasks?${params}`);
        },

        async suggestions(dateStr) {
            const params = new URLSearchParams({token: CONFIG.PWA_TOKEN, date: dateStr});
            return _fetch(`/amc/timesheet/suggestions?${params}`);
        },
    };
})();
