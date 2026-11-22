/* ==========================================================================
   CAMMES — UI helpers condivisi tra le 4 pagine
   Theme toggle, toast, scan progress, SVG gauge, rich tooltips, ETA tracker.
   ========================================================================== */

(function () {
  'use strict';

  // -------- VERSIONE ------------------------------------------------------
  // Unico punto di verità della versione mostrata nella UI (badge in basso a
  // destra su ogni pagina). Allineala a package.json/tag quando rilasci.
  var CAMMES_VERSION = 'v3.8.0';
  window.CAMMES_VERSION = CAMMES_VERSION;

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
  // Helper: legge una CSS custom property dal :root (utile per Chart.js v4
  // che vuole stringhe-colore esplicite — i grafici si aggiornano a tema
  // cambiato ascoltando l'evento 'cammes:theme:change').
  function getCssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  window.cammesGetCssVar = getCssVar;

  // -------- ESCAPE HTML (canonico) ----------------------------------------
  // Escape canonico per i contenuti utente (nomi file, tag, label) destinati
  // a innerHTML — incluso il body/title dei toast. showToast NON lo applica
  // da sé: i chiamanti passano spesso HTML voluto (grassetti, entità, link),
  // quindi è responsabilità del chiamante escapare con cammesEscape() le sole
  // parti non fidate prima di comporre la stringa.
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  window.cammesEscape = escapeHtml;

  // -------- TOAST NOTIFICATIONS ------------------------------------------
  // In basso a destra (in Analisi a sinistra): in alto coprivano il pannello
  // dei parametri di Analisi e la barra dei comandi di Alzata. Al massimo
  // TOAST_MAX a vista; quelle che non ci stanno restano nel registro
  // "Messaggi" e la pila lo dice con un pulsante "+N messaggi" che lo apre
  // (e che se ne va con l'ultima notifica a vista).
  var TOAST_MAX = 3;
  // Chi lascia il posto quando sono troppe: prima le conferme, poi le
  // informazioni; un errore non lascia mai il posto a una conferma.
  var TOAST_GRAVITA = { success: 0, info: 1, warn: 2, err: 3 };
  var toastNonMostrati = 0;

  function gravitaDi(kind) {
    return Object.prototype.hasOwnProperty.call(TOAST_GRAVITA, kind) ? TOAST_GRAVITA[kind] : 1;
  }

  // Tempo di lettura: 4 s piu' 1 s ogni 15 caratteri di titolo e testo, al
  // massimo 12 s. Una durata indicata da chi chiama vale come minimo: se il
  // testo e' lungo resta a vista il tempo per leggerlo. 0 vuol dire "resta
  // finche' non la chiudi".
  function durataToast(durata, titolo, testo) {
    var n = String((titolo || '') + ' ' + (testo || ''))
      .replace(/<[^>]*>/g, '')
      .replace(/&[#a-z0-9]+;/gi, 'x')
      .replace(/\s+/g, ' ').trim().length;
    var lettura = Math.min(12000, 4000 + Math.round(n / 15) * 1000);
    if (durata == null) return lettura;
    var d = Number(durata) || 0;
    return d > 0 ? Math.max(d, lettura) : 0;
  }

  // Chi lascia il posto quando a vista sono piu' di "massimo". L'elenco delle
  // gravita' e' in ordine di arrivo e l'ultima e' la notifica nuova, che si
  // vede sempre (e' il riscontro di cio' che si e' appena fatto). Esce la
  // meno grave fra le precedenti, a pari gravita' la piu' vecchia, ma solo
  // se non e' piu' grave della nuova: una conferma non scalza un avviso o un
  // errore. In quel caso la nuova si aggiunge per il suo tempo come quarta,
  // non oltre. Ritorna l'indice da togliere, -1 se non esce nessuna.
  function toastDaTogliere(gravita, massimo) {
    var n = gravita.length;
    if (n <= massimo || n < 2) return -1;
    var nuova = gravita[n - 1], scelto = 0;
    for (var i = 1; i < n - 1; i++) if (gravita[i] < gravita[scelto]) scelto = i;
    if (gravita[scelto] > nuova && n <= massimo + 1) return -1;
    return scelto;
  }

  // In Analisi a destra c'e' il pannello dei parametri e, piu' giu', la
  // tabella dei risultati coi numeri a filo destro: la pila va in basso a
  // sinistra, sopra i grafici. Una pagina puo' scegliere il lato anche da
  // se' (--toast-destra, --toast-sinistra, --toast-allinea in style.css).
  var PILA_A_SINISTRA = { analisi: true };

  function ensureToastStack() {
    let stack = document.getElementById('toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.id = 'toast-stack';
      stack.className = 'toast-stack' + (PILA_A_SINISTRA[getCurrentPage()] ? ' pila-sinistra' : '');
      // audit APP-13: live region cosi' gli screen reader annunciano i toast.
      // aria-atomic=false: annuncia solo il nuovo toast, non l'intera pila.
      stack.setAttribute('role', 'status');
      stack.setAttribute('aria-live', 'polite');
      stack.setAttribute('aria-atomic', 'false');
      document.body.appendChild(stack);
      // una barra in basso puo' attaccarsi o staccarsi scorrendo la pagina
      window.addEventListener('scroll', riposizionaPilaPresto, { passive: true });
      window.addEventListener('resize', riposizionaPilaPresto);
    }
    return stack;
  }

  const TOAST_ICONS = {
    success: '<svg class="toast-icon success" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    warn:    '<svg class="toast-icon warn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    err:     '<svg class="toast-icon err" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    info:    '<svg class="toast-icon info" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
  };

  function toastAVista(stack) {
    var out = [];
    for (var i = 0; i < stack.children.length; i++) {
      var c = stack.children[i];
      if (c.classList && c.classList.contains('toast') && !c.classList.contains('toast-uscita')) out.push(c);
    }
    return out;
  }
  function staccaToast(el) {
    if (el.__timer) { clearTimeout(el.__timer); el.__timer = null; }
    const stack = el.parentNode;
    if (stack) stack.removeChild(el);
    // sparite tutte, sparisce anche "+N messaggi": il conto dei non letti
    // resta sul numerino di Messaggi
    if (stack && stack.id === 'toast-stack' && toastNonMostrati > 0 && !toastAVista(stack).length) {
      toastNonMostrati = 0;
      aggiornaToastAltri(stack);
    }
  }
  function svanisciToast(el) {
    el.__timer = null;
    if (!el.classList) { staccaToast(el); return; }
    el.classList.add('toast-uscita');   // non conta piu' fra quelle a vista
    const aSinistra = !!(el.parentNode && el.parentNode.classList && el.parentNode.classList.contains('pila-sinistra'));
    el.style.transition = 'opacity 200ms, transform 200ms';
    el.style.opacity = '0';
    el.style.transform = 'translateX(' + (aSinistra ? -20 : 20) + 'px)';
    setTimeout(function () { staccaToast(el); }, 220);
  }
  // Se sotto la pila c'e' una barra appiccicata al fondo dello schermo
  // (Analizza in Analisi, la barra delle misure spuntate in Home), la pila
  // sale sopra di essa: le notifiche non coprono i comandi. Si guarda solo
  // sotto la pila vera, a destra o a sinistra dove la mette la pagina.
  // Ritorna la distanza dal fondo da lasciare libera (0 = nessuna barra).
  function spazioBarraInBasso(stack) {
    if (!stack || !document.elementsFromPoint || typeof getComputedStyle !== 'function') return 0;
    const pila = stack.getBoundingClientRect();
    if (!pila || !(pila.right > pila.left)) return 0;   // pila vuota: niente da spostare
    const altezza = window.innerHeight, y = altezza - 30;
    let lift = 0;
    // tre punti lungo la larghezza della pila
    [pila.left + 12, (pila.left + pila.right) / 2, pila.right - 12].forEach(function (x) {
      const sotto = document.elementsFromPoint(x, y) || [];
      for (let i = 0; i < sotto.length && i < 12; i++) {
        for (let e = sotto[i], d = 0; e && e.nodeType === 1 && d < 8; e = e.parentElement, d++) {
          if (e.id === 'toast-stack') break;          // la pila non misura se stessa
          const pos = getComputedStyle(e).position;
          if (pos !== 'sticky' && pos !== 'fixed') continue;
          const r = e.getBoundingClientRect();
          if (r.bottom >= altezza - 40 && r.top > altezza / 2) lift = Math.max(lift, Math.round(altezza - r.top + 10));
          break;
        }
      }
    });
    return lift;
  }
  function posizionaPila(stack) {
    let lift = 0;
    try { lift = spazioBarraInBasso(stack); } catch (e) {}
    // senza barra resta la posizione del foglio di stile (--toast-bottom)
    stack.style.bottom = lift > 0 ? lift + 'px' : '';
  }
  let _pilaInAttesa = false;
  function riposizionaPilaPresto() {
    const stack = document.getElementById('toast-stack');
    if (!stack || _pilaInAttesa || !toastAVista(stack).length) return;
    _pilaInAttesa = true;
    requestAnimationFrame(function () { _pilaInAttesa = false; posizionaPila(stack); });
  }

  // "+N messaggi": notifiche tolte dalla pila per far posto, ancora da
  // rileggere. Apre il registro, che le ha tutte.
  function aggiornaToastAltri(stack) {
    var b = document.getElementById('toast-altri');
    if (toastNonMostrati <= 0) {
      if (b && b.parentNode) b.parentNode.removeChild(b);
      return;
    }
    if (!stack) stack = ensureToastStack();
    if (!b) {
      b = document.createElement('button');
      b.type = 'button';
      b.id = 'toast-altri';
      b.className = 'toast-altri';
      b.addEventListener('click', function () { apriMsgLog(); });
    }
    b.textContent = '+' + toastNonMostrati + (toastNonMostrati === 1 ? ' messaggio' : ' messaggi');
    b.setAttribute('aria-label', 'Apri i messaggi che non stanno sullo schermo: ' + toastNonMostrati);
    if (stack.firstChild !== b) stack.insertBefore(b, stack.firstChild);
  }

  function showToast(opts) {
    const o = typeof opts === 'string' ? { body: opts } : (opts || {});
    const kind = o.kind || o.type || 'info';
    const title = o.title || '';
    const body = o.body || '';
    const ttl = durataToast(o.duration, title, body);

    const stack = ensureToastStack();
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.__gravita = gravitaDi(kind);
    el.innerHTML = (TOAST_ICONS[kind] || TOAST_ICONS.info) +
      '<div class="toast-body">' +
      (title ? '<div class="toast-title">' + title + '</div>' : '') +
      '<div>' + body + '</div>' +
      '</div>';
    const chiudi = document.createElement('button');
    chiudi.type = 'button';
    chiudi.className = 'toast-close';
    chiudi.setAttribute('aria-label', 'Chiudi messaggio');
    chiudi.innerHTML = '&times;';
    chiudi.addEventListener('click', function () { staccaToast(el); });
    el.appendChild(chiudi);
    stack.appendChild(el);
    // Una sola analisi puo' generare 7 messaggi. Oltre TOAST_MAX lascia il
    // posto la meno grave fra le precedenti (regole in toastDaTogliere): la
    // tolta resta nel registro.
    const aVista = toastAVista(stack);
    const pannello = document.getElementById('msglog-panel');
    const registroAperto = !!(pannello && pannello.classList.contains('visible'));
    let i;
    while ((i = toastDaTogliere(aVista.map(function (t) { return t.__gravita; }), TOAST_MAX)) >= 0) {
      staccaToast(aVista[i]);
      aVista.splice(i, 1);
      // col registro aperto quelle notifiche si leggono gia' li'
      if (!registroAperto) toastNonMostrati++;
    }
    aggiornaToastAltri(stack);
    // la pila misurata con la notifica nuova dentro (larghezza e lato veri)
    posizionaPila(stack);

    if (ttl > 0 && el.parentNode) {
      el.__timer = setTimeout(function () { svanisciToast(el); }, ttl);
    }

    // P2-06: opts.analisi e' l'id dell'analisi FOTOGRAFATO da chi programma il
    // messaggio. I toast immediati non lo passano e va bene: appartengono
    // all'analisi corrente. Quelli ritardati devono passarlo, altrimenti
    // finirebbero attribuiti all'analisi successiva.
    recordMessage(kind, title, body, (opts && typeof opts.analisi === 'number') ? opts.analisi : null);
  }
  // Regole esposte per i controlli automatici (tools/test_usabilita_comune.js).
  showToast.durata = durataToast;
  showToast.daTogliere = toastDaTogliere;
  showToast.massimo = TOAST_MAX;
  window.cammesToast = showToast;

  // -------- REGISTRO MESSAGGI --------------------------------------------
  // I toast sparivano dopo 4-9 s e i verdetti (LSA, RPM critico, valve float,
  // avvisi di misura incompleta) andavano persi: l'utente non aveva modo di
  // rileggerli. Ogni messaggio finisce qui e resta consultabile dal pulsante
  // in alto (campanella) finche' la pagina e' aperta.
  const MSG_KEY = 'cammes-msglog-v1';
  const MSG_MAX = 150;
  // sessionStorage: il registro sopravvive al passaggio fra le pagine
  // (Analisi -> Home -> Analisi) ma si azzera chiudendo la scheda.
  const MSG_LOG = (function () {
    try { return JSON.parse(sessionStorage.getItem(MSG_KEY)) || []; } catch (e) { return []; }
  })();
  // AUDIT v3.4.3 P2-06: i non letti sopravvivono al cambio pagina.
  // Prima msgUnread ripartiva da 0 a ogni caricamento pur conservando il log:
  // si tornava su Analisi e la campanella diceva 0 con tre messaggi mai visti.
  const MSG_READ_KEY = MSG_KEY + '-read';
  let msgLastRead = (function () {
    try { return Number(sessionStorage.getItem(MSG_READ_KEY)) || 0; } catch (e) { return 0; }
  })();
  let msgSeq = MSG_LOG.reduce(function (m, v) { return Math.max(m, v.id || 0); }, 0);
  let msgUnread = MSG_LOG.filter(function (v) { return (v.id || 0) > msgLastRead; }).length;
  function persistMsgRead() {
    try { sessionStorage.setItem(MSG_READ_KEY, String(msgLastRead)); } catch (e) {}
  }

  function persistMsgLog() {
    try { sessionStorage.setItem(MSG_KEY, JSON.stringify(MSG_LOG)); } catch (e) {}
  }

  function recordMessage(kind, title, body, analisiId) {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    // P2-06: l'analisi di appartenenza NON si legge qui. Un toast ritardato
    // arriva a recordMessage anche 900 ms dopo, quando lastAnalysis puo' essere
    // gia' la successiva (o nulla dopo un Reset): leggerla ora attribuirebbe il
    // verdetto dell'analisi 1 all'analisi 2. Chi programma il messaggio passa
    // l'id che aveva al momento della programmazione, via opts.analisi.
    MSG_LOG.push({
      id: ++msgSeq, kind: kind, title: title, body: body,
      ora: hh + ':' + mm + ':' + ss, iso: d.toISOString(),
      pagina: (typeof getCurrentPage === 'function' ? getCurrentPage() : null) || null,
      analisi: (typeof analisiId === 'number' ? analisiId : null)
    });
    if (MSG_LOG.length > MSG_MAX) MSG_LOG.shift();
    persistMsgLog();
    const panel = document.getElementById('msglog-panel');
    if (panel && panel.classList.contains('visible')) {
      // letto mentre arriva: non deve colorare il numerino dopo
      msgLastRead = msgSeq; persistMsgRead();
      renderMsgLog();
    }
    else { msgUnread++; updateMsgBadge(); }
  }

  // Il numerino della campanella prende il colore del messaggio piu' grave
  // non letto: rosso solo se c'e' un errore, giallo per un avviso, neutro per
  // conferme e informazioni. Prima era sempre rosso e contava anche
  // "Scansione avviata": acceso sempre, non segnalava piu' niente.
  function gravitaNonLetti() {
    var g = -1;
    for (var i = MSG_LOG.length - 1; i >= 0; i--) {
      if ((MSG_LOG[i].id || 0) <= msgLastRead) break;
      g = Math.max(g, gravitaDi(MSG_LOG[i].kind));
    }
    return g;
  }
  function updateMsgBadge() {
    const b = document.getElementById('msglog-badge');
    if (!b) return;
    b.textContent = msgUnread > 99 ? '99+' : String(msgUnread);
    b.style.display = msgUnread > 0 ? 'flex' : 'none';
    const g = gravitaNonLetti();
    b.className = 'msglog-badge' + (g >= 3 ? ' grave-err' : g === 2 ? ' grave-warn' : '');
  }

  function renderMsgLog() {
    const list = document.getElementById('msglog-list');
    if (!list) return;
    if (!MSG_LOG.length) {
      list.innerHTML = '<p class="msglog-empty">Nessun messaggio in questa sessione.</p>';
      return;
    }
    const paginaCorrente = (typeof getCurrentPage === 'function' ? getCurrentPage() : null);
    let html = '';
    for (let i = MSG_LOG.length - 1; i >= 0; i--) {
      const m = MSG_LOG[i];
      html += '<div class="msglog-item ' + m.kind + '">' +
        '<div class="msglog-meta"><span class="msglog-ora"' + (m.iso ? ' title="' + m.iso + '"' : '') + '>' + m.ora + '</span>' +
        (m.pagina && m.pagina !== paginaCorrente ? '<span class="msglog-tag">' + m.pagina + '</span>' : '') +
        (m.analisi ? '<span class="msglog-tag">analisi #' + m.analisi + '</span>' : '') +
        (m.title ? '<span class="msglog-title">' + m.title + '</span>' : '') + '</div>' +
        '<div class="msglog-body">' + m.body + '</div></div>';
    }
    list.innerHTML = html;
  }

  function ensureMsgPanel() {
    let panel = document.getElementById('msglog-panel');
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id = 'msglog-panel';
    panel.className = 'msglog-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Registro messaggi');
    panel.innerHTML =
      '<div class="msglog-head">' +
        '<span class="msglog-h-title">Messaggi della sessione</span>' +
        '<button type="button" id="msglog-clear" class="msglog-btn">Svuota</button>' +
        '<button type="button" id="msglog-close" class="msglog-btn" aria-label="Chiudi">&times;</button>' +
      '</div>' +
      '<p class="msglog-nota">Tutte le notifiche di questa sessione, anche quelle gi&agrave; sparite dallo schermo. ' +
        'Le pi&ugrave; recenti in alto. Chiudendo il browser si azzerano.</p>' +
      '<div id="msglog-list" class="msglog-list"></div>';
    document.body.appendChild(panel);
    panel.querySelector('#msglog-close').addEventListener('click', toggleMsgLog);
    panel.querySelector('#msglog-clear').addEventListener('click', function () {
      MSG_LOG.length = 0; persistMsgLog();
      msgSeq = 0; msgLastRead = 0; persistMsgRead();
      msgUnread = 0; updateMsgBadge(); renderMsgLog();
    });
    return panel;
  }

  function toggleMsgLog() {
    const panel = ensureMsgPanel();
    const aperto = panel.classList.toggle('visible');
    if (aperto) {
      msgLastRead = MSG_LOG.reduce(function (m, v) { return Math.max(m, v.id || 0); }, msgLastRead);
      persistMsgRead();
      msgUnread = 0; updateMsgBadge(); renderMsgLog();
      // aperto il registro, i messaggi tolti dalla pila sono a portata
      toastNonMostrati = 0; aggiornaToastAltri();
    }
  }
  function apriMsgLog() {
    const panel = document.getElementById('msglog-panel');
    if (!panel || !panel.classList.contains('visible')) toggleMsgLog();
  }
  window.cammesMsgLog = { toggle: toggleMsgLog, apri: apriMsgLog, entries: function () { return MSG_LOG.slice(); } };

  // -------- BARRA IN ALTO: MESSAGGI, GIRO GUIDATO, GUIDA, MANUALE ----------
  // Pulsanti con la parola accanto all'icona, su tutte le pagine, aggiunti
  // qui per non toccare gli HTML. Prima erano tre cerchi a sola icona e il
  // manuale si apriva solo dalla Home.
  var ICONE_AIUTO = {
    messaggi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
    giro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>',
    manuale: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>'
  };
  function contenutoPillola(icona, testo) {
    return '<span class="aiuto-ico" aria-hidden="true">' + icona + '</span><span class="aiuto-txt">' + testo + '</span>';
  }

  function installMsgLogButton(gruppo) {
    let btn = document.getElementById('msglog-toggle');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'msglog-toggle';
      btn.type = 'button';
      btn.className = 'help-toggle help-pill msglog-toggle';
      btn.setAttribute('aria-label', 'Messaggi della sessione');
      btn.setAttribute('data-tip', '<strong>Messaggi</strong>Tutte le notifiche della sessione, anche quelle gi&agrave; sparite. ' +
        'Il numero conta quelle non ancora lette: rosso se fra queste c\'&egrave; un errore, giallo se c\'&egrave; un avviso.');
      btn.innerHTML = contenutoPillola(ICONE_AIUTO.messaggi, 'Messaggi') +
        '<span id="msglog-badge" class="msglog-badge" style="display:none;">0</span>';
      btn.addEventListener('click', toggleMsgLog);
    }
    if (gruppo) gruppo.appendChild(btn);
    updateMsgBadge();
    return btn;
  }

  function installaBarraAiuti() {
    const help = document.getElementById('help-toggle');
    if (!help || !help.parentNode) return null;
    let gruppo = document.getElementById('headerAiuti');
    if (!gruppo) {
      gruppo = document.createElement('div');
      gruppo.id = 'headerAiuti';
      gruppo.className = 'header-aiuti';
      gruppo.setAttribute('role', 'group');
      gruppo.setAttribute('aria-label', 'Aiuto e messaggi');
      help.parentNode.insertBefore(gruppo, help);
    }
    const messaggi = installMsgLogButton(gruppo);
    let giro = document.getElementById('tour-toggle');
    if (!giro && getCurrentPage()) {
      giro = document.createElement('button');
      giro.id = 'tour-toggle';
      giro.type = 'button';
      giro.className = 'help-toggle help-pill';
      giro.setAttribute('aria-label', 'Giro guidato della pagina');
      giro.setAttribute('data-tip', '<strong>Giro guidato</strong>Ti indica uno alla volta i comandi di questa pagina, ' +
        'nell\'ordine del lavoro. Avanti e Indietro per scorrere, Esc per chiudere.');
      giro.innerHTML = contenutoPillola(ICONE_AIUTO.giro, 'Giro guidato');
      giro.addEventListener('click', startTour);
    }
    // Il "?" della pagina diventa "Guida": stesse schede, ora col nome.
    if (!help.classList.contains('help-pill')) {
      help.classList.add('help-pill');
      help.innerHTML = '<span class="aiuto-ico aiuto-q" aria-hidden="true">?</span><span class="aiuto-txt">Guida</span>';
      help.setAttribute('aria-label', 'Guida: come si lavora, in 5 schede');
      help.removeAttribute('title');
      help.setAttribute('data-tip', '<strong>Guida</strong>Come si lavora col banco, in 5 schede: ' +
        'dalla misura al documento per il cliente.');
    }
    let manuale = document.getElementById('manuale-link');
    if (!manuale) {
      manuale = document.createElement('a');
      manuale.id = 'manuale-link';
      manuale.className = 'help-toggle help-pill';
      manuale.href = '/manuale';
      manuale.target = '_blank';
      manuale.rel = 'noopener';
      manuale.setAttribute('aria-label', 'Manuale operatore (si apre in una nuova scheda)');
      manuale.setAttribute('data-tip', '<strong>Manuale</strong>Il manuale dell\'operatore in una nuova scheda: misura, collaudo, ' +
        'analisi e tabella dei problemi frequenti. Si pu&ograve; stampare.');
      manuale.innerHTML = contenutoPillola(ICONE_AIUTO.manuale, 'Manuale');
    }
    // ordine: Messaggi, Giro guidato, Guida, Manuale
    [messaggi, giro, help, manuale].forEach(function (b) { if (b) gruppo.appendChild(b); });
    // Solo ora il numerino e' nella pagina: i non letti arrivati da un'altra
    // pagina (AUDIT v3.4.3 P2-06) si vedono subito, col colore del piu' grave.
    updateMsgBadge();
    return gruppo;
  }

  // Se la barra in alto non ci sta (Alzata con le 4 spie a 1366 px, finestra
  // stretta, zoom del browser) la si compatta a gradini invece di tagliare a
  // destra i pulsanti: 1) via la scritta CAMMES (resta il logo), 2) link
  // delle pagine piu' stretti, 3) via le icone dalle pillole, 4) pillole a
  // sola icona, 5) via i nomi delle spie (restano pallino, segno e fumetto),
  // 6) se non basta ancora (tablet, zoom forte) la barra scorre di lato.
  // Prima si stringe cio' che non si legge, per ultime le parole delle spie.
  // L'altezza della barra non cambia (Alzata ci appoggia la barra dei comandi).
  var LIVELLI_BARRA = ['barra-l1', 'barra-l2', 'barra-l3', 'barra-l4', 'barra-l5', 'barra-l6'];
  function adattaBarraAlta() {
    const h = document.querySelector('.header');
    if (!h || !h.classList) return 0;
    LIVELLI_BARRA.forEach(function (c) { h.classList.remove(c); });
    let livello = 0;
    while (livello < LIVELLI_BARRA.length && h.scrollWidth > h.clientWidth + 1) {
      h.classList.add(LIVELLI_BARRA[livello]);
      livello++;
    }
    return livello;
  }
  let _adattaInAttesa = false;
  function adattaBarraPresto() {
    if (_adattaInAttesa) return;
    _adattaInAttesa = true;
    requestAnimationFrame(function () { _adattaInAttesa = false; adattaBarraAlta(); });
  }
  function sorvegliaBarraAlta() {
    adattaBarraAlta();
    window.addEventListener('resize', adattaBarraPresto);
    try { if (document.fonts && document.fonts.ready) document.fonts.ready.then(adattaBarraPresto); } catch (e) {}
    if (typeof window.ResizeObserver === 'function') {
      try {
        const ro = new window.ResizeObserver(adattaBarraPresto);
        ['.header', '.header .status-leds', '.header .nav-links'].forEach(function (s) {
          const el = document.querySelector(s);
          if (el) ro.observe(el);
        });
      } catch (e) {}
    }
  }
  window.cammesBarraAlta = { adatta: adattaBarraAlta };

  // -------- SCAN PROGRESS BAR --------------------------------------------
  // Formattazione UNICA di una durata stimata. Prima ogni punto la scriveva
  // a modo suo: la stessa scansione risultava '~45s' nella tendina, '~50s'
  // sulla barra e '~1m' nel toast.
  function formattaDurata(sec) {
    if (sec == null || !isFinite(sec)) return '';
    if (sec < 60) return '~' + Math.ceil(sec) + 's';
    var m = Math.floor(sec / 60), s = Math.round(sec % 60);
    return '~' + m + 'm' + (s ? ' ' + s + 's' : '');
  }
  window.cammesDurata = formattaDurata;

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
    if (eta) eta.textContent = formattaDurata(etaSec);
  }
  function resetScanProgress() {
    setScanProgress(0, 1, null);
    const eta = document.getElementById('scan-progress-eta');
    if (eta) eta.textContent = '';
    const wrap = document.getElementById('scan-progress-wrap');
    if (wrap) wrap.classList.remove('active');
  }
  window.cammesScanProgress = { set: setScanProgress, reset: resetScanProgress };

  // -------- INTESTAZIONE OFFICINA NEI PDF --------------------------------
  // Il nome impostato in Home (Sistema e manutenzione) va in testa a TUTTI i
  // documenti che l'officina consegna: referto di analisi, race report, scheda
  // tecnica della singola misura, scheda camma. Prima lo portava solo la scheda
  // camma: il campo si chiamava "per i referti PDF" e tre referti su quattro
  // uscivano anonimi.
  //
  // Scrive `nome` allineato a destra con il margine destro in xDestra, sulla
  // linea di base y, rimpicciolendo il corpo finché entra in larghezzaMax (un
  // nome lungo non deve finire sopra il titolo). Font e colore li sceglie chi
  // chiama, perché ogni documento ha la sua fascia. Senza nome non scrive
  // niente e restituisce false.
  function intestazionePdf(doc, nome, xDestra, y, larghezzaMax, corpoMax) {
    var testo = String(nome == null ? '' : nome).replace(/\s+/g, ' ').trim().substring(0, 60);
    if (!testo) return false;
    var corpo = corpoMax || 12;
    doc.setFontSize(corpo);
    while (corpo > 6 && doc.getTextWidth(testo) > larghezzaMax) {
      corpo -= 0.5;
      doc.setFontSize(corpo);
    }
    doc.text(testo, xDestra - doc.getTextWidth(testo), y);
    return true;
  }
  window.cammesIntestazionePdf = intestazionePdf;

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
      // Label (virgola decimale, come tutto cio' che l'operatore legge)
      const labelVal = min + (i / majorTicks) * (max - min);
      const labelText = cammesNum(labelVal, (max - min) % majorTicks === 0 ? 0 : 1);
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
      <svg class="gauge-svg" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" aria-label="Indicatore ${unit}">
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
        <text class="gauge-svg-value" x="${cx}" y="${cy + 8}" text-anchor="middle">${cammesNum(0, decimals)}</text>
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
      if (valueEl) valueEl.textContent = isFinite(num) ? cammesNum(num, decimals) : '--';
    }

    return {
      setValue: setValue,
      destroy: function () { container.innerHTML = ''; }
    };
  }
  window.cammesGauge = { create: createGauge };

  // -------- RICH TOOLTIPS (data-tip="...") -------------------------------
  // Un fumetto per ogni elemento con attributo data-tip, sopra l'elemento
  // (sotto se in alto non c'e' spazio). Ascolto unico sul documento: vale
  // anche per gli elementi aggiunti dopo il caricamento. Si apre passando il
  // mouse o col tasto Tab; sulle icone "?" e sulle spie di stato anche col
  // clic o col tocco, e allora resta aperto finche' non si clicca altrove o
  // si preme Esc (sul tablet il passaggio del mouse non esiste).
  // cammesTooltip.refresh() resta per compatibilita': rende raggiungibili
  // col Tab le icone "?" e le spie aggiunte dopo.
  var TIP_FISSABILI = '.help-icon[data-tip], .status-led[data-tip]';
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
  var tipAttivo = null, tipFissato = null, fumettiAttivi = false;
  // Il fuoco rimesso dal programma (chiusa una finestra, torna sul comando
  // che l'aveva aperta) non apre il fumetto di quel comando.
  var tipSilenzio = false;
  function rimettiFuoco(el) {
    if (!el || typeof el.focus !== 'function' || el === document.body) return;
    tipSilenzio = true;
    try { el.focus(); } catch (e) {}
    tipSilenzio = false;
  }
  function mostraTip(el) {
    const testo = el.getAttribute('data-tip');
    if (!testo) return;
    const tt = ensureTooltipEl();
    tt.innerHTML = testo;
    tt.classList.remove('fissato');
    tt.classList.add('visible');
    tipAttivo = el;
    // la misura del fumetto e' pronta solo dopo il disegno
    requestAnimationFrame(function () { if (tipAttivo === el) positionTooltip(el, tt); });
  }
  function nascondiTip() {
    const tt = document.getElementById('cammes-tooltip');
    if (tt) { tt.classList.remove('visible'); tt.classList.remove('fissato'); }
    tipAttivo = null;
    tipFissato = null;
  }
  function tipDi(t) { return (t && t.closest) ? t.closest('[data-tip]') : null; }
  function fissabileDi(t) { return (t && t.closest) ? t.closest(TIP_FISSABILI) : null; }
  function alternaTipFissato(el) {
    if (tipFissato === el) { nascondiTip(); return; }
    mostraTip(el);
    tipFissato = el;
    // aperto col clic: si puo' cliccare un collegamento dentro ("Altro nel
    // manuale"); un clic altrove, o sul fumetto stesso, lo chiude
    ensureTooltipEl().classList.add('fissato');
  }
  function installaFumetti() {
    if (fumettiAttivi) return;
    fumettiAttivi = true;
    document.addEventListener('mouseover', function (e) {
      const el = tipDi(e.target);
      if (el === tipAttivo) return;
      if (!el) { if (tipAttivo && !tipFissato) nascondiTip(); return; }
      tipFissato = null;
      mostraTip(el);
    });
    document.addEventListener('mouseout', function (e) {
      const el = tipDi(e.target);
      if (!el || el !== tipAttivo || el === tipFissato) return;
      if (e.relatedTarget && el.contains(e.relatedTarget)) return;
      nascondiTip();
    });
    document.addEventListener('focusin', function (e) {
      if (tipSilenzio) return;
      const el = tipDi(e.target);
      if (el && el !== tipAttivo) { tipFissato = null; mostraTip(el); }
    });
    document.addEventListener('focusout', function (e) {
      const el = tipDi(e.target);
      if (el && el === tipAttivo && el !== tipFissato) nascondiTip();
    });
    document.addEventListener('click', function (e) {
      const f = fissabileDi(e.target);
      if (f) { e.preventDefault(); alternaTipFissato(f); return; }
      // un clic su un comando chiude il suo fumetto: non resta sopra la
      // finestra che quel comando apre
      if (tipAttivo) nascondiTip();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { if (tipAttivo) nascondiTip(); return; }
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const f = fissabileDi(e.target);
      if (f && f === e.target) { e.preventDefault(); alternaTipFissato(f); }
    });
  }
  function refreshTooltips() {
    installaFumetti();
    const els = document.querySelectorAll(TIP_FISSABILI);
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
      if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
      if (!el.hasAttribute('aria-label') && el.classList.contains('help-icon')) {
        const tit = /<strong>([\s\S]*?)<\/strong>/i.exec(el.getAttribute('data-tip') || '');
        el.setAttribute('aria-label', 'Spiegazione' + (tit ? ': ' + tit[1].replace(/<[^>]*>/g, '').replace(/&[#a-z0-9]+;/gi, ' ').trim() : ''));
      }
    }
  }
  window.cammesTooltip = { refresh: refreshTooltips, chiudi: nascondiTip };

  // -------- ONBOARDING WIZARD -------------------------------------------
  // Modal a step. Mostrato automaticamente al primo accesso (flag in
  // localStorage). Riapribile manualmente da un bottone "?" globale.
  const WIZARD_KEY = 'cammes-onboarded-v1';
  // Cinque schede nell'ordine del lavoro, con le parole del manuale e i nomi
  // che l'operatore legge sui pulsanti.
  const WIZARD_STEPS = [
    {
      title: 'Benvenuto in CAMMES',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
      body: 'Il banco misura il profilo di un albero a camme, lo confronta con altre misure e ne calcola la fasatura. ' +
            'Si lavora un cilindro alla volta, in quattro pagine:<br>' +
            '&bull; <b>Home</b>: archivio delle misure;<br>' +
            '&bull; <b>Alzata</b>: la misura;<br>' +
            '&bull; <b>Confronto</b>: curve sovrapposte e collaudo;<br>' +
            '&bull; <b>Analisi</b>: fasatura e documenti per il cliente.<br><br>' +
            'In alto a destra trovi sempre <b>Messaggi</b>, <b>Giro guidato</b>, <b>Guida</b> (queste schede) e <b>Manuale</b>. ' +
            '<b>Messaggi</b> rilegge le notifiche gi&agrave; sparite: numero rosso = un errore non letto, giallo = un avviso.'
    },
    {
      title: '1. Prima di misurare',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>',
      body: '&bull; Monta l\'albero, porta il tastatore sul <b>cerchio base</b> e azzera il comparatore.<br>' +
            '&bull; Nella pagina <b>Alzata</b> le 4 spie in alto devono essere verdi: ' +
            '<b>Comparatore</b>, <b>Motore</b>, <b>Encoder</b>, <b>Server</b>.<br>' +
            '&bull; Una spia gialla o rossa? Passaci sopra, o toccala: dice che cosa controllare.'
    },
    {
      title: '2. Misurare (Alzata)',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l3-9 4 18 3-9h4"/></svg>',
      body: '&bull; <b>Modalit&agrave;</b>: <b>Veloce</b> basta quasi sempre; <b>Race</b> legge un punto ogni mezzo grado, ' +
            'per fianchi molto ripidi. Accanto, il <b>Verso di scansione</b>: orario o antiorario.<br>' +
            '&bull; <b>START</b> misura un giro completo; <b>STOP</b> ferma subito il banco.<br>' +
            '&bull; A fine giro leggi l\'<b>Esito della misura</b>, scrivi il nome (es. <code>albero12_asp</code>) ' +
            'e premi <b>Salva misura</b>.<br>' +
            '&bull; <b>Ricomincia</b> svuota la pagina e riparte da capo.'
    },
    {
      title: '3. Zero e posizioni (Alzata)',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>',
      body: '&bull; <b>Zero virtuale</b> trova il picco e lo porta a 180&deg; dallo zero: ' +
            'alberi montati in modo diverso restano confrontabili.<br>' +
            '&bull; <b>Ruota</b> porta l\'albero ai gradi scritti; <b>Azzera angolo qui</b> fa della posizione attuale lo zero; ' +
            '<b>Memorizza posizione</b> le d&agrave; un nome per tornarci.<br>' +
            '&bull; <b>Sblocca motore</b> libera l\'albero per girarlo a mano, con angolo e alzata letti dal vivo.'
    },
    {
      title: '4. Confronto, Analisi, documenti',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/></svg>',
      body: '&bull; <b>Confronto</b>: fino a 4 misure sovrapposte; con un profilo nominale e una tolleranza ' +
            'ogni curva riceve <b>CONFORME / NON CONFORME</b>.<br>' +
            '&bull; <b>Analisi</b>: scegli la misura di aspirazione e quella di scarico, scrivi <b>angolo lobo</b> e ' +
            '<b>gioco valvola</b> della scheda del motore e premi <b>Analizza</b>: durata al gioco, separazione dei lobi (LSA), ' +
            'aperture e chiusure, incrocio.<br>' +
            '&bull; Da Analisi escono <b>Scheda camma</b> e referto PDF per il cliente; dalla Home, <b>Backup completo</b> salva tutto l\'archivio.<br>' +
            '&bull; Il resto, con la tabella dei problemi frequenti, &egrave; nel <b>Manuale</b> (in alto a destra).'
    }
  ];

  function buildWizard() {
    const back = document.createElement('div');
    back.className = 'cammes-wizard-backdrop';
    back.innerHTML =
      // audit APP-13: dialogo modale annunciato agli screen reader
      '<div class="cammes-wizard" role="dialog" aria-modal="true" aria-label="Introduzione guidata">' +
      '  <button class="cammes-wizard-close" aria-label="Chiudi">&times;</button>' +
      '  <div class="cammes-wizard-icon"></div>' +
      '  <h2 class="cammes-wizard-title"></h2>' +
      '  <div class="cammes-wizard-body"></div>' +
      '  <div class="cammes-wizard-dots"></div>' +
      '  <div class="cammes-wizard-nav">' +
      '    <button class="btn btn-secondary cammes-wizard-prev">Indietro</button>' +
      '    <button class="btn btn-secondary cammes-wizard-giro" style="display:none;">Giro guidato</button>' +
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
    const giroBtn = back.querySelector('.cammes-wizard-giro');
    const closeBtn = back.querySelector('.cammes-wizard-close');

    let idx = 0;
    function render() {
      const s = WIZARD_STEPS[idx];
      const ultima = idx === WIZARD_STEPS.length - 1;
      iconEl.innerHTML = s.icon;
      titleEl.textContent = s.title;
      bodyEl.innerHTML = s.body;
      dotsEl.innerHTML = WIZARD_STEPS.map((_, i) =>
        '<span class="cammes-wizard-dot' + (i === idx ? ' active' : '') + '"></span>').join('');
      prevBtn.disabled = idx === 0;
      nextBtn.textContent = ultima ? 'Inizia' : 'Avanti';
      // dall'ultima scheda si passa ai comandi veri di questa pagina
      if (giroBtn) giroBtn.style.display = (ultima && getCurrentPage()) ? '' : 'none';
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
    if (giroBtn) giroBtn.onclick = () => { close(); setTimeout(startTour, 260); };
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

  window.cammesWizard = { show: showWizard, showIfFirstTime: showWizardIfFirstTime };

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

  // -------- NUMERI COME IN OFFICINA (v3.8.0) ------------------------------
  // Virgola decimale, nessun separatore delle migliaia: "1.250" verrebbe letto
  // come milleduecentocinquanta. Prima lo stesso riquadro mescolava "100.0°" e
  // "12.500 rpm" (punto decimale e punto delle migliaia). Per cio' che
  // l'operatore LEGGE (schermo, PDF); i file di dati restano col punto.
  // Non-numero -> 'n.d.' (mai "NaN" davanti all'operatore).
  function cammesNum(x, decimali) {
    var n = Number(x);
    if (x === null || x === undefined || x === '' || !isFinite(n)) return 'n.d.';
    var s = n.toFixed(decimali == null ? 2 : decimali);
    if (/^-0(\.0*)?$/.test(s)) s = s.slice(1);          // niente "-0,00"
    return s.replace('.', ',');
  }
  window.cammesNum = cammesNum;

  // -------- FINESTRE DELLA PAGINA (v3.8.0) --------------------------------
  // Al posto di confirm()/prompt() del browser ("localhost dice..."): titolo,
  // testo e pulsanti con la parola dell'azione ("Sposta nel cestino", non "OK").
  // Ritorna una Promise che si risolve con { scelta, testo }:
  //   scelta = il valore del pulsante premuto (Esc o clic fuori = pulsante
  //            con annulla:true, oppure null); testo = il campo, se c'e'.
  // opts: { titolo, testo (HTML gia' sanificato da chi chiama),
  //         tipo: 'info'|'warn'|'danger',
  //         campo: { valore, segnaposto, etichetta } (facoltativo),
  //         pulsanti: [{ testo, valore, stile: 'primary'|'danger'|'secondary', annulla }],
  //         fuoco: valore del pulsante che parte col fuoco (facoltativo) }
  // Fuoco di partenza: il campo, se c'e'. Se fra i pulsanti c'e' un'azione
  // pericolosa (rossa, o finestra 'danger'), quello prudente: il pulsante
  // annulla, altrimenti il primo non rosso; un Invio distratto (per esempio
  // subito dopo l'Invio nel campo del nome) non sostituisce e non cancella
  // niente. Altrimenti il pulsante principale. Il Tab gira dentro la
  // finestra; chiusa la finestra, il fuoco torna dov'era.
  function cammesDialog(opts) {
    var o = opts || {};
    var pulsanti = (o.pulsanti && o.pulsanti.length) ? o.pulsanti
      : [{ testo: 'Annulla', valore: false, stile: 'secondary', annulla: true },
         { testo: 'OK', valore: true, stile: 'primary' }];
    var primaDellaFinestra = document.activeElement || null;
    return new Promise(function (risolvi) {
      var back = document.createElement('div');
      back.className = 'cammes-dialog-backdrop';
      var box = document.createElement('div');
      box.className = 'cammes-dialog ' + (o.tipo || 'info');
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.setAttribute('aria-label', String(o.titolo || 'Conferma').replace(/<[^>]*>/g, ''));
      var html = '<div class="cammes-dialog-title">' + (o.titolo || '') + '</div>' +
                 (o.testo ? '<div class="cammes-dialog-body">' + o.testo + '</div>' : '');
      if (o.campo) {
        html += '<label class="cammes-dialog-field">' + (o.campo.etichetta ? '<span>' + o.campo.etichetta + '</span>' : '') +
                '<input type="text" class="input" autocomplete="off"></label>';
      }
      html += '<div class="cammes-dialog-actions"></div>';
      box.innerHTML = html;
      var input = box.querySelector('input');
      if (input) {
        input.value = o.campo.valore != null ? String(o.campo.valore) : '';
        if (o.campo.segnaposto) input.placeholder = o.campo.segnaposto;
      }
      var annulla = null, annullaBtn = null, principale = null, primoNonRosso = null, scelto = null;
      var pericolosa = o.tipo === 'danger';
      var azioni = box.querySelector('.cammes-dialog-actions');
      var bottoni = [];
      pulsanti.forEach(function (p) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn ' + (p.stile === 'danger' ? 'btn-danger' : p.stile === 'primary' ? 'btn-accent' : 'btn-secondary');
        b.textContent = p.testo;
        b.addEventListener('click', function () { chiudi(p.valore); });
        azioni.appendChild(b);
        bottoni.push(b);
        if (p.annulla) { annulla = p; annullaBtn = b; }
        if (p.stile === 'primary' || p.stile === 'danger') principale = b;
        if (p.stile === 'danger') pericolosa = true;
        else if (!primoNonRosso) primoNonRosso = b;
        if (o.fuoco !== undefined && p.valore === o.fuoco && !scelto) scelto = b;
      });
      var primoFuoco = scelto || input ||
        (pericolosa ? (annullaBtn || primoNonRosso || bottoni[0]) : (principale || bottoni[bottoni.length - 1]));
      back.appendChild(box);
      document.body.appendChild(back);
      var finito = false;
      function chiudi(valore) {
        if (finito) return;
        finito = true;
        document.removeEventListener('keydown', tasti, true);
        back.classList.remove('visible');
        setTimeout(function () { if (back.parentNode) back.parentNode.removeChild(back); }, 180);
        rimettiFuoco(primaDellaFinestra);
        risolvi({ scelta: valore, testo: input ? input.value : null });
      }
      function tasti(e) {
        if (e.key === 'Escape') { e.preventDefault(); chiudi(annulla ? annulla.valore : null); }
        else if (e.key === 'Enter' && input && document.activeElement === input && principale) { e.preventDefault(); principale.click(); }
        else if (e.key === 'Tab') {
          // il Tab non esce dalla finestra: un Invio sul campo della pagina
          // sotto farebbe partire un comando con la domanda ancora aperta
          var giro = (input ? [input] : []).concat(bottoni);
          var qui = giro.indexOf(document.activeElement);
          var dopo = e.shiftKey ? (qui <= 0 ? giro.length - 1 : qui - 1)
                                : (qui < 0 || qui >= giro.length - 1 ? 0 : qui + 1);
          e.preventDefault();
          if (giro[dopo]) giro[dopo].focus();
        }
      }
      document.addEventListener('keydown', tasti, true);
      back.addEventListener('click', function (e) { if (e.target === back) chiudi(annulla ? annulla.valore : null); });
      requestAnimationFrame(function () { back.classList.add('visible'); });
      setTimeout(function () { if (!finito && primoFuoco) primoFuoco.focus(); }, 30);
    });
  }
  window.cammesDialog = cammesDialog;
  // Scorciatoie: conferma sì/no e domanda con un campo di testo.
  window.cammesConferma = function (titolo, testo, testoSi, pericoloso) {
    return cammesDialog({ titolo: titolo, testo: testo, tipo: pericoloso ? 'danger' : 'warn',
      pulsanti: [{ testo: 'Annulla', valore: false, stile: 'secondary', annulla: true },
                 { testo: testoSi || 'Conferma', valore: true, stile: pericoloso ? 'danger' : 'primary' }] })
      .then(function (r) { return r.scelta === true; });
  };
  window.cammesChiedi = function (titolo, testo, valore, testoSi) {
    return cammesDialog({ titolo: titolo, testo: testo, tipo: 'info', campo: { valore: valore },
      pulsanti: [{ testo: 'Annulla', valore: false, stile: 'secondary', annulla: true },
                 { testo: testoSi || 'Salva', valore: true, stile: 'primary' }] })
      .then(function (r) { return r.scelta === true ? r.testo : null; });
  };

  // -------- GUIDED TOUR (coachmark per-pagina) ---------------------------
  // Tour on-demand che evidenzia i controlli reali della pagina corrente, uno
  // alla volta (oltre al wizard di benvenuto, che resta testuale/automatico).
  var TOUR_KEY = 'cammes-tour-done-v1';

  function getCurrentPage() {
    var t = document.title || '';
    if (/Home/i.test(t))      return 'home';
    if (/Alzata/i.test(t))    return 'alzata';
    if (/Confronto/i.test(t)) return 'grafici';
    if (/Analisi/i.test(t))   return 'analisi';
    return null;
  }
  // Passi per pagina, nell'ordine del lavoro: { sel, title, body }. "sel"
  // puo' essere un elenco di selettori in ordine di preferenza: vale il primo
  // presente e visibile. Un passo senza elemento visibile viene saltato.
  // In coda a ogni pagina si aggiunge PASSO_AIUTI (la barra in alto).
  var TOUR_STEPS = {
    home: [
      { sel: '#statoBanco', title: 'Stato del banco', body: 'In cima: verifica del banco, Arduino e aggiornamenti. Se qualcosa non va, la riga dice che cosa fare.' },
      { sel: '#nuovaMisuraBtn', title: 'Nuova misura', body: 'Porta alla pagina <b>Alzata</b> per misurare un albero.' },
      { sel: ['#recentsWrap', '#recentsSearch'], title: 'Archivio delle misure', body: 'Tutte le misure salvate. Clic sul nome per vederla al volo. Spunta le misure che ti servono per confrontarle o analizzarle.' },
      { sel: '#barraSelezione', title: 'Misure spuntate', body: 'Da qui mandi le misure spuntate a <b>Confronto</b>, oppure scegli quale va in <b>Analisi</b> come aspirazione e quale come scarico.' },
      { sel: '#recentsSearch', title: 'Cerca e filtra', body: 'Trova una misura per nome; sotto filtri per tipo, data e tag.' },
      // il Cestino sta dentro questo riquadro, chiuso finche' non serve: un
      // passo suo verrebbe sempre saltato
      { sel: '#updatesCard', title: 'Sistema e manutenzione', body: 'Si apre con un clic: intestazione dell\'officina per i PDF, nuove versioni del programma, firmware dell\'Arduino, <b>Backup completo</b>, <b>Cestino</b> (le misure eliminate restano 30 giorni e si recuperano) e <b>Diagnostica</b> per l\'assistenza.' }
    ],
    alzata: [
      { sel: ['.status-leds', '#ledSensor'], title: 'Prima di misurare', body: 'Monta l\'albero, porta il tastatore sul <b>cerchio base</b> e azzera il comparatore. Poi guarda le 4 spie: <b>Comparatore</b>, <b>Motore</b>, <b>Encoder</b> e <b>Server</b> devono essere verdi. Passa sopra una spia, o toccala, per sapere che cosa vuol dire il colore.' },
      { sel: '#scanMode', title: 'Modalità e verso di scansione', body: '<b>Veloce</b> legge un punto per grado e basta quasi sempre; <b>Race</b> un punto ogni mezzo grado, per fianchi molto ripidi. Il tempo lo scrive la tendina. Accanto, il <b>Verso di scansione</b>: orario o antiorario.' },
      { sel: ['#barraComandi', 'button[onclick^="start"]'], title: 'START e STOP', body: '<b>START</b> misura un giro completo. <b>STOP</b> ferma subito il banco: la misura resta incompleta e va ripetuta. <b>Ricomincia</b> svuota la pagina e riparte da capo.' },
      { sel: '#esitoMisura', title: 'Esito della misura', body: 'A fine giro qui resta scritto com\'&egrave; andata e che cosa fare, fino al prossimo START.' },
      { sel: '#nome', title: 'Nome e Salva misura', body: 'Scrivi il nome (es. <code>albero12_asp</code>) e premi <b>Salva misura</b>: la misura va nell\'archivio, <code>_alz</code> si aggiunge da solo.' },
      { sel: '#msBtn', title: 'Zero virtuale', body: 'Trova il picco e lo porta a 180&deg; dallo zero, cos&igrave; alberi montati in modo diverso restano confrontabili.' },
      { sel: ['#cf', '#step'], title: 'Ruota e posizioni', body: '<b>Ruota</b> porta l\'albero ai gradi scritti. <b>Azzera angolo qui</b> fa della posizione attuale lo zero. <b>Memorizza posizione</b> le d&agrave; un nome per tornarci.' },
      { sel: '#freeBtn', title: 'Sblocca motore', body: 'Libera l\'albero per girarlo a mano: angolo e alzata si leggono dal vivo. Ripremi per bloccarlo prima di misurare.' },
      { sel: '#scanAdvBtn', title: 'Avanzate', body: '<b>Ripetizioni</b>: misura pi&ugrave; volte di fila e dice se il banco &egrave; stabile. <b>Verifica del banco</b>: prova periodica con un cilindro rettificato. Per l\'uso normale non servono.' }
    ],
    grafici: [
      { sel: '#fileinput1', title: 'Carica le misure', body: 'Fino a 4 misure: le curve si sovrappongono nel grafico. Puoi anche spuntarle nell\'archivio della Home.' },
      { sel: '#viewMode', title: 'Sovrapposte o differenza', body: 'Le curve una sull\'altra, oppure la loro differenza con scarto massimo, medio e quadratico medio.' },
      { sel: '#fileNominal', title: 'Collaudo su profilo nominale', body: 'Carica il profilo di riferimento e scrivi la tolleranza: ogni curva riceve <b>CONFORME / NON CONFORME</b> e sul grafico compare la banda &plusmn; tolleranza.' },
      { sel: '#verdictBox', title: 'Verdetto', body: 'Il verdetto di ogni curva, con lo scarto massimo e il grado dove capita. Si aggiorna da solo.' },
      { sel: '#stampaCollaudoBtn', title: 'Stampa del collaudo', body: 'Il collaudo su carta o in PDF, da consegnare al cliente.' },
      { sel: '#fileinput2', title: 'Vista polare', body: 'Disegna la camma vista di fronte, cerchio base pi&ugrave; alzata: scrivi prima il <b>diametro</b> del cerchio base (&Oslash;, come in Analisi), poi scegli la misura.' },
      { sel: '#replayBtn', title: 'Ridisegna', body: 'Ridisegna le curve da 0&deg; a 360&deg;, per seguirle passo passo.' }
    ],
    analisi: [
      { sel: '#passiAnalisi', title: 'I passi', body: 'In cima i passi da seguire nell\'ordine: misura di aspirazione, misura di scarico, valori da confermare, <b>Analizza</b>.' },
      { sel: ['#sceltaArchivioIntake', '#fileIntake'], title: 'Le due misure', body: 'Scegli la misura di aspirazione dall\'archivio o dal computer, poi quella di scarico.' },
      { sel: '#intakeAngle', title: 'Angolo lobo', body: 'Centro del lobo in gradi motore, dopo il PMS. Il bordo tratteggiato vuol dire <b>da confermare</b>: scrivi il valore della scheda del motore oppure, se &egrave; gi&agrave; giusto, clicca nel campo e premi Invio.' },
      { sel: '#intakeClearance', title: 'Gioco valvola', body: 'Il gioco valvola della scheda del motore. Finch&eacute; non lo scrivi, la durata al gioco e la fasatura restano <b>da confermare</b>.' },
      { sel: '#analyzeBtn', title: 'Analizza', body: 'Calcola la durata al gioco e all\'alzata di riferimento (di solito 1 mm), separazione dei lobi (LSA), aperture e chiusure, alzata al PMS e incrocio, e disegna il grafico a 720&deg;.' },
      { sel: ['#btnCamCard', '#btnExportPDF'], title: 'Documenti', body: '<b>Scheda camma</b> per il cliente, referto PDF, CSV per Excel. I valori da confermare restano segnati anche sui documenti.' },
      { sel: '#modeBaseBtn', title: 'Base o Avanzato', body: '<b>Base</b> mostra i campi essenziali; <b>Avanzato</b> aggiunge anticipo, <b>Filtro derivate</b> e <b>Correzione eccentricit&agrave;</b>. Il rapporto del bilanciere compare anche in Base quando il comando valvola lo prevede.' },
      { sel: '#btnModules', title: 'Funzioni', body: 'Accendi solo ci&ograve; che serve: punteria simulata (bicchiere, rullo, leva a dito), molla e forze, distacco della valvola, strumenti race, animazione, confronto A/B. La scelta viene ricordata.' }
    ]
  };
  var PASSO_AIUTI = { sel: '#headerAiuti', title: 'Aiuto e messaggi', body: '<b>Messaggi</b> rilegge le notifiche gi&agrave; sparite (numero rosso = un errore non letto, giallo = un avviso). <b>Giro guidato</b> rif&agrave; questo giro. <b>Guida</b> spiega il lavoro in 5 schede. <b>Manuale</b> apre il manuale completo.' };

  // Visibile = disegnato sulla pagina (anche se fisso o appiccicato in alto,
  // dove offsetParent vale null pur essendo a vista).
  function visibileInPagina(el) {
    if (el.getClientRects) return el.getClientRects().length > 0;
    return el.offsetParent !== null;
  }
  function trovaElementoPasso(sel) {
    const lista = Array.isArray(sel) ? sel : [sel];
    let nascosto = null;
    for (let i = 0; i < lista.length; i++) {
      let el = null;
      try { el = document.querySelector(lista[i]); } catch (e) {}
      if (el && visibileInPagina(el)) return { el: el, nascosto: null };
      if (el && !nascosto) nascosto = lista[i];
    }
    return { el: null, nascosto: nascosto };
  }
  function passiDelGiro(page) {
    const defs = ((page && TOUR_STEPS[page]) || []).concat([PASSO_AIUTI]);
    const steps = [];
    defs.forEach(function (s) {
      const r = trovaElementoPasso(s.sel);
      if (r.el) steps.push({ el: r.el, title: s.title, body: s.body });
    });
    return steps;
  }

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
      '.cammes-tour-pop{position:fixed;z-index:952;max-width:340px;background:var(--bg-elev-2,#1a1a2e);' +
        'border:1px solid var(--border-strong,#2a2a4a);border-radius:10px;padding:16px 18px;' +
        'box-shadow:0 10px 34px rgba(0,0,0,.55);color:var(--text-primary,#e8e8f0);' +
        'font-family:var(--font-sans,system-ui,sans-serif);font-size:15px;line-height:1.5;}' +
      '.cammes-tour-pop h4{margin:0 0 6px;font-family:var(--font-display,inherit);font-size:18px;' +
        'color:var(--accent-text,#00d4ff);}' +
      '.cammes-tour-pop code{font-family:var(--font-mono,monospace);background:var(--bg-input,#12121f);' +
        'color:var(--accent-2,#7df);padding:1px 5px;border-radius:3px;}' +
      '.cammes-tour-nav{display:flex;justify-content:space-between;align-items:center;margin-top:14px;gap:8px;}' +
      '.cammes-tour-nav .step{font-size:13px;color:var(--text-muted,#8888aa);}' +
      '.cammes-tour-nav button{font-family:inherit;font-size:14px;min-height:36px;padding:6px 14px;border-radius:6px;' +
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
    var vpW = window.innerWidth, vpH = window.innerHeight;
    var top = r.bottom + 12;
    if (top + popH > vpH - 8) top = Math.max(8, r.top - popH - 12);
    var left = Math.min(Math.max(8, r.left), vpW - popW - 8);
    pop.style.top = top + 'px';
    pop.style.left = left + 'px';
  }

  function _tourRender() {
    var step = _tour.steps[_tour.idx];
    var el = step.el;
    // la barra in alto e' sempre a vista: scorrere la porterebbe a meta' pagina
    var inBarraAlta = !!(el.closest && el.closest('.header'));
    if (el.scrollIntoView && !inBarraAlta) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
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
    nextBtn.textContent = last ? 'Fine' : 'Avanti';
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
    nascondiTip();
    // risolvi i selettori, salta i passi senza elemento a vista (un pannello
    // chiuso, una barra che compare solo dopo una scelta)
    var steps = passiDelGiro(getCurrentPage());
    if (!steps.length) {
      showToast({ kind: 'info', title: 'Giro guidato non disponibile', body: 'Su questa pagina non ci sono comandi da mostrare.', duration: 4000 });
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
  window.cammesTour = { start: startTour, passi: passiDelGiro };

  // -------- ANIMAZIONE MECCANISMO CAM (2D schematico) --------------------
  // Vista laterale: camma che ruota + follower che segue il profilo + stelo/
  // valvola che apre + molla che si comprime. Canvas 2D puro, offline-safe.
  // drawCamMechanism(ctx, opts): disegno puro di un fotogramma.
  //   opts: { w, h, camAngleDeg, camLift (array 1..360 mm | null), followerLift (mm),
  //           rBase (mm), maxLift (mm), followerType, rocker, rRoll (mm) }
  function _cam_css(name, fallback) {
    try { var v = getCssVar(name); return v || fallback; } catch (e) { return fallback; }
  }
  function drawCamMechanism(ctx, o) {
    var w = o.w, h = o.h;
    var rBase = o.rBase || 14, maxLift = o.maxLift || 10, rocker = o.rocker || 1;
    var fLift = Math.max(0, o.followerLift || 0);
    var ang = ((o.camAngleDeg || 0) % 360 + 360) % 360;
    var ftype = o.followerType || 'punt';
    var rRoll = o.rRoll || 8;
    var accent = _cam_css('--accent', '#00d4ff');
    var danger = _cam_css('--danger', '#ff5252');
    var muted = _cam_css('--text-muted', '#8888aa');
    var card = _cam_css('--bg-card', '#1a1a2e');

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = _cam_css('--bg-input', '#12121f'); ctx.fillRect(0, 0, w, h);

    var rMax = rBase + maxLift;                 // mm
    // Layout dai budget reali: sotto il perno deve starci l'INTERO raggio max
    // (a riposo il lobo punta in basso, lontano dal follower — col perno fisso
    // a 0.80h il naso usciva dal canvas e la camma appariva mozzata); sopra
    // servono follower+molla+valvola (~96px) più il readout.
    var topBudget = 96;
    var pivotX = w * 0.5;
    var scale = Math.min((w * 0.5 - 8) / rMax, (h - topBudget - 28) / (2 * rMax));
    var pivotY = h - rMax * scale - 8;
    var DEG = Math.PI / 180;

    // ---- molla + valvola (sopra), disegnate prima così la camma le copre al contatto ----
    var contactY = pivotY - (rBase + fLift) * scale;         // y del punto di contatto (alto)
    var followerH = 16;                                      // altezza corpo follower px
    var stemTopY = contactY - followerH - (maxLift - fLift) * scale * 0.0 - 70; // testa valvola
    var valveLiftMm = fLift * rocker;

    // stelo valvola
    ctx.strokeStyle = muted; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(pivotX, contactY - followerH); ctx.lineTo(pivotX, stemTopY); ctx.stroke();
    // molla attorno allo stelo: coils compressi con l'alzata
    var springTop = stemTopY + 6, springBot = contactY - followerH - 4;
    var coils = 7;
    var compress = 1 - 0.45 * (fLift / (maxLift || 1));      // 1=esteso, <1 compresso
    ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.beginPath();
    var segs = coils * 2, sx = 9;
    for (var c = 0; c <= segs; c++) {
      var yy = springTop + (springBot - springTop) * (c / segs) * compress;
      var xx = pivotX + ((c % 2 === 0) ? -sx : sx);
      if (c === 0) ctx.moveTo(pivotX, springTop); else ctx.lineTo(xx, yy);
    }
    ctx.lineTo(pivotX, springBot); ctx.stroke();
    // testa valvola (trapezio)
    ctx.fillStyle = (valveLiftMm > 0.05) ? accent : muted;
    ctx.beginPath();
    ctx.moveTo(pivotX - 22, stemTopY); ctx.lineTo(pivotX + 22, stemTopY);
    ctx.lineTo(pivotX + 14, stemTopY - 10); ctx.lineTo(pivotX - 14, stemTopY - 10);
    ctx.closePath(); ctx.fill();

    // ---- follower ----
    ctx.fillStyle = card; ctx.strokeStyle = accent; ctx.lineWidth = 2;
    if (ftype === 'roller') {
      var rr = Math.max(6, rRoll * scale);
      ctx.beginPath(); ctx.arc(pivotX, contactY - rr, rr, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(pivotX, contactY - rr, 2.5, 0, 2 * Math.PI); ctx.fill();
    } else if (ftype === 'finger') {
      // leva: braccio inclinato che tocca la camma
      ctx.beginPath(); ctx.moveTo(pivotX - 34, contactY - followerH); ctx.lineTo(pivotX + 18, contactY);
      ctx.lineTo(pivotX + 18, contactY - 6); ctx.lineTo(pivotX - 30, contactY - followerH - 6);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else { // bicchiere / puntalino: piattello
      ctx.fillRect(pivotX - 18, contactY - followerH, 36, followerH);
      ctx.strokeRect(pivotX - 18, contactY - followerH, 36, followerH);
      ctx.strokeStyle = accent; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(pivotX - 20, contactY); ctx.lineTo(pivotX + 20, contactY); ctx.stroke();
    }

    // ---- camma (forma polare ruotata) ----
    ctx.save();
    ctx.translate(pivotX, pivotY);
    ctx.fillStyle = 'rgba(120,130,160,0.18)';
    ctx.strokeStyle = accent; ctx.lineWidth = 2;
    ctx.beginPath();
    if (o.camLift && o.camLift.length >= 360) {
      // Gradi MANCANTI (undefined/NaN, es. run ripetuti con buchi): tieni
      // l'ultimo valore valido invece di crollare a 0 — prima ogni buco
      // scavava una tacca finta fino al cerchio base. Il primo valido fa da
      // innesco così anche un buco al grado 1 non parte da zero.
      var lastLift = 0;
      for (var s0 = 1; s0 <= 360; s0++) { var v0 = Number(o.camLift[s0]); if (isFinite(v0) && v0 >= 0) { lastLift = v0; break; } }
      for (var phi = 0; phi < 360; phi++) {
        var rawL = Number(o.camLift[phi + 1]);
        if (isFinite(rawL) && rawL >= 0) lastLift = rawL;
        var r = (rBase + lastLift) * scale;
        // φ a "ore 12" quando φ===ang → angolo schermo = (φ - ang) - 90°
        var a = (phi - ang - 90) * DEG;
        var x = r * Math.cos(a), y = r * Math.sin(a);
        if (phi === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else {
      // nessun profilo: cerchio base
      ctx.arc(0, 0, rBase * scale, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    }
    // mozzo + tacca di fase (per vedere la rotazione)
    ctx.fillStyle = muted; ctx.beginPath(); ctx.arc(0, 0, 4, 0, 2 * Math.PI); ctx.fill();
    ctx.strokeStyle = danger; ctx.lineWidth = 2;
    var ta = (-ang - 90) * DEG;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(rBase * scale * 0.8 * Math.cos(ta), rBase * scale * 0.8 * Math.sin(ta)); ctx.stroke();
    ctx.restore();

    // ---- readout ----
    // camLabelDeg/liftLabelMm: valori REALI da mostrare quando la geometria
    // disegnata è schematica (widget live di Alzata: la camma è un indicatore
    // di posizione, ma i numeri restano quelli veri di encoder e comparatore).
    var labDeg = (typeof o.camLabelDeg === 'number') ? o.camLabelDeg : ang;
    var labMm = (typeof o.liftLabelMm === 'number') ? o.liftLabelMm : fLift;
    ctx.fillStyle = muted; ctx.font = '11px monospace'; ctx.textAlign = 'left';
    ctx.fillText('camma ' + Math.round(labDeg) + '°', 8, 14);
    ctx.fillText('alzata ' + cammesNum(labMm, 2) + ' mm', 8, 28);
    // La riga valvola solo quando DIFFERISCE dall'alzata (bilanciere/follower
    // attivi, come in Analisi): nella vista live di Alzata (puntalino 1:1)
    // erano sempre identiche — un numero doppio senza informazione.
    if (Math.abs(valveLiftMm - fLift) > 0.005) {
        ctx.fillText('valvola ' + cammesNum(valveLiftMm, 2) + ' mm', 8, 42);
    }
  }

  // Animatore: chiama frameFn() ogni rAF per ottenere gli opts e ridisegna.
  // Guardia visibilità (rAF si ferma in tab nascoste) → watchdog setTimeout.
  function createCamAnimator(canvas, frameFn) {
    var ctx = canvas.getContext('2d');
    var running = false, raf = null, wd = null;
    function tick() {
      if (!running) return;
      try {
        var o = frameFn();
        if (o) { o.w = canvas.width; o.h = canvas.height; drawCamMechanism(ctx, o); }
      } catch (e) {}
      // audit APP-14: annulla il rAF precedente prima di richiederne uno nuovo,
      // altrimenti al ritorno in foreground si accumulano rAF pendenti (il fallback
      // setTimeout puo' aver gia' schedulato un tick mentre rAF era sospeso).
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
      clearTimeout(wd); wd = setTimeout(tick, 120);   // fallback se rAF è sospeso
    }
    return {
      start: function () { if (running) return; running = true; tick(); },
      stop: function () { running = false; if (raf) cancelAnimationFrame(raf); clearTimeout(wd); },
      drawOnce: function () { try { var o = frameFn(); if (o) { o.w = canvas.width; o.h = canvas.height; drawCamMechanism(ctx, o); } } catch (e) {} },
      isRunning: function () { return running; }
    };
  }
  window.cammesCamAnim = { draw: drawCamMechanism, animator: createCamAnimator };

  // -------- INIT al DOM ready --------------------------------------------
  function init() {
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.addEventListener('click', toggleTheme);
    const helpBtn = document.getElementById('help-toggle');
    if (helpBtn) helpBtn.addEventListener('click', showWizard);
    // Messaggi, Giro guidato, Guida e Manuale nella barra in alto, aggiunti
    // da qui cosi' non serve modificare gli HTML; poi la barra si adatta
    // alla larghezza invece di tagliare i pulsanti a destra.
    if (installaBarraAiuti()) sorvegliaBarraAlta();
    // Esc chiude il registro messaggi se aperto
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var p = document.getElementById('msglog-panel');
      if (p && p.classList.contains('visible')) toggleMsgLog();
    });
    refreshTooltips();
    showWizardIfFirstTime();
    // Badge versione (assistenza: sapere quale build gira su un PC d'officina)
    if (!document.getElementById('cammes-version-badge')) {
      var vb = document.createElement('div');
      vb.id = 'cammes-version-badge';
      vb.textContent = 'CAMMES ' + CAMMES_VERSION;
      vb.title = 'Versione del programma: citala quando chiedi assistenza';
      // 13 px senza trasparenza: il manuale la indica come riferimento per
      // l'assistenza, quindi deve leggersi. z-index 4: una barra di comandi
      // appiccicata al fondo (z-index 5 in Home e Analisi) le passa sopra,
      // cosi' la scritta non finisce sopra un pulsante.
      vb.style.cssText = 'position:fixed;right:8px;bottom:6px;z-index:4;font-size:13px;' +
        'color:var(--text-muted,#8f9bb0);pointer-events:none;user-select:none;';
      document.body.appendChild(vb);
    }
    checkForUpdates();
  }

  // -------- UPDATE CHECK ---------------------------------------------------
  // Interroga il server (che a sua volta chiede a GitHub Releases, cache 1h)
  // e avvisa con un toast se esiste una versione più nuova. Non bloccante,
  // silenzioso se offline; l'avviso appare una sola volta per sessione.
  function checkForUpdates() {
    try { if (sessionStorage.getItem('cammes-upd-notified')) return; } catch (e) {}
    if (!window.fetch) return;
    fetch('/api/update-check').then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !d.updateAvailable) return;
      try { sessionStorage.setItem('cammes-upd-notified', '1'); } catch (e) {}
      // In chiaro che cosa fare col file. AUDIT SEC-10: l'app non scarica ne'
      // esegue nulla da sola, e l'impronta SHA-256 attesa (per controllare il
      // file con certutil prima di avviarlo) la mostra la Home, in Sistema e
      // manutenzione: qui, davanti all'operatore, niente sigle e comandi.
      var nomeFile = window.cammesEscape(d.downloadName || 'cammes.exe');
      if (window.cammesToast) window.cammesToast({
        kind: 'info',
        title: 'Aggiornamento disponibile: v' + window.cammesEscape(d.latest),
        body: 'Stai usando la ' + CAMMES_VERSION + '. <a href="' + window.cammesEscape(d.downloadUrl || d.url || '') +
              '" target="_blank" rel="noopener" style="color:var(--accent-text);">' +
              (d.downloadUrl ? 'Scarica ' + nomeFile : 'Apri la pagina della versione') + '</a>. ' +
              'Per aggiornare chiudi la finestra di ' + nomeFile + ', metti il file nuovo al posto del vecchio, ' +
              'nella stessa cartella (l&igrave; ci sono le misure e le impostazioni), e riavvialo. ' +
              'L\'impronta del file per l\'assistenza e il firmware dell\'Arduino sono in Home, <b>Sistema e manutenzione</b>.',
        duration: 20000
      });
    }).catch(function () {});
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
