/* ============================================================
   עדכוני מערכת (appUpdates) — "חדש עבורכם" + קישורים עמוקים
   ------------------------------------------------------------
   כל אוטומציה (מכר מבצעים מהמייל, ובהמשך חדש על המדף / פלנוגרמות וכו')
   יוצרת מסמך בקולקציה appUpdates עם department + view (ראו app_updates.py
   ב-Cloud Functions). כאן:
     1. מאזינים לעדכונים של 30 הימים האחרונים (appData.appUpdates).
     2. מזינים אותם לפיד "חדש עבורכם" בדף הבית (dashboard.js), עם תגית
        "חדש" לכל סניף/מנהל אזור שעוד לא ראה אותם (דרך itemReads, אותו
        מנגנון "נקרא" של ההוראות — type: 'appUpdates').
     3. נקודה אדומה על המחלקה ועל המסך שעודכן (navUnreadCount ב-navigation.js),
        שנעלמת ברגע שהסניף נכנס למסך (markAppUpdatesReadForView).
     4. פתיחת קישור עמוק "#go=<department>:<view>&u=<updateId>" — מלחיצה על
        Push (דרך ה-Service Worker), או מטוסט כשהאפליקציה פתוחה.
   ============================================================ */
const APP_UPDATES_MAX_AGE_DAYS = 30;
const APP_UPDATES_LIMIT = 30;
if(!appData.appUpdates) appData.appUpdates = [];

let unsubAppUpdates = null;
function initAppUpdatesSync(){
  if(!firebaseReady || !db) return;
  if(unsubAppUpdates) unsubAppUpdates();
  const cutoff = new Date(Date.now() - APP_UPDATES_MAX_AGE_DAYS*86400000);
  unsubAppUpdates = db.collection('appUpdates')
    .where('createdAt', '>=', cutoff)
    .orderBy('createdAt', 'desc')
    .limit(APP_UPDATES_LIMIT)
    .onSnapshot(function(snap){
      appData.appUpdates = snap.docs.map(function(doc){
        return Object.assign({}, doc.data(), {id: doc.id});
      });
      renderNav();
      renderContent();
    }, function(err){
      console.error('Firestore sync error (appUpdates):', err);
    });
}

/* פריטים לפיד "חדש עבורכם" — באותו מבנה של שאר פריטי הפיד בדף הבית. */
function appUpdateFeedItems(){
  return (appData.appUpdates||[])
    .filter(u=>u.department && u.view)
    .map(u=>({
      type:'appUpdate', typeKey:'appUpdates', id:u.id,
      ts: tsToMillis(u.createdAt) || Date.now(),
      edited:false, title:u.title || 'עדכון', body:u.body || '',
      icon:u.icon || '🔄', department:u.department, view:u.view
    }));
}

/* עדכונים שעוד לא נקראו ושמכוונים למסך מסוים — לנקודה האדומה בניווט. */
function appUpdatesUnreadForView(viewId){
  if(!currentViewerId()) return 0;
  return (appData.appUpdates||[]).filter(u=>u.view===viewId && !isItemRead('appUpdates', u.id)).length;
}

/* כניסה למסך = ראיתי את מה שעודכן בו. */
function markAppUpdatesReadForView(viewId){
  if(!currentViewerId()) return;
  (appData.appUpdates||[]).forEach(u=>{
    if(u.view===viewId && !isItemRead('appUpdates', u.id)) markItemRead('appUpdates', u.id);
  });
}

/* לחיצה על עדכון בפיד: פותחים את המסך שבו בוצע השינוי. */
function openAppUpdate(updateId){
  const u = (appData.appUpdates||[]).find(x=>x.id===updateId);
  if(!u) return;
  if(currentViewerId()) markItemRead('appUpdates', u.id);
  openDeptView(u.department, u.view);
}

/* ניווט בטוח למסך במחלקה: אם המסך לא גלוי למשתמש הזה (למשל פלנוגרמות שעוד
   לא פורסמו), נכנסים לפחות לדף המחלקה במקום להציג מסך שבור. */
function openDeptView(deptKey, view){
  if(!deptKey || !DEPARTMENTS[deptKey]){ goTo('dashboard'); return; }
  const visible = visibleDepartmentScreens(deptKey).some(s=>s.id===view);
  if(view && visible) goToDeptScreen(deptKey, view);
  else enterDepartment(deptKey);
}

/* ---------- קישורים עמוקים ----------
   פורמט: "#go=purchasing:promoSales&u=<updateId>" (u לא חובה). */
function parseDeepLink(str){
  const m = String(str||'').match(/go=([a-zA-Z]+):([a-zA-Z]+)(?:&u=([A-Za-z0-9_-]+))?/);
  return m ? {department:m[1], view:m[2], updateId:m[3]||null} : null;
}
/* הקישור שהאפליקציה נפתחה איתו (נקרא לפני שהכניסה למערכת דורסת את ה-hash). */
let pendingDeepLink = parseDeepLink(location.hash);
function openDeepLink(link){
  const p = parseDeepLink(link);
  if(!p) return false;
  if(!session.role){ pendingDeepLink = p; return true; }
  if(p.updateId && currentViewerId()) markItemRead('appUpdates', p.updateId);
  openDeptView(p.department, p.view);
  return true;
}
/* נקרא מ-enterApp אחרי שהמשתמש מזוהה ודף הבית צויר. */
function consumePendingDeepLink(){
  const p = pendingDeepLink;
  pendingDeepLink = null;
  if(!p) return;
  if(p.updateId && currentViewerId()) markItemRead('appUpdates', p.updateId);
  openDeptView(p.department, p.view);
}

/* לחיצה על Push כשהאפליקציה כבר פתוחה ברקע: ה-Service Worker מעביר אלינו
   את הקישור, ואנחנו מנווטים בלי לטעון את הדף מחדש. */
if('serviceWorker' in navigator){
  navigator.serviceWorker.addEventListener('message', function(e){
    if(e.data && e.data.type==='NIZAT_OPEN_LINK') openDeepLink(e.data.link);
  });
}

/* Push שמגיע כשהאפליקציה פתוחה על המסך: טוסט שלחיצה עליו פותחת את המסך. */
function showDeepLinkToast(title, body, link){
  const el = document.createElement('div');
  el.className = 'notif-toast-pop';
  el.innerHTML = `<div class="card" style="padding:12px 16px;display:flex;gap:10px;align-items:center;box-shadow:var(--shadow-lg);cursor:pointer;">
    <span style="font-size:18px;">🔔</span>
    <div style="flex:1;min-width:0;"><div style="font-size:14px;font-weight:500;">${esc(title)}</div>${body?`<div style="font-size:13px;color:var(--text-secondary);">${esc(body)}</div>`:''}</div>
    <span style="font-size:12.5px;color:var(--brand-primary-dark,#457a1f);flex:none;">לצפייה ←</span>
  </div>`;
  el.onclick = function(){ openDeepLink(link); el.remove(); };
  document.body.appendChild(el);
  requestAnimationFrame(()=>el.classList.add('show'));
  setTimeout(()=>{ el.classList.remove('show'); setTimeout(()=>el.remove(), 400); }, 8000);
}
