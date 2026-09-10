/* ============================================================
   purchasing-promo-board.js
   ------------------------------------------------------------
   מסך הסניף: לוח מבצעים · רכש. קורא מ-appData.promoBooklet (כבר מסונכרן
   ע"י firebase-init.js לצורך promo-sales.js) + purchasingPromoItems +
   purchasingPromoChecklist (טעינה חד-פעמית כשנכנסים למסך).

   הוראות שילוב: ראו purchasing-promo-module-status.md / השיחה.
============================================================ */

const PROMO_BOARD_OFFSHELF_SECTIONS = [
  'במה עדיפות 1', 'במה עדיפות 2', 'מבצעים', 'מבצעים בולט',
  'מרקחת בולט', 'מערום קרטונים', 'קופות'
];

let promoBoardItems = null;
let promoBoardChecklist = {};
let promoBoardFilters = {supplier:new Set(), section:new Set(), dept:new Set(), group:new Set()};
let promoBoardPanelSearch = {supplier:'', section:'', dept:'', group:''};
let promoBoardOpenPanel = null;
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

function promoBoardBuildRows(){
  const byCode = {};
  Object.keys(promoBoardItems||{}).forEach(function(barcode){
    const it = promoBoardItems[barcode];
    if(!it.code) return;
    (byCode[it.code] = byCode[it.code] || []).push(Object.assign({barcode: barcode}, it));
  });
  const mostCommon = function(arr){
    arr = arr.filter(Boolean);
    if(!arr.length) return null;
    const c = {}; arr.forEach(x=>c[x]=(c[x]||0)+1);
    return Object.keys(c).sort((a,b)=>c[b]-c[a])[0];
  };
  const booklet = appData.promoBooklet || {};
  return Object.keys(booklet).map(function(code){
    const b = booklet[code];
    const items = byCode[code] || [];
    return {
      code: code,
      title: items[0] ? items[0].name : null,
      items: items,
      price: b.price, template: b.template, note: b.note, section: b.section,
      dept: mostCommon(items.map(i=>i.dept)),
      group: mostCommon(items.map(i=>i.group)),
      supplier: mostCommon(items.map(i=>i.supplier)),
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
  if(promoBoardFilters.supplier.size && !promoBoardFilters.supplier.has(row.supplier)) return false;
  if(promoBoardFilters.section.size && !promoBoardFilters.section.has(row.section)) return false;
  if(promoBoardFilters.dept.size && !promoBoardFilters.dept.has(row.dept)) return false;
  if(promoBoardFilters.group.size && !promoBoardFilters.group.has(row.group)) return false;
  if(promoBoardSearch){
    const hay = [row.title, row.code, row.note, ...(row.items||[]).map(i=>i.name+' '+i.barcode)].join(' ').toLowerCase();
    if(hay.indexOf(promoBoardSearch.toLowerCase())===-1) return false;
  }
  return true;
}

const PROMO_BOARD_FILTER_DEFS = [
  {key:'supplier', label:'ספקים'},
  {key:'section', label:'הנחיות תצוגה'},
  {key:'dept', label:'מחלקות'},
  {key:'group', label:'קבוצות'},
];

function promoBoardUniqueOptions(key, allRows){
  const counts = {};
  allRows.forEach(function(r){ const v=r[key]; if(!v) return; counts[v]=(counts[v]||0)+1; });
  return Object.keys(counts).sort((a,b)=>a.localeCompare(b,'he')).map(function(v){ return {value:v, n:counts[v]}; });
}

function promoBoardRenderFilters(allRows){
  const anyActive = Object.values(promoBoardFilters).some(s=>s.size>0);
  return `
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px;">
      ${PROMO_BOARD_FILTER_DEFS.map(function(def){
        const active = promoBoardFilters[def.key].size>0;
        const open = promoBoardOpenPanel===def.key;
        const allOpts = promoBoardUniqueOptions(def.key, allRows);
        const term = (promoBoardPanelSearch[def.key]||'').toLowerCase();
        const opts = term ? allOpts.filter(o=>o.value.toLowerCase().indexOf(term)!==-1) : allOpts;
        return `
        <div style="position:relative;">
          <button class="icon-btn" style="width:auto;padding:7px 12px;font-size:13px;${active?'border-color:var(--brand,#4E7A3A);color:var(--brand,#4E7A3A);font-weight:700;':''}"
            onclick="promoBoardOpenPanel=promoBoardOpenPanel==='${def.key}'?null:'${def.key}';renderPromoBoard();">
            ${def.label}${active?` (${promoBoardFilters[def.key].size})`:''}
          </button>
          ${open ? `
          <div style="position:absolute;top:calc(100% + 4px);right:0;z-index:20;background:var(--card,#fff);border:1px solid var(--gridline,#ddd);border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,.15);min-width:240px;max-height:320px;overflow-y:auto;padding:8px;" onclick="event.stopPropagation();">
            <input type="text" placeholder="הקלד לחיפוש..." value="${promoBoardPanelSearch[def.key]||''}"
              style="width:100%;border:1px solid var(--gridline,#ddd);border-radius:7px;padding:6px 9px;font-family:inherit;font-size:13px;margin-bottom:6px;box-sizing:border-box;"
              oninput="promoBoardPanelSearch['${def.key}']=this.value;renderPromoBoard();">
            <label style="display:flex;align-items:center;gap:8px;padding:5px 6px;font-weight:700;border-bottom:1px solid var(--gridline,#ddd);margin-bottom:4px;cursor:pointer;">
              <input type="checkbox" ${opts.length && opts.every(o=>promoBoardFilters[def.key].has(o.value))?'checked':''}
                onchange="promoBoardToggleAll('${def.key}', ${JSON.stringify(opts.map(o=>o.value))}, this.checked)">
              סמן הכל
            </label>
            ${opts.map(function(o){
              return `<label style="display:flex;align-items:center;gap:8px;padding:5px 6px;font-size:13px;cursor:pointer;">
                <input type="checkbox" ${promoBoardFilters[def.key].has(o.value)?'checked':''}
                  onchange="promoBoardToggleFilter('${def.key}','${o.value.replace(/'/g,"\\'")}',this.checked)">
                <span style="flex:1;">${o.value}</span><span style="color:var(--muted);font-size:11px;">${o.n}</span>
              </label>`;
            }).join('')}
            <button class="icon-btn" style="width:100%;margin-top:6px;font-size:12px;" onclick="promoBoardOpenPanel=null;renderPromoBoard();">סגור</button>
          </div>` : ''}
        </div>`;
      }).join('')}
      <button class="icon-btn" style="width:auto;padding:7px 12px;font-size:13px;${anyActive?'border-color:#B4611E;color:#B4611E;font-weight:700;':''}" onclick="promoBoardClearFilters()">נקה סינון</button>
      <button class="btn-primary" style="margin-inline-start:auto;" onclick="promoBoardExport()">📤 שתף / הדפס דוח</button>
    </div>
  `;
}
function promoBoardToggleFilter(key, value, checked){
  if(checked) promoBoardFilters[key].add(value); else promoBoardFilters[key].delete(value);
  renderPromoBoard();
}
function promoBoardToggleAll(key, values, checked){
  if(checked) values.forEach(v=>promoBoardFilters[key].add(v));
  else values.forEach(v=>promoBoardFilters[key].delete(v));
  renderPromoBoard();
}
function promoBoardClearFilters(){
  Object.keys(promoBoardFilters).forEach(k=>promoBoardFilters[k].clear());
  Object.keys(promoBoardPanelSearch).forEach(k=>promoBoardPanelSearch[k]='');
  promoBoardSearch=''; promoBoardOpenPanel=null;
  renderPromoBoard();
}

function renderPromoBoard(){
  const root = document.getElementById('pb-root');
  if(!root) return;
  const allRows = promoBoardBuildRows();
  const rows = allRows.filter(promoBoardMatchesFilters);
  const st = function(code){ return promoBoardChecklist[code] || {ordered:false, shelf:false, offshelf:false}; };
  const orderedCount = rows.filter(r=>st(r.code).ordered).length;

  root.innerHTML = `
    <div class="card" style="margin-bottom:14px;">
      <input type="text" placeholder="חיפוש לפי שם מוצר, ברקוד או מספר מבצע..." value="${promoBoardSearch}"
        style="width:100%;border:1px solid var(--gridline);border-radius:8px;padding:9px 12px;font-family:inherit;box-sizing:border-box;margin-bottom:10px;"
        oninput="promoBoardSearch=this.value;renderPromoBoard();">
      ${promoBoardRenderFilters(allRows)}
    </div>
    <div style="font-size:13px;color:var(--text-secondary);margin-bottom:10px;">
      מוצגים ${rows.length} מתוך ${allRows.length} מבצעים · הוזמנו ${orderedCount}/${rows.length}
    </div>
    <div class="admin-list">
      ${rows.map(function(row){
        const s = st(row.code);
        return `
        <div class="admin-row" style="flex-direction:column;align-items:stretch;">
          <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
            <div>
              <div style="font-weight:700;">${row.title || '(שם לא זוהה)'}</div>
              <div style="font-size:12px;color:var(--muted);">מבצע ${row.code} · ${row.supplier||''} · ${row.dept||''} / ${row.group||''} ${row.section?`· 📍 ${row.section}`:''}</div>
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

/* ---------- ייצוא/הדפסה: מדפיס את הרשימה המסוננת הנוכחית ---------- */
function promoBoardExport(){
  const allRows = promoBoardBuildRows();
  const rows = allRows.filter(promoBoardMatchesFilters);
  const st = function(code){ return promoBoardChecklist[code] || {ordered:false, shelf:false, offshelf:false}; };
  const today = new Date().toLocaleDateString('he-IL');
  const mark = function(v){ return v ? '✓' : '✗'; };
  let lines = [`דוח מבצעים - ${session.branchName||''}`, `תאריך: ${today}`, ''];
  const bySection = {};
  rows.forEach(function(r){ (bySection[r.section||'ללא שיוך']=bySection[r.section||'ללא שיוך']||[]).push(r); });
  Object.keys(bySection).sort((a,b)=>a.localeCompare(b,'he')).forEach(function(sec){
    lines.push('▸ ' + sec);
    bySection[sec].forEach(function(row){
      const s = st(row.code);
      const parts = [`הוזמן ${mark(s.ordered)}`, `מדף ${mark(s.shelf)}`];
      if(row.needsOffshelf) parts.push(`חוץ מדף ${mark(s.offshelf)}`);
      lines.push(`  מבצע ${row.code} - ${row.title||''} (${row.supplier||''}) | ${parts.join(' | ')}`);
    });
    lines.push('');
  });
  const text = lines.join('\n');
  const win = window.open('', '_blank');
  win.document.write(`<pre style="font-family:Arial;white-space:pre-wrap;direction:rtl;padding:20px;">${text}</pre>`);
  win.document.title = 'דוח מבצעים';
  win.print();
}

document.addEventListener('click', function(){ if(promoBoardOpenPanel){ promoBoardOpenPanel=null; renderPromoBoard(); } });
