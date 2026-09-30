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
/* מקרא ברירת מחדל — מבוסס על שקופית "הסברים" של הרכש, מותאם למסך.
   הרכש יכול לערוך את השורות ואת שורת התזכורת מתוך האפליקציה (נשמר
   ב-config/planogramLegend: legendRows, legendReminder, legendVersion). */
const PLANO_LEGEND_ROWS_DEFAULT = [
  {style:'plain', key:'מחלקה', text:'כל שורה ברשימת המחלקות היא מחלקה בחנות, עם השם והמספר שלה.'},
  {style:'plain', key:'תת-מחלקה', text:'הלשוניות בראש המחלקה הן תתי-המחלקות. עוברים ביניהן בלחיצה.'},
  {style:'p1', key:'1', text:'המספר הוא סדר העדיפות על המדף. 1 = המקום הכי טוב, בגובה העיניים. אחריו 2, 3 וכן הלאה.'},
  {style:'plain', key:'סדר', text:'הפירוט הוא לפי עדיפויות בלבד: מלמעלה למטה ומימין לשמאל.'},
  {style:'shelf', key:'גונדולה', text:'בראש כל מחלקה מופיעה הגונדולה. המדף הירוק הוא גובה העיניים (עדיפות 1), מתחתיו עדיפות 2, ואחריהם השאר. לחיצה על לוגו פותחת את הפרטים.'},
  {style:'new', key:'', text:'מוצר חדש, או מוצר שהמיקום שלו השתנה לאחרונה. שימו לב במיוחד.'},
  {style:'alert', key:'חשוב', text:'הערה שחייבים לקרוא. היא גוברת על סדר העדיפויות.'},
  {style:'plain', key:'גם ב', text:'מוצרי ניצת ויבוא מוצגים לפעמים גם במחלקות מתאימות נוספות, בנוסף למחלקה הראשית. זה מכוון.'},
  {style:'plain', key:'סדר שונה', text:'בחלק מהמחלקות סדר המדפים שונה מהרגיל. זה מופיע בראש המחלקה וגובר על מה שכתוב כאן.'}
];
const PLANO_LEGEND_REMINDER_DEFAULT = 'המספר = סדר עדיפות על המדף, 1 הכי חשוב (גובה העיניים). מלמעלה למטה, מימין לשמאל.';
const PLANO_LEGEND_SEEN_KEY = 'nizatHubPlanoLegendSeen';
const PLANO_LEGEND_STYLES = {plain:'רגיל', p1:'מספר עדיפות', new:'חדש / שינוי מיקום', alert:'חשוב', shelf:'איור מדף'};
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
  error: null,
  visuals: {},          /* שם בפלנוגרמה -> {logo} (מסמך planograms/_visuals) */
  visualsMeta: null
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
  caret: null,
  fullBySub: {}         /* "deptId/subId" -> true כשהפירוט המילולי המלא פתוח */
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

    .plano-dept-ic{flex:none;width:38px;height:38px;border-radius:10px;background:var(--page);display:inline-flex;align-items:center;justify-content:center;font-size:21px;line-height:1;}

    .plano-reminder{display:flex;gap:10px;align-items:flex-start;width:100%;text-align:right;border:1px solid rgba(69,122,31,0.25);background:rgba(69,122,31,0.07);color:var(--text-primary);border-radius:12px;padding:11px 13px;margin:12px 0 14px;font-size:14px;line-height:1.55;}
    .plano-reminder b{color:var(--blue);font-weight:500;white-space:nowrap;}
    .plano-reminder-ic{flex:none;font-size:17px;line-height:1.3;}

    .pw{margin:4px 0 12px;}
    .pw-head{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:13px;color:var(--text-secondary);margin:0 0 6px;}
    .pw-count{font-size:12px;background:var(--page);border-radius:99px;padding:3px 9px;white-space:nowrap;}
    .pw-unit{border:2px solid var(--gridline);border-radius:12px;overflow:hidden;background:var(--surface-1);}
    .pw-row{padding:9px 8px 10px;border-bottom:4px solid var(--gridline);}
    .pw-row:last-child{border-bottom:none;}
    .pw-row.eye{background:rgba(69,122,31,0.09);}
    .pw-lbl{font-size:12.5px;color:var(--text-secondary);margin-bottom:8px;display:flex;align-items:center;gap:5px;}
    .pw-row.eye .pw-lbl{color:var(--blue);font-weight:500;}
    .pw-tiles{display:flex;flex-wrap:wrap;gap:10px 8px;}
    .pw-tile{position:relative;width:88px;flex:none;display:flex;flex-direction:column;align-items:center;gap:3px;padding:5px 4px 6px;border:1px solid var(--gridline);border-radius:10px;background:#fff;color:#2b2b2b;cursor:pointer;text-align:center;}
    .pw-tile:hover{border-color:var(--blue);}
    .pw-tile.new{border-color:#3b82c4;box-shadow:inset 0 0 0 1.5px #3b82c4;}
    .pw-img{display:flex;align-items:center;justify-content:center;width:74px;height:62px;}
    .pw-img img{max-width:100%;max-height:100%;object-fit:contain;display:block;}
    .pw-fb{display:flex;align-items:center;justify-content:center;width:74px;height:62px;border-radius:8px;font-size:12px;font-weight:500;line-height:1.25;padding:3px;box-sizing:border-box;overflow:hidden;}
    .pw-fb-generic{background:#f1efe8;color:#5f5e5a;font-weight:400;}
    .pw-badge{position:absolute;top:44px;left:3px;width:30px;height:20px;border-radius:5px;background:#fff;border:1px solid #e3e3e3;display:flex;align-items:center;justify-content:center;overflow:hidden;}
    .pw-badge img{max-width:28px;max-height:18px;object-fit:contain;}
    .pw-name{font-size:13px;font-weight:500;line-height:1.25;max-width:80px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;color:#222;margin-top:2px;}
    .pw-tile.fb .pw-name{display:none;}
    .pw-tile.fb .pw-fb{height:70px;}
    .pw-new{font-size:10px;color:#2b6cb0;font-weight:500;line-height:1.2;}
    .pw-p{position:absolute;top:-8px;right:-8px;min-width:22px;height:22px;border-radius:99px;background:#444;color:#fff;font-size:12px;font-weight:500;display:flex;align-items:center;justify-content:center;padding:0 4px;box-sizing:border-box;z-index:1;}
    .pw-row.eye .pw-p{background:var(--blue);}
    .pw-warn{position:absolute;top:-9px;left:-6px;font-size:15px;z-index:1;}
    .pw-foot{display:flex;justify-content:space-between;gap:8px;font-size:12px;color:var(--muted);margin-top:5px;}
    .pw-alerts{display:flex;flex-direction:column;gap:6px;margin:0 0 12px;}
    .pw-alert{display:flex;gap:8px;align-items:flex-start;text-align:right;width:100%;border:1px solid rgba(214,120,30,0.35);background:rgba(214,120,30,0.08);color:var(--text-primary);border-radius:10px;padding:9px 11px;font-size:14px;line-height:1.5;}
    .gd-actions{display:flex;gap:8px;margin:10px 0 12px;flex-wrap:wrap;}
    .gd-pill{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--gridline);background:var(--surface-1);color:var(--text-primary);border-radius:99px;padding:8px 14px;font-size:14.5px;font-weight:500;min-height:40px;}
    .gd-pill.warn{border-color:rgba(214,120,30,0.5);background:rgba(214,120,30,0.1);color:#8a4a0c;}
    .gd{position:relative;margin:6px 0 12px;}
    .gd-count{position:absolute;top:-4px;left:0;font-size:11.5px;background:var(--page);border-radius:99px;padding:2px 8px;z-index:2;}
    .gd-scroll{overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;padding-top:12px;scrollbar-width:thin;}
    .gd-unit{display:inline-block;min-width:100%;box-sizing:border-box;background:linear-gradient(#ecebe6,#e2e0d8);border:6px solid #5f5e5a;border-top-width:0;border-radius:8px 8px 3px 3px;}
    .gd-head{background:#5f5e5a;color:#fff;font-size:13px;font-weight:500;text-align:center;padding:5px 8px 7px;margin:0 -6px;border-radius:6px 6px 0 0;position:sticky;right:0;}
    .gd-shelf{padding:14px 8px 0;min-height:92px;display:flex;align-items:flex-end;box-sizing:border-box;}
    .gd-shelf.eye{background:rgba(151,196,89,0.28);}
    .gd-items{display:flex;gap:8px;align-items:flex-end;flex-wrap:nowrap;}
    .gd-rail{height:16px;background:#f7f5ef;border-top:3px solid #888780;border-bottom:1px solid #b4b2a9;box-shadow:0 2px 3px rgba(0,0,0,0.18);display:flex;align-items:center;gap:5px;padding:0 8px;font-size:11px;color:#3B6D11;font-weight:500;white-space:nowrap;position:relative;z-index:1;}
    .gd-base{height:14px;background:#5f5e5a;margin:0 -6px -6px;}
    .gd .pw-tile{width:86px;border-radius:6px 6px 2px 2px;box-shadow:0 1px 2px rgba(0,0,0,0.2);border-color:#dcdad2;}
    .gd .gd-shelf.eye .pw-tile{width:96px;}
    .gd .gd-shelf.eye .pw-img{height:66px;}
    .gd-more{display:none;font-size:12px;color:var(--text-secondary);text-align:left;margin-top:4px;}
    .gd.has-more .gd-more{display:block;}
    .gd.has-more.at-end .gd-more{visibility:hidden;}
    .gd.has-more .gd-scroll{-webkit-mask-image:linear-gradient(to left, transparent 0, #000 36px);mask-image:linear-gradient(to left, transparent 0, #000 36px);}
    .gd.has-more.at-end .gd-scroll{-webkit-mask-image:none;mask-image:none;}
    .gd-x{position:sticky;top:0;float:left;margin:-8px -10px 0 0;width:40px;height:40px;border:none;background:var(--page);border-radius:99px;font-size:24px;line-height:1;color:var(--text-secondary);z-index:2;}
    .gd-alerts{display:flex;flex-direction:column;gap:8px;clear:both;}
    .gd-alert{display:flex;gap:8px;align-items:flex-start;border:1px solid var(--gridline);border-radius:10px;padding:10px 12px;font-size:15px;line-height:1.55;}
    .gd-alert.crit{border-color:rgba(214,120,30,0.35);background:rgba(214,120,30,0.08);}
    .gd-alert[role="button"]{cursor:pointer;}
    .pw-toggle{display:block;width:100%;border:1px dashed var(--gridline);background:none;border-radius:10px;padding:11px;font-size:14.5px;font-weight:500;color:var(--blue);margin:2px 0 14px;}
    .pw-toggle-sub{display:block;font-size:12px;font-weight:400;color:var(--text-secondary);margin-top:2px;}
    .pw-modal-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:10px;}
    .pw-modal-shelf{font-size:13.5px;color:var(--text-secondary);}
    .pw-modal-pics{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;}
    .pw-modal-pics img{width:110px;height:70px;padding:6px;box-sizing:border-box;object-fit:contain;background:#fff;border:1px solid var(--gridline);border-radius:10px;}
    html[data-theme="dark"] .pw-tile{background:#f7f7f5;}

    .plano-legend-chip{display:inline-flex;align-items:center;justify-content:center;min-width:28px;padding:3px 9px;border-radius:99px;background:var(--page);font-size:13px;font-weight:500;color:var(--text-primary);}
    .plano-legend-chip.p1{background:var(--blue);color:#fff;}
    .plano-legend-chip.alert{background:rgba(214,120,30,0.14);color:#a4560f;}
    .plano-legend-chip.shelf{background:rgba(69,122,31,0.1);color:var(--blue);}
    .plano-leg-edit-row{border:1px solid var(--gridline);border-radius:10px;padding:10px;margin-bottom:10px;}
    .plano-leg-edit-row .plano-leg-top{display:flex;gap:8px;margin-bottom:8px;}
    .plano-leg-edit-row select, .plano-leg-edit-row input, .plano-leg-edit-row textarea, .plano-leg-reminder-in{border:1px solid var(--gridline);border-radius:8px;padding:8px 10px;font-size:14.5px;background:var(--surface-1);color:var(--text-primary);font-family:inherit;}
    .plano-leg-edit-row textarea, .plano-leg-reminder-in{width:100%;min-height:56px;resize:vertical;box-sizing:border-box;}
    .plano-leg-edit-row input{flex:1;min-width:0;}
    .plano-leg-del{flex:none;border:1px solid var(--gridline);background:none;border-radius:8px;padding:0 10px;color:#a33;}
    .plano-leg-scroll{margin:8px 0;}
    .plano-leg-edit-row select{flex:0 0 40%;min-width:0;}

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
    localStorage.setItem(PLANO_CACHE_KEY, JSON.stringify({departments: departments, legend: legend, visuals: planoData.visuals || {}, visualsMeta: planoData.visualsMeta || null, savedAt: Date.now()}));
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
      planoData.visuals = cached.visuals || {};
      planoData.visualsMeta = cached.visualsMeta || null;
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
    let visualsDoc = null;
    res[0].forEach(function(doc){
      /* מסמכים שמתחילים ב-"_" אינם מחלקות (למשל _visuals - תמונות האריחים). */
      if(doc.id.charAt(0) === '_'){ if(doc.id === '_visuals') visualsDoc = doc.data(); return; }
      departments.push(Object.assign({}, doc.data(), {id: doc.id}));
    });
    planoData.visuals = (visualsDoc && visualsDoc.items) || {};
    planoData.visualsMeta = visualsDoc ? {importedAt: visualsDoc.importedAt || null, count: Object.keys(visualsDoc.items || {}).length} : null;
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
  planoMaybeAutoOpenLegend();
  planoMarkGondolaOverflow();
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
  const imported = (legend.importedAt ? `<br>ייבוא אחרון: ${planoEsc(legend.importedAt)}` : '')
    + (planoData.visualsMeta ? `<br>תמונות מותגים: ${planoEsc(planoData.visualsMeta.count)} שמות${planoData.visualsMeta.importedAt ? ' (' + planoEsc(planoData.visualsMeta.importedAt) + ')' : ''}` : '<br>תמונות מותגים: עדיין לא יובאו');
  return `
    <div class="plano-admin">
      <div class="plano-admin-status">${status}${imported}</div>
      <input type="file" id="plano-import-input" accept=".json,application/json" style="display:none" onchange="planoImportFileSelected(this.files[0]); this.value='';">
      <button onclick="document.getElementById('plano-import-input').click()">ייבוא JSON</button>
      <input type="file" id="plano-visuals-input" accept=".json,application/json" style="display:none" onchange="planoVisualsFileSelected(this.files[0]); this.value='';">
      <button onclick="document.getElementById('plano-visuals-input').click()">ייבוא תמונות מותגים</button>
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
/* אייקון לכל מחלקה לפי מילות מפתח בשם. הסדר חשוב: ביטוי ספציפי קודם
   (למשל "תחליפי חלב" לפני "חלב"). אם שדה icon קיים במחלקה (מה-JSON) - הוא גובר. */
const PLANO_DEPT_ICONS = [
  ['תחליפי חלב','🥛'],['תחליפי בשר','🌱'],['טבעוני','🌱'],['ללא גלוטן','🌾'],
  ['שימור','🥫'],['קטני','🫘'],['דגני בוקר','🥣'],['דגנ','🌾'],['אורז','🍚'],['פסט','🍝'],
  ['קמח','🥖'],['אפי','🧁'],['לחם','🍞'],['מאפ','🥐'],
  ['תבלינ','🌶️'],['שמן','🫒'],['רטב','🥫'],['ממרח','🍯'],['דבש','🍯'],['ממתיק','🍯'],['סוכר','🍯'],
  ['שוקולד','🍫'],['ממתק','🍬'],['חטיפ','🍪'],['עוגי','🍪'],
  ['אגוז','🥜'],['פירות יבשים','🥜'],['פיצוח','🥜'],['תמר','🌴'],
  ['תה','🍵'],['קפה','☕'],['משק','🧃'],['מיצ','🧃'],['מים','💧'],
  ['גבינ','🧀'],['חלב','🥛'],['מקרר','🧀'],['ביצ','🥚'],['קפוא','🧊'],['הקפאה','🧊'],
  ['בשר','🍗'],['עוף','🍗'],['דג','🐟'],['ירק','🥬'],['פירות','🍎'],
  ['תינוק','👶'],['ילד','🧸'],['ניקוי','🧽'],['ניקיון','🧽'],['כביסה','🧺'],['חד פעמי','🧻'],['נייר','🧻'],
  ['טיפוח','🧴'],['קוסמטיק','💄'],['שיער','🧴'],['היגיינ','🪥'],['שיניים','🪥'],
  ['ויטמינ','💊'],['תוספ','💊'],['טבע','🌿'],['צמחי','🌿'],['סופר פוד','🌿'],['חלבון','💪'],['ספורט','💪'],
  ['בעלי חיים','🐾'],['חיות','🐾'],['מרקחת','💊'],['קופה','🛍️']
];
function planoDeptEmoji(d){
  if(d.icon) return d.icon;
  const n = String(d.name||'');
  for(let i=0;i<PLANO_DEPT_ICONS.length;i++){
    if(n.indexOf(PLANO_DEPT_ICONS[i][0]) >= 0) return PLANO_DEPT_ICONS[i][1];
  }
  return '🛒';
}
function planoDeptListHtml(){
  return `<ul class="plano-dept-list">${planoData.departments.map(function(d){
    return `<li><button class="plano-dept-row" onclick="planoOpenDept('${planoEsc(d.id)}')">
      <span class="plano-dept-ic" aria-hidden="true">${planoDeptEmoji(d)}</span>
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
        ${d.lastUpdated ? `<span>עודכן: ${planoEsc(d.lastUpdated)}</span>` : ''}
      </div>
      ${planoDeptActionsHtml(d, sub)}
      ${planoImagesHtml(d.referenceImages, 'כך המחלקה צריכה להיראות')}
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

  if(ranked.length) html += planoGondolaHtml(d, s, ranked, isAdmin);

  const fullKey = d.id + '/' + s.id;
  const fullOpen = !ranked.length || !!planoState.fullBySub[fullKey];
  const incCount = (planoData.incoming[fullKey] || []).length;
  if(ranked.length){
    html += `<button class="pw-toggle" aria-expanded="${fullOpen}" onclick="planoToggleFull('${planoEsc(d.id)}','${planoEsc(s.id)}')">
      ${fullOpen ? 'הסתרת הפירוט המלא ▴' : 'הצג פירוט מלא ▾'}
      ${!fullOpen && (special.length || incCount) ? `<span class="pw-toggle-sub">כולל ${[special.length ? special.length + ' במיקום מיוחד' : '', incCount ? incCount + ' ממחלקות אחרות' : ''].filter(Boolean).join(' ו-')}</span>` : ''}
    </button>`;
  }
  if(!fullOpen) return html;
  if(ranked.length){
    if(crit.length) html += planoAlertBox(crit, 'critical');
    if(info.length) html += planoAlertBox(info, 'info');
  } else {
    if(crit.length) html += planoAlertBox(crit, 'critical');
    if(info.length) html += planoAlertBox(info, 'info');
  }

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
  const ov = document.getElementById('modal-overlay');
  if(ov && ov.classList.contains('open') && typeof closeModal === 'function') closeModal();
  /* קפיצה לפריט מסוים (מחיפוש / "מיקום ראשי") - פותחים את הפירוט המלא כדי שהכרטיס יהיה במסך */
  if(entryId && subId) planoState.fullBySub[deptId + '/' + subId] = true;
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
/* ---------- קיר המדפים (ויזואלי) ----------
   כל שורה = מדף: עדיפות 1 = גובה העיניים (מודגש), עדיפות 2 = המדף הצמוד,
   3 ומטה = שאר המדפים. הכיתוב של כל מדף מגיע מכללי המחלקה (planoShelfText).
   כל מוצר/מותג הוא אריח: תמונת מוצר + לוגו קטן, או רק לוגו, או אריח צבעוני
   עם השם כשאין תמונה. התמונות מגיעות ממסמך planograms/_visuals (נטען דרך
   "ייבוא תמונות מותגים") ומוצגות ישירות מאתר ניצת. לחיצה על אריח פותחת את
   הפרטים המלאים של אותה משבצת (הערות, כמות, "גם ב"). */
const PLANO_TILE_COLORS = [
  ['#FAEEDA','#854F0B'],['#EEEDFE','#534AB7'],['#E1F5EE','#0F6E56'],['#FBEAF0','#993556'],
  ['#E6F1FB','#185FA5'],['#EAF3DE','#3B6D11'],['#FAECE7','#993C1D'],['#F1EFE8','#5F5E5A']
];
const PLANO_GENERIC_RE = /השאר|אחרים|שונות/;
/* אריחים מציגים לוגו בלבד (החלטה: תמונת מוצר אחת לא מייצגת נכון מותג שיש
   לו הרבה מוצרים). אין לוגו -> אריח צבעוני עם השם. */
function planoVisualFor(name){
  const v = planoData.visuals && planoData.visuals[name];
  return v && v.logo ? {img: v.logo, logo: null} : null;
}
function planoTileColor(name){
  let h = 0; const t = String(name||'');
  for(let i=0;i<t.length;i++){ h = (h*31 + t.charCodeAt(i)) >>> 0; }
  return PLANO_TILE_COLORS[h % PLANO_TILE_COLORS.length];
}
function planoFallbackHtml(name){
  if(PLANO_GENERIC_RE.test(String(name||''))) return `<span class="pw-fb pw-fb-generic">${planoEsc(name)}</span>`;
  const c = planoTileColor(name);
  return `<span class="pw-fb" style="background:${c[0]};color:${c[1]}">${planoEsc(name)}</span>`;
}
/* תמונה שלא נטענה: קודם מנסים את הלוגו, ואם גם הוא נכשל - אריח צבעוני. */
function planoImgFail(img){
  const logo = img.getAttribute('data-logo');
  const box = img.parentNode;
  if(logo && img.getAttribute('src') !== logo){
    img.setAttribute('src', logo);
    img.removeAttribute('data-logo');
    const badge = box && box.parentNode ? box.parentNode.querySelector('.pw-badge') : null;
    if(badge) badge.remove();
    return;
  }
  if(box){
    const tile = box.parentNode;
    if(tile && tile.classList) tile.classList.add('fb');
    box.outerHTML = planoFallbackHtml(img.getAttribute('data-name') || '');
  }
}
function planoTileHtml(d, s, e, it){
  const vis = planoVisualFor(it.name);
  const isNew = !!it.newOrMoved;
  const warn = !!e.placementOverride;
  const media = vis
    ? `<span class="pw-img"><img src="${planoEsc(vis.img)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-name="${planoEsc(it.name)}" ${vis.logo ? `data-logo="${planoEsc(vis.logo)}"` : ''} onerror="planoImgFail(this)"></span>`
    : planoFallbackHtml(it.name);
  const badge = vis && vis.logo ? `<span class="pw-badge"><img src="${planoEsc(vis.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.remove()"></span>` : '';
  const label = it.name + (isNew ? ' - ' + planoNewLabel() : '') + (warn ? ' - יש הנחיה חשובה' : '') + ', עדיפות ' + e.priority;
  return `<button class="pw-tile${isNew ? ' new' : ''}${vis ? '' : ' fb'}" onclick="planoOpenTile('${planoEsc(d.id)}','${planoEsc(s.id)}','${planoEsc(e.id)}')" aria-label="${planoEsc(label)}">
    <span class="pw-p" aria-hidden="true">${planoEsc(e.priority)}</span>
    ${warn ? '<span class="pw-warn" aria-hidden="true">⚠️</span>' : ''}
    ${media}${badge}
    <span class="pw-name">${planoEsc(it.name)}</span>
  </button>`;
}
/* ---------- גונדולה: הדמיית מדף סופר ----------
   עד 5 מדפים, לפי תעדוף (החלטת אלירן):
     מדף 2 (גובה העיניים)      = עדיפות 1
     מדף 3 (מתחת לגובה העיניים) = עדיפות 2
     מדפים 4 -> 5 -> 1 (עליון)  = עדיפות 3 ומטה, לפי הסדר
   מדף 3+ מתמלא עד רוחב המדפים של עדיפות 1-2 (לפחות 4 מותגים) ואז עוברים
   לבא, כדי שהגונדולה תישאר מאוזנת. מוצגים רק מדפים שיש עליהם משהו.
   כשהמותגים לא נכנסים ברוחב - כל הגונדולה נגללת הצידה ביחד (המדפים לא
   זזים זה מול זה), והגלילה מתחילה מימין = מהעדיפות הגבוהה. */
function planoGondolaHtml(d, s, ranked, isAdmin){
  const flat = function(list){
    const out = [];
    list.forEach(function(e){ (e.items||[]).forEach(function(it){ out.push({e:e, it:it}); }); });
    return out;
  };
  const p1 = flat(ranked.filter(function(e){ return e.priority === 1; }));
  const p2 = flat(ranked.filter(function(e){ return e.priority === 2; }));
  const rest = flat(ranked.filter(function(e){ return e.priority >= 3; }));
  const cap = Math.max(4, p1.length, p2.length);
  const s4 = rest.slice(0, cap), s5 = rest.slice(cap, cap*2), s1 = rest.slice(cap*2);
  const custom = d.shelfRules && d.shelfRules.length;
  const shelves = [
    {key:'top', list:s1, rail:''},
    {key:'eye', list:p1, rail: custom ? planoShelfText(d,1) : 'גובה העיניים', eye:true},
    {key:'p2', list:p2, rail: custom ? planoShelfText(d,2) : ''},
    {key:'s4', list:s4, rail:''},
    {key:'s5', list:s5, rail:''}
  ].filter(function(x){ return x.list.length; });
  if(!shelves.length) return '';
  let total = 0, withLogo = 0;
  const body = shelves.map(function(sh){
    const tiles = sh.list.map(function(x){
      total++;
      if(planoVisualFor(x.it.name)) withLogo++;
      return planoTileHtml(d, s, x.e, x.it);
    }).join('');
    return `<div class="gd-shelf${sh.eye ? ' eye' : ''}"><div class="gd-items">${tiles}</div></div>
      <div class="gd-rail">${sh.eye ? '<span aria-hidden="true">👁</span>' : ''}${sh.rail ? `<span>${planoEsc(sh.rail)}</span>` : ''}</div>`;
  }).join('');
  const title = s.name || d.name;
  return `<div class="gd">
    ${isAdmin ? `<div class="gd-count" title="לצוות הרכש בלבד">🖼 ${withLogo}/${total}</div>` : ''}
    <div class="gd-scroll" tabindex="0" aria-label="${planoEsc('גונדולה: ' + title)}">
      <div class="gd-unit">
        <div class="gd-head">${planoEsc(title)}</div>
        ${body}
        <div class="gd-base"></div>
      </div>
    </div>
    <div class="gd-more" aria-hidden="true">החליקו לעוד מותגים ←</div>
  </div>`;
}
/* סימון גונדולה שיש בה עוד מותגים מעבר לרוחב המסך (אחרי רינדור). */
function planoMarkGondolaOverflow(){
  document.querySelectorAll('.gd').forEach(function(g){
    const sc = g.querySelector('.gd-scroll');
    if(!sc) return;
    const more = sc.scrollWidth > sc.clientWidth + 4;
    g.classList.toggle('has-more', more);
    if(more && !sc._planoBound){
      sc._planoBound = true;
      sc.addEventListener('scroll', function(){
        const atEnd = Math.abs(sc.scrollLeft) + sc.clientWidth >= sc.scrollWidth - 6;
        g.classList.toggle('at-end', atEnd);
      }, {passive:true});
    }
  });
}

/* ---------- הנחיות: כפתור אחד שפותח חלון (במקום מלל על המסך) ---------- */
function planoCollectAlerts(d, s){
  const out = [];
  (d.alerts||[]).forEach(function(a){ out.push({level:a.level, text:a.text}); });
  if(d.shelfRules && d.shelfRules.length){
    out.push({level:'info', text:'סדר המדפים במחלקה הזו שונה מהרגיל: ' + d.shelfRules.map(function(r){ return 'עדיפות ' + r.priority + (r.appliesToAllBelow ? ' ומטה' : '') + ' - ' + r.text; }).join(' · ')});
  }
  if(s){
    (s.alerts||[]).forEach(function(a){ out.push({level:a.level, text:a.text}); });
    (s.entries||[]).forEach(function(e){
      if(e.placementOverride) out.push({level:'critical', text:e.placementOverride, who:(e.label || (e.items||[]).map(function(it){ return it.name; }).join(', ')), entry:e.id});
    });
  }
  return out;
}
function planoDeptActionsHtml(d, s){
  const alerts = planoCollectAlerts(d, s);
  const crit = alerts.filter(function(a){ return a.level === 'critical'; }).length;
  return `<div class="gd-actions">
    ${alerts.length ? `<button class="gd-pill${crit ? ' warn' : ''}" onclick="planoOpenAlerts('${planoEsc(d.id)}','${planoEsc(s ? s.id : '')}')"><span aria-hidden="true">${crit ? '⚠️' : 'ⓘ'}</span> הנחיות (${alerts.length})</button>` : ''}
    <button class="gd-pill" onclick="planoOpenLegend()"><span aria-hidden="true">📖</span> מקרא</button>
  </div>`;
}
function planoModalX(){
  return `<button class="gd-x" onclick="closeModal()" aria-label="סגירה">×</button>`;
}
function planoOpenAlerts(deptId, subId){
  const d = planoData.byId[deptId]; if(!d) return;
  const s = (d.subcategories||[]).filter(function(x){ return x.id === subId; })[0] || null;
  const alerts = planoCollectAlerts(d, s);
  alerts.sort(function(a,b){ return (a.level === 'critical' ? 0 : 1) - (b.level === 'critical' ? 0 : 1); });
  document.getElementById('modal-body').innerHTML = `
    ${planoModalX()}
    <h3>הנחיות${s && s.name ? ' · ' + planoEsc(s.name) : ''}</h3>
    <div class="gd-alerts">${alerts.map(function(a){
      const open = a.entry ? ` onclick="planoOpenTile('${planoEsc(d.id)}','${planoEsc(s.id)}','${planoEsc(a.entry)}')" role="button" tabindex="0"` : '';
      return `<div class="gd-alert ${a.level === 'critical' ? 'crit' : ''}"${open}>
        <span aria-hidden="true">${a.level === 'critical' ? '⚠️' : 'ⓘ'}</span>
        <span>${a.who ? `<b>${planoEsc(a.who)}:</b> ` : ''}${planoEsc(a.text)}</span>
      </div>`;
    }).join('')}</div>`;
  document.getElementById('modal-overlay').classList.add('open');
}
function planoToggleFull(deptId, subId){
  const k = deptId + '/' + subId;
  planoState.fullBySub[k] = !planoState.fullBySub[k];
  planoRerender();
}
/* חלונית פרטים לאריח: כל המשבצת (כל המוצרים באותה עדיפות), הערות, "גם ב". */
function planoOpenTile(deptId, subId, entryId){
  const d = planoData.byId[deptId]; if(!d) return;
  const s = (d.subcategories||[]).filter(function(x){ return x.id === subId; })[0]; if(!s) return;
  const e = (s.entries||[]).filter(function(x){ return x.id === entryId; })[0]; if(!e) return;
  const shelf = typeof e.priority === 'number' ? planoShelfText(d, e.priority) : '';
  const seenLogo = {};
  const pics = (e.items||[]).map(function(it){
    const v = planoVisualFor(it.name);
    if(v && seenLogo[v.img]) return '';
    if(v) seenLogo[v.img] = true;
    return v ? `<img src="${planoEsc(v.img)}" alt="${planoEsc(it.name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : '';
  }).join('');
  document.getElementById('modal-body').innerHTML = `
    ${planoModalX()}
    <div class="pw-modal-head">
      <span class="plano-p-pill">${typeof e.priority === 'number' ? 'עדיפות ' + planoEsc(e.priority) : 'מיקום מיוחד'}</span>
      ${shelf ? `<span class="pw-modal-shelf">${planoEsc(shelf)}</span>` : ''}
    </div>
    ${pics ? `<div class="pw-modal-pics">${pics}</div>` : ''}
    ${e.label ? `<div class="plano-label">${planoEsc(e.label)}</div>` : ''}
    <div class="plano-items" style="font-size:17px;">${planoItemsHtml(e.items)}</div>
    ${planoEntryExtras(d, s, e, planoCanManage())}
    <div style="font-size:12.5px;color:var(--muted);margin-top:10px;">${planoEsc(d.name)}${s.name ? ' · ' + planoEsc(s.name) : ''}</div>`;
  document.getElementById('modal-overlay').classList.add('open');
}

/* ---------- ייבוא תמונות מותגים (רכש) ----------
   קובץ planogram_visuals.json: {kind:"nizat-planogram-visuals", items:{"שם בפלנוגרמה":{logo}}}
   נשמר במסמך planograms/_visuals (אותן הרשאות כמו הפלנוגרמות, בלי שינוי בחוקים). */
function planoVisualsFileSelected(file){
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(ev){
    let obj = null;
    try { obj = JSON.parse(String(ev.target.result).replace(/^\uFEFF/, '')); } catch(e){ obj = null; }
    if(!obj || obj.kind !== 'nizat-planogram-visuals' || !obj.items || typeof obj.items !== 'object'){
      toast('זה לא קובץ תמונות מותגים תקין (planogram_visuals.json)'); return;
    }
    /* לוגו = קישור https (מאתר ניצת) או לוגו שהועלה ידנית ונשמר בתוך הקובץ (data:image) */
    const okUrl = function(u){
      if(typeof u !== 'string') return null;
      if(/^https:\/\//.test(u)) return u;
      if(/^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+\/=]+$/.test(u) && u.length < 200000) return u;
      return null;
    };
    const items = {};
    Object.keys(obj.items).forEach(function(k){
      const logo = okUrl((obj.items[k] || {}).logo);
      if(k && logo) items[k] = {logo: logo};
    });
    let total = 0, covered = 0;
    planoData.departments.forEach(function(d){ (d.subcategories||[]).forEach(function(s){ (s.entries||[]).forEach(function(e){
      if(typeof e.priority !== 'number') return;
      (e.items||[]).forEach(function(it){ total++; if(items[it.name]) covered++; });
    }); }); });
    document.getElementById('modal-body').innerHTML = `
      <h3>ייבוא תמונות מותגים</h3>
      <p style="font-size:14.5px;line-height:1.6;">מתוך ${total} אריחים בפלנוגרמות:<br>
      <b>${covered}</b> יקבלו לוגו, ו-${total - covered} יוצגו כאריח צבעוני עם השם.</p>
      <p style="font-size:13px;color:var(--text-secondary);">הייבוא מחליף את כל התמונות הקיימות ומתעדכן לכל הסניפים.</p>
      <div class="modal-actions">
        <button class="btn-secondary" onclick="closeModal()">ביטול</button>
        <button class="btn-confirm" id="plano-vis-go" onclick="planoRunVisualsImport()">ייבוא</button>
      </div>`;
    document.getElementById('modal-overlay').classList.add('open');
    planoPendingVisuals = {items: items, generatedAt: obj.generatedAt || null};
  };
  reader.readAsText(file, 'utf-8');
}
let planoPendingVisuals = null;
function planoRunVisualsImport(){
  const p = planoPendingVisuals;
  if(!p || !firebaseReady || !db){ closeModal(); return; }
  const btn = document.getElementById('plano-vis-go');
  if(btn){ btn.disabled = true; btn.textContent = 'מייבא…'; }
  const doc = {items: p.items, version: 3, generatedAt: p.generatedAt, importedAt: planoToday(), importedBy: currentUserEmail || null};
  db.collection('planograms').doc('_visuals').set(doc).then(function(){
    planoData.visuals = p.items;
    planoData.visualsMeta = {importedAt: doc.importedAt, count: Object.keys(p.items).length};
    planoWriteCache(planoData.departments, planoData.legend);
    planoPendingVisuals = null;
    closeModal();
    toast('התמונות יובאו: ' + Object.keys(p.items).length + ' שמות');
    planoRerender();
  }).catch(function(err){
    console.error('planograms: ייבוא תמונות נכשל', err);
    if(btn){ btn.disabled = false; btn.textContent = 'ייבוא'; }
    toast('הייבוא נכשל: ' + (err && err.message ? err.message : 'שגיאה לא ידועה'));
  });
}

/* ---------- מקרא: נתונים ---------- */
function planoLegendRows(){
  const rows = planoData.legend && planoData.legend.legendRows;
  return (rows && rows.length) ? rows : PLANO_LEGEND_ROWS_DEFAULT;
}
function planoLegendReminder(){
  return (planoData.legend && planoData.legend.legendReminder) || PLANO_LEGEND_REMINDER_DEFAULT;
}
function planoLegendVersion(){
  return (planoData.legend && planoData.legend.legendVersion) || 1;
}
function planoLegendKeyHtml(r){
  const key = r.style === 'new' ? (r.key || planoNewLabel()) : (r.key || '');
  if(r.style === 'new') return `<span class="plano-new" style="margin:0">${planoEsc(key)}</span>`;
  if(r.style === 'alert') return `<span class="plano-legend-chip alert"><span aria-hidden="true">⚠️</span>&nbsp;${planoEsc(key)}</span>`;
  return `<span class="plano-legend-chip ${r.style === 'p1' ? 'p1' : (r.style === 'shelf' ? 'shelf' : '')}">${planoEsc(key)}</span>`;
}

/* ---------- מקרא: נפתח לבד בכניסה הראשונה ואחרי כל עדכון של הרכש ---------- */
function planoMaybeAutoOpenLegend(){
  if(planoState.legendAutoChecked) return;
  if(!planoData.loaded || !planoData.departments.length) return;
  if(!planoIsVisibleToCurrentUser()) return;
  planoState.legendAutoChecked = true;
  let seen = 0;
  try { seen = parseInt(localStorage.getItem(PLANO_LEGEND_SEEN_KEY) || '0', 10) || 0; } catch(e){}
  if(seen >= planoLegendVersion()) return;
  const overlay = document.getElementById('modal-overlay');
  if(overlay && overlay.classList.contains('open')) return;
  planoOpenLegend(true);
}
function planoMarkLegendSeen(){
  try { localStorage.setItem(PLANO_LEGEND_SEEN_KEY, String(planoLegendVersion())); } catch(e){}
}

function planoOpenLegend(isAuto){
  planoMarkLegendSeen();
  const rows = planoLegendRows();
  const updated = planoData.legend && planoData.legend.legendUpdatedAt;
  document.getElementById('modal-body').innerHTML = `
    <h3>איך קוראים פלנוגרמה?</h3>
    ${isAuto ? `<p style="font-size:13.5px;color:var(--text-secondary);margin:0 0 6px;">${planoLegendVersion() > 1 ? 'המקרא עודכן. ' : ''}אפשר לחזור לכאן בכל רגע דרך הכפתור "איך קוראים פלנוגרמה?".</p>` : ''}
    ${rows.map(function(r){
      return `<div class="plano-legend-row"><div class="plano-legend-key">${planoLegendKeyHtml(r)}</div><div class="plano-legend-text">${planoEsc(r.text)}</div></div>`;
    }).join('')}
    ${updated ? `<div style="font-size:12px;color:var(--muted);margin-top:6px;">עודכן: ${planoEsc(updated)}</div>` : ''}
    <div class="modal-actions">
      ${planoCanManage() ? `<button class="btn-secondary" onclick="planoOpenLegendEditor()">✏️ עריכת מקרא</button>` : ''}
      <button class="btn-confirm" onclick="closeModal()">הבנתי</button>
    </div>`;
  document.getElementById('modal-overlay').classList.add('open');
}

/* ---------- מקרא: עריכה (רכש והנהלת המערכת בלבד) ---------- */
let planoLegendDraft = null;
function planoOpenLegendEditor(){
  if(!planoCanManage()) return;
  planoLegendDraft = {
    reminder: planoLegendReminder(),
    rows: planoLegendRows().map(function(r){ return {style:r.style||'plain', key:r.key||'', text:r.text||''}; })
  };
  planoRenderLegendEditor();
}
function planoReadLegendEditor(){
  if(!planoLegendDraft) return;
  const rem = document.getElementById('plano-leg-reminder');
  if(rem) planoLegendDraft.reminder = rem.value;
  planoLegendDraft.rows.forEach(function(r, i){
    const st = document.getElementById('plano-leg-style-' + i);
    const k = document.getElementById('plano-leg-key-' + i);
    const t = document.getElementById('plano-leg-text-' + i);
    if(st) r.style = st.value;
    if(k) r.key = k.value;
    if(t) r.text = t.value;
  });
}
function planoRenderLegendEditor(){
  const d = planoLegendDraft;
  document.getElementById('modal-body').innerHTML = `
    <h3>עריכת מקרא</h3>
    <div style="font-size:13.5px;color:var(--text-secondary);margin:4px 0 4px;">שורות המקרא:</div>
    <div class="plano-leg-scroll">${d.rows.map(function(r, i){
      return `<div class="plano-leg-edit-row">
        <div class="plano-leg-top">
          <select id="plano-leg-style-${i}" aria-label="סוג הסימון">${Object.keys(PLANO_LEGEND_STYLES).map(function(k){
            return `<option value="${k}" ${r.style === k ? 'selected' : ''}>${PLANO_LEGEND_STYLES[k]}</option>`;
          }).join('')}</select>
          <input id="plano-leg-key-${i}" type="text" value="${planoEsc(r.key)}" placeholder="${r.style === 'new' ? planoEsc(planoNewLabel()) : 'כיתוב קצר'}" aria-label="כיתוב הסימון">
          <button class="plano-leg-del" onclick="planoLegendRemoveRow(${i})" aria-label="מחיקת שורה">🗑</button>
        </div>
        <textarea id="plano-leg-text-${i}" aria-label="הסבר">${planoEsc(r.text)}</textarea>
      </div>`;
    }).join('')}</div>
    <button class="btn-secondary" onclick="planoLegendAddRow()">+ הוספת שורה</button>
    <label style="display:flex;gap:8px;align-items:center;font-size:14px;margin-top:12px;">
      <input type="checkbox" id="plano-leg-bump" checked> להציג את המקרא שוב לכל העובדים בכניסה הבאה
    </label>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="planoLegendResetDefault()">שחזור ברירת מחדל</button>
      <button class="btn-secondary" onclick="planoOpenLegend()">ביטול</button>
      <button class="btn-confirm" id="plano-leg-save" onclick="planoSaveLegend()">שמירה</button>
    </div>`;
  document.getElementById('modal-overlay').classList.add('open');
}
function planoLegendAddRow(){
  planoReadLegendEditor();
  planoLegendDraft.rows.push({style:'plain', key:'', text:''});
  planoRenderLegendEditor();
}
function planoLegendRemoveRow(i){
  planoReadLegendEditor();
  planoLegendDraft.rows.splice(i, 1);
  planoRenderLegendEditor();
}
function planoLegendResetDefault(){
  planoLegendDraft = {
    reminder: PLANO_LEGEND_REMINDER_DEFAULT,
    rows: PLANO_LEGEND_ROWS_DEFAULT.map(function(r){ return Object.assign({}, r); })
  };
  planoRenderLegendEditor();
}
function planoSaveLegend(){
  planoReadLegendEditor();
  const rows = planoLegendDraft.rows
    .map(function(r){ return {style: r.style || 'plain', key: (r.key||'').trim(), text: (r.text||'').trim()}; })
    .filter(function(r){ return r.text; });
  if(!rows.length){ toast('צריך לפחות שורה אחת עם הסבר'); return; }
  if(!firebaseReady || !db){ toast('אין חיבור כרגע. נסו שוב.'); return; }
  const bump = document.getElementById('plano-leg-bump');
  const patch = {
    legendRows: rows,
    legendReminder: (planoLegendDraft.reminder||'').trim() || PLANO_LEGEND_REMINDER_DEFAULT,
    legendVersion: planoLegendVersion() + ((bump && bump.checked) ? 1 : 0),
    legendUpdatedAt: planoToday(),
    legendUpdatedBy: currentUserEmail || null
  };
  const btn = document.getElementById('plano-leg-save');
  if(btn){ btn.disabled = true; btn.textContent = 'שומר…'; }
  db.collection('config').doc('planogramLegend').set(patch, {merge:true}).then(function(){
    planoData.legend = Object.assign({}, planoData.legend || {}, patch);
    planoWriteCache(planoData.departments, planoData.legend);
    planoMarkLegendSeen();
    planoLegendDraft = null;
    closeModal();
    toast('המקרא נשמר');
    planoRerender();
  }).catch(function(err){
    console.error('planograms: שמירת מקרא נכשלה', err);
    if(btn){ btn.disabled = false; btn.textContent = 'שמירה'; }
    toast('השמירה נכשלה: ' + (err && err.message ? err.message : 'שגיאה לא ידועה'));
  });
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
    snap.forEach(function(doc){ if(doc.id.charAt(0) !== '_') existing[doc.id] = doc.data(); });
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
