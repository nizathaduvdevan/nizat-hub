/* ============================================================
   purchasing-promo-upload.js
   ------------------------------------------------------------
   מסך ניהול תוכן לרכש: "תצוגת מוצרים / חוברת מבצעים" (שם זמני).
   מעלה 2 קבצי PDF + קטלוג ל-Firebase Storage, שולח קישורים ל-
   Cloud Function parse_promo_booklet לתצוגה מקדימה, ורק בלחיצה
   על "פרסם לסניפים" כותב בפועל ל-promoBooklet/promoProducts.

   דורש: firebase-init.js כבר טעון (משתנה גלובלי db, ו-firebase.auth()
   פעיל), וכן firebase-storage-compat.js בתגית <script> ב-index.html
   (עדיין לא קיים שם — יש להוסיף לפני שקובץ זה ייטען, ראו הערה בתחתית).

   נטען כמו שאר קבצי המודולים: <script src="purchasing-promo-upload.js"></script>
   אחרי firebase-init.js, ולפני navigation.js אם navigation.js קורא לפונקציה
   viewPurchasingPromoUpload בזמן טעינה (בדרך כלל לא, כי היא רק על goTo).
============================================================ */

const CLOUD_FUNCTION_URL = "https://us-central1-nizat-hub.cloudfunctions.net/parse_promo_booklet";

let purchasingUploadState = {
  supplierFile: null,
  displayFile: null,
  catalogFile: null,
  supplierFileUrl: null,
  displayFileUrl: null,
  catalogFileUrl: null,
  previewSummary: null,
};

/* ---------- View: renders into #content, called from navigation.js via goTo('purchasing-promo-upload') ---------- */
function viewPurchasingPromoUpload(){
  setTimeout(renderPurchasingUploadUI, 0); // let #content mount first
  return `
    <div class="page-head">
      <h1>תצוגת מוצרים / חוברת מבצעים <span style="font-weight:400;color:#888;font-size:14px;">(שם זמני)</span></h1>
      <p>ניהול תוכן · רכש</p>
    </div>
    <div id="ppu-root"></div>
  `;
}

function renderPurchasingUploadUI(){
  const root = document.getElementById('ppu-root');
  if(!root) return;
  root.innerHTML = `
    <style>
      .ppu-card{background:#fff;border:1px solid #ddd;border-radius:12px;padding:18px 20px;margin-bottom:14px;}
      .ppu-card h2{font-size:15px;font-weight:800;margin:0 0 6px;}
      .ppu-hint{font-size:12.5px;color:#777;margin-bottom:10px;line-height:1.6;}
      .ppu-input, .ppu-textarea{width:100%;border:1px solid #ddd;border-radius:8px;padding:10px 12px;font-family:inherit;font-size:14px;box-sizing:border-box;}
      .ppu-textarea{min-height:80px;resize:vertical;}
      .ppu-slot{border:1.5px dashed #ddd;border-radius:10px;padding:14px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;}
      .ppu-slot.filled{border-style:solid;border-color:#4E7A3A;background:#EAF1E4;}
      .ppu-slot-title{font-weight:700;font-size:14px;}
      .ppu-slot-meta{font-size:12px;color:#777;}
      .ppu-btn{border:1px solid #4E7A3A;background:#fff;color:#4E7A3A;border-radius:8px;padding:8px 16px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;}
      .ppu-btn.filled{background:#4E7A3A;color:#fff;}
      .ppu-actions{display:flex;gap:12px;margin-top:16px;}
      .ppu-primary{background:#4E7A3A;color:#fff;border:none;border-radius:10px;padding:13px 22px;font-family:inherit;font-size:15px;font-weight:800;cursor:pointer;}
      .ppu-primary:disabled{background:#B7C4AE;cursor:not-allowed;}
      .ppu-secondary{background:#fff;border:1px solid #ddd;border-radius:10px;padding:13px 18px;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;}
      .ppu-preview{display:none;border:1px solid #ddd;border-radius:10px;padding:14px;margin-top:14px;background:#f7f7f5;}
      .ppu-preview.open{display:block;}
      .ppu-row{display:flex;align-items:center;gap:8px;font-size:13.5px;padding:5px 0;}
      .ppu-row.ok{color:#3D7A4F;} .ppu-row.warn{color:#B4611E;}
    </style>

    <div class="ppu-card">
      <h2>כותרת</h2>
      <div class="ppu-hint">כותרת הסבב הנוכחי, כפי שתוצג לסניפים.</div>
      <input class="ppu-input" id="ppuTitle" type="text" placeholder="לדוגמה: מבצעים ספטמבר–אוקטובר 2026">
    </div>

    <div class="ppu-card">
      <h2>טקסט חופשי</h2>
      <div class="ppu-hint">הערות/עדכונים שוטפים מרכש בנוגע לאחד המבצעים הרשתיים של החודש (לא הודעה נפרדת — מופיע בראש עמוד המבצעים לסניפים).</div>
      <textarea class="ppu-textarea" id="ppuNotes" placeholder="לדוגמה: מבצע 8103 בוטל החל מה-15.9 עקב חוסר במלאי אצל הספק."></textarea>
    </div>

    <div class="ppu-card">
      <h2>העלאת קבצים</h2>
      <div class="ppu-hint">שני קבצי החוברת מתעדכנים כל סבב מבצעים. קובץ הקטלוג נשאר קבוע לאורך זמן.</div>

      <div class="ppu-slot" id="ppuSlot_supplier">
        <div><div class="ppu-slot-title">קובץ מבצעים 1 (ספקים)</div><div class="ppu-slot-meta">PDF · מסודר לפי ספק</div></div>
        <div>
          <input type="file" accept="application/pdf" id="ppuFile_supplier" style="display:none" onchange="ppuFileSelected('supplier', this.files[0])">
          <button class="ppu-btn" onclick="document.getElementById('ppuFile_supplier').click()">בחר קובץ</button>
        </div>
      </div>

      <div class="ppu-slot" id="ppuSlot_display">
        <div><div class="ppu-slot-title">קובץ מבצעים 2 (תצוגה)</div><div class="ppu-slot-meta">PDF · מסודר לפי הנחיות תצוגה</div></div>
        <div>
          <input type="file" accept="application/pdf" id="ppuFile_display" style="display:none" onchange="ppuFileSelected('display', this.files[0])">
          <button class="ppu-btn" onclick="document.getElementById('ppuFile_display').click()">בחר קובץ</button>
        </div>
      </div>

      <div class="ppu-slot" id="ppuSlot_catalog">
        <div><div class="ppu-slot-title">קובץ מוצרים כללי (קטלוג)</div><div class="ppu-slot-meta">Excel · נשאר קבוע, מעלים רק כשיש שינוי אמיתי</div></div>
        <div>
          <input type="file" accept=".xlsx,.xls" id="ppuFile_catalog" style="display:none" onchange="ppuFileSelected('catalog', this.files[0])">
          <button class="ppu-btn" onclick="document.getElementById('ppuFile_catalog').click()">בחר קובץ (אופציונלי)</button>
        </div>
      </div>
    </div>

    <div class="ppu-actions">
      <button class="ppu-secondary" onclick="ppuRunPreview()">🔍 בדוק ותצוגה מקדימה</button>
      <button class="ppu-primary" id="ppuPublishBtn" disabled onclick="ppuPublish()">✅ פרסם לסניפים</button>
    </div>

    <div class="ppu-preview" id="ppuPreviewBox"></div>
  `;
}

/* ---------- File selection: just remember it locally, upload happens on "בדוק" ---------- */
function ppuFileSelected(kind, file){
  if(!file) return;
  purchasingUploadState[kind + 'File'] = file;
  const slot = document.getElementById('ppuSlot_' + kind);
  slot.classList.add('filled');
  const btn = slot.querySelector('.ppu-btn');
  btn.classList.add('filled');
  btn.textContent = 'הוחלף: ' + file.name;
}

/* ---------- Upload one file to Storage, return its download URL ---------- */
function ppuUploadToStorage(file, path){
  const ref = firebase.storage().ref().child(path);
  return ref.put(file).then(snap => snap.ref.getDownloadURL());
}

/* ---------- Preview: upload files (if changed), call the Cloud Function in "preview" mode ---------- */
function ppuRunPreview(){
  const { supplierFile, displayFile, catalogFile } = purchasingUploadState;
  if(!supplierFile || !displayFile){
    toast('חובה לבחור את שני קבצי המבצעים (ספקים + תצוגה) לפני הבדיקה');
    return;
  }
  toast('מעלה קבצים ובודק...');

  const stamp = Date.now();
  const uploads = [
    ppuUploadToStorage(supplierFile, `purchasing/${stamp}_supplier.pdf`).then(url => purchasingUploadState.supplierFileUrl = url),
    ppuUploadToStorage(displayFile,  `purchasing/${stamp}_display.pdf`).then(url => purchasingUploadState.displayFileUrl = url),
  ];
  if(catalogFile){
    uploads.push(
      ppuUploadToStorage(catalogFile, `purchasing/latest_catalog.xlsx`).then(url => purchasingUploadState.catalogFileUrl = url)
    );
  }

  Promise.all(uploads)
    .then(() => firebase.auth().currentUser.getIdToken())
    .then(idToken => {
      const payload = {
        mode: 'preview',
        supplierFileUrl: purchasingUploadState.supplierFileUrl,
        displayFileUrl: purchasingUploadState.displayFileUrl,
      };
      if(purchasingUploadState.catalogFileUrl) payload.catalogFileUrl = purchasingUploadState.catalogFileUrl;
      return fetch(CLOUD_FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + idToken },
        body: JSON.stringify(payload),
      });
    })
    .then(r => r.json())
    .then(summary => {
      if(summary.error){ toast('שגיאה: ' + summary.error); return; }
      purchasingUploadState.previewSummary = summary;
      ppuRenderPreview(summary);
      document.getElementById('ppuPublishBtn').disabled = false;
    })
    .catch(err => toast('שגיאה: ' + err.message));
}

function ppuRenderPreview(summary){
  const box = document.getElementById('ppuPreviewBox');
  box.classList.add('open');
  const flagged = summary.flagged_for_review || [];
  box.innerHTML = `
    <div class="ppu-row ok">✓ ${summary.total_promos} מבצעים זוהו</div>
    <div class="ppu-row ok">✓ ${summary.barcode_catalog_matches}/${summary.barcode_catalog_total} ברקודים תואמו לקטלוג</div>
    ${flagged.length ? `<div class="ppu-row warn">⚠ ${flagged.length} שורות מסומנות לבדיקה ידנית:</div>
      <ul style="font-size:12.5px;color:#B4611E;margin:4px 0 0;padding-inline-start:20px;">
        ${flagged.map(f => `<li>${f.reason} — ${f.desc || ''}</li>`).join('')}
      </ul>` : `<div class="ppu-row ok">✓ אין שורות שדורשות בדיקה ידנית</div>`}
  `;
}

/* ---------- Publish: same call, mode "publish" — writes to promoBooklet/promoProducts ---------- */
function ppuPublish(){
  if(!purchasingUploadState.previewSummary){
    toast('יש להריץ קודם "בדוק ותצוגה מקדימה"');
    return;
  }
  toast('מפרסם לסניפים...');
  firebase.auth().currentUser.getIdToken().then(idToken => {
    const payload = {
      mode: 'publish',
      supplierFileUrl: purchasingUploadState.supplierFileUrl,
      displayFileUrl: purchasingUploadState.displayFileUrl,
    };
    if(purchasingUploadState.catalogFileUrl) payload.catalogFileUrl = purchasingUploadState.catalogFileUrl;
    return fetch(CLOUD_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + idToken },
      body: JSON.stringify(payload),
    });
  })
  .then(r => r.json())
  .then(result => {
    if(result.error){ toast('שגיאה: ' + result.error); return; }
    // Save the title/notes text alongside the campaign metadata.
    db.collection('siteTexts').doc('purchasingPromoNotice').set({
      title: val('ppuTitle'),
      notes: val('ppuNotes'),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: firebase.auth().currentUser.email,
    }, {merge:true}).catch(err => console.error('siteTexts write failed', err));
    toast('פורסם בהצלחה לכל הסניפים! 🎉');
  })
  .catch(err => toast('שגיאה: ' + err.message));
}

/* ============================================================
   דברים שעדיין חסרים כדי שזה יעבוד בפועל (לא בקוד הזה עצמו):

   1. תגית סקריפט חדשה ב-index.html, לפני purchasing-promo-upload.js:
        <script src="https://www.gstatic.com/firebasejs/10.13.0/firebase-storage-compat.js"></script>
      וגם תגית לטעינת הקובץ הזה עצמו:
        <script src="purchasing-promo-upload.js"></script>
      (אחרי firebase-init.js, לפני/אחרי stands.js לא משנה — אין תלות ביניהם)

   2. כניסה בניווט (navigation.js) תחת מחלקת רכש, שקוראת ל-
      goTo('purchasing-promo-upload') ומפעילה viewPurchasingPromoUpload().
      לא כתבתי את זה כי אין לי את navigation.js לראות את התבנית המדויקת
      של שאר הכניסות בתפריט.

   3. כללי Storage (לא רק Firestore!) - צריך גם firebase Storage rules
      שמאפשרות כתיבה לנתיב purchasing/... רק למחלקת רכש/super-admin,
      בדומה לרוח firestore.rules. עדיין לא נכתב.
============================================================ */
