/* ============================================================
   ניהול הרשאות (permissions.js)
   ------------------------------------------------------------
   מסך שבו בעלי המערכת (PERMISSION_OWNERS) נותנים לעובדים יכולות נוספות
   באפליקציה, בלי לגעת בקוד. כל יכולת מוגדרת פעם אחת ב-APP_PERMISSIONS,
   וההרשאות עצמן נשמרות ב-Firestore בקולקציה appPermissions — מסמך אחד לכל
   עובד, שה-ID שלו הוא כתובת המייל:
     appPermissions/yulia@nizat.co.il = { email, perms:{previewAsUser:true},
                                          updatedAt, updatedBy }

   חשוב: אלו הרשאות לפיצ'רים בממשק בלבד (למשל "צפייה כמשתמש"). מי מנהל
   איזו מחלקה (STAFF ב-firebase-init.js) וחוקי האבטחה ב-firestore.rules
   ממשיכים לעבוד בדיוק כמו קודם — לא שינינו אותם כאן.

   הוספת יכולת חדשה בעתיד = שורה אחת ב-APP_PERMISSIONS + בדיקה של
   hasPermission('שם_היכולת') במקום הרלוונטי בקוד.
============================================================ */

/* בעלי המערכת — תמיד מקבלים את כל ההרשאות, והם היחידים שרואים את מסך
   "ניהול הרשאות" ויכולים לשנות אותו. רשימה סגורה בכוונה (וחייבת להתאים
   לחוק של appPermissions ב-firestore.rules). */
const PERMISSION_OWNERS = ['eliran@nizat.co.il', 'ai@nizat.co.il'];

/* קטלוג היכולות שאפשר לתת לעובדים. */
const APP_PERMISSIONS = {
  previewAsUser: {
    label: 'צפייה כמשתמש',
    desc: 'לראות את האפליקציה בדיוק כמו שסניף, מנהל אזור או איש צוות אחר רואים אותה — כולל תצוגת טלפון. תצוגה בלבד, פעולות שמירה מושבתות.'
  }
};

let myPermissions = {};
let allPermissionDocs = null; // רק לבעלי המערכת — כל המסמכים, למסך הניהול
let unsubMyPermissions = null;
let unsubAllPermissions = null;
let permissionsSyncedFor = null;
let permissionsReadyResolve = null;
const permissionsReady = new Promise(function(resolve){ permissionsReadyResolve = resolve; });

/* המייל האמיתי של המשתמש המחובר — גם כשהוא באמצע "צפייה כאיש צוות אחר"
   (אז currentUserEmail מוחלף זמנית, ו-realUserEmail שומר את המקורי). */
function realLoggedInEmail(){
  return (typeof realUserEmail !== 'undefined' && realUserEmail !== null) ? realUserEmail : currentUserEmail;
}
function isPermissionOwner(){
  const email = realLoggedInEmail();
  return !!email && PERMISSION_OWNERS.indexOf(email) !== -1;
}
function hasPermission(perm){
  if(isPermissionOwner()) return true;
  return !!(myPermissions && myPermissions[perm] === true);
}
/* מי רשאי להשתמש ב"צפייה כמשתמש": בעלי גישה מלאה (כמו קודם) או מי שקיבל
   את ההרשאה במסך ניהול ההרשאות. */
function canUsePreviewMode(){
  const email = realLoggedInEmail();
  const isFullAccess = staffDepartments(email).length === Object.keys(DEPARTMENTS).length;
  return isFullAccess || hasPermission('previewAsUser');
}

/* נקרא מ-enterApp() לאנשי צוות. בטוח לקריאה חוזרת. */
function initPermissionsSync(){
  const email = realLoggedInEmail();
  if(!firebaseReady || typeof db === 'undefined' || !db || !email){
    permissionsReadyResolve();
    return;
  }
  if(permissionsSyncedFor === email) return;
  permissionsSyncedFor = email;

  if(unsubMyPermissions) unsubMyPermissions();
  unsubMyPermissions = db.collection('appPermissions').doc(email).onSnapshot(function(doc){
    myPermissions = (doc.exists && doc.data() && doc.data().perms) || {};
    permissionsReadyResolve();
    if(typeof renderPreviewBanner === 'function') renderPreviewBanner();
  }, function(err){
    console.error('Firestore sync error (appPermissions - mine):', err);
    myPermissions = {};
    permissionsReadyResolve();
  });

  if(unsubAllPermissions){ unsubAllPermissions(); unsubAllPermissions = null; }
  allPermissionDocs = null;
  if(PERMISSION_OWNERS.indexOf(email) !== -1){
    unsubAllPermissions = db.collection('appPermissions').onSnapshot(function(snap){
      const map = {};
      snap.docs.forEach(function(d){ map[d.id] = d.data() || {}; });
      allPermissionDocs = map;
      if(ui.view === 'admin' && ui.adminTab === 'permissions') renderContent();
    }, function(err){
      console.error('Firestore sync error (appPermissions - all):', err);
      allPermissionDocs = {};
      if(ui.view === 'admin' && ui.adminTab === 'permissions') renderContent();
    });
  }
}

/* ---------- רשימת העובדים שמוצגת במסך ---------- */
function permissionCandidates(){
  const rows = {};
  Object.keys(STAFF).forEach(function(email){
    if(PERMISSION_OWNERS.indexOf(email) !== -1) return;
    const disp = marketingDisplayFor(email);
    rows[email] = { email: email, name: disp.name, sub: disp.label.split(' · ')[1] || 'צוות', group: 'צוות מטה' };
  });
  Object.keys(AREA_MANAGER_INFO).forEach(function(email){
    if(rows[email] || PERMISSION_OWNERS.indexOf(email) !== -1) return;
    const info = AREA_MANAGER_INFO[email];
    rows[email] = { email: email, name: info.label, sub: info.title || 'מנהל אזור', group: 'מנהלי אזור והנהלה' };
  });
  Object.keys(allPermissionDocs || {}).forEach(function(email){
    if(rows[email] || PERMISSION_OWNERS.indexOf(email) !== -1) return;
    rows[email] = { email: email, name: email.split('@')[0], sub: 'נוסף ידנית', group: 'נוספו ידנית', custom: true };
  });
  return Object.keys(rows).map(function(k){ return rows[k]; });
}

function adminPermissions(){
  if(!isPermissionOwner()){
    return `<div class="card"><div class="empty-state">המסך הזה זמין רק למנהלי המערכת.</div></div>`;
  }
  ensurePermissionsStyles();
  if(allPermissionDocs === null){
    return `<div class="card"><div class="empty-state">טוען הרשאות…</div></div>`;
  }
  const permKeys = Object.keys(APP_PERMISSIONS);
  const candidates = permissionCandidates();
  const groups = ['צוות מטה', 'מנהלי אזור והנהלה', 'נוספו ידנית'];

  const legend = permKeys.map(function(k){
    return `<div class="perm-legend-item"><b>${esc(APP_PERMISSIONS[k].label)}</b> — ${esc(APP_PERMISSIONS[k].desc)}</div>`;
  }).join('');

  const groupHtml = groups.map(function(g){
    const list = candidates.filter(function(c){ return c.group === g; })
      .sort(function(a,b){ return a.name.localeCompare(b.name, 'he'); });
    if(!list.length) return '';
    return `
      <div class="perm-group-title">${esc(g)}</div>
      ${list.map(function(c){
        const perms = ((allPermissionDocs[c.email] || {}).perms) || {};
        const enc = encodeURIComponent(c.email);
        return `
          <div class="perm-row">
            <div class="perm-who">
              <div class="perm-name">${esc(c.name)}</div>
              <div class="perm-sub">${esc(c.sub)} · <span dir="ltr">${esc(c.email)}</span></div>
            </div>
            <div class="perm-toggles">
              ${permKeys.map(function(k){
                return `
                  <label class="perm-toggle">
                    <input type="checkbox" ${perms[k] === true ? 'checked' : ''}
                      onchange="setUserPermission(decodeURIComponent('${enc}'), '${k}', this.checked, this)">
                    <span class="perm-switch" aria-hidden="true"></span>
                    <span class="perm-toggle-label">${esc(APP_PERMISSIONS[k].label)}</span>
                  </label>`;
              }).join('')}
              ${c.custom ? `<button type="button" class="perm-remove" title="הסרת העובד מהרשימה" onclick="removeUserPermissions(decodeURIComponent('${enc}'))">הסרה</button>` : ''}
            </div>
          </div>`;
      }).join('')}
    `;
  }).join('');

  return `
    <div class="card">
      <p style="font-size:13px;color:var(--text-secondary);margin:0 0 12px;">
        כאן נותנים לעובדים יכולות נוספות באפליקציה. שינוי נכנס לתוקף מיד אצל העובד — בלי התנתקות.
      </p>
      <div class="perm-legend">${legend}</div>

      <div class="perm-owners">
        <b>גישה מלאה תמיד:</b> ${PERMISSION_OWNERS.map(function(e){ return `<span dir="ltr">${esc(e)}</span>`; }).join(', ')}
      </div>

      ${groupHtml}

      <div class="perm-group-title">הוספת עובד שלא ברשימה</div>
      <div class="perm-add">
        <input type="email" id="perm-add-email" dir="ltr" placeholder="name@nizat.co.il"
          onkeydown="if(event.key==='Enter'){addPermissionUser();}">
        <button type="button" class="btn-primary" onclick="addPermissionUser()">הוספה לרשימה</button>
      </div>
    </div>
  `;
}

function setUserPermission(email, perm, value, inputEl){
  if(!isPermissionOwner()){ toast('רק מנהלי המערכת יכולים לשנות הרשאות'); return; }
  if(previewMode){
    toast('פעולה לא זמינה במצב תצוגה');
    if(inputEl) inputEl.checked = !value;
    return;
  }
  if(!APP_PERMISSIONS[perm]) return;
  const perms = {}; perms[perm] = !!value;
  db.collection('appPermissions').doc(email).set({
    email: email,
    perms: perms,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy: realLoggedInEmail()
  }, { merge: true }).then(function(){
    toast(value ? `ההרשאה "${APP_PERMISSIONS[perm].label}" ניתנה ✓` : `ההרשאה "${APP_PERMISSIONS[perm].label}" הוסרה`);
  }).catch(function(err){
    console.error('שמירת הרשאה נכשלה:', err);
    toast('השמירה נכשלה — ייתכן שחסר חוק ל-appPermissions ב-firestore.rules');
    if(inputEl) inputEl.checked = !value;
  });
}

function addPermissionUser(){
  if(!isPermissionOwner()) return;
  if(previewMode){ toast('פעולה לא זמינה במצב תצוגה'); return; }
  const input = document.getElementById('perm-add-email');
  const email = normalizeEmail(input ? input.value : '');
  if(!/^[^@\s]+@[^@\s]+$/.test(email) || email.split('@')[1] !== ALLOWED_GOOGLE_DOMAIN){
    toast('יש להזין כתובת מייל תקינה בדומיין ' + ALLOWED_GOOGLE_DOMAIN);
    return;
  }
  if(PERMISSION_OWNERS.indexOf(email) !== -1){ toast('למשתמש הזה כבר יש גישה מלאה'); return; }
  db.collection('appPermissions').doc(email).set({
    email: email,
    perms: {},
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy: realLoggedInEmail()
  }, { merge: true }).then(function(){
    toast('נוסף לרשימה — עכשיו אפשר לסמן לו הרשאות');
  }).catch(function(err){
    console.error('הוספת משתמש להרשאות נכשלה:', err);
    toast('השמירה נכשלה — ייתכן שחסר חוק ל-appPermissions ב-firestore.rules');
  });
}

function removeUserPermissions(email){
  if(!isPermissionOwner()) return;
  if(previewMode){ toast('פעולה לא זמינה במצב תצוגה'); return; }
  if(!confirm('להסיר את ' + email + ' מהרשימה ולבטל את כל ההרשאות שלו?')) return;
  db.collection('appPermissions').doc(email).delete().then(function(){
    toast('הוסר');
  }).catch(function(err){
    console.error('הסרת הרשאות נכשלה:', err);
    toast('ההסרה נכשלה');
  });
}

/* ============================================================
   תצוגת טלפון — פותחת את האפליקציה בתוך מסגרת בגודל טלפון (iframe),
   כך שכל ההתאמות למובייל (media queries) עובדות בדיוק כמו במכשיר אמיתי.
   ה-iframe טוען את אותה כתובת עם ?embedPreview=<סוג>:<מייל>, ושם —
   אחרי שההרשאות נטענו — נכנס אוטומטית לאותה "צפייה כמשתמש".
============================================================ */
const PHONE_PREVIEW_DEVICES = [
  { id: 'iphone',  label: 'iPhone (390×844)',  w: 390, h: 844 },
  { id: 'android', label: 'Android (412×915)', w: 412, h: 915 },
  { id: 'small',   label: 'טלפון קטן (360×740)', w: 360, h: 740 }
];
let phonePreviewDevice = 'iphone';

const EMBED_PREVIEW_PARAM = (function(){
  try { return new URLSearchParams(location.search).get('embedPreview'); } catch(e){ return null; }
})();
function isEmbeddedPreview(){ return !!EMBED_PREVIEW_PARAM; }
if(EMBED_PREVIEW_PARAM){
  document.addEventListener('DOMContentLoaded', function(){
    document.body.classList.add('embed-preview');
    ensurePermissionsStyles();
  });
}

/* נקרא בסוף enterApp() — רק בתוך ה-iframe של תצוגת הטלפון. */
function applyEmbedPreviewIfNeeded(){
  if(!EMBED_PREVIEW_PARAM || session.role !== 'marketing') return;
  permissionsReady.then(function(){
    if(!canUsePreviewMode()){ toast('אין לך הרשאה ל"צפייה כמשתמש"'); return; }
    const idx = EMBED_PREVIEW_PARAM.indexOf(':');
    const kind = EMBED_PREVIEW_PARAM.slice(0, idx);
    const email = EMBED_PREVIEW_PARAM.slice(idx + 1);
    loadBranchDirectory().then(function(){
      if(kind === 'branch') startPreviewAsBranch(email);
      else if(kind === 'area') startPreviewAsArea(email);
      else if(kind === 'staff') startPreviewAsStaff(email);
    });
  });
}

function openPhonePreview(){
  if(!previewMode || !previewMode.kind || !previewMode.email) return;
  ensurePermissionsStyles();
  closePhonePreview();
  const src = location.origin + location.pathname + '?embedPreview=' +
    encodeURIComponent(previewMode.kind + ':' + previewMode.email);
  const overlay = document.createElement('div');
  overlay.id = 'phone-preview-overlay';
  overlay.className = 'phone-preview-overlay';
  overlay.onclick = function(e){ if(e.target === overlay) closePhonePreview(); };
  overlay.innerHTML = `
    <div class="phone-preview-wrap">
      <div class="phone-preview-bar">
        <span>📱 ${esc(previewMode.label)}</span>
        <select id="phone-preview-device" onchange="setPhonePreviewDevice(this.value)">
          ${PHONE_PREVIEW_DEVICES.map(function(d){ return `<option value="${d.id}" ${d.id===phonePreviewDevice?'selected':''}>${esc(d.label)}</option>`; }).join('')}
        </select>
        <button type="button" onclick="document.getElementById('phone-preview-iframe').src=document.getElementById('phone-preview-iframe').src">רענון</button>
        <button type="button" onclick="closePhonePreview()">סגירה ✕</button>
      </div>
      <div class="phone-frame-holder" id="phone-frame-holder">
        <div class="phone-frame" id="phone-frame">
          <iframe id="phone-preview-iframe" src="${src}" title="תצוגת טלפון"></iframe>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  layoutPhonePreview();
  window.addEventListener('resize', layoutPhonePreview);
}
function setPhonePreviewDevice(id){
  phonePreviewDevice = id;
  layoutPhonePreview();
}
function layoutPhonePreview(){
  const frame = document.getElementById('phone-frame');
  const holder = document.getElementById('phone-frame-holder');
  if(!frame || !holder) return;
  const dev = PHONE_PREVIEW_DEVICES.find(function(d){ return d.id === phonePreviewDevice; }) || PHONE_PREVIEW_DEVICES[0];
  const border = 12;
  const outerW = dev.w + border * 2, outerH = dev.h + border * 2;
  const scale = Math.min(1, (window.innerHeight - 90) / outerH, (window.innerWidth - 32) / outerW);
  frame.style.width = dev.w + 'px';
  frame.style.height = dev.h + 'px';
  frame.style.transform = 'scale(' + scale + ')';
  holder.style.width = Math.round(outerW * scale) + 'px';
  holder.style.height = Math.round(outerH * scale) + 'px';
}
function closePhonePreview(){
  const el = document.getElementById('phone-preview-overlay');
  if(el) el.remove();
  window.removeEventListener('resize', layoutPhonePreview);
}

/* ---------- עיצוב (מוזרק פעם אחת, כדי לא לגעת ב-main.css) ---------- */
let permissionsStylesInjected = false;
function ensurePermissionsStyles(){
  if(permissionsStylesInjected) return;
  permissionsStylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .perm-legend{background:var(--page);border-radius:var(--radius-sm);padding:10px 12px;font-size:12.5px;color:var(--text-secondary);margin-bottom:12px;}
    .perm-legend b{color:var(--text-primary);}
    .perm-owners{font-size:12.5px;color:var(--muted);margin-bottom:6px;}
    .perm-group-title{font-size:11.5px;font-weight:600;color:var(--muted);margin:18px 2px 6px;}
    .perm-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 4px;border-bottom:1px solid var(--gridline);flex-wrap:wrap;}
    .perm-row:last-child{border-bottom:none;}
    .perm-name{font-size:14px;font-weight:500;}
    .perm-sub{font-size:12px;color:var(--muted);margin-top:2px;}
    .perm-toggles{display:flex;align-items:center;gap:14px;flex-wrap:wrap;}
    .perm-toggle{display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;user-select:none;}
    .perm-toggle input{position:absolute;opacity:0;width:1px;height:1px;}
    .perm-switch{width:36px;height:20px;border-radius:99px;background:var(--gridline);position:relative;transition:background .15s;flex-shrink:0;}
    .perm-switch::after{content:'';position:absolute;top:2px;right:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:right .15s;}
    .perm-toggle input:checked + .perm-switch{background:#4a3aa7;}
    .perm-toggle input:checked + .perm-switch::after{right:18px;}
    .perm-toggle input:focus-visible + .perm-switch{outline:2px solid #4a3aa7;outline-offset:2px;}
    .perm-remove{background:none;border:none;color:var(--critical);font-size:12.5px;cursor:pointer;padding:4px 6px;}
    .perm-add{display:flex;gap:8px;flex-wrap:wrap;}
    .perm-add input{flex:1;min-width:200px;padding:9px 12px;border:1px solid var(--gridline);border-radius:var(--radius-sm);font-size:14px;background:var(--surface-1, #fff);color:var(--text-primary);}

    .phone-preview-overlay{position:fixed;inset:0;background:rgba(20,18,30,.72);z-index:10000;display:flex;align-items:center;justify-content:center;}
    .phone-preview-wrap{display:flex;flex-direction:column;align-items:center;gap:10px;}
    .phone-preview-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:center;color:#fff;font-size:13.5px;font-weight:500;}
    .phone-preview-bar select,.phone-preview-bar button{background:rgba(255,255,255,.18);border:none;color:#fff;font-size:12.5px;font-weight:600;padding:5px 12px;border-radius:99px;cursor:pointer;font-family:inherit;}
    .phone-preview-bar select option{color:#000;}
    .phone-preview-bar button:hover{background:rgba(255,255,255,.3);}
    .phone-frame-holder{position:relative;}
    .phone-frame{position:absolute;top:0;right:0;transform-origin:top right;border:12px solid #111;border-radius:42px;background:#111;box-sizing:content-box;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.45);}
    .phone-frame iframe{width:100%;height:100%;border:0;border-radius:30px;background:#fff;display:block;}
    body.embed-preview #preview-toggle-btn{display:none !important;}
  `;
  document.head.appendChild(style);
}
