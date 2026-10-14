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
  play: '<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4Z"/>',
  box: '<path d="M21 8 12 3 3 8l9 5 9-5Z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
  shelf: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18"/><path d="M7 6h3M13 12h4M7 18h4"/>'
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

function fmtMoney(n){
  return (n||0).toLocaleString(undefined, {maximumFractionDigits:2});
}
function parseHebDate(d){
  if(!d || typeof d !== 'string') return NaN;
  const [dd,mm,yy] = d.split('.').map(Number);
  if(!dd || !mm || !yy) return NaN;
  return new Date(yy,mm-1,dd).getTime();
}

/* ---------- Escaping לטקסט חופשי ---------- */
/* Escaping בסיסי לטקסט חופשי (תגובות/הודעות) לפני הזרקה ל-innerHTML —
   מונע HTML/JS שרירותי מלרוץ אם מישהו כותב תגובה שמכילה תווי HTML. */
function esc(str){
  return (str==null ? '' : String(str))
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

/* ---------- טעינה עצלה של ספריית האקסל ---------- */
/* xlsx.full.min.js שוקל 881KB ורוב המשתמשים (סניפים) אף פעם לא צריכים
   אותו. נטען פעם ראשונה רק כשבאמת פותחים ייבוא/ייצוא אקסל (רכש, טפסי
   תחרות, דוח יומי, סטנדים), ונשמר בזיכרון כדי לא לטעון פעמיים. */
let _xlsxLoadPromise = null;
function loadXlsxLib(){
  if (typeof XLSX !== 'undefined') return Promise.resolve();
  if (_xlsxLoadPromise) return _xlsxLoadPromise;
  _xlsxLoadPromise = new Promise(function(resolve, reject){
    const s = document.createElement('script');
    s.src = 'vendor/xlsx.full.min.js';
    s.onload = resolve;
    s.onerror = function(){ _xlsxLoadPromise = null; reject(new Error('טעינת ספריית האקסל נכשלה')); };
    document.head.appendChild(s);
  });
  return _xlsxLoadPromise;
}

/* ============================================================
   "עודכן לאחרונה" — שורה אחידה בכל תוכן שעולה לאפליקציה
   ------------------------------------------------------------
   פורמט קבוע: "עודכן לאחרונה בתאריך: 14.10.2026, שעה: 13:27".
   הזמן נלקח מהשדה העדכני ביותר שקיים על הפריט: updatedAt / createdAt /
   publishedAt / importedAt (Firestore Timestamp, Date, מספר מילישניות,
   או מחרוזת "DD.MM.YYYY" / "DD.MM.YYYY HH:MM"). לפריטים ישנים בלי שדות
   כאלה נופלים חזרה ל-date + time שנשמרו כטקסט. אם אין שעה ידועה בכלל
   (רק תאריך) — מוצג רק התאריך, בלי להמציא שעה.
============================================================ */
function anyToTimeInfo(v){
  if(v===null || v===undefined || v==='') return null;
  if(typeof v.toDate === 'function') return { ms: v.toDate().getTime(), hasTime: true };
  if(v instanceof Date) return isNaN(v.getTime()) ? null : { ms: v.getTime(), hasTime: true };
  if(typeof v === 'number') return { ms: v, hasTime: true };
  if(typeof v === 'object' && typeof v.seconds === 'number') return { ms: v.seconds*1000, hasTime: true };
  if(typeof v === 'string'){
    const m = v.trim().match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})(?:[ ,T]+(\d{1,2}):(\d{2}))?/);
    if(m){
      const d = new Date(+m[3], +m[2]-1, +m[1], m[4]!==undefined ? +m[4] : 0, m[5]!==undefined ? +m[5] : 0);
      return { ms: d.getTime(), hasTime: m[4]!==undefined };
    }
    const iso = Date.parse(v);
    if(!isNaN(iso) && /\d{4}-\d{2}-\d{2}/.test(v)) return { ms: iso, hasTime: /T\d{2}:\d{2}/.test(v) };
  }
  return null;
}
/* מחזיר {ms, hasTime} של העדכון האחרון של הפריט, או null. אפשר להעביר
   רשימת שדות נוספים (extraFields) — למשל salesUpdatedAt בתחרויות. */
function itemLastUpdatedInfo(item, extraFields){
  if(!item) return null;
  const fields = ['updatedAt','createdAt','publishedAt','importedAt','lastUpdated'].concat(extraFields || []);
  let best = null;
  fields.forEach(function(f){
    const info = anyToTimeInfo(item[f]);
    if(info && (!best || info.ms > best.ms || (info.ms === best.ms && info.hasTime && !best.hasTime))) best = info;
  });
  if(!best && item.date){
    const legacy = anyToTimeInfo(item.date + (item.time ? ' ' + item.time : ''));
    if(legacy) best = legacy;
  }
  return best;
}
function formatLastUpdatedText(info){
  if(!info || !info.ms) return '';
  const d = new Date(info.ms);
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const yyyy = d.getFullYear();
  if(!info.hasTime) return `עודכן לאחרונה בתאריך: ${dd}.${mm}.${yyyy}`;
  const hh = String(d.getHours()).padStart(2,'0');
  const mi = String(d.getMinutes()).padStart(2,'0');
  return `עודכן לאחרונה בתאריך: ${dd}.${mm}.${yyyy}, שעה: ${hh}:${mi}`;
}
/* השורה עצמה, מוכנה להזרקה ל-HTML. ריקה אם אין שום מידע זמן. */
function lastUpdatedHtml(item, extraFields){
  ensureLastUpdatedStyles();
  const text = formatLastUpdatedText(itemLastUpdatedInfo(item, extraFields));
  return text ? `<div class="last-updated">🕒 ${text}</div>` : '';
}
/* גרסה לרשימה שלמה (מסך שמציג אוסף כמו חוברת מבצעים) — לוקחת את העדכון
   האחרון מבין כל הפריטים. */
function lastUpdatedHtmlForList(items, extraFields){
  let best = null;
  (items || []).forEach(function(it){
    const info = itemLastUpdatedInfo(it, extraFields);
    if(info && (!best || info.ms > best.ms)) best = info;
  });
  ensureLastUpdatedStyles();
  const text = formatLastUpdatedText(best);
  return text ? `<div class="last-updated">🕒 ${text}</div>` : '';
}
let _lastUpdatedStylesInjected = false;
function ensureLastUpdatedStyles(){
  if(_lastUpdatedStylesInjected) return;
  _lastUpdatedStylesInjected = true;
  const style = document.createElement('style');
  style.textContent = '.last-updated{font-size:12px;color:var(--muted);margin:6px 0 2px;line-height:1.5;}';
  document.head.appendChild(style);
}
