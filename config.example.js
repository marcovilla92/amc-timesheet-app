// config.example.js — TEMPLATE per uso locale (development).
// Copia in config.js (gitignored) e inserisci i valori reali.
//
// Per produzione, NON committare config.js: il deploy GitHub Actions
// genera config.js da config.template.js usando secrets.

const CONFIG = {
    // URL base di Odoo (no trailing slash)
    ODOO_URL: 'https://amc-system.odoo.com',

    // Token condiviso con Odoo. Generalo in Settings → Rapportino AMC → PWA Timesheet.
    PWA_TOKEN: 'INSERIRE_TOKEN_REALE_QUI',

    // Etichetta dipendente (mostrata nella UI, opzionale)
    EMPLOYEE_LABEL: 'Tecnico',
};
