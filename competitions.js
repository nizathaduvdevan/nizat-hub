/* ---------- Competitions ---------- */

/* ---- Generic, structure-driven Excel competition parser ----
   Detects repeated header rows (שם חנות/יעד/מכירות/אחוז מהיעד/מנהל אזור)
   to auto-split branches into a DYNAMIC number of groups (not hardcoded),
   and parses the "פרסים" section into tiered, ranked prize lists per group. */
const HEB_ORDINAL_RANK = {'ראשון':1,'שני':2,'שלישי':3,'רביעי':4,'חמישי':5,'שישי':6,'שביעי':7,'שמיני':8,'תשיעי':9,'עשירי':10};
const EXCLUDED_MANAGER = 'עופר דרורי'; /* מוצא באופן גורף מכל ייבוא/הצגה של אקסלי מכירות, לפי בקשת אלירן */
/* השוואה סלחנית לשם המנהל המוחרג — מתעלמת מרווחים כפולים/מובילים/סוגרים
   ומכל תו לא-רגיל, כדי לא לפספס אותו בגלל הבדל עדין בין קבצי אקסל שונים. */
function isExcludedManagerName(name){
  if(!name) return false;
  const normalized = name.toString().replace(/\s+/g,' ').trim();
  return normalized.indexOf(EXCLUDED_MANAGER) !== -1;
}
/* מעצב ערך תא בדיוק כמו שהוא מוצג באקסל המקורי (עבור טבלאות "AS IS") */
function formatSheetCellValue(raw, type){
  if(raw===undefined || raw===null || raw==='') return '';
  if(typeof raw === 'number'){
    if(type==='pct') return (raw*100).toFixed(2)+'%';
    if(type==='money') return raw.toLocaleString('he-IL', {maximumFractionDigits:0});
    if(type==='int') return raw.toLocaleString('he-IL');
    return raw.toString();
  }
  return raw.toString();
}
function normalizeBranchName(raw){
  let s = (raw||'').toString().trim();
  s = s.replace(/^\d+\s*[-–]?\s*/,'');
  s = s.replace(/^ניצת\s*[-–]?\s*/,'');
  s = s.replace(/[`'"׳״]/g,'');
  s = s.replace(/תקווה/g,'תקוה');
  s = s.replace(/(^|\s)ק\.(?=\S)/g,'$1קריית ');
  s = s.replace(/[-–]/g,' ');
  s = s.replace(/\s+/g,' ').trim();
  const LOC_ABBR = {'תא':'תל אביב','פת':'פתח תקוה','קש':'קריית שמונה','ראשלץ':'ראשון לציון','בש':'באר שבע','ק':'קריית','רמהש':'רמת השרון'};
  s = s.split(' ').map(w=> LOC_ABBR[w] || w).join(' ');
  return s.replace(/\s+/g,' ').trim();
}
function wordSubsetMatch(a,b){
  const wa = a.split(' ').filter(Boolean), wb = b.split(' ').filter(Boolean);
  if(!wa.length || !wb.length) return false;
  const setA = new Set(wa), setB = new Set(wb);
  return wa.every(w=>setB.has(w)) || wb.every(w=>setA.has(w));
}
function levenshtein(a,b){
  const m=a.length, n=b.length;
  const dp=[];
  for(let i=0;i<=m;i++){ dp.push(new Array(n+1).fill(0)); dp[i][0]=i; }
  for(let j=0;j<=n;j++) dp[0][j]=j;
  for(let i=1;i<=m;i++){
    for(let j=1;j<=n;j++){
      dp[i][j] = a[i-1]===b[j-1] ? dp[i-1][j-1] : 1+Math.min(dp[i-1][j-1],dp[i-1][j],dp[i][j-1]);
    }
  }
  return dp[m][n];
}
function seqIndex(big, small){
  if(!small.length || small.length>big.length) return -1;
  for(let i=0;i<=big.length-small.length;i++){
    let ok=true;
    for(let j=0;j<small.length;j++){ if(big[i+j]!==small[j]){ ok=false; break; } }
    if(ok) return i;
  }
  return -1;
}
function branchMatchScore(target, name){
  if(target === name) return 0;
  const tWords = target.split(' ').filter(Boolean);
  const nWords = name.split(' ').filter(Boolean);
  let idx = seqIndex(nWords, tWords);
  if(idx>=0) return 1 + (nWords.length-tWords.length)*0.4 + idx*0.15;
  idx = seqIndex(tWords, nWords);
  if(idx>=0) return 1 + (tWords.length-nWords.length)*0.4 + idx*0.15;
  if(wordSubsetMatch(target, name)) return 1.8;
  return 2.5 + levenshtein(target, name) * 0.35;
}
/* מוצאת את "הסניף שלי" בתוך רשימת הסניפים של מוצר מכר מבצעים — משתמשת
   באותו מנגנון התאמת שמות בדיוק כמו matchBranchInCompetition, כדי לא ליצור
   לוגיקת התאמה מקבילה. */
function matchMyBranchInPromoProduct(product, branchInfo){
  if(!product.branches || !product.branches.length || !branchInfo) return null;
  const target = normalizeBranchName(branchInfo.name);
  for(const b of product.branches){ if(normalizeBranchName(b.name) === target) return b; }
  let best=null, bestScore=Infinity;
  for(const b of product.branches){
    const score = branchMatchScore(target, normalizeBranchName(b.name));
    if(score < bestScore){ bestScore = score; best = b; }
  }
  return (best && bestScore < 3.2) ? best : null;
}
/* מוצאת את רשומת הסניף בספר הסניפים החי (BRANCH_DIRECTORY) לפי שם גולמי
   מתוך מוצר מכר מבצעים - אותו מנגנון התאמה בדיוק, כדי לדעת לאיזה אזור
   (b.area) הסניף שייך, בלי תלות בנתוני תחרות. */
const _branchDirEntryCache = {};
function findBranchDirectoryEntry(rawName){
  if(_branchDirEntryCache.hasOwnProperty(rawName)) return _branchDirEntryCache[rawName];
  const target = normalizeBranchName(rawName);
  let found = null;
  for(const b of BRANCH_DIRECTORY){ if(normalizeBranchName(b.name) === target){ found = b; break; } }
  if(!found){
    let best=null, bestScore=Infinity;
    for(const b of BRANCH_DIRECTORY){
      const score = branchMatchScore(target, normalizeBranchName(b.name));
      if(score < bestScore){ bestScore = score; best = b; }
    }
    found = (best && bestScore < 3.2) ? best : null;
  }
  _branchDirEntryCache[rawName] = found;
  return found;
}
/* מקבצת את הסניפים של מוצר מכר-מבצעים לפי אזור, ומחזירה חציון לכל אזור. */
let _promoAreaGroupCache = {};
function groupPromoProductByArea(product){
  if(_promoAreaGroupCache.hasOwnProperty(product.id)) return _promoAreaGroupCache[product.id];
  const areaMap = {};
  (product.branches||[]).forEach(b=>{
    const dirEntry = findBranchDirectoryEntry(b.name);
    const area = (dirEntry && dirEntry.area) || 'לא משויך';
    if(!areaMap[area]) areaMap[area] = {area, sum:0, count:0, branches:[]};
    areaMap[area].sum += (b.sales||0);
    areaMap[area].count++;
    areaMap[area].branches.push({name:b.name, sales:b.sales||0});
  });
  const result = Object.values(areaMap).map(a=>({area:a.area, med: median(a.branches.map(x=>x.sales)), count:a.count, branches:a.branches}));
  _promoAreaGroupCache[product.id] = result;
  return result;
}
/* פירוט כל סניפי האזור שלי במוצר נתון, ממוין מהגבוה לנמוך - זה מה שנותן
   למנהל האזור לראות בדיוק כמה כל סניף שלו מכר, לא רק חציון כללי. */
function myAreaBranchBreakdown(product){
  if(!isAreaViewer()) return [];
  const grouped = groupPromoProductByArea(product);
  const mine = grouped.find(a=>a.area===session.areaLabel);
  return mine ? [...mine.branches].sort((a,b)=>b.sales-a.sales) : [];
}
/* מחשבת את "הערך שלי" במוצר, בהתאם לתפקיד הצופה: סניף רואה את המכירה שלו,
   מנהל אזור רואה את חציון כל הסניפים באזור שלו. */
function computeMyPromoValue(product){
  if(session.role==='branch' && session.branchInfo){
    const b = matchMyBranchInPromoProduct(product, session.branchInfo);
    return b ? {sales:b.sales, label:'הסניף שלכם', unitLabel:'יחידות שנמכרו'} : null;
  }
  if(session.role==='area' && session.areaLabel){
    const grouped = groupPromoProductByArea(product);
    const mine = grouped.find(a=>a.area===session.areaLabel);
    return mine ? {sales: Math.round(mine.med*10)/10, label:`חציון האזור שלכם (${mine.count} סניפים)`, unitLabel:'יחידות (חציון)'} : null;
  }
  return null;
}

/* ---------- שרשור עדכונים לתחרות — עדכון חדש מופיע תמיד למעלה, כך שסניפים
   יכולים לראות את כל השתלשלות העדכונים מתחילת התחרות ועד סופה, בכל שלב.
   נשמר כמערך פנימי בתוך מסמך התחרות עצמו (c.updates), לא בקולקציה נפרדת. ---------- */
function competitionUpdatesHtml(c){
  const updates = (c.updates || []).slice().sort((a,b)=>b.id-a.id); /* חדש למעלה */
  const isMarketing = session.role==='marketing';
  return `
    <div class="comp-updates" style="margin:14px 0;border-top:1px solid var(--gridline);padding-top:12px;">
      <div style="font-size:14px;font-weight:600;margin-bottom:8px;">📢 עדכונים לתחרות</div>
      ${isMarketing ? `
      <div style="display:flex;gap:8px;margin-bottom:12px;align-items:flex-end;">
        <textarea id="comp-update-input-${c.id}" placeholder="הוספת עדכון חדש... (Enter יורד שורה, לחיצה על הכפתור שולחת)" rows="2" style="flex:1;padding:8px 10px;border:1px solid var(--gridline);border-radius:8px;font-size:13.5px;font-family:inherit;resize:vertical;"></textarea>
        <button class="btn-confirm" style="width:auto;padding:8px 16px;flex:none;" onclick="addCompetitionUpdate('${c.id}')">הוספה</button>
      </div>` : ''}
      ${updates.length ? updates.map(u=>`
        <div class="comp-update-item">
          <div class="comp-update-date">${u.date}</div>
          <div class="comp-update-text">${u.text}</div>
          ${isMarketing ? `<button class="icon-btn danger" style="width:24px;height:24px;font-size:11px;flex:none;" title="מחיקת עדכון" onclick="deleteCompetitionUpdate('${c.id}','${u.id}')">✕</button>` : ''}
        </div>
      `).join('') : `<div style="font-size:13px;color:var(--muted);">${isMarketing ? 'אין עדיין עדכונים — הוסיפו את הראשון למעלה.' : 'עדיין אין עדכונים לתחרות זו.'}</div>`}
    </div>
  `;
}
function addCompetitionUpdate(compId){
  const input = document.getElementById('comp-update-input-'+compId);
  const text = (input?.value || '').trim();
  if(!text) return;
  const comp = appData.competitions.find(x=>x.id==compId);
  if(!comp) return;
  const entry = {
    id: Date.now(),
    date: todayHeb() + ' ' + new Date().toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'}),
    text
  };
  const newUpdates = [...(comp.updates || []), entry];
  if(firebaseReady){
    db.collection('competitions').doc(compId).update({updates: newUpdates})
      .then(()=>{ toast('העדכון נוסף'); })
      .catch(err=>toast('שגיאה בהוספת העדכון: '+err.message));
  } else {
    comp.updates = newUpdates;
    renderContent();
  }
  if(input) input.value = '';
}
function deleteCompetitionUpdate(compId, updateId){
  if(!confirm('למחוק את העדכון הזה?')) return;
  const comp = appData.competitions.find(x=>x.id==compId);
  if(!comp) return;
  const newUpdates = (comp.updates || []).filter(u=>String(u.id)!==String(updateId));
  if(firebaseReady){
    db.collection('competitions').doc(compId).update({updates: newUpdates})
      .then(()=>{ toast('העדכון נמחק'); })
      .catch(err=>toast('שגיאה במחיקת העדכון: '+err.message));
  } else {
    comp.updates = newUpdates;
    renderContent();
  }
}
function compCard(c){
  const mine = session.branchName;
  const hasGroups = c.groups && c.groups.length;
  let groupsSection = '';
  if(hasGroups){
    if(session.role==='branch'){
      const match = matchBranchInCompetition(c, session.branchInfo);
      groupsSection = (match ? renderGroupForBranch(c, match.group, match.branch) : `<div class="comp-no-match">לא זוהתה התאמה אוטומטית בין הסניף שלכם לנתוני התחרות. פנו למחלקת השיווק לבירור.</div>`)
        + renderRawSalesTable(c) + renderCompetitionTabs(c);
    } else {
      groupsSection = renderRawSalesTable(c) + renderCompetitionTabs(c);
    }
  }
  return `
  <div class="card comp-card" style="overflow:hidden;">
    ${(c.heroDesktopUrl || c.heroMobileUrl) ? `
    <div class="comp-hero">
      <picture>
        ${c.heroMobileUrl ? `<source media="(max-width: 640px)" srcset="${c.heroMobileUrl}">` : ''}
        <img src="${c.heroDesktopUrl || c.heroMobileUrl}" alt="" loading="lazy">
      </picture>
      <div class="comp-hero-fade"></div>
    </div>` : ''}
    <div class="comp-top">
      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <span class="badge ${c.status}"><span class="dot"></span>${STATUS_LABEL[c.status]}</span>
          <span class="badge cat">${c.category}</span>
        </div>
        <h3 class="comp-title">${c.title}</h3>
        <div class="comp-meta"><span dir="ltr">${c.start} – ${c.end}</span></div>
      </div>
      ${c.logoDataUrl ? `<img src="${c.logoDataUrl}" class="comp-logo" alt="לוגו ${c.title}">` : ''}
    </div>
    ${compCountdownHtml(c)}
    <p class="comp-desc">${c.desc}</p>
    ${competitionUpdatesHtml(c)}
    ${hasGroups ? groupsSection : `
    <div class="comp-foot">
      <span class="prize-chip">🎁 ${c.prize}</span>
      ${c.leaderboard.length ? `<button class="link-btn" onclick="toggleLB('${c.id}')">לוח מובילים <span id="lb-arrow-${c.id}">▾</span></button>` : ''}
    </div>
    ${c.leaderboard.length ? `
    <div class="leaderboard" id="lb-${c.id}">
      ${c.leaderboard.map((r,idx)=>`
        <div class="lb-row ${idx===0?'top1':idx===1?'top2':idx===2?'top3':''} ${r.name===mine?'lb-mine':''}">
          <div class="lb-rank">${idx+1}</div>
          <div class="lb-name">${r.name}${r.name===mine?' (אתם)':''}</div>
          <div class="lb-score">${fmtMoney(r.score)}</div>
        </div>
      `).join('')}
    </div>` : ''}
    `}
    ${hasGroups ? '' : commentsBox('competition', c.id)}
  </div>`;
}
function renderGroupForBranch(comp, g, b){
  const pct = b.target>0 ? Math.round((b.sales/b.target)*100) : 0;
  const full = pct>=100;
  const remaining = b.target - b.sales;
  const prizes = g.prizes.slice().sort((x,y)=>x.rank-y.rank);
  const rankedGroup = g.branches.slice().sort((x,y)=>{
    const px = x.target>0 ? x.sales/x.target : 0, py = y.target>0 ? y.sales/y.target : 0;
    return py-px || y.sales-x.sales;
  });
  const myRank = rankedGroup.findIndex(x=>x.rawName===b.rawName) + 1;
  const groupTotalTarget = g.branches.reduce((s,x)=>s+x.target,0);
  const groupTotalSales = g.branches.reduce((s,x)=>s+x.sales,0);
  const groupRemaining = groupTotalTarget - groupTotalSales;
  return `
    <div class="comp-groups">
      <div class="comp-group-block" ${g.colorHex ? `style="border-right:4px solid ${g.colorHex};"` : ''}>
        <div class="comp-group-head">
          <span class="comp-group-name">יעדי ${session.branchName || b.name} <span style="color:var(--muted);font-weight:500;">(${b.rawName})</span></span>
          <span class="comp-target-chip" dir="ltr">יעד ${fmtMoney(b.target)} ₪</span>
        </div>
        <div class="comp-manager-row" style="margin-bottom:6px;">
          <span>שיוך לקבוצה: <b>${g.name}</b></span>
          ${myRank ? `<span style="margin-right:10px;">מקום ${myRank} מתוך ${rankedGroup.length} בקבוצה</span>` : ''}
        </div>
        <div class="comp-kpi-row">
          <div class="comp-kpi"><div class="l">יעד</div><div class="v" dir="ltr">${fmtMoney(b.target)} ₪</div></div>
          <div class="comp-kpi"><div class="l">מכירות בפועל</div><div class="v" dir="ltr">${fmtMoney(b.sales)} ₪</div></div>
          <div class="comp-kpi"><div class="l">אחוז מהיעד</div><div class="v" dir="ltr">${pct}%</div></div>
          <div class="comp-kpi ${remaining<=0?'kpi-done':''}"><div class="l">${remaining<=0?'עברתם את היעד':'נותר להשלמת היעד'}</div><div class="v" dir="ltr">${remaining<=0? '+'+fmtMoney(Math.abs(remaining)) : fmtMoney(remaining)} ₪</div></div>
          <div class="comp-kpi ${groupRemaining<=0?'kpi-done':''}"><div class="l">${groupRemaining<=0?'הקבוצה עברה את היעד':'נותר לכלל הקבוצה'}</div><div class="v" dir="ltr">${groupRemaining<=0? '+'+fmtMoney(Math.abs(groupRemaining)) : fmtMoney(groupRemaining)} ₪</div></div>
        </div>
        <div class="comp-progress-wrap">
          <div class="comp-progress-track"><div class="comp-progress-fill ${full?'full':''}" style="width:${Math.min(100,pct)}%"></div></div>
        </div>
        ${b.areaManager ? `<div class="comp-manager-row">👤 מנהל אזור: ${managerChip(comp, b.areaManager)}</div>` : ''}
        ${prizes.length ? `
        <div class="prize-list">
          ${prizes.map(p=>`<div class="prize-item"><span class="prize-rank">${p.rank}</span><span class="prize-text"><b>${p.label||('מקום '+p.rank)}:</b> ${p.text}</span></div>`).join('')}
        </div>` : ''}
      </div>
    </div>
  `;
}
/* טבלה בסגנון אקסל משותפת לשלושת הטאבים — כותרת בצבע הכותרות המקורי מהאקסל (תכלת),
   ותא "רצועת צבע" ראשון לכל שורה (כמו עמודה A בקובץ המקורי) שמשקף את צבע הקבוצה/מנהל האזור. */
function excelStyleTable(headerLabels, dataRows){
  const headHtml = `<tr>${headerLabels.map(h=>`<th style="background:#00FFFF;color:#1a1a1a;padding:4px 9px;border:1px solid rgba(0,0,0,0.08);font-size:12.5px;font-weight:700;white-space:nowrap;">${h}</th>`).join('')}</tr>`;
  const bodyHtml = dataRows.map(row=>`<tr>${row.map(cell=>{
    const bg = cell.bg || 'transparent';
    const color = cell.textColor || (cell.bg ? contrastTextColor(cell.bg) : 'inherit');
    return `<td style="background:${bg};color:${color};padding:4px 9px;border:1px solid rgba(0,0,0,0.08);white-space:nowrap;font-size:12.5px;${cell.bold?'font-weight:700;':''}">${cell.html!==undefined ? cell.html : (cell.text||'')}</td>`;
  }).join('')}</tr>`).join('');
  return `<div style="overflow-x:auto;-webkit-overflow-scrolling:touch;margin-top:8px;"><table style="border-collapse:collapse;min-width:100%;">${headHtml}${bodyHtml}</table></div>`;
}
function renderGroupsForAdmin(c){
  const RANK_COLORS = [
    {bg:'#FFD700', text:'#1a1a1a'}, {bg:'#C0C0C0', text:'#1a1a1a'}, {bg:'#CD7F32', text:'#ffffff'},
    {bg:'#4FA8DA', text:'#ffffff'}, {bg:'#8BC34A', text:'#1a1a1a'}
  ];
  return `
    <div class="comp-groups">
      ${c.groups.map(g=>{
        const prizes = g.prizes.slice().sort((x,y)=>x.rank-y.rank);
        const ranked = g.branches.slice().sort((a,b)=>{
          const pa = a.target>0 ? a.sales/a.target : 0, pb = b.target>0 ? b.sales/b.target : 0;
          return pb-pa || b.sales-a.sales;
        });
        return `
        <div class="comp-group-block" ${g.colorHex ? `style="border-right:4px solid ${g.colorHex};"` : ''}>
          <div class="comp-group-head">
            <span class="comp-group-name" style="${g.colorHex?`background:${g.colorHex};color:#000000;padding:3px 10px;border-radius:6px;display:inline-flex;align-items:center;gap:6px;`:''}">${g.name} · ${g.branches.length} סניפים</span>
            <span class="comp-target-chip" dir="ltr">יעד לסניף ${fmtMoney(g.target)} ₪</span>
          </div>
          ${prizes.length ? `
          <div class="prize-list">
            ${prizes.map((p,idx)=>{
              const winner = ranked[idx];
              const rc = RANK_COLORS[idx] || RANK_COLORS[RANK_COLORS.length-1];
              const label = (p.label || ('מקום '+p.rank)).replace(/:\s*$/,''); /* מסיר נקודתיים קיימות בסוף הכיתוב, כדי לא להכפיל אותן */
              return `<div class="prize-item" style="background:var(--page);color:var(--text-primary);border:1px solid var(--border);">
                <span class="prize-rank" style="background:${rc.bg};color:${rc.text};">${p.rank}</span>
                <span class="prize-text">${label}${winner?`: סניף ${winner.rawName}`:''} — ${p.text}</span>
              </div>`;
            }).join('')}
          </div>` : ''}
          ${commentsBox('competitionGroup', `${c.id}::${g.groupNum}`)}
        </div>`;
      }).join('')}
    </div>
  `;
}
/* ---------- טאב 2: לפי מנהל אזור — ממד ארגון שונה לגמרי מהקבוצות (target-tier);
   מפזרים את כל הסניפים מכל הקבוצות ומקבצים מחדש לפי מנהל האזור שלהם.
   כל מנהל: רשימת הסניפים שלו ממוינת מהגבוה לנמוך לפי יעד. ---------- */
/* טבלה בסגנון "AS IS" — כמו excelStyleTable אך מקבלת תאי כותרת אמיתיים (טקסט+צבע
   שנקראו ישירות מהאקסל), לא תוויות קבועות מראש. */
function asIsTable(headerCells, dataRows){
  const headHtml = `<tr>${headerCells.map(h=>{
    const bg = h.bg || '#00FFFF';
    const color = contrastTextColor(bg);
    return `<th style="background:${bg};color:${color};padding:4px 9px;border:1px solid rgba(0,0,0,0.08);font-size:12.5px;font-weight:700;white-space:nowrap;">${h.text||''}</th>`;
  }).join('')}</tr>`;
  const bodyHtml = dataRows.map(row=>`<tr>${row.map(cell=>{
    const bg = cell.bg || 'transparent';
    const color = cell.bg ? contrastTextColor(cell.bg) : 'inherit';
    return `<td style="background:${bg};color:${color};padding:4px 9px;border:1px solid rgba(0,0,0,0.08);white-space:nowrap;font-size:12.5px;">${cell.text||''}</td>`;
  }).join('')}</tr>`).join('');
  return `<div style="overflow-x:auto;-webkit-overflow-scrolling:touch;margin-top:8px;"><table style="border-collapse:collapse;min-width:100%;">${headHtml}${bodyHtml}</table></div>`;
}
/* ---------- טאב 2: לפי מנהל אזור — טבלת האקסל המקורית AS IS (ערכים+צבעים אמיתיים),
   מפוזרת מחדש לפי מנהל אזור; בכל מנהל: הסניפים ממוינים מהגבוה לנמוך לפי יעד. ---------- */
function renderByAreaManager(c){
  const byManager = {};
  c.groups.forEach(g=>{
    g.branches.forEach(b=>{
      const mgr = b.areaManager || 'ללא שיוך';
      if(!byManager[mgr]) byManager[mgr] = [];
      byManager[mgr].push(b);
    });
  });
  const managers = Object.keys(byManager).map(mgr=>{
    const branches = byManager[mgr].slice().sort((a,b)=> b.target - a.target);
    const totalSales = branches.reduce((s,b)=>s+b.sales,0);
    const totalTarget = branches.reduce((s,b)=>s+b.target,0);
    return {mgr, branches, totalSales, totalTarget};
  }).sort((a,b)=>{
    if(a.mgr==='ללא שיוך') return 1;
    if(b.mgr==='ללא שיוך') return -1;
    return a.mgr.localeCompare(b.mgr, 'he');
  });
  const headerCells = c.headerRowCells || [
    {text:'שם חנות', bg:'#00FFFF'}, {text:'יעד', bg:'#00FFFF'}, {text:'מכירות', bg:'#00FFFF'},
    {text:'אחוז מהיעד', bg:'#00FFFF'}, {text:'מנהל אזור', bg:'#00FFFF'}
  ];
  const grandTarget = managers.reduce((s,m)=>s+m.totalTarget,0);
  const grandSales = managers.reduce((s,m)=>s+m.totalSales,0);
  return `
    <div class="scroll-hint"><span class="arrow right">→</span> ניתן להחליק את הטבלה ימינה ושמאלה <span class="arrow left">←</span></div>
    <div class="comp-groups">
      ${managers.map(m=>{
        const pct = m.totalTarget>0 ? Math.round(m.totalSales/m.totalTarget*100) : 0;
        const hex = c.managerColors ? c.managerColors[m.mgr] : null;
        const tableRows = m.branches.map(b => b.rowCells ? [b.rowCells.name, b.rowCells.target, b.rowCells.sales, b.rowCells.pct, b.rowCells.manager] : [
          {text:b.rawName}, {text:fmtMoney(b.target)+' ₪'}, {text:fmtMoney(b.sales)+' ₪'}, {text:(b.target>0?Math.round(b.sales/b.target*100):0)+'%'}, {text:b.areaManager||''}
        ]);
        return `
        <div class="comp-group-block" ${hex ? `style="border-right:4px solid ${hex};"` : ''}>
          <div class="comp-group-head">
            <span class="comp-group-name">${m.mgr!=='ללא שיוך' ? managerChip(c, m.mgr) : m.mgr} · ${m.branches.length} סניפים</span>
            <span class="comp-target-chip" dir="ltr">${pct}% מהיעד המצטבר · מהגבוה לנמוך לפי יעד</span>
          </div>
          ${asIsTable(headerCells, tableRows)}
        </div>`;
      }).join('')}
      <div class="comp-group-block" style="border-right:4px solid #F4CCCC;">
        <div class="comp-group-head">
          <span class="comp-group-name" style="font-weight:700;">סה״כ כלל הרשת</span>
          <span class="comp-target-chip" dir="ltr">${grandTarget>0?Math.round(grandSales/grandTarget*100):0}% מהיעד המצטבר</span>
        </div>
        <div style="display:flex;gap:24px;font-size:14px;">
          <div><span style="color:var(--text-secondary);">סה״כ יעד: </span><strong dir="ltr">${fmtMoney(grandTarget)} ₪</strong></div>
          <div><span style="color:var(--text-secondary);">סה״כ מכירות: </span><strong dir="ltr">${fmtMoney(grandSales)} ₪</strong></div>
        </div>
      </div>
    </div>
  `;
}
/* ---------- טאב 3: סיכום אזורי כללי — טבלת אקסל: מנהל אזור (בצבעו) | אחוז מהיעד |
   סכום נמכר | יעד, ממוין מאחוז היעד הגבוה לנמוך, עם שורת סה"כ ורודה בתחתית. ---------- */
function renderAreaManagerSummary(c){
  const byManager = {};
  c.groups.forEach(g=>{
    g.branches.forEach(b=>{
      if(!b.areaManager) return; /* סניפים ללא שיוך למנהל אזור לא נכנסים לדירוג הזה */
      const mgr = b.areaManager;
      if(!byManager[mgr]) byManager[mgr] = {sales:0, target:0};
      byManager[mgr].sales += b.sales;
      byManager[mgr].target += b.target;
    });
  });
  const rows = Object.keys(byManager).map(mgr=>{
    const d = byManager[mgr];
    const pct = d.target>0 ? (d.sales/d.target*100) : 0;
    return {mgr, ...d, pct};
  }).sort((a,b)=>b.pct-a.pct);
  const totalTarget = rows.reduce((s,r)=>s+r.target,0);
  const totalSales = rows.reduce((s,r)=>s+r.sales,0);
  const totalPct = totalTarget>0 ? (totalSales/totalTarget*100) : 0;
  const HEAD_BLUE = '#BDD7EE';
  const TOTAL_PINK = '#F4CCCC';
  const cellStyle = 'padding:6px 12px;border:1px solid rgba(0,0,0,0.15);font-size:13.5px;text-align:center;';
  const headHtml = `<tr>
    <th style="background:#ffffff;color:#1a1a1a;${cellStyle}font-weight:700;">מנהל אזור</th>
    <th style="background:${HEAD_BLUE};color:#1a1a1a;${cellStyle}font-weight:700;">אחוז מהיעד</th>
    <th style="background:${HEAD_BLUE};color:#1a1a1a;${cellStyle}font-weight:700;">סכום נמכר</th>
    <th style="background:${HEAD_BLUE};color:#1a1a1a;${cellStyle}font-weight:700;">יעד</th>
  </tr>`;
  const bodyHtml = rows.map((r,idx)=>{
    const hex = (c.managerColors && c.managerColors[r.mgr]) || '#ffffff';
    const mgrTextColor = contrastTextColor(hex);
    return `<tr>
      <td style="background:${hex};color:${mgrTextColor};${cellStyle}font-weight:600;">${idx===0?'👑 ':''}${r.mgr}</td>
      <td style="background:#ffffff;color:#1a1a1a;${cellStyle}font-weight:700;" dir="ltr">${r.pct.toFixed(2)}%</td>
      <td style="background:#ffffff;color:#1a1a1a;${cellStyle}" dir="ltr">${r.sales ? fmtMoney(r.sales)+' ₪' : ''}</td>
      <td style="background:#ffffff;color:#1a1a1a;${cellStyle}font-weight:700;" dir="ltr">${fmtMoney(r.target)} ₪</td>
    </tr>`;
  }).join('');
  const totalHtml = `<tr>
    <td style="background:${TOTAL_PINK};color:#1a1a1a;${cellStyle}font-weight:700;">סה״כ</td>
    <td style="background:${TOTAL_PINK};color:#1a1a1a;${cellStyle}font-weight:700;" dir="ltr">${totalPct.toFixed(2)}%</td>
    <td style="background:${TOTAL_PINK};color:#1a1a1a;${cellStyle}font-weight:700;" dir="ltr">${totalSales ? fmtMoney(totalSales)+' ₪' : '0 ₪'}</td>
    <td style="background:${TOTAL_PINK};color:#1a1a1a;${cellStyle}font-weight:700;" dir="ltr">${fmtMoney(totalTarget)} ₪</td>
  </tr>`;
  return `
    <div class="card">
      <h3 style="text-align:center;margin:0 0 12px;font-size:16px;">${c.title}${c.start&&c.end?` <span dir="ltr">${c.start}–${c.end}</span>`:''} - מנהלי אזור</h3>
      <div class="scroll-hint"><span class="arrow right">→</span> ניתן להחליק את הטבלה ימינה ושמאלה <span class="arrow left">←</span></div>
      <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">
        <table style="border-collapse:collapse;min-width:100%;">${headHtml}${bodyHtml}${totalHtml}</table>
      </div>
    </div>
  `;
}
/* ---------- עטיפת שלושת הטאבים ---------- */
function renderRawSalesTable(c){
  if(!c.rawTable || !c.rawTable.length) return '';
  const rowsHtml = c.rawTable.map(row=>`
    <tr>${(row.cells||[]).map(cell=>{
      const bg = cell.bg || 'transparent';
      const color = cell.bg ? contrastTextColor(cell.bg) : 'inherit';
      return `<td style="background:${bg};color:${color};padding:4px 9px;border:1px solid rgba(0,0,0,0.08);white-space:nowrap;font-size:12.5px;">${cell.text || ''}</td>`;
    }).join('')}</tr>
  `).join('');
  return `
    <div class="scroll-hint"><span class="arrow right">→</span> ניתן להחליק את הטבלה ימינה ושמאלה <span class="arrow left">←</span></div>
    <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;margin-bottom:14px;">
      <table style="border-collapse:collapse;min-width:100%;">${rowsHtml}</table>
    </div>
  `;
}
function renderCompetitionTabs(c){
  return `
    <div class="comp-tabs-nav">
      <button class="comp-tab-btn active" data-ctab="general" id="ctab-btn-general-${c.id}" onclick="switchCompTab('${c.id}','general')">תצוגה כללית</button>
      <button class="comp-tab-btn" data-ctab="area" id="ctab-btn-area-${c.id}" onclick="switchCompTab('${c.id}','area')">תצוגה לפי איזור</button>
      <button class="comp-tab-btn" data-ctab="summary" id="ctab-btn-summary-${c.id}" onclick="switchCompTab('${c.id}','summary')">סיכום איזורי כללי</button>
    </div>
    <div class="comp-tab-content" id="ctab-general-${c.id}">${renderGroupsForAdmin(c)}</div>
    <div class="comp-tab-content" id="ctab-area-${c.id}" style="display:none;">${renderByAreaManager(c)}</div>
    <div class="comp-tab-content" id="ctab-summary-${c.id}" style="display:none;">${renderAreaManagerSummary(c)}</div>
  `;
}
function switchCompTab(compId, tab){
  ['general','area','summary'].forEach(t=>{
    const content = document.getElementById(`ctab-${t}-${compId}`);
    const btn = document.getElementById(`ctab-btn-${t}-${compId}`);
    if(content) content.style.display = (t===tab) ? '' : 'none';
    if(btn) btn.classList.toggle('active', t===tab);
  });
}
function renderNetworkRanking(c, myKey){
  const all = [];

  c.groups.forEach(g=>{
    g.branches.forEach(b=>{
      const pct = b.target>0 ? Math.round((b.sales/b.target)*100) : 0;
      all.push({rawName:b.rawName, groupName:g.name, sales:b.sales, pct});
    });
  });
  all.sort((x,y)=> y.pct-x.pct || y.sales-x.sales);
  return `
    <div class="comp-foot" style="margin-top:14px;border-top:1px solid var(--gridline);padding-top:12px;">
      <button class="link-btn" onclick="toggleLB('net-${c.id}')">📊 השוואה ארצית — כל ${all.length} סניפי הרשת בתחרות זו <span id="lb-arrow-net-${c.id}">▾</span></button>
    </div>
    <div class="leaderboard" id="lb-net-${c.id}">
      ${all.map((b,idx)=>`
        <div class="lb-row ${idx===0?'top1':idx===1?'top2':idx===2?'top3':''} ${b.rawName===myKey?'lb-mine':''}">
          <div class="lb-rank">${idx+1}</div>
          <div class="lb-name">${b.rawName}${b.rawName===myKey?' (אתם)':''} <span style="color:var(--muted);font-weight:500;font-size:11px;">· ${b.groupName}</span></div>
          <div class="lb-score">${b.pct}%</div>
        </div>
      `).join('')}
    </div>
  `;
}
function toggleGroupTable(compId, groupNum){
  const el = document.getElementById(`grp-table-${compId}-${groupNum}`);
  const arrow = document.getElementById(`grp-arrow-${compId}-${groupNum}`);
  el.classList.toggle('open');
  arrow.textContent = el.classList.contains('open') ? '▴' : '▾';
}
function toggleLB(id){
  const el = document.getElementById('lb-'+id);
  const arrow = document.getElementById('lb-arrow-'+id);
  el.classList.toggle('open');
  arrow.textContent = el.classList.contains('open') ? '▴' : '▾';
}
