/* ---------- Admin (ניהול תוכן — לפי מחלקה) ---------- */
/* טאבים ששייכים בלעדית למחלקת השיווק (תחרויות מכירה, טקסטי האתר ומדדי
   התקנה) — מחלקות אחרות לא רואות אותם כלל. שאר הטאבים משותפים, אבל התוכן
   בתוכם מסונן למחלקה של המשתמש. */
const MARKETING_ONLY_TABS = ['competitions', 'texts', 'pwa', 'stats'];
function viewAdmin(){
  const myDepts = staffDepartments(currentUserEmail);
  const isMarketingDept = myDepts.indexOf('marketing') !== -1;
  const allTabs = [
    {id:'competitions', label:'תחרויות'},
    {id:'instructions', label:'הוראות'},
    {id:'events', label:'אירועים'},
    {id:'materials', label:'חומרים'},
    {id:'promoUpload', label:'מכר מבצעים'},
    {id:'feedback', label:'משוב מהסניפים'},
    {id:'stats', label:'סטטיסטיקות'},
    {id:'texts', label:'טקסטים באתר'},
    {id:'pwa', label:'התקנות PWA'},
    {id:'broadcast', label:'שידור עדכון (Push)'}
  ];
  const tabs = allTabs.filter(t => {
    if(t.id==='promoUpload') return canManageDepartment('purchasing');
    return isMarketingDept || MARKETING_ONLY_TABS.indexOf(t.id) === -1;
  });
  /* אם הטאב הפעיל אינו מורשה למשתמש הזה (למשל נשמר מסשן קודם), נופלים לראשון המותר. */
  if(!tabs.some(t=>t.id===ui.adminTab)) ui.adminTab = tabs[0].id;
  const deptLabel = myDepts.length===1 ? (DEPARTMENTS[myDepts[0]]||{}).label : null;
  return `
    <div class="page-head">
      <h1>ניהול תוכן${deptLabel ? ` · ${deptLabel}` : ''}</h1>
      <p>${getText('admin_desc')}</p>
    </div>
    <div class="admin-tabs">
      ${tabs.map(t=>`<button class="admin-tab ${ui.adminTab===t.id?'active':''}" onclick="setAdminTab('${t.id}')">${t.label}</button>`).join('')}
    </div>
    ${ui.adminTab==='competitions' ? adminList('competitions') : ''}
    ${ui.adminTab==='instructions' ? adminList('instructions') : ''}
    ${ui.adminTab==='events' ? adminList('events') : ''}
    ${ui.adminTab==='materials' ? adminList('materials') : ''}
    ${ui.adminTab==='promoUpload' ? adminPromoUpload() : ''}
    ${ui.adminTab==='feedback' ? adminFeedback() : ''}
    ${ui.adminTab==='stats' ? adminStats() : ''}
    ${ui.adminTab==='texts' ? adminTexts() : ''}
    ${ui.adminTab==='pwa' ? adminPwaInstalls() : ''}
    ${ui.adminTab==='broadcast' ? adminBroadcast() : ''}
  `;
}
/* מיפוי ברירת מחדל בין קיצור העמודה באקסל לשם הסניף המלא - נבנה יחד עם
   אלירן ב-30.08.2026. תוספות עתידיות (קיצורים חדשים שנפתרים ידנית בעת
   העלאה) נשמרות בנפרד ב-Firestore (config/promoColumnMapping) ומתמזגות
   עם המיפוי הזה - כך שאין צורך לגעת בקוד שוב. */
const DEFAULT_PROMO_COLUMN_MAPPING = {
  'ת"א': 'ניצת תל אביב אבן גבירול',
  'י-ם': 'ניצת ירושלים כנפי נשרים',
  'הרצל': 'ניצת הרצליה',
  'רעננה': 'ניצת רעננה אוסטרובסקי',
  'גוש עציון': 'ניצת גוש עציון',
  'זכרון': 'ניצת זכרון יעקב',
  'חיפה': 'ניצת חיפה קומוי (נוה שאנן)',
  'פ"ת': 'ניצת פתח תקווה סגולה',
  'ק. 8': 'ניצת קריית שמונה',
  'עפול': 'ניצת עפולה',
  'אשקל': 'ניצת אשקלון',
  'שמש': 'ניצת בית שמש',
  'שוק': 'ניצת תל אביב שוק הכרמל',
  'נתניה': 'ניצת קרית השרון',
  'פרדס': 'ניצת פרדס חנה',
  'ישי': 'ניצת רמת ישי',
  'טבר': 'ניצת טבריה',
  'בוגרשוב': 'ניצת תל אביב בוגרשוב',
  'שרון': 'ניצת רמת השרון',
  'בנימינ': 'ניצת בינימינה',
  'חורב': 'ניצת חיפה חורב',
  'כרמי': 'ניצת כרמיאל',
  'באר7': 'ניצת ב"ש מול 7',
  'אתא': 'ניצת קרית אתא',
  'יוקנ': 'ניצת יקנעם',
  'רחוב': 'ניצת רחובות מוטי קינד',
  'ראשון': 'ניצת ראשל"צ תרמ"ב',
  'מודיע': 'ניצת ביו מרקט מודיעין',
  'אריאל': 'ניצת אריאל',
  'קסטי': 'ניצת קסטינה',
  'ברוד': 'ניצת תל אביב ברודצקי',
  'סבא': 'ניצת כפ"ס הירוקה (דימרי סנטר)',
  'רגבה': 'ניצת רגבה',
  'אשדוד': 'ניצת אשדוד',
  'פינה': 'ניצת ראש פינה',
  'חולון': 'ניצת חולון',
  'ביג7': 'ניצת באר שבע ביג',
  'מונד': 'ניצת תל מונד',
  'טופ': 'ניצת תל אביב טופ דן',
  'ביתר': 'ניצת בית"ר עלית',
  'ר.צפון': 'ניצת רענננה בטבע בע"מ',
  'יכין': 'ניצת פתח תקווה יכין',
  'אילת': 'ניצת אילת',
  'טבעון': 'ניצת קרית טבעון',
  'מוצק': 'ניצת קרית מוצקין',
  'ניות': 'ניצת ירושלים ניות',
  'מכבי': 'ניצת תל אביב יהודה המכבי',
  'דיזנ': 'ניצת תל אביב דיזנגוף',
  'סמילנ': 'ניצת נתניה סמילנסקי',
  'חדרה': 'ניצת חדרה',
  'כרכור': 'ניצת כרכור',
  'יהוד': 'ניצת יהוד',
  'אגריפס': 'ניצת ירושלים אגריפס',
  'גבעת': 'ניצת גבעתיים סירקין',
  'מבשרת': 'ניצת מבשרת ציון',
  'פיאנו': 'ניצת נתניה פיאנו עיר ימים',
  'תלפיות': 'ניצת ירושלים תלפיות',
  'הוד': 'ניצת הוד השרון',
  'גן': 'ניצת רמת גן',
  'ר.מערב': 'ניצת ראשל"צ מערב',
  'אפרת': 'ניצת אפרת',
  'פלור': 'ניצת תל אביב פלורנטין',
  'נהריה': 'ניצת נהריה',
  'יבנה': 'ניצת יבנה',
  'ר.הרצל': 'ניצת רחובות הרצל',
  'שינקין': 'ניצת תל אביב שנקין',
  'שרונה': 'ניצת תל אביב שרונה',
  'אונו': 'ניצת קרית אונו',
  'מ.מרכז': 'ניצת מודיעין מרכז העיר',
  'אבן .י.': 'ניצת אבן יהודה',
  'שוהם': 'ניצת שוהם',
  'ביו כפ"ס': 'ניצת ביו מרקט כפ"ס',
  'עקיבא': 'ניצת אור עקיבא',
  'גת': 'ניצת כרמי גת',
  'ויתקין': 'ניצת כפר ויתקין',
  'חשמ': 'ניצת תל אביב החשמונאים',
  'קדי': 'ניצת קדימה',
  'כורזי': 'ניצת גבעתיים כורזין',
  'שוסט': 'ניצת תל אביב מרכז שוסטר',
  'עד ה': 'ניצת עד הלום'
};
/* המיפוי המלא בפועל = ברירת המחדל + תוספות שנלמדו ונשמרו ב-Firestore. */
function fullPromoColumnMapping(){
  return Object.assign({}, DEFAULT_PROMO_COLUMN_MAPPING, appData.promoColumnMappingExtra||{});
}
let pendingPromoImportRows = null; /* שורות הגיליון הגולמיות, ממתינות לפתרון קיצורים לא-מוכרים */
function adminPromoUpload(){
  const count = (appData.promoProducts||[]).length;
  const bookletCount = Object.keys(appData.promoBooklet||{}).length;
  return `
    <div class="card" style="margin-bottom:14px;">
      <p style="font-size:12.5px;color:var(--text-secondary);margin:0 0 16px;">
        ייבוא נתוני מכר מבצעים לפי סניף, ישירות מקובץ האקסל המקורי. בכל פעם
        שמעלים קובץ חדש, הנתונים הישנים נמחקים ומוחלפים בחדשים. עמודות מזוהות
        אוטומטית — גם קיצורים ידועים וגם כותרות שהן כבר שם הסניף המלא (למשל
        "01-ניצת תל-אביב") מותאמות ישירות מול רשימת הסניפים. רק כותרת שבאמת
        לא ניתן לזהות (למשל קיצור חדש שלא נתקלנו בו) תוצג לבחירה ידנית חד-פעמית.
      </p>
      <div style="font-size:13px;color:var(--text-secondary);margin-bottom:14px;">
        כרגע במערכת: <b>${count}</b> מוצרים.
      </div>
      <input type="file" id="promo-excel-input" accept=".xlsx,.xls" style="display:none;" onchange="handlePromoExcelUpload(event)">
      <button class="btn-import" onclick="document.getElementById('promo-excel-input').click()">📥 העלאת קובץ אקסל (מכר מבצעים)</button>
      <button class="icon-btn" style="width:auto;padding:8px 14px;font-size:12.5px;margin-inline-start:8px;color:var(--critical,#d03b3b);" onclick="resetPromoProducts()">🗑️ איפוס נתוני מכר (מחיקת הכל)</button>
      <div id="promo-upload-status" style="margin-top:12px;font-size:13px;"></div>
      <div id="promo-unresolved-area"></div>
    </div>
    <div class="card">
      <p style="font-size:12.5px;color:var(--text-secondary);margin:0 0 16px;">
        קובץ חוברת המבצעים החודשית (JSON מוכן, מופק מהחוברת המקורית) — מוסיף
        לכל קוד מבצע את התבנית, המחיר, ההערות, הגבלות סניף וקודים מאוחדים.
        בלי זה, מסך "דוח פעולה" לא יוכל להציג ניתוח. גם כאן — קובץ חדש מחליף
        את הישן במלואו.
      </p>
      <div style="font-size:13px;color:var(--text-secondary);margin-bottom:14px;">
        כרגע במערכת: <b>${bookletCount}</b> קודי מבצע מהחוברת.
      </div>
      <input type="file" id="promo-booklet-input" accept=".json" style="display:none;" onchange="handlePromoBookletUpload(event)">
      <button class="btn-import" onclick="document.getElementById('promo-booklet-input').click()">📥 העלאת קובץ חוברת מבצעים (JSON)</button>
      <button class="icon-btn" style="width:auto;padding:8px 14px;font-size:12.5px;margin-inline-start:8px;color:var(--critical,#d03b3b);" onclick="resetPromoBooklet()">🗑️ איפוס חוברת מבצעים (מחיקת הכל)</button>
      <div id="promo-booklet-status" style="margin-top:12px;font-size:13px;"></div>
    </div>
  `;
}
/* איפוס ידני - מוחק את כל הקולקציה בלי לחכות להעלאת קובץ חדש. שימושי
   כשקובץ שגוי כבר יובא (למשל בעקבות באג פענוח) ורוצים "לוח נקי" לפני
   שמנסים שוב, בלי לחכות לקובץ הבא. דורש אישור מפורש כי זו מחיקה בלתי הפיכה. */
function resetPromoProducts(){
  if(!confirm('למחוק את כל נתוני מכר המבצעים הקיימים? הפעולה בלתי הפיכה - תצטרכו להעלות קובץ אקסל מחדש.')) return;
  const statusEl = document.getElementById('promo-upload-status');
  if(statusEl) statusEl.textContent = 'מוחק נתוני מכר מבצעים...';
  db.collection('promoProducts').get().then(function(snap){
    const delBatches = [];
    let batch = db.batch(); let n=0;
    snap.forEach(function(doc){
      batch.delete(doc.ref); n++;
      if(n===450){ delBatches.push(batch); batch = db.batch(); n=0; }
    });
    if(n>0) delBatches.push(batch);
    return Promise.all(delBatches.map(b=>b.commit()));
  }).then(function(){
    if(statusEl) statusEl.textContent = 'כל נתוני מכר המבצעים נמחקו.';
  }).catch(function(err){
    if(statusEl) statusEl.textContent = 'שגיאה במחיקה: ' + err.message;
  });
}
function resetPromoBooklet(){
  if(!confirm('למחוק את כל נתוני חוברת המבצעים הקיימים? הפעולה בלתי הפיכה - תצטרכו להעלות קובץ JSON מחדש.')) return;
  const statusEl = document.getElementById('promo-booklet-status');
  if(statusEl) statusEl.textContent = 'מוחק את חוברת המבצעים...';
  db.collection('promoBooklet').get().then(function(snap){
    const delBatches = [];
    let batch = db.batch(); let n=0;
    snap.forEach(function(doc){
      batch.delete(doc.ref); n++;
      if(n===450){ delBatches.push(batch); batch = db.batch(); n=0; }
    });
    if(n>0) delBatches.push(batch);
    return Promise.all(delBatches.map(b=>b.commit()));
  }).then(function(){
    if(statusEl) statusEl.textContent = 'חוברת המבצעים נמחקה.';
  }).catch(function(err){
    if(statusEl) statusEl.textContent = 'שגיאה במחיקה: ' + err.message;
  });
}
/* ייבוא חוברת המבצעים - קובץ JSON קטן {codes:{...}} שמופק מהחוברת (ראו
   שיחה נפרדת על פענוח PDF). מחליף לגמרי את הקולקציה promoBooklet. */
function handlePromoBookletUpload(evt){
  const file = evt.target.files[0];
  if(!file) return;
  const statusEl = document.getElementById('promo-booklet-status');
  if(statusEl) statusEl.textContent = 'קורא את קובץ ה-JSON...';
  const reader = new FileReader();
  reader.onload = function(e){
    let parsed;
    try{
      parsed = JSON.parse(e.target.result);
      if(!parsed || typeof parsed!=='object' || !parsed.codes) throw new Error('מבנה קובץ לא תקין - חסר שדה codes');
    }catch(err){
      if(statusEl) statusEl.textContent = 'שגיאה בקריאת הקובץ: ' + err.message;
      return;
    }
    const codes = parsed.codes;
    if(statusEl) statusEl.textContent = `נמחקים ${Object.keys(appData.promoBooklet||{}).length} רשומות ישנות...`;
    db.collection('promoBooklet').get().then(function(snap){
      const delBatches = [];
      let batch = db.batch(); let n=0;
      snap.forEach(function(doc){
        batch.delete(doc.ref); n++;
        if(n===450){ delBatches.push(batch); batch = db.batch(); n=0; }
      });
      if(n>0) delBatches.push(batch);
      return Promise.all(delBatches.map(b=>b.commit()));
    }).then(function(){
      const codeKeys = Object.keys(codes);
      if(statusEl) statusEl.textContent = `כותב ${codeKeys.length} קודי מבצע חדשים...`;
      const writeBatches = [];
      let batch = db.batch(); let n=0;
      codeKeys.forEach(function(code){
        const m = codes[code];
        const ref = db.collection('promoBooklet').doc(code);
        batch.set(ref, {
          template: m.template||null, price: m.price!=null?Number(m.price):null,
          note: m.note||'', section: m.section||null, restricted: m.restricted||null,
          mergedInto: m.mergedInto||null, needsParticipantList: !!m.needsParticipantList,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        n++;
        if(n===450){ writeBatches.push(batch); batch = db.batch(); n=0; }
      });
      if(n>0) writeBatches.push(batch);
      return Promise.all(writeBatches.map(b=>b.commit()));
    }).then(function(){
      if(statusEl) statusEl.textContent = `הועלו ${Object.keys(codes).length} קודי מבצע בהצלחה.`;
    }).catch(function(err){
      if(statusEl) statusEl.textContent = 'שגיאה בשמירה: ' + err.message;
    });
  };
  reader.readAsText(file);
  evt.target.value = '';
}
function handlePromoExcelUpload(evt){
  const file = evt.target.files[0];
  if(!file) return;
  const statusEl = document.getElementById('promo-upload-status');
  if(statusEl) statusEl.textContent = 'קורא את קובץ האקסל...';
  const reader = new FileReader();
  reader.onload = function(e){
    let rows;
    try{
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, {type:'array', cellStyles:true});
      const sheet = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(sheet, {header:1, raw:true, defval:null});
      if(!rows.length) throw new Error('הקובץ ריק');
    }catch(err){
      if(statusEl) statusEl.textContent = 'שגיאה בקריאת הקובץ: ' + err.message;
      return;
    }
    pendingPromoImportRows = rows;
    const headers = rows[0] || [];
    /* עמודות סיכום (למשל "סך הכל"/"סה\"כ") הן לא סניף בשום צורה - יש להוציא
       אותן החוצה כאן, לפני כל ניסיון זיהוי, כדי שלא יגיעו בכלל לרשימת
       "קיצורים לא מוכרים". השוואה סלחנית לגרשיים/מרכאות כדי לתפוס גם
       'סך הכל' וגם 'סה"כ' וגם "סך-הכל". */
    function isTotalsColumnHeader(h){
      const norm = String(h).replace(/["'׳״`]/g,'').replace(/[-–]/g,' ').replace(/\s+/g,' ').trim();
      return norm==='סך הכל' || norm==='סך הכול' || norm==='סהכ' || norm.toLowerCase()==='total';
    }
    const branchCols = [...new Set(headers.slice(3)
      .filter(h=>h!=null && String(h).trim()!=='' && !isTotalsColumnHeader(h))
      .map(String))];
    const savedMapping = fullPromoColumnMapping();
    /* שלב 1: קיצורים שכבר מוכרים מהטבלה השמורה - מהיר, בלי לחכות לרשת. */
    const stillUnresolved = branchCols.filter(col=>!savedMapping[col]);
    if(!stillUnresolved.length){
      if(statusEl) statusEl.textContent = `כל ${branchCols.length} העמודות זוהו אוטומטית (מיפוי שמור).`;
      finalizePromoImport(savedMapping);
      return;
    }
    /* שלב 2: מה שלא נמצא בטבלה השמורה - ננסה התאמה ישירה מול רשימת הסניפים
       החיה (BRANCH_DIRECTORY), באותו מנגנון סלחני (normalizeBranchName +
       branchMatchScore) שכבר משמש בתחרויות ובהתאמת סניף במכר מבצעים. זה בדיוק
       פותר את המקרה שבו כותרת העמודה היא כבר שם הסניף המלא (למשל
       "01-ניצת תל-אביב") ולא קיצור - אין שום סיבה לשאול על זה ידנית. */
    if(statusEl) statusEl.textContent = 'מנסה להתאים עמודות אוטומטית מול רשימת הסניפים...';
    loadBranchDirectory().then(function(){
      const autoMatched = {};
      const trulyUnresolved = [];
      stillUnresolved.forEach(col=>{
        const entry = findBranchDirectoryEntry(col);
        if(entry) autoMatched[col] = entry.name;
        else trulyUnresolved.push(col);
      });
      const mapping = Object.assign({}, savedMapping, autoMatched);
      const matchedNowCount = Object.keys(autoMatched).length;
      const finishAuto = function(){
        if(!trulyUnresolved.length){
          const msg = matchedNowCount
            ? `${branchCols.length-stillUnresolved.length} עמודות זוהו ממיפוי שמור, ועוד ${matchedNowCount} זוהו אוטומטית מול רשימת הסניפים.`
            : `כל ${branchCols.length} העמודות זוהו אוטומטית.`;
          if(statusEl) statusEl.textContent = msg;
          finalizePromoImport(mapping);
        } else {
          if(statusEl) statusEl.textContent = `${branchCols.length-trulyUnresolved.length} מתוך ${branchCols.length} עמודות זוהו אוטומטית. נותרו ${trulyUnresolved.length} לפתרון ידני למטה.`;
          renderPromoUnresolvedForm(trulyUnresolved);
        }
      };
      /* התאמות אוטומטיות חדשות (autoMatched) נשמרות ל-Firestore מיד, כדי
         שגם הן "ייחסכו" בחודש הבא בלי לעבור שוב דרך findBranchDirectoryEntry. */
      if(matchedNowCount){
        const merged = Object.assign({}, appData.promoColumnMappingExtra||{}, autoMatched);
        db.collection('config').doc('promoColumnMapping').set({ mapping: merged }, {merge:true}).then(function(){
          appData.promoColumnMappingExtra = merged;
          finishAuto();
        }).catch(function(err){
          console.error('שמירת מיפוי אוטומטי נכשלה (לא קריטי, ממשיכים בכל זאת):', err);
          finishAuto();
        });
      } else {
        finishAuto();
      }
    });
  };
  reader.readAsArrayBuffer(file);
  evt.target.value = '';
}
/* מציגה טופס קטן לפתרון קיצורי עמודות שאינם מוכרים - בחירת סניף מרשימה
   מלאה, פעם אחת לכל קיצור. הבחירה נשמרת ב-Firestore לתמיד. */
function renderPromoUnresolvedForm(unresolvedCols){
  const areaEl = document.getElementById('promo-unresolved-area');
  if(!areaEl) return;
  areaEl.innerHTML = '<div style="margin-top:10px;font-size:13px;color:var(--text-secondary);">טוען רשימת סניפים...</div>';
  loadBranchDirectory().then(function(){
    const sortedBranches = [...BRANCH_DIRECTORY].sort((a,b)=>a.name.localeCompare(b.name,'he'));
    areaEl.innerHTML = `
      <div style="border-top:1px solid var(--gridline);margin-top:14px;padding-top:14px;">
        <div style="font-weight:500;font-size:14px;margin-bottom:10px;">קיצורים לא מוכרים — בחרו סניף לכל אחד:</div>
        ${unresolvedCols.map((col,idx)=>`
          <div class="field" style="margin-bottom:10px;">
            <label>"${col}"</label>
            <select id="promo-resolve-${idx}">
              <option value="">— בחרו סניף —</option>
              ${sortedBranches.map(b=>`<option value="${b.name.replace(/"/g,'&quot;')}">${b.name}</option>`).join('')}
            </select>
          </div>
        `).join('')}
        <button class="btn-confirm" onclick='savePromoUnresolvedAndImport(${JSON.stringify(unresolvedCols)})'>שמירה והמשך ייבוא</button>
      </div>
    `;
  });
}
function savePromoUnresolvedAndImport(unresolvedCols){
  const statusEl = document.getElementById('promo-upload-status');
  const newEntries = {};
  for(let i=0;i<unresolvedCols.length;i++){
    const val = (document.getElementById('promo-resolve-'+i)||{}).value;
    if(!val){ toast('יש לבחור סניף לכל הקיצורים לפני שממשיכים'); return; }
    newEntries[unresolvedCols[i]] = val;
  }
  const merged = Object.assign({}, appData.promoColumnMappingExtra||{}, newEntries);
  if(statusEl) statusEl.textContent = 'שומר מיפוי חדש...';
  db.collection('config').doc('promoColumnMapping').set({ mapping: merged }, {merge:true}).then(function(){
    appData.promoColumnMappingExtra = merged;
    document.getElementById('promo-unresolved-area').innerHTML = '';
    finalizePromoImport(fullPromoColumnMapping());
  }).catch(function(err){
    if(statusEl) statusEl.textContent = 'שגיאה בשמירת המיפוי: ' + err.message;
  });
}
/* בונה את רשימת המוצרים מהשורות הגולמיות + המיפוי הסופי, ומחליף את כל
   התוכן הקיים ב-Firestore (מוחק ישן, כותב חדש) - אצווה, בדיוק כמו קודם. */
function finalizePromoImport(mapping){
  const statusEl = document.getElementById('promo-upload-status');
  const rows = pendingPromoImportRows;
  if(!rows){ if(statusEl) statusEl.textContent = 'שגיאה: אין קובץ טעון.'; return; }
  const products = [];
  for(let r=1;r<rows.length;r++){
    const row = rows[r];
    if(!row || row[0]==null) continue;
    const code = row[0], title = row[1], total = row[2];
    const seen = {};
    for(let c=3;c<row.length;c++){
      const colHeader = rows[0][c];
      if(colHeader==null) continue;
      const branchName = mapping[String(colHeader)];
      const val = row[c];
      if(branchName && val){ seen[branchName] = (seen[branchName]||0) + Number(val); }
    }
    const branches = Object.keys(seen).map(name=>({name, sales: seen[name]}));
    products.push({code, title, total, branches});
  }
  if(statusEl) statusEl.textContent = `נמחקים ${(appData.promoProducts||[]).length} מוצרים ישנים...`;
  db.collection('promoProducts').get().then(function(snap){
    const delBatches = [];
    let batch = db.batch(); let n=0;
    snap.forEach(function(doc){
      batch.delete(doc.ref); n++;
      if(n===450){ delBatches.push(batch); batch = db.batch(); n=0; }
    });
    if(n>0) delBatches.push(batch);
    return Promise.all(delBatches.map(b=>b.commit()));
  }).then(function(){
    if(statusEl) statusEl.textContent = `כותב ${products.length} מוצרים חדשים...`;
    const writeBatches = [];
    let batch = db.batch(); let n=0;
    products.forEach(function(p){
      const ref = db.collection('promoProducts').doc();
      batch.set(ref, { code:p.code||null, title:p.title||'', total:p.total||0, branches:p.branches||[], department:'purchasing', updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      n++;
      if(n===450){ writeBatches.push(batch); batch = db.batch(); n=0; }
    });
    if(n>0) writeBatches.push(batch);
    return Promise.all(writeBatches.map(b=>b.commit()));
  }).then(function(){
    if(statusEl) statusEl.textContent = `הועלו בהצלחה ${products.length} מוצרים.`;
    pendingPromoImportRows = null;
    toast('נתוני מכר מבצעים עודכנו בהצלחה');
  }).catch(function(err){
    if(statusEl) statusEl.textContent = 'שגיאה בהעלאה: ' + err.message;
  });
}
function adminBroadcast(){
  return `
    <div class="card">
      <p style="font-size:12.5px;color:var(--text-secondary);margin:0 0 16px;">
        שליחת עדכון מיידי לכל מי שהפעיל התראות Push באפליקציה (מגיע גם כשהאפליקציה סגורה).
        זה נפרד לגמרי מ"הוראות ועדכונים" — משמש לעדכון חד-פעמי ודחוף.
        <br><strong>שימו לב:</strong> השידור מגיע לכל הסניפים ברשת. ההיסטוריה למטה מציגה את השידורים של המחלקה שלכם בלבד.
      </p>
      <div class="field"><label>כותרת</label><input id="broadcast-title" placeholder="כותרת ההודעה"></div>
      <div class="field"><label>תוכן</label><textarea id="broadcast-body" rows="3" placeholder="תוכן ההודעה..."></textarea></div>
      <div class="field">
        <label>אורך</label>
        <div style="display:flex;gap:16px;font-size:14px;margin-top:4px;">
          <label style="display:flex;align-items:center;gap:6px;font-weight:400;"><input type="radio" name="broadcast-length" value="short" checked> קצר</label>
          <label style="display:flex;align-items:center;gap:6px;font-weight:400;"><input type="radio" name="broadcast-length" value="long"> ארוך</label>
        </div>
      </div>
      <button class="btn-confirm" onclick="sendBroadcastPush()">📢 שליחת עדכון עכשיו</button>
    </div>
    ${broadcastHistoryHtml()}
  `;
}
/* רשימת כל מי שאמור לאשר קריאה על שידור — כל הסניפים + כל מנהלי האזור. */
function allBroadcastRecipients(){
  const branches = BRANCH_DIRECTORY.map(br=>({id:'branch:'+br.email, label:'סניף ' + br.name}));
  const areas = Object.keys(AREA_MANAGER_INFO).map(email=>({id:'area:'+AREA_MANAGER_INFO[email].label, label:'מנהל אזור · ' + AREA_MANAGER_INFO[email].label}));
  return [...branches, ...areas];
}
function broadcastHistoryHtml(){
  /* כל מחלקה רואה רק את השידורים שהיא שלחה. שידורים ותיקים בלי שדה department
     נחשבים 'marketing' ולכן ממשיכים להופיע אצל השיווק כרגיל. */
  const list = (appData.broadcasts || []).filter(b => canManageDepartment(itemDepartment(b)));
  if(!list.length) return '';
  return `
    <div class="card">
      <h3 style="margin:0 0 12px;">היסטוריית שידורים — מעקב אישור קריאה</h3>
      ${list.map(b=>broadcastReadRow(b)).join('')}
    </div>
  `;
}
function broadcastReadRow(b){
  const recipients = allBroadcastRecipients();
  const readSet = new Set((appData.itemReads||[]).filter(r=>r.type==='broadcast' && r.itemId==b.id).map(r=>r.viewerId));
  const readCount = recipients.filter(v=>readSet.has(v.id)).length;
  const total = recipients.length;
  const notRead = recipients.filter(v=>!readSet.has(v.id));
  const domId = 'bcast-read-' + b.id;
  return `
    <div class="admin-row">
      <div class="admin-row-main" style="cursor:pointer;display:flex;gap:10px;align-items:flex-start;" onclick="toggleBroadcastReadDetails('${b.id}')">
        <div style="flex:1;min-width:0;">
          <div class="t">${b.title || ''}</div>
          <div class="m">${b.body || ''}</div>
          <div class="m">✔ אושרה קריאה על ידי ${readCount} מתוך ${total} · לחצו להרחבה</div>
        </div>
        <button class="icon-btn danger" title="מחיקת שידור מההיסטוריה" onclick="event.stopPropagation();deleteBroadcastHistory('${b.id}')">✕</button>
      </div>
      <div id="${domId}" style="display:none;padding:8px 4px 4px;border-top:1px solid var(--border);margin-top:6px;">
        ${notRead.length
          ? `<div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px;">טרם אישרו קריאה (${notRead.length}):</div>
             <div style="display:flex;flex-wrap:wrap;gap:6px;">${notRead.map(v=>`<span style="background:#fdecea;color:#c0392b;border-radius:6px;padding:3px 8px;font-size:12px;">${v.label}</span>`).join('')}</div>`
          : `<div style="font-size:12px;color:#2e7d32;">כולם אישרו קריאה ✓</div>`
        }
      </div>
    </div>
  `;
}
/* מחיקת שידור מההיסטוריה (Firestore בלבד — לא שולח שום דבר, רק מנקה את
   הרשומה + רשומות "מי קרא" הקשורות אליה). זמין רק למחלקת השיווק (Firestore
   Rules כבר אוכפים isAdmin() על מחיקת broadcasts). */
function deleteBroadcastHistory(id){
  if(!confirm('למחוק את השידור הזה מההיסטוריה? הפעולה בלתי הפיכה.')) return;
  db.collection('broadcasts').doc(id).delete().then(()=>{
    toast('השידור נמחק מההיסטוריה');
    // ניקוי רשומות "מי קרא" היתומות שנשארו משידור שנמחק
    return db.collection('itemReads').where('type','==','broadcast').where('itemId','==',id).get();
  }).then(snap=>{
    if(!snap || snap.empty) return;
    const batch = db.batch();
    snap.forEach(doc=>batch.delete(doc.ref));
    return batch.commit();
  }).catch(err=>toast('שגיאה במחיקת השידור: '+err.message));
}
function toggleBroadcastReadDetails(id){
  const el = document.getElementById('bcast-read-' + id);
  if(el) el.style.display = (el.style.display==='none') ? 'block' : 'none';
}
function sendBroadcastPush(){
  const title = val('broadcast-title');
  const body = val('broadcast-body');
  if(!title || !body){ toast('נא למלא כותרת ותוכן'); return; }
  const length = document.querySelector('input[name="broadcast-length"]:checked')?.value || 'short';
  if(!firebaseReady){ toast('שידור Push דורש חיבור ל-Firebase'); return; }
  db.collection('broadcasts').add({
    title, body, length,
    department: staffDepartments(currentUserEmail)[0] || DEFAULT_DEPARTMENT,
    createdBy: currentUserEmail || 'unknown',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(()=>{
    toast('העדכון נשלח לכל מי שהפעיל התראות!');
    document.getElementById('broadcast-title').value = '';
    document.getElementById('broadcast-body').value = '';
  }).catch(err=>toast('שגיאה בשליחת העדכון: '+err.message));
}
function adminPwaInstalls(){
  const list = [...(appData.pwaInstalls||[])].sort((a,b)=> (b.installedAt||'').localeCompare(a.installedAt||''));
  return `
    <div class="card">
      <p style="font-size:12.5px;color:var(--text-secondary);margin:0 0 16px;">
        רשימת המשתמשים שהתקינו את NIZAT HUB כאפליקציה (PWA) על המכשיר שלהם. סה״כ ${list.length} התקנות.
      </p>
      ${list.length ? list.map(r=>`
        <div class="admin-row">
          <div class="admin-row-main">
            <div class="t">${r.label || 'לא ידוע'}</div>
            <div class="m">${r.installedAt || ''}</div>
          </div>
        </div>
      `).join('') : `<div class="empty-state">עדיין אין רישום של התקנות.</div>`}
    </div>
  `;
}
function setAdminTab(t){ ui.adminTab=t; renderContent(); }
function adminTexts(){
  const keys = Object.keys(SITE_TEXT_LABELS);
  return `
    <div class="card">
      <p style="font-size:12.5px;color:var(--text-secondary);margin:0 0 16px;">
        עריכת הטקסטים המרכזיים שמופיעים באתר. שינוי כאן משתקף מיידית אצל כולם — כולל סניפים ומנהלי אזור.
      </p>
      ${keys.map(k=>`
        <div class="field">
          <label>${SITE_TEXT_LABELS[k]}</label>
          <textarea id="text-${k}" rows="2">${getText(k)}</textarea>
        </div>
      `).join('')}
      <button class="btn-confirm" style="width:auto;padding:10px 24px;" onclick="saveSiteTexts()">שמירת כל הטקסטים</button>
    </div>
  `;
}
function saveSiteTexts(){
  const keys = Object.keys(SITE_TEXT_LABELS);
  const obj = {};
  keys.forEach(k=>{
    const el = document.getElementById('text-'+k);
    obj[k] = el ? el.value : '';
  });
  if(firebaseReady){
    db.collection('siteTexts').doc('main').set(obj, {merge:true})
      .then(()=>toast('הטקסטים נשמרו בהצלחה'))
      .catch(err=>toast('שגיאה בשמירת הטקסטים: '+err.message));
    return;
  }
  appData.siteTexts = Object.assign({}, appData.siteTexts, obj);
  renderContent();
  toast('הטקסטים נשמרו בהצלחה');
}

function adminList(type){
  const titleMap = {competitions:'תחרויות', instructions:'הוראות', materials:'הורדה חומרי שיווק / דיגיטל ורשתות חברתיות', events:'אירועים'};
  /* כל מחלקה רואה ומנהלת רק את התוכן שלה. תוכן ותיק בלי שדה department נחשב
     'marketing' דרך itemDepartment(), ולכן ממשיך להופיע אצל השיווק כרגיל. */
  const items = (appData[type]||[]).filter(it => canManageDepartment(itemDepartment(it)));
  return `
    <div class="admin-toolbar">
      <div style="font-size:13px;color:var(--text-secondary);">${items.length} פריטים · ${titleMap[type]}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${type==='competitions' ? `<button class="btn-import" onclick="triggerCompetitionImport()">📥 ייבוא מאקסל</button>` : ''}
        ${type==='materials' ? `<button class="btn-import" onclick="document.getElementById('material-folder-input').click()">📁 העלאת תיקייה שלמה</button>` : ''}
        ${type==='materials' ? `<button class="btn-import" onclick="document.getElementById('material-files-input').click()">🗂 בחירת קבצים בודדים</button>` : ''}
        <button class="btn-add" onclick="openForm('${type}')">+ הוספת פריט חדש</button>
      </div>
    </div>
    ${type==='competitions' ? `<input type="file" id="daily-report-input" accept=".xlsx,.xls" style="display:none;" onchange="handleDailyReportFile(event)">` : ''}
    ${type==='materials' ? `<input type="file" id="material-folder-input" webkitdirectory directory multiple style="display:none;" onchange="handleMaterialFolderUpload(event)">` : ''}
    ${type==='materials' ? `<input type="file" id="material-files-input" multiple style="display:none;" onchange="handleMaterialFilesUpload(event)">` : ''}
    <div class="card">
      ${items.map(it=>adminRow(type, it)).join('') || '<div class="empty-state">אין פריטים עדיין. לחצו על "הוספת פריט חדש".</div>'}
    </div>
  `;
}
function adminRow(type, it){
  let meta = '';
  if(type==='competitions') meta = `${STATUS_LABEL[it.status]} · <span dir="ltr">${it.start} – ${it.end}</span>${it.groups && it.groups.length ? ` · ${it.groups.length} קבוצות (מיובא מאקסל)` : ''}${it.salesUpdatedAt ? ` · מכירות עודכנו ${it.salesUpdatedAt}` : ''}`;
  if(type==='instructions') meta = `${it.category} · ${PRIORITY_LABEL[it.priority]} · ${it.date}${it.time ? ' '+it.time : ''}`;
  if(type==='materials') meta = `${it.category} · ${it.type} · ${it.size} · ${it.date}${it.time ? ' '+it.time : ''}`;
  if(type==='events'){
    const audienceLabel = it.audience==='branch' ? ` · 🎯 סניפי: ${(BRANCH_DIRECTORY.find(b=>b.email===it.targetBranchEmail)||{}).name || it.targetBranchEmail}`
      : it.audience==='area' ? ` · 🎯 אזורי: ${it.targetAreaLabel}`
      : ' · 🌐 ארצי';
    meta = `${it.category} · ${it.date}${it.endDate && it.endDate!==it.date ? ' – '+it.endDate : ''}${audienceLabel}`;
  }
  return `
    <div class="admin-row">
      <div class="admin-row-main" style="cursor:pointer;" onclick="openForm('${type}', '${it.id}')">
        <div class="t">${it.title || it.name}</div>
        <div class="m">${meta}</div>
      </div>
      ${type==='competitions' && it.groups && it.groups.length ? `<button class="icon-btn" onclick="event.stopPropagation();triggerDailyReportImport('${it.id}')" title="עדכון דוח מכירות יומי">📈</button>` : ''}
      <button class="icon-btn" onclick="event.stopPropagation();openForm('${type}', '${it.id}')" title="עריכה">✎</button>
      <button class="icon-btn danger" onclick="event.stopPropagation();confirmDelete('${type}', '${it.id}')" title="מחיקה">🗑</button>
    </div>
  `;
}
function adminFeedback(){
  /* כל מחלקה רואה רק תגובות על פריטים שבבעלותה. */
  const list = [...appData.comments]
    .filter(c => canManageDepartment(itemDepartmentByRef(c.itemType, c.itemId)))
    .sort((a,b)=>parseHebDate(b.date)-parseHebDate(a.date));
  const findTitle = (c)=>{
    const src = c.itemType==='instruction' ? appData.instructions : appData.competitions;
    const item = src.find(x=>x.id==c.itemId);
    return item ? item.title : '(פריט נמחק)';
  };
  return `
    <div class="admin-toolbar">
      <div style="font-size:13px;color:var(--text-secondary);">${list.length} תגובות מכלל הסניפים</div>
    </div>
    <div class="card">
      ${list.map(c=>`
        <div class="admin-row" style="align-items:flex-start;">
          <div class="comment-avatar" style="margin-top:2px;">${(c.branchName||'').replace('סניף ','').slice(0,2)}</div>
          <div class="admin-row-main">
            <div class="t">${c.branchName} <span style="font-weight:500;color:var(--muted);">· ${c.date}</span></div>
            <div class="m" style="margin-top:3px;">${c.text}</div>
            <div class="m" style="margin-top:4px;"><span class="badge cat" style="padding:2px 8px;">${c.itemType==='instruction'?'הוראה':'תחרות'}</span> ${findTitle(c)}</div>
          </div>
        </div>
      `).join('') || '<div class="empty-state">אין עדיין משוב מהסניפים.</div>'}
    </div>
  `;
}
function adminStats(){
  const activeCompsCount = appData.competitions.filter(c=>c.status==='active').length;
  const activity = appData.viewerActivity || [];
  const branchActivity = {};
  activity.forEach(a=>{ if(a.role==='branch') branchActivity[a.viewerId] = a; });
  const totalBranches = getTotalBranches();
  const nowMs = Date.now();
  const weekAgoMs = nowMs - 7*86400000;
  const everEntered = BRANCH_DIRECTORY.filter(b=>branchActivity['branch:'+b.email]).length;
  const enteredThisWeek = BRANCH_DIRECTORY.filter(b=>{
    const a = branchActivity['branch:'+b.email];
    if(!a) return false;
    const t = parseHebDate(a.lastSeenDate);
    return !isNaN(t) && t >= weekAgoMs;
  }).length;
  const neverEntered = BRANCH_DIRECTORY.filter(b=>!branchActivity['branch:'+b.email])
    .sort((a,b)=>a.name.localeCompare(b.name,'he'));
  const enteredButStale = BRANCH_DIRECTORY.filter(b=>{
    const a = branchActivity['branch:'+b.email];
    if(!a) return false;
    const t = parseHebDate(a.lastSeenDate);
    return !isNaN(t) && t < weekAgoMs;
  }).sort((a,b)=>{
    const ta = parseHebDate((branchActivity['branch:'+a.email]||{}).lastSeenDate) || 0;
    const tb = parseHebDate((branchActivity['branch:'+b.email]||{}).lastSeenDate) || 0;
    return ta - tb; /* הכי ותיק-לא-נכנס קודם */
  });
  return `
    <div class="stat-row">
      <div class="stat-tile"><div class="label">סניפים רשומים</div><div class="value">${totalBranches}</div><div class="delta flat">מתוך רשת מלאה</div></div>
      <div class="stat-tile"><div class="label">נכנסו אי פעם</div><div class="value">${everEntered}</div><div class="delta ${everEntered===totalBranches?'good':'flat'}">מתוך ${totalBranches}</div></div>
      <div class="stat-tile"><div class="label">נכנסו השבוע</div><div class="value">${enteredThisWeek}</div><div class="delta ${enteredThisWeek>0?'good':'flat'}">7 הימים האחרונים</div></div>
      <div class="stat-tile"><div class="label">הורדה חומרי שיווק / דיגיטל ורשתות חברתיות</div><div class="value">${appData.materials.length}</div><div class="delta flat">זמינים בספרייה</div></div>
    </div>
    ${neverEntered.length ? `
    <div class="card" style="padding:18px 20px;margin-bottom:14px;">
      <h3 style="margin:0 0 10px;font-size:14.5px;color:var(--critical,#A32D2D);">מעולם לא נכנסו (${neverEntered.length})</h3>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">
        ${neverEntered.map(b=>`<span style="font-size:12px;padding:3px 9px;border-radius:8px;background:var(--bg-danger,#FCEBEB);color:var(--critical,#A32D2D);">${b.name}</span>`).join('')}
      </div>
    </div>` : ''}
    ${enteredButStale.length ? `
    <div class="card" style="padding:18px 20px;">
      <h3 style="margin:0 0 10px;font-size:14.5px;">נכנסו בעבר, לא לאחרונה (${enteredButStale.length})</h3>
      ${enteredButStale.slice(0,15).map(b=>{
        const a = branchActivity['branch:'+b.email];
        return `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--gridline);font-size:13px;">
          <span>${b.name}</span><span style="color:var(--text-secondary);">נכנס לאחרונה ${a.lastSeenDate} · סה"כ ${a.visitCount||1} כניסות</span>
        </div>`;
      }).join('')}
      ${enteredButStale.length>15 ? `<div style="font-size:12px;color:var(--muted);margin-top:8px;">ועוד ${enteredButStale.length-15}...</div>` : ''}
    </div>` : ''}
    ${(!neverEntered.length && !enteredButStale.length && everEntered>0) ? `<div class="card"><div class="empty-state">כל הסניפים נכנסו לאחרונה — מצוין!</div></div>` : ''}
  `;
}

/* ---------- Add/Edit Form Modal ---------- */
let formState = {type:null, editId:null};
function openForm(type, editId){
  formState = {type, editId: editId || null};
  const item = editId ? appData[type].find(x=>x.id==editId) : null;
  const titleMap = {competitions:'תחרות', instructions:'הוראה', materials:'חומר להורדה', events:'אירוע'};
  let fieldsHtml = '';

  if(type==='events'){
    const audience = item?.audience || 'all';
    const sortedBranches = [...BRANCH_DIRECTORY].sort((a,b)=>a.name.localeCompare(b.name,'he'));
    fieldsHtml = `
      <div class="field"><label>כותרת</label><input id="f-title" value="${item?.title||''}"></div>
      <div class="field"><label>קטגוריה</label><input id="f-category" value="${item?.category||''}" placeholder="השקה / הדרכה / מבצע / תחרות / ביקורת / כנס"></div>
      <div class="field"><label>תאריך התחלה</label><input id="f-date" value="${item?.date||''}" placeholder="DD.MM.YYYY"></div>
      <div class="field"><label>תאריך סיום (אופציונלי)</label><input id="f-end-date" value="${item?.endDate||''}" placeholder="DD.MM.YYYY"></div>
      <div class="field">
        <label>קהל יעד</label>
        <div style="display:flex;gap:16px;font-size:14px;margin-top:4px;flex-wrap:wrap;">
          <label style="display:flex;align-items:center;gap:6px;font-weight:400;"><input type="radio" name="f-event-audience" value="all" ${audience==='all'?'checked':''} onchange="toggleEventAudienceFields()"> ארצי (כל הרשת)</label>
          <label style="display:flex;align-items:center;gap:6px;font-weight:400;"><input type="radio" name="f-event-audience" value="branch" ${audience==='branch'?'checked':''} onchange="toggleEventAudienceFields()"> סניפי (סניף ספציפי)</label>
          <label style="display:flex;align-items:center;gap:6px;font-weight:400;"><input type="radio" name="f-event-audience" value="area" ${audience==='area'?'checked':''} onchange="toggleEventAudienceFields()"> אזורי (מנהל אזור ספציפי)</label>
        </div>
      </div>
      <div id="f-event-branch-field" class="field" style="display:${audience==='branch'?'block':'none'};">
        <label>בחירת סניף</label>
        <select id="f-event-branch">
          <option value="">— בחרו סניף —</option>
          ${sortedBranches.map(b=>`<option value="${b.email}" ${item?.targetBranchEmail===b.email?'selected':''}>${b.name}</option>`).join('')}
        </select>
      </div>
      <div id="f-event-area-field" class="field" style="display:${audience==='area'?'block':'none'};">
        <label>בחירת מנהל אזור</label>
        <select id="f-event-area">
          <option value="">— בחרו מנהל אזור —</option>
          ${Object.keys(AREA_MANAGER_INFO).map(email=>`<option value="${AREA_MANAGER_INFO[email].label}" ${item?.targetAreaLabel===AREA_MANAGER_INFO[email].label?'selected':''}>${AREA_MANAGER_INFO[email].label}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>תיאור</label><textarea id="f-desc">${item?.desc||''}</textarea></div>
    `;
  } else if(type==='competitions'){
    pendingImportGroups = null;
    pendingImportManagerColors = null;
    pendingImportRawTable = null;
    pendingImportHeaderRowCells = null;
    pendingLogoDataUrl = undefined;
    pendingHeroDesktopUrl = undefined;
    pendingHeroMobileUrl = undefined;
    formCurrentLogo = item && item.logoDataUrl ? item.logoDataUrl : null;
    const totalBranches = item && item.groups ? item.groups.reduce((s,g)=>s+g.branches.length,0) : 0;
    fieldsHtml = `
      <div class="field"><label>כותרת</label><input id="f-title" value="${item?.title||''}"></div>
      <div class="field"><label>קטגוריה</label><input id="f-category" value="${item?.category||''}" placeholder="מכירות / שירות / מיתוג"></div>
      <div class="field"><label>סטטוס</label>
        <select id="f-status">
          <option value="active" ${item?.status==='active'?'selected':''}>פעילה</option>
          <option value="upcoming" ${item?.status==='upcoming'?'selected':''}>מתוכננת</option>
          <option value="ended" ${item?.status==='ended'?'selected':''}>הסתיימה</option>
        </select>
      </div>
      <div class="field"><label>תאריך התחלה</label><input id="f-start" value="${item?.start||''}" placeholder="DD.MM.YYYY"></div>
      <div class="field"><label>תאריך סיום</label><input id="f-end" value="${item?.end||''}" placeholder="DD.MM.YYYY"></div>
      <div class="field"><label>פרס</label><input id="f-prize" value="${item?.prize||''}"></div>
      <div class="field"><label>תיאור</label><textarea id="f-desc">${item?.desc||''}</textarea></div>
      <div class="field">
        <label>לוגו התחרות (אופציונלי)</label>
        <div class="logo-field-row">
          <div class="logo-preview" id="f-logo-preview">${logoPreviewBoxHtml(formCurrentLogo)}</div>
          <div>
            <button type="button" class="btn-import" onclick="document.getElementById('f-logo-input').click()">📷 בחירת לוגו</button>
            <input type="file" id="f-logo-input" accept="image/*" style="display:none;" onchange="handleLogoFileChange(event)">
            <div id="f-logo-remove-wrap">${logoRemoveHtml(formCurrentLogo)}</div>
            <p class="field-hint">הלוגו יוצג לסניפים בראש דף התחרות. מומלץ קובץ עם רקע שקוף (PNG).</p>
          </div>
        </div>
      </div>
      <div class="field">
        <label>תמונת קידום — דסקטופ (רחבה)</label>
        <button type="button" class="btn-import" onclick="document.getElementById('f-hero-desktop-input').click()">🖼 בחירת תמונה רחבה</button>
        <input type="file" id="f-hero-desktop-input" accept="image/*" style="display:none;" onchange="handleHeroFileChange(event,'desktop')">
        <div class="field-hint" id="f-hero-desktop-status">${item?.heroDesktopUrl ? '✓ תמונה קיימת. בחרו קובץ כדי להחליף.' : 'תמונה רחבה (כמו קרוסלת מוצרים) שתוצג כבאנר בראש עמוד התחרות במחשב.'}</div>
      </div>
      <div class="field">
        <label>תמונת קידום — מובייל (סטורי, אנכית)</label>
        <button type="button" class="btn-import" onclick="document.getElementById('f-hero-mobile-input').click()">📱 בחירת תמונת סטורי</button>
        <input type="file" id="f-hero-mobile-input" accept="image/*" style="display:none;" onchange="handleHeroFileChange(event,'mobile')">
        <div class="field-hint" id="f-hero-mobile-status">${item?.heroMobileUrl ? '✓ תמונה קיימת. בחרו קובץ כדי להחליף.' : 'אותו קמפיין, בפורמט סטורי אנכי — יוצג רק בטלפון, במקום התמונה הרחבה.'}</div>
      </div>
      <div class="field">
        <label>קבוצות, יעדים וסניפים מאקסל (אופציונלי)</label>
        ${totalBranches ? `
        <div style="background:rgba(12,163,12,0.10);border:1px solid rgba(12,163,12,0.25);border-radius:8px;padding:10px 12px;margin-bottom:10px;font-size:13px;color:#0ca30c;font-weight:500;">
          ✓ הנתונים כבר שמורים: ${item.groups.length} קבוצות ו-${totalBranches} סניפים מיובאים ושמורים במערכת. אין צורך להעלות שוב אלא אם רוצים להחליף אותם.
        </div>` : ''}
        <button type="button" class="btn-import" onclick="document.getElementById('f-excel-input').click()">📥 בחירת קובץ אקסל</button>
        <input type="file" id="f-excel-input" accept=".xlsx,.xls" style="display:none;" onchange="handleFormExcelFile(event)">
        <div class="field-hint" id="f-excel-status">${totalBranches ? `⚠️ העלאת קובץ חדש כאן תחליף לגמרי את ${item.groups.length} הקבוצות והנתונים הקיימים. השאירו את זה ריק אם אתם רק עורכים פרטים אחרים (כמו תאריכים או פרסים).` : 'האקסל יכול לכלול חלוקה לקבוצות, יעד ומכירות לכל סניף, וגם טווח תאריכים (אם קיים בקובץ) לזיהוי אוטומטי.'}</div>
      </div>
    `;
  } else if(type==='instructions'){
    const reqAction = item?.requiresAction || false;
    pendingInstructionImageUrl = undefined;
    fieldsHtml = `
      <div class="field"><label>כותרת</label><input id="f-title" value="${item?.title||''}"></div>
      <div class="field"><label>קטגוריה</label><input id="f-category" value="${item?.category||''}" placeholder="מחירים / שירות / מיתוג / כללי"></div>
      <div class="field"><label>עדיפות</label>
        <select id="f-priority">
          <option value="normal" ${item?.priority==='normal'?'selected':''}>רגיל</option>
          <option value="urgent" ${item?.priority==='urgent'?'selected':''}>דחוף</option>
        </select>
      </div>
      <div class="field"><label>תאריך</label><input id="f-date" value="${item?.date||''}" placeholder="DD.MM.YYYY"></div>
      <div class="field">
        <label>אורך העדכון</label>
        <div style="display:flex;gap:16px;font-size:14px;margin-top:4px;">
          <label style="display:flex;align-items:center;gap:6px;font-weight:400;"><input type="radio" name="f-instr-length" value="short" ${item?.updateLength==='short'?'checked':''}> עדכון קצר (מוצג מלא, בלי צורך לפתוח)</label>
          <label style="display:flex;align-items:center;gap:6px;font-weight:400;"><input type="radio" name="f-instr-length" value="long" ${item?.updateLength!=='short'?'checked':''}> עדכון מפורט (נפתח בלחיצה)</label>
        </div>
      </div>
      <div class="field">
        <label>סוג ההוראה</label>
        <div style="display:flex;gap:16px;font-size:14px;margin-top:4px;">
          <label style="display:flex;align-items:center;gap:6px;font-weight:400;"><input type="radio" name="f-instr-type" value="info" ${!reqAction?'checked':''} onchange="toggleInstrActionFields()"> לידיעה בלבד</label>
          <label style="display:flex;align-items:center;gap:6px;font-weight:400;"><input type="radio" name="f-instr-type" value="action" ${reqAction?'checked':''} onchange="toggleInstrActionFields()"> נדרש ביצוע</label>
        </div>
      </div>
      <div id="f-instr-action-fields" style="display:${reqAction?'block':'none'};">
        <div class="field"><label>תאריך יעד לביצוע</label><input id="f-instr-due" value="${item?.dueDate||''}" placeholder="DD.MM.YYYY"></div>
        <div class="field">
          <label style="display:flex;align-items:center;gap:8px;font-weight:400;"><input type="checkbox" id="f-instr-photo" ${item?.requiresPhoto?'checked':''}> נדרש צילום מהסניף כהוכחת ביצוע</label>
        </div>
        <div class="field">
          <label>קהל יעד</label>
          <div style="font-size:13px;color:var(--text-secondary);margin-top:4px;">כל הסניפים (בחירת סניפים ספציפיים תיתמך בעתיד)</div>
        </div>
      </div>
      <div class="field"><label>תוכן ההוראה</label><textarea id="f-body">${item?.body||''}</textarea></div>
      <div class="field">
        <label>תמונה להמחשה (אופציונלי)</label>
        <button type="button" class="btn-import" onclick="document.getElementById('f-instr-image-input').click()">🖼 בחירת תמונה</button>
        <input type="file" id="f-instr-image-input" accept="image/*" style="display:none;" onchange="handleInstructionImageFileChange(event)">
        <div class="field-hint" id="f-instr-image-status"></div>
        <div id="f-instr-image-preview-wrap"></div>
      </div>
    `;
  } else {
    pendingMaterialFile = null;
    pendingMaterialThumbUrl = undefined;
    const hasExistingFile = item && item.fileUrl;
    const itemTags = item?.tags || [];
    fieldsHtml = `
      <div class="field"><label>שם הקובץ (לתצוגה)</label><input id="f-name" value="${item?.name||''}"></div>
      <div class="field"><label>קטגוריה</label><input id="f-category" value="${item?.category||''}" placeholder="באנרים דיגיטליים / שילוט לחנות / ..."></div>
      <div class="field">
        <label>קובץ</label>
        ${hasExistingFile ? `
        <div style="background:rgba(12,163,12,0.10);border:1px solid rgba(12,163,12,0.25);border-radius:8px;padding:10px 12px;margin-bottom:10px;font-size:13px;color:#0ca30c;font-weight:500;">
          ✓ קיים קובץ שמור: ${item.type} · ${item.size}. בחרו קובץ חדש רק אם רוצים להחליף אותו.
        </div>` : ''}
        <button type="button" class="btn-import" onclick="document.getElementById('f-material-file-input').click()">📎 בחירת קובץ</button>
        <input type="file" id="f-material-file-input" style="display:none;" onchange="handleMaterialFileChange(event)">
        <div class="field-hint" id="f-material-file-status">${hasExistingFile ? '' : 'בחרו קובץ להעלאה (PDF, תמונה, PPTX, ZIP וכו׳).'}</div>
      </div>
      <div class="field">
        <label>תמונת תצוגה מקדימה (אופציונלי — מומלץ לקבצי PDF)</label>
        <button type="button" class="btn-import" onclick="document.getElementById('f-material-thumb-input').click()">🖼 בחירת תמונה</button>
        <input type="file" id="f-material-thumb-input" accept="image/*" style="display:none;" onchange="handleMaterialThumbChange(event)">
        <div class="field-hint" id="f-material-thumb-status">${item?.thumbUrl ? '✓ קיימת תמונת תצוגה מקדימה' : ''}</div>
      </div>
      <div class="field">
        <label>תגיות</label>
        <div id="f-material-tags-list" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px;">
          ${allMaterialTags().map(t=>`
            <label style="display:flex;align-items:center;gap:5px;font-weight:400;font-size:13px;background:#f2f3f5;border-radius:99px;padding:5px 10px;">
              <input type="checkbox" class="f-material-tag-cb" value="${t.id}" ${itemTags.includes(t.id)?'checked':''}> ${t.icon} ${t.label}
            </label>
          `).join('')}
        </div>
        <div style="display:flex;gap:8px;margin-top:8px;">
          <input id="f-material-new-tag" placeholder="הוספת תגית חדשה..." style="flex:1;">
          <button type="button" class="btn-secondary" onclick="addCustomMaterialTag()">+ הוספה</button>
        </div>
      </div>
    `;
  }

  document.getElementById('modal-body').innerHTML = `
    <h3>${editId ? 'עריכת' : 'הוספת'} ${titleMap[type]}</h3>
    ${fieldsHtml}
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">ביטול</button>
      <button class="btn-confirm" onclick="saveForm()">שמירה</button>
    </div>
  `;
  document.getElementById('modal-overlay').classList.add('open');
  if(type==='instructions') renderInstructionImagePreview();
}
function saveForm(){
  const {type, editId} = formState;
  let obj;
  if(type==='events'){
    const eventAudience = document.querySelector('input[name="f-event-audience"]:checked')?.value || 'all';
    if(eventAudience==='branch' && !val('f-event-branch')){ toast('נא לבחור סניף עבור אירוע סניפי'); return; }
    if(eventAudience==='area' && !val('f-event-area')){ toast('נא לבחור מנהל אזור עבור אירוע אזורי'); return; }
    obj = {
      title: val('f-title'), category: val('f-category'), date: val('f-date'), endDate: val('f-end-date') || null, desc: val('f-desc'), unread: true,
      audience: eventAudience,
      targetBranchEmail: eventAudience==='branch' ? val('f-event-branch') : null,
      targetAreaLabel: eventAudience==='area' ? val('f-event-area') : null
    };
  } else if(type==='competitions'){
    const existing = editId ? appData.competitions.find(x=>x.id==editId) : null;
    // pendingImportGroups is only non-null when an Excel was attached THIS form session
    // (via the "בחירת קובץ אקסל" control) — that always wins, whether creating new or
    // editing an existing competition. Otherwise fall back to whatever the item already had.
    obj = {
      title: val('f-title'), category: val('f-category'), status: val('f-status'),
      start: val('f-start'), end: val('f-end'), prize: val('f-prize'), desc: val('f-desc'),
      leaderboard: existing ? existing.leaderboard : [],
      updates: existing ? (existing.updates || []) : [],
      groups: pendingImportGroups!==null ? pendingImportGroups : (existing ? (existing.groups || []) : []),
      managerColors: pendingImportGroups!==null ? (pendingImportManagerColors || {}) : (existing ? (existing.managerColors || {}) : {}),
      rawTable: pendingImportGroups!==null ? (pendingImportRawTable || null) : (existing ? (existing.rawTable || null) : null),
      headerRowCells: pendingImportGroups!==null ? (pendingImportHeaderRowCells || null) : (existing ? (existing.headerRowCells || null) : null),
      logoDataUrl: pendingLogoDataUrl!==undefined ? pendingLogoDataUrl : (existing ? (existing.logoDataUrl || null) : null),
      heroDesktopUrl: pendingHeroDesktopUrl!==undefined ? pendingHeroDesktopUrl : (existing ? (existing.heroDesktopUrl || null) : null),
      heroMobileUrl: pendingHeroMobileUrl!==undefined ? pendingHeroMobileUrl : (existing ? (existing.heroMobileUrl || null) : null),
      salesUpdatedAt: existing ? (existing.salesUpdatedAt || null) : null,
      unread: true
    };
    pendingImportGroups = null;
    pendingImportManagerColors = null;
    pendingImportRawTable = null;
    pendingImportHeaderRowCells = null;
    pendingLogoDataUrl = undefined;
    pendingHeroDesktopUrl = undefined;
    pendingHeroMobileUrl = undefined;
  } else if(type==='instructions'){
    const requiresAction = document.querySelector('input[name="f-instr-type"]:checked')?.value === 'action';
    const dueDate = requiresAction ? val('f-instr-due') : '';
    if(requiresAction && !dueDate){ toast('נא למלא תאריך יעד לביצוע'); return; }
    const existingInstr = editId ? appData.instructions.find(x=>x.id==editId) : null;
    const updateLength = document.querySelector('input[name="f-instr-length"]:checked')?.value || 'long';
    obj = {
      title: val('f-title'), category: val('f-category'), priority: val('f-priority'),
      date: val('f-date'), body: val('f-body'), unread: true, updateLength,
      time: existingInstr ? (existingInstr.time || null) : new Date().toLocaleTimeString('he-IL', {hour:'2-digit', minute:'2-digit'}),
      requiresAction, dueDate: requiresAction ? dueDate : null,
      requiresPhoto: requiresAction ? !!document.getElementById('f-instr-photo').checked : false,
      targetBranches: 'all',
      imageUrl: pendingInstructionImageUrl!==undefined ? pendingInstructionImageUrl : (existingInstr ? (existingInstr.imageUrl || null) : null)
    };
    pendingInstructionImageUrl = undefined;
  } else {
    const existingMaterial = editId ? appData.materials.find(x=>x.id==editId) : null;
    const fileInfo = pendingMaterialFile || (existingMaterial ? {url: existingMaterial.fileUrl, type: existingMaterial.type, size: existingMaterial.size} : null);
    if(!fileInfo){ toast('נא לבחור קובץ להעלאה לפני השמירה'); return; }
    const selectedTags = [...document.querySelectorAll('.f-material-tag-cb:checked')].map(cb=>cb.value);
    obj = {
      name: val('f-name'), category: val('f-category'), type: fileInfo.type, size: fileInfo.size, fileUrl: fileInfo.url, date: todayHeb(), unread: true,
      time: existingMaterial ? (existingMaterial.time || null) : new Date().toLocaleTimeString('he-IL', {hour:'2-digit', minute:'2-digit'}),
      tags: selectedTags,
      thumbUrl: pendingMaterialThumbUrl!==undefined ? pendingMaterialThumbUrl : (existingMaterial ? (existingMaterial.thumbUrl || null) : null)
    };
    pendingMaterialFile = null;
    pendingMaterialThumbUrl = undefined;
  }

  /* תיוג מחלקה: פריט חדש מתויג במחלקה של מי שיצר אותו (למי שמשויך ליותר
     ממחלקה אחת — במחלקה הראשונה שלו). בעריכה שומרים על המחלקה המקורית ולא
     משנים בעלות. תוכן ישן בלי השדה נחשב ל'marketing' דרך itemDepartment(). */
  if(!obj.department){
    const existingItem = editId ? (appData[type]||[]).find(x=>x.id==editId) : null;
    obj.department = existingItem ? itemDepartment(existingItem)
      : (staffDepartments(currentUserEmail)[0] || DEFAULT_DEPARTMENT);
  }

  if(FIRESTORE_BACKED_TYPES.indexOf(type) !== -1 && firebaseReady){
    /* מודולים אלה נשמרים ב-Firestore ומתעדכנים אצל כולם בזמן אמת דרך onSnapshot
       ב-initFirestoreSync(). אין כאן עדכון ידני של appData — ה-snapshot כבר יטפל
       בכך ויקרא לרינדור מחדש. */
    closeModal();
    if(editId){
      db.collection(type).doc(editId).update(obj)
        .then(()=>toast('העדכון נשמר בהצלחה'))
        .catch(err=>toast('שגיאה בשמירה: '+err.message));
    } else {
      obj.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      db.collection(type).add(obj)
        .then(()=>toast('הפריט נוסף בהצלחה'))
        .catch(err=>toast('שגיאה בהוספה: '+err.message));
    }
    return;
  }

  if(editId){
    const idx = appData[type].findIndex(x=>x.id==editId);
    appData[type][idx] = {...appData[type][idx], ...obj};
    toast('העדכון נשמר בהצלחה');
  } else {
    obj.id = nextIds[type]++;
    appData[type].push(obj);
    toast('הפריט נוסף בהצלחה');
  }
  closeModal();
  renderContent();
}
function toggleInstrActionFields(){
  const isAction = document.querySelector('input[name="f-instr-type"]:checked')?.value === 'action';
  const el = document.getElementById('f-instr-action-fields');
  if(el) el.style.display = isAction ? 'block' : 'none';
}
function toggleEventAudienceFields(){
  const audience = document.querySelector('input[name="f-event-audience"]:checked')?.value || 'all';
  const branchEl = document.getElementById('f-event-branch-field');
  const areaEl = document.getElementById('f-event-area-field');
  if(branchEl) branchEl.style.display = audience==='branch' ? 'block' : 'none';
  if(areaEl) areaEl.style.display = audience==='area' ? 'block' : 'none';
}
function val(id){ return document.getElementById(id).value.trim(); }
function todayHeb(){
  const d = new Date();
  return String(d.getDate()).padStart(2,'0')+'.'+String(d.getMonth()+1).padStart(2,'0')+'.'+d.getFullYear();
}

/* ---------- Delete confirm ---------- */
let pendingDelete = null;
function confirmDelete(type, id){
  pendingDelete = {type, id};
  const item = appData[type].find(x=>x.id==id);
  document.getElementById('modal-body').innerHTML = `
    <h3>מחיקת פריט</h3>
    <p style="font-size:13.5px;color:var(--text-secondary);line-height:1.6;">
      האם למחוק את "<strong>${item.title||item.name}</strong>"? הפעולה תשפיע מיידית על התצוגה בכל הסניפים.
    </p>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">ביטול</button>
      <button class="btn-confirm btn-danger" onclick="doDelete()">מחיקה</button>
    </div>
  `;
  document.getElementById('modal-overlay').classList.add('open');
}
function doDelete(){
  const {type, id} = pendingDelete;
  if(FIRESTORE_BACKED_TYPES.indexOf(type) !== -1 && firebaseReady){
    closeModal();
    db.collection(type).doc(id).delete()
      .then(()=>toast('הפריט נמחק'))
      .catch(err=>toast('שגיאה במחיקה: '+err.message));
    return;
  }
  appData[type] = appData[type].filter(x=>x.id!=id);
  closeModal();
  renderContent();
  toast('הפריט נמחק');
}



