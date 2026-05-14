// config.template.js — TEMPLATE compilato da GitHub Actions in config.js
// I placeholder __PWA_TOKEN__ e __ODOO_BASE_URL__ vengono sostituiti dai
// secrets/vars del repo (vedi .github/workflows/deploy.yml).
//
// NON modificare manualmente — modifica i secrets su GitHub invece.

const CONFIG = {
    ODOO_URL: '__ODOO_BASE_URL__',
    PWA_TOKEN: '__PWA_TOKEN__',
    EMPLOYEE_LABEL: '__EMPLOYEE_LABEL__',
};
