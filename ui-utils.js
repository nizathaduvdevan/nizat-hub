/* ============================================================
   ICONS — מערכת אייקוני SVG אחידה במקום אימוג'ים. כל אייקון בנוי
   בסגנון קווי אחיד (stroke=currentColor), בגודל 1em כך שהוא גדל/קטן
   אוטומטית לפי font-size של ההקשר שבו הוא מוצג — בלי צורך לכוונן
   גודל בנפרד בכל מקום. שלב ראשון: ניווט ראשי, פעמון התראות, מצב
   תצוגה, וסוגי ההתראות בפאנל. שאר האימוג'ים (מדליות, קטגוריות וכו')
   יוחלפו בשלב הבא.
   ============================================================ */
const ICON_PATHS = {
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
  map: '<path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2Z"/><path d="M9 4v14M15 6v14"/>',
  trophy: '<path d="M7 4h10v3a5 5 0 0 1-10 0V4Z"/><path d="M7 4H4a3 3 0 0 0 3 4M17 4h3a3 3 0 0 1-3 4"/><path d="M12 11v4M9 21h6"/>',
  clipboard: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"/><path d="M9 11h6M9 15h6"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>',
  download: '<path d="M12 4v11"/><path d="m8 11 4 4 4-4"/><path d="M5 19h14"/>',
  sign: '<path d="M6 21V4"/><path d="M6 5h11l-2.5 3L17 11H6"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v2.2M12 19.8V22M4.9 4.9l1.5 1.5M17.6 17.6l1.5 1.5M2 12h2.2M19.8 12H22M4.9 19.1l1.5-1.5M17.6 6.4l1.5-1.5"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  alertTriangle: '<path d="M12 3 2 20h20Z"/><path d="M12 9v5"/><circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  message: '<path d="M4 5h16v11H8l-4 4Z"/>',
  megaphone: '<path d="M3 10v4a1 1 0 0 0 1 1h2l1 5h2l-1-5h5l6 4V6l-6 4H6a1 1 0 0 0-1 1Z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  cart: '<circle cx="9" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.5 3h3l2.7 12.4a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L23 7H6"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  chart: '<path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6"/><rect x="13" y="8" width="3" height="10"/><rect x="19" y="5" width="3" height="13"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4Z"/>'
};
function icon(name, cls){
  return `<svg class="ui-icon ${cls||''}" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-0.15em;flex:none;">${ICON_PATHS[name]||''}</svg>`;
}

/* ---------- Toast ---------- */
function toast(msg){
  const wrap = document.getElementById('toast-wrap');
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  wrap.appendChild(t);
  requestAnimationFrame(()=>t.classList.add('show'));
  setTimeout(()=>{ t.classList.remove('show'); setTimeout(()=>t.remove(), 300); }, 2600);
}

function closeModal(){
  document.getElementById('modal-overlay').classList.remove('open');
  pendingImportGroups = null;
  pendingImportManagerColors = null;
  pendingImportRawTable = null;
  pendingImportHeaderRowCells = null;
  pendingLogoDataUrl = undefined;
  pendingHeroDesktopUrl = undefined;
  pendingHeroMobileUrl = undefined;
  pendingMaterialFile = null;
}

/* ---------- Theme (dark mode) ---------- */
function toggleTheme(){
  const html = document.documentElement;
  const next = html.getAttribute('data-theme')==='dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  document.getElementById('theme-toggle').innerHTML = next==='dark' ? icon('sun') : icon('moon');
}
