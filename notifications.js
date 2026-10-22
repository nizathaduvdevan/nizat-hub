/* ---------- Notifications ---------- */
const NOTIF_ICON = {instruction:icon('clipboard'), event:icon('calendar'), material:icon('download'), comment:icon('message'), message:icon('mail'), stand:icon('sign'), broadcast:icon('megaphone')};
const NOTIF_MAX_AGE_DAYS = 14;
const NOTIF_MAX_COUNT = 30;
/* שמירת ההתראות ל-localStorage, בנפרד לכל משתמש (לפי currentPushIdentity),
   כדי שהן ישרדו רענוני דף/כניסות חוזרות ולא רק יחיו בזיכרון עד לסגירת הטאב. */
function notifStorageKey(){
  const vid = (typeof currentPushIdentity==='function' && currentPushIdentity()) || 'anon';
  return 'nizatHubNotifications_' + vid.replace(/[^a-zA-Z0-9:_@.-]/g,'_');
}
function saveNotificationsToStorage(){
  try{ localStorage.setItem(notifStorageKey(), JSON.stringify(appData.notifications)); }catch(e){ /* storage unavailable — session-only */ }
}
function loadNotificationsFromStorage(){
  try{
    const raw = localStorage.getItem(notifStorageKey());
    appData.notifications = raw ? JSON.parse(raw) : [];
  }catch(e){ appData.notifications = []; }
}
/* מוסיפה התראה חדשה ושומרת מיד — יש להשתמש בזו במקום appData.notifications.unshift ישירות. */
function addNotification(n){
  appData.notifications.unshift(n);
  saveNotificationsToStorage();
}
/* מזהי שידורים (broadcasts) שהמשתמש מחק בעצמו מפאנל ההתראות — נשמר בנפרד
   כדי שהשידור לא "יחזור לחיות" בפעם הבאה שנשלוף מ-Firestore. */
function dismissedBroadcastsKey(){
  const vid = (typeof currentPushIdentity==='function' && currentPushIdentity()) || 'anon';
  return 'nizatHubDismissedBroadcasts_' + vid.replace(/[^a-zA-Z0-9:_@.-]/g,'_');
}
function getDismissedBroadcastIds(){
  try{ return new Set(JSON.parse(localStorage.getItem(dismissedBroadcastsKey())||'[]')); }catch(e){ return new Set(); }
}
function addDismissedBroadcastId(id){
  try{
    const set = getDismissedBroadcastIds();
    set.add(id);
    localStorage.setItem(dismissedBroadcastsKey(), JSON.stringify([...set]));
  }catch(e){ /* ignore */ }
}
/* שולף את היסטוריית השידורים (broadcasts) מ-Firestore ומשלב אותה בפאנל
   ההתראות — עובד בלי קשר אם ההודעה התקבלה כשהאתר היה פתוח, ברקע, או סגור
   לגמרי, ובלי קשר לאיזה מכשיר. נקרא בכל כניסה למערכת + נשאר "חי" (onSnapshot)
   כדי לתפוס גם שידורים חדשים שנשלחים תוך כדי שהאתר פתוח. */
let unsubBroadcastNotifs = null;
function initBroadcastNotifSync(){
  if (!firebaseReady || !db) return;
  if (unsubBroadcastNotifs) unsubBroadcastNotifs();
  const cutoff = Date.now() - NOTIF_MAX_AGE_DAYS*86400000;
  unsubBroadcastNotifs = db.collection('broadcasts').orderBy('sentAt', 'desc').limit(NOTIF_MAX_COUNT)
    .onSnapshot(function(snap){
      const dismissed = getDismissedBroadcastIds();
      const existingIds = new Set(appData.notifications.filter(n=>n.type==='broadcast').map(n=>n.id));
      let changed = false;
      snap.docs.forEach(function(doc){
        const d = doc.data();
        if (dismissed.has(doc.id) || existingIds.has(doc.id)) return;
        const sentAtMs = d.sentAt && d.sentAt.toMillis ? d.sentAt.toMillis() : Date.now();
        if (sentAtMs < cutoff) return;
        const isFreshlyArrived = (Date.now() - sentAtMs) < 5*60000; /* פחות מ-5 דקות = חדש */
        appData.notifications.push({
          id: doc.id, title: d.title || 'עדכון מ-NIZAT HUB', body: d.body || '',
          date: todayHeb(), type:'broadcast', read: !isFreshlyArrived, _sentAtMs: sentAtMs,
          department: d.department || null
        });
        changed = true;
      });
      if (changed){
        saveNotificationsToStorage();
        renderNotifPanel();
      }
    }, function(err){
      console.error('Firestore sync error (broadcasts notifications):', err);
    });
}
/* זמן ההתראה למיון (החדשה ביותר למעלה). שידורים (broadcasts) נושאים מזהה
   טקסט של Firestore, ולכן אי אפשר למיין לפי id — הזמן שלהם שמור ב-_sentAtMs.
   התראות מקומיות נוצרות עם id = Date.now(). אם אין אף אחד מהם — לפי התאריך. */
function notifTimeMs(n){
  if(n && n._sentAtMs) return n._sentAtMs;
  const idNum = Number(n && n.id);
  if(isFinite(idNum) && idNum > 1e12) return idNum;
  const t = parseHebDate(n && n.date);
  return isNaN(t) ? 0 : t;
}
function pruneNotifications(){
  const now = Date.now();
  const before = appData.notifications.length;
  appData.notifications = appData.notifications.filter(n=>{
    const t = parseHebDate(n.date);
    if(isNaN(t)) return true;
    return (now - t) <= NOTIF_MAX_AGE_DAYS*86400000;
  });
  if(appData.notifications.length > NOTIF_MAX_COUNT){
    appData.notifications.sort((a,b)=>notifTimeMs(b)-notifTimeMs(a));
    appData.notifications = appData.notifications.slice(0, NOTIF_MAX_COUNT);
  }
  if(appData.notifications.length !== before) saveNotificationsToStorage();
}
function deleteNotification(id){
  const n = appData.notifications.find(n=>n.id==id);
  if (n && n.type === 'broadcast') addDismissedBroadcastId(n.id);
  appData.notifications = appData.notifications.filter(n=>n.id!=id);
  saveNotificationsToStorage();
  renderNotifPanel();
}
/* מסמן התראה בודדת כ"נקראה" (בלחיצה על "אשר/י קריאה") — לאחר מכן מוצג כפתור
   מחיקה במקום. עבור התראות משידור (broadcast), זה גם נכתב ל-Firestore
   (itemReads) כדי שמחלקת השיווק תוכל לראות מי אישר קריאה ומי לא. */
function markNotificationRead(id){
  const n = appData.notifications.find(n=>n.id==id);
  if (!n) return;
  n.read = true;
  saveNotificationsToStorage();
  if (n.type === 'broadcast' && typeof markItemRead === 'function') markItemRead('broadcast', n.id);
  renderNotifPanel();
}
/* ============================================================
   מגירת ההתראות (אוקטובר 2026)
   ------------------------------------------------------------
   בטלפון: מגירה שעולה מלמטה, עם כותרת "ההתראות שלי", מתג חדשות/הכול
   וכפתור סגירה. במחשב: אותו תוכן בחלון שנפתח מתחת לכפתור "התראות".
   לחיצה על התראה מסמנת אותה כנקראה — ובשידורים (broadcast) גם רושמת
   את הקריאה ב-itemReads, בדיוק כמו "אשר/י קריאה" הישן, כדי שהשיווק
   ימשיך לראות מי קרא. אם להתראה יש מסך מתאים (סטנד, הודעה, הוראה…)
   היא גם פותחת אותו.
   ============================================================ */
const NOTIF_STYLE = {
  broadcast:   { icon:'megaphone', bg:'rgba(69,122,31,0.12)', fg:'#375f18' },
  instruction: { icon:'clipboard', bg:'rgba(237,161,0,0.16)', fg:'#8a5a00' },
  stand:       { icon:'sign',      bg:'rgba(176,24,40,0.10)', fg:'#b01828' },
  message:     { icon:'mail',      bg:'rgba(43,93,155,0.12)', fg:'#2b5d9b' },
  comment:     { icon:'message',   bg:'rgba(43,93,155,0.12)', fg:'#2b5d9b' },
  event:       { icon:'calendar',  bg:'rgba(74,58,167,0.12)', fg:'#4a3aa7' },
  material:    { icon:'download',  bg:'rgba(27,175,122,0.14)', fg:'#137a55' }
};
/* לאיזה מסך כל סוג התראה מוביל (אין = רק סימון כנקראה) */
const NOTIF_VIEW = { stand:'stands', message:'messages', comment:'messages', instruction:'instructions', event:'events', material:'materials' };
const NOTIF_FILLED_BELL = '<svg class="ui-icon" width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true" style="vertical-align:-0.15em;flex:none;"><path fill="currentColor" d="M12 2.5a1.5 1.5 0 0 1 1.5 1.5v.6A6.5 6.5 0 0 1 18.5 11v3.6l1.7 2.3c.5.7 0 1.6-.8 1.6H4.6c-.8 0-1.3-.9-.8-1.6l1.7-2.3V11a6.5 6.5 0 0 1 5-6.4V4A1.5 1.5 0 0 1 12 2.5Z"/><path fill="currentColor" d="M9.5 19.5h5a2.5 2.5 0 0 1-5 0Z"/></svg>';
let notifTab = null; // 'new' | 'all' — null = לפי המצב (חדשות אם יש)

function notifDeptLabel(n){
  const dept = n.department || (n.type==='message' || n.type==='comment' ? null : 'marketing');
  if(n.type==='message' || n.type==='comment') return 'הודעות';
  return (typeof DEPARTMENTS!=='undefined' && DEPARTMENTS[dept]) ? DEPARTMENTS[dept].short : '';
}
/* "לפני 5 דקות" / "לפני 3 שעות" / "אתמול" / תאריך */
function notifWhen(n){
  const ms = (n && n._sentAtMs) || (isFinite(Number(n && n.id)) && Number(n.id) > 1e12 ? Number(n.id) : 0);
  if(!ms) return n && n.date ? n.date : '';
  const diff = Date.now() - ms;
  if(diff < 60*1000) return 'עכשיו';
  if(diff < 60*60*1000){ const m = Math.round(diff/60000); return m===1 ? 'לפני דקה' : `לפני ${m} דקות`; }
  const d = new Date(ms), now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if(sameDay){ const h = Math.round(diff/3600000); return h===1 ? 'לפני שעה' : `לפני ${h} שעות`; }
  const y = new Date(now); y.setDate(now.getDate()-1);
  if(d.toDateString() === y.toDateString()) return 'אתמול';
  return `${d.getDate()}.${d.getMonth()+1}`;
}

function renderNotifPanel(){
  pruneNotifications();
  const list = [...appData.notifications].sort((a,b)=>notifTimeMs(b)-notifTimeMs(a));
  const unread = list.filter(n=>!n.read).length;
  const badge = document.getElementById('notif-badge');
  if(badge){
    if(unread>0){ badge.style.display='inline-flex'; badge.textContent = unread>9 ? '9+' : unread; }
    else { badge.style.display='none'; }
  }
  const bell = document.getElementById('notif-bell');
  if(bell) bell.setAttribute('aria-label', unread ? `התראות, ${unread} חדשות` : 'התראות');
  const panel = document.getElementById('notif-panel');
  if(!panel) return;

  const tab = (notifTab === 'all' || (notifTab === null && !unread)) ? 'all' : 'new';
  const shown = tab === 'new' ? list.filter(n=>!n.read) : list;
  const item = function(n){
    const st = NOTIF_STYLE[n.type] || NOTIF_STYLE.broadcast;
    const dept = notifDeptLabel(n);
    const when = notifWhen(n);
    return `
      <div class="np-item ${n.read?'':'unread'}" role="button" tabindex="0"
           onclick="openNotification('${String(n.id).replace(/'/g,"\\'")}')"
           onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openNotification('${String(n.id).replace(/'/g,"\\'")}')}">
        <span class="np-ic" style="background:${st.bg};color:${st.fg};">${icon(st.icon)}</span>
        <div class="np-main">
          <div class="np-title">${n.read?'':'<span class="np-dot" aria-label="חדש"></span>'}${esc(n.title||'')}</div>
          ${n.body ? `<div class="np-body">${esc(n.body)}</div>` : ''}
          <div class="np-meta">${dept ? `<span class="np-chip">${esc(dept)}</span>` : ''}${when ? `<span>${esc(when)}</span>` : ''}</div>
        </div>
        ${n.read ? `<button type="button" class="np-del" title="מחיקת התראה" aria-label="מחיקת התראה" onclick="event.stopPropagation();deleteNotification('${String(n.id).replace(/'/g,"\\'")}')">✕</button>` : ''}
      </div>`;
  };
  panel.innerHTML = `
    <div class="np-handle" aria-hidden="true"><span></span></div>
    <div class="np-head">
      <span class="np-head-ic">${NOTIF_FILLED_BELL}</span>
      <h2 class="np-h">ההתראות שלי</h2>
      ${unread ? `<button type="button" class="np-markall" onclick="markAllNotifsRead()">סימון הכול כנקרא</button>` : ''}
    </div>
    <div class="np-tabs" role="tablist" aria-label="סינון התראות">
      <button type="button" role="tab" aria-selected="${tab==='new'}" class="${tab==='new'?'active':''}" onclick="event.stopPropagation();setNotifTab('new')">חדשות${unread?` · ${unread}`:''}</button>
      <button type="button" role="tab" aria-selected="${tab==='all'}" class="${tab==='all'?'active':''}" onclick="event.stopPropagation();setNotifTab('all')">הכול</button>
    </div>
    <div class="np-list">
      ${shown.map(item).join('') || `<div class="np-empty">${tab==='new' ? 'אין התראות חדשות 👌' : 'אין התראות'}</div>`}
    </div>
    <div class="np-foot"><button type="button" class="np-close" onclick="closeNotifPanel()">סגירה</button></div>
  `;
}
function setNotifTab(t){ notifTab = t; renderNotifPanel(); }

/* לחיצה על התראה: מסמנת כנקראה (ורושמת קריאה לשידורים), ואם יש לה מסך — פותחת אותו */
function openNotification(id){
  const n = appData.notifications.find(x=>String(x.id)===String(id));
  if(!n) return;
  if(!n.read) markNotificationRead(n.id);
  const view = NOTIF_VIEW[n.type];
  if(view){
    closeNotifPanel();
    const inMarketing = (typeof DEPARTMENT_SCREENS!=='undefined') && (DEPARTMENT_SCREENS.marketing||[]).some(s=>s.id===view);
    if(inMarketing && typeof goToDeptScreen==='function') goToDeptScreen('marketing', view);
    else if(typeof goTo==='function') goTo(view);
  }
}

function toggleNotifPanel(force){
  const panel = document.getElementById('notif-panel');
  if(!panel) return;
  const open = (force===undefined) ? !panel.classList.contains('open') : !!force;
  if(open){ notifTab = null; renderNotifPanel(); }
  panel.classList.toggle('open', open);
  const bd = document.getElementById('notif-backdrop');
  if(bd) bd.classList.toggle('open', open);
  document.body.classList.toggle('notif-open', open);
  const bell = document.getElementById('notif-bell');
  if(bell) bell.setAttribute('aria-expanded', String(open));
}
function closeNotifPanel(){ toggleNotifPanel(false); }
function markAllNotifsRead(){
  appData.notifications.forEach(n=>{
    if(!n.read && n.type==='broadcast' && typeof markItemRead==='function') markItemRead('broadcast', n.id);
    n.read=true;
  });
  saveNotificationsToStorage();
  renderNotifPanel();
}
function showNotifToastPop(n){
  const el = document.createElement('div');
  el.className = 'notif-toast-pop';
  el.innerHTML = `<div class="card" style="padding:12px 16px;display:flex;gap:10px;align-items:center;box-shadow:var(--shadow-lg);cursor:pointer;">
    <span style="font-size:18px;">🔔</span>
    <div><div style="font-size:14px;font-weight:500;">${n.title}</div><div style="font-size:13px;color:var(--text-secondary);">${n.body}</div></div>
  </div>`;
  el.onclick = ()=>{ toggleNotifPanel(); el.remove(); };
  document.body.appendChild(el);
  requestAnimationFrame(()=>el.classList.add('show'));
  setTimeout(()=>{ el.classList.remove('show'); setTimeout(()=>el.remove(), 400); }, 5500);
}

/* click outside to close modal / search / notifications */
document.getElementById('modal-overlay').addEventListener('click', e=>{
  if(e.target.id==='modal-overlay') closeModal();
});
document.addEventListener('click', e=>{
  /* לחיצה בתוך המגירה מציירת אותה מחדש, והאלמנט שנלחץ כבר לא בעמוד —
     זו לא לחיצה "בחוץ", אז לא סוגרים */
  if(!e.target.isConnected) return;
  const searchWrap = document.querySelector('.search-wrap');
  const searchResults = document.getElementById('search-results');
  if(searchWrap && searchResults && !searchWrap.contains(e.target)) searchResults.classList.remove('open');
  const notifWrap = document.querySelector('.notif-wrap');
  const panel = document.getElementById('notif-panel');
  if(notifWrap && panel && panel.classList.contains('open') && !notifWrap.contains(e.target)) closeNotifPanel();
});
document.addEventListener('keydown', e=>{
  const panel = document.getElementById('notif-panel');
  if(e.key==='Escape' && panel && panel.classList.contains('open')){
    closeNotifPanel();
    const bell = document.getElementById('notif-bell');
    if(bell) bell.focus();
  }
});
window.addEventListener('popstate', ()=>{ if(typeof closeNotifPanel==='function') closeNotifPanel(); });

