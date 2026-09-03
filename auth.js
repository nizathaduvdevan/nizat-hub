/* ============================================================
   INIT
============================================================ */
function initLogin(){
  if (!firebaseReady) return; // no Firebase configured — stays on the login screen (demo mode)
  // Firebase שומר session מחובר בין רענוני עמוד בעצמו. כשהוא משוחזר, טוענים
  // את ספר הסניפים מ-Firestore (רק עכשיו, אחרי אימות) ומזהים תפקיד לפיו —
  // בלי להסתמך על סימון ב-localStorage בלבד לפני שיש session אמיתי.
  fbAuth.onAuthStateChanged(function(user){
    if (!user) return;
    const email = normalizeEmail(user.email);
    currentUserEmail = email;
    loadBranchDirectory().then(function(){
      resolveSessionForEmail(email);
    });
  });
}
function normalizeEmail(v){ return (v||'').trim().toLowerCase(); }
function findBranchByEmail(email){
  const needle = normalizeEmail(email);
  return BRANCH_DIRECTORY.find(b=>b.email===needle) || null;
}
/* תווית התצוגה של איש צוות (שם + מחלקה), משמש גם בכניסה רגילה וגם ביציאה
   ממצב "צפייה כמשתמש". */
function marketingDisplayFor(email){
  const rec = STAFF[email];
  const depts = staffDepartments(email);
  const deptShort = depts.length===1 ? (DEPARTMENTS[depts[0]]||{}).short
    : (depts.length===Object.keys(DEPARTMENTS).length ? 'גישה מלאה' : null);
  const name = rec ? rec.name : 'מחלקת שיווק';
  const subtitle = (rec && rec.title) ? rec.title : deptShort;
  return { name, label: subtitle ? `${name} · ${subtitle}` : name };
}
function enterApp(role, payload){
  session.role = role;
  session.branchName = role==='branch' ? ('סניף ' + payload.name) : null;
  session.branchInfo = role==='branch' ? payload : null;
  session.areaName = role==='area' ? payload.areaName : null;
  session.areaLabel = role==='area' ? payload.label : null;
  loadNotificationsFromStorage();
  initBroadcastNotifSync();
  logViewerActivity(role, payload);

  document.getElementById('login-screen').style.display='none';
  document.getElementById('app-screen').style.display='block';

  let label, avatarText, toastMsg;
  if(role==='marketing'){
    /* אנשי צוות ממחלקות שונות — מציגים את השם והמחלקה בפועל, ולא
       'מחלקת שיווק' לכולם. */
    const disp = marketingDisplayFor(currentUserEmail);
    label = disp.label;
    avatarText = disp.name.slice(0,2);
    toastMsg = `שלום, ${disp.name} 👋`;
  }
  else if(role==='area'){
    label = payload.title || (session.areaName ? `מנהל אזור · ${session.areaLabel}` : `${session.areaLabel} · תצוגה ארצית`);
    avatarText = session.areaLabel.slice(0,2);
    toastMsg = `שלום, ${session.areaLabel} 👋`;
  } else {
    label = payload.manager ? `${payload.manager} · ${session.branchName}` : session.branchName;
    avatarText = payload.manager ? payload.manager.slice(0,2) : payload.name.slice(0,2);
    toastMsg = `שלום, ${payload.manager || session.branchName} 👋`;
  }
  document.getElementById('user-label').textContent = label;
  document.getElementById('user-avatar').textContent = avatarText;

  ui.view = 'dashboard';
  history.replaceState({nizatHubView: ui.view}, '', '#' + ui.view);
  renderNav();
  renderContent();
  renderNotifPanel();
  initFirestoreSync();
  toast(toastMsg);
  updatePushButtonsVisibility();
  silentlyRefreshPushTokenIfGranted();
}
/* מעדכן את שני כפתורי ה-Push (הפעלה / עזרה כשחסום) לפי מצב ההרשאה בפועל.
   נקרא גם מ-enterApp וגם בכל מקום שבו רוצים לרענן את התצוגה (למשל אחרי
   שהמשתמש חוזר מהגדרות הדפדפן ולוחץ שוב). */
function updatePushButtonsVisibility(){
  const pushBtn = document.getElementById('push-enable-btn');
  const blockedBtn = document.getElementById('push-blocked-btn');
  const supported = typeof Notification !== 'undefined' && messaging;
  if(pushBtn) pushBtn.style.display = (supported && Notification.permission === 'default') ? 'inline-flex' : 'none';
  if(blockedBtn) blockedBtn.style.display = (supported && Notification.permission === 'denied') ? 'inline-flex' : 'none';
}
/* מציג הסבר מותאם-מכשיר איך לבטל חסימת התראות ברמת הדפדפן — קוד האתר לא
   יכול לבקש הרשאה מחדש ברגע שהיא נחסמה במפורש (הגנת דפדפן), אז זו הדרך
   היחידה לעזור למשתמש להתקדם בלי להסביר לו ידנית בכל פעם. */
function showPushBlockedHelp(){
  const ua = navigator.userAgent || '';
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  let steps;
  if(isAndroid){
    steps = `
      <ol style="padding-inline-start:20px;line-height:1.9;">
        <li>פתחו את תפריט שלוש הנקודות ⋮ של הדפדפן (למעלה מימין)</li>
        <li>הגדרות ⟵ הגדרות אתרים ⟵ התראות</li>
        <li>מצאו את nizathaduvdevan.github.io ברשימה, ושנו ל"מותר"</li>
        <li>סגרו את האפליקציה לגמרי ופתחו אותה שוב</li>
      </ol>`;
  } else if(isIOS){
    steps = `
      <ol style="padding-inline-start:20px;line-height:1.9;">
        <li>פתחו את "הגדרות" של האייפון (לא בתוך הדפדפן)</li>
        <li>גללו למטה עד Safari ⟵ הגדרות אתרים מתקדמות ⟵ התראות</li>
        <li>אתרו את האתר ושנו את ההרשאה ל"אפשר"</li>
        <li>חזרו לאפליקציה, סגרו אותה לגמרי ופתחו מחדש</li>
      </ol>
      <p style="font-size:12px;color:var(--muted);margin-top:8px;">שימו לב: ב-iOS יש תמיכה בהתראות רק כשהאפליקציה מותקנת דרך "הוספה למסך הבית", לא דרך Safari רגיל.</p>`;
  } else {
    steps = `
      <ol style="padding-inline-start:20px;line-height:1.9;">
        <li>לחצו על סמל המנעול 🔒 (או ה-ℹ️) שליד כתובת האתר בשורת הכתובת</li>
        <li>מצאו את "התראות" ושנו מ"חסום" ל"מותר"</li>
        <li>רעננו את הדף (F5)</li>
      </ol>`;
  }
  document.getElementById('modal-body').innerHTML = `
    <h3>🔔⚠ ההתראות חסומות עבור האתר הזה</h3>
    <p style="font-size:13px;color:var(--text-secondary);margin:4px 0 12px;">
      הדפדפן חוסם בקשות התראה חוזרות ברגע שהמשתמש לוחץ "חסום" פעם אחת — זו הגנת פרטיות של הדפדפן, ולכן האתר לא יכול לבקש הרשאה מחדש אוטומטית. צריך לשנות את זה ידנית:
    </p>
    ${steps}
    <div class="modal-actions"><button class="btn-secondary" onclick="closeModal()">הבנתי</button></div>
  `;
  document.getElementById('modal-overlay').classList.add('open');
}
/* ============================================================
   צפייה כמשתמש (מחלקת שיווק בלבד) — שכבת תצוגה בלבד, לא נוגעת
   ב-Firebase Auth/session אמיתי. realSession שומר את הזהות האמיתית.
============================================================ */
function openPreviewPicker(){
  const isFullAccess = staffDepartments(currentUserEmail).length===Object.keys(DEPARTMENTS).length;
  if(!(isFullAccess || (previewMode && realSession && realSession.role==='marketing'))) return;
  document.getElementById('modal-body').innerHTML = `
    <h3>צפייה כמשתמש</h3>
    <p style="font-size:13px;color:var(--text-secondary);margin:4px 0 12px;">בחרו איש צוות, סניף, או מנהל אזור כדי לראות בדיוק את המסכים שהם רואים.</p>
    <div id="preview-pick-list" style="max-height:360px;overflow-y:auto;">טוען סניפים…</div>
    <div class="modal-actions"><button class="btn-secondary" onclick="closeModal()">ביטול</button></div>
  `;
  document.getElementById('modal-overlay').classList.add('open');
  loadBranchDirectory().then(function(){
    const listEl = document.getElementById('preview-pick-list');
    if(!listEl) return; // המשתמש כבר סגר את המודל
    const areaRows = Object.keys(AREA_MANAGER_INFO).map(email=>{
      const info = AREA_MANAGER_INFO[email];
      return `<div class="preview-pick-row" onclick="startPreviewAsArea('${email}')"><span>${info.label}</span><span style="color:var(--muted);font-size:12px;">${info.title || 'מנהל אזור'}</span></div>`;
    }).join('');
    const branchRows = BRANCH_DIRECTORY.slice().sort((a,b)=>a.name.localeCompare(b.name,'he')).map(b=>
      `<div class="preview-pick-row" onclick="startPreviewAsBranch('${b.email}')"><span>${b.name}</span><span style="color:var(--muted);font-size:12px;">${b.manager||''}</span></div>`
    ).join('');
    /* אנשי צוות ממחלקות מוגבלות (לא בעלי גישה מלאה) — כדי לבדוק בפועל מה
       הם רואים, בלי לבקש מהם להתחבר בעצמם. */
    const staffRows = Object.keys(STAFF)
      .filter(email => staffDepartments(email).length < Object.keys(DEPARTMENTS).length)
      .map(email=>{
        const disp = marketingDisplayFor(email);
        return `<div class="preview-pick-row" onclick="startPreviewAsStaff('${email}')"><span>${disp.name}</span><span style="color:var(--muted);font-size:12px;">${disp.label.split(' · ')[1]||''}</span></div>`;
      }).join('');
    listEl.innerHTML = `
      ${staffRows ? `<div class="preview-pick-group">צוות (מחלקות אחרות)</div>${staffRows}` : ''}
      <div class="preview-pick-group">מנהלי אזור</div>${areaRows}
      <div class="preview-pick-group">סניפים</div>${branchRows}
    `;
  });
}
function startPreviewAsBranch(email){
  const branchInfo = BRANCH_DIRECTORY.find(b=>b.email===email);
  if(!branchInfo) return;
  if(!realSession) realSession = {...session};
  session.role = 'branch';
  session.branchName = 'סניף ' + branchInfo.name;
  session.branchInfo = branchInfo;
  session.areaName = null;
  session.areaLabel = null;
  previewMode = {label: branchInfo.name};
  document.getElementById('user-label').textContent = branchInfo.manager ? `${branchInfo.manager} · ${session.branchName}` : session.branchName;
  document.getElementById('user-avatar').textContent = branchInfo.manager ? branchInfo.manager.slice(0,2) : branchInfo.name.slice(0,2);
  closeModal();
  goTo('dashboard');
}
function startPreviewAsArea(email){
  const info = AREA_MANAGER_INFO[email];
  if(!info) return;
  if(!realSession) realSession = {...session};
  session.role = 'area';
  session.areaName = info.areaName;
  session.areaLabel = info.label;
  session.branchName = null;
  session.branchInfo = null;
  previewMode = {label: info.label};
  document.getElementById('user-label').textContent = info.title || (info.areaName ? `מנהל אזור · ${info.label}` : `${info.label} · תצוגה ארצית`);
  document.getElementById('user-avatar').textContent = info.label.slice(0,2);
  closeModal();
  goTo('dashboard');
}
let realUserEmail = null; /* currentUserEmail האמיתי, נשמר בזמן צפייה כאיש צוות אחר */
function startPreviewAsStaff(email){
  const rec = STAFF[email];
  if(!rec) return;
  if(!realSession) realSession = {...session};
  if(realUserEmail===null) realUserEmail = currentUserEmail;
  currentUserEmail = email;
  const disp = marketingDisplayFor(email);
  previewMode = {label: disp.name};
  document.getElementById('user-label').textContent = disp.label;
  document.getElementById('user-avatar').textContent = disp.name.slice(0,2);
  closeModal();
  goTo('dashboard');
}
function exitPreviewMode(){
  if(!realSession) return;
  session = realSession;
  realSession = null;
  if(realUserEmail !== null){ currentUserEmail = realUserEmail; realUserEmail = null; }
  previewMode = null;
  const disp = marketingDisplayFor(currentUserEmail);
  document.getElementById('user-label').textContent = disp.label;
  document.getElementById('user-avatar').textContent = disp.name.slice(0,2);
  goTo('admin');
}
function renderPreviewBanner(){
  const banner = document.getElementById('preview-banner');
  const toggleBtn = document.getElementById('preview-toggle-btn');
  if(!banner || !toggleBtn) return;
  if(previewMode){
    banner.style.display = 'flex';
    banner.innerHTML = `<span>👁 צפייה כמשתמש: <b>${previewMode.label}</b> — זו תצוגה בלבד, פעולות שמירה מושבתות</span><button onclick="exitPreviewMode()">יציאה ממצב תצוגה</button>`;
    toggleBtn.style.display = 'none';
  } else {
    banner.style.display = 'none';
    banner.innerHTML = '';
    toggleBtn.style.display = (session.role==='marketing' && staffDepartments(currentUserEmail).length===Object.keys(DEPARTMENTS).length) ? 'flex' : 'none';
  }
}
function logout(){
  document.getElementById('app-screen').style.display='none';
  document.getElementById('login-screen').style.display='flex';
  clearIdentity();
  session = {role:null, branchName:null, branchInfo:null, areaName:null, areaLabel:null};
  ui = {view:"dashboard", adminTab:"competitions", materialFilter:"הכל", department:null, conversationOpenKey:null};
}

/* ---------- Remembered identity (best-effort; falls back to session-only) ---------- */
const IDENTITY_KEY = 'nizatHubIdentity';
function saveIdentity(email){
  try{ localStorage.setItem(IDENTITY_KEY, JSON.stringify({email})); }catch(e){ /* storage unavailable — session-only */ }
}
function loadIdentity(){
  try{
    const raw = localStorage.getItem(IDENTITY_KEY);
    return raw ? JSON.parse(raw) : null;
  }catch(e){ return null; }
}
function clearIdentity(){
  try{ localStorage.removeItem(IDENTITY_KEY); }catch(e){ /* ignore */ }
}
