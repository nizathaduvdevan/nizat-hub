/* ============================================================
   נגישות — כפתור צף ♿ + תפריט הגדרות נגישות
   ------------------------------------------------------------
   קובץ עצמאי: לא משנה שום קובץ אחר ולא נוגע ב-main.css. כל העיצוב
   מוזרק מכאן (כמו ensureLastUpdatedStyles ב-ui-utils.js).

   איך זה עובד:
   כל אפשרות מוסיפה מחלקה (class) לתגית <html>, וה-CSS שלמטה משנה את
   התצוגה לפיה. כך כל המסכים והמודולים מושפעים בבת אחת, בלי לגעת בכל
   מודול בנפרד.
     a11y-text-up      — הגדלת טקסט (zoom על אזור התוכן והחלונות)
     a11y-contrast     — ניגודיות גבוהה (עובד גם במצב כהה)
     a11y-links        — הדגשת קישורים וכפתורים
     a11y-no-motion    — עצירת אנימציות
     a11y-readable     — גופן קריא + ריווח שורות

   שמירה: ההעדפות נשמרות בדפדפן של המכשיר (localStorage). אם במכשיר
   מוגדרת העדפת "הפחתת תנועה" ברמת מערכת ההפעלה — עצירת האנימציות
   מופעלת אוטומטית בכניסה הראשונה.

   בנוסף, תמיד (בלי קשר לתפריט): מסגרת פוקוס ברורה למי שמנווט במקלדת.
============================================================ */
(function(){
  var STORAGE_KEY = 'nizatA11y';

  var DEFAULTS = {
    textSize: 0,
    contrast: false,
    links: false,
    noMotion: false,
    readableFont: false
  };

  var TEXT_SIZES = [
    { label: 'רגיל',      zoom: 1,    letterPx: 15 },
    { label: 'גדול',      zoom: 1.12, letterPx: 19 },
    { label: 'גדול מאוד', zoom: 1.25, letterPx: 23 }
  ];

  var TOGGLES = [
    { key: 'contrast',     cls: 'a11y-contrast',  title: 'ניגודיות גבוהה',          sub: 'טקסט כהה וחד יותר, מסגרות ברורות' },
    { key: 'links',        cls: 'a11y-links',     title: 'הדגשת קישורים וכפתורים', sub: 'קו תחתון ומסגרת לכל מה שאפשר ללחוץ עליו' },
    { key: 'noMotion',     cls: 'a11y-no-motion', title: 'עצירת אנימציות',          sub: 'ביטול תנועה והבהובים במסך' },
    { key: 'readableFont', cls: 'a11y-readable',  title: 'גופן קריא',               sub: 'גופן פשוט יותר וריווח שורות גדול' }
  ];

  var A11Y_ICON = '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="12" cy="4.3" r="1.9" fill="currentColor" stroke="none"/>' +
    '<path d="M5 8.5l7 1.6 7-1.6"/><path d="M12 10.1v5"/><path d="M12 15.1l-3.6 6M12 15.1l3.6 6"/></svg>';

  var state = loadState();

  /* ---------- שמירה וטעינה ---------- */
  function loadState(){
    var s = {};
    Object.keys(DEFAULTS).forEach(function(k){ s[k] = DEFAULTS[k]; });
    try{
      var raw = localStorage.getItem(STORAGE_KEY);
      if(raw){
        var saved = JSON.parse(raw) || {};
        Object.keys(DEFAULTS).forEach(function(k){
          if(saved[k] !== undefined) s[k] = saved[k];
        });
      } else if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches){
        s.noMotion = true;
      }
    }catch(e){ /* דפדפן פרטי / אחסון חסום — ממשיכים עם ברירת מחדל */ }
    s.textSize = Math.min(Math.max(parseInt(s.textSize, 10) || 0, 0), TEXT_SIZES.length - 1);
    return s;
  }

  function saveState(){
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch(e){}
  }

  function isDefaultState(){
    return Object.keys(DEFAULTS).every(function(k){ return state[k] === DEFAULTS[k]; });
  }

  /* ---------- החלת ההגדרות על העמוד ---------- */
  function applyState(){
    var html = document.documentElement;
    html.style.setProperty('--a11y-zoom', String(TEXT_SIZES[state.textSize].zoom));
    html.classList.toggle('a11y-text-up', state.textSize > 0);
    TOGGLES.forEach(function(t){ html.classList.toggle(t.cls, !!state[t.key]); });
    updateUi();
  }

  /* ---------- עיצוב ---------- */
  function injectStyles(){
    if(document.getElementById('a11y-styles')) return;
    var css = [
      /* מסגרת פוקוס ברורה — תמיד פעילה, רק לניווט במקלדת */
      ':focus-visible{outline:3px solid var(--brand-primary);outline-offset:2px;}',

      /* --- הגדלת טקסט --- */
      'html.a11y-text-up #content, html.a11y-text-up .modal{zoom:var(--a11y-zoom);}',

      /* --- ניגודיות גבוהה --- */
      'html.a11y-contrast{--text-secondary:#1f1f1d;--muted:#45443f;--gridline:#9a998f;--border:rgba(11,11,11,0.45);}',
      'html.a11y-contrast[data-theme="dark"]{--text-secondary:#f2f1ea;--muted:#d6d5cc;--gridline:#6b6a64;--border:rgba(255,255,255,0.45);}',
      'html.a11y-contrast ::placeholder{color:var(--muted);opacity:1;}',
      'html.a11y-contrast .card, html.a11y-contrast .home-tool-card, html.a11y-contrast .admin-tool-card, html.a11y-contrast .dashboard-action-btn{border-width:1.5px;}',

      /* --- הדגשת קישורים וכפתורים --- */
      'html.a11y-links a, html.a11y-links .link-btn, html.a11y-links .comments-toggle, html.a11y-links .comp-group-toggle, html.a11y-links .notif-head button{text-decoration:underline !important;text-underline-offset:3px;}',
      'html.a11y-links button:not(.a11y-row):not(.a11y-size-btn):not(.a11y-fab), html.a11y-links a, html.a11y-links [onclick]:not(.mobile-more-backdrop):not(.modal-overlay){box-shadow:0 0 0 2px var(--brand-primary) !important;}',

      /* --- עצירת אנימציות --- */
      'html.a11y-no-motion *, html.a11y-no-motion *::before, html.a11y-no-motion *::after{animation-duration:0.001ms !important;animation-iteration-count:1 !important;transition-duration:0.001ms !important;scroll-behavior:auto !important;}',

      /* --- גופן קריא --- */
      'html.a11y-readable body, html.a11y-readable button, html.a11y-readable input, html.a11y-readable select, html.a11y-readable textarea{font-family:Arial,"Segoe UI",Tahoma,sans-serif !important;}',
      'html.a11y-readable body{line-height:1.6;letter-spacing:.01em;}',
      'html.a11y-readable .comp-desc, html.a11y-readable .instr-body, html.a11y-readable .notif-item .nb, html.a11y-readable .comment-text, html.a11y-readable .aconv-msg{line-height:1.9;}',

      /* --- הכפתור הצף --- */
      '.a11y-fab{position:fixed;z-index:90;right:18px;bottom:20px;width:46px;height:46px;border-radius:50%;border:none;' +
        'background:var(--brand-primary);color:#fff;font-size:25px;display:flex;align-items:center;justify-content:center;' +
        'box-shadow:var(--shadow-lg);cursor:pointer;padding:0;}',
      '.a11y-fab:hover{background:var(--brand-primary-dark);}',
      '.a11y-fab.is-active::after{content:"";position:absolute;top:1px;left:1px;width:12px;height:12px;border-radius:50%;' +
        'background:var(--yellow);border:2px solid var(--surface-1);}',
      '@media (max-width:880px){.a11y-fab{right:12px;bottom:calc(78px + env(safe-area-inset-bottom));width:42px;height:42px;font-size:23px;}}',

      /* --- חלון התפריט --- */
      '.a11y-panel{display:none;position:fixed;z-index:95;right:18px;bottom:76px;width:min(340px, calc(100vw - 24px));' +
        'max-height:calc(100vh - 110px);overflow-y:auto;background:var(--surface-1);color:var(--text-primary);' +
        'border:1px solid var(--border);border-radius:16px;box-shadow:var(--shadow-lg);padding:16px;direction:rtl;text-align:right;}',
      '.a11y-panel.open{display:block;}',
      '@media (max-width:880px){.a11y-panel{right:12px;bottom:calc(128px + env(safe-area-inset-bottom));max-height:calc(100vh - 190px);}}',
      '.a11y-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;}',
      '.a11y-head h2{margin:0;font-size:17px;font-weight:700;display:flex;align-items:center;gap:8px;}',
      '.a11y-close{border:none;background:none;font-size:22px;line-height:1;color:var(--text-secondary);width:34px;height:34px;border-radius:8px;cursor:pointer;}',
      '.a11y-close:hover{background:var(--page);}',
      '.a11y-section-title{font-size:13px;font-weight:700;color:var(--text-secondary);margin:2px 0 0;}',
      '.a11y-sizes{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:8px 0 10px;}',
      '.a11y-size-btn{border:1.5px solid var(--gridline);background:var(--page);color:var(--text-primary);border-radius:10px;' +
        'padding:8px 4px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:3px;font:inherit;cursor:pointer;min-height:58px;}',
      '.a11y-size-btn b{line-height:1;font-weight:700;}',
      '.a11y-size-btn span{font-size:12px;color:var(--text-secondary);}',
      '.a11y-size-btn[aria-pressed="true"]{border-color:var(--brand-primary);background:rgba(69,122,31,0.12);}',
      '.a11y-row{display:flex;align-items:center;gap:12px;width:100%;padding:11px 4px;border:none;border-bottom:1px solid var(--gridline);' +
        'background:none;text-align:right;color:inherit;font:inherit;cursor:pointer;}',
      '.a11y-row:last-of-type{border-bottom:none;}',
      '.a11y-row-text{flex:1;min-width:0;}',
      '.a11y-row-title{font-size:15px;font-weight:600;}',
      '.a11y-row-sub{font-size:12.5px;color:var(--text-secondary);margin-top:2px;line-height:1.4;}',
      '.a11y-switch{width:42px;height:24px;border-radius:99px;background:var(--gridline);position:relative;flex:none;transition:background .15s ease;}',
      '.a11y-switch::after{content:"";position:absolute;top:3px;right:3px;width:18px;height:18px;border-radius:50%;background:#fff;' +
        'box-shadow:0 1px 3px rgba(0,0,0,.25);transition:right .15s ease;}',
      '.a11y-row[aria-checked="true"] .a11y-switch{background:var(--brand-primary);}',
      '.a11y-row[aria-checked="true"] .a11y-switch::after{right:21px;}',
      '.a11y-reset{width:100%;margin-top:12px;padding:10px;border-radius:10px;border:1px solid var(--gridline);background:none;' +
        'color:var(--text-primary);font:inherit;font-size:14.5px;font-weight:600;cursor:pointer;}',
      '.a11y-reset:hover{border-color:var(--critical);color:var(--critical);}',
      '.a11y-note{font-size:12px;color:var(--muted);margin-top:10px;text-align:center;line-height:1.5;}',
      '.a11y-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;}'
    ].join('\n');

    var style = document.createElement('style');
    style.id = 'a11y-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  /* ---------- בניית הכפתור והתפריט ---------- */
  var fab = null;
  var panel = null;
  var liveRegion = null;

  function buildUi(){
    if(document.getElementById('a11y-fab')) return;
    injectStyles();

    fab = document.createElement('button');
    fab.id = 'a11y-fab';
    fab.type = 'button';
    fab.className = 'a11y-fab';
    fab.title = 'נגישות';
    fab.setAttribute('aria-label', 'פתיחת תפריט נגישות');
    fab.setAttribute('aria-haspopup', 'dialog');
    fab.setAttribute('aria-expanded', 'false');
    fab.setAttribute('aria-controls', 'a11y-panel');
    fab.innerHTML = A11Y_ICON;
    fab.addEventListener('click', function(e){
      e.stopPropagation();
      if(isOpen()) closePanel(); else openPanel();
    });

    panel = document.createElement('div');
    panel.id = 'a11y-panel';
    panel.className = 'a11y-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'הגדרות נגישות');
    panel.innerHTML = panelHtml();
    panel.addEventListener('click', onPanelClick);

    liveRegion = panel.querySelector('.a11y-sr');

    document.body.appendChild(panel);
    document.body.appendChild(fab);

    /* לחיצה מחוץ לתפריט סוגרת אותו */
    document.addEventListener('click', function(e){
      if(isOpen() && !panel.contains(e.target) && e.target !== fab) closePanel();
    });
    /* Esc סוגר ומחזיר את הפוקוס לכפתור */
    document.addEventListener('keydown', function(e){
      if(e.key === 'Escape' && isOpen()){
        closePanel();
        fab.focus();
      }
    });

    updateUi();
  }

  function panelHtml(){
    var sizes = TEXT_SIZES.map(function(s, i){
      return '<button type="button" class="a11y-size-btn" data-size="' + i + '" aria-pressed="false">' +
        '<b style="font-size:' + s.letterPx + 'px;">א</b><span>' + s.label + '</span></button>';
    }).join('');

    var toggles = TOGGLES.map(function(t){
      return '<button type="button" class="a11y-row" role="switch" aria-checked="false" data-toggle="' + t.key + '">' +
        '<span class="a11y-row-text"><span class="a11y-row-title" style="display:block;">' + t.title + '</span>' +
        '<span class="a11y-row-sub" style="display:block;">' + t.sub + '</span></span>' +
        '<span class="a11y-switch" aria-hidden="true"></span></button>';
    }).join('');

    return '' +
      '<div class="a11y-head">' +
        '<h2>' + A11Y_ICON + 'הגדרות נגישות</h2>' +
        '<button type="button" class="a11y-close" data-action="close" aria-label="סגירת תפריט הנגישות">×</button>' +
      '</div>' +
      '<div class="a11y-section-title" id="a11y-size-label">גודל טקסט</div>' +
      '<div class="a11y-sizes" role="group" aria-labelledby="a11y-size-label">' + sizes + '</div>' +
      toggles +
      '<button type="button" class="a11y-reset" data-action="reset">איפוס להגדרות הרגילות</button>' +
      '<div class="a11y-note">ההגדרות נשמרות במכשיר הזה</div>' +
      '<div class="a11y-sr" aria-live="polite"></div>';
  }

  function onPanelClick(e){
    var btn = e.target.closest('button');
    if(!btn || !panel.contains(btn)) return;

    if(btn.hasAttribute('data-size')){
      state.textSize = parseInt(btn.getAttribute('data-size'), 10) || 0;
      saveState();
      applyState();
      announce('גודל טקסט: ' + TEXT_SIZES[state.textSize].label);
      return;
    }

    if(btn.hasAttribute('data-toggle')){
      var key = btn.getAttribute('data-toggle');
      state[key] = !state[key];
      saveState();
      applyState();
      var t = TOGGLES.filter(function(x){ return x.key === key; })[0];
      announce((t ? t.title : '') + (state[key] ? ' הופעל' : ' כובה'));
      return;
    }

    var action = btn.getAttribute('data-action');
    if(action === 'close'){
      closePanel();
      fab.focus();
    } else if(action === 'reset'){
      Object.keys(DEFAULTS).forEach(function(k){ state[k] = DEFAULTS[k]; });
      saveState();
      applyState();
      announce('הגדרות הנגישות אופסו');
    }
  }

  function announce(text){
    if(!liveRegion) return;
    liveRegion.textContent = '';
    setTimeout(function(){ liveRegion.textContent = text; }, 30);
  }

  function updateUi(){
    if(fab){
      fab.classList.toggle('is-active', !isDefaultState());
    }
    if(panel){
      var sizeBtns = panel.querySelectorAll('[data-size]');
      for(var i = 0; i < sizeBtns.length; i++){
        sizeBtns[i].setAttribute('aria-pressed', String(parseInt(sizeBtns[i].getAttribute('data-size'), 10) === state.textSize));
      }
      var rows = panel.querySelectorAll('[data-toggle]');
      for(var j = 0; j < rows.length; j++){
        rows[j].setAttribute('aria-checked', String(!!state[rows[j].getAttribute('data-toggle')]));
      }
    }
  }

  function isOpen(){
    return !!(panel && panel.classList.contains('open'));
  }

  function openPanel(){
    if(!panel) return;
    panel.classList.add('open');
    fab.setAttribute('aria-expanded', 'true');
    var first = panel.querySelector('[data-size][aria-pressed="true"]') || panel.querySelector('button');
    if(first) first.focus();
  }

  function closePanel(){
    if(!panel) return;
    panel.classList.remove('open');
    fab.setAttribute('aria-expanded', 'false');
  }

  /* ---------- הפעלה ---------- */
  injectStyles();
  applyState();
  if(document.body){
    buildUi();
  } else {
    document.addEventListener('DOMContentLoaded', buildUi);
  }

  /* גישה מקוד אחר, למשל קישור "נגישות" בתפריט "עוד" בעתיד */
  window.nizatA11y = {
    open: openPanel,
    close: closePanel,
    reset: function(){
      Object.keys(DEFAULTS).forEach(function(k){ state[k] = DEFAULTS[k]; });
      saveState();
      applyState();
    }
  };
})();
