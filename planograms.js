/* ============================================================
   planograms.js
   ------------------------------------------------------------
   "פלנוגרמות" · רכש.
   מתרגם את מצגת הפלנוגרמות של מחלקת הרכש לחוויה תפעולית פשוטה
   לעובדי הסניפים: בוחרים מחלקה ורואים מה בגובה העיניים, מה אחריו,
   הנחיות חשובות, מוצרים חדשים / שינוי מיקום ומוצרים שמוצגים ביותר
   ממקום אחד. כולל חיפוש לפי מוצר / מותג / מחלקה / תת-מחלקה.

   מבנה נתונים (Firestore) — DATA נפרד מ-UI:
     planograms/{deptId}      מסמך לכל מחלקה (d7, d18...) עם
                              subcategories[] → entries[] → items[]
     config/planogramLegend   המקרא הגלובלי (defaultShelfRules),
                              ודגל published (מתג "פרסם לסניפים").

   הרשאות: קריאה — כל משתמש מחובר. כתיבה — isDeptAdmin('purchasing')
   (ראו firestore.rules). עד שהרכש מפעיל "פרסם לסניפים", המסך גלוי
   בממשק רק לצוות הרכש ול-super-admin (גם במצב "צפייה כמשתמש").

   ייבוא: מסך הפלנוגרמות מציג לצוות הרכש כפתור "ייבוא JSON" שקורא
   את planograms-seed.json ומחליף את כל הפלנוגרמות. מחלקה שהתוכן
   שלה לא השתנה שומרת על תאריך "עודכן לאחרונה" הקודם שלה.

   נטען אחרי navigation.js (משתמש ב-goTo, ui, renderNav) ואחרי
   firebase-init.js (db, fbAuth, currentUserEmail).
============================================================ */

const PLANO_CACHE_KEY = 'nizatHubPlanogramsV1';
const PLANO_PUBLISHED_KEY = 'nizatHubPlanoPublished';
const PLANO_SUPER_ADMIN_EMAILS = ['eliran@nizat.co.il', 'yulia@nizat.co.il', 'ai@nizat.co.il'];
const PLANO_DEFAULT_RULES = [
  {priority:1, text:"מדף גובה העיניים (1.65 מ')"},
  {priority:2, text:'מדף מתחת / מעל לגובה העיניים'},
  {priority:3, text:'ממשיכים לפי סדר העדיפות', appliesToAllBelow:true}
];
const PLANO_NEW_LABEL_DEFAULT = 'חדש / שינוי מיקום';
const PLANO_MAX_RESULTS = 60;

/* ---------- מצב ---------- */
let planoData = {
  loaded: false,
  loading: false,
  departments: [],
  byId: {},
  legend: null,
  index: [],
  incoming: {},
  fromCache: false,
  cacheSavedAt: null,
  error: null
};
let planoPublished = (function(){
  try { return localStorage.getItem(PLANO_PUBLISHED_KEY) === '1'; } catch(e){ return false; }
})();
let planoState = {
  query: '',
  subByDept: {},
  highlight: null,
  cameFromList: false,
  focusSearch: false,
  caret: null
};

/* ============================================================
   הרשאות ונראות
============================================================ */
/* צוות פנימי — רואה את המסך גם לפני פרסום לסניפים. לפי המייל האמיתי
   (Firebase Auth), כך שזה נשמר גם במצב "צפייה כמשתמש". */
function planoIsInternalViewer(){
  const email = typeof currentUserEmail !== 'undefined' ? currentUserEmail : null;
  if(!email) return false;
  if(PLANO_SUPER_ADMIN_EMAILS.indexOf(email) !== -1) return true;
  return typeof staffDepartments === 'function' && staffDepartments(email).indexOf('purchasing') !== -1;
}
/* האם להציג את הכרטיס "פלנוגרמות" בניווט עבור המשתמש הנוכחי. */
function planoIsVisibleToCurrentUser(){
  return planoPublished || planoIsInternalViewer();
}
/* כלי ניהול (ייבוא / פרסום) — רק בזהות האמיתית של צוות רכש, לא בזמן
   "צפייה כמשתמש" (שם session.role הוא של סניף ו-canManageDepartment=false). */
function planoCanManage(){
  return typeof canManageDepartment === 'function' && canManageDepartment('purchasing');
}

/* טעינת דגל הפרסום מיד אחרי התחברות — מסמך אחד קטן, כדי שהניווט ידע
   אם להציג את הכרטיס לסניף. */
function planoFetchPublishState(){
  if(typeof firebaseReady === 'undefined' || !firebaseReady || !db) return;
  db.collection('config').doc('planogramLegend').get().then(function(doc){
    const data = doc.exists ? doc.data() : {};
    planoApplyPublished(!!data.published);
  }).catch(function(err){
    console.warn('planograms: טעינת מצב פרסום נכשלה (לא קריטי):', err);
  });
}
function planoApplyPublished(val){
  const changed = planoPublished !== val;
  planoPublished = val;
  try { localStorage.setItem(PLANO_PUBLISHED_KEY, val ? '1' : '0'); } catch(e){}
  if(changed && typeof session !== 'undefined' && session.role){
    if(typeof renderNav === 'function') renderNav();
    if(typeof ui !== 'undefined' && (ui.view === 'planograms' || (ui.view === 'dashboard' && ui.department === 'purchasing'))){
      if(typeof renderContent === 'function') renderContent();
    }
  }
}
if(typeof fbAuth !== 'undefined' && fbAuth){
  fbAuth.onAuthStateChanged(function(user){
    if(user) planoFetchPublishState();
  });
}

/* ============================================================
   עזרי טקסט ותאריך
============================================================ */
function planoEsc(s){
  return typeof esc === 'function' ? esc(s) : String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function planoToday(){
  if(typeof todayHeb === 'function') return todayHeb();
  const d = new Date();
  return String(d.getDate()).padStart(2,'0') + '.' + String(d.getMonth()+1).padStart(2,'0') + '.' + d.getFullYear();
}
/* נרמול לחיפוש בעברית: אותיות סופיות, ניקוד, גרשיים, "ללא גלוטן" = "לל"ג". */
function planoNorm(s){
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/[\u0591-\u05C7]/g, '')
    .replace(/["'`׳״’‘“”]/g, '')
    .replace(/ך/g,'כ').replace(/ם/g,'מ').replace(/ן/g,'נ').replace(/ף/g,'פ').replace(/ץ/g,'צ')
    .replace(/ללא\s*גלוטנ/g, 'ללג')
    .replace(/[\/,\-+.():;!&|·—–]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
/* JSON עם מפתחות ממוינים — Firestore לא שומר על סדר מפתחות במפות,
   אז השוואת "השתנה / לא השתנה" בייבוא חייבת להיות לא תלויה בסדר. */
function planoCanonical(v){
  if(Array.isArray(v)) return '[' + v.map(planoCanonical).join(',') + ']';
  if(v && typeof v === 'object'){
    return '{' + Object.keys(v).sort().map(function(k){ return JSON.stringify(k) + ':' + planoCanonical(v[k]); }).join(',') + '}';
  }
  return JSON.stringify(v === undefined ? null : v);
}

/* ============================================================
   סגנונות — מוזרקים פעם אחת (כמו new-on-shelf.js), על בסיס
   משתני main.css כדי שמצב כהה יעבוד אוטומטית.
============================================================ */
function planoInjectStyleOnce(){
  if(document.getElementById('plano-style')) return;
  const style = document.createElement('style');
  style.id = 'plano-style';
  style.textContent = `
    .plano-wrap{max-width:760px;}
    .plano-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px;}
    .plano-head h1{margin:0 0 4px;font-size:24px;font-weight:500;}
    .plano-head p{margin:0;font-size:15px;color:var(--text-secondary);}
    .plano-help-btn{flex:none;display:inline-flex;align-items:center;gap:6px;border:1px solid var(--gridline);background:var(--surface-1);color:var(--text-secondary);border-radius:99px;padding:8px 13px;font-size:13.5px;font-weight:500;min-height:38px;}
    .plano-help-btn:hover{border-color:var(--blue);color:var(--blue);}

    .plano-search{position:relative;margin-bottom:18px;}
    .plano-search input{width:100%;padding:14px 46px 14px 14px;border-radius:12px;border:1.5px solid var(--gridline);background:var(--surface-1);color:var(--text-primary);font-size:16.5px;}
    .plano-search input:focus{outline:2px solid rgba(69,122,31,0.35);border-color:var(--blue);}
    .plano-search .plano-search-ic{position:absolute;right:15px;top:50%;transform:translateY(-50%);color:var(--muted);font-size:19px;pointer-events:none;display:flex;}
    .plano-search-clear{position:absolute;left:8px;top:50%;transform:translateY(-50%);border:none;background:none;color:var(--muted);font-size:20px;width:36px;height:36px;border-radius:50%;}
    .plano-search.compact input{padding-top:11px;padding-bottom:11px;font-size:15.5px;}

    .plano-banner{border-radius:12px;padding:12px 14px;margin-bottom:14px;font-size:14px;line-height:1.55;}
    .plano-banner.staff{background:rgba(250,178,25,0.14);color:var(--text-primary);border:1px solid rgba(250,178,25,0.45);}
    .plano-banner.offline{background:var(--page);color:var(--text-secondary);border:1px solid var(--gridline);}

    .plano-admin{border:1px dashed var(--gridline);border-radius:12px;padding:12px 14px;margin-bottom:16px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;background:var(--surface-1);}
    .plano-admin-status{flex:1 1 220px;font-size:13.5px;color:var(--text-secondary);line-height:1.5;}
    .plano-admin-status b{color:var(--text-primary);font-weight:500;}
    .plano-admin button{border:1px solid var(--gridline);background:var(--surface-1);color:var(--text-primary);border-radius:9px;padding:9px 14px;font-size:14px;font-weight:500;min-height:40px;}
    .plano-admin button.primary{background:var(--blue);border-color:var(--blue);color:#fff;}
    .plano-admin button.primary:hover{background:var(--blue-dark);}

    .plano-dept-list{list-style:none;margin:0;padding:0;background:var(--surface-1);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;}
    .plano-dept-list li + li{border-top:1px solid var(--gridline);}
    .plano-dept-row{width:100%;display:flex;align-items:center;gap:12px;padding:15px 16px;border:none;background:none;text-align:right;color:var(--text-primary);min-height:58px;}
    .plano-dept-row:hover{background:var(--page);}
    .plano-dept-name{flex:1;font-size:16.5px;font-weight:500;}
    .plano-dept-num{font-size:13px;color:var(--muted);white-space:nowrap;}
    .plano-chev{color:var(--muted);font-size:18px;line-height:1;}

    .plano-back{display:inline-flex;align-items:center;gap:6px;border:none;background:none;color:var(--blue);font-size:15px;font-weight:500;padding:8px 0;margin-bottom:6px;min-height:40px;}
    .plano-dept-title{margin:0 0 2px;font-size:25px;font-weight:500;line-height:1.25;}
    .plano-dept-meta{font-size:14px;color:var(--text-secondary);margin-bottom:16px;display:flex;flex-wrap:wrap;gap:4px 14px;}

    .plano-alert{border-radius:12px;padding:13px 15px;margin-bottom:12px;}
    .plano-alert.critical{background:rgba(208,59,59,0.08);border:1.5px solid rgba(208,59,59,0.45);}
    .plano-alert.critical .plano-alert-title{color:var(--critical);}
    .plano-alert.info{background:var(--page);border:1px solid var(--gridline);}
    .plano-alert-title{display:flex;align-items:center;gap:7px;font-size:15px;font-weight:500;margin-bottom:6px;}
    .plano-alert ul{margin:0;padding:0 18px 0 0;}
    .plano-alert li{font-size:14.5px;line-height:1.6;margin-bottom:3px;}
    .plano-alert li:last-child{margin-bottom:0;}
    .plano-alert.info li{color:var(--text-secondary);}

    .plano-rules{font-size:13.5px;color:var(--text-secondary);border:1px solid var(--gridline);border-radius:12px;padding:11px 14px;margin-bottom:14px;background:var(--surface-1);}
    .plano-rules b{color:var(--text-primary);font-weight:500;}
    .plano-rules div{margin-top:3px;}

    .plano-chips{display:flex;flex-wrap:wrap;gap:8px;margin:4px 0 16px;}
    .plano-chip{border:1px solid var(--gridline);background:var(--surface-1);border-radius:99px;padding:9px 15px;font-size:14.5px;font-weight:500;color:var(--text-secondary);min-height:40px;}
    .plano-chip.active{background:var(--text-primary);color:var(--surface-1);border-color:var(--text-primary);}
    .plano-sub-title{font-size:19px;font-weight:500;margin:0 0 4px;}
    .plano-sub-parent{font-size:13px;color:var(--muted);margin-bottom:10px;}

    .plano-p{border-radius:var(--radius);margin-bottom:12px;padding:15px 16px;background:var(--surface-1);}
    .plano-p1{border:2px solid var(--blue);background:rgba(69,122,31,0.06);}
    .plano-p2{border:1px solid var(--border);box-shadow:var(--shadow);}
    .plano-p-head{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin-bottom:9px;}
    .plano-p-pill{display:inline-flex;align-items:center;border-radius:99px;padding:4px 11px;font-size:13px;font-weight:500;white-space:nowrap;}
    .plano-p1 .plano-p-pill{background:var(--blue);color:#fff;}
    .plano-p2 .plano-p-pill{border:1.5px solid var(--blue);color:var(--blue);}
    .plano-p-shelf{font-size:14px;color:var(--text-secondary);}
    .plano-p1 .plano-p-shelf{color:var(--text-primary);font-weight:500;}
    .plano-label{font-size:14px;color:var(--text-secondary);margin-bottom:3px;}
    .plano-items{line-height:1.65;}
    .plano-p1 .plano-items{font-size:18.5px;font-weight:500;}
    .plano-p2 .plano-items{font-size:16.5px;font-weight:500;}
    .plano-it-detail{font-weight:400;color:var(--text-secondary);font-size:.86em;}
    .plano-sep{color:var(--muted);font-weight:400;}
    .plano-new{display:inline-block;vertical-align:.1em;margin-inline-start:5px;border-radius:6px;padding:1px 7px;font-size:11.5px;font-weight:500;line-height:1.6;background:#dbe8f7;color:#1d4f8c;white-space:nowrap;}
    html[data-theme="dark"] .plano-new{background:rgba(120,165,230,0.2);color:#a9c8f2;}
    .plano-tag{display:inline-block;vertical-align:.1em;margin-inline-start:5px;border-radius:6px;padding:1px 7px;font-size:11.5px;font-weight:500;line-height:1.6;background:var(--page);color:var(--text-secondary);border:1px solid var(--gridline);white-space:nowrap;}
    .plano-warn{display:flex;gap:7px;align-items:flex-start;margin-top:9px;font-size:14px;font-weight:500;color:var(--critical);line-height:1.5;}
    .plano-note{margin-top:6px;font-size:13.5px;color:var(--text-secondary);}
    .plano-also{margin-top:9px;display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:13.5px;color:var(--text-secondary);}
    .plano-also button{border:1px solid var(--gridline);background:var(--surface-1);border-radius:99px;padding:5px 11px;font-size:13px;color:var(--blue);font-weight:500;min-height:32px;}
    .plano-issue{margin-top:8px;font-size:12.5px;color:var(--muted);border-top:1px dashed var(--gridline);padding-top:6px;}

    .plano-rest{background:var(--surface-1);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;margin-bottom:12px;}
    .plano-rest-row{display:flex;gap:12px;padding:12px 14px;align-items:flex-start;}
    .plano-rest-row + .plano-rest-row{border-top:1px solid var(--gridline);}
    .plano-num{flex:none;width:28px;height:28px;border-radius:50%;border:1.5px solid var(--gridline);display:flex;align-items:center;justify-content:center;font-size:13.5px;font-weight:500;color:var(--text-secondary);font-variant-numeric:tabular-nums;}
    .plano-rest-body{flex:1;min-width:0;}
    .plano-rest-row .plano-items{font-size:15.5px;}
    .plano-rest-shelf{font-size:13px;color:var(--muted);margin-bottom:2px;}

    .plano-group{font-size:14.5px;font-weight:500;color:var(--text-primary);margin:18px 2px 8px;padding-top:12px;border-top:1px solid var(--gridline);}
    .plano-section-title{font-size:15px;font-weight:500;margin:20px 2px 8px;}
    .plano-special .plano-num{border-color:var(--critical);color:var(--critical);}

    .plano-images{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;margin-bottom:14px;}
    .plano-images figure{margin:0;}
    .plano-images img{width:100%;border-radius:12px;display:block;background:var(--page);}
    .plano-images figcaption{font-size:13px;color:var(--muted);margin-top:4px;}

    .plano-res-count{font-size:13.5px;color:var(--muted);margin:0 2px 8px;}
    .plano-res{width:100%;text-align:right;display:block;border:1px solid var(--border);background:var(--surface-1);border-radius:12px;padding:13px 15px;margin-bottom:9px;color:var(--text-primary);}
    .plano-res:hover{border-color:var(--blue);}
    .plano-res-where{font-size:13px;color:var(--text-secondary);margin-bottom:4px;}
    .plano-res-main{font-size:16px;font-weight:500;line-height:1.5;}
    .plano-res-main mark{background:rgba(69,122,31,0.16);color:inherit;border-radius:3px;padding:0 2px;}
    .plano-res-meta{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px;}
    .plano-res-pri{display:inline-flex;border-radius:99px;padding:2px 10px;font-size:12.5px;font-weight:500;border:1.5px solid var(--blue);color:var(--blue);}
    .plano-res-pri.p1{background:var(--blue);color:#fff;}
    .plano-res-kind{font-size:12.5px;color:var(--muted);}
    .plano-empty{text-align:center;color:var(--muted);padding:34px 14px;font-size:15px;line-height:1.6;}

    .plano-legend-row{display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-top:1px solid var(--gridline);}
    .plano-legend-row:first-of-type{border-top:none;}
    .plano-legend-key{flex:none;min-width:92px;}
    .plano-legend-text{font-size:14.5px;line-height:1.55;color:var(--text-primary);}

    .plano-hl{animation:plano-flash 1.8s ease;}
    @keyframes plano-flash{0%,35%{box-shadow:0 0 0 3px rgba(69,122,31,0.55);}100%{box-shadow:0 0 0 0 rgba(69,122,31,0);}}
    @media (prefers-reduced-motion: reduce){ .plano-hl{animation:none;outline:3px solid rgba(69,122,31,0.55);} }

    .plano-wrap button:focus-visible, .plano-wrap input:focus-visible{outline:2px solid var(--blue);outline-offset:2px;}

    @media (max-width:640px){
      .plano-head h1{font-size:22px;}
      .plano-dept-title{font-size:22px;}
      .plano-p{padding:14px;}
      .plano-p1 .plano-items{font-size:17.5px;}
      .plano-help-btn .plano-help-txt{display:none;}
    }
  `;
  document.head.appendChild(style);
}

/* ============================================================
   טעינת נתונים + cache מקומי (לעבודה בקליטה חלשה)
============================================================ */
function planoReadCache(){
  try {
    const raw = localStorage.getItem(PLANO_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch(e){ return null; }
}
function planoWriteCache(departments, legend){
  try {
    localStorage.setItem(PLANO_CACHE_KEY, JSON.stringify({departments: departments, legend: legend, savedAt: Date.now()}));
  } catch(e){ console.warn('planograms: שמירת cache נכשלה (לא קריטי):', e); }
}
function planoSetData(departments, legend){
  departments = (departments || []).slice().sort(function(a,b){ return (a.order||999) - (b.order||999) || (a.number||0) - (b.number||0); });
  planoData.departments = departments;
  planoData.byId = {};
  departments.forEach(function(d){ planoData.byId[d.id] = d; });
  planoData.legend = legend || null;
  planoBuildIncoming();
  planoBuildIndex();
}
function planoEnsureLoaded(){
  if(planoData.loaded || planoData.loading) return;
  if(!planoData.departments.length){
    const cached = planoReadCache();
    if(cached && cached.departments){
      planoSetData(cached.departments, cached.legend);
      planoData.fromCache = true;
      planoData.cacheSavedAt = cached.savedAt || null;
    }
  }
  if(typeof firebaseReady === 'undefined' || !firebaseReady || !db){
    planoData.loaded = true;
    return;
  }
  planoData.loading = true;
  Promise.all([
    db.collection('planograms').get(),
    db.collection('config').doc('planogramLegend').get()
  ]).then(function(res){
    const departments = [];
    res[0].forEach(function(doc){ departments.push(Object.assign({}, doc.data(), {id: doc.id})); });
    const legend = res[1].exists ? res[1].data() : null;
    planoSetData(departments, legend);
    planoWriteCache(departments, legend);
    planoData.fromCache = false;
    planoData.error = null;
    planoData.loaded = true;
    planoData.loading = false;
    if(legend) planoApplyPublished(!!legend.published);
    planoRerender();
  }).catch(function(err){
    console.error('planograms: טעינה נכשלה', err);
    planoData.error = err;
    planoData.loaded = true;
    planoData.loading = false;
    planoRerender();
  });
}
function planoReload(){
  planoData.loaded = false;
  planoData.loading = false;
  planoEnsureLoaded();
}
function planoRerender(){
  if(typeof ui !== 'undefined' && ui.view === 'planograms' && typeof renderContent === 'function') renderContent();
}

/* "מוצג גם כאן" — מפה הפוכה של alsoAt, כדי שמחלקת היעד תציג את המוצר
   בלי לשכפל אותו בנתונים. */
function planoBuildIncoming(){
  const inc = {};
  planoData.departments.forEach(function(d){
    (d.subcategories||[]).forEach(function(s){
      (s.entries||[]).forEach(function(e){
        (e.alsoAt||[]).forEach(function(a){
          const key = a.departmentId + '/' + a.subcategoryId;
          (inc[key] = inc[key] || []).push({fromDept:d, fromSub:s, entry:e, ref:a});
        });
      });
    });
  });
  planoData.incoming = inc;
}

/* אינדקס חיפוש — רשומה לכל מחלקה, תת-מחלקה, משבצת עדיפות והנחיה. */
function planoBuildIndex(){
  const idx = [];
  planoData.departments.forEach(function(d){
    idx.push({kind:'dept', dept:d, hay: planoNorm(d.name + ' ' + (d.sourceName||'')), num: String(d.number)});
    (d.alerts||[]).forEach(function(a){
      idx.push({kind:'alert', dept:d, sub:null, alert:a, hay: planoNorm(a.text)});
    });
    (d.subcategories||[]).forEach(function(s){
      if(s.name) idx.push({kind:'sub', dept:d, sub:s, hay: planoNorm(s.name + ' ' + (s.sourceName||'') + ' ' + (s.parent||''))});
      (s.alerts||[]).forEach(function(a){
        idx.push({kind:'alert', dept:d, sub:s, alert:a, hay: planoNorm(a.text)});
      });
      (s.entries||[]).forEach(function(e){
        const itemTexts = (e.items||[]).map(function(i){ return planoNorm(i.name + ' ' + (i.detail||'')); });
        const hasNew = (e.items||[]).some(function(i){ return i.newOrMoved; });
        /* "חדש" / "שינוי מיקום" בחיפוש מחזיר את כל המוצרים המסומנים. */
        const ctx = planoNorm([e.label||'', e.group||'', s.name||'', s.parent||'', d.name, hasNew ? 'חדש שינוי מיקום' : ''].join(' '));
        idx.push({kind:'entry', dept:d, sub:s, entry:e, itemTexts:itemTexts, ctx:ctx, hay: itemTexts.join(' ') + ' ' + ctx});
      });
    });
  });
  planoData.index = idx;
}

/* ============================================================
   חיפוש
============================================================ */
function planoSearch(q){
  const nq = planoNorm(q);
  if(!nq) return [];
  const tokens = nq.split(' ').filter(Boolean);
  const numeric = /^\d+$/.test(nq) ? nq : null;
  const out = [];
  planoData.index.forEach(function(r){
    if(r.kind === 'dept'){
      if(numeric){ if(r.num === numeric) out.push({r:r, score:100}); return; }
      if(tokens.every(function(t){ return r.hay.indexOf(t) !== -1; })) out.push({r:r, score: r.hay === nq ? 95 : 90});
      return;
    }
    if(numeric) return;
    if(!tokens.every(function(t){ return r.hay.indexOf(t) !== -1; })) return;
    let score = 0;
    if(r.kind === 'sub') score = r.hay === nq ? 85 : 80;
    else if(r.kind === 'alert') score = 20;
    else if(r.kind === 'entry'){
      const inItems = tokens.every(function(t){ return r.itemTexts.some(function(it){ return it.indexOf(t) !== -1; }); });
      const exactItem = r.itemTexts.some(function(it){ return it === nq || planoNorm(it.split(' ')[0]) === nq; });
      const inLabel = r.entry.label && planoNorm(r.entry.label).indexOf(nq) !== -1;
      score = exactItem ? 70 : (inItems ? 60 : (inLabel ? 55 : 30));
      if(typeof r.entry.priority === 'number') score -= Math.min(r.entry.priority, 12) * 0.5;
    }
    out.push({r:r, score:score});
  });
  out.sort(function(a,b){ return b.score - a.score; });
  return out.map(function(x){ return x.r; });
}
function planoMark(text, tokens){
  let html = planoEsc(text);
  if(!tokens.length) return html;
  /* סימון פשוט: אם הטקסט המנורמל מכיל אחת המילים — מסמנים את כל הפריט. */
  const n = planoNorm(text);
  return tokens.some(function(t){ return n.indexOf(t) !== -1; }) ? '<mark>' + html + '</mark>' : html;
}

/* ============================================================
   מסך ראשי — נקרא מ-renderContent (navigation.js)
============================================================ */
function viewPlanograms(){
  planoInjectStyleOnce();
  /* שחזור פוקוס בשדה החיפוש אחרי רינדור מחדש שמגיע ממאזין Firestore
     אחר באפליקציה (renderContent מחליף את כל ה-HTML של המסך). */
  const active = document.activeElement;
  if(active && active.id === 'plano-search'){
    planoState.focusSearch = true;
    try { planoState.caret = active.selectionStart; } catch(e){ planoState.caret = null; }
  }
  setTimeout(planoAfterRender, 0);

  if(!planoIsVisibleToCurrentUser()){
    return `
      <div class="plano-wrap">
        <div class="plano-head"><div><h1>פלנוגרמות</h1><p>איך מסדרים את המחלקה</p></div></div>
        <div class="plano-empty">הפלנוגרמות עדיין לא פורסמו לסניפים.</div>
      </div>`;
  }
  planoEnsureLoaded();

  const deptId = (typeof ui !== 'undefined' && ui.planoDept) ? ui.planoDept : null;
  if(deptId && planoData.byId[deptId]) return planoViewDept(planoData.byId[deptId]);
  if(deptId && !planoData.byId[deptId] && planoData.loaded){
    ui.planoDept = null;
  }
  return planoViewList();
}

function planoAfterRender(){
  const input = document.getElementById('plano-search');
  if(input && planoState.focusSearch){
    input.focus();
    const pos = planoState.caret == null ? input.value.length : planoState.caret;
    try { input.setSelectionRange(pos, pos); } catch(e){}
  }
  planoState.focusSearch = false;
  planoState.caret = null;

  if(planoState.highlight){
    const h = planoState.highlight;
    planoState.highlight = null;
    /* השהיה קצרה — goTo מתחיל גלילה לראש העמוד מיד אחרי הרינדור, וההדגשה
       צריכה לגלול לכרטיס אחרי זה ולא להידרס על ידו. */
    setTimeout(function(){
      const el = document.getElementById(h);
      if(!el) return;
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({block:'center', behavior: reduce ? 'auto' : 'smooth'});
      el.classList.add('plano-hl');
      setTimeout(function(){ el.classList.remove('plano-hl'); }, 2000);
    }, 180);
  }
}

function planoHeader(){
  return `
    <div class="plano-head">
      <div><h1>פלנוגרמות</h1><p>איך מסדרים את המחלקה</p></div>
      <button class="plano-help-btn" onclick="planoOpenLegend()" aria-label="איך קוראים פלנוגרמה?">
        <span aria-hidden="true">ⓘ</span><span class="plano-help-txt">איך קוראים פלנוגרמה?</span>
      </button>
    </div>`;
}
function planoSearchBox(compact){
  return `
    <div class="plano-search${compact ? ' compact' : ''}">
      <span class="plano-search-ic">${typeof icon === 'function' ? icon('search') : '⌕'}</span>
      <input id="plano-search" type="text" enterkeyhint="search" autocomplete="off"
        placeholder="חיפוש מוצר, מותג או מחלקה" value="${compact ? '' : planoEsc(planoState.query)}"
        oninput="planoOnSearchInput(this.value, ${compact ? 'true' : 'false'})" aria-label="חיפוש מוצר, מותג או מחלקה">
      ${planoState.query && !compact ? `<button class="plano-search-clear" onclick="planoClearSearch()" aria-label="ניקוי החיפוש">×</button>` : ''}
    </div>`;
}
function planoBanners(){
  let html = '';
  if(!planoPublished && planoIsInternalViewer()){
    html += `<div class="plano-banner staff">המסך גלוי כרגע רק לצוות הרכש ולהנהלת המערכת. הסניפים יראו אותו אחרי לחיצה על "פרסם לסניפים".</div>`;
  }
  if(planoData.error && planoData.departments.length){
    const when = planoData.cacheSavedAt ? new Date(planoData.cacheSavedAt).toLocaleDateString('he-IL') : '';
    html += `<div class="plano-banner offline">אין חיבור כרגע. מוצג המידע השמור במכשיר${when ? ' מ-' + planoEsc(when) : ''}.</div>`;
  }
  return html;
}
function planoAdminBar(){
  if(!planoCanManage()) return '';
  const legend = planoData.legend || {};
  const status = planoPublished
    ? `<b>פורסם לסניפים</b>${legend.publishedAt ? ' ב-' + planoEsc(legend.publishedAt) : ''}`
    : '<b>לא פורסם לסניפים</b> · גלוי לצוות בלבד';
  const imported = legend.importedAt ? `<br>ייבוא אחרון: ${planoEsc(legend.importedAt)}` : '';
  return `
    <div class="plano-admin">
      <div class="plano-admin-status">${status}${imported}</div>
      <input type="file" id="plano-import-input" accept=".json,application/json" style="display:none" onchange="planoImportFileSelected(this.files[0]); this.value='';">
      <button onclick="document.getElementById('plano-import-input').click()">ייבוא JSON</button>
      ${planoData.departments.length ? (planoPublished
        ? `<button onclick="planoConfirmPublish(false)">הסתר מהסניפים</button>`
        : `<button class="primary" onclick="planoConfirmPublish(true)">פרסם לסניפים</button>`) : ''}
    </div>`;
}

function planoViewList(){
  let body;
  if(!planoData.departments.length){
    if(!planoData.loaded || planoData.loading) body = `<div class="plano-empty">טוען…</div>`;
    else if(planoData.error) body = `<div class="plano-empty">לא הצלחתי לטעון את הפלנוגרמות. בדקו את החיבור ונסו שוב.<br><button class="plano-help-btn" style="margin-top:12px" onclick="planoReload()">נסו שוב</button></div>`;
    else body = `<div class="plano-empty">עדיין לא יובאו פלנוגרמות.${planoCanManage() ? '<br>לחצו על "ייבוא JSON" כדי לטעון את הקובץ.' : ''}</div>`;
  } else {
    body = `<div id="plano-body">${planoState.query ? planoResultsHtml() : planoDeptListHtml()}</div>`;
  }
  return `
    <div class="plano-wrap">
      ${planoHeader()}
      ${planoBanners()}
      ${planoAdminBar()}
      ${planoData.departments.length ? planoSearchBox(false) : ''}
      ${body}
    </div>`;
}
function planoDeptListHtml(){
  return `<ul class="plano-dept-list">${planoData.departments.map(function(d){
    return `<li><button class="plano-dept-row" onclick="planoOpenDept('${planoEsc(d.id)}')">
      <span class="plano-dept-name">${planoEsc(d.name)}</span>
      <span class="plano-dept-num">מחלקה ${planoEsc(d.number)}</span>
      <span class="plano-chev" aria-hidden="true">‹</span>
    </button></li>`;
  }).join('')}</ul>`;
}

function planoOnSearchInput(val, fromDept){
  planoState.query = val;
  if(fromDept){
    /* חיפוש מתוך מסך מחלקה — עוברים לרשימת התוצאות, הפוקוס נשמר. */
    planoState.focusSearch = true;
    planoState.caret = val.length;
    planoOpenList();
    return;
  }
  const body = document.getElementById('plano-body');
  if(body) body.innerHTML = val.trim() ? planoResultsHtml() : planoDeptListHtml();
  const wrap = document.querySelector('.plano-search');
  if(wrap){
    const hasClear = !!wrap.querySelector('.plano-search-clear');
    if(val && !hasClear) wrap.insertAdjacentHTML('beforeend', `<button class="plano-search-clear" onclick="planoClearSearch()" aria-label="ניקוי החיפוש">×</button>`);
    if(!val && hasClear) wrap.querySelector('.plano-search-clear').remove();
  }
}
function planoClearSearch(){
  planoState.query = '';
  planoState.focusSearch = true;
  planoRerender();
}

function planoResultsHtml(){
  const q = planoState.query;
  const tokens = planoNorm(q).split(' ').filter(Boolean);
  const all = planoSearch(q);
  if(!all.length){
    return `<div class="plano-empty">לא נמצאו תוצאות עבור "${planoEsc(q.trim())}".<br>נסו שם מותג, מוצר או מחלקה אחרים.</div>`;
  }
  const shown = all.slice(0, PLANO_MAX_RESULTS);
  const countTxt = all.length > PLANO_MAX_RESULTS ? `מוצגות ${PLANO_MAX_RESULTS} מתוך ${all.length} תוצאות` : (all.length === 1 ? 'תוצאה אחת' : `${all.length} תוצאות`);
  return `<div class="plano-res-count">${countTxt}</div>` + shown.map(function(r){ return planoResultHtml(r, tokens); }).join('');
}
function planoResultHtml(r, tokens){
  const d = r.dept;
  const deptLine = `${planoEsc(d.name)} · מחלקה ${planoEsc(d.number)}`;
  if(r.kind === 'dept'){
    return `<button class="plano-res" onclick="planoOpenDept('${planoEsc(d.id)}')">
      <div class="plano-res-where">מחלקה</div>
      <div class="plano-res-main">${planoEsc(d.name)}</div>
      <div class="plano-res-meta"><span class="plano-res-kind">מחלקה ${planoEsc(d.number)}</span></div>
    </button>`;
  }
  if(r.kind === 'sub'){
    return `<button class="plano-res" onclick="planoOpenDept('${planoEsc(d.id)}','${planoEsc(r.sub.id)}')">
      <div class="plano-res-where">${deptLine}</div>
      <div class="plano-res-main">${planoEsc(r.sub.name)}</div>
      <div class="plano-res-meta"><span class="plano-res-kind">תת-קטגוריה</span></div>
    </button>`;
  }
  if(r.kind === 'alert'){
    const subId = r.sub ? r.sub.id : '';
    return `<button class="plano-res" onclick="planoOpenDept('${planoEsc(d.id)}','${planoEsc(subId)}')">
      <div class="plano-res-where">${deptLine}${r.sub && r.sub.name ? ' › ' + planoEsc(r.sub.name) : ''}</div>
      <div class="plano-res-main" style="font-weight:400;font-size:15px;">${r.alert.level === 'critical' ? '⚠️ ' : ''}${planoEsc(r.alert.text)}</div>
      <div class="plano-res-meta"><span class="plano-res-kind">הנחיה</span></div>
    </button>`;
  }
  /* entry */
  const e = r.entry, s = r.sub;
  const items = (e.items||[]);
  const matchedIdx = items.map(function(it, i){ return tokens.some(function(t){ return r.itemTexts[i].indexOf(t) !== -1; }) ? i : -1; }).filter(function(i){ return i !== -1; });
  let showIdx = matchedIdx.length ? matchedIdx : items.map(function(_, i){ return i; });
  if(showIdx.length > 6) showIdx = showIdx.slice(0, 6);
  const hidden = items.length - showIdx.length;
  const itemsHtml = showIdx.map(function(i){
    const it = items[i];
    return planoMark(it.name, tokens) + (it.detail ? ` <span class="plano-it-detail">${planoEsc(it.detail)}</span>` : '') + (it.newOrMoved ? `<span class="plano-new">${planoEsc(planoNewLabel())}</span>` : '');
  }).join('<span class="plano-sep">, </span>');
  const where = deptLine + (s.name ? ' › ' + planoEsc(s.name) : '') + (e.label ? ' › ' + planoEsc(e.label) : '');
  const pri = typeof e.priority === 'number'
    ? `<span class="plano-res-pri${e.priority === 1 ? ' p1' : ''}">עדיפות ${e.priority}${e.priority <= 2 ? ' · ' + planoEsc(planoShortShelf(d, e.priority)) : ''}</span>`
    : `<span class="plano-res-pri">מיקום מיוחד</span>`;
  const warn = e.placementOverride
    ? `<div class="plano-warn"><span aria-hidden="true">⚠️</span><span>${planoEsc(e.placementOverride)}</span></div>`
    : planoFirstCriticalFor(d, s) ? `<div class="plano-warn"><span aria-hidden="true">⚠️</span><span>${planoEsc(planoFirstCriticalFor(d, s))}</span></div>` : '';
  const also = (e.alsoAt||[]).map(function(a){ return planoLocName(a.departmentId, a.subcategoryId); }).filter(Boolean);
  return `<button class="plano-res" onclick="planoOpenDept('${planoEsc(d.id)}','${planoEsc(s.id)}','${planoEsc(e.id)}')">
    <div class="plano-res-where">${where}</div>
    <div class="plano-res-main">${itemsHtml}${hidden > 0 ? `<span class="plano-res-kind"> ועוד ${hidden}</span>` : ''}</div>
    <div class="plano-res-meta">${pri}</div>
    ${warn}
    ${also.length ? `<div class="plano-note">מופיע גם ב: ${also.map(planoEsc).join(', ')}</div>` : ''}
  </button>`;
}
function planoFirstCriticalFor(d, s){
  const subA = (s && s.alerts || []).filter(function(a){ return a.level === 'critical'; });
  if(subA.length) return subA[0].text;
  return null;
}
function planoLocName(deptId, subId){
  const d = planoData.byId[deptId];
  if(!d) return null;
  const s = (d.subcategories||[]).filter(function(x){ return x.id === subId; })[0];
  return d.name + (s && s.name ? ' › ' + s.name : '');
}
function planoNewLabel(){
  return (planoData.legend && planoData.legend.newOrMovedLabel) || PLANO_NEW_LABEL_DEFAULT;
}

/* ============================================================
   מסך מחלקה
============================================================ */
function planoRulesFor(d){
  if(d.shelfRules && d.shelfRules.length) return d.shelfRules;
  return (planoData.legend && planoData.legend.defaultShelfRules) || PLANO_DEFAULT_RULES;
}
function planoShelfText(d, p){
  const rules = planoRulesFor(d);
  const exact = rules.filter(function(r){ return r.priority === p; })[0];
  if(exact) return exact.text;
  const below = rules.filter(function(r){ return r.appliesToAllBelow && r.priority <= p; })[0];
  return below ? below.text : '';
}
function planoShortShelf(d, p){
  return planoShelfText(d, p).replace(/^מדף /, '');
}

function planoViewDept(d){
  const subs = d.subcategories || [];
  let subId = planoState.subByDept[d.id];
  if(!subId || !subs.some(function(s){ return s.id === subId; })) subId = subs.length ? subs[0].id : null;
  planoState.subByDept[d.id] = subId;
  const sub = subs.filter(function(s){ return s.id === subId; })[0];

  const crit = (d.alerts||[]).filter(function(a){ return a.level === 'critical'; });
  const info = (d.alerts||[]).filter(function(a){ return a.level !== 'critical'; });
  const namedSubs = subs.filter(function(s){ return s.name; });

  return `
    <div class="plano-wrap">
      <button class="plano-back" onclick="planoBackToList()"><span aria-hidden="true">›</span> כל המחלקות</button>
      ${planoSearchBox(true)}
      ${planoBanners()}
      <h1 class="plano-dept-title">${planoEsc(d.name)}</h1>
      <div class="plano-dept-meta">
        <span>מחלקה ${planoEsc(d.number)}</span>
        ${d.lastUpdated ? `<span>עודכן לאחרונה: ${planoEsc(d.lastUpdated)}</span>` : ''}
      </div>
      ${planoImagesHtml(d.referenceImages, 'כך המחלקה צריכה להיראות')}
      ${crit.length ? planoAlertBox(crit, 'critical') : ''}
      ${info.length ? planoAlertBox(info, 'info') : ''}
      ${d.shelfRules && d.shelfRules.length ? planoRulesBox(d) : ''}
      ${namedSubs.length > 1 ? `<div class="plano-chips" role="tablist">${subs.map(function(s){
        const on = s.id === subId;
        return `<button class="plano-chip${on ? ' active' : ''}" role="tab" aria-selected="${on}" onclick="planoSelectSub('${planoEsc(d.id)}','${planoEsc(s.id)}')">${planoEsc(s.name || d.name)}</button>`;
      }).join('')}</div>` : ''}
      ${sub ? planoSubHtml(d, sub, namedSubs.length > 1) : `<div class="plano-empty">אין פריטים במחלקה זו.</div>`}
    </div>`;
}
function planoAlertBox(alerts, level){
  const title = level === 'critical'
    ? `<div class="plano-alert-title"><span aria-hidden="true">⚠️</span>חשוב</div>`
    : `<div class="plano-alert-title" style="font-size:14px;color:var(--text-secondary)"><span aria-hidden="true">ⓘ</span>לתשומת לב</div>`;
  return `<div class="plano-alert ${level}">${title}<ul>${alerts.map(function(a){ return `<li>${planoEsc(a.text)}</li>`; }).join('')}</ul></div>`;
}
function planoRulesBox(d){
  return `<div class="plano-rules"><b>סדר המדפים במחלקה הזו שונה מהרגיל:</b>${d.shelfRules.map(function(r){
    return `<div>עדיפות ${r.priority}${r.appliesToAllBelow ? ' ומטה' : ''}: ${planoEsc(r.text)}</div>`;
  }).join('')}</div>`;
}
function planoImagesHtml(images, caption){
  if(!images || !images.length) return '';
  return `<div class="plano-section-title">${planoEsc(caption)}</div><div class="plano-images">${images.map(function(img){
    const url = typeof img === 'string' ? img : img.url;
    const cap = typeof img === 'string' ? '' : (img.caption || '');
    return `<figure><img src="${planoEsc(url)}" alt="${planoEsc(cap || caption)}" loading="lazy">${cap ? `<figcaption>${planoEsc(cap)}</figcaption>` : ''}</figure>`;
  }).join('')}</div>`;
}

function planoSubHtml(d, s, showTitle){
  const isAdmin = planoCanManage();
  const crit = (s.alerts||[]).filter(function(a){ return a.level === 'critical'; });
  const info = (s.alerts||[]).filter(function(a){ return a.level !== 'critical'; });
  const entries = s.entries || [];
  const ranked = entries.filter(function(e){ return typeof e.priority === 'number'; });
  const special = entries.filter(function(e){ return typeof e.priority !== 'number'; });

  /* שם תת-הקטגוריה כבר מסומן ב-chip הפעיל — לא חוזרים עליו ככותרת.
     רק קבוצת-אם (למשל "תחליפי מוצרי חלב") מוצגת, כי היא לא ב-chip. */
  let html = '';
  if(showTitle && s.parent) html += `<div class="plano-sub-parent">חלק מ${planoEsc(s.parent)}</div>`;
  html += planoImagesHtml(s.referenceImages, 'כך זה צריך להיראות');
  if(crit.length) html += planoAlertBox(crit, 'critical');
  if(info.length) html += planoAlertBox(info, 'info');

  /* עדיפויות 1-2 ככרטיסים, 3 ומטה כשורות ברשימה אחת. קבוצה (למשל
     "להכנה מהירה") פותחת כותרת משלה בנקודה שבה היא מתחילה. */
  let restOpen = false;
  let currentGroup = null;
  ranked.forEach(function(e){
    if(e.group && e.group !== currentGroup){
      if(restOpen){ html += '</div>'; restOpen = false; }
      currentGroup = e.group;
      html += `<div class="plano-group">${planoEsc(e.group)}</div>`;
    }
    if(e.priority <= 2){
      if(restOpen){ html += '</div>'; restOpen = false; }
      html += planoCardHtml(d, s, e, isAdmin);
    } else {
      if(!restOpen){ html += '<div class="plano-rest">'; restOpen = true; }
      html += planoRowHtml(d, s, e, isAdmin, false);
    }
  });
  if(restOpen) html += '</div>';

  if(special.length){
    html += `<div class="plano-section-title">מיקום מיוחד</div><div class="plano-rest plano-special">`;
    special.forEach(function(e){ html += planoRowHtml(d, s, e, isAdmin, true); });
    html += '</div>';
  }

  const inc = planoData.incoming[d.id + '/' + s.id] || [];
  if(inc.length){
    html += `<div class="plano-section-title">מוצג גם כאן</div><div class="plano-rest">`;
    inc.forEach(function(x){
      /* מציגים רק את מה שההפניה מתארת (למשל "טפיוקה ניצת"), לא את כל
         המשבצת במחלקה הראשית — שם יש לפעמים מוצרים שלא שייכים לכאן. */
      html += `<div class="plano-rest-row"><span class="plano-num" aria-hidden="true">+</span><div class="plano-rest-body">
        <div class="plano-items">${planoEsc(x.ref.text)}${x.ref.condition ? `<span class="plano-tag">${planoEsc(x.ref.condition)}</span>` : ''}</div>
        <div class="plano-also"><span>מיקום ראשי:</span><button onclick="planoOpenDept('${planoEsc(x.fromDept.id)}','${planoEsc(x.fromSub.id)}','${planoEsc(x.entry.id)}')">${planoEsc(planoLocName(x.fromDept.id, x.fromSub.id))}</button></div>
      </div></div>`;
    });
    html += '</div>';
  }
  if(!entries.length && !inc.length) html += `<div class="plano-empty">אין פריטים בתת-קטגוריה זו.</div>`;
  return html;
}
function planoItemsHtml(items){
  return (items||[]).map(function(it){
    let h = planoEsc(it.name);
    if(it.detail) h += ` <span class="plano-it-detail">${planoEsc(it.detail)}</span>`;
    if(it.facings) h += `<span class="plano-tag">${planoEsc(it.facings)}</span>`;
    if(it.condition) h += `<span class="plano-tag">${planoEsc(it.condition)}</span>`;
    if(it.newOrMoved) h += `<span class="plano-new">${planoEsc(planoNewLabel())}</span>`;
    return h;
  }).join('<span class="plano-sep">, </span>');
}
function planoEntryExtras(d, s, e, isAdmin){
  let h = '';
  if(e.facings) h += `<div class="plano-note">כמות על המדף: ${planoEsc(e.facings)}</div>`;
  if(e.condition) h += `<div class="plano-note">${planoEsc(e.condition)}</div>`;
  if(e.placementOverride) h += `<div class="plano-warn"><span aria-hidden="true">⚠️</span><span>${planoEsc(e.placementOverride)}</span></div>`;
  if(e.note || e.optional){
    const parts = [];
    if(e.note) parts.push(planoEsc(e.note));
    if(e.optional && !(e.note && /חובה/.test(e.note))) parts.push('לא חובה');
    h += `<div class="plano-note">${parts.join(' · ')}</div>`;
  }
  if(e.alsoAt && e.alsoAt.length){
    h += `<div class="plano-also"><span>גם ב:</span>${e.alsoAt.map(function(a){
      const name = planoLocName(a.departmentId, a.subcategoryId);
      if(!name) return '';
      return `<button onclick="planoOpenDept('${planoEsc(a.departmentId)}','${planoEsc(a.subcategoryId)}')">${planoEsc(name)}</button>${a.condition ? `<span class="plano-tag">${planoEsc(a.condition)}</span>` : ''}`;
    }).join('')}</div>`;
  }
  if(isAdmin && e.sourceIssue) h += `<div class="plano-issue">הערת המרה (לצוות בלבד): ${planoEsc(e.sourceIssue)}</div>`;
  return h;
}
function planoCardHtml(d, s, e, isAdmin){
  const cls = e.priority === 1 ? 'plano-p1' : 'plano-p2';
  return `<div class="plano-p ${cls}" id="plano-${planoEsc(d.id)}-${planoEsc(s.id)}-${planoEsc(e.id)}">
    <div class="plano-p-head">
      <span class="plano-p-pill">עדיפות ${e.priority}</span>
      <span class="plano-p-shelf">${planoEsc(planoShortShelf(d, e.priority))}</span>
    </div>
    ${e.label ? `<div class="plano-label">${planoEsc(e.label)}</div>` : ''}
    <div class="plano-items">${planoItemsHtml(e.items)}</div>
    ${planoEntryExtras(d, s, e, isAdmin)}
  </div>`;
}
function planoRowHtml(d, s, e, isAdmin, special){
  const shelf = !special ? planoSpecificShelf(d, e.priority) : '';
  return `<div class="plano-rest-row" id="plano-${planoEsc(d.id)}-${planoEsc(s.id)}-${planoEsc(e.id)}">
    <span class="plano-num">${special ? '!' : planoEsc(e.priority)}</span>
    <div class="plano-rest-body">
      ${shelf ? `<div class="plano-rest-shelf">${planoEsc(shelf)}</div>` : ''}
      ${e.label ? `<div class="plano-label">${planoEsc(e.label)}</div>` : ''}
      <div class="plano-items">${planoItemsHtml(e.items)}</div>
      ${planoEntryExtras(d, s, e, isAdmin)}
    </div>
  </div>`;
}
/* טקסט מדף לעדיפות 3+ — מוצג רק אם המחלקה הגדירה משהו ספציפי לעדיפות
   הזו (למשל "מדפים תחתוניים" בדגנים וקטניות), לא החוק הכללי. */
function planoSpecificShelf(d, p){
  if(!d.shelfRules || !d.shelfRules.length) return '';
  const exact = d.shelfRules.filter(function(r){ return r.priority === p && !r.appliesToAllBelow; })[0];
  return exact ? exact.text : '';
}

/* ============================================================
   ניווט פנימי (history — ראו goTo/popstate ב-navigation.js)
============================================================ */
function planoOpenDept(deptId, subId, entryId){
  if(typeof ui === 'undefined') return;
  /* סוגרים את המקלדת בנייד — אחרת שחזור הפוקוס בחיפוש יפתח אותה שוב במסך המחלקה. */
  if(document.activeElement && document.activeElement.id === 'plano-search') document.activeElement.blur();
  planoState.cameFromList = ui.view === 'planograms' && !ui.planoDept;
  if(subId) planoState.subByDept[deptId] = subId;
  planoState.highlight = entryId ? ('plano-' + deptId + '-' + (subId || '') + '-' + entryId) : null;
  ui.department = 'purchasing';
  ui.planoDept = deptId;
  goTo('planograms', {keepDepartment:true, keepPlanoDept:true});
}
function planoSelectSub(deptId, subId){
  planoState.subByDept[deptId] = subId;
  planoRerender();
}
function planoBackToList(){
  if(planoState.cameFromList && history.state && history.state.nizatHubPlanoDept){
    planoState.cameFromList = false;
    history.back();
    return;
  }
  planoOpenList();
}
function planoOpenList(){
  if(typeof ui === 'undefined') return;
  ui.department = 'purchasing';
  ui.planoDept = null;
  goTo('planograms', {keepDepartment:true, keepPlanoDept:true});
}

/* ============================================================
   מקרא — "איך קוראים פלנוגרמה?"
============================================================ */
function planoOpenLegend(){
  const rules = (planoData.legend && planoData.legend.defaultShelfRules) || PLANO_DEFAULT_RULES;
  const r1 = (rules.filter(function(r){ return r.priority === 1; })[0] || PLANO_DEFAULT_RULES[0]).text;
  const r2 = (rules.filter(function(r){ return r.priority === 2; })[0] || PLANO_DEFAULT_RULES[1]).text;
  document.getElementById('modal-body').innerHTML = `
    <h3>איך קוראים פלנוגרמה?</h3>
    <div class="plano-legend-row"><div class="plano-legend-key"><span class="plano-res-pri p1">עדיפות 1</span></div><div class="plano-legend-text">${planoEsc(r1)}. המקום הכי טוב על המדף.</div></div>
    <div class="plano-legend-row"><div class="plano-legend-key"><span class="plano-res-pri">עדיפות 2</span></div><div class="plano-legend-text">${planoEsc(r2)}.</div></div>
    <div class="plano-legend-row"><div class="plano-legend-key"><span class="plano-num" style="display:inline-flex">3</span></div><div class="plano-legend-text">משם ממשיכים לפי סדר המספרים: 3, 4, 5 וכן הלאה.</div></div>
    <div class="plano-legend-row"><div class="plano-legend-key"><span class="plano-new" style="margin:0">${planoEsc(planoNewLabel())}</span></div><div class="plano-legend-text">מוצר חדש, או מוצר שהמיקום שלו השתנה לאחרונה.</div></div>
    <div class="plano-legend-row"><div class="plano-legend-key"><span aria-hidden="true">⚠️</span> חשוב</div><div class="plano-legend-text">הנחיה שחייבים לשים לב אליה. היא גוברת על סדר העדיפויות.</div></div>
    <div class="plano-legend-row"><div class="plano-legend-key">גם ב:</div><div class="plano-legend-text">המוצר מוצג גם במחלקה נוספת בחנות.</div></div>
    <div class="plano-legend-row"><div class="plano-legend-key">סדר שונה</div><div class="plano-legend-text">בחלק מהמחלקות סדר המדפים שונה. זה מופיע בראש המחלקה וגובר על מה שכתוב כאן.</div></div>
    <div class="modal-actions"><button class="btn-confirm" onclick="closeModal()">הבנתי</button></div>`;
  document.getElementById('modal-overlay').classList.add('open');
}

/* ============================================================
   ניהול — ייבוא JSON ופרסום לסניפים (צוות רכש בלבד)
============================================================ */
let planoPendingImport = null;

function planoValidateSeed(obj){
  const errors = [];
  if(!obj || typeof obj !== 'object') return {ok:false, errors:['הקובץ אינו JSON תקין של פלנוגרמות.']};
  if(!Array.isArray(obj.departments) || !obj.departments.length) errors.push('חסרה רשימת מחלקות (departments).');
  const ids = {};
  const stats = {departments:0, subcategories:0, entries:0, items:0, newOrMoved:0, alsoAt:0};
  (obj.departments||[]).forEach(function(d, i){
    const where = 'מחלקה #' + (i+1) + (d && d.name ? ' (' + d.name + ')' : '');
    if(!d || typeof d !== 'object'){ errors.push(where + ': מבנה לא תקין.'); return; }
    if(!d.id || !/^[A-Za-z0-9_-]+$/.test(d.id)) errors.push(where + ': מזהה (id) חסר או לא תקין.');
    else if(ids[d.id]) errors.push(where + ': מזהה כפול ' + d.id + '.');
    else ids[d.id] = true;
    if(!d.name) errors.push(where + ': חסר שם מחלקה.');
    if(!Array.isArray(d.subcategories) || !d.subcategories.length) errors.push(where + ': אין תתי-קטגוריות.');
    stats.departments++;
    (d.subcategories||[]).forEach(function(s){
      stats.subcategories++;
      if(!s.id) errors.push(where + ': תת-קטגוריה בלי מזהה.');
      (s.entries||[]).forEach(function(e){
        stats.entries++;
        if(!e.id) errors.push(where + ': משבצת עדיפות בלי מזהה.');
        if(!Array.isArray(e.items) || !e.items.length) errors.push(where + ': משבצת עדיפות בלי מוצרים.');
        (e.items||[]).forEach(function(it){ stats.items++; if(it.newOrMoved) stats.newOrMoved++; if(!it.name) errors.push(where + ': מוצר בלי שם.'); });
        stats.alsoAt += (e.alsoAt||[]).length;
      });
    });
  });
  /* הפניות alsoAt חייבות להצביע למחלקה ותת-קטגוריה שקיימות בקובץ. */
  const subsById = {};
  (obj.departments||[]).forEach(function(d){ if(d && d.id) subsById[d.id] = (d.subcategories||[]).map(function(s){ return s.id; }); });
  (obj.departments||[]).forEach(function(d){
    (d && d.subcategories || []).forEach(function(s){
      (s.entries||[]).forEach(function(e){
        (e.alsoAt||[]).forEach(function(a){
          if(!subsById[a.departmentId] || subsById[a.departmentId].indexOf(a.subcategoryId) === -1){
            errors.push((d.name||d.id) + ': הפניית "גם ב" למיקום שלא קיים (' + a.departmentId + '/' + a.subcategoryId + ').');
          }
        });
      });
    });
  });
  if((obj.departments||[]).some(function(d){ return d && JSON.stringify(d).length > 900000; })){
    errors.push('אחת המחלקות גדולה מדי לשמירה.');
  }
  return {ok: !errors.length, errors: errors, stats: stats};
}

function planoImportFileSelected(file){
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(){
    let obj;
    try { obj = JSON.parse(reader.result); }
    catch(e){ toast('הקובץ אינו JSON תקין'); return; }
    const v = planoValidateSeed(obj);
    if(!v.ok){
      document.getElementById('modal-body').innerHTML = `
        <h3>הקובץ לא יובא</h3>
        <p style="font-size:14.5px;color:var(--text-secondary);margin:0 0 10px;">נמצאו בעיות בקובץ. שום דבר לא נשמר.</p>
        <ul style="font-size:14px;line-height:1.6;padding-right:18px;margin:0;max-height:40vh;overflow:auto;">${v.errors.slice(0,30).map(function(e){ return `<li>${planoEsc(e)}</li>`; }).join('')}</ul>
        <div class="modal-actions"><button class="btn-secondary" onclick="closeModal()">סגירה</button></div>`;
      document.getElementById('modal-overlay').classList.add('open');
      return;
    }
    planoPendingImport = obj;
    const st = v.stats;
    const existing = planoData.departments.length;
    document.getElementById('modal-body').innerHTML = `
      <h3>ייבוא פלנוגרמות</h3>
      <div style="font-size:14.5px;line-height:1.7;color:var(--text-primary);">
        ${st.departments} מחלקות, ${st.subcategories} תתי-קטגוריות, ${st.entries} משבצות עדיפות, ${st.items} מוצרים ומותגים.<br>
        ${st.newOrMoved} מסומנים "${planoEsc(planoNewLabel())}", ${st.alsoAt} מוצגים ביותר ממקום אחד.
      </div>
      <p style="font-size:14px;color:var(--text-secondary);margin:12px 0 0;line-height:1.6;">
        ${existing ? `הייבוא יחליף את כל ${existing} המחלקות הקיימות. מחלקה שהתוכן שלה לא השתנה תשמור על תאריך העדכון שלה.` : 'זה הייבוא הראשון.'}
        ${planoPublished ? '<br><b>הפלנוגרמות כבר פורסמו — השינוי יופיע מיד בסניפים.</b>' : ''}
      </p>
      <div class="modal-actions">
        <button class="btn-secondary" onclick="planoPendingImport=null;closeModal()">ביטול</button>
        <button class="btn-confirm" id="plano-import-go" onclick="planoRunImport()">ייבוא</button>
      </div>`;
    document.getElementById('modal-overlay').classList.add('open');
  };
  reader.onerror = function(){ toast('קריאת הקובץ נכשלה'); };
  reader.readAsText(file, 'utf-8');
}

function planoRunImport(){
  const obj = planoPendingImport;
  if(!obj || !firebaseReady || !db){ closeModal(); return; }
  const btn = document.getElementById('plano-import-go');
  if(btn){ btn.disabled = true; btn.textContent = 'מייבא…'; }
  const today = planoToday();
  db.collection('planograms').get().then(function(snap){
    const existing = {};
    snap.forEach(function(doc){ existing[doc.id] = doc.data(); });
    const batch = db.batch();
    const newIds = {};
    let changed = 0, unchanged = 0, added = 0, removed = 0;
    obj.departments.forEach(function(d){
      newIds[d.id] = true;
      const data = JSON.parse(JSON.stringify(d));
      delete data.lastUpdated;
      const prev = existing[d.id];
      let lastUpdated;
      if(prev){
        const prevCmp = Object.assign({}, prev); delete prevCmp.lastUpdated; delete prevCmp.importedAt; delete prevCmp.id;
        const nextCmp = Object.assign({}, data); delete nextCmp.importedAt; delete nextCmp.id;
        if(planoCanonical(prevCmp) === planoCanonical(nextCmp)){ lastUpdated = prev.lastUpdated || d.lastUpdated || today; unchanged++; }
        else { lastUpdated = today; changed++; }
      } else {
        lastUpdated = d.lastUpdated || today; added++;
      }
      data.lastUpdated = lastUpdated;
      data.importedAt = today;
      batch.set(db.collection('planograms').doc(d.id), data);
    });
    Object.keys(existing).forEach(function(id){
      if(!newIds[id]){ batch.delete(db.collection('planograms').doc(id)); removed++; }
    });
    const cfg = obj.config || {};
    batch.set(db.collection('config').doc('planogramLegend'), {
      defaultShelfRules: cfg.defaultShelfRules || PLANO_DEFAULT_RULES,
      newOrMovedLabel: cfg.newOrMovedLabel || PLANO_NEW_LABEL_DEFAULT,
      schemaVersion: obj.schemaVersion || 1,
      source: obj.source || null,
      importedAt: today,
      importedBy: currentUserEmail || null
    }, {merge:true});
    return batch.commit().then(function(){
      planoPendingImport = null;
      closeModal();
      const parts = [];
      if(added) parts.push(added + ' חדשות');
      if(changed) parts.push(changed + ' עודכנו');
      if(unchanged) parts.push(unchanged + ' ללא שינוי');
      if(removed) parts.push(removed + ' הוסרו');
      toast('הייבוא הושלם: ' + parts.join(', '));
      planoReload();
    });
  }).catch(function(err){
    console.error('planograms: ייבוא נכשל', err);
    if(btn){ btn.disabled = false; btn.textContent = 'ייבוא'; }
    toast('הייבוא נכשל: ' + (err && err.message ? err.message : 'שגיאה לא ידועה'));
  });
}

function planoConfirmPublish(publish){
  document.getElementById('modal-body').innerHTML = publish ? `
    <h3>לפרסם את הפלנוגרמות לסניפים?</h3>
    <p style="font-size:14.5px;line-height:1.6;color:var(--text-secondary);margin:0;">כל הסניפים ומנהלי האזור יראו את "פלנוגרמות" תחת רכש. אפשר להסתיר שוב בכל רגע.</p>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">ביטול</button>
      <button class="btn-confirm" onclick="planoSetPublished(true)">פרסם לסניפים</button>
    </div>` : `
    <h3>להסתיר את הפלנוגרמות מהסניפים?</h3>
    <p style="font-size:14.5px;line-height:1.6;color:var(--text-secondary);margin:0;">המסך יישאר גלוי רק לצוות הרכש ולהנהלת המערכת, עד שתפרסמו שוב.</p>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">ביטול</button>
      <button class="btn-confirm btn-danger" onclick="planoSetPublished(false)">הסתר מהסניפים</button>
    </div>`;
  document.getElementById('modal-overlay').classList.add('open');
}
function planoSetPublished(val){
  if(!firebaseReady || !db){ closeModal(); return; }
  const today = planoToday();
  const patch = val
    ? {published:true, publishedAt: today, publishedBy: currentUserEmail || null}
    : {published:false, hiddenAt: today, hiddenBy: currentUserEmail || null};
  db.collection('config').doc('planogramLegend').set(patch, {merge:true}).then(function(){
    closeModal();
    planoData.legend = Object.assign({}, planoData.legend || {}, patch);
    planoWriteCache(planoData.departments, planoData.legend);
    planoApplyPublished(val);
    toast(val ? 'הפלנוגרמות פורסמו לסניפים' : 'הפלנוגרמות הוסתרו מהסניפים');
    planoRerender();
  }).catch(function(err){
    console.error('planograms: עדכון פרסום נכשל', err);
    toast('השמירה נכשלה: ' + (err && err.message ? err.message : 'שגיאה לא ידועה'));
  });
}
