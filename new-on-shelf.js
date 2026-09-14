/* ============================================================
   new-on-shelf.js
   ------------------------------------------------------------
   "חדש על המדף" · רכש.
   שני מסכים:
     1. viewNewOnShelf()        — פיד לסניפים: כל המוצרים החדשים
        שהועלו ב-14 הימים האחרונים (מחיקה בפועל דרך Firestore TTL
        על השדה expiresAt — יש להפעיל TTL policy בקונסולה על
        הקולקציה newOnShelf / השדה expiresAt, פעם אחת).
     2. viewNewOnShelfUpload()  — מסך לצוות רכש: גוררים כמה קבצי
        .docx בבת אחת (קובץ אחד לכל ספק, כמו שמתקבל בפועל), המערכת
        מעלה אותם ל-Storage, שולחת ל-Cloud Function parse_new_on_shelf
        (mode:'preview') שמפענחת טבלה+כותרת+תמונות ומשייכת כל תמונה
        למוצר המתאים לה (AI Vision), ומציגה preview לבדיקה. רק
        בלחיצה על "פרסם לסניפים" (mode:'publish') זה נכתב בפועל
        ל-Firestore ונחשף לסניפים.

   דורש: firebase-init.js (db, firebase.auth()) ו-
   firebase-storage-compat.js כבר טעונים לפני קובץ זה.
   נטען כמו שאר קבצי המודולים: <script src="new-on-shelf.js"></script>
   אחרי purchasing-promo-board.js.
============================================================ */

const NOS_CLOUD_FUNCTION_URL = "https://us-central1-nizat-hub.cloudfunctions.net/parse_new_on_shelf";
const NOS_ICON_BOX = '<path d="M21 8 12 3 3 8l9 5 9-5Z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>';

function nosInjectStyleOnce(){
  if(document.getElementById('nos-style')) return;
  const style = document.createElement('style');
  style.id = 'nos-style';
  style.textContent = `
    .nos-batch{background:var(--card,#fff); border:1px solid var(--gridline,#ddd); border-radius:12px; padding:16px 18px; margin-bottom:16px;}
    .nos-batch-head{display:flex; align-items:baseline; gap:10px; margin-bottom:12px; flex-wrap:wrap;}
    .nos-supplier{font-size:16px; font-weight:800; color:var(--brand,#4E7A3A);}
    .nos-date{font-size:13px; color:var(--muted,#888);}
    .nos-note{font-size:12.5px; color:var(--muted,#777); width:100%; font-style:italic;}
    .nos-grid{display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:12px;}
    .nos-card{border:1px solid var(--gridline,#ddd); border-radius:10px; overflow:hidden; background:var(--bg,#f7f7f5);}
    .nos-card-img{width:100%; height:120px; object-fit:contain; background:#fff; display:block;}
    .nos-card-img-placeholder{width:100%; height:120px; background:#eee; display:flex; align-items:center; justify-content:center; color:var(--muted,#999); font-size:12px;}
    .nos-card-body{padding:8px 10px;}
    .nos-card-name{font-size:13px; font-weight:700; line-height:1.35; margin-bottom:4px;}
    .nos-card-meta{font-size:11.5px; color:var(--muted,#888); display:flex; flex-wrap:wrap; gap:4px 8px;}
    .nos-empty{text-align:center; color:var(--muted,#888); padding:40px 10px;}

    .nos-drop{border:2px dashed var(--gridline,#ddd); border-radius:12px; padding:32px 16px; text-align:center; cursor:pointer; margin-bottom:16px; background:var(--card,#fff);}
    .nos-drop.drag{border-color:var(--brand,#4E7A3A); background:rgba(78,122,58,.08);}
    .nos-drop-title{font-weight:800; font-size:15px; margin-bottom:4px;}
    .nos-drop-hint{font-size:12.5px; color:var(--muted,#888);}
    .nos-filelist{margin:0 0 16px; padding:0; list-style:none;}
    .nos-filelist li{display:flex; align-items:center; gap:8px; padding:8px 12px; border:1px solid var(--gridline,#ddd); border-radius:8px; margin-bottom:6px; font-size:13.5px; background:var(--card,#fff);}
    .nos-filelist button{margin-inline-start:auto; border:none; background:none; color:#B4611E; cursor:pointer; font-size:13px;}

    .nos-actions{display:flex; gap:12px; margin-bottom:16px;}
    .nos-primary{background:var(--brand,#4E7A3A); color:#fff; border:none; border-radius:10px; padding:13px 22px; font-family:inherit; font-size:15px; font-weight:800; cursor:pointer;}
    .nos-primary:disabled{background:#B7C4AE; cursor:not-allowed;}
    .nos-secondary{background:var(--card,#fff); border:1px solid var(--gridline,#ddd); border-radius:10px; padding:13px 18px; font-family:inherit; font-size:14px; font-weight:600; cursor:pointer;}

    .nos-status{margin-bottom:16px; padding:12px 14px; border-radius:8px; font-size:13.5px; display:none; align-items:center; gap:10px;}
    .nos-status.show{display:flex;}
    .nos-status.busy{background:#EAF1E4; color:#3D6B2E;}
    .nos-status.error{background:#FBECDD; color:#B4611E;}
    .nos-status.success{background:#E7F2E9; color:#3D7A4F; font-weight:700;}
    .nos-spinner{width:16px; height:16px; border:2.5px solid rgba(0,0,0,.15); border-top-color:currentColor; border-radius:50%; animation:nos-spin .8s linear infinite; flex-shrink:0;}
    @keyframes nos-spin{to{transform:rotate(360deg);}}

    .nos-preview-batch{border:1px solid var(--gridline,#ddd); border-radius:10px; padding:14px 16px; margin-bottom:14px;}
    .nos-flag-row{color:#B4611E; font-size:12.5px; margin-top:4px;}
    .nos-unmatched{border:1px dashed #B4611E; border-radius:8px; padding:10px; margin-top:10px; background:#FBECDD;}
    .nos-drag-hint{font-size:12px; color:var(--muted,#888); margin-bottom:10px;}
    .nos-dropzone{cursor:grab;}
    .nos-dropzone.drag-over{outline:2px dashed var(--brand,#4E7A3A); outline-offset:-2px;}
    .nos-unmatched-strip{display:flex; gap:8px; flex-wrap:wrap; margin-top:8px;}
    .nos-unmatched-strip img{width:70px; height:70px; object-fit:contain; border-radius:8px; background:#fff; border:1px solid var(--gridline,#ddd); cursor:grab;}

    .nos-batch-actions{margin-inline-start:auto;}
    .nos-icon-btn{border:1px solid var(--gridline,#ddd); background:var(--card,#fff); border-radius:6px; padding:3px 8px; font-size:12px; cursor:pointer; color:var(--muted,#888);}
    .nos-icon-btn.danger{color:#B4611E; border-color:#F0C9A8;}
    .nos-card-wrap{position:relative;}
    .nos-card-del{position:absolute; top:4px; left:4px; background:rgba(255,255,255,.9); border:1px solid var(--gridline,#ddd); border-radius:50%; width:22px; height:22px; line-height:20px; text-align:center; cursor:pointer; font-size:12px; color:#B4611E; z-index:2;}
    .nos-img-actions{display:flex; gap:4px; padding:5px 10px 0;}
    .nos-img-actions button{flex:1; font-size:11px; padding:3px 4px; border:1px solid var(--gridline,#ddd); background:var(--card,#fff); border-radius:6px; cursor:pointer; color:var(--muted,#777);}
    .nos-img-wrap{position:relative;}
    .nos-zoom-btn{position:absolute; bottom:6px; left:6px; width:26px; height:26px; border-radius:50%; background:rgba(255,255,255,.9); border:1px solid var(--gridline,#ddd); display:flex; align-items:center; justify-content:center; cursor:pointer; color:var(--muted,#666); z-index:2;}
  `;
  document.head.appendChild(style);
}

/* ============================================================
   מסך 1: פיד לסניפים
============================================================ */
let nosFeedItems = null;
let nosFeedLoaded = false;

function viewNewOnShelf(){
  nosInjectStyleOnce();
  setTimeout(nosLoadFeed, 0);
  return `
    <div class="page-head">
      <h1>${icon('cart')} חדש על המדף</h1>
      <p>מוצרים חדשים שנכנסו למדף · רכש · 14 הימים האחרונים</p>
    </div>
    <div id="nos-feed-root"><div class="nos-empty">טוען...</div></div>
  `;
}

function nosLoadFeed(){
  const root = document.getElementById('nos-feed-root');
  if(!root) return;
  db.collection('newOnShelf').orderBy('createdAt','desc').get()
    .then(snap => {
      nosFeedItems = [];
      snap.forEach(doc => nosFeedItems.push(Object.assign({id:doc.id}, doc.data())));
      nosFeedLoaded = true;
      nosRenderFeed();
    })
    .catch(err => {
      console.error('nosLoadFeed failed', err);
      root.innerHTML = `<div class="nos-empty">שגיאה בטעינת הנתונים: ${err.message}</div>`;
    });
}

function nosRenderFeed(){
  const root = document.getElementById('nos-feed-root');
  if(!root) return;
  if(!nosFeedItems || !nosFeedItems.length){
    root.innerHTML = `<div class="nos-empty">אין כרגע מוצרים חדשים על המדף.</div>`;
    return;
  }
  const isAdmin = typeof canManageDepartment === 'function' && canManageDepartment('purchasing');
  /* קיבוץ לפי batchId (קובץ/ספק+תאריך שהועלה יחד), שמירה על סדר מהחדש לישן */
  const batches = [];
  const byId = {};
  nosFeedItems.forEach(item => {
    if(!byId[item.batchId]){
      byId[item.batchId] = { batchId:item.batchId, supplier:item.supplier, dateText:item.dateText, note:item.note, products:[] };
      batches.push(byId[item.batchId]);
    }
    byId[item.batchId].products.push(item);
  });

  root.innerHTML = `
    <input type="file" id="nosImageUploadInput" accept="image/*" style="display:none" onchange="nosImageFileSelected(this.files[0])">
    ${batches.map(b => `
    <div class="nos-batch">
      <div class="nos-batch-head">
        <span class="nos-supplier">${b.supplier||'ספק'}</span>
        <span class="nos-date">${b.dateText||''}</span>
        ${b.note ? `<span class="nos-note">${b.note}</span>` : ''}
        ${isAdmin ? `<span class="nos-batch-actions"><button class="nos-icon-btn danger" onclick="nosDeleteBatch('${b.batchId}')">🗑 מחק ספק זה</button></span>` : ''}
      </div>
      <div class="nos-grid">
        ${b.products.map(p => nosProductCard(p, isAdmin)).join('')}
      </div>
    </div>
  `).join('')}`;
}

function nosOpenImageModal(url){
  document.getElementById('modal-body').innerHTML = `
    <div style="text-align:center;">
      <img src="${url}" style="max-width:100%; max-height:80vh; border-radius:8px;">
    </div>
  `;
  document.getElementById('modal-overlay').classList.add('open');
}

function nosProductCard(p, isAdmin){
  const img = p.imageUrl
    ? `<div class="nos-img-wrap">
         <img class="nos-card-img" src="${p.imageUrl}" alt="${p.name||''}">
         <div class="nos-zoom-btn" title="הגדל תמונה" onclick="nosOpenImageModal('${p.imageUrl}')">${icon('search')}</div>
       </div>`
    : `<div class="nos-card-img-placeholder">אין תמונה</div>`;
  const extraFields = Object.keys(p.fields||{})
    .filter(k => ['קוד','שם המוצר'].indexOf(k) === -1)
    .map(k => `<span>${k}: ${p.fields[k]}</span>`)
    .join('');
  return `
    <div class="nos-card-wrap">
      ${isAdmin ? `<div class="nos-card-del" title="מחק מוצר" onclick="nosDeleteProduct('${p.id}')">✕</div>` : ''}
      <div class="nos-card">
        ${img}
        ${isAdmin ? `
          <div class="nos-img-actions">
            <button onclick="nosTriggerImageUpload('${p.id}')">📷 החלף</button>
            ${p.imageUrl ? `<button onclick="nosDeleteImage('${p.id}')">מחק תמונה</button>` : ''}
          </div>
        ` : ''}
        <div class="nos-card-body">
          <div class="nos-card-name">${p.name||'(ללא שם)'}</div>
          <div class="nos-card-meta">
            ${p.code ? `<span>קוד: ${p.code}</span>` : ''}
            ${extraFields}
          </div>
        </div>
      </div>
    </div>
  `;
}

/* ---------- Admin management: delete product / batch, replace / remove image ---------- */

function nosDeleteProduct(docId){
  if(!confirm('למחוק את המוצר הזה? הפעולה בלתי הפיכה.')) return;
  db.collection('newOnShelf').doc(docId).delete()
    .then(() => { toast('נמחק'); nosLoadFeed(); })
    .catch(err => toast('שגיאה במחיקה: ' + err.message));
}

function nosDeleteBatch(batchId){
  const items = nosFeedItems.filter(i => i.batchId === batchId);
  if(!confirm(`למחוק את כל ${items.length} המוצרים של הספק הזה? הפעולה בלתי הפיכה.`)) return;
  const batch = db.batch();
  items.forEach(i => batch.delete(db.collection('newOnShelf').doc(i.id)));
  batch.commit()
    .then(() => { toast('נמחק'); nosLoadFeed(); })
    .catch(err => toast('שגיאה במחיקה: ' + err.message));
}

let nosImageUploadTargetId = null;
function nosTriggerImageUpload(docId){
  nosImageUploadTargetId = docId;
  document.getElementById('nosImageUploadInput').click();
}

function nosImageFileSelected(file){
  if(!file || !nosImageUploadTargetId) return;
  const docId = nosImageUploadTargetId;
  toast('מעלה תמונה...');
  uploadFileToCloudinary(file)
    .then(result => db.collection('newOnShelf').doc(docId).update({imageUrl: result.secure_url}))
    .then(() => { toast('התמונה עודכנה'); nosLoadFeed(); })
    .catch(err => toast('שגיאה בהעלאה: ' + err.message))
    .finally(() => { nosImageUploadTargetId = null; });
}

function nosDeleteImage(docId){
  if(!confirm('למחוק את התמונה של המוצר הזה?')) return;
  db.collection('newOnShelf').doc(docId).update({imageUrl: null})
    .then(() => { toast('התמונה הוסרה'); nosLoadFeed(); })
    .catch(err => toast('שגיאה: ' + err.message));
}

/* ============================================================
   מסך 2: העלאה (רכש)
============================================================ */
let nosUploadState = { files:[], previewSummary:null };

function viewNewOnShelfUpload(){
  nosInjectStyleOnce();
  setTimeout(nosRenderUploadUI, 0);
  return `
    <div class="page-head">
      <h1>העלאת "חדש על המדף"</h1>
      <p>ניהול תוכן · רכש</p>
    </div>
    <div id="nos-upload-root"></div>
  `;
}

function nosRenderUploadUI(){
  const root = document.getElementById('nos-upload-root');
  if(!root) return;
  root.innerHTML = `
    <div class="nos-drop" id="nosDropZone">
      <div class="nos-drop-title">גררו לכאן את קבצי ה-Word של השבוע</div>
      <div class="nos-drop-hint">אפשר כמה קבצים בבת אחת (קובץ אחד לכל ספק) · חייב להיות .docx</div>
      <input type="file" id="nosFileInput" accept=".docx" multiple style="display:none">
    </div>
    <ul class="nos-filelist" id="nosFileList"></ul>
    <div class="nos-actions">
      <button class="nos-secondary" onclick="nosRunPreview()">🔍 בדוק ותצוגה מקדימה</button>
      <button class="nos-primary" id="nosPublishBtn" disabled onclick="nosPublish()">✅ פרסם לסניפים</button>
    </div>
    <div class="nos-status" id="nosStatus"></div>
    <div id="nosPreviewRoot"></div>
  `;

  const dropZone = document.getElementById('nosDropZone');
  const fileInput = document.getElementById('nosFileInput');
  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', e => nosAddFiles([...e.target.files]));
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag');
    nosAddFiles([...e.dataTransfer.files]);
  });
}

function nosAddFiles(files){
  const docx = files.filter(f => /\.docx$/i.test(f.name));
  if(docx.length < files.length) toast('רק קבצי .docx נתמכים - קבצים אחרים סוננו החוצה');
  nosUploadState.files.push(...docx);
  nosRenderFileList();
}

function nosRenderFileList(){
  const list = document.getElementById('nosFileList');
  if(!list) return;
  list.innerHTML = nosUploadState.files.map((f,i) => `
    <li>📄 ${f.name} <button onclick="nosRemoveFile(${i})">הסר</button></li>
  `).join('');
}

function nosRemoveFile(i){
  nosUploadState.files.splice(i,1);
  nosRenderFileList();
}

function nosSetStatus(kind, text){
  const el = document.getElementById('nosStatus');
  if(!el) return;
  el.className = 'nos-status show ' + kind;
  el.innerHTML = (kind==='busy' ? '<span class="nos-spinner"></span>' : (kind==='success' ? '✅ ' : '⚠️ ')) + text;
}
function nosClearStatus(){
  const el = document.getElementById('nosStatus');
  if(el){ el.className = 'nos-status'; el.innerHTML=''; }
}

function nosUploadToStorage(file, path){
  const ref = firebase.storage().ref().child(path);
  return ref.put(file).then(snap => snap.ref.getDownloadURL());
}

function nosRunPreview(){
  if(!nosUploadState.files.length){
    toast('חובה לבחור לפחות קובץ אחד לפני הבדיקה');
    return;
  }
  nosSetStatus('busy', 'מעלה קבצים...');
  const stamp = Date.now();
  const uploads = nosUploadState.files.map((file,i) =>
    nosUploadToStorage(file, `newOnShelf/${stamp}_${i}_${file.name}`).then(url => ({url, name:file.name}))
  );
  Promise.all(uploads)
    .then(fileRefs => {
      nosSetStatus('busy', 'הקבצים הועלו. מפענח ומשייך תמונות (יכול לקחת דקה-שתיים)...');
      return firebase.auth().currentUser.getIdToken().then(idToken => ({idToken, fileRefs}));
    })
    .then(({idToken, fileRefs}) => fetch(NOS_CLOUD_FUNCTION_URL, {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+idToken},
      body: JSON.stringify({mode:'preview', files:fileRefs})
    }))
    .then(r => r.json())
    .then(summary => {
      if(summary.error){ nosSetStatus('error', 'שגיאה: ' + summary.error); return; }
      nosUploadState.previewSummary = summary;
      nosClearStatus();
      nosRenderPreview(summary);
      document.getElementById('nosPublishBtn').disabled = false;
    })
    .catch(err => nosSetStatus('error', 'שגיאה בתקשורת עם השרת: ' + err.message));
}

function nosRenderPreview(summary){
  const root = document.getElementById('nosPreviewRoot');
  root.innerHTML = `
    <div class="nos-drag-hint">💡 אפשר לגרור תמונה בין מוצרים (גם מתוך "לא משויך") כדי לתקן שיוך שגוי, לפני הפרסום.</div>
    ${summary.files.map((f, fi) => `
    <div class="nos-preview-batch">
      <div class="nos-batch-head">
        <span class="nos-supplier">${f.supplier||'(ספק לא זוהה)'}</span>
        <span class="nos-date">${f.dateText||''}</span>
      </div>
      <div class="nos-grid">
        ${f.products.map((p, pi) => nosPreviewProductCard(fi, pi, p)).join('')}
      </div>
      ${!f.supplier ? `<div class="nos-flag-row">⚠ לא זוהה שם ספק בקובץ ${f.fileName} - כדאי לבדוק ידנית לפני הפרסום</div>` : ''}
      ${f.unmatchedImages && f.unmatchedImages.length ? `
        <div class="nos-unmatched">
          ⚠ ${f.unmatchedImages.length} תמונות לא שויכו לוודאות מספיקה למוצר - גררו כל אחת למוצר הנכון:
          <div class="nos-unmatched-strip" id="nos-unmatched-${fi}">
            ${f.unmatchedImages.map((u, ui) => `<img src="${u.url}" draggable="true" ondragstart="nosDragStart(event, ${fi}, 'unmatched', ${ui})" ondblclick="nosOpenImageModal('${u.url}')" title="גררו למוצר, או לחצו פעמיים להגדלה">`).join('')}
          </div>
        </div>` : ''}
    </div>
    `).join('')}
  `;
}

function nosPreviewProductCard(fi, pi, p){
  const img = p.imageUrl
    ? `<div class="nos-img-wrap">
         <img class="nos-card-img nos-dropzone" draggable="true" src="${p.imageUrl}" alt="${p.name||''}" ondragstart="nosDragStart(event, ${fi}, 'product', ${pi})" ondragover="event.preventDefault()" ondrop="nosDrop(event, ${fi}, ${pi})">
         <div class="nos-zoom-btn" title="הגדל תמונה" onclick="nosOpenImageModal('${p.imageUrl}')">${icon('search')}</div>
       </div>`
    : `<div class="nos-card-img-placeholder nos-dropzone" ondragover="event.preventDefault()" ondrop="nosDrop(event, ${fi}, ${pi})">גררו תמונה לכאן</div>`;
  const extraFields = Object.keys(p.fields||{})
    .filter(k => ['קוד','שם המוצר'].indexOf(k) === -1)
    .map(k => `<span>${k}: ${p.fields[k]}</span>`)
    .join('');
  return `
    <div class="nos-card">
      ${img}
      <div class="nos-card-body">
        <div class="nos-card-name">${p.name||'(ללא שם)'}</div>
        <div class="nos-card-meta">
          ${p.code ? `<span>קוד: ${p.code}</span>` : ''}
          ${extraFields}
        </div>
      </div>
    </div>
  `;
}

let nosDragSource = null; // {fileIdx, kind:'product'|'unmatched', index}

function nosDragStart(ev, fileIdx, kind, index){
  nosDragSource = {fileIdx, kind, index};
  ev.dataTransfer.effectAllowed = 'move';
}

function nosDrop(ev, targetFileIdx, targetProductIdx){
  ev.preventDefault();
  if(!nosDragSource) return;
  const files = nosUploadState.previewSummary.files;
  const targetProduct = files[targetFileIdx].products[targetProductIdx];
  const oldTargetUrl = targetProduct.imageUrl || null;

  let sourceUrl = null;
  if(nosDragSource.kind === 'product'){
    const sourceProduct = files[nosDragSource.fileIdx].products[nosDragSource.index];
    sourceUrl = sourceProduct.imageUrl;
    sourceProduct.imageUrl = oldTargetUrl; // swap — the displaced image goes where the dragged one came from
  } else {
    const list = files[nosDragSource.fileIdx].unmatchedImages;
    sourceUrl = list[nosDragSource.index].url;
    list.splice(nosDragSource.index, 1); // consumed — no longer "unmatched"
    if(oldTargetUrl) list.push({url: oldTargetUrl}); // displaced image becomes unmatched instead of vanishing
  }
  targetProduct.imageUrl = sourceUrl;

  nosDragSource = null;
  nosRenderPreview(nosUploadState.previewSummary);
}

function nosPublish(){
  if(!nosUploadState.previewSummary){
    toast('יש להריץ קודם "בדוק ותצוגה מקדימה"');
    return;
  }
  document.getElementById('nosPublishBtn').disabled = true;
  nosSetStatus('busy', 'מפרסם לסניפים...');
  firebase.auth().currentUser.getIdToken()
    .then(idToken => fetch(NOS_CLOUD_FUNCTION_URL, {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+idToken},
      body: JSON.stringify({mode:'publish', files: nosUploadState.previewSummary.files})
    }))
    .then(r => r.json())
    .then(result => {
      if(result.error){
        nosSetStatus('error', 'שגיאה: ' + result.error);
        document.getElementById('nosPublishBtn').disabled = false;
        return;
      }
      nosSetStatus('success', `פורסם בהצלחה! ${result.totalProducts} מוצרים נכתבו ל-Firestore.`);
      nosUploadState = { files:[], previewSummary:null };
      nosRenderFileList();
      document.getElementById('nosPreviewRoot').innerHTML = '';
    })
    .catch(err => {
      nosSetStatus('error', 'שגיאה בתקשורת עם השרת: ' + err.message + ' - אם זה קרה אחרי המתנה ארוכה, ייתכן שהפרסום בכל זאת הצליח; בדקו את הפיד לפני שמנסים שוב.');
      document.getElementById('nosPublishBtn').disabled = false;
    });
}
