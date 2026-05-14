// app.js — Bootstrap UI: vista Today (lista + suggerimenti) e vista Form
// (aggiungi/modifica). Gestione offline queue, status connessione, toast.

(function () {
    'use strict';

    const $ = (sel) => document.querySelector(sel);

    // ---- DOM refs ---------------------------------------------------------
    const viewToday = $('#view-today');
    const viewForm = $('#view-form');
    const connStatus = $('#connection-status');
    const toastStack = $('#toast-stack');

    const currentDateInput = $('#current-date');
    const datePrev = $('#date-prev');
    const dateNext = $('#date-next');
    const totalHoursEl = $('#total-hours');
    const suggestionsList = $('#suggestions-list');
    const entryList = $('#entry-list');

    const fabAdd = $('#fab-add');
    const formBack = $('#form-back');
    const formTitle = $('#form-title');
    const form = $('#entry-form');
    const formId = $('#form-id');
    const formDate = $('#form-date');
    const formProjectSearch = $('#form-project-search');
    const formProjectId = $('#form-project-id');
    const formProjectChip = $('#form-project-chip');
    const formProjectLabel = $('#form-project-label');
    const formProjectClear = $('#form-project-clear');
    const projectSuggestions = $('#project-suggestions');
    const formTaskSearch = $('#form-task-search');
    const formTaskId = $('#form-task-id');
    const formTaskChip = $('#form-task-chip');
    const formTaskLabel = $('#form-task-label');
    const formTaskClear = $('#form-task-clear');
    const taskSuggestions = $('#task-suggestions');
    const formHours = $('#form-hours');
    const formName = $('#form-name');
    const formSubmit = $('#form-submit');
    const formTipoLavoro = $('#tipo-lavoro');
    const formTipoViaggio = $('#tipo-viaggio');

    const sheetOverlay = $('#sheet-overlay');
    const sheet = $('#bottom-sheet');
    const sheetTitle = $('#sheet-title');
    const sheetBody = $('#sheet-body');
    const sheetConfirm = $('#sheet-confirm');
    const sheetCancel = $('#sheet-cancel');

    const presetsRow = $('#presets-row');
    const repeatBtn = $('#repeat-last');

    // ---- State ------------------------------------------------------------
    let projectsCache = [];     // [{id, name}]
    let queueCount = 0;
    let sheetCallback = null;   // funzione invocata al confirm del bottom sheet

    // ---- Helpers ----------------------------------------------------------
    function escapeHtml(s) {
        return (s || '').replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        })[c]);
    }

    function todayIso() {
        const d = new Date();
        const tzOffset = d.getTimezoneOffset() * 60000;
        return new Date(d - tzOffset).toISOString().slice(0, 10);
    }

    function shiftDate(iso, days) {
        const d = new Date(iso + 'T00:00:00');
        d.setDate(d.getDate() + days);
        const off = d.getTimezoneOffset() * 60000;
        return new Date(d - off).toISOString().slice(0, 10);
    }

    function haptic(ms) {
        if (navigator.vibrate) {
            try { navigator.vibrate(ms); } catch (e) {}
        }
    }

    const TOAST_ICONS = {
        success: 'icon-check',
        warning: 'icon-warning',
        error: 'icon-warning',
        info: 'icon-info',
    };
    function showToast(msg, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const iconId = TOAST_ICONS[type] || 'icon-info';
        toast.innerHTML = `<svg><use href="#${iconId}"/></svg><span>${escapeHtml(msg)}</span>`;
        toastStack.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('show'));
        const timeout = type === 'error' ? 6000 : 3500;
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 280);
        }, timeout);
    }

    function formatTime(iso) {
        if (!iso) return '';
        try {
            const d = new Date(iso);
            return d.toLocaleTimeString('it-IT', {hour: '2-digit', minute: '2-digit'});
        } catch (e) { return ''; }
    }

    function dayLabel(offset) {
        if (offset === 0) return 'oggi';
        if (offset === 1) return 'domani';
        if (offset === -1) return 'ieri';
        if (offset > 0) return `+${offset}gg`;
        return `${offset}gg`;
    }

    function formatDateIt(iso) {
        if (!iso) return '';
        try {
            const d = new Date(iso + 'T00:00:00');
            return d.toLocaleDateString('it-IT', {weekday: 'long', day: 'numeric', month: 'long'});
        } catch (e) { return iso; }
    }

    // ---- Bottom sheet (generico) ------------------------------------------
    function openSheet({title, body, confirmLabel = 'Conferma', cancelLabel = 'Annulla', danger = false, onConfirm}) {
        sheetTitle.textContent = title;
        sheetBody.innerHTML = body;
        sheetConfirm.textContent = confirmLabel;
        sheetConfirm.className = danger ? 'danger' : 'primary';
        sheetCancel.textContent = cancelLabel;
        sheetCallback = onConfirm || null;
        sheet.style.transform = '';   // reset eventuali drag residui
        requestAnimationFrame(() => {
            sheetOverlay.classList.add('visible');
            sheet.classList.add('visible');
        });
        haptic(20);
    }

    function closeSheet() {
        sheet.classList.remove('visible');
        sheetOverlay.classList.remove('visible');
        sheetCallback = null;
    }

    function setupSheetDrag() {
        let startY = 0, currentY = 0, dragging = false, sheetHeight = 0;
        const onStart = (e) => {
            const t = e.touches ? e.touches[0] : e;
            startY = t.clientY;
            sheetHeight = sheet.offsetHeight;
            dragging = true;
            sheet.classList.add('dragging');
        };
        const onMove = (e) => {
            if (!dragging) return;
            const t = e.touches ? e.touches[0] : e;
            currentY = t.clientY - startY;
            if (currentY < 0) currentY = 0;
            sheet.style.transform = `translateY(${currentY}px)`;
        };
        const onEnd = () => {
            if (!dragging) return;
            dragging = false;
            sheet.classList.remove('dragging');
            // chiude se trascinato oltre il 30% dell'altezza
            if (currentY > sheetHeight * 0.3) {
                closeSheet();
            }
            sheet.style.transform = '';
            currentY = 0;
        };
        // Drag handle area = primi 40px del sheet (la handle)
        sheet.addEventListener('touchstart', onStart, {passive: true});
        sheet.addEventListener('touchmove', onMove, {passive: true});
        sheet.addEventListener('touchend', onEnd);
        sheetOverlay.addEventListener('click', closeSheet);
        sheetCancel.addEventListener('click', closeSheet);
        sheetConfirm.addEventListener('click', () => {
            const cb = sheetCallback;
            closeSheet();
            if (cb) cb();
        });
    }

    // ---- Ripeti ultima ----------------------------------------------------
    async function refreshRepeatBtn() {
        const last = await Storage.getLastEntry();
        repeatBtn.disabled = !last;
    }

    async function onRepeatLast() {
        const last = await Storage.getLastEntry();
        if (!last) return;
        haptic(20);
        showForm({
            date: currentDateInput.value,
            project_id: last.project_id,
            project_name: last.project_name,
            task_id: last.task_id,
            task_name: last.task_name,
            name: last.name === '/' ? '' : last.name,
            tipo: last.tipo || 'lavoro',
            focusHours: true,
        });
    }

    // ---- Quick-tap presets dai progetti frequenti -------------------------
    async function refreshPresets() {
        // Cache 7 giorni precedenti se non già presente; computa top 3 progetti per ore
        const today = currentDateInput.value || todayIso();
        const datesToFetch = [];
        for (let i = 1; i <= 7; i++) {
            const d = shiftDate(today, -i);
            const cached = await Storage.getCachedEntries(d);
            if (!cached) datesToFetch.push(d);
        }
        if (navigator.onLine && datesToFetch.length) {
            for (const d of datesToFetch) {
                try {
                    const r = await Api.today(d);
                    await Storage.cacheEntriesForDate(d, r.items || []);
                } catch (e) {
                    break; // niente di drammatico, continua col resto
                }
            }
        }
        const allRows = await Storage.listAllCachedEntries();
        const totals = new Map();
        for (const row of allRows) {
            for (const e of row.entries || []) {
                if (!e.project_id) continue;
                const k = e.project_id;
                const cur = totals.get(k) || {id: e.project_id, name: e.project_name, hours: 0};
                cur.hours += parseFloat(e.unit_amount || 0);
                totals.set(k, cur);
            }
        }
        const top = Array.from(totals.values())
            .sort((a, b) => b.hours - a.hours)
            .slice(0, 3);
        renderPresets(top);
    }

    function renderPresets(items) {
        const repeat = presetsRow.querySelector('.repeat-btn');
        presetsRow.innerHTML = '';
        if (repeat) presetsRow.appendChild(repeat);
        for (const p of items) {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'preset-chip';
            chip.innerHTML = `<span class="chip-name">${escapeHtml(p.name || '—')}</span><span class="chip-hours">${p.hours.toFixed(0)}h</span>`;
            chip.addEventListener('click', () => {
                haptic(20);
                showForm({
                    date: currentDateInput.value,
                    project_id: p.id,
                    project_name: p.name,
                    focusHours: true,
                });
            });
            presetsRow.appendChild(chip);
        }
    }

    // ---- Views switching --------------------------------------------------
    function showToday() {
        viewToday.classList.remove('hidden');
        viewForm.classList.add('hidden');
        fabAdd.classList.remove('hidden');
    }

    function showForm(prefill = null) {
        viewToday.classList.add('hidden');
        viewForm.classList.remove('hidden');
        fabAdd.classList.add('hidden');
        resetForm();
        if (prefill) applyPrefill(prefill);
        formTitle.textContent = (prefill && prefill.id) ? 'Modifica ora' : 'Nuova ora';
        // Scroll top
        window.scrollTo({top: 0, behavior: 'instant'});
    }

    // ---- Connection + queue indicator ------------------------------------
    function updateConnectionPill() {
        const online = navigator.onLine;
        if (queueCount > 0) {
            connStatus.textContent = `${queueCount} in coda`;
            connStatus.className = 'status-pill queue-badge';
        } else {
            connStatus.textContent = online ? 'online' : 'offline';
            connStatus.className = 'status-pill ' + (online ? 'online' : 'offline');
        }
    }

    async function refreshQueueBadge() {
        queueCount = await Storage.countQueue();
        updateConnectionPill();
    }

    // ---- Init -------------------------------------------------------------
    async function init() {
        const initialDate = todayIso();
        currentDateInput.value = initialDate;
        formDate.value = initialDate;

        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('service-worker.js').catch(() => {});
            navigator.serviceWorker.addEventListener('message', (event) => {
                const data = event.data || {};
                if (data.type === 'queue-item-synced') {
                    showToast('Riga sincronizzata.', 'success');
                    refreshQueueBadge();
                    refreshToday();
                } else if (data.type === 'queue-item-conflict') {
                    showToast('Conflitto su una riga in coda — controlla.', 'warning');
                    refreshQueueBadge();
                }
            });
        }

        Queue.watchConnection((online) => {
            updateConnectionPill();
            if (online) {
                Queue.processNow().then((r) => {
                    if (r.processed) {
                        showToast(`${r.processed} riga/righe inviata/e.`, 'success');
                        refreshToday();
                    }
                    if (r.conflicts) {
                        showToast(`${r.conflicts} conflitto/i da rivedere.`, 'warning');
                    }
                    refreshQueueBadge();
                });
            }
        });

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && navigator.onLine) {
                Queue.processNow().then((r) => {
                    if (r.processed) refreshToday();
                    refreshQueueBadge();
                });
            }
        });

        // Date navigation
        currentDateInput.addEventListener('change', () => refreshToday());
        datePrev.addEventListener('click', () => {
            currentDateInput.value = shiftDate(currentDateInput.value, -1);
            refreshToday();
            haptic(20);
        });
        dateNext.addEventListener('click', () => {
            currentDateInput.value = shiftDate(currentDateInput.value, 1);
            refreshToday();
            haptic(20);
        });

        // FAB
        fabAdd.addEventListener('click', () => showForm());

        // Form
        formBack.addEventListener('click', showToday);
        form.addEventListener('submit', onFormSubmit);
        setupProjectAutocomplete();
        setupTaskAutocomplete();

        // Bottom sheet drag + handlers
        setupSheetDrag();

        // Bottone "Ripeti ultima"
        repeatBtn.addEventListener('click', onRepeatLast);

        // Carica cache progetti subito (per offline + form)
        await preloadProjects();

        await refreshQueueBadge();
        await refreshRepeatBtn();
        await refreshToday();

        // Carica preset di progetti frequenti (background, non blocca)
        refreshPresets().catch(() => {});
    }

    // ---- Preload projects (cache) ----------------------------------------
    async function preloadProjects() {
        const cached = await Storage.getCachedProjects();
        if (cached) {
            projectsCache = cached;
        }
        if (navigator.onLine) {
            try {
                const r = await Api.projects();
                projectsCache = r.items || [];
                await Storage.setCachedProjects(projectsCache);
            } catch (e) {
                console.warn('Errore caricamento progetti:', e.message);
            }
        }
    }

    // ---- Refresh Today (entries + suggestions) ---------------------------
    async function refreshToday() {
        const date = currentDateInput.value;
        await Promise.all([refreshEntries(date), refreshSuggestions(date)]);
    }

    async function refreshEntries(date) {
        const queueItems = await Storage.listQueue();
        // mostra prima le righe sincronizzate (server), poi quelle in coda per quella data
        let entries = [];
        let totalHours = 0;

        if (navigator.onLine) {
            try {
                const r = await Api.today(date);
                entries = r.items || [];
                totalHours = r.total_hours || 0;
            } catch (e) {
                if (e.status === 401) {
                    showToast('Token non valido. Controlla la config.', 'error');
                    return;
                }
                // su errore generico mostra solo coda locale
                console.warn('Errore today:', e.message);
            }
        }

        // Voci in coda per quella data (preview)
        const queuedForDate = queueItems.filter((it) => {
            try {
                if (it.kind === 'submit') {
                    return it.preview && it.preview.date === date;
                }
                if (it.kind === 'edit' && it.preview && it.preview.date) {
                    return it.preview.date === date;
                }
            } catch (e) {}
            return false;
        });

        // Calcola totale includendo le preview submit
        let queuedHours = 0;
        for (const it of queuedForDate) {
            if (it.kind === 'submit' && it.preview) {
                queuedHours += parseFloat(it.preview.unit_amount || 0);
            }
        }

        totalHoursEl.textContent = (totalHours + queuedHours).toFixed(1);

        const html = [];
        if (!entries.length && !queuedForDate.length) {
            html.push('<li class="empty">Nessuna ora inserita per questa data.</li>');
        } else {
            for (const e of entries) {
                html.push(renderEntryHtml(e, false));
            }
            for (const it of queuedForDate) {
                if (it.kind === 'submit' && it.preview) {
                    html.push(renderQueuedSubmitHtml(it));
                }
            }
        }
        entryList.innerHTML = html.join('');
        // Wire-up actions
        entryList.querySelectorAll('.entry-item[data-id]').forEach((row) => {
            const id = parseInt(row.dataset.id, 10);
            row.querySelector('.edit')?.addEventListener('click', (ev) => {
                ev.stopPropagation();
                onEditClick(id);
            });
            row.querySelector('.delete')?.addEventListener('click', (ev) => {
                ev.stopPropagation();
                onDeleteClick(id, false);
            });
            row.addEventListener('click', () => onEditClick(id));
        });
        entryList.querySelectorAll('.entry-item[data-queue-id]').forEach((row) => {
            const qid = parseInt(row.dataset.queueId, 10);
            row.querySelector('.delete')?.addEventListener('click', (ev) => {
                ev.stopPropagation();
                onDeleteClick(qid, true);
            });
        });
    }

    function renderEntryHtml(e, isQueued) {
        const taskBit = e.task_name ? ` · ${escapeHtml(e.task_name)}` : '';
        return `
            <li class="entry-item" data-id="${e.id}">
                <span class="project-name">${escapeHtml(e.project_name || '—')}</span>
                <span class="task-and-name">${escapeHtml(e.name || '/')}${taskBit}</span>
                <span class="hours">${e.unit_amount.toFixed(1)}h</span>
                <span class="actions">
                    <button type="button" class="edit" aria-label="Modifica"><svg><use href="#icon-edit"/></svg></button>
                    <button type="button" class="delete" aria-label="Elimina"><svg><use href="#icon-trash"/></svg></button>
                </span>
            </li>
        `;
    }

    function renderQueuedSubmitHtml(it) {
        const p = it.preview;
        return `
            <li class="entry-item queued" data-queue-id="${it.id}">
                <span class="project-name">${escapeHtml(p.project_name || '—')}</span>
                <span class="task-and-name">${escapeHtml(p.name || '/')} · in coda</span>
                <span class="hours">${parseFloat(p.unit_amount).toFixed(1)}h</span>
                <span class="actions">
                    <button type="button" class="delete" aria-label="Rimuovi dalla coda"><svg><use href="#icon-trash"/></svg></button>
                </span>
            </li>
        `;
    }

    async function refreshSuggestions(date) {
        if (!navigator.onLine) {
            suggestionsList.innerHTML = '<li class="empty">Suggerimenti disponibili online.</li>';
            return;
        }
        try {
            const r = await Api.suggestions(date);
            const items = r.items || [];
            if (!items.length) {
                suggestionsList.innerHTML = '<li class="empty">Nessun intervento pianificato.</li>';
                return;
            }
            suggestionsList.innerHTML = items.map(renderSuggestionHtml).join('');
            suggestionsList.querySelectorAll('.suggestion-card').forEach((card, idx) => {
                card.addEventListener('click', () => onSuggestionTap(items[idx]));
            });
        } catch (e) {
            if (e.status !== 401) {
                console.warn('Errore suggestions:', e.message);
            }
            suggestionsList.innerHTML = '<li class="empty">Errore nel caricamento.</li>';
        }
    }

    function renderSuggestionHtml(s) {
        const offset = s.days_offset;
        let badgeClass = '';
        if (offset < 0) badgeClass = 'late';
        else if (offset > 0) badgeClass = 'future';
        const time = formatTime(s.planned_date_begin);
        const addressBit = s.partner_address
            ? `<div class="address">${escapeHtml(s.partner_address)}</div>` : '';
        const taskBit = s.task_name && s.task_name !== s.partner_name
            ? ` · ${escapeHtml(s.task_name)}` : '';
        return `
            <li class="suggestion-card" tabindex="0">
                <span class="badge ${badgeClass}">${dayLabel(offset)}${time ? ' ' + time : ''}</span>
                <span class="partner">${escapeHtml(s.partner_name || s.task_name || '—')}${taskBit}</span>
                <span class="meta">
                    ${addressBit}
                    <span class="project">${escapeHtml(s.project_name || '')}</span>
                </span>
            </li>
        `;
    }

    function onSuggestionTap(s) {
        haptic(20);
        showForm({
            date: currentDateInput.value,
            project_id: s.project_id,
            project_name: s.project_name,
            task_id: s.task_id,
            task_name: s.task_name,
            name: s.task_name || '/',
            focusHours: true,
        });
    }

    // ---- Form: project autocomplete --------------------------------------
    function setupProjectAutocomplete() {
        let debounceTimer = null;
        const render = (items) => {
            projectSuggestions.innerHTML = '';
            items.slice(0, 30).forEach((p) => {
                const li = document.createElement('li');
                li.textContent = p.name;
                li.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    selectProject(p);
                });
                projectSuggestions.appendChild(li);
            });
        };
        formProjectSearch.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            const q = formProjectSearch.value.trim().toLowerCase();
            if (q.length < 2) {
                projectSuggestions.innerHTML = '';
                return;
            }
            debounceTimer = setTimeout(() => {
                const items = projectsCache.filter((p) => p.name.toLowerCase().includes(q));
                render(items);
            }, 150);
        });
        formProjectSearch.addEventListener('blur', () => {
            setTimeout(() => { projectSuggestions.innerHTML = ''; }, 200);
        });
        formProjectClear.addEventListener('click', () => clearProject());
    }

    function selectProject(p) {
        formProjectId.value = String(p.id);
        formProjectLabel.textContent = p.name;
        formProjectChip.classList.remove('hidden');
        formProjectSearch.classList.add('hidden');
        projectSuggestions.innerHTML = '';
        formProjectSearch.value = '';
        // abilita task search
        formTaskSearch.disabled = false;
        formTaskSearch.placeholder = 'Cerca task...';
        // pre-carica tasks per quel progetto
        preloadTasksFor(p.id);
        formProjectSearch.classList.remove('invalid');
    }

    function clearProject() {
        formProjectId.value = '';
        formProjectChip.classList.add('hidden');
        formProjectSearch.classList.remove('hidden');
        formProjectSearch.value = '';
        clearTask();
        formTaskSearch.disabled = true;
        formTaskSearch.placeholder = 'Seleziona prima un progetto';
    }

    // ---- Form: task autocomplete -----------------------------------------
    let tasksCacheCurrent = [];
    function setupTaskAutocomplete() {
        let debounceTimer = null;
        const render = (items) => {
            taskSuggestions.innerHTML = '';
            items.slice(0, 30).forEach((t) => {
                const li = document.createElement('li');
                li.textContent = t.name;
                li.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    selectTask(t);
                });
                taskSuggestions.appendChild(li);
            });
        };
        formTaskSearch.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            const q = formTaskSearch.value.trim().toLowerCase();
            if (!tasksCacheCurrent.length) {
                taskSuggestions.innerHTML = '';
                return;
            }
            debounceTimer = setTimeout(() => {
                const items = q.length < 1
                    ? tasksCacheCurrent
                    : tasksCacheCurrent.filter((t) => t.name.toLowerCase().includes(q));
                render(items);
            }, 100);
        });
        formTaskSearch.addEventListener('focus', () => {
            if (tasksCacheCurrent.length && !formTaskSearch.value) {
                taskSuggestions.innerHTML = '';
                tasksCacheCurrent.slice(0, 30).forEach((t) => {
                    const li = document.createElement('li');
                    li.textContent = t.name;
                    li.addEventListener('mousedown', (e) => {
                        e.preventDefault();
                        selectTask(t);
                    });
                    taskSuggestions.appendChild(li);
                });
            }
        });
        formTaskSearch.addEventListener('blur', () => {
            setTimeout(() => { taskSuggestions.innerHTML = ''; }, 200);
        });
        formTaskClear.addEventListener('click', () => clearTask());
    }

    async function preloadTasksFor(projectId) {
        tasksCacheCurrent = [];
        const cached = await Storage.getCachedTasks(projectId);
        if (cached) tasksCacheCurrent = cached;
        if (navigator.onLine) {
            try {
                const r = await Api.tasks(projectId);
                tasksCacheCurrent = r.items || [];
                await Storage.setCachedTasks(projectId, tasksCacheCurrent);
            } catch (e) {
                console.warn('Errore caricamento task:', e.message);
            }
        }
    }

    function selectTask(t) {
        formTaskId.value = String(t.id);
        formTaskLabel.textContent = t.name;
        formTaskChip.classList.remove('hidden');
        formTaskSearch.classList.add('hidden');
        taskSuggestions.innerHTML = '';
        formTaskSearch.value = '';
    }

    function clearTask() {
        formTaskId.value = '';
        formTaskChip.classList.add('hidden');
        formTaskSearch.classList.remove('hidden');
        formTaskSearch.value = '';
    }

    // ---- Form: reset / prefill / submit ----------------------------------
    function resetForm() {
        formId.value = '';
        formDate.value = currentDateInput.value;
        clearProject();
        clearTask();
        formHours.value = '';
        formName.value = '';
        formTipoLavoro.checked = true;
        formSubmit.classList.remove('loading');
        formSubmit.disabled = false;
    }

    function applyPrefill(p) {
        if (p.date) formDate.value = p.date;
        if (p.project_id) {
            selectProject({id: p.project_id, name: p.project_name || '—'});
        }
        if (p.task_id) {
            // preload tasks asincrono — selectTask anche se preload non finito
            selectTask({id: p.task_id, name: p.task_name || '—'});
        }
        if (p.unit_amount) formHours.value = p.unit_amount;
        if (p.name) formName.value = p.name === '/' ? '' : p.name;
        if (p.id) formId.value = String(p.id);
        if (p.tipo === 'viaggio') formTipoViaggio.checked = true;
        else formTipoLavoro.checked = true;
        if (p.focusHours) {
            setTimeout(() => formHours.focus(), 100);
        }
    }

    function validateForm() {
        let valid = true;
        if (!formDate.value) { valid = false; }
        if (!formProjectId.value) {
            formProjectSearch.classList.add('invalid');
            valid = false;
        }
        const h = parseFloat(formHours.value);
        if (!h || h <= 0) {
            formHours.classList.add('invalid');
            valid = false;
        }
        return valid;
    }

    function onFormSubmit(e) {
        e.preventDefault();
        formHours.classList.remove('invalid');
        formProjectSearch.classList.remove('invalid');
        if (!validateForm()) {
            showToast('Compila i campi obbligatori.', 'error');
            return;
        }
        const tipo = formTipoViaggio.checked ? 'viaggio' : 'lavoro';
        const data = {
            id: formId.value ? parseInt(formId.value, 10) : null,
            date: formDate.value,
            project_id: parseInt(formProjectId.value, 10),
            project_name: formProjectLabel.textContent,
            task_id: formTaskId.value ? parseInt(formTaskId.value, 10) : null,
            task_name: formTaskLabel.textContent || '',
            unit_amount: parseFloat(formHours.value),
            name: formName.value.trim() || '/',
            tipo,
        };

        const isEdit = !!data.id;
        const tipoLabel = tipo === 'viaggio' ? 'Viaggio' : 'Lavoro';
        const sheetTitle = isEdit ? 'Modificare la riga?' : 'Registrare le ore?';
        const sheetBodyHtml = `
            <strong>${data.unit_amount.toFixed(1)}h</strong>
            (${escapeHtml(tipoLabel)})
            su <strong>${escapeHtml(data.project_name || '—')}</strong>
            il <strong>${escapeHtml(formatDateIt(data.date))}</strong>.
        `;
        openSheet({
            title: sheetTitle,
            body: sheetBodyHtml,
            confirmLabel: isEdit ? 'Salva' : 'Registra',
            onConfirm: () => performSubmit(data),
        });
    }

    async function performSubmit(data) {
        formSubmit.disabled = true;
        formSubmit.classList.add('loading');
        try {
            if (data.id) {
                const patch = {
                    date: data.date,
                    project_id: data.project_id,
                    task_id: data.task_id,
                    unit_amount: data.unit_amount,
                    name: data.name,
                    tipo: data.tipo,
                };
                try {
                    await Api.edit(data.id, patch);
                    haptic(40);
                    showToast('Riga aggiornata.', 'success');
                    showToday();
                    await refreshToday();
                } catch (err) {
                    if (err.status === 409 && err.code === 'project_archived') {
                        showToast(`Progetto archiviato: ${err.data?.project_name || ''}.`, 'error');
                    } else if (err.status === 403) {
                        showToast('Non puoi modificare questa riga.', 'error');
                    } else if (!navigator.onLine || err.message?.includes('Failed to fetch')) {
                        await Queue.enqueueEdit(data.id, patch, {date: data.date});
                        showToast('Modifica in coda — invio al ritorno online.', 'warning');
                        showToday();
                        await refreshToday();
                        await refreshQueueBadge();
                    } else {
                        throw err;
                    }
                }
            } else {
                try {
                    await Api.submit(data);
                    haptic(50);
                    showToast('Ora registrata.', 'success');
                    // Salva come "ultima entry" per il bottone Ripeti
                    await Storage.setLastEntry({
                        project_id: data.project_id,
                        project_name: data.project_name,
                        task_id: data.task_id,
                        task_name: data.task_name,
                        name: data.name,
                        tipo: data.tipo,
                    });
                    await refreshRepeatBtn();
                    showToday();
                    await refreshToday();
                    // Refresh preset (background)
                    refreshPresets().catch(() => {});
                } catch (err) {
                    if (err.status === 409 && err.code === 'project_archived') {
                        showToast(`Progetto archiviato: ${err.data?.project_name || ''}.`, 'error');
                    } else if (!navigator.onLine || err.message?.includes('Failed to fetch')) {
                        await Queue.enqueueSubmit(data);
                        showToast('Salvata in coda — invio al ritorno online.', 'warning');
                        showToday();
                        await refreshToday();
                        await refreshQueueBadge();
                    } else {
                        throw err;
                    }
                }
            }
        } catch (err) {
            console.error('Submit failed:', err);
            showToast(`Errore: ${err.message}`, 'error');
        } finally {
            formSubmit.disabled = false;
            formSubmit.classList.remove('loading');
        }
    }

    // ---- Edit / Delete from list -----------------------------------------
    async function onEditClick(id) {
        // Trova entry corrispondente nel DOM (già caricata) per pre-fill veloce
        try {
            const r = await Api.today(currentDateInput.value);
            const entry = (r.items || []).find((e) => e.id === id);
            if (!entry) {
                showToast('Riga non trovata.', 'error');
                return;
            }
            showForm({
                id: entry.id,
                date: r.date || currentDateInput.value,
                project_id: entry.project_id,
                project_name: entry.project_name,
                task_id: entry.task_id,
                task_name: entry.task_name,
                unit_amount: entry.unit_amount,
                name: entry.name,
                tipo: entry.tipo || 'lavoro',
            });
        } catch (e) {
            if (e.status === 401) {
                showToast('Token non valido.', 'error');
            } else {
                showToast('Modifica disponibile online.', 'warning');
            }
        }
    }

    function onDeleteClick(id, isQueued) {
        const body = isQueued
            ? 'Rimuovere questa riga in coda? Non verrà inviata a Odoo.'
            : 'Questa azione non si può annullare.';
        openSheet({
            title: 'Eliminare la riga?',
            body: body,
            confirmLabel: 'Elimina',
            danger: true,
            onConfirm: () => performDelete(id, isQueued),
        });
    }

    async function performDelete(id, wasQueued) {
        haptic(30);
        try {
            if (wasQueued) {
                await Storage.removeQueueItem(id);
                showToast('Riga in coda rimossa.', 'success');
                await refreshQueueBadge();
                await refreshToday();
                return;
            }
            try {
                await Api.remove(id);
                showToast('Riga eliminata.', 'success');
                await refreshToday();
            } catch (err) {
                if (err.status === 403) {
                    showToast('Non puoi eliminare questa riga.', 'error');
                } else if (!navigator.onLine || err.message?.includes('Failed to fetch')) {
                    await Queue.enqueueDelete(id, {date: currentDateInput.value});
                    showToast('Eliminazione in coda — invio al ritorno online.', 'warning');
                    await refreshQueueBadge();
                } else {
                    throw err;
                }
            }
        } catch (err) {
            showToast(`Errore: ${err.message}`, 'error');
        }
    }

    // ---- Start ------------------------------------------------------------
    document.addEventListener('DOMContentLoaded', init);
})();
