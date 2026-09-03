/* ============================================================
   מחלקות — ניווט רב-מחלקתי לסניפים/מנהלי אזור
   ------------------------------------------------------------
   DEPARTMENT_SCREENS: המסכים שכל מחלקה חושפת לסניף. שיווק היא היחידה
   הפעילה כרגע (שאר המחלקות עדיין ריקות — יקבלו את מסכי התוכן שלהן כשיתחילו
   לפרסם, בלי צורך לגעת בניווט שוב). אין ליצור מסכי תוכן חדשים כאן — כל
   פריט מפנה למסכים הקיימים בדיוק כמו היום.
   DEPARTMENT_NAV_ICONS: אייקון לכל כפתור מחלקה בניווט הגלובלי.
   ============================================================ */
const DEPARTMENT_SCREENS = {
  marketing: [
    {id:'competitions', label:'תחרויות', icon:icon('trophy')},
    {id:'instructions', label:'הוראות ועדכונים', icon:icon('clipboard')},
    {id:'materials', label:'הורדה חומרי שיווק / דיגיטל ורשתות חברתיות', icon:icon('download')},
    {id:'videos', label:'סרטוני הדרכה', icon:icon('play')},
    {id:'events', label:'יומן אירועים', icon:icon('calendar')},
    {id:'stands', label:'סטנדים לאישור', icon:icon('sign')}
  ],
  operations: [],
  purchasing: [
    {id:'promoSales', label:'מכר מבצעים', icon:icon('chart')}
  ],
  hr: []
};
const DEPARTMENT_NAV_ICONS = {
  marketing: icon('megaphone'),
  operations: icon('gear'),
  purchasing: icon('cart'),
  hr: icon('users')
};
/* ============================================================
   NAV
============================================================ */
/* האם למשתמש הנוכחי יש גישה למסכי הצפייה של הסניפים (תחרויות/הוראות/אירועים/
   חומרים/סטנדים/הודעות) — רלוונטי רק לסניפים/מנהלי אזור, ולאנשי צוות
   שהם בפועל מחלקת שיווק או בעלי גישה מלאה. מחלקות אחרות (תפעול/רכש/משאבי
   אנוש) לא רואים מסכים אלה בכלל, כי הם לא מסוננים ולא רלוונטיים אליהן. */
function hasBranchFacingNavAccess(){
  if(session.role !== 'marketing') return true;
  const depts = staffDepartments(currentUserEmail);
  return depts.indexOf('marketing') !== -1 || depts.length===Object.keys(DEPARTMENTS).length;
}
function navItems(){
  /* מזהי מחלקה → מסכי ניווט (משותף לסניפים ולאנשי צוות, כדי שכולם יראו
     בדיוק את אותה תצוגה כשנמצאים באותה מחלקה). */
  function deptScreenItems(deptKey){
    const items = [];
    if(session.role==='area' && deptKey==='marketing') items.push({id:'areaOverview', label:'האזור שלי', icon:icon('map')});
    items.push(...(DEPARTMENT_SCREENS[deptKey]||[]));
    items.push({id:'messages', label:'ההודעות שלי', icon:icon('mail')});
    return items;
  }
  if(ui.department === null){
    /* ברמה הגלובלית: דף הבית + כניסה לכל מחלקה — זהה לחלוטין לסניפים ולאנשי
       צוות כאחד. "ניהול תוכן" מתווסף בסוף רק לאנשי צוות, כדי שיהיה נגיש
       תמיד בלי קשר לאיזו מחלקה נמצאים בה כרגע. */
    const items = [{id:'dashboard', label:'דף הבית', icon:icon('home')}];
    Object.keys(DEPARTMENTS).forEach(key=>{
      items.push({id:'enterDept:'+key, label:DEPARTMENTS[key].short, icon:DEPARTMENT_NAV_ICONS[key], isDeptEntry:true, deptKey:key});
    });
    if(session.role==='marketing') items.push({id:'admin', label:'ניהול תוכן', icon:icon('gear')});
    return items;
  }
  /* בתוך מחלקה: "דף הבית" (חזרה לגלובלי) + מסכי אותה מחלקה — זהה לגמרי בין
     סניף לאיש צוות. "ניהול תוכן" מתווסף בסוף רק לאנשי צוות. */
  const items = [{id:'dashboard', label:'דף הבית', icon:icon('home')}, ...deptScreenItems(ui.department)];
  if(session.role==='marketing') items.push({id:'admin', label:'ניהול תוכן', icon:icon('gear')});
  return items;
}
const MOBILE_PRIMARY = ['dashboard','competitions','instructions','materials'];
const MOBILE_PRIMARY_AREA = ['dashboard','areaOverview','competitions','instructions'];
/* מעקב "נקרא" אישי לכל צופה — מזהה ייחודי לכל סניף (לפי אימייל) ולכל מנהל אזור
   (לפי שם האזור שלו). מחלקת השיווק לא עוקבת אחרי "נקרא" בכלל (מחזיר null). */
function currentViewerId(){
  if(session.role==='branch' && session.branchInfo) return 'branch:' + (session.branchInfo.email || session.branchName);
  if(session.role==='area' && session.areaLabel) return 'area:' + session.areaLabel;
  return null;
}
/* זהות לצורך רישום Push — כולל גם מחלקת שיווק (בניגוד ל-currentViewerId, שמחריג
   אותה בכוונה למעקב "נקרא"). */
function currentPushIdentity(){
  if(session.role==='branch' && session.branchInfo) return 'branch:' + (session.branchInfo.email || session.branchName);
  if(session.role==='area' && session.areaLabel) return 'area:' + session.areaLabel;
  if(session.role==='marketing') return 'marketing:' + (currentUserEmail || 'unknown');
  return null;
}
/* שומר טוקן FCM עדכני ב-Firestore, ומנקה טוקנים ישנים/שונים של אותה זהות
   (viewerId) כדי שלא יצטברו טוקנים "מתים" ששולחים אליהם לשווא. */
function savePushToken(token, opts){
  opts = opts || {};
  const vid = currentPushIdentity();
  if(!vid || !firebaseReady || !token) return Promise.resolve();
  const label = session.role==='branch' ? session.branchName : (session.role==='area' ? session.areaLabel : 'מחלקת שיווק');
  const docId = (vid + '_' + token).replace(/[\/\s]/g,'_').slice(0,400);
  // הערה: בכוונה *לא* מוחקים כאן טוקנים אחרים עם אותו viewerId — משתמש אחד
  // יכול להיות מחובר מכמה מכשירים (טלפון + מחשב) עם אותו מייל בו-זמנית,
  // וכל מכשיר צריך לשמור על הטוקן שלו בנפרד כדי להמשיך לקבל Push. ניקוי
  // טוקנים שבאמת מתים קורה בצד השרת (ה-Cloud Function), על בסיס תגובה
  // אמיתית מ-FCM שהטוקן לא רשום יותר — לא על בסיס "שונה מהטוקן הנוכחי".
  return db.collection('pushTokens').doc(docId).set({
    viewerId: vid, label, token, role: session.role,
    updatedAt: todayHeb() + ' ' + new Date().toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'})
  }, {merge:true}).then(()=>{
    localStorage.setItem('nizatHubPushEnabled','1');
  });
}
/* מבקש הרשאת התראות מהדפדפן, מקבל טוקן FCM, ושומר אותו ב-Firestore (pushTokens)
   כדי שה-Cloud Function תדע לאן לשלוח פוש. קורה רק בעקבות פעולת משתמש מפורשת
   (לחיצה על כפתור), לא אוטומטית — כמקובל להרשאות דפדפן. */
function enablePushNotifications(){
  if(!messaging){ toast('התראות Push אינן נתמכות בדפדפן זה'); return; }
  if(FCM_VAPID_KEY.indexOf('PASTE_YOUR_VAPID_KEY_HERE') !== -1){
    toast('התראות Push עדיין לא מוגדרות סופית באתר — יש להשלים את הגדרת השרת');
    return;
  }
  Notification.requestPermission().then(function(permission){
    if(permission !== 'granted'){
      toast('לא ניתנה הרשאה להתראות. אפשר לשנות זאת בהגדרות הדפדפן.');
      updatePushButtonsVisibility();
      return;
    }
    navigator.serviceWorker.ready.then(function(swReg){
      messaging.getToken({vapidKey: FCM_VAPID_KEY, serviceWorkerRegistration: swReg}).then(function(token){
        if(!token){ toast('לא הצלחתי לקבל טוקן להתראות. נסו שוב.'); return; }
        savePushToken(token).then(()=>{
          toast('התראות הופעלו בהצלחה!');
          updatePushButtonsVisibility();
        }).catch(err=>toast('שגיאה בשמירת ההרשמה להתראות: '+err.message));
      }).catch(function(err){
        console.error('FCM getToken failed:', err);
        toast('שגיאה בהפעלת התראות: ' + err.message);
      });
    });
  });
}
/* רענון טוקן שקט: רץ אוטומטית בכל כניסה למשתמש שכבר אישר הרשאת התראות
   בעבר (Notification.permission === 'granted'), בלי לבקש שום דבר ממנו.
   ה-SDK של Firebase יחזיר טוקן חדש אם הישן פג/התיישן, ואם הוא זהה לישן
   הכתיבה ל-Firestore היא no-op בפועל (merge על אותו docId). זה פותר מצב שבו
   טוקן ישן "מת" והמשתמש לעולם לא רואה כפתור שיגרום לרענון שלו, כי הכפתור
   מוצג רק כשההרשאה עוד לא הוכרעה. */
function silentlyRefreshPushTokenIfGranted(){
  if(!messaging || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if(FCM_VAPID_KEY.indexOf('PASTE_YOUR_VAPID_KEY_HERE') !== -1) return;
  navigator.serviceWorker.ready.then(function(swReg){
    messaging.getToken({vapidKey: FCM_VAPID_KEY, serviceWorkerRegistration: swReg}).then(function(token){
      if(token) savePushToken(token);
    }).catch(function(err){ console.warn('רענון שקט של טוקן Push נכשל:', err); });
  }).catch(function(){});
}
if(messaging){
  console.log('🔔 [NIZAT-DEBUG] רושם עכשיו את onMessage listener');
  /* הודעות שמגיעות כשהאפליקציה פתוחה ברקע/פעילה — FCM לא מציג אוטומטית התראת
     מערכת במצב הזה, אז מציגים טוסט + פעמון בעצמנו. הודעות כשהאפליקציה סגורה
     לגמרי מטופלות ב-service-worker.js (onBackgroundMessage). */
  messaging.onMessage(function(payload){
    console.log('🔔 [NIZAT-DEBUG] onMessage (foreground) הופעל בפועל! payload:', payload);
    const title = (payload.notification && payload.notification.title) || 'עדכון חדש';
    const body = (payload.notification && payload.notification.body) || '';
    toast(`${title}${body ? ' — ' + body : ''}`);
    /* לא מוסיפים כאן ל-appData.notifications — מאזין ה-Firestore על קולקציית
       broadcasts (initBroadcastNotifSync) עושה את זה בצורה אמינה יותר, כי
       הוא עובד גם כשההודעה מגיעה ברקע/כשהאתר סגור (מצב שבו onMessage הזה
       כלל לא רץ). */
  });
}
function isItemRead(type, itemId){
  const vid = currentViewerId();
  if(!vid) return true; /* מחלקת שיווק — לא רלוונטי, תמיד "נקרא" */
  return (appData.itemReads||[]).some(r=>r.type===type && r.itemId==itemId && r.viewerId===vid);
}
function markItemRead(type, itemId){
  const vid = currentViewerId();
  if(!vid) return;
  if(isItemRead(type, itemId)) return;
  const docId = `${type}_${itemId}_${vid}`.replace(/[\/\s]/g,'_');
  const rec = {type, itemId: String(itemId), viewerId: vid, readAt: todayHeb() + ' ' + new Date().toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'})};
  appData.itemReads.push(Object.assign({id: docId}, rec));
  if(firebaseReady){
    db.collection('itemReads').doc(docId).set(rec).catch(()=>{});
  }
}
/* ספירת "לא נקרא" להצגת עיגול אדום ליד פריט ניווט — רק לסניפים/מנהלי אזור,
   לא למחלקת השיווק (שלא אמורה לראות "לא נקרא" על מה שהיא עצמה פרסמה). */
const NAV_UNREAD_TYPES = {instructions:'instructions', competitions:'competitions', materials:'materials', events:'events'};
function navUnreadCount(navId){
  if(session.role==='marketing') return 0;
  if(navId.indexOf('enterDept:')===0){
    const deptKey = navId.slice('enterDept:'.length);
    return (DEPARTMENT_SCREENS[deptKey]||[]).reduce((s,scr)=>s+navUnreadCount(scr.id), 0);
  }
  const key = NAV_UNREAD_TYPES[navId];
  if(!key || !appData[key]) return 0;
  return appData[key].filter(x=>!isItemRead(key, x.id)).length;
}
function renderNav(){
  renderPreviewBanner();
  const items = navItems();
  const isStaff = session.role==='marketing';
  document.getElementById('sidebar').innerHTML = `
    ${ui.department ? `<div class="nav-label">${(DEPARTMENTS[ui.department]||{}).label||''}</div>` : ''}
    ${items.filter(i=>i.id!=='admin').map(i=>navBtn(i)).join('')}
    ${isStaff ? `<div class="nav-sep"></div><div class="nav-label">ניהול</div>${navBtn(items.find(i=>i.id==='admin'))}` : ''}
  `;
  /* חלוקה דינמית לראשי/עוד: ברמה הגלובלית (בחירת מחלקה) לסניפים/מנהלי אזור
     אין overflow בכלל — בדיוק 5 פריטים (בית + 4 מחלקות) ממלאים את הסרגל
     התחתון. אנשי צוות תמיד רואים עד 4 ראשיים + "עוד" (גם ברמה הגלובלית),
     כי יש להם פריט נוסף קבוע — "ניהול תוכן" — שתמיד צריך מקום. */
  let primary, overflow;
  if(ui.department===null){
    if(isStaff){ primary = items.slice(0,5); overflow = items.slice(5); }
    else { primary = items; overflow = []; }
  } else {
    primary = items.slice(0,4); overflow = items.slice(4);
  }
  const overflowActive = overflow.some(i=>i.id===ui.view);
  const overflowUnread = overflow.reduce((s,i)=>s+navUnreadCount(i.id),0);
  document.getElementById('mobile-tabbar').innerHTML = `
    ${primary.map(i=>navTabBtn(i)).join('')}
    ${overflow.length ? `
    <button class="${overflowActive?'active':''}" onclick="toggleMobileMore()">
      <span class="ic-wrap"><span class="ic">⋯</span>${overflowUnread?`<span class="tab-badge">${overflowUnread}</span>`:''}</span><span>עוד</span>
    </button>` : ''}
  `;
  document.getElementById('mobile-more-sheet').innerHTML = overflow.map(i=>{
    const n = navUnreadCount(i.id);
    const active = i.isDeptEntry ? ui.department===i.deptKey : ui.view===i.id;
    const action = i.isDeptEntry ? `enterDepartment('${i.deptKey}');closeMobileMore();` : `goTo('${i.id}');closeMobileMore();`;
    return `
    <button class="nav-item ${active?'active':''}" onclick="${action}">
      <span class="ic">${i.icon}</span><span>${i.label}</span>${n?`<span class="nav-badge">${n}</span>`:''}
    </button>`;
  }).join('') + `<button class="mobile-more-logout" onclick="logout()">התנתקות</button>`;
}
/* כפתור ניווט לסרגל הצד (דסקטופ) — תומך גם בכפתורי כניסה למחלקה. */
function navBtn(i){
  const n = navUnreadCount(i.id);
  const active = i.isDeptEntry ? ui.department===i.deptKey : ui.view===i.id;
  const action = i.isDeptEntry ? `enterDepartment('${i.deptKey}')` : `goTo('${i.id}')`;
  return `<button class="nav-item ${active?'active':''}" onclick="${action}">
    <span class="ic">${i.icon}</span><span>${i.label}</span>${n?`<span class="nav-badge">${n}</span>`:''}
  </button>`;
}
/* כפתור ניווט לסרגל התחתון (נייד) — תומך גם בכפתורי כניסה למחלקה. */
function navTabBtn(i){
  const n = navUnreadCount(i.id);
  const active = i.isDeptEntry ? ui.department===i.deptKey : ui.view===i.id;
  const action = i.isDeptEntry ? `enterDepartment('${i.deptKey}')` : `goTo('${i.id}')`;
  return `
  <button class="${active?'active':''}" onclick="${action}">
    <span class="ic-wrap"><span class="ic">${i.icon}</span>${n?`<span class="tab-badge">${n}</span>`:''}</span><span>${i.label}</span>
  </button>`;
}
function toggleMobileMore(){
  document.getElementById('mobile-more-sheet').classList.toggle('open');
  document.getElementById('mobile-more-backdrop').classList.toggle('open');
}
function closeMobileMore(){
  document.getElementById('mobile-more-sheet').classList.remove('open');
  document.getElementById('mobile-more-backdrop').classList.remove('open');
}
let suppressHistoryPush = false;
/* ניווט ל-'dashboard' תמיד מחזיר לרמה הגלובלית (בין המחלקות) — זו ההתנהגות
   שהוגדרה: "דף הבית" בתוך מחלקה פירושו חזרה למסך המאוחד, לא איפוס בתוך
   המחלקה עצמה. opts.keepDepartment משמש רק לניווט פנימי (למשל שחזור היסטוריה,
   או enterDepartment) שלא אמור לאפס את ui.department. */
function goTo(view, opts){
  opts = opts || {};
  if(view==='dashboard' && !opts.keepDepartment) ui.department = null;
  ui.view = view;
  renderNav();
  renderContent();
  window.scrollTo({top:0, behavior:'smooth'});
  if(!suppressHistoryPush){
    // כל שינוי מסך נרשם כערך היסטוריה אמיתי — כך שכפתור "חזרה" (בדפדפן, במובייל,
    // או במחוות ה-swipe) מנווט בין המסכים בתוך ה-HUB במקום לצאת מהאתר לגמרי.
    history.pushState({nizatHubView: view, nizatHubDept: ui.department}, '', '#' + view);
  }
}
/* כניסה למחלקה מהמסך הגלובלי (לחיצה על אחד מכפתורי המחלקות). */
function enterDepartment(key){
  ui.department = key;
  goTo('dashboard', {keepDepartment:true});
}
/* קיצור לניווט ישיר למסך מסוים בתוך מחלקה נתונה (למשל מפריט בפיד הגלובלי). */
function goToDeptScreen(deptKey, view){
  ui.department = deptKey;
  goTo(view, {keepDepartment:true});
}
window.addEventListener('popstate', function(e){
  const view = (e.state && e.state.nizatHubView) || 'dashboard';
  const dept = (e.state && ('nizatHubDept' in e.state)) ? e.state.nizatHubDept : null;
  suppressHistoryPush = true;
  ui.department = dept;
  goTo(view, {keepDepartment:true});
  suppressHistoryPush = false;
});

/* ============================================================
   CONTENT ROUTER
============================================================ */
function renderContent(){
  const el = document.getElementById('content');
  if(ui.view==='dashboard'){
    if(ui.department===null) el.innerHTML = viewGlobalHome();
    else if(ui.department==='marketing') el.innerHTML = viewDashboard();
    else if((DEPARTMENT_SCREENS[ui.department]||[]).length) el.innerHTML = viewDepartmentLanding(ui.department);
    else el.innerHTML = viewDepartmentEmpty(ui.department);
  }
  else if(ui.view==='competitions') el.innerHTML = viewCompetitions();
  else if(ui.view==='instructions') el.innerHTML = viewInstructions();
  else if(ui.view==='events') el.innerHTML = viewEvents();
  else if(ui.view==='areaOverview') el.innerHTML = viewAreaOverview();
  else if(ui.view==='materials') el.innerHTML = viewMaterials();
  else if(ui.view==='videos') el.innerHTML = viewVideos();
  else if(ui.view==='stands') el.innerHTML = viewStands();
  else if(ui.view==='promoSales') el.innerHTML = viewPromoSales();
  else if(ui.view==='sendAreaConversations') el.innerHTML = viewAreaManagerConversations();
  else if(ui.view==='areaConversations') el.innerHTML = viewBranchConversations();
  else if(ui.view==='myCalendar') el.innerHTML = viewMyCalendar();
  else if(ui.view==='messages') el.innerHTML = viewMessages();
  else if(ui.view==='admin') el.innerHTML = viewAdmin();
}
