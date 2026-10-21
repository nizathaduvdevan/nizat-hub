/* ============================================================
   product-catalog.js — "קטלוג מוצרים"
   ------------------------------------------------------------
   מסך לכל העובדים (נפתח מכרטיס "קטלוג מוצרים" במסך הבית):
   חיפוש לפי שם / מק"ט / ספק, דפדוף לפי מחלקות → קבוצות, ובכל מוצר:
   תמונה, שם, מק"ט, ספק, מחיר באתר, מבצע פעיל (מחוברת המבצעים), מיקום
   על המדף (מהפלנוגרמות, אם פורסמו) וקישור לדף המוצר ב-nizat.com.

   מקור הנתונים: הקובץ parit_with_product_image_links_YYYY-MM-DD.xlsx
   שמופק ע"י הסקריפט NIZAT_CATALOG_UPDATER.ps1 (v5 ומעלה מוסיף "מחיר באתר").
   הייבוא נעשה מתוך המסך עצמו, רק ע"י מנהלי-על (eliran / yulia / ai).

   אבטחת מידע: בזמן הייבוא הדפדפן קורא *רק* את העמודות שמוצגות לעובדים.
   עלות נטו, אחוז רווח וכו' לא נקראות בכלל ולא יוצאות מהמחשב של מי שמייבא.

   חיסכון בקריאות Firestore (חשוב!): במקום מסמך לכל מוצר (~5,000 קריאות
   בכל פתיחה), הקטלוג נשמר כמה מסמכים גדולים בלבד:
     productCatalog/_meta   — גרסה, תאריך ייבוא, ספירות
     productCatalog/c0, c1… — כל מסמך מחזיק מחרוזת JSON של חלק מהמוצרים
   הטלפון שומר עותק ב-localStorage. בכל פתיחה נקרא רק _meta (קריאה אחת);
   החלקים נטענים מחדש רק אם הגרסה השתנתה. אותו עיקרון כמו planogramItems.

   מבצעים: מסונכרנים אוטומטית מאתר nizat.com ע"י Cloud Function מתוזמנת
   (sitePromos/current), ומוצגים רק עד "תוקף המבצעים" שמופיע באתר.

   ניווט: ui.catDept = המחלקה הפתוחה (null = רשימת המחלקות). נשמר בהיסטוריה
   (navigation.js) כך שכפתור "חזרה" במובייל חוזר מהמחלקה לרשימה.
============================================================ */

const CAT_COLLECTION = 'productCatalog';
const CAT_CACHE_KEY = 'nizatHubCatalogV1';
const CAT_PROMO_CACHE_KEY = 'nizatHubCatalogSitePromosV1';
const CAT_SITE = 'https://www.nizat.com/';
const CAT_IMG_BASE = CAT_SITE + 'ProductsImages/';
const CAT_ADMIN_EMAILS = ['eliran@nizat.co.il', 'yulia@nizat.co.il', 'ai@nizat.co.il'];
/* מחלקות פנימיות שלא מוצגות לעובדים */
const CAT_HIDDEN_DEPTS = ['תפעול', 'כללי', 'מוצרים ללא מעמ*', 'לא פעיל1', 'לא פעיל2'];
/* אייקון לכל מחלקה (לפי השם המדויק במערכת). מחלקה חדשה שלא ברשימה מקבלת 🛍️ */
const CAT_DEPT_ICONS = {
  'אם וילד': '🍼', 'אסייתי': '🥢', 'אפייה': '🧁', 'אקולוגי': '🌱', 'ביצים': '🥚', 'בית קפה': '☕',
  'גרנולות/מוזלי ודייסות': '🥣', 'דגני בוקר': '🥣', 'דגנים וקטניות': '🌾', 'דגנים וקטניות תפזורת': '🫘',
  'חטיפים מלוחים': '🥨', 'טבעוני': '🥦', 'לחם ומוצריו': '🍞', 'ללא גלוטן': '🌾', 'מוצרים מתוקים': '🍫',
  'ממרחים': '🍯', 'משקאות': '🧃', 'עוגיות': '🍪', 'פירות וירקות*': '🥕', 'פירות יבשים ואגוזים': '🥜',
  'פסטות': '🍝', 'קוסמטיקה טואלטיקה': '🧴', 'קיטו ודל פחמימה': '🥑', 'קירור טבעוני': '🧊', 'קירור מן החי': '🧀',
  'קפואים': '❄️', 'קרקרים ופריכיות': '🍘', 'שימורים ורטבים': '🥫', 'שמנים וחומצים': '🫒',
  'תבלינים ומלחים': '🧂', 'תה קפה וחליטות': '🍵', 'תוספים': '💊', 'תחליפי חלב': '🥛'
};
/* רקעים צבעוניים עדינים לאייקונים — מתחלפים לפי המחלקה */
const CAT_DEPT_TINTS = ['#FDE7D3', '#E3F1D6', '#DCEBFA', '#F7E0EC', '#FFF1C7', '#E6E0F7', '#D8F1EC', '#FBE3DF'];
const CAT_PAGE_SIZE = 40;
const CAT_CHUNK_MAX_BYTES = 850000;   /* מגבלת מסמך ב-Firestore היא 1MiB */
const CAT_STATUS_FOUND = 'נמצא באתר';

/* עמודות שהייבוא קורא מהאקסל — ורק הן. */
const CAT_COLS = {
  code: 'קוד פריט',
  erpName: 'תאור פריט',
  dept: 'תאור מחלקה',
  group: 'תאור קבוצה',
  supplier: 'תאור ספק ראשי',
  archive: 'ארכיון',
  blocked: 'חסום רכש',
  siteName: 'שם מוצר באתר',
  status: 'סטטוס התאמה',
  url: 'עמוד מוצר באתר',
  img: 'כתובת תמונה',
  sitePrice: 'מחיר באתר',
  erpPrice: 'מחיר צרכן'
};

let cat = {
  loaded: false,
  loading: false,
  error: null,
  meta: null,
  list: [],        /* [{i, code, name, dept, group, supplier, price, priceSrc, url, img, hay}] */
  byCode: {},
  depts: []        /* [{name, count, groups:[{name,count}]}] */
};
let catState = {
  query: '',
  group: null,
  promoOnly: false,
  limit: CAT_PAGE_SIZE,
  focus: false,
  caret: null
};
let catPromo = {
  loaded: false,
  loading: false,
  fetched: false,      /* נקרא מ-Firestore בהפעלה הנוכחית */
  syncedAtMs: null,
  validUntil: null,    /* 'YYYY-MM-DD' — "תוקף המבצעים עד" מהאתר */
  total: 0,
  map: {}              /* מזהה מוצר באתר → {t: נוסח, s: מחיר מבצע, p: מחיר רגיל} */
};
let catPendingImport = null;

/* ============================================================
   עזרים
============================================================ */
function catEsc(s){
  return (typeof esc === 'function') ? esc(s) : String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function catNorm(s){
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/[֑-ׇ]/g, '')
    .replace(/["'`׳״’‘“”]/g, '')
    .replace(/ך/g,'כ').replace(/ם/g,'מ').replace(/ן/g,'נ').replace(/ף/g,'פ').replace(/ץ/g,'צ')
    .replace(/[\/,\-+.():;!&|·—–*_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
/* קוד פריט אחיד: מספרים בלי אפסים מובילים */
function catKey(v){
  if(v == null) return '';
  let s = (typeof v === 'number') ? String(Math.round(v)) : String(v).trim();
  if(/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '');
  if(/^\d+$/.test(s)){ s = s.replace(/^0+/, ''); if(!s) s = '0'; }
  return s;
}
function catTruthy(v){
  if(v === true) return true;
  if(typeof v === 'number') return v !== 0;
  const s = String(v == null ? '' : v).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'כן';
}
function catHash(str){
  let h = 5381;
  for(let i = 0; i < str.length; i++){ h = ((h << 5) + h + str.charCodeAt(i)) | 0; }
  return String(h >>> 0);
}
function catFmtDate(ms){
  if(!ms) return '';
  const d = new Date(ms);
  if(isNaN(d.getTime())) return '';
  return String(d.getDate()).padStart(2,'0') + '.' + String(d.getMonth()+1).padStart(2,'0') + '.' + d.getFullYear();
}
function catFmtPrice(p){
  if(p == null || isNaN(p)) return '';
  const n = Number(p);
  return (Math.round(n) === n ? String(n) : n.toFixed(2)) + ' ₪';
}
function catUtf8Bytes(s){
  try { return new TextEncoder().encode(s).length; } catch(e){ return s.length * 2; }
}
function catCanManage(){
  const email = (typeof currentUserEmail !== 'undefined') ? currentUserEmail : null;
  const preview = (typeof previewMode !== 'undefined') ? previewMode : null;
  return !!email && CAT_ADMIN_EMAILS.indexOf(email) !== -1 && !preview;
}
function catFirestoreReady(){
  return typeof firebaseReady !== 'undefined' && firebaseReady && typeof db !== 'undefined' && db;
}

/* לינק לדף המוצר: נשמר מפוענח (עברית) כדי לחסוך מקום, ומקודד בחזרה בהצגה.
   "~" בתחילת המחרוזת = נשמר כמו שהוא (לא היה אפשר לפענח). */
function catProductUrl(p){
  if(!p.url) return '';
  if(p.url.charAt(0) === '~') return CAT_SITE + p.url.slice(1);
  return CAT_SITE + encodeURI(p.url);
}
function catImageUrl(p){ return p.img ? CAT_IMG_BASE + p.img : ''; }
/* תמונה מוקטנת (כמו בדפי הקטגוריות באתר): NAME_250_180.ext */
function catThumbUrl(p){
  if(!p.img) return '';
  const m = p.img.match(/^(.*)\.([A-Za-z0-9]+)$/);
  return m ? CAT_IMG_BASE + 'thumbs/' + m[1] + '_250_180.' + m[2] : catImageUrl(p);
}

/* ============================================================
   טעינת הקטלוג (meta → חלקים, עם מטמון מקומי)
============================================================ */
function catReadCache(){
  try {
    const raw = localStorage.getItem(CAT_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch(e){ return null; }
}
function catWriteCache(meta, rows){
  try {
    localStorage.setItem(CAT_CACHE_KEY, JSON.stringify({meta: meta, rows: rows, savedAt: Date.now()}));
  } catch(e){
    /* מקום מלא — לא נורא, פשוט נטען שוב מ-Firestore בפעם הבאה */
    try { localStorage.removeItem(CAT_CACHE_KEY); } catch(e2){}
  }
}
/* rows: מערך של מערכים [code, name, dept, group, supplier, price, priceSrc, url, img] */
function catSetData(meta, rows){
  const list = [];
  const byCode = {};
  const deptMap = {};
  (rows || []).forEach(function(r){
    if(!Array.isArray(r) || !r[0]) return;
    const p = {
      i: list.length,
      code: String(r[0]),
      name: String(r[1] || ''),
      dept: String(r[2] || 'אחר'),
      group: String(r[3] || ''),
      supplier: String(r[4] || ''),
      price: (r[5] == null || r[5] === '') ? null : Number(r[5]),
      priceSrc: r[6] || null,
      url: r[7] || '',
      img: r[8] || ''
    };
    p.hay = catNorm(p.name + ' ' + p.supplier);
    list.push(p);
    byCode[p.code] = p;
    const d = deptMap[p.dept] = deptMap[p.dept] || {name: p.dept, count: 0, groupMap: {}};
    d.count++;
    if(p.group) d.groupMap[p.group] = (d.groupMap[p.group] || 0) + 1;
  });
  const coll = (typeof Intl !== 'undefined' && Intl.Collator) ? new Intl.Collator('he') : null;
  const cmp = function(a, b){ return coll ? coll.compare(a, b) : (a < b ? -1 : a > b ? 1 : 0); };
  cat.depts = Object.keys(deptMap).sort(cmp).map(function(name){
    const d = deptMap[name];
    return {
      name: name,
      count: d.count,
      groups: Object.keys(d.groupMap).sort(cmp).map(function(g){ return {name: g, count: d.groupMap[g]}; })
    };
  });
  cat.meta = meta || null;
  cat.list = list;
  cat.byCode = byCode;
}
function catEnsureLoaded(){
  if(cat.loaded || cat.loading) return;
  if(!cat.list.length){
    const cached = catReadCache();
    if(cached && cached.rows) catSetData(cached.meta, cached.rows);
  }
  if(!catFirestoreReady()){
    cat.loaded = true;
    return;
  }
  cat.loading = true;
  const col = db.collection(CAT_COLLECTION);
  col.doc('_meta').get().then(function(metaDoc){
    if(!metaDoc.exists){
      catSetData(null, []);
      try { localStorage.removeItem(CAT_CACHE_KEY); } catch(e){}
      return null;
    }
    const meta = metaDoc.data();
    if(cat.meta && cat.meta.version === meta.version && cat.list.length){
      cat.meta = meta;
      return null;
    }
    const ids = (meta.chunkIds && meta.chunkIds.length) ? meta.chunkIds : [];
    return Promise.all(ids.map(function(id){ return col.doc(id).get(); })).then(function(docs){
      let rows = [];
      docs.forEach(function(doc){
        if(!doc.exists) return;
        const d = doc.data() || {};
        try { rows = rows.concat(JSON.parse(d.data || '[]')); } catch(e){ console.warn('catalog: חלק פגום', doc.id, e); }
      });
      catSetData(meta, rows);
      catWriteCache(meta, rows);
    });
  }).then(function(){
    cat.error = null;
    cat.loaded = true;
    cat.loading = false;
    catRerender();
  }).catch(function(err){
    console.warn('catalog: הטעינה נכשלה', err);
    cat.error = err;
    cat.loaded = true;
    cat.loading = false;
    catRerender();
  });
}

/* ============================================================
   מבצעים — מסונכרנים מאתר nizat.com
   ------------------------------------------------------------
   המבצעים באתר זהים לסניפים. ה-Cloud Function sync_site_promos (בפרויקט
   הפונקציות, sync_site_promos.py) סורקת את עמוד "מבצעי מועדון" באתר כמה
   פעמים ביום וכותבת מסמך אחד: sitePromos/current
     {syncedAtMs, validUntil:'YYYY-MM-DD', total, data:'{"27713":{"t":"ב- 20% הנחה","s":12.72,"p":15.9}, …}'}
   המפתח הוא מזהה המוצר באתר — המספר שבסוף הקישור לדף המוצר (-i27713) —
   כך שהחיבור למוצרי הקטלוג מדויק, בלי ניחוש לפי שם.
   מבצע מוצג רק עד validUntil ("תוקף המבצעים עד…" מהאתר). כשהאתר עובר
   לחודש הבא, הסנכרון הבא מביא את המבצעים החדשים — המשכיות אוטומטית.
   עלות: קריאה אחת בכל כניסה לקטלוג (פעם אחת לכל פתיחת אפליקציה).
============================================================ */
const CAT_SYNC_URL = 'https://us-central1-nizat-hub.cloudfunctions.net/sync_site_promos_now';
const CAT_PROMO_NO_DATE_MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000;  /* בלי תאריך תוקף: עד יומיים מהסנכרון */

function catTodayKey(){
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function catFmtDayKey(k){
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(k || '');
  return m ? parseInt(m[3], 10) + '.' + parseInt(m[2], 10) : '';
}
function catFmtDateTime(ms){
  if(!ms) return '';
  const d = new Date(ms);
  return catFmtDate(ms) + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
}
/* מזהה המוצר באתר מתוך הקישור לדף המוצר (…-i27713) */
function catSiteId(p){
  if(!p || !p.url) return '';
  const m = String(p.url).match(/-i(\d+)\s*$/);
  return m ? m[1] : '';
}
function catPromoSet(doc){
  let map = {};
  try { map = JSON.parse(doc.data || '{}') || {}; } catch(e){ map = {}; }
  catPromo.map = map;
  catPromo.syncedAtMs = doc.syncedAtMs || null;
  catPromo.validUntil = doc.validUntil || null;
  catPromo.total = doc.total != null ? doc.total : Object.keys(map).length;
  catPromo.loaded = true;
}
function catPromoEnsureLoaded(){
  if(catPromo.loading || catPromo.fetched) return;
  /* הצגה מיידית מהמטמון, ואז רענון (קריאה אחת) */
  if(!catPromo.loaded){
    try {
      const raw = localStorage.getItem(CAT_PROMO_CACHE_KEY);
      const c = raw ? JSON.parse(raw) : null;
      if(c && c.data != null) catPromoSet(c);
    } catch(e){}
  }
  if(!catFirestoreReady()){ catPromo.loaded = true; return; }
  catPromo.loading = true;
  db.collection('sitePromos').doc('current').get().then(function(doc){
    const d = doc.exists ? (doc.data() || {}) : {data: '{}', syncedAtMs: null, validUntil: null, total: 0};
    const st = {data: d.data || '{}', syncedAtMs: d.syncedAtMs || null, validUntil: d.validUntil || null, total: d.total || 0};
    catPromoSet(st);
    try { localStorage.setItem(CAT_PROMO_CACHE_KEY, JSON.stringify(st)); } catch(e){}
  }).catch(function(err){
    console.warn('catalog: טעינת המבצעים נכשלה', err);
    catPromo.loaded = true;
  }).then(function(){
    catPromo.loading = false;
    catPromo.fetched = true;
    catRerender();
  });
}
/* האם המבצעים שסונכרנו בתוקף היום */
function catPromoActive(){
  if(!catPromo.loaded || !catPromo.syncedAtMs) return false;
  if(catPromo.validUntil) return catTodayKey() <= catPromo.validUntil;
  return (Date.now() - catPromo.syncedAtMs) < CAT_PROMO_NO_DATE_MAX_AGE_MS;
}
/* המבצע של מוצר אם הוא בתוקף היום (או null) */
function catPromoFor(p){
  if(!catPromoActive()) return null;
  const sid = catSiteId(p);
  const x = sid ? catPromo.map[sid] : null;
  if(!x || !x.t) return null;
  return {
    label: x.t,
    sale: (x.s != null && x.s > 0) ? Number(x.s) : null,
    regular: (x.p != null && x.p > 0) ? Number(x.p) : null,
    until: catPromo.validUntil
  };
}
/* יש היום מבצעים להצגה? */
function catHasActivePromos(){
  return catPromoActive() && Object.keys(catPromo.map || {}).length > 0;
}

/* ---------- ניהול (מנהלי-על): סנכרון ידני / בדיקה ---------- */
function catCallSync(dryRun, btn){
  if(!catCanManage() || typeof firebase === 'undefined' || !firebase.auth().currentUser){ toast('אין הרשאה'); return; }
  const label = btn ? btn.textContent : '';
  if(btn){ btn.disabled = true; btn.textContent = dryRun ? 'בודק…' : 'מסנכרן… (כ-2 דקות)'; }
  firebase.auth().currentUser.getIdToken().then(function(token){
    return fetch(CAT_SYNC_URL, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token},
      body: JSON.stringify({dryRun: !!dryRun})
    });
  }).then(function(r){ return r.json(); }).then(function(res){
    if(btn){ btn.disabled = false; btn.textContent = label; }
    if(res.error){ toast('שגיאה: ' + res.error); return; }
    catShowSyncResult(res);
    if(!dryRun && res.written){
      catPromo.fetched = false;
      catPromo.loaded = false;
      catPromoEnsureLoaded();
    }
  }).catch(function(err){
    if(btn){ btn.disabled = false; btn.textContent = label; }
    toast('הסנכרון נכשל: ' + (err && err.message ? err.message : 'שגיאת רשת'));
  });
}
function catShowSyncResult(res){
  const samples = (res.samples || []).map(function(s){
    const p = cat.list.find(function(x){ return catSiteId(x) === String(s.id); });
    return `<tr><td>${catEsc(s.n || (p && p.name) || s.id)}</td><td style="white-space:nowrap;">${catEsc(s.t)}${s.s ? ` · ${catFmtPrice(s.s)}` : ''}</td><td>${p ? '✓' : '—'}</td></tr>`;
  }).join('');
  const inCatalog = Object.keys(catPromo.map || {}).length;
  document.getElementById('modal-body').innerHTML = `
    <h3>${res.dryRun ? 'בדיקת סנכרון מבצעים' : (res.written ? 'המבצעים סונכרנו' : 'הסנכרון לא עדכן')}</h3>
    <div style="font-size:14px;line-height:1.8;">
      נמצאו <b>${res.total}</b> מוצרים במבצע ב-${res.categories} קטגוריות באתר${res.validUntil ? ` · בתוקף עד <b>${catFmtDayKey(res.validUntil)}</b>` : ' · <span style="color:var(--critical);">לא נמצא תאריך תוקף באתר</span>'}.<br>
      ${res.skippedGeneric ? `<span style="color:var(--text-secondary);font-size:13px;">${res.skippedGeneric} הנחות "5% לחברי מועדון" לא נספרו כמבצע.</span><br>` : ''}
      <span style="color:var(--text-secondary);font-size:13px;">לוגואים של מותגים (לחברי מועדון): ${res.brandLogos || 0}${res.bookletLogos && res.bookletLogos.found ? ` · ${res.bookletLogos.found} חדשים מהחוברת` : ''}.</span><br>
      ${res.bookletLogos && (res.bookletLogos.notFound || []).length ? `<span style="color:var(--critical);font-size:13px;">לא נמצא לוגו ל: ${res.bookletLogos.notFound.map(catEsc).join(', ')}</span><br>` : ''}
      ${(res.failedCategories || []).length ? `<span style="color:var(--critical);font-size:13px;">${res.failedCategories.length} קטגוריות לא נטענו.</span><br>` : ''}
      ${res.dryRun ? '<span style="color:var(--text-secondary);font-size:13px;">בדיקה בלבד — שום דבר לא נשמר.</span>' : ''}
    </div>
    ${samples ? `<table class="cat-pd-table" style="margin-top:10px;font-size:12.5px;"><tr><td>מוצר</td><td>מבצע</td><td>בקטלוג</td></tr>${samples}</table>` : ''}
    <div class="modal-actions"><button class="btn-secondary" onclick="closeModal()">סגירה</button></div>`;
  document.getElementById('modal-overlay').classList.add('open');
}

/* ============================================================
   מיקום על המדף (planograms.js) — רק אם הפלנוגרמות גלויות למשתמש
============================================================ */
function catPlanoAvailable(){
  return typeof planoIsVisibleToCurrentUser === 'function' && planoIsVisibleToCurrentUser()
    && typeof planoItems !== 'undefined';
}
function catPlanoHas(p){
  if(!catPlanoAvailable() || !planoItems.byCode) return false;
  const it = planoItems.byCode[catKey(p.code)] || planoItems.byCode[p.code];
  return !!(it && it.rec && it.rec.d);
}
function catGoToShelf(i){
  const p = cat.list[i];
  if(!p) return;
  closeModal();
  if(typeof planoState !== 'undefined'){
    planoState.query = catKey(p.code);
    planoState.focusSearch = false;
  }
  goTo('planograms');
}

/* ============================================================
   חיפוש וסינון
============================================================ */
function catFilteredList(){
  const q = catNorm(catState.query);
  let base = cat.list;
  if(ui.catDept) base = base.filter(function(p){ return p.dept === ui.catDept; });
  if(catState.promoOnly) base = base.filter(function(p){ return !!catPromoFor(p); });

  if(!q){
    if(ui.catDept && catState.group) base = base.filter(function(p){ return p.group === catState.group; });
    return base;
  }
  const numeric = /^\d+$/.test(q.replace(/\s/g, '')) ? q.replace(/\s/g, '') : null;
  const out = [];
  if(numeric){
    base.forEach(function(p){
      const k = catKey(p.code);
      if(k === catKey(numeric)) out.push({p: p, s: 100});
      else if(p.code.indexOf(numeric) === 0) out.push({p: p, s: 80});
      else if(numeric.length >= 4 && p.code.indexOf(numeric) !== -1) out.push({p: p, s: 60});
    });
  } else {
    if(q.length < 2) return [];
    const tokens = q.split(' ').filter(Boolean);
    base.forEach(function(p){
      if(!tokens.every(function(t){ return p.hay.indexOf(t) !== -1; })) return;
      const nn = catNorm(p.name);
      let s = 50;
      if(nn === q) s = 90;
      else if(nn.indexOf(q) === 0) s = 75;
      else if(nn.indexOf(q) !== -1) s = 65;
      out.push({p: p, s: s});
    });
  }
  out.sort(function(a, b){ return b.s - a.s || a.p.name.length - b.p.name.length; });
  return out.map(function(x){ return x.p; });
}

/* ============================================================
   רינדור
============================================================ */
function catInjectStyleOnce(){
  if(document.getElementById('cat-style')) return;
  const style = document.createElement('style');
  style.id = 'cat-style';
  style.textContent = `
    .cat-search{position:relative;margin:0 0 12px;}
    .cat-search input{width:100%;box-sizing:border-box;border:1px solid var(--border);background:var(--surface-1);color:var(--text-primary);
      border-radius:12px;padding:12px 40px 12px 14px;font-family:inherit;font-size:15px;}
    .cat-search input:focus{outline:none;border-color:var(--brand-primary);}
    .cat-search .cat-search-ic{position:absolute;top:50%;right:14px;transform:translateY(-50%);color:var(--muted);pointer-events:none;}
    .cat-search .cat-clear{position:absolute;top:50%;left:8px;transform:translateY(-50%);border:none;background:transparent;color:var(--muted);
      font-size:18px;cursor:pointer;padding:6px 8px;font-family:inherit;}
    .cat-chips{display:flex;gap:8px;overflow-x:auto;padding:2px 0 10px;margin:0 0 6px;scrollbar-width:none;}
    .cat-chips::-webkit-scrollbar{display:none;}
    .cat-chip{flex:none;border:1px solid var(--border);background:var(--surface-1);color:var(--text-secondary);border-radius:99px;
      padding:7px 13px;font-family:inherit;font-size:13px;cursor:pointer;white-space:nowrap;}
    .cat-chip.active{background:var(--brand-primary);border-color:var(--brand-primary);color:#fff;}
    .cat-chip.promo{background:rgba(176,24,40,0.08);border-color:rgba(176,24,40,0.35);color:var(--orange);font-weight:700;}
    .cat-chip.promo.active{background:var(--orange);border-color:var(--orange);color:#fff;}
    html[data-theme="dark"] .cat-chip.promo:not(.active){background:rgba(236,131,90,0.12);border-color:rgba(236,131,90,0.4);color:#f09a7a;}
    .cat-chip .cat-chip-n{opacity:.7;font-size:12px;margin-inline-start:4px;}
    .cat-sub{font-size:12.5px;color:var(--muted);margin:-2px 0 12px;}
    .cat-depts{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
    .cat-dept{display:flex;flex-direction:row;align-items:flex-start;gap:10px;text-align:right;background:var(--surface-1);
      border:1px solid var(--border);border-radius:14px;padding:12px 11px;cursor:pointer;font-family:inherit;color:var(--text-primary);min-height:72px;
      box-shadow:0 1px 2px rgba(11,11,11,0.04), 0 2px 10px rgba(11,11,11,0.05);}
    .cat-dept:hover{border-color:var(--brand-primary);}
    .cat-dept-ic{width:40px;height:40px;flex:none;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:21px;line-height:1;}
    .cat-dept-txt{display:flex;flex-direction:column;align-items:flex-start;gap:3px;min-width:0;}
    .cat-dept-name{font-size:14px;font-weight:700;line-height:1.3;}
    .cat-dept-meta{font-size:12px;color:var(--muted);}
    .cat-dept-promo{display:inline-block;margin-top:3px;font-size:11.5px;font-weight:700;color:#fff;background:var(--orange);
      border-radius:99px;padding:2px 9px;white-space:nowrap;}
    .cat-list{background:var(--surface-1);border:1px solid var(--border);border-radius:14px;overflow:hidden;}
    .cat-row{display:flex;gap:12px;align-items:center;width:100%;text-align:right;background:transparent;border:none;
      border-bottom:1px solid var(--gridline);padding:10px 12px;cursor:pointer;font-family:inherit;color:var(--text-primary);}
    .cat-row:last-child{border-bottom:none;}
    .cat-row:hover{background:var(--page);}
    .cat-thumb{width:56px;height:56px;flex:none;border-radius:10px;background:#fff;border:1px solid var(--gridline);
      object-fit:contain;display:block;}
    .cat-row-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;}
    .cat-row-name{font-size:14px;font-weight:600;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
    .cat-row-meta{font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .cat-row-side{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:5px;}
    .cat-price{font-size:14px;font-weight:700;color:var(--text-primary);white-space:nowrap;}
    .cat-price.sale{color:var(--orange);}
    .cat-price-was{font-size:11.5px;color:var(--muted);text-decoration:line-through;white-space:nowrap;margin-top:-4px;}
    html[data-theme="dark"] .cat-price.sale{color:#f09a7a;}
    .cat-promo-pill{font-size:11px;font-weight:700;color:#fff;background:var(--orange);border-radius:99px;padding:2px 8px;white-space:nowrap;}
    .cat-more{display:block;width:100%;margin:12px 0 0;padding:11px;border-radius:10px;border:1px solid var(--border);
      background:var(--surface-1);color:var(--brand-primary-dark);font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;}
    .cat-count{font-size:12.5px;color:var(--muted);margin:0 0 8px;}
    .cat-empty{padding:28px 16px;text-align:center;color:var(--muted);font-size:14px;line-height:1.6;}
    .cat-admin{margin:18px 0 0;padding:12px 14px;border:1px dashed var(--border);border-radius:12px;font-size:12.5px;color:var(--text-secondary);
      display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;}
    .cat-back{border:1px solid var(--border);background:var(--surface-1);color:var(--text-primary);border-radius:10px;width:36px;height:36px;
      font-size:18px;cursor:pointer;flex:none;font-family:inherit;}
    .cat-pd-img{width:100%;max-height:260px;object-fit:contain;background:#fff;border-radius:12px;border:1px solid var(--gridline);display:block;margin:0 0 12px;}
    .cat-pd-name{font-size:17px;font-weight:700;line-height:1.4;margin:0 0 10px;}
    .cat-pd-promo{background:rgba(176,24,40,0.07);border:1px solid rgba(176,24,40,0.25);border-radius:12px;padding:10px 12px;margin:0 0 12px;}
    .cat-pd-promo-label{font-size:15px;font-weight:700;color:var(--orange);}
    .cat-pd-promo-sub{font-size:12.5px;color:var(--text-secondary);margin-top:4px;line-height:1.5;}
    .cat-pd-table{width:100%;border-collapse:collapse;font-size:13.5px;}
    .cat-pd-table td{padding:7px 0;border-bottom:1px solid var(--gridline);vertical-align:top;}
    .cat-pd-table td:first-child{color:var(--muted);width:96px;}
    .cat-price-note{font-size:12px;color:var(--muted);margin:-4px 0 10px;line-height:1.5;}
    .cat-pd-disclaimer{font-size:12px;color:var(--muted);line-height:1.5;margin:8px 0 0;}
    .cat-pd-actions{display:flex;flex-direction:column;gap:8px;margin-top:14px;}
    .cat-pd-btn{display:flex;align-items:center;justify-content:center;gap:6px;padding:11px;border-radius:10px;font-family:inherit;font-size:14.5px;
      font-weight:600;text-decoration:none;cursor:pointer;border:1px solid var(--border);background:var(--surface-1);color:var(--text-primary);}
    .cat-pd-btn.primary{background:var(--brand-primary);border-color:var(--brand-primary);color:#fff;}
    .cat-copy{border:none;background:transparent;color:var(--brand-primary-dark);cursor:pointer;font-family:inherit;font-size:12.5px;padding:0 6px;}
    html[data-theme="dark"] .cat-thumb, html[data-theme="dark"] .cat-pd-img{background:#f4f4f2;}
    html[data-theme="dark"] .cat-pd-promo{background:rgba(236,131,90,0.10);border-color:rgba(236,131,90,0.35);}
    html[data-theme="dark"] .cat-pd-promo-label{color:#f09a7a;}
    html[data-theme="dark"] .cat-dept-ic{filter:saturate(0.9);opacity:0.92;}
    html[data-theme="dark"] .cat-more, html[data-theme="dark"] .cat-copy{color:#a8d878;}
    @media (min-width:700px){ .cat-depts{grid-template-columns:repeat(3,1fr);} }
  `;
  document.head.appendChild(style);
}

function viewProductCatalog(){
  catInjectStyleOnce();
  catEnsureLoaded();
  catPromoEnsureLoaded();
  if(catPlanoAvailable() && typeof planoItemsEnsureLoaded === 'function') planoItemsEnsureLoaded();
  /* שחזור פוקוס בחיפוש אחרי רינדור מלא (למשל כשמגיע עדכון מ-Firestore) */
  if(catState.focus) setTimeout(catRestoreFocus, 0);

  const dept = ui.catDept ? cat.depts.find(function(d){ return d.name === ui.catDept; }) : null;
  if(ui.catDept && cat.loaded && !dept && cat.list.length){ ui.catDept = null; }

  const updated = cat.meta ? catFmtDate(cat.meta.importedAt) : '';
  const head = ui.catDept ? `
    <div class="page-head">
      <div style="display:flex;align-items:center;gap:10px;">
        <button class="cat-back" onclick="history.back()" aria-label="חזרה לכל המחלקות">→</button>
        <h1 style="margin:0;">${catEsc(ui.catDept)}</h1>
      </div>
    </div>` : `
    <div class="page-head">
      <h1>קטלוג מוצרים</h1>
      <p>${cat.list.length ? `${cat.list.length.toLocaleString('he-IL')} מוצרים${updated ? ` · עודכן ${updated}` : ''}` : 'חיפוש מוצר, מחיר ומבצעים'}</p>
    </div>`;

  return `
    ${head}
    <div class="cat-search">
      <span class="cat-search-ic">${typeof icon === 'function' ? icon('search') : '🔍'}</span>
      <input type="search" id="cat-q" inputmode="search" autocomplete="off"
        placeholder="${ui.catDept ? 'חיפוש במחלקה: שם, מק&quot;ט או ספק' : 'חיפוש לפי שם מוצר, מק&quot;ט או ספק'}"
        value="${catEsc(catState.query)}"
        oninput="catOnSearch(this.value)" onfocus="catState.focus=true" onblur="catOnBlur()">
      ${catState.query ? `<button class="cat-clear" onclick="catClearSearch()" aria-label="ניקוי החיפוש">✕</button>` : ''}
    </div>
    <div class="cat-price-note">ℹ️ המחירים לידיעה בלבד. המחיר הקובע הוא המחיר בקופה.</div>
    <div id="cat-chips">${catChipsHtml(dept)}</div>
    <div id="cat-body">${catBodyHtml()}</div>
    ${catAdminHtml()}
  `;
}

function catChipsHtml(dept){
  if(!cat.list.length) return '';
  const chips = [];
  if(catHasActivePromos() || catState.promoOnly){
    chips.push(`<button class="cat-chip promo ${catState.promoOnly ? 'active' : ''}" onclick="catTogglePromo()">🏷️ רק במבצע</button>`);
  }
  if(dept && !catState.query && dept.groups.length > 1){
    chips.push(`<button class="cat-chip ${!catState.group ? 'active' : ''}" onclick="catSetGroup(-1)">הכל<span class="cat-chip-n">${dept.count}</span></button>`);
    dept.groups.forEach(function(g, gi){
      chips.push(`<button class="cat-chip ${catState.group === g.name ? 'active' : ''}" onclick="catSetGroup(${gi})">${catEsc(g.name)}<span class="cat-chip-n">${g.count}</span></button>`);
    });
  }
  return `<div class="cat-chips">${chips.join('')}</div>`;
}

function catBodyHtml(){
  if(!cat.list.length){
    if(!cat.loaded || cat.loading) return `<div class="cat-empty">טוען את הקטלוג…</div>`;
    if(cat.error) return `<div class="cat-empty">לא הצלחנו לטעון את הקטלוג. בדקו את החיבור לאינטרנט ונסו שוב.</div>`;
    return `<div class="cat-empty">הקטלוג עדיין לא הועלה למערכת.</div>`;
  }
  const q = catNorm(catState.query);
  const searching = !!q;
  if(!searching && !ui.catDept && !catState.promoOnly) return catDeptGridHtml();

  if(searching && !/^\d+$/.test(q.replace(/\s/g, '')) && q.length < 2){
    return `<div class="cat-empty">הקלידו לפחות 2 אותיות</div>`;
  }
  const items = catFilteredList();
  if(!items.length){
    if(searching) return `<div class="cat-empty">לא נמצאו מוצרים עבור "${catEsc(catState.query)}"${ui.catDept ? ' במחלקה הזו' : ''}${catState.promoOnly ? ' במבצע' : ''}.</div>`;
    if(catState.promoOnly) return `<div class="cat-empty">${catPromo.loaded ? 'אין כרגע מבצעים בתוקף כאן.' : 'טוען מבצעים…'}</div>`;
    return `<div class="cat-empty">אין מוצרים להצגה.</div>`;
  }
  const shown = items.slice(0, catState.limit);
  const label = searching ? `${items.length} תוצאות` : (catState.promoOnly ? `${items.length} מוצרים במבצע` : `${items.length} מוצרים`);
  return `
    <div class="cat-count">${label}</div>
    <div class="cat-list">${shown.map(catRowHtml).join('')}</div>
    ${items.length > shown.length ? `<button class="cat-more" onclick="catShowMore()">הצג עוד (${items.length - shown.length})</button>` : ''}
  `;
}

function catDeptIcon(name){
  return CAT_DEPT_ICONS[name] || '🛍️';
}
function catDeptTint(name){
  return CAT_DEPT_TINTS[parseInt(catHash(name), 10) % CAT_DEPT_TINTS.length];
}
function catDeptGridHtml(){
  const promoCounts = {};
  if(catPromo.loaded){
    cat.list.forEach(function(p){ if(catPromoFor(p)) promoCounts[p.dept] = (promoCounts[p.dept] || 0) + 1; });
  }
  return `<div class="cat-depts">${cat.depts.map(function(d, di){
    const pc = promoCounts[d.name] || 0;
    return `<button class="cat-dept" onclick="catOpenDept(${di})">
      <span class="cat-dept-ic" style="background:${catDeptTint(d.name)}" aria-hidden="true">${catDeptIcon(d.name)}</span>
      <span class="cat-dept-txt">
        <span class="cat-dept-name">${catEsc(d.name.replace(/\*$/, ''))}</span>
        <span class="cat-dept-meta">${d.count} מוצרים</span>
        ${pc ? `<span class="cat-dept-promo">🏷️ ${pc} במבצע</span>` : ''}
      </span>
    </button>`;
  }).join('')}</div>`;
}

function catRowHtml(p){
  const promo = catPromoFor(p);
  const thumb = catThumbUrl(p);
  const full = catImageUrl(p);
  const metaParts = [`מק"ט ${catEsc(p.code)}`];
  if(p.supplier) metaParts.push(catEsc(p.supplier));
  if(!ui.catDept && catNorm(catState.query)) metaParts.push(catEsc(p.dept));
  return `<button class="cat-row" onclick="catOpenProduct(${p.i})">
    <img class="cat-thumb" loading="lazy" alt="" src="${catEsc(thumb)}"
      onerror="if(this.dataset.f!=='1'){this.dataset.f='1';this.src='${catEsc(full)}';}else{this.style.visibility='hidden';}">
    <span class="cat-row-main">
      <span class="cat-row-name">${catEsc(p.name)}</span>
      <span class="cat-row-meta">${metaParts.join(' · ')}</span>
    </span>
    <span class="cat-row-side">
      ${promo && promo.sale ? `<span class="cat-price sale">${catFmtPrice(promo.sale)}</span>` + (p.price != null || promo.regular ? `<span class="cat-price-was">${catFmtPrice(promo.regular || p.price)}</span>` : '')
        : (p.price != null ? `<span class="cat-price">${catFmtPrice(p.price)}</span>` : '')}
      ${promo ? `<span class="cat-promo-pill">${catEsc(promo.label.length <= 16 ? promo.label : 'מבצע')}</span>` : ''}
    </span>
  </button>`;
}

function catAdminHtml(){
  if(!catCanManage()) return '';
  const m = cat.meta;
  return `
    <div class="cat-admin">
      <span>🔧 ניהול: ${m ? `יובא ${catFmtDate(m.importedAt)} · ${m.total} מוצרים${m.importedBy ? ` · ע"י ${catEsc(m.importedBy)}` : ''}` : 'הקטלוג עוד לא יובא'}
        ${catPromoAdminText() ? `<br>🏷️ ${catPromoAdminText()}` : ''}</span>
      <input type="file" id="cat-import-input" accept=".xlsx,.xls" style="display:none;" onchange="catImportFileSelected(this.files[0]);this.value='';">
      <span style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn-add" style="flex:none;" onclick="document.getElementById('cat-import-input').click()">📥 ייבוא קטלוג מאקסל</button>
        <button class="btn-add" style="flex:none;" onclick="catCallSync(false, this)">🔄 סנכרון מבצעים עכשיו</button>
        <button class="btn-add" style="flex:none;" onclick="catCallSync(true, this)">🧪 בדיקה</button>
      </span>
    </div>`;
}

/* שורת מצב המבצעים — רק למנהלי-על */
function catPromoAdminText(){
  if(!catPromo.loaded) return '';
  if(!catPromo.syncedAtMs) return 'המבצעים עוד לא סונכרנו מהאתר';
  const synced = 'סונכרן ' + catFmtDateTime(catPromo.syncedAtMs);
  const until = catPromo.validUntil ? ` · בתוקף עד ${catFmtDayKey(catPromo.validUntil)}` : '';
  if(catPromoActive()){
    const linked = cat.list.filter(function(p){ return !!catPromoFor(p); }).length;
    return `${catPromo.total} מבצעים באתר, ${linked} מהם בקטלוג${until} · ${synced}`;
  }
  return `אין מבצעים בתוקף (${catPromo.validUntil ? 'התוקף הסתיים ב-' + catFmtDayKey(catPromo.validUntil) : 'הסנכרון ישן'}) · ${synced}`;
}

/* רינדור חלקי (בלי לאבד פוקוס בחיפוש) */
function catRefreshBody(){
  const body = document.getElementById('cat-body');
  if(body) body.innerHTML = catBodyHtml();
  const chips = document.getElementById('cat-chips');
  const dept = ui.catDept ? cat.depts.find(function(d){ return d.name === ui.catDept; }) : null;
  if(chips) chips.innerHTML = catChipsHtml(dept);
  const input = document.getElementById('cat-q');
  if(input){
    const wrap = input.parentNode;
    const clr = wrap.querySelector('.cat-clear');
    if(catState.query && !clr){
      const b = document.createElement('button');
      b.className = 'cat-clear'; b.setAttribute('aria-label', 'ניקוי החיפוש'); b.textContent = '✕';
      b.onclick = catClearSearch;
      wrap.appendChild(b);
    } else if(!catState.query && clr){ clr.remove(); }
  }
}
function catRerender(){
  if(typeof ui === 'undefined' || ui.view !== 'productCatalog') return;
  if(typeof renderContent === 'function') renderContent();
}
function catRestoreFocus(){
  const input = document.getElementById('cat-q');
  if(!input || document.activeElement === input) return;
  input.focus();
  const pos = catState.caret != null ? catState.caret : input.value.length;
  try { input.setSelectionRange(pos, pos); } catch(e){}
}

/* ============================================================
   פעולות משתמש
============================================================ */
function catOnSearch(v){
  catState.query = v;
  catState.limit = CAT_PAGE_SIZE;
  const input = document.getElementById('cat-q');
  if(input){ try { catState.caret = input.selectionStart; } catch(e){} }
  catRefreshBody();
}
function catOnBlur(){
  /* blur שנגרם מרינדור מלא לא נחשב — רק יציאה אמיתית מהשדה */
  setTimeout(function(){
    const input = document.getElementById('cat-q');
    if(input && document.activeElement !== input && document.body.contains(input)) catState.focus = false;
  }, 50);
}
function catClearSearch(){
  catState.query = '';
  catState.limit = CAT_PAGE_SIZE;
  const input = document.getElementById('cat-q');
  if(input){ input.value = ''; input.focus(); }
  catRefreshBody();
}
function catShowMore(){
  catState.limit += CAT_PAGE_SIZE * 2;
  catRefreshBody();
}
function catTogglePromo(){
  catState.promoOnly = !catState.promoOnly;
  catState.limit = CAT_PAGE_SIZE;
  catRefreshBody();
}
function catSetGroup(gi){
  const dept = cat.depts.find(function(d){ return d.name === ui.catDept; });
  catState.group = (gi < 0 || !dept || !dept.groups[gi]) ? null : dept.groups[gi].name;
  catState.limit = CAT_PAGE_SIZE;
  catRefreshBody();
}
function catOpenDept(di){
  const d = cat.depts[di];
  if(!d) return;
  ui.catDept = d.name;
  catState.group = null;
  catState.query = '';
  catState.limit = CAT_PAGE_SIZE;
  catState.focus = false;
  goTo('productCatalog', {keepCatDept: true});
}
function catCopyCode(i){
  const p = cat.list[i];
  if(!p) return;
  const done = function(){ if(typeof toast === 'function') toast('המק"ט הועתק'); };
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(p.code).then(done).catch(function(){});
  }
}
function catOpenProduct(i){
  const p = cat.list[i];
  if(!p) return;
  const promo = catPromoFor(p);
  const url = catProductUrl(p);
  const priceDate = cat.meta ? catFmtDate(cat.meta.importedAt) : '';
  const priceLabel = p.priceSrc === 'e' ? 'מחיר צרכן' : 'מחיר באתר';
  document.getElementById('modal-body').innerHTML = `
    ${p.img ? `<img class="cat-pd-img" alt="" src="${catEsc(catImageUrl(p))}" onerror="this.style.display='none'">` : ''}
    <div class="cat-pd-name">${catEsc(p.name)}</div>
    ${promo ? `
      <div class="cat-pd-promo">
        <div class="cat-pd-promo-label">🏷️ במבצע: ${catEsc(promo.label)}</div>
        ${promo.sale ? `<div class="cat-pd-promo-sub">מחיר במבצע: <b>${catFmtPrice(promo.sale)}</b>${promo.regular ? ` במקום ${catFmtPrice(promo.regular)}` : ''}</div>` : ''}
        ${promo.until ? `<div class="cat-pd-promo-sub">בתוקף עד ${catFmtDayKey(promo.until)}</div>` : ''}
      </div>` : ''}
    <table class="cat-pd-table">
      <tr><td>מק"ט</td><td>${catEsc(p.code)} <button class="cat-copy" onclick="catCopyCode(${p.i})">העתקה</button></td></tr>
      <tr><td>מחלקה</td><td>${catEsc(p.dept)}${p.group ? ' › ' + catEsc(p.group) : ''}</td></tr>
      ${p.supplier ? `<tr><td>ספק</td><td>${catEsc(p.supplier)}</td></tr>` : ''}
      ${p.price != null ? `<tr><td>${priceLabel}</td><td><b>${catFmtPrice(p.price)}</b>${priceDate ? ` <span style="color:var(--muted);font-size:12px;">· נכון ל-${priceDate}</span>` : ''}</td></tr>` : ''}
    </table>
    ${(p.price != null || (promo && promo.sale)) ? `<div class="cat-pd-disclaimer">המחירים מוצגים לפי אתר ניצת הדובדבן ולידיעה בלבד. המחיר הקובע הוא המחיר בקופה.</div>` : ''}
    <div class="cat-pd-actions">
      ${url ? `<a class="cat-pd-btn primary" href="${catEsc(url)}" target="_blank" rel="noopener">לדף המוצר באתר ↗</a>` : ''}
      ${catPlanoHas(p) ? `<button class="cat-pd-btn" onclick="catGoToShelf(${p.i})">📍 איפה זה על המדף?</button>` : ''}
      <button class="cat-pd-btn" onclick="closeModal()">סגירה</button>
    </div>
  `;
  document.getElementById('modal-overlay').classList.add('open');
}

/* ============================================================
   ייבוא (מנהלי-על בלבד)
============================================================ */
function catImportFileSelected(file){
  if(!file) return;
  if(!catCanManage()){ toast('אין הרשאה לייבוא הקטלוג'); return; }
  toast('קורא את הקובץ…');
  loadXlsxLib().then(function(){
    return new Promise(function(resolve, reject){
      const reader = new FileReader();
      reader.onload = function(e){ resolve(e.target.result); };
      reader.onerror = function(){ reject(new Error('קריאת הקובץ נכשלה')); };
      reader.readAsArrayBuffer(file);
    });
  }).then(function(buf){
    const wb = XLSX.read(buf, {type: 'array'});
    const ws = wb.Sheets[wb.SheetNames[0]];
    const table = XLSX.utils.sheet_to_json(ws, {header: 1, raw: true, defval: null, blankrows: false});
    const result = catParseTable(table);
    if(result.error){ toast(result.error); return; }
    result.sourceFile = file.name;
    catShowImportPreview(result);
  }).catch(function(err){
    console.error('catalog import', err);
    toast('הייבוא נכשל: ' + (err && err.message ? err.message : 'שגיאה לא ידועה'));
  });
}

/* table: מערך שורות (שורה ראשונה = כותרות). מחזיר {rows, stats} או {error}. */
function catParseTable(table){
  if(!table || table.length < 2) return {error: 'הקובץ ריק'};
  const headers = (table[0] || []).map(function(h){ return String(h == null ? '' : h).trim(); });
  const idx = {};
  Object.keys(CAT_COLS).forEach(function(k){ idx[k] = headers.indexOf(CAT_COLS[k]); });
  const required = ['code', 'dept', 'status', 'url', 'img'];
  const missing = required.filter(function(k){ return idx[k] < 0; }).map(function(k){ return CAT_COLS[k]; });
  if(missing.length) return {error: 'חסרות עמודות בקובץ: ' + missing.join(', ') + '. יש לבחור את הקובץ parit_with_product_image_links.'};

  const get = function(row, k){ return idx[k] >= 0 ? row[idx[k]] : null; };
  const str = function(v){ return v == null ? '' : String(v).replace(/`/g, "'").replace(/\s+/g, ' ').trim(); };
  const stats = {total: 0, kept: 0, notFound: 0, inactive: 0, hidden: 0, noImage: 0, dup: 0, sitePrice: 0, erpPrice: 0, noPrice: 0, hasSitePriceCol: idx.sitePrice >= 0};
  const rows = [];
  const seen = {};
  for(let r = 1; r < table.length; r++){
    const row = table[r];
    if(!row) continue;
    const code = catKey(get(row, 'code'));
    if(!code) continue;
    stats.total++;
    if(str(get(row, 'status')) !== CAT_STATUS_FOUND || !str(get(row, 'url'))){ stats.notFound++; continue; }
    if(catTruthy(get(row, 'archive')) || catTruthy(get(row, 'blocked'))){ stats.inactive++; continue; }
    const dept = str(get(row, 'dept')) || 'אחר';
    if(CAT_HIDDEN_DEPTS.indexOf(dept) !== -1){ stats.hidden++; continue; }
    const imgFull = str(get(row, 'img'));
    const img = imgFull.replace(/^https?:\/\/(www\.)?nizat\.com\/ProductsImages\//i, '');
    if(!img || /^https?:/i.test(img)){ stats.noImage++; continue; }
    if(seen[code]){ stats.dup++; continue; }
    seen[code] = true;

    /* כתובת: נשמרת בלי הדומיין ומפוענחת לעברית (חוסך ~60% מקום) */
    let url = str(get(row, 'url')).replace(/^https?:\/\/(www\.)?nizat\.com\//i, '');
    try { url = decodeURI(url); } catch(e){ url = '~' + url; }

    let price = null, priceSrc = null;
    const sp = Number(get(row, 'sitePrice'));
    const ep = Number(get(row, 'erpPrice'));
    if(get(row, 'sitePrice') != null && get(row, 'sitePrice') !== '' && sp > 0){ price = Math.round(sp * 100) / 100; priceSrc = 's'; stats.sitePrice++; }
    else if(get(row, 'erpPrice') != null && get(row, 'erpPrice') !== '' && ep > 0){ price = Math.round(ep * 100) / 100; priceSrc = 'e'; stats.erpPrice++; }
    else stats.noPrice++;

    const name = str(get(row, 'siteName')) || str(get(row, 'erpName')) || code;
    rows.push([code, name, dept, str(get(row, 'group')), str(get(row, 'supplier')), price, priceSrc, url, img]);
    stats.kept++;
  }
  if(!rows.length) return {error: 'לא נמצאו בקובץ מוצרים פעילים עם תמונה'};
  const coll = (typeof Intl !== 'undefined' && Intl.Collator) ? new Intl.Collator('he') : null;
  rows.sort(function(a, b){
    if(a[2] !== b[2]) return coll ? coll.compare(a[2], b[2]) : (a[2] < b[2] ? -1 : 1);
    if(a[3] !== b[3]) return coll ? coll.compare(a[3], b[3]) : (a[3] < b[3] ? -1 : 1);
    return coll ? coll.compare(a[1], b[1]) : (a[1] < b[1] ? -1 : 1);
  });
  /* חלוקה למסמכים לפי גודל */
  const chunks = [];
  let cur = [], curBytes = 2;
  rows.forEach(function(r){
    const b = catUtf8Bytes(JSON.stringify(r)) + 1;
    if(cur.length && curBytes + b > CAT_CHUNK_MAX_BYTES){ chunks.push(cur); cur = []; curBytes = 2; }
    cur.push(r); curBytes += b;
  });
  if(cur.length) chunks.push(cur);
  const depts = {};
  rows.forEach(function(r){ depts[r[2]] = true; });
  stats.depts = Object.keys(depts).length;
  return {rows: rows, chunks: chunks, stats: stats};
}

function catShowImportPreview(res){
  const s = res.stats;
  catPendingImport = res;
  document.getElementById('modal-body').innerHTML = `
    <h3>ייבוא קטלוג מוצרים</h3>
    <div style="font-size:14.5px;line-height:1.8;color:var(--text-primary);">
      <b>${s.kept.toLocaleString('he-IL')}</b> מוצרים יוצגו לעובדים, ב-${s.depts} מחלקות.<br>
      <span style="color:var(--text-secondary);font-size:13px;">
        מתוך ${s.total.toLocaleString('he-IL')} פריטים בקובץ: ${s.notFound.toLocaleString('he-IL')} לא נמצאו באתר,
        ${s.inactive.toLocaleString('he-IL')} בארכיון / חסומים לרכש, ${s.hidden} במחלקות פנימיות${s.noImage ? `, ${s.noImage} בלי תמונה` : ''}${s.dup ? `, ${s.dup} כפולים` : ''}.
      </span><br>
      <span style="color:var(--text-secondary);font-size:13px;">
        מחירים: ${s.sitePrice} מהאתר${s.erpPrice ? `, ${s.erpPrice} ממחיר הצרכן במערכת` : ''}${s.noPrice ? `, ${s.noPrice} בלי מחיר` : ''}.
      </span>
    </div>
    ${!s.hasSitePriceCol ? `<p style="font-size:13px;color:var(--critical);line-height:1.6;margin:10px 0 0;">⚠️ אין בקובץ עמודת "מחיר באתר" — הקובץ הופק בגרסה ישנה של הסקריפט. יוצג מחיר הצרכן מהמערכת. כדאי להריץ את NIZAT_CATALOG_UPDATER v5 ולייבא שוב.</p>` : ''}
    <p style="font-size:13px;color:var(--text-secondary);margin:10px 0 0;line-height:1.6;">הייבוא מחליף את כל הקטלוג הקיים. נשמרים רק: שם, מק"ט, מחלקה, קבוצה, ספק, מחיר, תמונה וקישור. עלויות ורווחיות לא נקראות מהקובץ.</p>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="catPendingImport=null;closeModal()">ביטול</button>
      <button class="btn-confirm" id="cat-import-go" onclick="catRunImport()">ייבוא</button>
    </div>`;
  document.getElementById('modal-overlay').classList.add('open');
}

function catRunImport(){
  const res = catPendingImport;
  if(!res || !catFirestoreReady()){ closeModal(); return; }
  const btn = document.getElementById('cat-import-go');
  if(btn){ btn.disabled = true; btn.textContent = 'מייבא…'; }
  const col = db.collection(CAT_COLLECTION);
  const chunkIds = res.chunks.map(function(_, i){ return 'c' + i; });
  const meta = {
    version: new Date().toISOString(),
    importedAt: Date.now(),
    importedBy: (typeof currentUserEmail !== 'undefined' && currentUserEmail) || null,
    total: res.rows.length,
    depts: res.stats.depts,
    chunkIds: chunkIds,
    sourceFile: res.sourceFile || null,
    priceSource: res.stats.hasSitePriceCol ? 'site' : 'erp'
  };
  /* כל חלק בנפרד (כל אחד קרוב ל-1MB — batch אחד גדול מדי) ורק בסוף _meta,
     כך שעובד שפותח באמצע הייבוא עדיין רואה את הגרסה הקודמת. */
  let p = Promise.resolve();
  res.chunks.forEach(function(rows, i){
    p = p.then(function(){
      if(btn) btn.textContent = `מייבא… (${i + 1}/${res.chunks.length})`;
      return col.doc(chunkIds[i]).set({data: JSON.stringify(rows), count: rows.length, version: meta.version});
    });
  });
  p.then(function(){
    return col.doc('_meta').set(meta);
  }).then(function(){
    /* מחיקת חלקים ישנים שכבר לא בשימוש (למשל אם הקטלוג קטן) */
    return col.get().then(function(snap){
      const dels = [];
      snap.forEach(function(doc){
        if(doc.id !== '_meta' && chunkIds.indexOf(doc.id) === -1) dels.push(doc.ref.delete());
      });
      return Promise.all(dels);
    }).catch(function(){});
  }).then(function(){
    catSetData(meta, res.rows);
    catWriteCache(meta, res.rows);
    cat.loaded = true;
    catPendingImport = null;
    closeModal();
    toast('הקטלוג יובא: ' + meta.total + ' מוצרים');
    if(typeof postFeedEvent==='function') postFeedEvent({department:'purchasing', view:'productCatalog', icon:'🛒', title:'קטלוג המוצרים עודכן', body:`${meta.total} מוצרים`});
    catRerender();
  }).catch(function(err){
    console.error('catalog: ייבוא נכשל', err);
    if(btn){ btn.disabled = false; btn.textContent = 'ייבוא'; }
    toast('הייבוא נכשל: ' + (err && err.message ? err.message : 'שגיאה לא ידועה'));
  });
}
