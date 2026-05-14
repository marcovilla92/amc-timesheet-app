# AMC Timesheet — PWA

App mobile Android per registrare le ore di lavoro dei dipendenti AMC System.
I dati vengono inviati direttamente al modulo Odoo `rapportino_amc` (controller HTTP pubblico `/amc/timesheet/*`).

## Caratteristiche

- **Lista del giorno** con totale ore e date picker per navigare tra date
- **Suggerimenti** automatici degli interventi FSM pianificati nel range `[-3, +1]` giorni
- **Form completo**: progetto (autocomplete locale), task opzionale, ore, descrizione
- **Modifica / cancella** righe già inserite (solo se non ancora approvate)
- **Offline-first**: tutto funziona senza rete, sync automatico al ritorno online (IndexedDB + Background Sync)
- **PWA installabile** su Android — icona in home screen, modalità standalone

## Setup iniziale

### 1. Configura il modulo Odoo

Prerequisito: modulo `rapportino_amc` versione `19.0.1.1.0+` installato (con il controller PWA).

In Odoo: **Settings → Rapportino AMC — PWA Timesheet**

- **Token PWA**: genera con
  ```bash
  python3 -c "import secrets; print(secrets.token_urlsafe(32))"
  ```
- **Dipendente predefinito**: seleziona il dipendente che userà QUESTO build dell'app
- **Progetto fallback** (opzionale): progetto suggerito se il progetto originale viene archiviato

### 2. Configura il repo

Repo **privato** consigliato (il token PWA non va versionato).

#### Configurazione GitHub Actions

- **Settings → Secrets and variables → Actions → Secrets** → aggiungi:
  - `PWA_TOKEN`: stesso valore generato in Odoo
- **Settings → Secrets and variables → Actions → Variables** (opzionali):
  - `ODOO_BASE_URL`: default `https://amc-system.odoo.com`
  - `EMPLOYEE_LABEL`: es. `Davide` (informativo)

#### Settings → Pages

- Source: **GitHub Actions**

Al primo push su `main`, il workflow `.github/workflows/deploy.yml`:
1. Sostituisce i placeholder in `config.template.js` con i secrets/vars
2. Pubblica su GitHub Pages

URL finale: `https://<org>.github.io/<repo>/`

### 3. Sviluppo locale

```bash
cp config.example.js config.js
# Modifica config.js con PWA_TOKEN reale (NON committare)
python3 -m http.server 8000
# → http://localhost:8000
```

`config.js` è in `.gitignore`.

## Architettura

```
[PWA su GitHub Pages]                  [Odoo rapportino_amc]
  ├─ GET  /amc/timesheet/today      ◀──▶  controller pubblico
  ├─ GET  /amc/timesheet/projects        (auth token, CORS *)
  ├─ GET  /amc/timesheet/tasks
  ├─ GET  /amc/timesheet/suggestions     ←  task project.task is_fsm=True
  ├─ POST /amc/timesheet/submit          →  account.analytic.line.create
  ├─ PUT  /amc/timesheet/<id>            →  account.analytic.line.write
  └─ DEL  /amc/timesheet/<id>            →  account.analytic.line.unlink
```

`employee_id` è SEMPRE forzato dai settings Odoo: chiunque conosca il token può creare/modificare/cancellare timesheet solo per il dipendente fisso (nessuna escalation cross-employee).

## File principali

- `index.html` — vista Today + form (single page, vista commutata via JS)
- `manifest.json` — PWA Android (theme `#1e88e5`, standalone)
- `service-worker.js` — cache app shell + Background Sync queue
- `js/storage.js` — IndexedDB (queue, cache_projects, cache_tasks, pending_review)
- `js/api.js` — wrapper sui 7 endpoint Odoo
- `js/queue.js` — offline queue (POST/PUT/DELETE) + Background Sync
- `js/app.js` — UI bootstrap, autocomplete, status, toast
- `css/style.css` — mobile-first, dark mode automatico
- `config.template.js` — template compilato in CI
- `.github/workflows/deploy.yml` — deploy GitHub Pages con secret injection

## Test rapido

```bash
# Stesso device collegato a localhost via USB (chrome://inspect)
python3 -m http.server 8000
```

Test golden path:
1. Apri l'app → vedi card "Suggeriti" (se hai task FSM oggi)
2. Tap su card → form pre-compilato → inserisci ore → Salva
3. Riga appare in "Ore inserite" con totale aggiornato
4. Verifica in Odoo: Timesheet → riga draft per il dipendente

Test offline:
1. DevTools → Network → Offline
2. Crea/modifica/elimina riga → badge "N in coda" appare in alto
3. Network → Online → sync automatico, badge sparisce

## Revoca accesso

Per disabilitare un'app già installata:
1. Cambia `Token PWA` in Odoo Settings
2. Aggiorna il secret `PWA_TOKEN` su GitHub → trigger workflow `deploy`
3. Le app vecchie con token precedente daranno 401 al prossimo invio
