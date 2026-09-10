/* ============================================================
   purchasing-promo-board.js
   ------------------------------------------------------------
   מסך הסניף: לוח מבצעים · רכש. קורא מ-appData.promoBooklet (כבר מסונכרן
   ע"י firebase-init.js לצורך promo-sales.js) + purchasingPromoItems +
   purchasingPromoChecklist (טעינה חד-פעמית כשנכנסים למסך, לא onSnapshot —
   מספיק להיקף הזה; ניתן לשדרג בהמשך אם צריך זמן-אמת).

   הוראות שילוב:
   1. הוסיפו ל-DEPARTMENT_SCREENS.purchasing (ב-navigation.js), ליד promoSales:
        {id:'promoBoard', label:'לוח מבצעים', icon:icon('clipboard')}
   2. הוסיפו ל-renderContent() (ב-navigation.js), ליד שאר ה-else if:
        else if(ui.view==='promoBoard') el.innerHTML = viewPurchasingPromoBoard();
   3. הוסיפו תגית טעינה ב-index.html, אחרי admin.js:
        <script src="purchasing-promo-board.js"></script>
============================================================ */

// מדף תמיד מסומן; חוץ-מדף רק לפי טבלת ההנחיות שאושרה (ר' השיחה).
const PROMO_BOARD_OFFSHELF_SECTIONS = [
  'במה עדיפות 1', 'במה עדיפות 2', 'מבצעים', 'מבצעים בולט',
  'מרקחת בולט', 'מערום קרטונים', 'קופות'
];

let promoBoardItems = null;       // { barcode: {code,name,dept,group} }
let promoBoardChecklist = {};     // { promoCode: {ordered,shelf,offshelf} } — לסניף הנוכחי בלבד
let promoBoardFilters = {supplier:new Set(), section:new Set(), dept:new Set(), group:new Set()};
let promoBoardSearch = '';
let promoBoardLoaded = false;

function viewPurchasingPromoBoard(){
  if(!promoBoardLoaded) loadPromoBoardData();
  return `
    <div class="page-head">
      <h1>לוח מבצעים · רכש</h1>
      <p>הזמנה, שילוט מדף ושילוט חוץ-מדף לכל מבצע</p>
    </div>
    <div id="pb-root">${promoBoardLoaded ? '' : '<p style="color:var(--text-secondary);">טוען נתונים...</p>'}</div>
  `;
}

function loadPromoBoardData(){
  const branchEmail = (session.branchInfo && session.branchInfo.email) || currentUserEmail;
  Promise.all([
    db.collection('purchasingPromoItems').get(),
    db.collection('purchasingPromoChecklist').where('branchEmail','==',branchEmail).get()
  ]).then(function(results){
    const itemsSnap = results[0], checklistSnap = results[1];
    promoBoardItems = {};
    itemsSnap.forEach(function(doc){ promoBoardItems[doc.id] = doc.data(); });
    promoBoardChecklist = {};
    checklistSnap.forEach(function(doc){
      const d = doc.data();
      promoBoardChecklist[d.promoCode] = {ordered:!!d.ordered, shelf:!!d.shelf, offshelf:!!d.offshelf};
    });
    promoBoardLoaded = true;
    renderPromoBoard();
  }).catch(function(err){
    toast('שגיאה בטעינת נתוני לוח המבצעים: ' + err.message);
  });
}

/* בונה, לכל קוד מבצע ב-promoBooklet, את רשימת הפריטים שלו (מקבץ
   purchasingPromoItems לפי code), ואת שם הספק/מחלקה/קבוצה השכיחים. */
function promoBoardBuildRows(){
  const byCode = {};
  Object.keys(promoBoardItems||{}).forEach(function(barcode){
    const it = promoBoardItems[barcode];
    if(!it.code) return;
    (byCode[it.code] = byCode[it.code] || []).push(Object.assign({barcode: barcode}, it));
  });
  const booklet = appData.promoBooklet || {};
  return Object.keys(booklet).map(function(code){
    const b = booklet[code];
    const items = byCode[code] || [];
    const depts = items.map(i=>i.dept).filter(Boolean);
    const groups = items.map(i=>i.group).filter(Boolean);
    const mostCommon = function(arr){
      if(!arr.length) return null;
      const c = {}; arr.forEach(x=>c[x]=(c[x]||0)+1);
      return Object.keys(c).sort((a,b)=>c[b]-c[a])[0];
    };
    return {
      code: code,
      title: items[0] ? items[0].name : null,
      items: items,
      price: b.price, template: b.template, note: b.note, section: b.section,
      dept: mostCommon(depts), group: mostCommon(groups),
      needsOffshelf: PROMO_BOARD_OFFSHELF_SECTIONS.indexOf(b.section) !== -1,
    };
  });
}

function priceLabel(row){
  if(row.price==null) return row.template||'';
  const isPercent = (row.template||'').indexOf('%') !== -1 || (row.template||'').indexOf('הנחה')!==-1;
  return isPercent ? `${row.template}: ${row.price}%` : `${row.template}: ₪${Number(row.price).toFixed(2)}`;
}

function promoBoardMatchesFilters(row){
  if(promoBoardFilters.section.size && !promoBoardFilters.section.has(row.section)) return false;
  if(promoBoardFilters.dept.size && !promoBoardFilters.dept.has(row.dept)) return false;
  if(promoBoardFilters.group.size && !promoBoardFilters.group.has(row.group)) return false;
  if(promoBoardSearch){
    const hay = [row.title, row.code, row.note, ...(row.items||[]).map(i=>i.name+' '+i.barcode)].join(' ').toLowerCase();
    if(hay.indexOf(promoBoardSearch.toLowerCase())===-1) return false;
  }
  return true;
}

function renderPromoBoard(){
  const root = document.getElementById('pb-root');
  if(!root) return;
  const rows = promoBoardBuildRows().filter(promoBoardMatchesFilters);
  const st = function(code){ return promoBoardChecklist[code] || {ordered:false, shelf:false, offshelf:false}; };

  root.innerHTML = `
    <div class="card" style="margin-bottom:14px;">
      <input type="text" placeholder="חיפוש לפי שם מוצר, ברקוד או מספר מבצע..." value="${promoBoardSearch}"
        style="width:100%;border:1px solid var(--gridline);border-radius:8px;padding:9px 12px;font-family:inherit;"
        oninput="promoBoardSearch=this.value;renderPromoBoard();">
    </div>
    <div style="font-size:13px;color:var(--text-secondary);margin-bottom:10px;">
      מוצגים ${rows.length} מתוך ${promoBoardBuildRows().length} מבצעים
    </div>
    <div class="admin-list">
      ${rows.map(function(row){
        const s = st(row.code);
        return `
        <div class="admin-row" style="flex-direction:column;align-items:stretch;">
          <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
            <div>
              <div style="font-weight:700;">${row.title || '(שם לא זוהה)'}</div>
              <div style="font-size:12px;color:var(--muted);">מבצע ${row.code} · ${row.dept||''} / ${row.group||''} ${row.section?`· 📍 ${row.section}`:''}</div>
              <div style="font-size:13px;margin-top:4px;">${priceLabel(row)}</div>
              ${row.note ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">📌 ${row.note}</div>` : ''}
              ${row.items.length>1 ? `
                <button class="icon-btn" style="width:auto;padding:4px 10px;font-size:12px;margin-top:6px;" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='block'?'none':'block';">
                  הצג מוצרים נוספים (${row.items.length-1})
                </button>
                <div style="display:none;margin-top:6px;font-size:12.5px;">
                  ${row.items.slice(1).map(i=>`<div>${i.barcode} — ${i.name}</div>`).join('')}
                </div>
              ` : (row.items[0] ? `<div style="font-size:12px;color:var(--muted);margin-top:4px;">${row.items[0].barcode}</div>` : '')}
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;min-width:150px;">
              <label style="display:flex;align-items:center;gap:6px;font-size:13px;">
                <input type="checkbox" ${s.ordered?'checked':''} onchange="promoBoardToggle('${row.code}','ordered',this.checked)"> הוזמן
              </label>
              <label style="display:flex;align-items:center;gap:6px;font-size:13px;">
                <input type="checkbox" ${s.shelf?'checked':''} onchange="promoBoardToggle('${row.code}','shelf',this.checked)"> שילוט מדף
              </label>
              ${row.needsOffshelf ? `
              <label style="display:flex;align-items:center;gap:6px;font-size:13px;">
                <input type="checkbox" ${s.offshelf?'checked':''} onchange="promoBoardToggle('${row.code}','offshelf',this.checked)"> שילוט חוץ מדף
              </label>` : ''}
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>
  `;
}

/* כותב את מצב הצ'ק-בוקס לסניף הנוכחי בלבד (docId דטרמיניסטי, כמו standConfirmations).
   expireAt מוגדר ל-24 שעות קדימה מרגע הסימון — Firestore TTL policy (שצריך
   להגדיר פעם אחת ב-Console על השדה הזה) ימחק את הרשומה לבד אחרי כן. */
function promoBoardToggle(code, field, checked){
  const branchEmail = (session.branchInfo && session.branchInfo.email) || currentUserEmail;
  const docId = (code + '__' + branchEmail).replace(/[\/\s]/g,'_');
  const st = promoBoardChecklist[code] = promoBoardChecklist[code] || {ordered:false, shelf:false, offshelf:false};
  st[field] = checked;
  const expireAt = new Date(Date.now() + 24*60*60*1000);
  db.collection('purchasingPromoChecklist').doc(docId).set({
    branchEmail: branchEmail, promoCode: code,
    ordered: st.ordered, shelf: st.shelf, offshelf: st.offshelf,
    expireAt: expireAt,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, {merge:true}).catch(function(err){
    toast('שגיאה בשמירה: ' + err.message);
  });
  renderPromoBoard();
}
