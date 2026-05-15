/* ==========================================================================
   CAMMES — UI helpers condivisi tra le 4 pagine
   Theme toggle, toast notifications, scan progress bar.
   ========================================================================== */

(function () {
  'use strict';

  // -------- THEME (dark/light) -------------------------------------------
  const THEME_KEY = 'cammes-theme';

  function getStoredTheme() {
    try { return localStorage.getItem(THEME_KEY); } catch (e) { return null; }
  }
  function setStoredTheme(t) {
    try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
  }
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
  }

  // Applica subito (prima del render delle pagine) per evitare flash of unstyled
  const initialTheme = getStoredTheme() || 'dark';
  applyTheme(initialTheme);

  function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = cur === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setStoredTheme(next);
  }
  window.cammesToggleTheme = toggleTheme;

  // -------- TOAST NOTIFICATIONS ------------------------------------------
  function ensureToastStack() {
    let stack = document.getElementById('toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.id = 'toast-stack';
      stack.className = 'toast-stack';
      document.body.appendChild(stack);
    }
    return stack;
  }

  const TOAST_ICONS = {
    success: '<svg class="toast-icon success" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    warn:    '<svg class="toast-icon warn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    err:     '<svg class="toast-icon err" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    info:    '<svg class="toast-icon info" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
  };

  function showToast(opts) {
    const o = typeof opts === 'string' ? { body: opts } : (opts || {});
    const kind = o.kind || o.type || 'info';
    const title = o.title || '';
    const body = o.body || '';
    const ttl = o.duration || 4000;

    const stack = ensureToastStack();
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.innerHTML = (TOAST_ICONS[kind] || TOAST_ICONS.info) +
      '<div class="toast-body">' +
      (title ? '<div class="toast-title">' + title + '</div>' : '') +
      '<div>' + body + '</div>' +
      '</div>';
    stack.appendChild(el);

    setTimeout(() => {
      el.style.transition = 'opacity 200ms, transform 200ms';
      el.style.opacity = '0';
      el.style.transform = 'translateX(20px)';
      setTimeout(() => el.remove(), 220);
    }, ttl);
  }
  window.cammesToast = showToast;

  // -------- SCAN PROGRESS BAR --------------------------------------------
  // Helper per aggiornare una barra di progresso e tempo stimato per la
  // scansione corrente. Chiama setScanProgress(current, total, etaSec) durante
  // il loop; resetScanProgress() quando finisce o si stoppa.
  function setScanProgress(current, total, etaSec) {
    const fill = document.getElementById('scan-progress-fill');
    const pct  = document.getElementById('scan-progress-pct');
    const eta  = document.getElementById('scan-progress-eta');
    if (!fill || !pct) return;
    const p = Math.max(0, Math.min(100, total > 0 ? (current / total) * 100 : 0));
    fill.style.width = p.toFixed(1) + '%';
    pct.textContent = p.toFixed(0) + '%';
    if (eta) {
      if (etaSec == null || !isFinite(etaSec)) eta.textContent = '';
      else if (etaSec < 60) eta.textContent = '~' + Math.ceil(etaSec) + 's';
      else eta.textContent = '~' + Math.floor(etaSec / 60) + 'm ' + Math.round(etaSec % 60) + 's';
    }
  }
  function resetScanProgress() {
    setScanProgress(0, 1, null);
    const eta = document.getElementById('scan-progress-eta');
    if (eta) eta.textContent = '';
  }
  window.cammesScanProgress = { set: setScanProgress, reset: resetScanProgress };

  // -------- INIT al DOM ready --------------------------------------------
  function init() {
    // Wire del bottone toggle theme se presente nel DOM
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.addEventListener('click', toggleTheme);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
