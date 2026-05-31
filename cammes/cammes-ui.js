/* ==========================================================================
   CAMMES — UI helpers condivisi tra le 4 pagine
   Theme toggle, toast, scan progress, SVG gauge, rich tooltips, ETA tracker.
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
    document.dispatchEvent(new CustomEvent('cammes:theme:change', { detail: { theme: next } }));
  }
  window.cammesToggleTheme = toggleTheme;

  // Helper: legge una CSS custom property dal :root (utile per Chart.js v4
  // che vuole stringhe-colore esplicite — i grafici si aggiornano a tema
  // cambiato ascoltando l'evento 'cammes:theme:change').
  function getCssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  window.cammesGetCssVar = getCssVar;

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
  function setScanProgress(current, total, etaSec) {
    const fill = document.getElementById('scan-progress-fill');
    const pct  = document.getElementById('scan-progress-pct');
    const eta  = document.getElementById('scan-progress-eta');
    const wrap = document.getElementById('scan-progress-wrap');
    if (!fill || !pct) return;
    if (wrap) wrap.classList.add('active');
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
    const wrap = document.getElementById('scan-progress-wrap');
    if (wrap) wrap.classList.remove('active');
  }
  window.cammesScanProgress = { set: setScanProgress, reset: resetScanProgress };

  // -------- ETA TRACKER --------------------------------------------------
  // Stima tempo residuo di un loop. Usage:
  //   const eta = cammesEta.start(totalSteps);
  //   eta.tick(currentStep);  // returns secondsRemaining
  //   eta.stop();
  function createEtaTracker() {
    let t0 = null;
    let total = 0;
    let last = 0;
    return {
      start: function (totalSteps) {
        t0 = Date.now();
        total = totalSteps;
        last = 0;
        return this;
      },
      tick: function (current) {
        if (t0 == null || total <= 0 || current <= 0) return null;
        const elapsed = (Date.now() - t0) / 1000;
        const rate = current / elapsed; // steps/sec
        if (rate <= 0) return null;
        const remaining = (total - current) / rate;
        last = remaining;
        return remaining;
      },
      stop: function () {
        t0 = null;
        total = 0;
      },
      last: function () { return last; }
    };
  }
  window.cammesEta = { create: createEtaTracker };

  // -------- SVG GAUGE (race-telemetry style) -----------------------------
  // Sostituisce gauge.min.js del 2014. API:
  //   const g = cammesGauge.create('container-id', { min:0, max:25, unit:'mm',
  //                                                  decimals:2, majorTicks:10 });
  //   g.setValue(12.34);  // anima fino al valore
  //   g.destroy();
  //
  // Renderizza un SVG inline con:
  // - Arco di sfondo (270° da -135 a +135)
  // - Arco progressivo colorato (riempie proporzionale al valore)
  // - Tacche maggiori + minori
  // - Etichette numeriche maggiori
  // - Valore centrale grande (font mono)
  // - Tutti i colori da CSS variables → segue theme dark/light
  function polarToCart(cx, cy, r, angleDeg) {
    const rad = (angleDeg - 90) * Math.PI / 180.0;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function describeArc(cx, cy, r, startAngle, endAngle) {
    if (Math.abs(endAngle - startAngle) < 0.01) {
      // Arco zero: punto singolo (M senza L)
      const p = polarToCart(cx, cy, r, startAngle);
      return 'M ' + p.x + ' ' + p.y;
    }
    const start = polarToCart(cx, cy, r, endAngle);
    const end   = polarToCart(cx, cy, r, startAngle);
    const largeArcFlag = Math.abs(endAngle - startAngle) <= 180 ? '0' : '1';
    return [
      'M', start.x, start.y,
      'A', r, r, 0, largeArcFlag, 0, end.x, end.y
    ].join(' ');
  }

  function createGauge(containerId, opts) {
    const o = opts || {};
    const container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
    if (!container) return null;

    const min        = o.min ?? 0;
    const max        = o.max ?? 25;
    const size       = o.size ?? 260;
    const unit       = o.unit ?? '';
    const decimals   = o.decimals ?? 2;
    const majorTicks = o.majorTicks ?? 10;
    const minorTicksBetween = o.minorTicksBetween ?? 4;
    const startAng   = -135;
    const endAng     =  135;
    const totalArc   = endAng - startAng; // 270°

    const cx = size / 2;
    const cy = size / 2;
    const r  = size * 0.40;
    const rTickOuter = r;
    const rTickMajorInner = r * 0.86;
    const rTickMinorInner = r * 0.92;
    const rLabel = r * 0.72;

    // Build SVG
    const uid = 'g' + Math.random().toString(36).slice(2, 8);
    let ticksSvg = '';
    let labelsSvg = '';
    for (let i = 0; i <= majorTicks; i++) {
      const ang = startAng + (i / majorTicks) * totalArc;
      const p1 = polarToCart(cx, cy, rTickOuter, ang);
      const p2 = polarToCart(cx, cy, rTickMajorInner, ang);
      ticksSvg += `<line class="gauge-svg-tick-major" x1="${p1.x.toFixed(2)}" y1="${p1.y.toFixed(2)}" x2="${p2.x.toFixed(2)}" y2="${p2.y.toFixed(2)}" />`;
      // Label
      const labelVal = min + (i / majorTicks) * (max - min);
      const labelText = (max - min) % majorTicks === 0 ? labelVal.toFixed(0) : labelVal.toFixed(1);
      const pl = polarToCart(cx, cy, rLabel, ang);
      labelsSvg += `<text class="gauge-svg-label" x="${pl.x.toFixed(2)}" y="${(pl.y + 4).toFixed(2)}" text-anchor="middle">${labelText}</text>`;
      // Minor ticks
      if (i < majorTicks) {
        for (let j = 1; j <= minorTicksBetween; j++) {
          const angMinor = startAng + ((i + j / (minorTicksBetween + 1)) / majorTicks) * totalArc;
          const m1 = polarToCart(cx, cy, rTickOuter, angMinor);
          const m2 = polarToCart(cx, cy, rTickMinorInner, angMinor);
          ticksSvg += `<line class="gauge-svg-tick-minor" x1="${m1.x.toFixed(2)}" y1="${m1.y.toFixed(2)}" x2="${m2.x.toFixed(2)}" y2="${m2.y.toFixed(2)}" />`;
        }
      }
    }

    const bgArcPath = describeArc(cx, cy, r * 0.98, startAng, endAng);
    const valueArcPath = describeArc(cx, cy, r * 0.98, startAng, startAng);  // start empty

    container.innerHTML = `
      <svg class="gauge-svg" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" aria-label="Gauge ${unit}">
        <defs>
          <linearGradient id="${uid}-grad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%"   stop-color="var(--accent)"   />
            <stop offset="55%"  stop-color="var(--accent)"   />
            <stop offset="80%"  stop-color="var(--accent-2)" />
            <stop offset="100%" stop-color="var(--danger)"   />
          </linearGradient>
          <filter id="${uid}-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2.5" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <!-- Disco scuro centrale (effetto profondità) -->
        <circle class="gauge-svg-plate" cx="${cx}" cy="${cy}" r="${(r * 1.02).toFixed(2)}" />
        <!-- Arco di sfondo -->
        <path class="gauge-svg-arc-bg" d="${bgArcPath}" />
        <!-- Arco valore -->
        <path class="gauge-svg-arc-value" d="${valueArcPath}" stroke="url(#${uid}-grad)" filter="url(#${uid}-glow)" />
        <!-- Tacche -->
        <g class="gauge-svg-ticks">${ticksSvg}</g>
        <!-- Etichette tacche maggiori -->
        <g class="gauge-svg-labels">${labelsSvg}</g>
        <!-- Valore centrale -->
        <text class="gauge-svg-value" x="${cx}" y="${cy + 8}" text-anchor="middle">${(0).toFixed(decimals)}</text>
        <text class="gauge-svg-unit"  x="${cx}" y="${cy + 30}" text-anchor="middle">${unit}</text>
      </svg>
    `;

    const arcValueEl = container.querySelector('.gauge-svg-arc-value');
    const valueEl    = container.querySelector('.gauge-svg-value');

    function setValue(v) {
      const num = Number(v);
      const safe = isFinite(num) ? num : 0;
      const clamped = Math.max(min, Math.min(max, safe));
      const frac = (clamped - min) / (max - min);
      const ang = startAng + frac * totalArc;
      const d = describeArc(cx, cy, r * 0.98, startAng, ang);
      arcValueEl.setAttribute('d', d);
      if (valueEl) valueEl.textContent = isFinite(num) ? num.toFixed(decimals) : '--';
    }

    return {
      setValue: setValue,
      destroy: function () { container.innerHTML = ''; }
    };
  }
  window.cammesGauge = { create: createGauge };

  // -------- RICH TOOLTIPS (data-tip="...") -------------------------------
  // Inietta un tooltip floating per ogni elemento con attributo data-tip.
  // Posizionamento: sopra l'elemento, freccia in basso. Si chiude on
  // mouseleave/blur. Per attivare programmaticamente nuovi elementi
  // chiamare cammesTooltip.refresh().
  function ensureTooltipEl() {
    let tt = document.getElementById('cammes-tooltip');
    if (!tt) {
      tt = document.createElement('div');
      tt.id = 'cammes-tooltip';
      tt.className = 'cammes-tooltip';
      tt.setAttribute('role', 'tooltip');
      document.body.appendChild(tt);
    }
    return tt;
  }
  function positionTooltip(target, tt) {
    const rect = target.getBoundingClientRect();
    const ttRect = tt.getBoundingClientRect();
    // Default: sopra. Se non c'è spazio sopra, mettilo sotto.
    let top = rect.top - ttRect.height - 10;
    let placement = 'top';
    if (top < 8) {
      top = rect.bottom + 10;
      placement = 'bottom';
    }
    let left = rect.left + rect.width / 2 - ttRect.width / 2;
    // Mantieni nel viewport
    const margin = 8;
    if (left < margin) left = margin;
    if (left + ttRect.width > window.innerWidth - margin) left = window.innerWidth - ttRect.width - margin;
    tt.style.top  = (top + window.scrollY) + 'px';
    tt.style.left = (left + window.scrollX) + 'px';
    tt.setAttribute('data-placement', placement);
  }
  function bindTooltipEl(el) {
    if (el.__tipBound) return;
    el.__tipBound = true;
    const tt = ensureTooltipEl();
    el.addEventListener('mouseenter', function () {
      tt.innerHTML = el.getAttribute('data-tip');
      tt.classList.add('visible');
      // Devi aspettare che ttRect sia computato dopo il render
      requestAnimationFrame(function () { positionTooltip(el, tt); });
    });
    el.addEventListener('mouseleave', function () {
      tt.classList.remove('visible');
    });
    el.addEventListener('focus', function () {
      tt.innerHTML = el.getAttribute('data-tip');
      tt.classList.add('visible');
      requestAnimationFrame(function () { positionTooltip(el, tt); });
    });
    el.addEventListener('blur', function () {
      tt.classList.remove('visible');
    });
  }
  function refreshTooltips() {
    const els = document.querySelectorAll('[data-tip]');
    for (let i = 0; i < els.length; i++) bindTooltipEl(els[i]);
  }
  window.cammesTooltip = { refresh: refreshTooltips };

  // -------- ONBOARDING WIZARD -------------------------------------------
  // Modal a step. Mostrato automaticamente al primo accesso (flag in
  // localStorage). Riapribile manualmente da un bottone "?" globale.
  const WIZARD_KEY = 'cammes-onboarded-v1';
  const WIZARD_STEPS = [
    {
      title: 'Benvenuto in CAMMES',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
      body: 'Sistema completo di misura, confronto e analisi di alberi a camme.<br><br>L\'hardware ' +
            '(stepper + comparatore + encoder) scansiona automaticamente il profilo a 360&deg;; ' +
            'il software calcola durata, LSA, forze inerziali e RPM critico.<br><br>' +
            'Questa guida mostra il flusso di lavoro tipico. Premi <kbd>?</kbd> in alto a destra per riaprirla.'
    },
    {
      title: '1. Acquisisci il profilo',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l3-9 4 18 3-9h4"/></svg>',
      body: 'Vai su <b>Alzata</b> (cartesiana) o <b>Polare</b> (curva).<br><br>' +
            '&bull; Seleziona la <b>modalit&agrave; di scansione</b> (Veloce per stradale, Race per camme da pista, ' +
            'Atomic per studi metrologici).<br>' +
            '&bull; Premi <b>START</b>: il motore ruota 360&deg; e registra l\'alzata grado per grado.<br>' +
            '&bull; A fine scansione, scrivi il <b>nome file</b> e premi <b>Salva</b> (auto-suffisso _alz o _pol).'
    },
    {
      title: '2. Zero virtuale (opzionale)',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>',
      body: 'Il bottone <b>Zero virtuale</b> esegue una scansione, trova il picco di alzata e ' +
            'ruota il motore di +180&deg; rispetto al picco.<br><br>' +
            'In questo modo il riferimento angolare &egrave; lo stesso per ogni albero, indipendentemente ' +
            'da come l\'hai montato fisicamente. Utile per <b>confrontare</b> profili di alberi diversi.'
    },
    {
      title: '3. Confronta + analizza',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/></svg>',
      body: '<b>Confronto</b>: sovrapponi fino a 4 file scansionati (ripetibilit&agrave;, prima/dopo usura, ' +
            'camme diverse).<br><br>' +
            '<b>Analisi</b>: importa la coppia <b>asp.</b> + <b>scar.</b>, inserisci parametri reali del motore ' +
            '(angolo lobo, gioco valvola, RPM, molla, massa eq.) e premi <b>Analizza</b>. ' +
            'Ottieni durata, LSA, velocit&agrave;/accelerazione, forze, RPM critico, esportabili in CSV/PDF.'
    },
    {
      title: 'Suggerimenti finali',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/></svg>',
      body: '&bull; Passa il mouse sul <b>?</b> accanto a un parametro per la spiegazione e i <b>valori tipici</b>.<br>' +
            '&bull; Il <b>tema chiaro/scuro</b> si cambia col bottone sole/luna in header (salvato in localStorage).<br>' +
            '&bull; I file <code>.scr</code> salvati vanno nella cartella <code>prove/</code> sul server.<br>' +
            '&bull; Se il sensore d&agrave; <b>NaN</b> per 3 letture consecutive, la scansione si ferma automaticamente.<br><br>' +
            'Buon lavoro! &#x1F527;'
    }
  ];

  function buildWizard() {
    const back = document.createElement('div');
    back.className = 'cammes-wizard-backdrop';
    back.innerHTML =
      '<div class="cammes-wizard">' +
      '  <button class="cammes-wizard-close" aria-label="Chiudi">&times;</button>' +
      '  <div class="cammes-wizard-icon"></div>' +
      '  <h2 class="cammes-wizard-title"></h2>' +
      '  <div class="cammes-wizard-body"></div>' +
      '  <div class="cammes-wizard-dots"></div>' +
      '  <div class="cammes-wizard-nav">' +
      '    <button class="btn btn-secondary cammes-wizard-prev">Indietro</button>' +
      '    <button class="btn btn-accent cammes-wizard-next">Avanti</button>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(back);
    return back;
  }

  function showWizard() {
    let back = document.querySelector('.cammes-wizard-backdrop');
    if (!back) back = buildWizard();

    const iconEl  = back.querySelector('.cammes-wizard-icon');
    const titleEl = back.querySelector('.cammes-wizard-title');
    const bodyEl  = back.querySelector('.cammes-wizard-body');
    const dotsEl  = back.querySelector('.cammes-wizard-dots');
    const prevBtn = back.querySelector('.cammes-wizard-prev');
    const nextBtn = back.querySelector('.cammes-wizard-next');
    const closeBtn = back.querySelector('.cammes-wizard-close');

    let idx = 0;
    function render() {
      const s = WIZARD_STEPS[idx];
      iconEl.innerHTML = s.icon;
      titleEl.textContent = s.title;
      bodyEl.innerHTML = s.body;
      dotsEl.innerHTML = WIZARD_STEPS.map((_, i) =>
        '<span class="cammes-wizard-dot' + (i === idx ? ' active' : '') + '"></span>').join('');
      prevBtn.disabled = idx === 0;
      nextBtn.textContent = (idx === WIZARD_STEPS.length - 1) ? 'Inizia ✓' : 'Avanti';
    }
    function close() {
      back.classList.remove('visible');
      try { localStorage.setItem(WIZARD_KEY, '1'); } catch (e) {}
      setTimeout(() => back.remove(), 220);
    }

    prevBtn.onclick = () => { if (idx > 0) { idx--; render(); } };
    nextBtn.onclick = () => {
      if (idx < WIZARD_STEPS.length - 1) { idx++; render(); }
      else close();
    };
    // Listener keydown salvato come variabile così possiamo rimuoverlo
    // immediatamente alla chiusura (evita accumulo su open/close ripetuti).
    function onKey(e) {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') nextBtn.click();
      else if (e.key === 'ArrowLeft') prevBtn.click();
    }
    document.addEventListener('keydown', onKey);

    var origClose = close;
    // Monkey-patch intenzionale: avvolge close() per rimuovere il listener
    // keydown alla chiusura. La riassegnazione della funzione è voluta.
    // eslint-disable-next-line no-func-assign
    close = function () {
      document.removeEventListener('keydown', onKey);
      origClose();
    };
    closeBtn.onclick = close;
    back.onclick = (e) => { if (e.target === back) close(); };

    render();
    requestAnimationFrame(() => back.classList.add('visible'));
  }

  function showWizardIfFirstTime() {
    let seen = null;
    try { seen = localStorage.getItem(WIZARD_KEY); } catch (e) {}
    if (!seen) {
      // Delay un attimo per non sovrapporsi all'init del WebSocket
      setTimeout(showWizard, 600);
    }
  }

  function resetWizardFlag() {
    try { localStorage.removeItem(WIZARD_KEY); } catch (e) {}
  }
  window.cammesWizard = { show: showWizard, showIfFirstTime: showWizardIfFirstTime, reset: resetWizardFlag };

  // -------- VALIDATION HELPERS ------------------------------------------
  // Marca un input come errato/ok con styling + (opzionale) messaggio toast.
  function markInputError(el, msg) {
    if (!el) return;
    el.classList.add('input-error');
    el.setAttribute('aria-invalid', 'true');
    if (msg) showToast({ kind: 'err', title: 'Attenzione', body: msg, duration: 3000 });
    setTimeout(function () {
      el.classList.remove('input-error');
      el.removeAttribute('aria-invalid');
    }, 2400);
    if (typeof el.focus === 'function') el.focus();
  }
  window.cammesValidate = { error: markInputError };

  // -------- GUIDED TOUR (coachmark per-pagina) ---------------------------
  // Tour on-demand che evidenzia i controlli reali della pagina corrente, uno
  // alla volta (oltre al wizard di benvenuto, che resta testuale/automatico).
  var TOUR_KEY = 'cammes-tour-done-v1';

  function getCurrentPage() {
    var t = document.title || '';
    if (/Home/i.test(t))      return 'home';
    if (/Alzata/i.test(t))    return 'alzata';
    if (/Polare/i.test(t))    return 'polare';
    if (/Confronto/i.test(t)) return 'grafici';
    if (/Analisi/i.test(t))   return 'analisi';
    return null;
  }
  window.cammesGetCurrentPage = getCurrentPage;

  // Step per pagina: { sel: selettore, title, body }. Gli step il cui
  // selettore non esiste sulla pagina vengono saltati automaticamente.
  var TOUR_STEPS = {
    home: [
      { sel: '.home-tiles',     title: 'Le 4 sezioni', body: 'Da qui entri in <b>Alzata</b>, <b>Polare</b>, <b>Confronto</b> e <b>Analisi</b>. È il punto di partenza.' },
      { sel: '#homeStats',      title: 'Stato archivio', body: 'Quante misure hai salvato e qual è l\'ultima. Un colpo d\'occhio sui dati.' },
      { sel: '#recentsSearch',  title: 'Cerca e filtra', body: 'Trova le misure per nome; sotto puoi filtrare per tipo, data e tag.' },
      { sel: '#concert-toggle', title: 'Concerto col motore', body: 'Un extra: fai &ldquo;suonare&rdquo; lo stepper con brani famosi. 🎵' }
    ],
    alzata: [
      { sel: '#scanMode',  title: 'Modalità scansione', body: 'Scegli la precisione: da <b>Veloce</b> (~1 min) ad <b>Atomic</b> (massima risoluzione). Il tempo stimato è indicato.' },
      { sel: 'button[onclick^="start"]', title: 'Avvia', body: 'START esegue una scansione completa 360° del profilo di alzata.' },
      { sel: '#msBtn',     title: 'Zero virtuale', body: 'Porta in automatico il picco di alzata a un riferimento fisso (+180°), così alberi montati diversamente restano confrontabili.' },
      { sel: '#freeBtn',   title: 'Sblocca motore', body: 'Libera l\'albero per girarlo a mano leggendo encoder e comparatore dal vivo.' },
      { sel: '#nome',      title: 'Salva', body: 'Dai un nome e salva: il suffisso <code>_alz</code> è aggiunto in automatico.' }
    ],
    polare: [
      { sel: 'input[id="diam"], #diam', title: 'Diametro a riposo', body: 'Inserisci il diametro base dell\'albero: il profilo polare lo usa come riferimento.' },
      { sel: 'button[onclick^="start"]', title: 'Avvia', body: 'START esegue la scansione polare 360°.' },
      { sel: '#freeBtn',   title: 'Sblocca motore', body: 'Come in Alzata: gira l\'albero a mano leggendo i sensori dal vivo.' }
    ],
    grafici: [
      { sel: '#fileinput1', title: 'Carica i profili', body: 'Scegli fino a 4 file <code>_alz</code>/<code>_pol</code>: le curve si sovrappongono nel grafico.' },
      { sel: '#viewMode',   title: 'Sovrapposto / Differenza', body: 'Confronta le curve sovrapposte oppure mostra la differenza (con statistiche max/media/RMSE).' },
      { sel: '#replayBtn',  title: 'Replay', body: 'Ridisegna le curve da 0° a 360° per un confronto animato.' }
    ],
    analisi: [
      { sel: '#modeBaseBtn',       title: 'Base / Avanzato', body: 'In <b>Base</b> vedi solo l\'essenziale; <b>Avanzato</b> mostra follower, compliance e strumenti race.' },
      { sel: '#fileIntake',        title: 'Importa la camma', body: 'Carica i file di aspirazione e scarico, poi premi Analizza.' },
      { sel: 'button[onclick^="analyze"]', title: 'Analizza', body: 'Calcola durata, LSA, alzata, velocità/accelerazione, forze e RPM critico.' },
      { sel: '#complianceEnabled', title: 'Compliance (race)', body: 'Simulazione dinamica del treno valvole: valve float, bounce, modelli 1/2/3-DOF.' },
      { sel: '#surgeEnabled',      title: 'Surge molla', body: 'Modella la molla a massa distribuita per stimare la <b>risonanza delle spire</b> ad alto regime.' }
    ]
  };

  var _tour = null;   // { steps, idx, els:{backdrop,hole,pop} }

  function _ensureTourStyle() {
    if (document.getElementById('cammes-tour-style')) return;
    var st = document.createElement('style');
    st.id = 'cammes-tour-style';
    st.textContent =
      '.cammes-tour-backdrop{position:fixed;inset:0;z-index:950;background:transparent;}' +
      '.cammes-tour-hole{position:fixed;border-radius:8px;border:2px solid var(--accent,#00d4ff);' +
        'box-shadow:0 0 0 9999px rgba(7,9,13,0.72),0 0 14px var(--accent,#00d4ff);' +
        'transition:top .2s,left .2s,width .2s,height .2s;pointer-events:none;z-index:951;}' +
      '.cammes-tour-pop{position:fixed;z-index:952;max-width:300px;background:var(--bg-elev-2,#1a1a2e);' +
        'border:1px solid var(--border-strong,#2a2a4a);border-radius:10px;padding:14px 16px;' +
        'box-shadow:0 10px 34px rgba(0,0,0,.55);color:var(--text-primary,#e8e8f0);' +
        'font-family:var(--font-sans,system-ui,sans-serif);font-size:13px;line-height:1.5;}' +
      '.cammes-tour-pop h4{margin:0 0 6px;font-family:var(--font-display,inherit);font-size:15px;' +
        'color:var(--accent,#00d4ff);}' +
      '.cammes-tour-pop code{font-family:var(--font-mono,monospace);background:var(--bg-input,#12121f);' +
        'color:var(--accent-2,#7df);padding:1px 5px;border-radius:3px;}' +
      '.cammes-tour-nav{display:flex;justify-content:space-between;align-items:center;margin-top:12px;gap:8px;}' +
      '.cammes-tour-nav .step{font-size:11px;color:var(--text-muted,#8888aa);}' +
      '.cammes-tour-nav button{font-family:inherit;font-size:12px;padding:5px 12px;border-radius:6px;' +
        'border:1px solid var(--border-card,#2a2a4a);background:var(--bg-input,#12121f);' +
        'color:var(--text-primary,#e8e8f0);cursor:pointer;}' +
      '.cammes-tour-nav button.primary{background:var(--accent,#00d4ff);color:#06121a;border-color:transparent;font-weight:bold;}';
    document.head.appendChild(st);
  }

  function _tourCleanup(completed) {
    if (!_tour) return;
    window.removeEventListener('resize', _tourReposition);
    window.removeEventListener('scroll', _tourReposition, true);
    document.removeEventListener('keydown', _tourKey);
    ['backdrop', 'hole', 'pop'].forEach(function (k) {
      if (_tour.els[k] && _tour.els[k].parentNode) _tour.els[k].parentNode.removeChild(_tour.els[k]);
    });
    _tour = null;
    if (completed) { try { localStorage.setItem(TOUR_KEY, '1'); } catch (e) {} }
  }

  function _tourKey(e) {
    if (!_tour) return;
    if (e.key === 'Escape') _tourCleanup(false);
    else if (e.key === 'ArrowRight') _tourGo(1);
    else if (e.key === 'ArrowLeft') _tourGo(-1);
  }

  function _tourReposition() {
    if (!_tour) return;
    var step = _tour.steps[_tour.idx];
    var el = step.el;
    var r = el.getBoundingClientRect();
    var pad = 6;
    var hole = _tour.els.hole, pop = _tour.els.pop;
    hole.style.top = (r.top - pad) + 'px';
    hole.style.left = (r.left - pad) + 'px';
    hole.style.width = (r.width + pad * 2) + 'px';
    hole.style.height = (r.height + pad * 2) + 'px';
    // posiziona il pop sotto, o sopra se non c'è spazio
    var popH = pop.offsetHeight || 140, popW = pop.offsetWidth || 300;
    var vw = window.innerWidth, vh = window.innerHeight;
    var top = r.bottom + 12;
    if (top + popH > vh - 8) top = Math.max(8, r.top - popH - 12);
    var left = Math.min(Math.max(8, r.left), vw - popW - 8);
    pop.style.top = top + 'px';
    pop.style.left = left + 'px';
  }

  function _tourRender() {
    var step = _tour.steps[_tour.idx];
    var el = step.el;
    if (el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    var last = _tour.idx === _tour.steps.length - 1;
    _tour.els.pop.innerHTML =
      '<h4></h4><div class="b"></div>' +
      '<div class="cammes-tour-nav"><span class="step"></span><span>' +
      '<button class="prev">Indietro</button> <button class="next primary"></button></span></div>';
    _tour.els.pop.querySelector('h4').textContent = step.title;
    _tour.els.pop.querySelector('.b').innerHTML = step.body;
    _tour.els.pop.querySelector('.step').textContent = (_tour.idx + 1) + ' / ' + _tour.steps.length;
    var prevBtn = _tour.els.pop.querySelector('.prev');
    var nextBtn = _tour.els.pop.querySelector('.next');
    prevBtn.style.visibility = _tour.idx === 0 ? 'hidden' : 'visible';
    nextBtn.textContent = last ? 'Fine ✓' : 'Avanti';
    prevBtn.onclick = function () { _tourGo(-1); };
    nextBtn.onclick = function () { last ? _tourCleanup(true) : _tourGo(1); };
    // Posiziona subito (sincrono, non dipende da rAF) e di nuovo dopo che lo
    // scrollIntoView ha aggiornato i rect.
    _tourReposition();
    requestAnimationFrame(function () { setTimeout(_tourReposition, 60); });
    setTimeout(_tourReposition, 120);
  }

  function _tourGo(delta) {
    if (!_tour) return;
    var n = _tour.idx + delta;
    if (n < 0 || n >= _tour.steps.length) return;
    _tour.idx = n;
    _tourRender();
  }

  function startTour() {
    if (_tour) return;
    var page = getCurrentPage();
    var defs = (page && TOUR_STEPS[page]) || [];
    // risolvi i selettori, salta quelli assenti
    var steps = [];
    defs.forEach(function (s) {
      var el = null;
      try { el = document.querySelector(s.sel); } catch (e) {}
      if (el && el.offsetParent !== null) steps.push({ el: el, title: s.title, body: s.body });
    });
    if (!steps.length) {
      showToast({ kind: 'info', title: 'Tour non disponibile', body: 'Nessun elemento da mostrare su questa pagina.', duration: 3000 });
      return;
    }
    _ensureTourStyle();
    var backdrop = document.createElement('div'); backdrop.className = 'cammes-tour-backdrop';
    backdrop.addEventListener('click', function () { _tourCleanup(false); });
    var hole = document.createElement('div'); hole.className = 'cammes-tour-hole';
    var pop = document.createElement('div'); pop.className = 'cammes-tour-pop';
    document.body.appendChild(backdrop);
    document.body.appendChild(hole);
    document.body.appendChild(pop);
    _tour = { steps: steps, idx: 0, els: { backdrop: backdrop, hole: hole, pop: pop } };
    window.addEventListener('resize', _tourReposition);
    window.addEventListener('scroll', _tourReposition, true);
    document.addEventListener('keydown', _tourKey);
    _tourRender();
  }
  window.cammesTour = { start: startTour };

  // -------- INIT al DOM ready --------------------------------------------
  function init() {
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.addEventListener('click', toggleTheme);
    const helpBtn = document.getElementById('help-toggle');
    if (helpBtn) {
      helpBtn.addEventListener('click', showWizard);
      // Inietta il bottone Tour accanto al "?" (solo sulle pagine note),
      // così non serve modificare i 5 HTML.
      if (getCurrentPage() && !document.getElementById('tour-toggle')) {
        var tb = document.createElement('button');
        tb.id = 'tour-toggle';
        tb.type = 'button';
        tb.className = helpBtn.className;
        tb.title = 'Tour guidato della pagina';
        tb.setAttribute('aria-label', 'Tour guidato');
        tb.textContent = '🗺';
        tb.addEventListener('click', startTour);
        helpBtn.parentNode.insertBefore(tb, helpBtn);
      }
    }
    refreshTooltips();
    showWizardIfFirstTime();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
