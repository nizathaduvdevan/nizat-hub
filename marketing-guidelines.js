/* ============================================================
   marketing-guidelines.js
   ------------------------------------------------------------
   "הנחיות שיווק" · מחלקת שיווק.
   מנהלת השיווק מעלה את קובץ ה-Word החודשי כמו שהוא (AS IS), והמערכת
   מפרקת אותו בדפדפן לכרטיס מסודר לכל סעיף — בלי Cloud Function ובלי
   שרת נוסף.

   שני מסכים:
     1. viewMarketingGuidelines()        — מה שהסניפים רואים: ההנחיות
        של החודש הנוכחי (או האחרונות שפורסמו), עם תוכן עניינים, כרטיס
        לכל סעיף, מחיר/מק"ט/תוקף מודגשים, תמונות בהגדלה, וארכיון של
        חודשים קודמים.
     2. viewMarketingGuidelinesUpload()  — לצוות השיווק: גוררים את קובץ
        ה-Word, רואים תצוגה מקדימה בדיוק כמו שהסניפים יראו, מתקנים כותרת
        ותאריכים אם צריך, ולוחצים "פרסם לסניפים".

   איך הקובץ מפוענח (mgParseHtml):
     • הספרייה mammoth.js (נטענת רק כשפותחים את מסך ההעלאה) ממירה את
       ה-Word ל-HTML נקי, כולל התמונות.
     • כותרת המסמך (סגנון "Title" ב-Word) → כותרת ההנחיות. אם יש בה טווח
       תאריכים (למשל 1-30.11.26) — הוא נהיה תקופת התוקף.
     • כל כותרת, או שורה מודגשת שמתחילה במספר ("2. ימי מכירות וולדה")
       → סעיף חדש. כך זה עובד גם כשמנהלת השיווק לא השתמשה בסגנון כותרת.
     • שורות שמתחילות בתווית מודגשת ("המבצע:", "איפה ואיך:", "לצוות:")
       → בלוקים צבעוניים לפי סוג (מבצע / תצוגה / צוות).
     • מחיר ("ב־59.90 ₪ במקום 94.50 ₪"), אחוז הנחה, מק"ט/קוד מוצר ותוקף
       מזוהים אוטומטית ומוצגים בראש הכרטיס.
     • שורות עם רשימה מופרדת ב-";" (למשל מותגים בקמפיין) → תגיות.
     • תמונות → גלריה בתחתית הסעיף, עם הכיתוב שמתחתן ב-Word.
     • שורת סיום קצרה ("זמינה לכל שאלה, חודש מוצלח!") → חתימה בסוף.

   אחסון:
     • Firestore: קולקציה marketingGuidelines — מסמך אחד לכל קובץ שפורסם.
       (חוק אבטחה: ראו ההוראות שנמסרו עם הקובץ.)
     • תמונות + הקובץ המקורי: Cloudinary, דרך uploadFileToCloudinary()
       הקיים ב-firebase-init.js.
     • בפרסום נרשם אירוע לפיד "חדש עבורכם" (postFeedEvent) — כך מופיעה
       נקודה אדומה על "הנחיות שיווק" עד שהסניף נכנס למסך. אפשר גם לשלוח
       התראת Push דרך קולקציית broadcasts הקיימת.

   נטען אחרי new-on-shelf.js / planograms.js, כמו שאר קבצי המודולים.
============================================================ */

const MG_COLLECTION = 'marketingGuidelines';
const MG_VIEW = 'marketingGuidelines';
const MG_UPLOAD_VIEW = 'marketingGuidelinesUpload';
const MG_MAMMOTH_URLS = [
  'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js',
  'https://unpkg.com/mammoth@1.8.0/mammoth.browser.min.js'
];

/* מצב המסכים */
let mgState = { list: null, loading: false, error: null, selectedId: null };
let mgUpload = { file: null, parsed: null, images: {}, busy: false };
/* מצב עריכה: null, או {target:'published'|'preview', id, g:<עותק עבודה>, dirty} */
let mgEdit = null;

/* ============================================================
   עיצוב
============================================================ */
function mgInjectStyleOnce(){
  if(document.getElementById('mg-style')) return;
  const style = document.createElement('style');
  style.id = 'mg-style';
  style.textContent = `
    .mg-hero{background:var(--surface-1);border:1px solid var(--border);border-radius:16px;padding:18px 20px;margin-bottom:14px;box-shadow:var(--shadow);}
    .mg-hero-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap;}
    .mg-hero h2{margin:0 0 6px;font-size:21px;font-weight:700;line-height:1.3;}
    .mg-hero-badges{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:10px;}
    .mg-badge{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;font-weight:600;padding:4px 10px;border-radius:99px;background:var(--page);color:var(--text-secondary);white-space:nowrap;}
    .mg-badge.live{background:rgba(12,163,12,0.12);color:#0a7d0a;}
    .mg-badge.ended{background:#eceae4;color:var(--muted);}
    .mg-badge.soon{background:rgba(250,178,25,0.16);color:#8a5a00;}
    html[data-theme="dark"] .mg-badge.live{background:rgba(12,163,12,0.18);color:#4ade4a;}
    html[data-theme="dark"] .mg-badge.ended{background:#242422;}
    html[data-theme="dark"] .mg-badge.soon{background:rgba(250,178,25,0.2);color:#fab219;}
    .mg-intro{font-size:15px;line-height:1.75;color:var(--text-secondary);margin:4px 0 0;}
    .mg-intro p{margin:0 0 6px;}
    .mg-hero-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;}
    .mg-btn{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--gridline);background:var(--surface-1);color:var(--text-primary);
      border-radius:10px;padding:8px 12px;font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;text-decoration:none;}
    .mg-btn:hover{border-color:var(--brand-primary);}
    .mg-btn.primary{background:var(--brand-primary);border-color:var(--brand-primary);color:#fff;}
    .mg-btn.primary:hover{background:var(--brand-primary-dark);}
    .mg-btn.danger{color:var(--critical);border-color:var(--critical);}
    .mg-btn[disabled]{opacity:.5;cursor:default;}

    .mg-archive{display:flex;gap:6px;overflow-x:auto;padding:2px 0 10px;margin-bottom:4px;scrollbar-width:thin;}
    .mg-archive button{flex:none;border:1px solid var(--gridline);background:var(--surface-1);color:var(--text-secondary);border-radius:99px;
      padding:6px 12px;font:inherit;font-size:13px;font-weight:500;cursor:pointer;white-space:nowrap;}
    .mg-archive button.active{background:var(--text-primary);border-color:var(--text-primary);color:var(--surface-1);}

    .mg-toc{position:sticky;top:var(--mg-topbar-h,57px);z-index:4;background:var(--page);padding:8px 0;margin:0 0 6px;display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;}
    .mg-toc::-webkit-scrollbar{display:none;}
    .mg-toc button{flex:none;display:inline-flex;align-items:center;gap:6px;border:1px solid var(--border);background:var(--surface-1);color:var(--text-primary);
      border-radius:99px;padding:6px 12px 6px 8px;font:inherit;font-size:13px;font-weight:500;cursor:pointer;white-space:nowrap;}
    .mg-toc button:hover{border-color:var(--brand-primary);}
    .mg-toc button.active{border-color:var(--brand-primary);background:rgba(69,122,31,0.10);color:var(--brand-primary-dark);}
    html[data-theme="dark"] .mg-toc button.active{background:rgba(120,184,64,0.16);color:#a8d878;}
    .mg-toc-num{width:20px;height:20px;border-radius:50%;background:var(--brand-primary);color:#fff;font-size:11.5px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;flex:none;}

    .mg-sec{background:var(--surface-1);border:1px solid var(--border);border-radius:16px;padding:16px 18px;margin-bottom:14px;box-shadow:var(--shadow);scroll-margin-top:120px;}
    .mg-sec-head{display:flex;align-items:center;gap:10px;margin-bottom:10px;}
    .mg-sec-num{width:32px;height:32px;border-radius:10px;background:var(--brand-primary);color:#fff;font-size:15px;font-weight:700;display:flex;align-items:center;justify-content:center;flex:none;}
    .mg-sec-title{font-size:17.5px;font-weight:700;line-height:1.35;flex:1;min-width:0;}
    .mg-sec-icon{font-size:20px;flex:none;}

    .mg-facts{display:flex;flex-wrap:wrap;gap:8px;align-items:stretch;margin:0 0 12px;}
    .mg-price{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;background:rgba(176,24,40,0.07);border-radius:12px;padding:8px 12px;}
    html[data-theme="dark"] .mg-price{background:rgba(224,71,90,0.12);}
    .mg-price-new{font-size:22px;font-weight:700;color:var(--orange);font-variant-numeric:tabular-nums;line-height:1.1;}
    .mg-price-unit{font-size:12.5px;color:var(--text-secondary);}
    .mg-price-old{font-size:14px;color:var(--muted);text-decoration:line-through;font-variant-numeric:tabular-nums;}
    .mg-price-save{font-size:12px;font-weight:700;color:#fff;background:var(--orange);border-radius:99px;padding:2px 8px;}
    .mg-fact{display:inline-flex;align-items:center;gap:6px;background:var(--page);border-radius:12px;padding:8px 12px;font-size:13.5px;font-weight:500;color:var(--text-primary);}
    html[data-theme="dark"] .mg-fact{background:#1f1f1d;}
    .mg-fact small{font-size:12px;color:var(--muted);font-weight:500;}
    .mg-fact.sku{cursor:pointer;border:none;font:inherit;font-size:13.5px;font-weight:500;color:var(--text-primary);font-variant-numeric:tabular-nums;}
    .mg-fact.sku:hover{outline:1.5px solid var(--brand-primary);}
    .mg-fact.percent{background:rgba(176,24,40,0.07);color:var(--orange);font-weight:700;font-size:15px;}
    html[data-theme="dark"] .mg-fact.percent{background:rgba(224,71,90,0.12);}

    .mg-block{border-radius:12px;padding:10px 14px;margin-bottom:8px;font-size:15px;line-height:1.75;background:var(--page);border-inline-start:4px solid var(--gridline);}
    html[data-theme="dark"] .mg-block{background:#1f1f1d;}
    .mg-block-label{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:700;margin-bottom:2px;}
    .mg-block.promo{border-inline-start-color:var(--orange);}
    .mg-block.promo .mg-block-label{color:var(--orange);}
    .mg-block.display{border-inline-start-color:var(--yellow);}
    .mg-block.display .mg-block-label{color:#9a6a00;}
    html[data-theme="dark"] .mg-block.display .mg-block-label{color:#e0b040;}
    .mg-block.team{border-inline-start-color:var(--violet);}
    .mg-block.team .mg-block-label{color:var(--violet);}
    .mg-block.other .mg-block-label{color:var(--text-secondary);}
    .mg-text{font-size:15px;line-height:1.75;margin:0 0 8px;color:var(--text-primary);}
    .mg-text a, .mg-block a{color:var(--blue-dark);font-weight:600;}
    html[data-theme="dark"] .mg-text a, html[data-theme="dark"] .mg-block a{color:var(--blue);}
    .mg-list{margin:0 0 8px;padding-inline-start:22px;font-size:15px;line-height:1.75;}
    .mg-table-wrap{overflow-x:auto;margin:0 0 8px;}
    .mg-table-wrap table{border-collapse:collapse;font-size:14px;min-width:100%;}
    .mg-table-wrap td, .mg-table-wrap th{border:1px solid var(--gridline);padding:6px 10px;text-align:right;vertical-align:top;}
    .mg-chips{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 10px;}
    .mg-chip{background:rgba(69,122,31,0.10);color:var(--brand-primary-dark);border-radius:99px;padding:5px 11px;font-size:13.5px;font-weight:500;line-height:1.4;}
    html[data-theme="dark"] .mg-chip{background:rgba(120,184,64,0.16);color:#a8d878;}
    .mg-link{display:flex;align-items:center;gap:10px;background:rgba(69,122,31,0.08);border:1px solid rgba(69,122,31,0.25);border-radius:12px;
      padding:11px 14px;margin:4px 0 10px;text-decoration:none;color:var(--text-primary);font-size:14.5px;font-weight:600;}
    .mg-link:hover{border-color:var(--brand-primary);}
    .mg-link span:last-child{margin-inline-start:auto;color:var(--muted);}

    .mg-sec-grid{display:block;}
    .mg-sec-main{min-width:0;}
    .mg-sec-media{min-width:0;}
    @media (min-width:1000px){
      .mg-sec-grid.has-media{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:18px;align-items:start;}
      .mg-sec-grid.has-media .mg-gallery{margin-top:0;}
      .mg-sec-grid.has-media .mg-sec-media{position:sticky;top:120px;}
    }
    .mg-gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-top:10px;}
    .mg-gallery.single{grid-template-columns:1fr;}
    .mg-img{margin:0;border-radius:12px;overflow:hidden;background:var(--page);border:1px solid var(--gridline);cursor:zoom-in;display:flex;flex-direction:column;}
    .mg-img img{display:block;width:100%;height:auto;max-height:420px;object-fit:contain;background:#fff;}
    .mg-gallery.single .mg-img img{max-height:520px;}
    .mg-img figcaption{font-size:12.5px;color:var(--text-secondary);padding:6px 10px;line-height:1.5;}
    .mg-caption{font-size:13px;color:var(--text-secondary);margin:6px 2px 0;line-height:1.5;}

    .mg-outro{text-align:center;font-size:15px;font-weight:600;color:var(--brand-primary-dark);padding:8px 0 4px;}
    html[data-theme="dark"] .mg-outro{color:#a8d878;}
    .mg-empty{padding:36px 16px;text-align:center;color:var(--muted);font-size:15px;}

    .mg-lightbox{position:fixed;inset:0;z-index:150;background:rgba(0,0,0,0.88);display:flex;align-items:center;justify-content:center;padding:16px;cursor:zoom-out;}
    .mg-lightbox img{max-width:100%;max-height:100%;object-fit:contain;border-radius:8px;background:#fff;}
    .mg-lightbox button{position:absolute;top:14px;left:14px;width:40px;height:40px;border-radius:50%;border:none;background:rgba(255,255,255,0.2);color:#fff;font-size:22px;cursor:pointer;}

    /* מסך העלאה */
    .mg-drop{border:2px dashed var(--gridline);border-radius:16px;padding:30px 16px;text-align:center;background:var(--surface-1);cursor:pointer;margin-bottom:14px;}
    .mg-drop.drag{border-color:var(--brand-primary);background:rgba(69,122,31,0.06);}
    .mg-drop-title{font-size:16px;font-weight:700;margin-bottom:4px;}
    .mg-drop-hint{font-size:13px;color:var(--muted);}
    .mg-status{display:none;border-radius:12px;padding:10px 14px;font-size:14px;margin-bottom:12px;line-height:1.6;}
    .mg-status.show{display:block;}
    .mg-status.busy{background:rgba(69,122,31,0.08);}
    .mg-status.error{background:rgba(208,59,59,0.10);color:var(--critical);}
    .mg-status.success{background:rgba(12,163,12,0.10);color:#0a7d0a;}
    .mg-status.warn{background:rgba(250,178,25,0.14);color:#8a5a00;}
    html[data-theme="dark"] .mg-status.warn{color:#e0b040;}
    .mg-spinner{display:inline-block;width:14px;height:14px;border-radius:50%;border:2px solid var(--gridline);border-top-color:var(--brand-primary);
      animation:auth-spin .8s linear infinite;vertical-align:-2px;margin-inline-end:6px;}
    .mg-form{background:var(--surface-1);border:1px solid var(--border);border-radius:16px;padding:16px;margin-bottom:14px;}
    .mg-form .field{margin-bottom:12px;}
    .mg-form-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
    .mg-form-row .field{margin-bottom:0;}
    .mg-check{display:flex;align-items:center;gap:8px;font-size:14px;margin:12px 0 0;cursor:pointer;}
    .mg-check input{width:18px;height:18px;accent-color:var(--brand-primary);}
    .mg-preview-label{font-size:13px;font-weight:700;color:var(--muted);margin:18px 2px 8px;display:flex;align-items:center;gap:8px;}
    .mg-preview-label::after{content:"";flex:1;height:1px;background:var(--gridline);}
    .mg-published-row{display:flex;align-items:center;gap:10px;padding:10px 4px;border-bottom:1px solid var(--gridline);font-size:14px;}
    .mg-published-row:last-child{border-bottom:none;}
    .mg-published-row .t{flex:1;min-width:0;font-weight:600;}
    .mg-published-row .m{font-size:12.5px;color:var(--muted);font-weight:400;}

    /* מצב עריכה */
    .mg-editbar{position:sticky;top:var(--mg-topbar-h,57px);z-index:6;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;
      background:#fff7d6;border:1px solid #f0d77a;color:#5c4700;border-radius:14px;padding:10px 12px;margin:0 0 12px;box-shadow:var(--shadow);}
    html[data-theme="dark"] .mg-editbar{background:#3a3112;border-color:#6b5a1c;color:#f3dd8a;}
    .mg-editbar-text{font-size:13.5px;font-weight:600;}
    .mg-editbar-actions{display:flex;gap:8px;}
    .mg-ed{border:1.5px dashed rgba(69,122,31,0.45);border-radius:8px;padding:4px 8px;min-height:1.6em;outline:none;background:rgba(255,255,255,0.65);
      cursor:text;line-height:1.7;word-break:break-word;}
    html[data-theme="dark"] .mg-ed{background:rgba(255,255,255,0.04);}
    .mg-ed:focus{border-style:solid;border-color:var(--brand-primary);background:var(--surface-1);box-shadow:0 0 0 3px rgba(69,122,31,0.15);}
    .mg-ed:empty::before{content:attr(data-ph);color:var(--muted);font-weight:400;pointer-events:none;}
    .mg-ed.single{line-height:1.4;}
    .mg-ed-h2{font-size:21px;font-weight:700;margin-bottom:4px;}
    .mg-block-label .mg-ed{flex:1;min-width:0;font-weight:700;}
    .mg-sec-title .mg-ed{font-size:17px;}
    .mg-edit-block{position:relative;padding-inline-end:40px;margin-bottom:8px;}
    .mg-edit-plain{background:var(--page);border-radius:12px;padding:8px 10px;padding-inline-end:40px;}
    html[data-theme="dark"] .mg-edit-plain{background:#1f1f1d;}
    .mg-ed-del{position:absolute;top:6px;inset-inline-end:6px;width:30px;height:30px;border-radius:8px;border:1px solid var(--gridline);
      background:var(--surface-1);cursor:pointer;font-size:14px;line-height:1;padding:0;z-index:2;}
    .mg-ed-del:hover{border-color:var(--critical);}
    .mg-ed-add{display:block;width:100%;border:1.5px dashed var(--gridline);background:none;border-radius:10px;padding:8px;margin:4px 0 6px;
      font:inherit;font-size:13.5px;font-weight:600;color:var(--brand-primary-dark);cursor:pointer;}
    .mg-ed-add:hover{border-color:var(--brand-primary);background:rgba(69,122,31,0.05);}
    .mg-ed-add-sec{padding:12px;font-size:14.5px;background:var(--surface-1);}
    .mg-ed-input{width:100%;margin-top:6px;padding:7px 10px;border-radius:8px;border:1px solid var(--gridline);font:inherit;font-size:13.5px;background:var(--surface-1);color:var(--text-primary);}
    .mg-btn-sm{padding:6px 10px;font-size:12.5px;flex:none;}
    .mg-edit-facts{background:var(--page);border-radius:12px;padding:8px 12px;margin:0 0 10px;}
    html[data-theme="dark"] .mg-edit-facts{background:#1f1f1d;}
    .mg-edit-facts summary{cursor:pointer;font-size:13.5px;font-weight:600;color:var(--text-secondary);}
    .mg-ef-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px;}
    .mg-ef{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--muted);font-weight:600;}
    .mg-ef.wide{grid-column:span 2;}
    .mg-ef input::placeholder{color:var(--muted);opacity:.6;font-size:12.5px;}
    .mg-ef input{padding:7px 9px;border-radius:8px;border:1px solid var(--gridline);font:inherit;font-size:14px;background:var(--surface-1);color:var(--text-primary);width:100%;}
    .mg-ef-hint{font-size:12px;color:var(--muted);margin-top:6px;line-height:1.5;}
    .mg-edit-gallery .mg-edit-img{position:relative;cursor:default;}
    .mg-edit-img figcaption{padding:6px;}
    @media (max-width:640px){ .mg-ef-grid{grid-template-columns:1fr 1fr;} }
    @media (max-width:520px){ .mg-form-row{grid-template-columns:1fr;} .mg-sec{padding:14px;} .mg-hero{padding:16px;} }
  `;
  document.head.appendChild(style);
}

/* ============================================================
   כלי עזר
============================================================ */
function mgEsc(s){ return (typeof esc === 'function') ? esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* HTML נקי → טקסט רגיל (כולל פענוח &quot; וכו', כדי שמק"ט יזוהה) */
function mgHtmlToText(h){
  return String(h || '').replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
}

function mgCanManage(){
  return typeof canManageDepartment === 'function' && canManageDepartment('marketing');
}

function mgToDate(v){
  if(!v) return null;
  if(typeof v.toDate === 'function') return v.toDate();
  if(v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if(typeof v === 'object' && typeof v.seconds === 'number') return new Date(v.seconds * 1000);
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function mgFmtDate(d){
  d = mgToDate(d);
  if(!d) return '';
  return `${d.getDate()}.${d.getMonth()+1}.${String(d.getFullYear()).slice(-2)}`;
}

function mgDateInputValue(d){
  d = mgToDate(d);
  if(!d) return '';
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function mgFromDateInput(v, endOfDay){
  if(!v) return null;
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m) return null;
  return endOfDay ? new Date(+m[1], +m[2]-1, +m[3], 23, 59, 59) : new Date(+m[1], +m[2]-1, +m[3], 0, 0, 0);
}

/* "1-30.11.26" / "25.10-30.11.26" / "1.11.26-30.11.26" → {start, end, text} */
function mgParsePeriod(str){
  if(!str) return null;
  const s = String(str).replace(/[–—־]/g, '-');
  let m = s.match(/(\d{1,2})(?:\.(\d{1,2}))?(?:\.(\d{2,4}))?\s*-\s*(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if(!m) return null;
  let endYear = +m[6]; if(endYear < 100) endYear += 2000;
  const endMonth = +m[5];
  const startMonth = m[2] ? +m[2] : endMonth;
  let startYear = m[3] ? +m[3] : endYear; if(startYear < 100) startYear += 2000;
  if(!m[3] && startMonth > endMonth) startYear = endYear - 1;
  const start = new Date(startYear, startMonth - 1, +m[1], 0, 0, 0);
  const end = new Date(endYear, endMonth - 1, +m[4], 23, 59, 59);
  if(isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return null;
  return { start, end, text: m[0].replace(/\s+/g, '') };
}

/* "1-30.11.26" מתוך שני תאריכים */
function mgPeriodTextFromDates(s, e){
  if(!s || !e) return '';
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
  return sameMonth ? `${s.getDate()}-${mgFmtDate(e)}` : `${s.getDate()}.${s.getMonth()+1}-${mgFmtDate(e)}`;
}

/* סטטוס התקופה ביחס להיום */
function mgPeriodStatus(g){
  const now = Date.now();
  const s = mgToDate(g.periodStart), e = mgToDate(g.periodEnd);
  if(s && now < s.getTime()) return 'soon';
  if(e && now > e.getTime()) return 'ended';
  if(s || e) return 'live';
  return null;
}

/* כתובת תמונה מוצגת: ב-Cloudinary מוסיפים דחיסה והקטנה אוטומטית (טוען מהר
   בסניף), כל כתובת אחרת (תצוגה מקדימה — blob:) נשארת כמו שהיא. */
function mgImgSrc(url, width){
  if(!url) return '';
  if(url.indexOf('res.cloudinary.com') === -1 || url.indexOf('/upload/') === -1) return url;
  return url.replace('/upload/', `/upload/f_auto,q_auto,c_limit,w_${width || 1200}/`);
}

/* ============================================================
   ניקוי HTML — רק תגיות טקסט בסיסיות נשמרות, כדי שלא יוזרק שום קוד
============================================================ */
function mgCleanInline(node){
  let out = '';
  node.childNodes.forEach(function(ch){
    if(ch.nodeType === 3){ out += mgEsc(ch.nodeValue); return; }
    if(ch.nodeType !== 1) return;
    const tag = ch.tagName;
    if(tag === 'IMG') return;
    if(tag === 'BR'){ out += '<br>'; return; }
    const inner = mgCleanInline(ch);
    if(!inner) return;
    if(tag === 'STRONG' || tag === 'B') out += `<strong>${inner}</strong>`;
    else if(tag === 'EM' || tag === 'I') out += `<em>${inner}</em>`;
    else if(tag === 'U') out += `<u>${inner}</u>`;
    else if(tag === 'SUP' || tag === 'SUB') out += `<${tag.toLowerCase()}>${inner}</${tag.toLowerCase()}>`;
    else if(tag === 'A'){
      const href = ch.getAttribute('href') || '';
      if(/^(https?:|mailto:|tel:)/i.test(href)) out += `<a href="${mgEsc(href)}" target="_blank" rel="noopener">${inner}</a>`;
      else out += inner;
    }
    else out += inner;
  });
  return out;
}

function mgCleanBlock(el){
  const tag = el.tagName;
  if(tag === 'UL' || tag === 'OL'){
    const items = Array.from(el.children).filter(c => c.tagName === 'LI').map(li => {
      const nested = Array.from(li.children).filter(c => c.tagName === 'UL' || c.tagName === 'OL').map(mgCleanBlock).join('');
      const clone = li.cloneNode(true);
      Array.from(clone.children).forEach(c => { if(c.tagName === 'UL' || c.tagName === 'OL') c.remove(); });
      return `<li>${mgCleanInline(clone)}${nested}</li>`;
    }).join('');
    return `<${tag.toLowerCase()}>${items}</${tag.toLowerCase()}>`;
  }
  if(tag === 'TABLE'){
    const rows = Array.from(el.querySelectorAll('tr')).map(tr => {
      const cells = Array.from(tr.children).filter(c => c.tagName === 'TD' || c.tagName === 'TH').map(c => {
        const t = c.tagName.toLowerCase();
        const span = c.getAttribute('colspan') ? ` colspan="${parseInt(c.getAttribute('colspan'),10) || 1}"` : '';
        const parts = c.querySelectorAll('p').length ? Array.from(c.querySelectorAll('p')).map(mgCleanInline).filter(Boolean).join('<br>') : mgCleanInline(c);
        return `<${t}${span}>${parts}</${t}>`;
      }).join('');
      return `<tr>${cells}</tr>`;
    }).join('');
    return `<table>${rows}</table>`;
  }
  return mgCleanInline(el);
}

/* ============================================================
   פענוח — מה-HTML של mammoth למבנה של סעיפים
============================================================ */
const MG_KNOWN_LABELS = ['מה מציגים','המבצע','מבצע','מחיר ושילוט','מחיר','שילוט','איפה ואיך','מה עושים','בתצוגה','תצוגה','מיקום','לצוות','שימו לב','חשוב','הערה'];

function mgLabelKind(label){
  const l = String(label || '');
  if(/צוות|שימו לב|חשוב|הערה/.test(l)) return 'team';
  if(/איפה|איך|עושים|תצוגה|מיקום|הצבה/.test(l)) return 'display';
  if(/מבצע|מחיר|שילוט|מציגים|הנחה/.test(l)) return 'promo';
  return 'other';
}
const MG_LABEL_ICONS = { promo:'🏷️', display:'📍', team:'👥', other:'📌' };

function mgSectionIcon(title){
  const t = String(title || '');
  if(/קופה/.test(t)) return '🧾';
  if(/תפזור/.test(t)) return '🥜';
  if(/מחירון|מחירונים/.test(t)) return '🏷️';
  if(/רשתות|קמפיין|פייסבוק|אינסטגרם/.test(t)) return '📱';
  if(/חדש על המדף/.test(t)) return '✨';
  if(/ארגז|שקיות|מחזור|סביבה/.test(t)) return '♻️';
  if(/ימי מכירות|מכירות/.test(t)) return '🛍️';
  if(/פירות|ירקות|מנגו|פרי/.test(t)) return '🥭';
  if(/תחרות/.test(t)) return '🏆';
  if(/אירוע|הפנינג|טעימות/.test(t)) return '🎉';
  return '📌';
}

/* מחיר / הנחה / מק"ט / תוקף מתוך כל הטקסט של הסעיף */
function mgExtractFacts(text){
  const t = String(text || '').replace(/[־]/g, '-');
  const facts = { price: null, oldPrice: null, unit: null, percent: null, skus: [], validity: null };
  const pm = t.match(/(\d+(?:\.\d{1,2})?)\s*₪\s*((?:ל-?\s?)?\d*\s*(?:גרם|גר'|ק"ג|ק״ג|קילו|יח'|יחידות|ליטר|מ"ל|מ״ל))?\s*במקום\s*(\d+(?:\.\d{1,2})?)\s*₪/);
  if(pm){
    facts.price = pm[1];
    facts.unit = pm[2] ? pm[2].replace(/^ל-?\s?/, 'ל־').trim() : null;
    facts.oldPrice = pm[3];
  }
  const pc = t.match(/(\d{1,2})\s*%\s*הנחה/);
  if(pc) facts.percent = pc[1];
  const skuRe = /(?:מק["״'׳]?ט|קוד מוצר|קוד פריט|ברקוד)\s*:?\s*(\d{2,14})/g;
  let m;
  while((m = skuRe.exec(t))){ if(facts.skus.indexOf(m[1]) === -1) facts.skus.push(m[1]); }
  const vm = t.match(/(?:בתוקף|בתאריכים|תוקף)\s*:?\s*(\d{1,2}(?:\.\d{1,2})?(?:\.\d{2,4})?\s*-\s*\d{1,2}\.\d{1,2}\.\d{2,4})/);
  if(vm) facts.validity = vm[1].replace(/\s+/g, '');
  return facts;
}

function mgIsSectionStart(el){
  const tag = el.tagName;
  const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
  if(!text) return null;
  if(el.classList && el.classList.contains('mg-doc-title')) return null;
  const numM = text.match(/^(\d{1,2})\s*[.)]\s*(.{2,})$/);
  if(/^H[1-4]$/.test(tag)){
    return { num: numM ? +numM[1] : null, title: numM ? numM[2].trim() : text };
  }
  if(tag === 'P' && numM && text.length <= 90 && !el.querySelector('img')){
    const strongText = Array.from(el.querySelectorAll('strong,b')).map(s => s.textContent).join('').replace(/\s+/g, ' ').trim();
    if(strongText.length >= text.length * 0.6 || text.length <= 45){
      return { num: +numM[1], title: numM[2].trim() };
    }
  }
  return null;
}

/* בלוק מסוג תווית: "<strong>המבצע: </strong>טקסט" או "בתצוגה: טקסט" */
function mgTryLabel(el){
  const first = Array.from(el.childNodes).find(n => !(n.nodeType === 3 && !n.nodeValue.trim()));
  if(first && first.nodeType === 1 && (first.tagName === 'STRONG' || first.tagName === 'B')){
    const lt = (first.textContent || '').replace(/\s+/g, ' ').trim();
    const lm = lt.match(/^(.{1,28}?)\s*:\s*$/);
    if(lm){
      const clone = el.cloneNode(true);
      const f = Array.from(clone.childNodes).find(n => !(n.nodeType === 3 && !n.nodeValue.trim()));
      f.remove();
      const html = mgCleanInline(clone).trim();
      if(html) return { label: lm[1].trim(), html };
    }
  }
  const text = (el.textContent || '').trim();
  for(const lab of MG_KNOWN_LABELS){
    const re = new RegExp('^' + lab + '\\s*:\\s*');
    if(re.test(text) && !el.querySelector('a')){
      return { label: lab, html: mgEsc(text.replace(re, '')) };
    }
  }
  return null;
}

/* קלט: HTML של mammoth (תמונות עם src="mgimg:<key>"), שם הקובץ.
   פלט: {title, periodText, periodStart, periodEnd, intro[], outro, sections[], warnings[]} */
function mgParseHtml(html, fileName){
  const doc = new DOMParser().parseFromString(`<div id="mg-root">${html}</div>`, 'text/html');
  const root = doc.getElementById('mg-root');
  const out = { title: '', periodText: '', periodStart: null, periodEnd: null, intro: [], outro: '', sections: [], warnings: [] };
  let cur = null;
  let autoNum = 0;
  let lastImageGroup = null;

  function target(){ return cur ? cur.blocks : null; }

  Array.from(root.children).forEach(function(el){
    const tag = el.tagName;
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    const imgs = Array.from(el.querySelectorAll('img'));

    /* כותרת המסמך */
    if(el.classList.contains('mg-doc-title') || el.classList.contains('mg-doc-subtitle')){
      if(!out.title) out.title = text;
      else if(!cur) out.intro.push(mgEsc(text));
      return;
    }

    /* תחילת סעיף */
    const start = mgIsSectionStart(el);
    if(start){
      autoNum = start.num || (autoNum + 1);
      cur = { num: autoNum, title: start.title, icon: mgSectionIcon(start.title), blocks: [], images: [], facts: null };
      out.sections.push(cur);
      lastImageGroup = null;
      return;
    }

    /* כיתוב לתמונה */
    if(el.classList.contains('mg-caption')){
      if(cur && lastImageGroup && lastImageGroup.length){
        if(lastImageGroup.length === 1) lastImageGroup[0].caption = text;
        else cur.blocks.push({ t: 'caption', html: mgEsc(text) });
      } else if(cur){
        cur.blocks.push({ t: 'caption', html: mgEsc(text) });
      }
      return;
    }

    /* לפני הסעיף הראשון: כותרת (אם לא סומנה בסגנון) + פתיח */
    if(!cur){
      if(imgs.length) return;
      if(!text) return;
      if(!out.title && text.length <= 80 && out.intro.length === 0) { out.title = text; return; }
      out.intro.push(mgCleanInline(el));
      return;
    }

    /* תמונות */
    if(imgs.length){
      const group = [];
      imgs.forEach(function(img){
        const src = img.getAttribute('src') || '';
        if(src) { const item = { src, caption: '' }; cur.images.push(item); group.push(item); }
      });
      lastImageGroup = group;
      const clone = el.cloneNode(true);
      clone.querySelectorAll('img').forEach(i => i.remove());
      const rest = (clone.textContent || '').replace(/\s+/g, ' ').trim();
      if(rest){
        if(group.length === 1 && rest.length < 140) group[0].caption = rest;
        else cur.blocks.push({ t: 'text', html: mgCleanInline(clone) });
      }
      return;
    }

    if(!text) return;

    /* כיתוב שמגיע מיד אחרי זוג תמונות (בלי סגנון caption) */
    if(lastImageGroup && lastImageGroup.length > 1 && text.length < 140 && /אפשרויות|תמונה|מימין|משמאל|לדוגמה|דוגמה/.test(text) && tag === 'P'){
      cur.blocks.push({ t: 'caption', html: mgEsc(text) });
      lastImageGroup = null;
      return;
    }
    lastImageGroup = null;

    if(tag === 'UL' || tag === 'OL'){ cur.blocks.push({ t: 'list', html: mgCleanBlock(el) }); return; }
    if(tag === 'TABLE'){ cur.blocks.push({ t: 'table', html: mgCleanBlock(el) }); return; }

    /* שורה שכולה קישור אחד */
    const links = el.querySelectorAll('a[href]');
    if(links.length === 1 && (links[0].textContent || '').replace(/\s+/g, ' ').trim() === text){
      const href = links[0].getAttribute('href') || '';
      if(/^https?:/i.test(href)){ cur.blocks.push({ t: 'link', href, text }); return; }
    }

    /* תווית */
    const lab = mgTryLabel(el);
    if(lab){ cur.blocks.push({ t: 'label', kind: mgLabelKind(lab.label), label: lab.label, html: lab.html }); return; }

    /* רשימה מופרדת ב-";" → תגיות */
    const semi = (text.match(/;/g) || []).length;
    if(semi >= 2 || (semi >= 1 && /רשתות|קמפיין/.test(cur.title))){
      const items = text.split(';').map(s => s.trim().replace(/[.]$/, '').trim()).filter(Boolean);
      const prev = cur.blocks[cur.blocks.length - 1];
      if(prev && prev.t === 'chips') prev.items = prev.items.concat(items);
      else cur.blocks.push({ t: 'chips', items });
      return;
    }

    cur.blocks.push({ t: 'text', html: mgCleanInline(el) });
  });

  /* חתימת סיום — שורה קצרה אחרונה בסעיף האחרון */
  const last = out.sections[out.sections.length - 1];
  if(last && last.blocks.length){
    const lb = last.blocks[last.blocks.length - 1];
    const lbText = lb.t === 'text' ? mgHtmlToText(lb.html) : '';
    if(lbText && lbText.length <= 80 && /חודש מוצלח|בהצלחה|לכל שאלה|זמינה|זמין|תודה|שבוע טוב/.test(lbText)){
      out.outro = lbText;
      last.blocks.pop();
    }
  }

  /* עובדות לכל סעיף */
  out.sections.forEach(function(s){
    const allText = s.blocks.map(b => b.t === 'chips' ? b.items.join(' ') : (b.text || mgHtmlToText(b.html))).join(' ');
    s.facts = mgExtractFacts(allText);
  });

  /* תקופה: מהכותרת, אחרת משם הקובץ, אחרת התוקף הנפוץ בסעיפים */
  let period = mgParsePeriod(out.title) || mgParsePeriod(fileName);
  if(!period){
    const counts = {};
    out.sections.forEach(s => { if(s.facts.validity) counts[s.facts.validity] = (counts[s.facts.validity] || 0) + 1; });
    const best = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    if(best) period = mgParsePeriod(best);
  }
  if(period){ out.periodText = period.text; out.periodStart = period.start; out.periodEnd = period.end; }
  else out.warnings.push('לא זוהה טווח תאריכים — אפשר להזין אותו ידנית למטה.');

  if(!out.title){
    out.title = String(fileName || 'הנחיות שיווק').replace(/\.docx$/i, '').replace(/_/g, ' ').trim() || 'הנחיות שיווק';
    out.warnings.push('לא נמצאה כותרת במסמך — נלקחה משם הקובץ.');
  }
  if(!out.sections.length) out.warnings.push('לא זוהו סעיפים ממוספרים. ודאו שכל סעיף מתחיל בכותרת או במספר ("1. ...").');
  out.sections.forEach(s => { if(!s.blocks.length && !s.images.length) out.warnings.push(`סעיף ${s.num} ("${s.title}") ריק.`); });

  return out;
}

/* ============================================================
   תצוגה — משותפת לסניפים ולתצוגה המקדימה
============================================================ */
function mgRenderFacts(f){
  if(!f) return '';
  const parts = [];
  if(f.price){
    let save = '';
    const np = parseFloat(f.price), op = parseFloat(f.oldPrice);
    if(op > np && np > 0) save = `<span class="mg-price-save">חיסכון ${Math.round((1 - np / op) * 100)}%</span>`;
    parts.push(`<div class="mg-price">
      <span class="mg-price-new">${mgEsc(f.price)} ₪</span>
      ${f.unit ? `<span class="mg-price-unit">${mgEsc(f.unit)}</span>` : ''}
      ${f.oldPrice ? `<span class="mg-price-old">${mgEsc(f.oldPrice)} ₪</span>` : ''}
      ${save}
    </div>`);
  } else if(f.percent){
    parts.push(`<div class="mg-fact percent">${mgEsc(f.percent)}% הנחה</div>`);
  }
  (f.skus || []).forEach(function(s){
    parts.push(`<button type="button" class="mg-fact sku" onclick="mgCopy('${mgEsc(s)}')" title="לחצו להעתקה"><small>${s.length >= 8 ? 'מק״ט' : 'קוד'}</small>${mgEsc(s)} <span aria-hidden="true">⧉</span></button>`);
  });
  if(f.validity) parts.push(`<div class="mg-fact"><span aria-hidden="true">📅</span><small>בתוקף</small>${mgEsc(f.validity)}</div>`);
  return parts.length ? `<div class="mg-facts">${parts.join('')}</div>` : '';
}

function mgRenderBlock(b){
  if(b.t === 'label'){
    return `<div class="mg-block ${mgEsc(b.kind || 'other')}">
      <div class="mg-block-label"><span aria-hidden="true">${MG_LABEL_ICONS[b.kind] || MG_LABEL_ICONS.other}</span>${mgEsc(b.label)}</div>
      <div>${b.html}</div>
    </div>`;
  }
  if(b.t === 'chips') return `<div class="mg-chips">${(b.items || []).map(i => `<span class="mg-chip">${mgEsc(i)}</span>`).join('')}</div>`;
  if(b.t === 'link') return `<a class="mg-link" href="${mgEsc(b.href)}" target="_blank" rel="noopener"><span aria-hidden="true">📂</span><span>${mgEsc(b.text)}</span><span aria-hidden="true">↗</span></a>`;
  if(b.t === 'list') return `<div class="mg-list">${b.html}</div>`;
  if(b.t === 'table') return `<div class="mg-table-wrap">${b.html}</div>`;
  if(b.t === 'caption') return `<p class="mg-caption">${b.html}</p>`;
  return `<p class="mg-text">${b.html}</p>`;
}

function mgRenderImages(s){
  const imgs = s.images || [];
  if(!imgs.length) return '';
  /* כיתוב משותף לכמה תמונות (בלוק caption) מוצג מתחת לגלריה */
  return `<div class="mg-gallery ${imgs.length === 1 ? 'single' : ''}">
    ${imgs.map(function(img){
      const full = mgImgSrc(img.url || img.src, 2000);
      return `<figure class="mg-img" onclick="mgOpenImage('${mgEsc(full)}')">
        <img src="${mgEsc(mgImgSrc(img.url || img.src, imgs.length === 1 ? 1200 : 700))}" alt="${mgEsc(img.caption || s.title)}" loading="lazy">
        ${img.caption ? `<figcaption>${mgEsc(img.caption)}</figcaption>` : ''}
      </figure>`;
    }).join('')}
  </div>`;
}

function mgRenderSection(s){
  const captions = (s.blocks || []).filter(b => b.t === 'caption');
  const body = (s.blocks || []).filter(b => b.t !== 'caption');
  const hasMedia = (s.images || []).length > 0;
  /* בדסקטופ: טקסט בטור אחד ותמונות בטור שני. בטלפון: אחד מתחת לשני. */
  return `<section class="mg-sec" id="mg-sec-${s.num}">
    <div class="mg-sec-head">
      <div class="mg-sec-num">${mgEsc(s.num)}</div>
      <div class="mg-sec-title">${mgEsc(s.title)}</div>
      <div class="mg-sec-icon" aria-hidden="true">${s.icon || ''}</div>
    </div>
    <div class="mg-sec-grid ${hasMedia ? 'has-media' : ''}">
      <div class="mg-sec-main">
        ${mgRenderFacts(s.facts)}
        ${body.map(mgRenderBlock).join('')}
      </div>
      ${hasMedia ? `<div class="mg-sec-media">
        ${mgRenderImages(s)}
        ${captions.map(mgRenderBlock).join('')}
      </div>` : ''}
    </div>
  </section>`;
}

/* opts: {preview:bool, isAdmin:bool, archiveHtml:string} */
function mgRenderGuideline(g, opts){
  opts = opts || {};
  if(opts.edit) return mgRenderEditGuideline(g, opts);
  const status = mgPeriodStatus(g);
  const statusBadge = status === 'live' ? '<span class="mg-badge live">● בתוקף עכשיו</span>'
    : status === 'ended' ? '<span class="mg-badge ended">התקופה הסתיימה</span>'
    : status === 'soon' ? `<span class="mg-badge soon">מתחיל ב-${mgEsc(mgFmtDate(g.periodStart))}</span>` : '';
  const periodBadge = g.periodText ? `<span class="mg-badge">📅 ${mgEsc(g.periodText)}</span>` : '';
  const countBadge = (g.sections || []).length ? `<span class="mg-badge">${(g.sections || []).length} סעיפים</span>` : '';
  const updated = (!opts.preview && typeof lastUpdatedHtml === 'function') ? lastUpdatedHtml(g) : '';
  const adminActions = (opts.isAdmin && !opts.preview) ? `
    <button type="button" class="mg-btn primary" onclick="mgStartEdit('published','${mgEsc(g.id)}')">✏️ עריכה</button>
    <button type="button" class="mg-btn" onclick="goTo('${MG_UPLOAD_VIEW}')">⬆️ העלאת קובץ חדש</button>
    <button type="button" class="mg-btn danger" onclick="mgDelete('${mgEsc(g.id)}')">🗑 מחיקה</button>` : '';
  const sourceBtn = g.sourceFileUrl ? `<a class="mg-btn" href="${mgEsc(g.sourceFileUrl)}" target="_blank" rel="noopener">📄 הקובץ המקורי</a>` : '';

  return `
    ${opts.archiveHtml || ''}
    <div class="mg-hero">
      <h2>${mgEsc(g.title || 'הנחיות שיווק')}</h2>
      <div class="mg-hero-badges">${statusBadge}${periodBadge}${countBadge}</div>
      ${(g.intro || []).length ? `<div class="mg-intro">${g.intro.map(p => `<p>${p}</p>`).join('')}</div>` : ''}
      ${updated}
      ${(sourceBtn || adminActions) ? `<div class="mg-hero-actions">${sourceBtn}${adminActions}</div>` : ''}
    </div>
    ${(g.sections || []).length > 1 ? `<nav class="mg-toc" aria-label="תוכן עניינים">
      ${g.sections.map(s => `<button type="button" onclick="mgScrollTo(${Number(s.num) || 0}, this)"><span class="mg-toc-num">${mgEsc(s.num)}</span>${mgEsc(s.title)}</button>`).join('')}
    </nav>` : ''}
    ${(g.sections || []).map(mgRenderSection).join('')}
    ${g.outro ? `<div class="mg-outro">${mgEsc(g.outro)}</div>` : ''}
  `;
}

/* גובה הסרגל העליון של האפליקציה בפועל (משתנה בין מכשירים) — כדי
   שתוכן העניינים הדביק יישב בדיוק מתחתיו ולא יוסתר. */
function mgSyncStickyOffset(){
  const bar = document.querySelector('#app-screen .topbar') || document.querySelector('.topbar');
  const h = bar ? Math.round(bar.getBoundingClientRect().height) : 57;
  document.documentElement.style.setProperty('--mg-topbar-h', h + 'px');
  return h;
}

/* האלמנט שבאמת נגלל: לפעמים זה החלון, ובאפליקציה הזו לרוב ה-body
   (בגלל overflow-x:hidden על html/body). מחפשים כלפי מעלה. */
function mgScrollParent(el){
  let n = el.parentElement;
  while(n && n !== document.documentElement){
    const oy = getComputedStyle(n).overflowY;
    if((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 1) return n;
    n = n.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}

/* קפיצה לסעיף מתוכן העניינים. גלילה ידנית (ולא scrollIntoView), כי
   בחלק מהטלפונים scrollIntoView לא עובד כשה-body הוא מה שנגלל. */
function mgScrollTo(num, btn){
  const el = document.getElementById('mg-sec-' + num);
  if(!el) return;
  const topbarH = mgSyncStickyOffset();
  const toc = document.querySelector('.mg-toc');
  const offset = topbarH + (toc ? toc.getBoundingClientRect().height : 0) + 10;
  const sc = mgScrollParent(el);
  const isRoot = (sc === document.scrollingElement || sc === document.documentElement || sc === document.body && sc.scrollHeight <= sc.clientHeight + 1);
  const scTop = isRoot ? 0 : sc.getBoundingClientRect().top;
  const target = Math.max(0, sc.scrollTop + el.getBoundingClientRect().top - scTop - offset);
  const before = sc.scrollTop;
  try { sc.scrollTo({ top: target, behavior: 'smooth' }); } catch(e){ sc.scrollTop = target; }
  if(isRoot){ try { window.scrollTo({ top: target, behavior: 'smooth' }); } catch(e){} }
  /* רשת ביטחון: אם הגלילה החלקה לא זזה בכלל — קופצים מיד */
  setTimeout(function(){
    if(Math.abs(sc.scrollTop - before) < 2 && Math.abs(target - before) > 2){
      sc.scrollTop = target;
      if(isRoot) window.scrollTo(0, target);
    }
  }, 350);

  /* מסמנים את הכפתור שנלחץ ומביאים אותו לאמצע הפס האופקי */
  if(toc){
    toc.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
    if(btn){
      const tr = toc.getBoundingClientRect(), br = btn.getBoundingClientRect();
      toc.scrollLeft += (br.left + br.width / 2) - (tr.left + tr.width / 2);
    }
  }
}

function mgOpenImage(url){
  if(!url) return;
  const box = document.createElement('div');
  box.className = 'mg-lightbox';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'תמונה מוגדלת');
  box.innerHTML = `<img src="${mgEsc(url)}" alt=""><button type="button" aria-label="סגירה">×</button>`;
  function close(){ box.remove(); document.removeEventListener('keydown', onKey); }
  function onKey(e){ if(e.key === 'Escape') close(); }
  box.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.appendChild(box);
}

function mgCopy(text){
  const done = () => toast('הועתק: ' + text);
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(done).catch(() => toast(text));
  } else {
    toast(text);
  }
}

/* ============================================================
   מסך 1: הסניפים
============================================================ */
function viewMarketingGuidelines(){
  mgInjectStyleOnce();
  /* האפליקציה מציירת מחדש את המסך כשמגיעים עדכונים מ-Firestore — שומרים
     קודם את מה שהוקלד במצב עריכה, כדי שלא יאבד */
  if(mgEdit && mgEdit.target === 'published') mgEditCollect();
  setTimeout(mgLoad, 0);
  return `
    <div class="page-head">
      <h1>הנחיות שיווק</h1>
      <p>מבצעים, תצוגות ושילוט לתקופה · מחלקת שיווק</p>
    </div>
    <div id="mg-root"><div class="mg-empty">טוען…</div></div>
  `;
}

function mgLoad(force){
  if(!document.getElementById('mg-root')) return;
  if(mgState.list && !force){ mgRenderView(); return; }
  if(typeof firebaseReady === 'undefined' || !firebaseReady || !db){
    document.getElementById('mg-root').innerHTML = '<div class="card"><div class="mg-empty">אין חיבור לשרת כרגע.</div></div>';
    return;
  }
  if(mgState.loading) return;
  mgState.loading = true;
  db.collection(MG_COLLECTION).orderBy('periodStart', 'desc').limit(24).get()
    .then(function(snap){
      mgState.list = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
      mgState.error = null;
    })
    .catch(function(err){
      console.error('mgLoad failed', err);
      mgState.error = err.message || String(err);
    })
    .finally(function(){
      mgState.loading = false;
      mgRenderView();
    });
}

/* ברירת מחדל: ההנחיות שבתוקף היום; אחרת הקרובות שיתחילו; אחרת האחרונות */
function mgDefaultId(list){
  const now = Date.now();
  const live = list.find(g => { const s = mgToDate(g.periodStart), e = mgToDate(g.periodEnd); return s && e && s.getTime() <= now && now <= e.getTime(); });
  if(live) return live.id;
  return list[0] ? list[0].id : null;
}

function mgRenderView(){
  const root = document.getElementById('mg-root');
  if(!root) return;
  const isAdmin = mgCanManage();
  if(mgState.error){
    root.innerHTML = `<div class="card"><div class="mg-empty">שגיאה בטעינת ההנחיות: ${mgEsc(mgState.error)}</div></div>`;
    return;
  }
  const list = mgState.list || [];
  if(!list.length){
    root.innerHTML = `<div class="card"><div class="mg-empty">
      עדיין לא פורסמו הנחיות שיווק.
      ${isAdmin ? `<div style="margin-top:14px;"><button type="button" class="mg-btn primary" onclick="goTo('${MG_UPLOAD_VIEW}')">⬆️ העלאת קובץ Word</button></div>` : ''}
    </div></div>`;
    return;
  }
  if(!mgState.selectedId || !list.some(g => g.id === mgState.selectedId)) mgState.selectedId = mgDefaultId(list);
  const g = list.find(x => x.id === mgState.selectedId) || list[0];
  const archiveHtml = list.length > 1 ? `<div class="mg-archive" role="tablist" aria-label="חודשים קודמים">
    ${list.map(x => `<button type="button" role="tab" aria-selected="${x.id === g.id}" class="${x.id === g.id ? 'active' : ''}" onclick="mgSelect('${mgEsc(x.id)}')">${mgEsc(mgShortLabel(x))}</button>`).join('')}
  </div>` : '';
  const editing = !!(mgEdit && mgEdit.target === 'published' && mgEdit.id === g.id && isAdmin);
  root.innerHTML = editing
    ? mgRenderGuideline(mgEdit.g, { isAdmin, edit: true })
    : mgRenderGuideline(g, { isAdmin, archiveHtml });
  if(editing) mgBindEditor(root);
  mgSyncStickyOffset();
}

function mgShortLabel(g){
  const t = String(g.title || '').replace(/^הנחיות\s*שיווק\s*/, '').trim();
  return t || g.periodText || 'הנחיות';
}

function mgSelect(id){
  mgState.selectedId = id;
  mgRenderView();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function mgDelete(id){
  if(typeof previewMode !== 'undefined' && previewMode){ toast('פעולה לא זמינה במצב תצוגה'); return; }
  const g = (mgState.list || []).find(x => x.id === id);
  if(!g) return;
  if(!confirm(`למחוק את "${g.title}"? הסניפים לא יראו אותו יותר.`)) return;
  db.collection(MG_COLLECTION).doc(id).delete()
    .then(function(){
      toast('ההנחיות נמחקו');
      mgState.selectedId = null;
      mgLoad(true);
    })
    .catch(err => toast('שגיאה במחיקה: ' + err.message));
}

/* ============================================================
   מסך 2: העלאה (שיווק)
============================================================ */
let _mgMammothPromise = null;
function mgLoadMammoth(){
  if(typeof mammoth !== 'undefined') return Promise.resolve();
  if(_mgMammothPromise) return _mgMammothPromise;
  _mgMammothPromise = new Promise(function(resolve, reject){
    let i = 0;
    (function tryNext(){
      if(i >= MG_MAMMOTH_URLS.length){ _mgMammothPromise = null; reject(new Error('טעינת רכיב קריאת ה-Word נכשלה')); return; }
      const s = document.createElement('script');
      s.src = MG_MAMMOTH_URLS[i++];
      s.onload = () => (typeof mammoth !== 'undefined') ? resolve() : tryNext();
      s.onerror = () => { s.remove(); tryNext(); };
      document.head.appendChild(s);
    })();
  });
  return _mgMammothPromise;
}

function viewMarketingGuidelinesUpload(){
  mgInjectStyleOnce();
  if(!mgCanManage()){
    return `<div class="card"><div class="mg-empty">המסך הזה זמין רק לצוות השיווק.</div></div>`;
  }
  setTimeout(mgRenderUploadUI, 0);
  return `
    <div class="page-head">
      <h1>העלאת הנחיות שיווק</h1>
      <p>ניהול תוכן · שיווק · מעלים את קובץ ה-Word כמו שהוא</p>
    </div>
    <div id="mg-upload-root"></div>
  `;
}

function mgRenderUploadUI(){
  const root = document.getElementById('mg-upload-root');
  if(!root) return;
  if(mgEdit && mgEdit.target === 'preview') mgEditCollect();
  const p = mgUpload.parsed;
  root.innerHTML = `
    <div class="mg-drop" id="mgDropZone" role="button" tabindex="0" aria-label="בחירת קובץ Word">
      <div class="mg-drop-title">${mgUpload.file ? '📄 <bdi>' + mgEsc(mgUpload.file.name) + '</bdi>' :'גררו לכאן את קובץ ה-Word של ההנחיות'}</div>
      <div class="mg-drop-hint">${mgUpload.file ? 'לחצו כדי להחליף קובץ' : 'או לחצו לבחירה · קובץ ‎.docx אחד'}</div>
      <input type="file" id="mgFileInput" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" style="display:none">
    </div>
    <div class="mg-status" id="mgStatus"></div>
    <div id="mgFormRoot"></div>
    <div id="mgPreviewRoot"></div>
    <div id="mgPublishedRoot"></div>
  `;
  const dz = document.getElementById('mgDropZone');
  const input = document.getElementById('mgFileInput');
  dz.addEventListener('click', () => input.click());
  dz.addEventListener('keydown', e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); input.click(); } });
  input.addEventListener('change', e => { if(e.target.files[0]) mgHandleFile(e.target.files[0]); });
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.classList.remove('drag');
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if(f) mgHandleFile(f);
  });
  if(p) mgRenderParsed();
  mgRenderPublishedList();
}

function mgSetStatus(kind, html){
  const el = document.getElementById('mgStatus');
  if(!el) return;
  el.className = 'mg-status show ' + kind;
  el.innerHTML = (kind === 'busy' ? '<span class="mg-spinner"></span>' : '') + html;
}
function mgClearStatus(){
  const el = document.getElementById('mgStatus');
  if(el){ el.className = 'mg-status'; el.innerHTML = ''; }
}

function mgResetUpload(){
  if(mgEdit && mgEdit.target === 'preview') mgEdit = null;
  Object.keys(mgUpload.images || {}).forEach(k => { try { URL.revokeObjectURL(mgUpload.images[k].previewUrl); } catch(e){} });
  mgUpload = { file: null, parsed: null, images: {}, busy: false };
}

function mgHandleFile(file){
  if(mgUpload.busy) return;
  if(!/\.docx$/i.test(file.name)){
    toast(/\.doc$/i.test(file.name) ? 'זה קובץ Word ישן (.doc). שמרו אותו ב-Word בתור .docx ונסו שוב.' : 'צריך קובץ Word בפורמט .docx');
    return;
  }
  mgResetUpload();
  mgUpload.file = file;
  mgUpload.busy = true;
  mgRenderUploadUI();
  mgSetStatus('busy', 'קורא את הקובץ…');
  let counter = 0;
  mgLoadMammoth()
    .then(() => file.arrayBuffer())
    .then(function(buf){
      return mammoth.convertToHtml({ arrayBuffer: buf }, {
        styleMap: [
          "p[style-name='Title'] => p.mg-doc-title:fresh",
          "p[style-name='Subtitle'] => p.mg-doc-subtitle:fresh",
          "p[style-name='caption'] => p.mg-caption:fresh",
          "p[style-name='Caption'] => p.mg-caption:fresh"
        ],
        convertImage: mammoth.images.imgElement(function(image){
          return image.read('base64').then(function(b64){
            const key = 'img' + (++counter);
            const bin = atob(b64);
            const bytes = new Uint8Array(bin.length);
            for(let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            const blob = new Blob([bytes], { type: image.contentType || 'image/png' });
            mgUpload.images[key] = { blob, contentType: blob.type, previewUrl: URL.createObjectURL(blob) };
            return { src: 'mgimg:' + key };
          });
        })
      });
    })
    .then(function(result){
      const parsed = mgParseHtml(result.value, file.name);
      /* תצוגה מקדימה: מחליפים את מזהי התמונות בכתובות זמניות מקומיות */
      parsed.sections.forEach(s => s.images.forEach(img => {
        const key = img.src.replace(/^mgimg:/, '');
        img.key = key;
        img.url = mgUpload.images[key] ? mgUpload.images[key].previewUrl : '';
      }));
      mgUpload.parsed = parsed;
      mgUpload.busy = false;
      mgRenderParsed();
      const imgCount = Object.keys(mgUpload.images).length;
      if(parsed.warnings.length) mgSetStatus('warn', '⚠️ ' + parsed.warnings.map(mgEsc).join('<br>⚠️ '));
      else mgSetStatus('success', `✅ זוהו ${parsed.sections.length} סעיפים ו-${imgCount} תמונות. בדקו את התצוגה המקדימה ולחצו "פרסם לסניפים".`);
    })
    .catch(function(err){
      console.error('mgHandleFile failed', err);
      mgUpload.busy = false;
      mgSetStatus('error', '⚠️ לא הצלחתי לקרוא את הקובץ: ' + mgEsc(err.message || String(err)));
    });
}

function mgRenderParsed(){
  const p = mgUpload.parsed;
  const formRoot = document.getElementById('mgFormRoot');
  const prevRoot = document.getElementById('mgPreviewRoot');
  if(!p || !formRoot || !prevRoot) return;
  const existing = (mgState.list || []).find(g => g.periodText && p.periodText && g.periodText === p.periodText);
  formRoot.innerHTML = `
    <div class="mg-form">
      <div class="field">
        <label for="mgTitle">כותרת</label>
        <input id="mgTitle" type="text" value="${mgEsc(p.title)}" oninput="mgUpload.parsed.title=this.value;mgRenderPreviewOnly()">
      </div>
      <div class="mg-form-row">
        <div class="field">
          <label for="mgStart">בתוקף מתאריך</label>
          <input id="mgStart" type="date" value="${mgDateInputValue(p.periodStart)}" onchange="mgUpdatePeriodFromInputs()">
        </div>
        <div class="field">
          <label for="mgEnd">עד תאריך</label>
          <input id="mgEnd" type="date" value="${mgDateInputValue(p.periodEnd)}" onchange="mgUpdatePeriodFromInputs()">
        </div>
      </div>
      <label class="mg-check"><input type="checkbox" id="mgSendPush" checked> לשלוח התראת Push לסניפים על ההנחיות החדשות</label>
      ${existing ? `<div class="mg-status show warn" style="margin:12px 0 0;">⚠️ כבר פורסמו הנחיות לתקופה ${mgEsc(existing.periodText)}. פרסום יחליף אותן.</div>` : ''}
      <div class="mg-hero-actions" style="margin-top:14px;">
        <button type="button" class="mg-btn primary" id="mgPublishBtn" onclick="mgPublish()">✅ פרסם לסניפים</button>
        <button type="button" class="mg-btn" onclick="mgStartEdit('preview')">✏️ עריכת טקסטים לפני פרסום</button>
        <button type="button" class="mg-btn" onclick="mgResetUpload();mgRenderUploadUI()">ביטול</button>
      </div>
    </div>
  `;
  mgRenderPreviewOnly();
}

function mgRenderPreviewOnly(){
  const prevRoot = document.getElementById('mgPreviewRoot');
  const p = mgUpload.parsed;
  if(!prevRoot || !p) return;
  if(mgEdit && mgEdit.target === 'preview'){
    prevRoot.innerHTML = `<div class="mg-preview-label">עריכה לפני פרסום</div>` + mgRenderGuideline(mgEdit.g, { preview: true, edit: true, noHeroMeta: true });
    mgBindEditor(prevRoot);
    return;
  }
  prevRoot.innerHTML = `<div class="mg-preview-label">תצוגה מקדימה — כך הסניפים יראו את זה</div>` + mgRenderGuideline(p, { preview: true });
}

function mgUpdatePeriodFromInputs(){
  const p = mgUpload.parsed;
  if(!p) return;
  const s = mgFromDateInput(document.getElementById('mgStart').value, false);
  const e = mgFromDateInput(document.getElementById('mgEnd').value, true);
  p.periodStart = s;
  p.periodEnd = e;
  if(s && e) p.periodText = mgPeriodTextFromDates(s, e);
  if(mgEdit && mgEdit.target === 'preview') mgEditCollect();
  mgRenderPreviewOnly();
}

/* תמונות גדולות מאוד מוקטנות לפני העלאה (Cloudinary מגביל גודל קובץ) */
function mgShrinkIfNeeded(blob){
  const LIMIT = 8 * 1024 * 1024;
  if(blob.size <= LIMIT || !/^image\/(png|jpe?g|webp)$/.test(blob.type)) return Promise.resolve(blob);
  return new Promise(function(resolve){
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = function(){
      const scale = Math.min(1, 2400 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => resolve(b || blob), 'image/jpeg', 0.88);
    };
    img.onerror = function(){ URL.revokeObjectURL(url); resolve(blob); };
    img.src = url;
  });
}

function mgUploadImage(key, idx){
  const item = mgUpload.images[key];
  if(!item) return Promise.resolve('');
  return mgShrinkIfNeeded(item.blob).then(function(b){
    const ext = (b.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
    const file = new File([b], `marketing-guidelines-${Date.now()}-${idx}.${ext}`, { type: b.type });
    return uploadFileToCloudinary(file).then(r => r.secure_url);
  });
}

function mgPublish(){
  if(typeof previewMode !== 'undefined' && previewMode){ toast('פעולה לא זמינה במצב תצוגה'); return; }
  if(mgEdit && mgEdit.target === 'preview' && !mgEditApply()) return;
  const p = mgUpload.parsed;
  if(!p || mgUpload.busy) return;
  if(!p.sections.length && !confirm('לא זוהו סעיפים בקובץ. לפרסם בכל זאת?')) return;
  if(!p.periodStart || !p.periodEnd){
    if(!confirm('לא הוגדר טווח תאריכים. בלי תאריכים ההנחיות לא יסומנו "בתוקף". להמשיך?')) return;
  }
  const sendPush = !!(document.getElementById('mgSendPush') || {}).checked;
  const btn = document.getElementById('mgPublishBtn');
  if(btn) btn.disabled = true;
  mgUpload.busy = true;

  const allImages = [];
  p.sections.forEach(s => s.images.forEach(img => allImages.push(img)));
  let done = 0;
  const total = allImages.length;
  mgSetStatus('busy', total ? `מעלה תמונות… 0 מתוך ${total}` : 'שומר…');

  /* העלאה בקבוצות של 3 במקביל */
  const queue = allImages.slice();
  function worker(){
    const img = queue.shift();
    if(!img) return Promise.resolve();
    const idx = allImages.indexOf(img);
    return mgUploadImage(img.key, idx).then(function(url){
      img.finalUrl = url;
      done++;
      mgSetStatus('busy', `מעלה תמונות… ${done} מתוך ${total}`);
      return worker();
    });
  }
  const workers = [];
  for(let i = 0; i < Math.min(3, total); i++) workers.push(worker());

  /* הקובץ המקורי — להורדה מתוך המסך. אם נכשל, ממשיכים בלעדיו. */
  const sourceUpload = uploadFileToCloudinary(mgUpload.file).then(r => r.secure_url).catch(function(err){
    console.warn('העלאת הקובץ המקורי נכשלה — ממשיכים בלעדיו', err);
    return null;
  });

  Promise.all(workers)
    .then(() => sourceUpload)
    .then(function(sourceUrl){
      mgSetStatus('busy', 'שומר ומפרסם…');
      const sections = mgSerializeSections(p.sections, i => i.finalUrl);
      const now = firebase.firestore.FieldValue.serverTimestamp();
      const data = {
        title: (p.title || 'הנחיות שיווק').trim(),
        periodText: p.periodText || '',
        periodStart: p.periodStart || null,
        periodEnd: p.periodEnd || null,
        intro: p.intro || [],
        outro: p.outro || '',
        sections,
        sectionCount: sections.length,
        imageCount: sections.reduce((n, s) => n + s.images.length, 0),
        sourceFileName: mgUpload.file.name,
        sourceFileUrl: sourceUrl || null,
        department: 'marketing',
        createdBy: currentUserEmail || null,
        createdAt: now,
        updatedAt: now
      };
      const replaced = (mgState.list || []).filter(g => g.periodText && data.periodText && g.periodText === data.periodText).map(g => g.id);
      return db.collection(MG_COLLECTION).add(data).then(function(ref){
        return Promise.all(replaced.map(id => db.collection(MG_COLLECTION).doc(id).delete().catch(() => {}))).then(() => ({ ref, data }));
      });
    })
    .then(function(res){
      const title = res.data.title;
      if(typeof postFeedEvent === 'function'){
        postFeedEvent({
          department: 'marketing',
          view: MG_VIEW,
          title: 'הנחיות שיווק חדשות: ' + title,
          body: `${res.data.sectionCount} סעיפים${res.data.periodText ? ' · ' + res.data.periodText : ''}`,
          icon: '📑'
        });
      }
      if(sendPush){
        db.collection('broadcasts').add({
          title: 'הנחיות שיווק חדשות 📑',
          body: title + ' — כנסו ל-NIZAT HUB ← שיווק ← הנחיות שיווק',
          length: 'short',
          department: 'marketing',
          createdBy: currentUserEmail || 'unknown',
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(err => console.warn('שליחת Push נכשלה', err));
      }
      mgResetUpload();
      mgState.list = null;
      mgState.selectedId = res.ref.id;
      toast('ההנחיות פורסמו לסניפים!');
      goToDeptScreen('marketing', MG_VIEW);
    })
    .catch(function(err){
      console.error('mgPublish failed', err);
      mgUpload.busy = false;
      if(btn) btn.disabled = false;
      mgSetStatus('error', '⚠️ הפרסום נכשל: ' + mgEsc(err.message || String(err)) +
        (/permission|insufficient/i.test(err.message || '') ? '<br>ייתכן שחסר חוק ל-marketingGuidelines ב-firestore.rules.' : ''));
    });
}

/* רשימת מה שכבר פורסם, בתחתית מסך ההעלאה */
function mgRenderPublishedList(){
  const root = document.getElementById('mgPublishedRoot');
  if(!root) return;
  if(!mgState.list){
    if(typeof firebaseReady !== 'undefined' && firebaseReady && db && !mgState.loading){
      mgState.loading = true;
      db.collection(MG_COLLECTION).orderBy('periodStart', 'desc').limit(24).get()
        .then(snap => { mgState.list = snap.docs.map(d => Object.assign({ id: d.id }, d.data())); })
        .catch(() => { mgState.list = []; })
        .finally(() => { mgState.loading = false; mgRenderPublishedList(); if(mgUpload.parsed) mgRenderParsed(); });
    }
    return;
  }
  if(!mgState.list.length || mgUpload.parsed){ root.innerHTML = ''; return; }
  root.innerHTML = `
    <div class="mg-preview-label">פורסמו עד עכשיו</div>
    <div class="card" style="padding:4px 14px;">
      ${mgState.list.map(g => `
        <div class="mg-published-row">
          <div class="t">${mgEsc(g.title)}<div class="m">${mgEsc(g.periodText || '')}${g.sectionCount ? ' · ' + g.sectionCount + ' סעיפים' : ''}</div></div>
          <button type="button" class="mg-btn" onclick="mgState.selectedId='${mgEsc(g.id)}';goToDeptScreen('marketing','${MG_VIEW}')">צפייה</button>
        </div>`).join('')}
    </div>
  `;
}

/* ============================================================
   מצב עריכה — תיקון כותרות וטקסטים אחרי ההעלאה
   ------------------------------------------------------------
   "✏️ עריכה" (במסך ההנחיות, לצוות השיווק) או "✏️ עריכת טקסטים לפני
   פרסום" (במסך ההעלאה) הופכים כל כותרת וטקסט לניתנים לעריכה במקום.
   עובדים על עותק (mgEdit.g); שום דבר לא נשמר עד "שמירת שינויים".
   מה אפשר לעשות:
     • לשנות כותרת ראשית, תאריכי תוקף, פסקאות פתיחה וחתימה
     • לשנות כותרת סעיף, תוויות ("המבצע:"), טקסטים, תגיות, קישורים
       וכיתובי תמונות
     • לתקן מחיר / מחיר קודם / אחוז הנחה / מק"ט / תוקף שמוצגים בראש סעיף
     • למחוק פסקה, תמונה או סעיף שלם; להוסיף פסקה או סעיף חדש
   הטקסט נשמר נקי (רק הדגשה וקישורים), כך שהדבקה מ-Word או מוואטסאפ לא
   מכניסה עיצוב זר.
============================================================ */
function mgClone(g){
  const c = JSON.parse(JSON.stringify(g, function(k, v){ return (k === 'periodStart' || k === 'periodEnd') ? undefined : v; }));
  c.periodStart = mgToDate(g.periodStart);
  c.periodEnd = mgToDate(g.periodEnd);
  (c.sections || []).forEach(sec => {
    sec.blocks = sec.blocks || [];
    sec.images = sec.images || [];
    sec.facts = sec.facts || { skus: [] };
  });
  c.intro = c.intro || [];
  return c;
}

function mgIsEditing(){ return !!mgEdit; }

function mgStartEdit(target, id){
  if(typeof previewMode !== 'undefined' && previewMode){ toast('פעולה לא זמינה במצב תצוגה'); return; }
  if(target === 'published'){
    const g = (mgState.list || []).find(x => x.id === id);
    if(!g) return;
    mgEdit = { target, id, g: mgClone(g), dirty: false };
    mgRenderView();
    window.scrollTo(0, 0);
    try { mgScrollParent(document.getElementById('mg-root')).scrollTop = 0; } catch(e){}
  } else if(target === 'preview'){
    if(!mgUpload.parsed) return;
    mgEdit = { target, id: null, g: mgClone(mgUpload.parsed), dirty: false };
    mgRenderPreviewOnly();
  }
}

function mgEditCancel(){
  if(!mgEdit) return;
  mgEditCollect();
  if(mgEdit.dirty && !confirm('לבטל את השינויים שלא נשמרו?')) return;
  const target = mgEdit.target;
  mgEdit = null;
  if(target === 'published') mgRenderView(); else mgRenderPreviewOnly();
}

/* ---------- ציור מצב העריכה ---------- */
function mgEd(attrs, html, ph, single){
  return `<div class="mg-ed${single ? ' single' : ''}" contenteditable="true" ${attrs} data-ph="${mgEsc(ph || 'הקלידו כאן…')}"${single ? ' data-single="1"' : ''}>${html || ''}</div>`;
}
function mgDelBtn(onclick, title){
  return `<button type="button" class="mg-ed-del" onclick="${onclick}" title="${mgEsc(title)}" aria-label="${mgEsc(title)}">🗑</button>`;
}

function mgRenderEditFacts(sec, si){
  const f = sec.facts || {};
  const inp = (key, label, val, ph, wide) => `<label class="mg-ef${wide ? ' wide' : ''}"><span>${label}</span>
    <input type="text" data-ed="fact" data-s="${si}" data-f="${key}" value="${mgEsc(val == null ? '' : val)}" placeholder="${mgEsc(ph)}"></label>`;
  return `<details class="mg-edit-facts"${(f.price || f.percent || (f.skus || []).length || f.validity) ? ' open' : ''}>
    <summary>💲 מחיר, מק"ט ותוקף שמוצגים בראש הסעיף</summary>
    <div class="mg-ef-grid">
      ${inp('price', 'מחיר מבצע', f.price, 'למשל 59.90')}
      ${inp('oldPrice', 'מחיר רגיל', f.oldPrice, 'למשל 94.50')}
      ${inp('unit', 'ליחידה', f.unit, 'למשל ל־100 גרם')}
      ${inp('percent', '% הנחה', f.percent, 'למשל 40')}
      ${inp('skus', 'מק"ט / קוד מוצר', (f.skus || []).join(', '), 'אפשר כמה, מופרדים בפסיק', true)}
      ${inp('validity', 'בתוקף', f.validity, 'למשל 1-30.11.26')}
    </div>
    <div class="mg-ef-hint">שדה ריק = לא מוצג. המחיר מוצג רק אם מולא "מחיר מבצע".</div>
  </details>`;
}

function mgRenderEditBlock(b, si, bi){
  const del = mgDelBtn(`mgEditDeleteBlock(${si},${bi})`, 'מחיקת הפסקה');
  const at = `data-s="${si}" data-b="${bi}"`;
  if(b.t === 'label'){
    return `<div class="mg-block ${mgEsc(b.kind || 'other')} mg-edit-block">${del}
      <div class="mg-block-label"><span aria-hidden="true">${MG_LABEL_ICONS[b.kind] || MG_LABEL_ICONS.other}</span>
        ${mgEd(`data-ed="bLabel" ${at}`, mgEsc(b.label), 'תווית (למשל: המבצע)', true)}</div>
      ${mgEd(`data-ed="bHtml" ${at}`, b.html, 'טקסט')}
    </div>`;
  }
  if(b.t === 'chips'){
    return `<div class="mg-edit-block mg-edit-plain">${del}
      <div class="mg-ef-hint" style="margin:0 0 4px;">תגיות — מפרידים ביניהן בנקודה-פסיק ( ; )</div>
      ${mgEd(`data-ed="bChips" ${at}`, mgEsc((b.items || []).join('; ')), 'מותג א; מותג ב; מותג ג')}
    </div>`;
  }
  if(b.t === 'link'){
    return `<div class="mg-edit-block mg-edit-plain">${del}
      <div class="mg-ef-hint" style="margin:0 0 4px;">📂 קישור</div>
      ${mgEd(`data-ed="bText" ${at}`, mgEsc(b.text), 'הטקסט של הכפתור', true)}
      <input type="url" class="mg-ed-input" data-ed="bHref" ${at} value="${mgEsc(b.href)}" placeholder="https://…" dir="ltr">
    </div>`;
  }
  if(b.t === 'list' || b.t === 'table'){
    return `<div class="mg-edit-block mg-edit-plain">${del}
      <div class="mg-ef-hint" style="margin:0 0 4px;">${b.t === 'list' ? 'רשימה' : 'טבלה'} מהקובץ — אפשר למחוק, אבל לא לערוך כאן</div>
      ${mgRenderBlock(b)}
    </div>`;
  }
  if(b.t === 'caption'){
    return `<div class="mg-edit-block mg-edit-plain">${del}
      ${mgEd(`data-ed="bCaption" ${at}`, b.html, 'כיתוב לתמונות')}
    </div>`;
  }
  return `<div class="mg-edit-block mg-edit-plain">${del}
    ${mgEd(`data-ed="bHtml" ${at}`, b.html, 'טקסט')}
  </div>`;
}

function mgRenderEditSection(sec, si){
  return `<section class="mg-sec mg-edit-sec" id="mg-sec-${mgEsc(sec.num)}">
    <div class="mg-sec-head">
      <div class="mg-sec-num">${mgEsc(sec.num)}</div>
      <div class="mg-sec-title" style="flex:1;">${mgEd(`data-ed="sTitle" data-s="${si}"`, mgEsc(sec.title), 'כותרת הסעיף', true)}</div>
      <button type="button" class="mg-btn danger mg-btn-sm" onclick="mgEditDeleteSection(${si})">🗑 מחיקת סעיף</button>
    </div>
    ${mgRenderEditFacts(sec, si)}
    ${(sec.blocks || []).map((b, bi) => mgRenderEditBlock(b, si, bi)).join('')}
    <button type="button" class="mg-ed-add" onclick="mgEditAddBlock(${si})">＋ הוספת פסקה</button>
    ${(sec.images || []).length ? `<div class="mg-gallery mg-edit-gallery">
      ${sec.images.map((img, ii) => `<figure class="mg-img mg-edit-img">
        ${mgDelBtn(`mgEditDeleteImage(${si},${ii})`, 'מחיקת התמונה')}
        <img src="${mgEsc(mgImgSrc(img.url || img.src, 600))}" alt="">
        <figcaption>${mgEd(`data-ed="iCap" data-s="${si}" data-i="${ii}"`, mgEsc(img.caption), 'כיתוב (לא חובה)', true)}</figcaption>
      </figure>`).join('')}
    </div>` : ''}
  </section>`;
}

/* opts.noHeroMeta: במסך ההעלאה הכותרת והתאריכים נערכים בטופס שמעל */
function mgRenderEditGuideline(g, opts){
  const meta = opts.noHeroMeta ? '' : `
      ${mgEd('data-ed="title"', mgEsc(g.title), 'כותרת ההנחיות', true).replace('class="mg-ed single"', 'class="mg-ed single mg-ed-h2"')}
      <div class="mg-form-row" style="margin:10px 0 12px;">
        <div class="field"><label>בתוקף מתאריך</label><input type="date" data-ed="pStart" value="${mgDateInputValue(g.periodStart)}"></div>
        <div class="field"><label>עד תאריך</label><input type="date" data-ed="pEnd" value="${mgDateInputValue(g.periodEnd)}"></div>
      </div>`;
  return `
    <div class="mg-editbar" role="region" aria-label="סרגל עריכה">
      <span class="mg-editbar-text">✏️ מצב עריכה — לחצו על כל טקסט כדי לשנות אותו</span>
      <span class="mg-editbar-actions">
        <button type="button" class="mg-btn primary" id="mgEditSaveBtn" onclick="mgEditSave()">💾 ${opts.preview ? 'סיום עריכה' : 'שמירת שינויים'}</button>
        <button type="button" class="mg-btn" onclick="mgEditCancel()">ביטול</button>
      </span>
    </div>
    <div class="mg-hero mg-edit-hero">
      ${meta}
      <div class="mg-ef-hint" style="margin:0 0 4px;">פסקאות פתיחה</div>
      ${(g.intro || []).map((p, i) => `<div class="mg-edit-block mg-edit-plain">${mgDelBtn(`mgEditDeleteIntro(${i})`, 'מחיקת הפסקה')}${mgEd(`data-ed="intro" data-i="${i}"`, p, 'פסקת פתיחה')}</div>`).join('')}
      <button type="button" class="mg-ed-add" onclick="mgEditAddIntro()">＋ פסקת פתיחה</button>
    </div>
    ${(g.sections || []).map(mgRenderEditSection).join('')}
    <button type="button" class="mg-ed-add mg-ed-add-sec" onclick="mgEditAddSection()">＋ הוספת סעיף</button>
    <div class="mg-hero mg-edit-hero" style="margin-top:14px;">
      <div class="mg-ef-hint" style="margin:0 0 4px;">שורת סיום (חתימה)</div>
      ${mgEd('data-ed="outro"', mgEsc(g.outro), 'למשל: זמינה לכל שאלה, חודש מוצלח!', true)}
    </div>
  `;
}

/* הקלדה: Enter בשורה אחת לא שובר שורה; בטקסט רגיל — ירידת שורה נקייה.
   הדבקה תמיד כטקסט פשוט. כל שינוי מסמן "יש שינויים שלא נשמרו". */
function mgBindEditor(root){
  root.querySelectorAll('[contenteditable="true"]').forEach(function(el){
    el.addEventListener('keydown', function(e){
      if(e.key !== 'Enter') return;
      e.preventDefault();
      if(el.dataset.single) return;
      document.execCommand('insertLineBreak');
    });
    el.addEventListener('paste', function(e){
      e.preventDefault();
      let text = (e.clipboardData || window.clipboardData).getData('text/plain') || '';
      if(el.dataset.single) text = text.replace(/\s*\n\s*/g, ' ');
      if(!document.execCommand('insertText', false, text)){
        const sel = window.getSelection();
        if(sel.rangeCount){ sel.deleteFromDocument(); sel.getRangeAt(0).insertNode(document.createTextNode(text)); }
      }
    });
    el.addEventListener('input', function(){ if(mgEdit) mgEdit.dirty = true; });
  });
  root.querySelectorAll('input[data-ed]').forEach(function(inp){
    inp.addEventListener('input', function(){ if(mgEdit) mgEdit.dirty = true; });
  });
}

/* ---------- קריאת מה שהוקלד אל עותק העבודה ---------- */
function mgPlain(el){ return (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim(); }
function mgRich(el){
  return mgCleanInline(el).replace(/(<br>\s*)+$/g, '').replace(/^(\s*<br>)+/g, '').trim();
}

function mgEditCollect(){
  if(!mgEdit) return;
  const g = mgEdit.g;
  const root = mgEdit.target === 'published' ? document.getElementById('mg-root') : document.getElementById('mgPreviewRoot');
  if(!root || !root.querySelector('[data-ed]')) return;
  root.querySelectorAll('[data-ed]').forEach(function(el){
    const kind = el.dataset.ed;
    const si = el.dataset.s != null ? +el.dataset.s : null;
    const bi = el.dataset.b != null ? +el.dataset.b : null;
    const sec = si != null ? g.sections[si] : null;
    const blk = (sec && bi != null) ? sec.blocks[bi] : null;
    switch(kind){
      case 'title': g.title = mgPlain(el); break;
      case 'outro': g.outro = mgPlain(el); break;
      case 'intro': g.intro[+el.dataset.i] = mgRich(el); break;
      case 'pStart': g.periodStart = mgFromDateInput(el.value, false); break;
      case 'pEnd': g.periodEnd = mgFromDateInput(el.value, true); break;
      case 'sTitle': if(sec) sec.title = mgPlain(el); break;
      case 'bLabel': if(blk) blk.label = mgPlain(el).replace(/:\s*$/, ''); break;
      case 'bHtml': if(blk) blk.html = mgRich(el); break;
      case 'bCaption': if(blk) blk.html = mgEsc(mgPlain(el)); break;
      case 'bChips': if(blk) blk.items = mgPlain(el).split(/[;؛]/).map(x => x.trim()).filter(Boolean); break;
      case 'bText': if(blk) blk.text = mgPlain(el); break;
      case 'bHref': if(blk) blk.href = el.value.trim(); break;
      case 'iCap': if(sec && sec.images[+el.dataset.i]) sec.images[+el.dataset.i].caption = mgPlain(el); break;
      case 'fact': {
        if(!sec) break;
        sec.facts = sec.facts || {};
        const f = el.dataset.f, v = el.value.trim();
        if(f === 'skus') sec.facts.skus = v ? v.split(/[,\s]+/).map(x => x.replace(/[^\d]/g, '')).filter(Boolean) : [];
        else sec.facts[f] = v || null;
        break;
      }
    }
  });
}

/* ---------- הוספה ומחיקה ---------- */
function mgEditRerender(){
  if(!mgEdit) return;
  if(mgEdit.target === 'published') mgRenderView(); else mgRenderPreviewOnly();
}
function mgEditMutate(fn){
  mgEditCollect();
  fn(mgEdit.g);
  mgEdit.dirty = true;
  mgEditRenumber(mgEdit.g);
  mgEditRerender();
}
function mgEditRenumber(g){ (g.sections || []).forEach((s, i) => { s.num = i + 1; }); }

function mgEditDeleteBlock(si, bi){ mgEditMutate(g => g.sections[si].blocks.splice(bi, 1)); }
function mgEditDeleteImage(si, ii){
  if(!confirm('למחוק את התמונה מהסעיף?')) return;
  mgEditMutate(g => g.sections[si].images.splice(ii, 1));
}
function mgEditDeleteIntro(i){ mgEditMutate(g => g.intro.splice(i, 1)); }
function mgEditAddIntro(){ mgEditMutate(g => g.intro.push('')); }
function mgEditAddBlock(si){
  mgEditMutate(g => g.sections[si].blocks.push({ t: 'text', html: '' }));
  mgFocusLast(`[data-ed="bHtml"][data-s="${si}"]`);
}
function mgEditDeleteSection(si){
  mgEditCollect();
  const sec = mgEdit.g.sections[si];
  if(!confirm(`למחוק את סעיף ${sec.num} ("${sec.title}") כולל הטקסטים והתמונות שלו?`)) return;
  mgEditMutate(g => g.sections.splice(si, 1));
}
function mgEditAddSection(){
  mgEditMutate(g => g.sections.push({ num: 0, title: '', icon: '📌', facts: { skus: [] }, blocks: [{ t: 'text', html: '' }], images: [] }));
  mgFocusLast('[data-ed="sTitle"]');
}
function mgFocusLast(selector){
  setTimeout(function(){
    const all = document.querySelectorAll(selector);
    const el = all[all.length - 1];
    if(el){ el.focus(); try { el.scrollIntoView({ block: 'center' }); } catch(e){} }
  }, 30);
}

/* מנקה את עותק העבודה לפני שמירה: פסקאות ריקות נמחקות, תווית ריקה הופכת
   לטקסט רגיל, סוג התווית והאייקון של הסעיף מתעדכנים לפי הטקסט החדש. */
function mgEditNormalize(g){
  g.title = (g.title || '').trim() || 'הנחיות שיווק';
  g.intro = (g.intro || []).filter(p => mgHtmlToText(p));
  g.outro = (g.outro || '').trim();
  g.sections = (g.sections || []).filter(s => (s.title || '').trim() || (s.blocks || []).length || (s.images || []).length);
  g.sections.forEach(function(s){
    s.title = (s.title || '').trim() || 'סעיף';
    s.icon = mgSectionIcon(s.title);
    s.blocks = (s.blocks || []).filter(function(b){
      if(b.t === 'chips') return (b.items || []).length;
      if(b.t === 'link') return b.href && /^https?:/i.test(b.href);
      if(b.t === 'list' || b.t === 'table') return true;
      return mgHtmlToText(b.html);
    }).map(function(b){
      if(b.t === 'label'){
        if(!(b.label || '').trim()) return { t: 'text', html: b.html };
        b.kind = mgLabelKind(b.label);
      }
      if(b.t === 'link' && !(b.text || '').trim()) b.text = 'פתיחת הקישור';
      return b;
    });
    const f = s.facts || {};
    s.facts = {
      price: f.price || null, oldPrice: f.price ? (f.oldPrice || null) : null, unit: f.price ? (f.unit || null) : null,
      percent: f.percent || null, skus: f.skus || [], validity: f.validity || null
    };
  });
  mgEditRenumber(g);
  if(g.periodStart && g.periodEnd) g.periodText = mgPeriodTextFromDates(g.periodStart, g.periodEnd);
  return g;
}

/* הסעיפים במבנה שנשמר ב-Firestore (משותף לפרסום ולשמירת עריכה) */
function mgSerializeSections(sections, urlOf){
  return (sections || []).map(s => ({
    num: s.num,
    title: s.title,
    icon: s.icon || mgSectionIcon(s.title),
    facts: s.facts || { skus: [] },
    blocks: (s.blocks || []).map(b => {
      const o = { t: b.t };
      ['kind','label','html','href','text','items'].forEach(k => { if(b[k] !== undefined) o[k] = b[k]; });
      return o;
    }),
    images: (s.images || []).filter(i => urlOf(i)).map(i => ({ url: urlOf(i), caption: i.caption || '' }))
  }));
}

/* במסך ההעלאה: "סיום עריכה" מעביר את השינויים לטיוטה (לא מפרסם) */
function mgEditApply(){
  if(!mgEdit || mgEdit.target !== 'preview') return true;
  mgEditCollect();
  const g = mgEditNormalize(mgEdit.g);
  const p = mgUpload.parsed;
  p.intro = g.intro; p.outro = g.outro; p.sections = g.sections;
  mgEdit = null;
  return true;
}

function mgEditSave(){
  if(!mgEdit) return;
  if(typeof previewMode !== 'undefined' && previewMode){ toast('פעולה לא זמינה במצב תצוגה'); return; }
  if(mgEdit.target === 'preview'){
    mgEditApply();
    mgRenderPreviewOnly();
    toast('השינויים עודכנו בטיוטה — אפשר לפרסם');
    return;
  }
  mgEditCollect();
  const id = mgEdit.id;
  const g = mgEditNormalize(mgEdit.g);
  const sections = mgSerializeSections(g.sections, i => i.url);
  const data = {
    title: g.title,
    intro: g.intro,
    outro: g.outro,
    sections,
    sectionCount: sections.length,
    imageCount: sections.reduce((n, s) => n + s.images.length, 0),
    periodText: g.periodText || '',
    periodStart: g.periodStart || null,
    periodEnd: g.periodEnd || null,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy: currentUserEmail || null
  };
  const btn = document.getElementById('mgEditSaveBtn');
  if(btn){ btn.disabled = true; btn.textContent = 'שומר…'; }
  db.collection(MG_COLLECTION).doc(id).update(data)
    .then(function(){
      const item = (mgState.list || []).find(x => x.id === id);
      if(item) Object.assign(item, data, { updatedAt: new Date() });
      mgEdit = null;
      mgRenderView();
      toast('השינויים נשמרו');
    })
    .catch(function(err){
      console.error('mgEditSave failed', err);
      if(btn){ btn.disabled = false; btn.textContent = '💾 שמירת שינויים'; }
      toast('השמירה נכשלה: ' + (err.message || err));
    });
}
