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
          date: todayHeb(), type:'broadcast', read: !isFreshlyArrived, _sentAtMs: sentAtMs
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
function pruneNotifications(){
  const now = Date.now();
  const before = appData.notifications.length;
  appData.notifications = appData.notifications.filter(n=>{
    const t = parseHebDate(n.date);
    if(isNaN(t)) return true;
    return (now - t) <= NOTIF_MAX_AGE_DAYS*86400000;
  });
  if(appData.notifications.length > NOTIF_MAX_COUNT){
    appData.notifications.sort((a,b)=>b.id-a.id);
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
function renderNotifPanel(){
  pruneNotifications();
  const list = [...appData.notifications].sort((a,b)=>b.id-a.id);
  const unread = list.filter(n=>!n.read).length;
  const badge = document.getElementById('notif-badge');
  if(unread>0){ badge.style.display='flex'; badge.textContent = unread>9 ? '9+' : unread; }
  else { badge.style.display='none'; }
  document.getElementById('notif-panel').innerHTML = `
    <div class="notif-head"><h4>התראות</h4><button onclick="markAllNotifsRead()">סמן הכל כנקרא</button></div>
    ${list.map(n=>`
      <div class="notif-item ${n.read?'':'unread'}">
        <div class="ic">${NOTIF_ICON[n.type]||'🔔'}</div>
        <div style="flex:1;min-width:0;"><div class="nt">${n.title}</div><div class="nb">${n.body}</div><div class="nd">${n.date}</div></div>
        ${n.read
          ? `<button class="icon-btn danger" style="width:22px;height:22px;font-size:11px;flex:none;" title="מחיקת התראה" onclick="event.stopPropagation();deleteNotification('${n.id}')">✕</button>`
          : `<button class="link-btn" style="flex:none;font-size:12px;" onclick="event.stopPropagation();markNotificationRead('${n.id}')">אשר/י קריאה</button>`
        }
      </div>
    `).join('') || '<div class="empty-state">אין התראות חדשות</div>'}
  `;
}
function toggleNotifPanel(){
  const panel = document.getElementById('notif-panel');
  panel.classList.toggle('open');
  if(panel.classList.contains('open')) renderNotifPanel();
}
function markAllNotifsRead(){
  appData.notifications.forEach(n=>n.read=true);
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
  const searchWrap = document.querySelector('.search-wrap');
  if(searchWrap && !searchWrap.contains(e.target)) document.getElementById('search-results').classList.remove('open');
  const notifWrap = document.querySelector('.notif-wrap');
  if(notifWrap && !notifWrap.contains(e.target)) document.getElementById('notif-panel').classList.remove('open');
});

