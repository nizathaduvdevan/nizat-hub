/* ============================================================
   topbar.js — הסרגל העליון (כיוון א׳)
   ------------------------------------------------------------
   • כפתור אישי (אווטאר + שם + חץ) שפותח תפריט: מצב כהה, הפעלת
     התראות, צפייה כמשתמש (מנהלים), נגישות, וכפתור התנתקות אדום.
   • השם בכפתור ובראש התפריט נלקח אוטומטית מ-#user-label ו-#user-avatar,
     ש-auth.js ממשיך למלא בדיוק כמו קודם (למשל "רונית · סניף רעננה"
     → בכפתור "רונית", ובתפריט "סניף רעננה" מתחת לשם).
   • התפריט נסגר בלחיצה מחוץ לו, ב-Esc, ובכל מעבר מסך.
   נטען אחרי notifications.js.
============================================================ */
function hubUserMenuEls(){
  return {
    menu: document.getElementById('user-menu'),
    btn: document.getElementById('user-menu-btn'),
    backdrop: document.getElementById('um-backdrop'),
    wrap: document.getElementById('user-menu-wrap')
  };
}

function toggleUserMenu(force){
  const el = hubUserMenuEls();
  if(!el.menu) return;
  const open = (force === undefined) ? !el.menu.classList.contains('open') : !!force;
  el.menu.classList.toggle('open', open);
  if(el.backdrop) el.backdrop.classList.toggle('open', open);
  if(el.btn) el.btn.setAttribute('aria-expanded', String(open));
  if(open){
    const np = document.getElementById('notif-panel');
    if(np) np.classList.remove('open');
    syncUserMenu();
    const first = el.menu.querySelector('.um-item:not([style*="display: none"]), .um-logout');
    if(first) setTimeout(() => first.focus({ preventScroll: true }), 30);
  }
}
function closeUserMenu(){ toggleUserMenu(false); }

/* שם / תת-כותרת / אווטאר מתוך מה ש-auth.js כתב */
function syncUserMenu(){
  const labelEl = document.getElementById('user-label');
  const avatarEl = document.getElementById('user-avatar');
  const label = labelEl ? (labelEl.textContent || '').trim() : '';
  const parts = label.split('·').map(s => s.trim()).filter(Boolean);
  const name = parts[0] || label;
  const sub = parts.slice(1).join(' · ');
  const set = (id, txt) => { const e = document.getElementById(id); if(e && e.textContent !== txt) e.textContent = txt; };
  set('user-name', name);
  set('um-name', name);
  set('um-sub', sub || (typeof currentUserEmail !== 'undefined' && currentUserEmail ? currentUserEmail : ''));
  set('um-avatar', avatarEl ? (avatarEl.textContent || '').trim() : '');
}

(function(){
  syncUserMenu();
  /* auth.js מעדכן את השם בכל כניסה / "צפייה כמשתמש" — מסנכרנים אוטומטית */
  if(window.MutationObserver){
    const obs = new MutationObserver(syncUserMenu);
    ['user-label', 'user-avatar'].forEach(function(id){
      const el = document.getElementById(id);
      if(el) obs.observe(el, { childList: true, characterData: true, subtree: true });
    });
  }
  document.addEventListener('click', function(e){
    const el = hubUserMenuEls();
    if(el.menu && el.menu.classList.contains('open') && el.wrap && !el.wrap.contains(e.target) && e.target !== el.backdrop) closeUserMenu();
  });
  document.addEventListener('keydown', function(e){
    const el = hubUserMenuEls();
    if(e.key === 'Escape' && el.menu && el.menu.classList.contains('open')){
      closeUserMenu();
      if(el.btn) el.btn.focus();
    }
  });
  /* מעבר מסך (כולל כפתור "חזרה") סוגר את התפריט */
  window.addEventListener('popstate', closeUserMenu);
  if(typeof goTo === 'function' && !goTo._hubWrapped){
    const orig = goTo;
    goTo = function(){ closeUserMenu(); return orig.apply(this, arguments); };
    goTo._hubWrapped = true;
  }
})();
