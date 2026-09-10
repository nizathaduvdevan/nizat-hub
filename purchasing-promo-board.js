/* ============================================================
   purchasing-promo-board.js
   ------------------------------------------------------------
   מסך הסניף: חוברת מבצעים · רכש. עיצוב ולוגיקה נאמנים לפרוטוטייפ
   המאושר (nizat_promo_board_preview v11-13) — פילטרים עם "סמן הכל"
   וחיפוש, כפתור ייצוא עם 3 אפשרויות (הדפסה/וואטסאפ/מייל).
   קורא מ-appData.promoBooklet (מסונכרן כבר ע"י firebase-init.js
   לצורך promo-sales.js) + purchasingPromoItems + purchasingPromoChecklist
   (טעינה חד-פעמית כשנכנסים למסך).
============================================================ */

const PROMO_BOARD_OFFSHELF_SECTIONS = [
  'במה עדיפות 1', 'במה עדיפות 2', 'מבצעים', 'מבצעים בולט',
  'מרקחת בולט', 'מערום קרטונים', 'קופות'
];

let promoBoardItems = null;
let promoBoardChecklist = {};
let promoBoardFilters = {supplier:new Set(), section:new Set(), dept:new Set(), group:new Set()};
let promoBoardOpenPanel = null;
let promoBoardSearch = '';
let promoBoardLoaded = false;
let pbPanelSearch = {supplier:'', section:'', dept:'', group:''};
let pbFocusRestore = null; // {id, selStart, selEnd} to restore focus/cursor after a full re-render
let promoBoardExpanded = {};

const PB_FILTER_DEFS = [
  {key:'supplier', label:'ספקים'},
  {key:'section', label:'הנחיות תצוגה'},
  {key:'dept', label:'מחלקות'},
  {key:'group', label:'קבוצות'},
];

function pbInjectStyleOnce(){
  if(document.getElementById('pb-style')) return;
  const style = document.createElement('style');
  style.id = 'pb-style';
  style.textContent = `
    .pb-toolbar{background:var(--card,#fff); border:1px solid var(--gridline,#ddd); border-radius:10px; padding:14px 16px; margin-bottom:16px;}
    .pb-search-row{display:flex; gap:10px; margin-bottom:12px;}
    .pb-search-row input{flex:1; border:1px solid var(--gridline,#ddd); border-radius:8px; padding:9px 12px; font-family:inherit; font-size:14px; box-sizing:border-box;}
    .pb-filter-groups{display:flex; gap:10px; flex-wrap:wrap; align-items:center;}
    .pb-filter-group{position:relative;}
    .pb-filter-toggle{display:flex; align-items:center; gap:6px; border:1px solid var(--gridline,#ddd); background:var(--bg,#f7f7f5); border-radius:8px; padding:8px 12px; font-family:inherit; font-size:13.5px; cursor:pointer;}
    .pb-filter-toggle .pb-count{background:var(--brand,#4E7A3A); color:#fff; border-radius:10px; font-size:11px; padding:1px 7px; font-weight:600;}
    .pb-filter-toggle.pb-is-active{border:2px solid var(--brand,#4E7A3A); background:rgba(78,122,58,.14); color:var(--brand,#4E7A3A); font-weight:700;}
    .pb-filter-panel{display:none; position:absolute; top:calc(100% + 6px); right:0; z-index:20; background:var(--card,#fff); border:1px solid var(--gridline,#ddd); border-radius:10px; box-shadow:0 6px 20px rgba(0,0,0,.15); min-width:270px; max-height:380px; overflow-y:auto; padding:8px;}
    .pb-filter-panel.open{display:block;}
    .pb-filter-search{width:100%; border:1px solid var(--gridline,#ddd); border-radius:7px; padding:7px 10px; margin-bottom:6px; font-family:inherit; font-size:13px; box-sizing:border-box;}
    .pb-filter-close{display:block; width:100%; text-align:center; margin-top:6px; padding:6px; border-radius:7px; border:1px solid var(--gridline,#ddd); background:var(--bg,#f7f7f5); font-family:inherit; font-size:12px; cursor:pointer;}
    .pb-filter-option{display:flex; align-items:center; gap:8px; padding:6px 8px; border-radius:6px; font-size:13.5px; cursor:pointer;}
    .pb-filter-option:hover{background:var(--bg,#f7f7f5);}
    .pb-filter-option .pb-opt-label{flex:1;}
    .pb-filter-option .pb-opt-n{color:var(--muted,#888); font-size:12px;}
    .pb-filter-option.select-all{font-weight:700; border-bottom:1px solid var(--gridline,#ddd); margin-bottom:4px; padding-bottom:8px;}
    .pb-clear-btn{border:1px solid var(--gridline,#ddd); background:var(--card,#fff); border-radius:8px; padding:8px 12px; font-family:inherit; font-size:13.5px; cursor:pointer;}
    .pb-clear-btn.pb-is-active{border:2px solid #B4611E; background:#FBECDD; color:#B4611E; font-weight:700;}

    .pb-summary{display:flex; gap:18px; flex-wrap:wrap; align-items:center; font-size:13.5px; color:var(--muted,#666); margin-bottom:16px;}
    .pb-pill{display:inline-flex; align-items:center; gap:5px; padding:3px 10px; border-radius:20px; font-size:12.5px; font-weight:600;}
    .pb-pill.done{background:#E7F2E9; color:#3D7A4F;}
    .pb-pill.pending{background:#FBECDD; color:#B4611E;}

    .pb-list{border:1px solid var(--gridline,#ddd); border-radius:10px; overflow:hidden;}
    .pb-promo{display:grid; grid-template-columns:1fr auto; gap:14px; padding:14px 16px; border-bottom:1px solid var(--gridline,#ddd); align-items:start; background:var(--card,#fff);}
    .pb-promo:last-child{border-bottom:none;}
    .pb-title{font-size:15.5px; font-weight:800; margin-bottom:3px;}
    .pb-supplier{font-size:13px; font-weight:600; color:var(--brand,#4E7A3A); margin-bottom:4px;}
    .pb-id{font-weight:700; font-size:12px; color:var(--muted,#888); background:var(--bg,#f7f7f5); padding:1px 7px; border-radius:5px; display:inline-block; margin-bottom:6px;}
    .pb-id.flag{color:#B4611E; background:#FBECDD; font-style:italic;}
    .pb-item-row{display:flex; align-items:baseline; gap:8px; font-size:13.5px; margin-bottom:2px;}
    .pb-item-row .pb-barcode{font-size:11.5px; color:var(--muted,#888);}
    .pb-item-row .pb-iname{font-weight:600;}
    .pb-show-items{background:none; border:1px dashed var(--gridline,#ddd); color:var(--brand,#4E7A3A); border-radius:7px; font-family:inherit; font-size:12px; padding:4px 10px; cursor:pointer; margin-top:4px;}
    .pb-items-extra{display:none; margin-top:4px;}
    .pb-items-extra.open{display:block;}
    .pb-meta{display:flex; gap:12px; flex-wrap:wrap; font-size:12.5px; color:var(--muted,#888); margin:6px 0; align-items:center;}
    .pb-price{font-weight:700; font-size:14px; background:var(--bg,#f7f7f5); padding:2px 9px; border-radius:6px;}
    .pb-note{font-size:12.5px; color:var(--muted,#888); margin-top:6px; line-height:1.6;}
    .pb-tag{font-size:11.5px; font-weight:700; padding:1px 8px; border-radius:20px; background:#F1E9F6; color:#7A4F9E;}
    .pb-checklist{display:flex; flex-direction:column; gap:6px; min-width:160px;}
    .pb-chk{display:flex; align-items:center; gap:7px; font-size:12.5px; cursor:pointer; padding:5px 9px; border-radius:7px; border:1px solid var(--gridline,#ddd); background:var(--bg,#f7f7f5); white-space:nowrap;}
    .pb-chk input{width:15px; height:15px; margin:0; cursor:pointer;}
    .pb-chk.on{background:#E7F2E9; border-color:#3D7A4F; color:#3D7A4F; font-weight:600;}

    .pb-export-wrap{position:relative;}
    .pb-export-btn{display:flex; align-items:center; gap:8px; background:var(--brand,#4E7A3A); color:#fff; border:none; border-radius:10px; padding:10px 18px; font-family:inherit; font-size:14px; font-weight:800; cursor:pointer;}
    .pb-export-menu{display:none; position:absolute; left:0; top:calc(100% + 8px); z-index:30; background:var(--card,#fff); border:1px solid var(--gridline,#ddd); border-radius:10px; box-shadow:0 8px 24px rgba(0,0,0,.16); min-width:230px; padding:6px;}
    .pb-export-menu.open{display:block;}
    .pb-export-option{display:flex; align-items:center; gap:10px; width:100%; text-align:right; background:none; border:none; border-radius:7px; padding:10px 12px; font-family:inherit; font-size:14px; cursor:pointer;}
    .pb-export-option:hover{background:var(--bg,#f7f7f5);}
    .pb-empty{padding:40px; text-align:center; color:var(--muted,#888); font-size:14px; background:var(--card,#fff); border-radius:10px; border:1px solid var(--gridline,#ddd);}

    /* מובייל: כרטיס מבצע נערם לעמודה אחת, הצ'ק-ליסט נפרש לרוחב מתחת לטקסט
       (במקום עמודה צרה בצד) כדי שהטקסט יקבל את כל הרוחב ולא יראה "גושי".
       פאנל הפילטר: על מסך צר, "דבוק לכפתור" שובר (בורח חוץ למסך, קורס
       לרוחב עד שרק המספרים נראים) — לכן על מובייל הוא הופך לחלון מרכזי
       קבוע (כמו מודל), לא dropdown צמוד לכפתור. */
    @media (max-width: 640px){
      .pb-promo{grid-template-columns:1fr; gap:10px;}
      .pb-checklist{flex-direction:row; flex-wrap:wrap; min-width:0; width:100%;}
      .pb-chk{flex:1 1 auto; justify-content:center;}
      .pb-title{font-size:15px; line-height:1.4;}
      .pb-meta{gap:8px;}
      .pb-filter-groups{gap:6px;}
      .pb-filter-panel{
        position:fixed; top:12vh; right:5vw; left:5vw; bottom:auto;
        width:auto; max-width:none; max-height:76vh; z-index:200;
        box-shadow:0 10px 40px rgba(0,0,0,.3);
      }
      .pb-export-wrap{margin-inline-start:0 !important; width:100%;}
      .pb-export-btn{width:100%; justify-content:center;}
      .pb-export-menu{position:fixed; left:5vw; right:5vw; top:auto; bottom:10vh; width:auto;}
    }
  `;
  document.head.appendChild(style);
}

function viewPurchasingPromoBoard(){
  pbInjectStyleOnce();
  if(!promoBoardLoaded){ loadPromoBoardData(); }
  else { setTimeout(renderPromoBoard, 0); }
  return `
    <div class="page-head">
      <h1>חוברת מבצעים · רכש</h1>
      <p>הזמנה, שילוט מדף ושילוט חוץ-מדף לכל מבצע</p>
    </div>
    <div id="pb-root">${promoBoardLoaded ? '' : '<p style="color:var(--muted,#888);">טוען נתונים...</p>'}</div>
  `;
}

function loadPromoBoardData(){
  const branchEmail = (session.branchInfo && session.branchInfo.email) || currentUserEmail;
  Promise.all([
    db.collection('purchasingPromoItems').get(),
    db.collection('purchasingPromoChecklist').where('branchEmail','==',branchEmail).get()
  ]).then(function(results){
    promoBoardItems = {};
    results[0].forEach(function(doc){ promoBoardItems[doc.id] = doc.data(); });
    promoBoardChecklist = {};
    results[1].forEach(function(doc){
      const d = doc.data();
      promoBoardChecklist[d.promoCode] = {ordered:!!d.ordered, shelf:!!d.shelf, offshelf:!!d.offshelf};
    });
    promoBoardLoaded = true;
    renderPromoBoard();
  }).catch(function(err){ toast('שגיאה בטעינת נתוני לוח המבצעים: ' + err.message); });
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
  const codeCounts = {};
  Object.keys(booklet).forEach(c=>{ codeCounts[c]=(codeCounts[c]||0)+1; }); // booklet keys are unique doc ids, always 1 — kept for parity/documents only
  return Object.keys(booklet).map(function(code){
    const b = booklet[code];
    const items = byCode[code] || [];
    return {
      id: code, displayId: code, needsCheck:false,
      title: items[0] ? items[0].name : null,
      items: items,
      price: b.price, template: b.template, notes: b.note||'', section: b.section,
      dept: mostCommon(items.map(i=>i.dept)),
      group: mostCommon(items.map(i=>i.group)),
      supplier: mostCommon(items.map(i=>i.supplier)),
      showOffShelf: PROMO_BOARD_OFFSHELF_SECTIONS.indexOf(b.section) !== -1,
    };
  });
}

function pbPriceLabel(row){
  const t = (row.template||'').trim();
  const p = row.price;
  if(p==null) return t;
  const pct = Number(p).toFixed(0);
  const money = '₪' + Number(p).toFixed(2);
  // exact-match on the known template strings (see cloud function / import JSON
  // for the canonical set) rather than fragile keyword search — Hebrew
  // inflected forms ("בהנחת" vs "הנחה") don't reliably substring-match.
  if(t === 'מוצר שני ב-% הנחה') return `מוצר שני ב-${pct}% הנחה`;
  if(t === 'פריט בהנחת אחוז') return `פריט ב-${pct}% הנחה`;
  if(t === 'פריט במחיר נקוב') return `פריט במחיר נקוב: ${money}`;
  if(/^\d+\s*(יח'|יחידות)\s*ב-$/.test(t)) return `${t}${money}`; // "2 יח' ב-" / "5 יחידות ב-"
  if(t.indexOf('%')!==-1 || t.indexOf('הנחה')!==-1) return `${t.replace('%', pct+'%')}`;
  return t ? `${t}: ${money}` : money;
}

function pbUniqueOptions(key, allRows){
  const counts = {};
  allRows.forEach(function(r){ const v=r[key]; if(!v) return; counts[v]=(counts[v]||0)+1; });
  return Object.keys(counts).sort((a,b)=>a.localeCompare(b,'he')).map(function(v){ return {value:v, n:counts[v]}; });
}

function pbMatchesFilters(row){
  for(const def of PB_FILTER_DEFS){
    const set = promoBoardFilters[def.key];
    if(set.size && !set.has(row[def.key])) return false;
  }
  if(promoBoardSearch){
    const itemText = (row.items||[]).map(i=>i.name+' '+i.barcode).join(' ');
    const hay = [row.notes, row.supplier, row.id, row.title, itemText].join(' ').toLowerCase();
    if(hay.indexOf(promoBoardSearch.toLowerCase())===-1) return false;
  }
  return true;
}

function pbRenderFilterGroups(allRows){
  let html = '<div class="pb-filter-groups">';
  PB_FILTER_DEFS.forEach(function(def){
    const active = promoBoardFilters[def.key].size>0;
    const open = promoBoardOpenPanel===def.key;
    const allOpts = pbUniqueOptions(def.key, allRows);
    const term = (pbPanelSearch[def.key]||'').toLowerCase();
    const opts = term ? allOpts.filter(o=>o.value.toLowerCase().indexOf(term)!==-1) : allOpts;
    const allChecked = opts.length && opts.every(o=>promoBoardFilters[def.key].has(o.value));
    html += `
      <div class="pb-filter-group">
        <button type="button" class="pb-filter-toggle ${active?'pb-is-active':''}" onclick="event.stopPropagation();promoBoardOpenPanel=promoBoardOpenPanel==='${def.key}'?null:'${def.key}';renderPromoBoard();">
          ${def.label}${active?` <span class="pb-count">${promoBoardFilters[def.key].size}</span>`:''}
        </button>
        <div class="pb-filter-panel ${open?'open':''}" onclick="event.stopPropagation();">
          <input type="text" class="pb-filter-search" id="pb-panel-search-${def.key}" placeholder="הקלד לחיפוש..." value="${pbPanelSearch[def.key]||''}"
            oninput="pbPanelSearch['${def.key}']=this.value;renderPromoBoard();">
          <label class="pb-filter-option select-all">
            <input type="checkbox" ${allChecked?'checked':''} onchange="pbToggleAll('${def.key}', ${JSON.stringify(opts.map(o=>o.value)).replace(/"/g,'&quot;')}, this.checked)">
            <span class="pb-opt-label">סמן הכל</span>
          </label>
          ${opts.length ? opts.map(function(o){
            return `<label class="pb-filter-option">
              <input type="checkbox" ${promoBoardFilters[def.key].has(o.value)?'checked':''} onchange="pbToggleFilter('${def.key}', ${JSON.stringify(o.value).replace(/"/g,'&quot;')}, this.checked)">
              <span class="pb-opt-label">${o.value}</span><span class="pb-opt-n">${o.n}</span>
            </label>`;
          }).join('') : '<div style="padding:10px;color:var(--muted,#888);font-size:12.5px;">אין תוצאות תואמות</div>'}
          <button type="button" class="pb-filter-close" onclick="promoBoardOpenPanel=null;renderPromoBoard();">סגור</button>
        </div>
      </div>
    `;
  });
  const anyActive = Object.values(promoBoardFilters).some(s=>s.size>0);
  html += `<button type="button" class="pb-clear-btn ${anyActive?'pb-is-active':''}" onclick="pbClearFilters()">נקה סינון</button>`;
  html += `
    <div class="pb-export-wrap" style="margin-inline-start:auto;">
      <button type="button" class="pb-export-btn" onclick="event.stopPropagation();pbToggleExportMenu();">📤 שתף / הדפס דוח</button>
      <div class="pb-export-menu" id="pbExportMenu" onclick="event.stopPropagation();">
        <button type="button" class="pb-export-option" onclick="pbExportPrint()">🖨️ הדפסה (על נייר)</button>
        <button type="button" class="pb-export-option" onclick="pbExportPdfShare()">📄 יצירת PDF לשיתוף (מייל / וואטסאפ)</button>
      </div>
    </div>
  `;
  html += '</div>';
  return html;
}
function pbToggleFilter(key, value, checked){
  if(checked) promoBoardFilters[key].add(value); else promoBoardFilters[key].delete(value);
  renderPromoBoard();
}
function pbToggleAll(key, values, checked){
  if(checked) values.forEach(v=>promoBoardFilters[key].add(v));
  else values.forEach(v=>promoBoardFilters[key].delete(v));
  renderPromoBoard();
}
function pbClearFilters(){
  Object.keys(promoBoardFilters).forEach(k=>promoBoardFilters[k].clear());
  Object.keys(pbPanelSearch).forEach(k=>pbPanelSearch[k]='');
  promoBoardSearch=''; promoBoardOpenPanel=null;
  const box = document.getElementById('pbSearchBox'); if(box) box.value='';
  renderPromoBoard();
}
function pbToggleExportMenu(){
  const menu = document.getElementById('pbExportMenu');
  if(menu) menu.classList.toggle('open');
}
document.addEventListener('click', function(){
  let changed = false;
  if(promoBoardOpenPanel){ promoBoardOpenPanel=null; changed=true; }
  const menu = document.getElementById('pbExportMenu');
  if(menu && menu.classList.contains('open')){ menu.classList.remove('open'); }
  if(changed) renderPromoBoard();
});

function renderPromoBoard(){
  const root = document.getElementById('pb-root');
  if(!root) return;
  // remember which input had focus (and cursor position) so typing isn't
  // interrupted by the full innerHTML rebuild below
  const active = document.activeElement;
  let focusInfo = null;
  if(active && active.id && root.contains(active)){
    focusInfo = {id: active.id, selStart: active.selectionStart, selEnd: active.selectionEnd};
  }
  const allRows = promoBoardBuildRows();
  const rows = allRows.filter(pbMatchesFilters);
  const st = function(code){ return promoBoardChecklist[code] || {ordered:false, shelf:false, offshelf:false}; };
  const orderedCount = rows.filter(r=>st(r.id).ordered).length;

  let html = `
    <div class="pb-toolbar">
      <div class="pb-search-row">
        <input type="text" id="pbSearchBox" placeholder="חיפוש לפי שם מוצר, ברקוד, מספר מבצע או ספק..." value="${promoBoardSearch}">
      </div>
      ${pbRenderFilterGroups(allRows)}
    </div>
    <div class="pb-summary">
      מוצגים <b>${rows.length}</b> מתוך <b>${allRows.length}</b> מבצעים
      <span class="pb-pill done">✓ הוזמנו: ${orderedCount}/${rows.length}</span>
      <span class="pb-pill pending">⏳ ממתינים: ${rows.length-orderedCount}/${rows.length}</span>
    </div>
  `;

  if(!rows.length){
    html += '<div class="pb-empty">אין מבצעים התואמים את הסינון הנוכחי.</div>';
  } else {
    html += '<div class="pb-list">';
    rows.forEach(function(row){
      const s = st(row.id);
      const items = row.items||[];
      const first = items[0], rest = items.slice(1);
      html += `
        <div class="pb-promo">
          <div>
            <div class="pb-supplier">${row.supplier||''}</div>
            <div class="pb-id${row.needsCheck?' flag':''}">מבצע ${row.displayId}</div>
            <div class="pb-title">${row.title || '(שם לא זוהה)'}</div>
            ${first ? `<div class="pb-item-row"><span class="pb-barcode">${first.barcode}</span><span class="pb-iname">${first.name}</span></div>` : ''}
            ${rest.length ? `
              <button type="button" class="pb-show-items" onclick="pbToggleItems('${row.id}', ${rest.length})">הצג מוצרים נוספים (${rest.length})</button>
              <div class="pb-items-extra ${promoBoardExpanded[row.id]?'open':''}" id="pb-items-${row.id}">
                ${rest.map(i=>`<div class="pb-item-row"><span class="pb-barcode">${i.barcode}</span><span class="pb-iname">${i.name}</span></div>`).join('')}
              </div>
            ` : ''}
            <div class="pb-meta">
              <span class="pb-price">${pbPriceLabel(row)}</span>
              <span>${row.dept||''} / ${row.group||''}</span>
              ${row.section ? `<span class="pb-tag">📍 ${row.section}</span>` : ''}
            </div>
            ${row.notes ? `<div class="pb-note">📌 ${row.notes}</div>` : ''}
          </div>
          <div class="pb-checklist">
            <label class="pb-chk ${s.ordered?'on':''}"><input type="checkbox" ${s.ordered?'checked':''} onchange="promoBoardToggle('${row.id}','ordered',this.checked)"> ${s.ordered?'✓ ':''}הוזמן</label>
            <label class="pb-chk ${s.shelf?'on':''}"><input type="checkbox" ${s.shelf?'checked':''} onchange="promoBoardToggle('${row.id}','shelf',this.checked)"> ${s.shelf?'✓ ':''}שילוט מדף</label>
            ${row.showOffShelf ? `<label class="pb-chk ${s.offshelf?'on':''}"><input type="checkbox" ${s.offshelf?'checked':''} onchange="promoBoardToggle('${row.id}','offshelf',this.checked)"> ${s.offshelf?'✓ ':''}שילוט חוץ מדף</label>` : ''}
          </div>
        </div>
      `;
    });
    html += '</div>';
  }

  root.innerHTML = html;
  const box = document.getElementById('pbSearchBox');
  if(box) box.addEventListener('input', function(e){ promoBoardSearch = e.target.value; renderPromoBoard(); });
  // restore focus + cursor position to whichever input was being typed in
  if(focusInfo){
    const el = document.getElementById(focusInfo.id);
    if(el){
      el.focus();
      if(typeof el.setSelectionRange === 'function' && focusInfo.selStart != null){
        try{ el.setSelectionRange(focusInfo.selStart, focusInfo.selEnd); }catch(e){}
      }
    }
  }
}

function pbToggleItems(code, count){
  promoBoardExpanded[code] = !promoBoardExpanded[code];
  const el = document.getElementById('pb-items-' + code);
  if(el) el.classList.toggle('open', promoBoardExpanded[code]);
  const btn = event.target;
  btn.textContent = promoBoardExpanded[code] ? 'הסתר מוצרים' : `הצג מוצרים נוספים (${count})`;
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
  }, {merge:true}).catch(function(err){ toast('שגיאה בשמירה: ' + err.message); });
  renderPromoBoard();
}

/* ---------- ייצוא: הדפסה (HTML מעוצב) / WhatsApp / מייל (טקסט נקי) ---------- */
function pbReportRows(){
  const allRows = promoBoardBuildRows();
  const rows = allRows.filter(pbMatchesFilters);
  const st = function(code){ return promoBoardChecklist[code] || {ordered:false, shelf:false, offshelf:false}; };
  const bySection = {};
  rows.forEach(function(r){ (bySection[r.section||'ללא שיוך']=bySection[r.section||'ללא שיוך']||[]).push(r); });
  return {rows, st, bySection, ordered: rows.filter(r=>st(r.id).ordered).length};
}

/* טקסט פשוט (ל-WhatsApp/מייל, שלא תומכים ב-HTML מעוצב) — עדיין קריא ומסודר:
   כותרות סקשן עם קו מפריד, שורה לכל מבצע עם ✅/❌ ברור לכל צ'ק-בוקס. */
function pbBuildReportText(){
  const {rows, st, bySection, ordered} = pbReportRows();
  const today = new Date().toLocaleDateString('he-IL');
  const mark = function(v){ return v ? '✅' : '⬜'; };
  let lines = [
    `📋 *דוח מבצעים — ${session.branchName||''}*`,
    `📅 ${today}   |   הוזמנו ${ordered}/${rows.length}`,
    '━━━━━━━━━━━━━━━━━━',
  ];
  Object.keys(bySection).sort((a,b)=>a.localeCompare(b,'he')).forEach(function(sec){
    lines.push('', `📍 *${sec}*`);
    bySection[sec].forEach(function(row){
      const s = st(row.id);
      const parts = [`${mark(s.ordered)} הוזמן`, `${mark(s.shelf)} מדף`];
      if(row.showOffShelf) parts.push(`${mark(s.offshelf)} חוץ מדף`);
      lines.push(`• #${row.id} ${row.title||''} (${row.supplier||''})`, `   ${parts.join('   ')}`);
    });
  });
  return lines.join('\n');
}

/* דוח HTML מעוצב, לחלון הדפסה בלבד — לא לשימוש ב-WhatsApp/מייל שלא תומכים ב-HTML. */
function pbBuildReportHTML(){
  const {rows, st, bySection, ordered} = pbReportRows();
  const today = new Date().toLocaleDateString('he-IL');
  const chip = function(ok, label){
    return `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:14px;font-size:12.5px;font-weight:600;
      background:${ok?'#E7F2E9':'#F3F3F1'};color:${ok?'#3D7A4F':'#999'};border:1px solid ${ok?'#3D7A4F':'#ddd'};">${ok?'✓':'—'} ${label}</span>`;
  };
  let sectionsHtml = '';
  Object.keys(bySection).sort((a,b)=>a.localeCompare(b,'he')).forEach(function(sec){
    const secRows = bySection[sec];
    const secDone = secRows.filter(r=>st(r.id).ordered).length;
    sectionsHtml += `
      <div style="margin-bottom:22px;">
        <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #1B221E;padding-bottom:6px;margin-bottom:10px;">
          <h2 style="font-size:16px;margin:0;">📍 ${sec}</h2>
          <span style="font-size:12.5px;color:#666;">${secDone}/${secRows.length} הוזמנו</span>
        </div>
        ${secRows.map(function(row){
          const s = st(row.id);
          return `
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #eee;">
            <div>
              <div style="font-weight:700;font-size:14px;">${row.title||''} <span style="font-weight:400;color:#888;font-size:12px;">· ${row.supplier||''} · מבצע ${row.id}</span></div>
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0;">
              ${chip(s.ordered,'הוזמן')}
              ${chip(s.shelf,'מדף')}
              ${row.showOffShelf ? chip(s.offshelf,'חוץ מדף') : ''}
            </div>
          </div>`;
        }).join('')}
      </div>
    `;
  });
  return `
    <html dir="rtl" lang="he"><head><meta charset="UTF-8"><title>דוח מבצעים</title></head>
    <body style="font-family:Arial,Helvetica,sans-serif;color:#1B221E;padding:28px;max-width:800px;margin:0 auto;">
      <div style="border-bottom:3px solid #1B221E;padding-bottom:14px;margin-bottom:20px;">
        <h1 style="margin:0 0 4px;font-size:22px;">📋 דוח מבצעים</h1>
        <div style="color:#666;font-size:13.5px;">${session.branchName||''} · ${today} · הוזמנו ${ordered}/${rows.length}</div>
      </div>
      ${sectionsHtml}
    </body></html>
  `;
}

function pbExportPrint(){
  document.getElementById('pbExportMenu').classList.remove('open');
  const win = window.open('', '_blank');
  win.document.write(pbBuildReportHTML());
  win.document.close();
  win.focus();
  setTimeout(function(){ win.print(); }, 300); // תן לדפדפן החדש רגע לרנדר לפני שפותחים הדפסה
}
/* יוצר PDF אמיתי (לא רק דיאלוג הדפסה) מתוך אותו דוח HTML המעוצב, כדי
   שאפשר יהיה לשתף אותו כקובץ אמיתי (במובייל: חלונית השיתוף המקורית של
   הטלפון, שם אפשר לבחור וואטסאפ/מייל/כל אפליקציה אחרת; בדסקטופ: מוריד
   את הקובץ, לצרף ידנית). טוען html2canvas + jsPDF מ-CDN בפעם הראשונה בלבד. */
function pbLoadPdfLibs(){
  if(window.html2canvas && window.jspdf) return Promise.resolve();
  const load = (src) => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
  return load('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js')
    .then(() => load('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'));
}
function pbExportPdfShare(){
  document.getElementById('pbExportMenu').classList.remove('open');
  toast('מכין PDF...');
  pbLoadPdfLibs().then(function(){
    const holder = document.createElement('div');
    holder.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;background:#fff;'; // ~A4 width at 96dpi
    holder.innerHTML = pbBuildReportHTML().replace(/^[\s\S]*<body[^>]*>/,'').replace(/<\/body>[\s\S]*$/,'');
    document.body.appendChild(holder);
    return html2canvas(holder, {backgroundColor:'#ffffff', scale:2}).then(function(canvas){
      document.body.removeChild(holder);
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({unit:'px', format:[canvas.width, canvas.height]});
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, canvas.width, canvas.height);
      return pdf.output('blob');
    });
  }).then(function(blob){
    const file = new File([blob], 'דוח-מבצעים.pdf', {type:'application/pdf'});
    if(navigator.canShare && navigator.canShare({files:[file]})){
      navigator.share({files:[file], title:'דוח מבצעים'}).catch(function(){});
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'דוח-מבצעים.pdf'; a.click();
      URL.revokeObjectURL(url);
      toast('ה-PDF ירד — אפשר לצרף אותו ידנית במייל/וואטסאפ');
    }
  }).catch(function(err){
    toast('שגיאה ביצירת ה-PDF: ' + err.message);
  });
}
