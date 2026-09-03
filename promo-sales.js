/* ============================================================
   מנוע ניתוח מכר מבצעים (רכש) — סיווג לשלוש קבוצות
   ------------------------------------------------------------
   בונה, לכל קוד מבצע, את "המימוש שלי" (סניף או סכום סניפי אזור) מול
   חציון קבוצת השוואה (כל שאר הסניפים, או רק ביו מרקט אם מוגבל), ומסווג
   ל"בדיקת חריגה" (אפס מקומי מול פעילות רשתית), "בירור פער" (מתחת
   לחציון) או "לשמר חוזקה" (מעל החציון). בנוי מעל promoProducts (מכר בפועל)
   + promoBooklet (מטא-דאטה מהחוברת: תבנית/מחיר/הערות/הגבלות/איחודים),
   כך שאם promoBooklet ריק (עוד לא הועלה החודש) המסך פשוט לא מציג ניתוח,
   בלי לשבור את שאר האתר. */
function median(arr){
  if(!arr.length) return null;
  const s = [...arr].sort((a,b)=>a-b);
  const mid = Math.floor(s.length/2);
  return s.length%2 ? s[mid] : (s[mid-1]+s[mid])/2;
}
function promoMultiplier(template){
  if(!template) return 1;
  if(template.indexOf("2 יח") !== -1) return 2;
  if(template.indexOf('3 יחידות') !== -1) return 3;
  if(template.indexOf('5 יחידות') !== -1) return 5;
  if(template.indexOf('מוצר שני') !== -1) return 2;
  return 1;
}
/* בנייה חד-פעמית (פר-רינדור) של: (1) מוצרים ממוזגים לפי קוד מאוחד
   (mergedInto מסוכם לתוך קוד ההורה), (2) מפת branchName -> sales לכל קוד. */
let _promoAnalysisCache = null;
function buildPromoAnalysisBase(){
  if(_promoAnalysisCache) return _promoAnalysisCache;
  const booklet = appData.promoBooklet || {};
  const byCode = {}; /* code -> {title, salesByBranch:{branch:num}} */
  (appData.promoProducts||[]).forEach(p=>{
    const code = p.code!=null ? String(p.code) : null;
    if(!code) return;
    const meta = booklet[code];
    const targetCode = (meta && meta.mergedInto) ? meta.mergedInto : code;
    if(!byCode[targetCode]) byCode[targetCode] = {title:null, salesByBranch:{}};
    if(!meta || !meta.mergedInto) byCode[targetCode].title = p.title;
    (p.branches||[]).forEach(b=>{
      byCode[targetCode].salesByBranch[b.name] = (byCode[targetCode].salesByBranch[b.name]||0) + (b.sales||0);
    });
  });
  _promoAnalysisCache = {byCode};
  return _promoAnalysisCache;
}
const BIO_MARKET_MATCH = 'ביו מרקט';
function isBioMarketBranch(name){ return (name||'').indexOf(BIO_MARKET_MATCH) !== -1; }
/* קבוצת ההשוואה הרשתית לקוד נתון: כל הסניפים, חוץ מהמוצאים בפועל
   (excludeNames) - או רק סניפי ביו מרקט אם המבצע מוגבל אליהם. */
function promoComparisonPool(meta, excludeNames){
  const allBranchNames = BRANCH_DIRECTORY.map(b=>b.name);
  const pool = (meta && meta.restricted==='ביו מרקט') ? allBranchNames.filter(isBioMarketBranch) : allBranchNames;
  return pool.filter(n=>excludeNames.indexOf(n)===-1);
}
function isPromoRelevantForBranch(meta, branchName){
  if(meta && meta.restricted==='ביו מרקט') return isBioMarketBranch(branchName);
  return true;
}
/* מסווגת ערך אחד (סניף/אזור) מול מערך ערכי השוואה. group: 'anomaly'|'gap'|'strength'|'none' */
function classifyPromoValue(selfVal, comparisonVals){
  const med = median(comparisonVals);
  const positiveOthers = comparisonVals.filter(v=>v>0).length;
  const totalOthers = comparisonVals.length;
  const gapNum = med===null ? null : (selfVal-med);
  const gapPct = (med && med>0) ? ((selfVal/med-1)*100) : null;
  let group = 'none';
  if(selfVal===0 && totalOthers>0 && (positiveOthers/totalOthers)>=0.7 && positiveOthers>=10) group = 'anomaly';
  else if(med!==null && selfVal<med) group = 'gap';
  else if(med!==null && selfVal>med) group = 'strength';
  return {med, positiveOthers, totalOthers, gapNum, gapPct, group, selfVal};
}
/* דוח מלא לסניף בודד: שלוש קבוצות + ממצאים שסויגו החוצה. */
function buildPromoBranchReport(branchName){
  const {byCode} = buildPromoAnalysisBase();
  const booklet = appData.promoBooklet || {};
  const out = {anomaly:[], gap:[], strength:[], scopedOut:[]};
  Object.keys(byCode).forEach(code=>{
    const meta = booklet[code] || {};
    const entry = byCode[code];
    if(!isPromoRelevantForBranch(meta, branchName)){ out.scopedOut.push({code, title:entry.title, reason:`מבצע ייעודי ל${meta.restricted}, לא רלוונטי לסניף זה.`}); return; }
    const selfVal = entry.salesByBranch[branchName] || 0;
    const compVals = promoComparisonPool(meta, [branchName]).map(n=>entry.salesByBranch[n]||0);
    if(!compVals.length){ out.scopedOut.push({code, title:entry.title, reason:'אין סניפי השוואה זמינים.'}); return; }
    const cls = classifyPromoValue(selfVal, compVals);
    if(cls.group==='none') return;
    out[cls.group].push({code, title:entry.title, meta, cls});
  });
  return out;
}
/* דוח מלא לאזור (קבוצת סניפים): סכום הסניפים באזור מול "צפי" = חציון
   הרשת (למעט סניפי האזור) × מספר סניפים באזור. קירוב מוצהר, לא מדד רשמי.
   בכל שורה מצורפת גם רשימת הסניפים באזור עם 0 מימושים באותו קוד - חשוב
   למנהל האזור לראות בדיוק אילו סניפים ספציפיים לא מימשו, לא רק את הסכום. */
function buildPromoAreaReport(areaBranchNames){
  const {byCode} = buildPromoAnalysisBase();
  const booklet = appData.promoBooklet || {};
  const out = {anomaly:[], gap:[], strength:[], scopedOut:[]};
  Object.keys(byCode).forEach(code=>{
    const meta = booklet[code] || {};
    const entry = byCode[code];
    const relevant = areaBranchNames.filter(n=>isPromoRelevantForBranch(meta, n));
    if(!relevant.length) return;
    const totalSelf = relevant.reduce((s,n)=>s+(entry.salesByBranch[n]||0),0);
    const zeroBranches = relevant.filter(n=>(entry.salesByBranch[n]||0)===0);
    const compVals = promoComparisonPool(meta, areaBranchNames).map(n=>entry.salesByBranch[n]||0);
    const med = median(compVals);
    if(med===null) return;
    const expected = med * relevant.length;
    const gapPct = expected>0 ? ((totalSelf/expected-1)*100) : null;
    let group = 'none';
    if(totalSelf===0 && expected>0) group = 'anomaly';
    else if(totalSelf<expected) group = 'gap';
    else if(totalSelf>expected) group = 'strength';
    if(group==='none') return;
    out[group].push({code, title:entry.title, meta, cls:{selfVal:totalSelf, med:expected, gapPct, branchCount:relevant.length, zeroBranches}});
  });
  return out;
}
function promoInsightText(row, isArea){
  const {meta, cls} = row;
  const parts = [];
  if(row.__group==='anomaly' || (!isArea && cls.group==='anomaly')){
    if(isArea){
      parts.push(`אפס מימושים באזור. הצפי (חציון הרשת × מספר סניפים) היה ${cls.med.toFixed(1)}.`);
    } else {
      parts.push(`0 מימושים בסניף, מול ${cls.positiveOthers} מתוך ${cls.totalOthers} סניפים אחרים פעילים. החציון הוא ${cls.med}.`);
    }
  } else if(row.__group==='gap' || (!isArea && cls.group==='gap')){
    if(meta.note && meta.note.indexOf('בחוץ מדף')!==-1) parts.push('כדאי לבדוק שילוט/מיקום מול ההנחיה: ' + meta.note.replace('מימושים.','').trim());
    if(meta.template && (meta.template.indexOf('שני')!==-1 || meta.template.indexOf("2 יח")!==-1)) parts.push('מבצע זוגות/שני יחידות — ייתכן שלקוחות לא משלימים את המימוש.');
    if(!parts.length) parts.push('פער מתחת לחציון קבוצת ההשוואה; מומלץ בדיקת זמינות ומיקום.');
  } else {
    parts.push(cls.med===0 ? 'פעילות חיובית מול בסיס השוואה נמוך — לא בהכרח הצטיינות.' : 'מעל החציון — לשמר זמינות.');
  }
  if(isArea && cls.zeroBranches && cls.zeroBranches.length){
    parts.push(`סניפים באזור עם 0 מימושים: ${cls.zeroBranches.join(', ')}.`);
  }
  if(meta.restricted) parts.push(`⚠ מבצע ייעודי ל${meta.restricted} בלבד.`);
  if(meta.needsParticipantList) parts.push('⚠ בחוברת סומן כ"פתוח לחלק מהסניפים בלבד" - נתוני המכר מראים בפועל מי מוכר ומי לא, כך שסניף עם מכירות בפועל נחשב משתתף מאומת.');
  const mult = promoMultiplier(meta.template);
  if(mult>1 && !isArea) parts.push(`כל מימוש = ${mult} פריטים (${cls.selfVal} מימושים ≈ ${cls.selfVal*mult} פריטים).`);
  return parts.join(' ');
}
function promoGroupLabel(group){
  return group==='anomaly' ? 'בדיקת חריגה' : (group==='gap' ? 'בירור פער' : 'לשמר חוזקה');
}
function promoGroupColor(group){
  return group==='anomaly' ? 'var(--critical)' : (group==='gap' ? 'var(--warning)' : 'var(--good)');
}
function promoAnalysisRowHtml(row, group, isArea){
  row.__group = group;
  const priceTxt = row.meta.price ? '₪'+Number(row.meta.price).toFixed(2) : '';
  const codeTxt = row.code;
  const areaPrefix = row.cls.areaLabel ? `<span style="color:var(--blue,#185FA5);font-weight:600;">אזור ${row.cls.areaLabel}</span> · ` : '';
  return `
    <div class="admin-row" style="align-items:flex-start;flex-direction:column;gap:6px;">
      <div class="admin-row-main">
        <div class="t">${areaPrefix}${row.title||''} <span style="font-family:monospace;font-size:11.5px;color:var(--muted);">#${codeTxt}</span></div>
        <div class="m">${row.meta.template||''} ${priceTxt}</div>
      </div>
      <div style="font-size:12.5px;color:var(--text-secondary);">${promoInsightText(row, isArea)}</div>
    </div>
  `;
}
function promoAnalysisSectionHtml(title, group, rows, isArea, emptyMsg){
  const sortFn = (a,b)=>{
    if(group==='anomaly') return (b.cls.positiveOthers||0)-(a.cls.positiveOthers||0);
    if(group==='strength') return (b.cls.gapPct||0)-(a.cls.gapPct||0);
    return Math.abs(b.cls.gapNum||(b.cls.selfVal-b.cls.med)||0) - Math.abs(a.cls.gapNum||(a.cls.selfVal-a.cls.med)||0);
  };
  const sorted = [...rows].sort(sortFn);
  const visible = sorted.slice(0,5);
  const rest = sorted.slice(5);
  const extraId = 'promo-extra-' + group;
  return `
    <div style="margin-bottom:18px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <span style="width:10px;height:10px;border-radius:50%;background:${promoGroupColor(group)};display:inline-block;"></span>
        <h3 style="margin:0;font-size:14.5px;">${title} <span style="font-weight:400;color:var(--text-secondary);font-size:12.5px;">(${rows.length} ממצאים)</span></h3>
      </div>
      <div class="card">
        ${visible.length ? visible.map(r=>promoAnalysisRowHtml(r,group,isArea)).join('') : `<div class="empty-state">${emptyMsg}</div>`}
        ${rest.length ? `
          <div id="${extraId}" style="display:none;">${rest.map(r=>promoAnalysisRowHtml(r,group,isArea)).join('')}</div>
          <button id="${extraId}-btn" class="icon-btn" style="width:100%;margin-top:8px;font-size:12.5px;" onclick="togglePromoMore('${extraId}')">הראה לי עוד (${rest.length} נוספים)</button>
        ` : ''}
      </div>
    </div>
  `;
}
function togglePromoMore(id){
  const el = document.getElementById(id);
  if(el) el.style.display = 'block';
  const btn = document.getElementById(id+'-btn');
  if(btn) btn.style.display = 'none';
}
/* גרסה לתצוגה הארצית: הממצאים מגיעים מכל 6 האזורים מעורבבים יחד, אז מיון
   שטוח + slice(0,5) גלובלי עלול "לבלוע" אזור שקט לגמרי אם אזור אחר רועש.
   כאן ממיינים בתוך כל אזור בנפרד, לוקחים עד 5 לכל אזור, ואז מציגים אזור
   אחר אזור (בסדר האזורים שבטבלת ה-KPI) עם כותרת-משנה לכל אזור. */
function promoNationalSectionHtml(title, group, rows, emptyMsg, capPerArea){
  const cap = capPerArea || 5;
  const sortFn = (a,b)=>{
    if(group==='anomaly') return (b.cls.positiveOthers||0)-(a.cls.positiveOthers||0);
    if(group==='strength') return (b.cls.gapPct||0)-(a.cls.gapPct||0);
    return Math.abs(b.cls.gapNum||(b.cls.selfVal-b.cls.med)||0) - Math.abs(a.cls.gapNum||(a.cls.selfVal-a.cls.med)||0);
  };
  const areaLabels = Object.values(AREA_MANAGER_INFO).filter(v=>v.areaName).map(v=>v.areaName);
  const byArea = areaLabels.map(area=>{
    const sortedArea = rows.filter(r=>r.cls.areaLabel===area).sort(sortFn);
    return {area, visible: sortedArea.slice(0,cap), rest: sortedArea.slice(cap)};
  }).filter(x=>x.visible.length);
  return `
    <div style="margin-bottom:18px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <span style="width:10px;height:10px;border-radius:50%;background:${promoGroupColor(group)};display:inline-block;"></span>
        <h3 style="margin:0;font-size:14.5px;">${title} <span style="font-weight:400;color:var(--text-secondary);font-size:12.5px;">(${rows.length} ממצאים בס"ה)</span></h3>
      </div>
      <div class="card">
        ${byArea.length ? byArea.map(({area,visible,rest})=>{
          const extraId = 'promo-extra-national-' + group + '-' + area;
          return `
          <div style="margin-bottom:10px;">
            <div style="font-size:12.5px;font-weight:600;color:var(--blue,#185FA5);padding:6px 4px 2px;">אזור ${area}</div>
            ${visible.map(r=>promoAnalysisRowHtml(r,group,true)).join('')}
            ${rest.length ? `
              <div id="${extraId}" style="display:none;">${rest.map(r=>promoAnalysisRowHtml(r,group,true)).join('')}</div>
              <button id="${extraId}-btn" class="icon-btn" style="width:100%;margin-top:4px;font-size:12px;" onclick="togglePromoMore('${extraId}')">הראה לי עוד (${rest.length} נוספים באזור ${area})</button>
            ` : ''}
          </div>
        `;}).join('') : `<div class="empty-state">${emptyMsg}</div>`}
      </div>
    </div>
  `;
}
/* דוח מאקרו לתצוגה ארצית (ארבל/עופר) - לא ברמת סניף, אלא ברמת אזור מול
   אזור. לכל קוד מבצע, כל אזור מושווה מול חציון "הממוצע לסניף" של שאר
   האזורים (מנורמל למספר הסניפים באזור, כדי שאזור גדול לא ייראה חזק
   באופן מלאכותי רק כי יש בו יותר סניפים). */
function buildPromoNationalReport(){
  const {byCode} = buildPromoAnalysisBase();
  const booklet = appData.promoBooklet || {};
  const areaLabels = Object.values(AREA_MANAGER_INFO).filter(v=>v.areaName).map(v=>v.areaName);
  const areaBranchMap = {};
  areaLabels.forEach(a=>{ areaBranchMap[a] = BRANCH_DIRECTORY.filter(b=>b.area===a).map(b=>b.name); });
  const out = {anomaly:[], gap:[], strength:[]};
  Object.keys(byCode).forEach(code=>{
    const meta = booklet[code] || {};
    const entry = byCode[code];
    const areaStats = areaLabels.map(a=>{
      const branches = (areaBranchMap[a]||[]).filter(n=>isPromoRelevantForBranch(meta, n));
      if(!branches.length) return null;
      const total = branches.reduce((s,n)=>s+(entry.salesByBranch[n]||0),0);
      const zeroBranches = branches.filter(n=>(entry.salesByBranch[n]||0)===0);
      return {area:a, total, perBranch: total/branches.length, count:branches.length, zeroBranches};
    }).filter(Boolean);
    if(areaStats.length<2) return; /* אין מה להשוות בין פחות משני אזורים */
    areaStats.forEach(as=>{
      const others = areaStats.filter(x=>x.area!==as.area).map(x=>x.perBranch);
      const med = median(others);
      if(med===null) return;
      const expected = med * as.count;
      const gapPct = expected>0 ? ((as.total/expected-1)*100) : null;
      let group = 'none';
      if(as.total===0 && expected>0) group = 'anomaly';
      else if(as.total<expected) group = 'gap';
      else if(as.total>expected) group = 'strength';
      if(group==='none') return;
      out[group].push({code, title:entry.title, meta, cls:{selfVal:as.total, med:expected, gapPct, branchCount:as.count, zeroBranches:as.zeroBranches, areaLabel:as.area}});
    });
  });
  return out;
}
/* טבלת KPI תמציתית לכל אזור: סה"כ מימושים ברשת (כל הקודים), ומספר קודים
   בכל אחת משלוש הקבוצות - זו התמונה ה"ארצית לפי מנהלי אזור" עצמה. */
function promoNationalSummaryTableHtml(report){
  const areaLabels = Object.values(AREA_MANAGER_INFO).filter(v=>v.areaName).map(v=>v.areaName);
  const rows = areaLabels.map(a=>{
    const areaBranches = BRANCH_DIRECTORY.filter(b=>b.area===a).map(b=>b.name);
    const {byCode} = buildPromoAnalysisBase();
    let total = 0;
    Object.values(byCode).forEach(entry=>{ areaBranches.forEach(n=>{ total += (entry.salesByBranch[n]||0); }); });
    const anomalyCount = report.anomaly.filter(r=>r.cls.areaLabel===a).length;
    const gapCount = report.gap.filter(r=>r.cls.areaLabel===a).length;
    const strengthCount = report.strength.filter(r=>r.cls.areaLabel===a).length;
    return {area:a, branchCount:areaBranches.length, total, anomalyCount, gapCount, strengthCount};
  }).sort((x,y)=>y.total-x.total);
  return `
    <div class="card" style="margin-bottom:18px;overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;white-space:nowrap;">
        <thead><tr style="text-align:right;color:var(--text-secondary);">
          <th style="padding:6px 8px;">מנהל אזור</th><th style="padding:6px 8px;">סניפים</th>
          <th style="padding:6px 8px;">סה"כ מימושים (כל הקודים)</th>
          <th style="padding:6px 8px;color:var(--critical,#d03b3b);">בדיקת חריגה</th>
          <th style="padding:6px 8px;color:var(--warning,#c9962f);">בירור פער</th>
          <th style="padding:6px 8px;color:var(--good,#0ca30c);">לשמר חוזקה</th>
        </tr></thead>
        <tbody>
          ${rows.map(r=>`
            <tr style="border-top:1px solid var(--gridline);">
              <td style="padding:6px 8px;font-weight:500;">${r.area}</td>
              <td style="padding:6px 8px;">${r.branchCount}</td>
              <td style="padding:6px 8px;">${r.total}</td>
              <td style="padding:6px 8px;">${r.anomalyCount||'—'}</td>
              <td style="padding:6px 8px;">${r.gapCount||'—'}</td>
              <td style="padding:6px 8px;">${r.strengthCount||'—'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}
/* המסך הראשי לניתוח מכר מבצעים (סניף/אזור) - מוצג מעל עיון-לפי-מוצר. */
function viewPromoAnalysis(){
  const bookletCount = Object.keys(appData.promoBooklet||{}).length;
  if(!bookletCount){
    return `<div class="card"><div class="empty-state">עדיין לא הועלתה חוברת המבצעים החודשית — הניתוח יופיע כאן ברגע שרכש יעלה אותה ב"ניהול תוכן".</div></div>`;
  }
  if(hasPromoNationalAccess()){
    const report = buildPromoNationalReport();
    return `
      <div class="card" style="margin-bottom:16px;">
        <div style="font-weight:500;font-size:15px;margin-bottom:4px;">ניתוח מכר מבצעים — תצוגה ארצית לפי מנהלי אזור</div>
        <div style="font-size:12.5px;color:var(--text-secondary);">כל אזור מושווה מול שאר האזורים (ממוצע לסניף, מנורמל למספר הסניפים באזור). אין כאן פירוט ברמת סניף בודד.</div>
      </div>
      ${promoNationalSummaryTableHtml(report)}
      ${promoNationalSectionHtml('בדיקת חריגה — אפס מימושים מול פעילות רשתית', 'anomaly', report.anomaly, 'אין ממצאי חריגת אפס כרגע.', 5)}
      ${promoNationalSectionHtml('בירור פער — מתחת לחציון', 'gap', report.gap, 'אין ממצאי פער כרגע.', 5)}
      ${promoNationalSectionHtml('לשמר חוזקה — מעל החציון', 'strength', report.strength, 'אין ממצאי חוזקה כרגע.', 5)}
    `;
  }
  const areaMode = isAreaViewer();
  let report, scopeLabel;
  if(areaMode){
    const areaBranches = BRANCH_DIRECTORY.filter(b=>b.area===session.areaLabel).map(b=>b.name);
    report = buildPromoAreaReport(areaBranches);
    scopeLabel = `אזור ${session.areaLabel} (${areaBranches.length} סניפים)`;
  } else if(session.role==='branch' && session.branchInfo){
    report = buildPromoBranchReport(session.branchInfo.name);
    scopeLabel = session.branchInfo.name;
  } else {
    return '';
  }
  return `
    <div class="card" style="margin-bottom:16px;">
      <div style="font-weight:500;font-size:15px;margin-bottom:4px;">ניתוח מכר מבצעים — ${scopeLabel}</div>
      <div style="font-size:12.5px;color:var(--text-secondary);">השוואה מול חציון ${areaMode?'הרשת (למעט סניפי האזור)':'שאר הסניפים'}. לרוב המבצעים אין רשימת השתתפות רשמית — הזכאות בפועל לא אומתה.</div>
    </div>
    ${promoAnalysisSectionHtml('בדיקת חריגה — אפס מימושים מול פעילות רשתית', 'anomaly', report.anomaly, areaMode, 'אין ממצאי חריגת אפס כרגע.')}
    ${promoAnalysisSectionHtml('בירור פער — מתחת לחציון', 'gap', report.gap, areaMode, 'אין ממצאי פער כרגע.')}
    ${promoAnalysisSectionHtml('לשמר חוזקה — מעל החציון', 'strength', report.strength, areaMode, 'אין ממצאי חוזקה כרגע.')}
    ${report.scopedOut.length ? `
      <div style="margin-top:6px;">
        <h3 style="font-size:13px;color:var(--text-secondary);margin:0 0 8px;">ממצאים שהוצאו מהניתוח</h3>
        <div class="card">
          ${report.scopedOut.map(s=>`<div class="admin-row"><div class="admin-row-main"><div class="t" style="font-size:13px;">${s.title||''} <span style="font-family:monospace;font-size:11px;color:var(--muted);">#${s.code}</span></div><div class="m">${s.reason}</div></div></div>`).join('')}
        </div>
      </div>
    ` : ''}
  `;
}

function cellFillHex(sheet, ri, ci){
  if(!sheet || typeof XLSX==='undefined') return null;
  try{
    const addr = XLSX.utils.encode_cell({r:ri, c:ci});
    const cell = sheet[addr];
    if(cell && cell.s && cell.s.fgColor && cell.s.fgColor.rgb && cell.s.patternType==='solid'){
      return '#' + cell.s.fgColor.rgb.slice(-6).toUpperCase();
    }
  }catch(e){}
  return null;
}
function contrastTextColor(hex){
  const h = (hex||'').replace('#','');
  if(h.length<6) return '#1a1a1a';
  const r = parseInt(h.substr(0,2),16)/255, g = parseInt(h.substr(2,2),16)/255, b = parseInt(h.substr(4,2),16)/255;
  const lin = c => c<=0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055,2.4);
  const L = 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b);
  return L > 0.45 ? '#1a1a1a' : '#ffffff';
}
function managerChip(comp, name){
  if(!name) return '';
  const hex = comp && comp.managerColors ? comp.managerColors[name] : null;
  if(!hex) return `<span class="mgr-chip mgr-chip-plain">${name}</span>`;
  const textColor = contrastTextColor(hex);
  return `<span class="mgr-chip" style="background:${hex};color:${textColor};border-color:${textColor==='#ffffff'?'rgba(255,255,255,0.35)':'rgba(0,0,0,0.15)'};">${name}</span>`;
}
/* קורא את טבלת האקסל הגולמית (ערכים + צבעי רקע כפי שהם בקובץ) כדי להציג אותה
   בדיוק כמו שמחלקת השיווק רגילה לשלוח במייל היומי — בלי לפרש/לעצב מחדש.
   טווח העמודות: מעמודה A (רצועת צבע הקבוצה) ועד עמודת מנהל אזור, לפי כל הכותרות שנמצאו. */
function extractRawSalesTable(rows, sheet, headers){
  if(!headers || !headers.length) return null;
  const h0 = headers[0];
  const colTypes = {};
  colTypes[h0.targetCol] = 'int';
  colTypes[h0.salesCol] = 'money';
  colTypes[h0.pctCol] = 'pct';
  const colStart = 0;
  const colEnd = Math.max(...headers.map(h=>h.managerCol));
  const rowStart = h0.rowIndex;
  let rowEnd = rows.length - 1;
  while(rowEnd > rowStart){
    const row = rows[rowEnd];
    const hasVal = row && row.slice(colStart, colEnd+1).some(v=>v!==null && v!==undefined && v!=='');
    if(hasVal) break;
    rowEnd--;
  }
  const tableRows = [];
  for(let ri=rowStart; ri<=rowEnd; ri++){
    const row = rows[ri] || [];
    const mgrCellVal = (row[h0.managerCol]||'').toString().trim();
    const cells = [];
    for(let ci=colStart; ci<=colEnd; ci++){
      if(ci===h0.managerCol && isExcludedManagerName(mgrCellVal)){
        cells.push({text:'', bg:null}); /* מנהל האזור הוסר — הסניף עצמו נשאר, ללא שיוך */
        continue;
      }
      const raw = row[ci];
      const text = formatSheetCellValue(raw, colTypes[ci]);
      cells.push({text, bg: cellFillHex(sheet, ri, ci)});
    }
    tableRows.push({cells});
  }
  return tableRows;
}
function parseCompetitionSheet(rows, sheet){
  const HEADER_NAME = 'שם חנות';
  const groupLabelRe = /^קבוצה\s*(\d+)/;
  const rankRe = /^מקום\s+(\S+)\s*[:：]?\s*(.*)$/;
  const headers = [];
  rows.forEach((row,ri)=>{
    if(!row) return;
    for(let ci=0; ci<row.length; ci++){
      if((row[ci]||'').toString().trim() === HEADER_NAME){
        headers.push({rowIndex:ri, nameCol:ci, targetCol:ci+1, salesCol:ci+2, pctCol:ci+3, managerCol:ci+4});
      }
    }
  });
  console.log('[parseCompetitionSheet] headers found:', headers.length, headers);
  if(!headers.length){
    console.warn('[parseCompetitionSheet] לא נמצאה אף כותרת "שם חנות" בקובץ — בודקים דגימת תאים מהשורות הראשונות:',
      rows.slice(0,5).map(r=>r ? r.slice(0,6) : r));
    return null;
  }

  const prizeSectionEnd = headers[0].rowIndex;
  const prizesByNum = {};
  const groupColorsByNum = {};
  for(let ri=0; ri<prizeSectionEnd; ri++){
    const row = rows[ri]; if(!row) continue;
    for(let ci=0; ci<row.length; ci++){
      const v = (row[ci]||'').toString().trim();
      const m = v.match(groupLabelRe);
      if(!m) continue;
      const num = parseInt(m[1],10);
      const colorHex = cellFillHex(sheet, ri, ci);
      if(colorHex) groupColorsByNum[num] = colorHex;
      const list = [];
      let rr = ri+1;
      while(rr < prizeSectionEnd){
        const nextRow = rows[rr];
        const cellVal = nextRow ? (nextRow[ci]||'').toString().trim() : '';
        if(!cellVal || groupLabelRe.test(cellVal)) break;
        const rm = cellVal.match(rankRe);
        if(rm){
          list.push({rank: HEB_ORDINAL_RANK[rm[1]] || (list.length+1), label:'מקום '+rm[1], text: rm[2].trim()});
        } else {
          list.push({rank:list.length+1, label:'', text:cellVal});
        }
        rr++;
      }
      prizesByNum[num] = list;
    }
  }


  const groups = [];
  const managerColors = {};
  headers.forEach((h,hi)=>{
    const endRow = hi+1 < headers.length ? headers[hi+1].rowIndex : rows.length;
    const branches = [];
    let groupNum = null;
    let target = null;
    for(let ri=h.rowIndex+1; ri<endRow; ri++){
      const row = rows[ri]; if(!row) continue;
      for(let ci=0; ci<h.nameCol; ci++){
        const v = (row[ci]||'').toString().trim();
        const m = v.match(groupLabelRe);
        if(m) groupNum = parseInt(m[1],10);
      }
      const rawName = (row[h.nameCol]||'').toString().trim();
      if(!rawName || /סה[״"]?כ/.test(rawName)) continue;
      const t = row[h.targetCol], s = row[h.salesCol], mgr = row[h.managerCol];
      let mgrName = (mgr||'').toString().trim();
      const isExcludedMgr = isExcludedManagerName(mgrName);
      if(isExcludedMgr){
        console.log('[parseCompetitionSheet] נמצא מנהל מוחרג בשורה', ri, '— מקורי:', JSON.stringify(mgrName), '← מנוקה');
        mgrName = ''; /* הסניף עצמו נשאר, ללא שיוך למנהל אזור */
      }
      if(target===null && typeof t === 'number') target = t;
      const rowCells = {
        name: {text: rawName, bg: cellFillHex(sheet, ri, h.nameCol)},
        target: {text: formatSheetCellValue(t, 'int'), bg: cellFillHex(sheet, ri, h.targetCol)},
        sales: {text: formatSheetCellValue(s, 'money'), bg: cellFillHex(sheet, ri, h.salesCol)},
        pct: {text: formatSheetCellValue(row[h.pctCol], 'pct'), bg: cellFillHex(sheet, ri, h.pctCol)},
        manager: isExcludedMgr ? {text:'', bg:null} : {text: mgrName, bg: cellFillHex(sheet, ri, h.managerCol)}
      };
      branches.push({
        rawName,
        name: normalizeBranchName(rawName),
        target: (typeof t === 'number') ? t : (target||0),
        sales: (typeof s === 'number') ? s : 0,
        areaManager: mgrName,
        rowCells
      });
      if(mgrName && !managerColors[mgrName]){
        const hex = cellFillHex(sheet, ri, h.managerCol);
        if(hex) managerColors[mgrName] = hex;
      }
    }
    if(!branches.length) return;
    if(groupNum===null) groupNum = hi+1;
    groups.push({groupNum, name:'קבוצה '+groupNum, target: target||0, colorHex: groupColorsByNum[groupNum]||null, prizes: prizesByNum[groupNum]||[], branches});
  });
  groups.sort((a,b)=>a.groupNum-b.groupNum);
  if(!groups.length){
    console.warn('[parseCompetitionSheet] נמצאו כותרות אך אף קבוצה/סניף לא חולץ מהן.');
    return null;
  }
  groups.managerColors = managerColors;
  groups.rawTable = extractRawSalesTable(rows, sheet, headers);
  const h0 = headers[0];
  groups.headerRowCells = [h0.nameCol, h0.targetCol, h0.salesCol, h0.pctCol, h0.managerCol].map(ci => ({
    text: (rows[h0.rowIndex][ci]||'').toString().trim(),
    bg: cellFillHex(sheet, h0.rowIndex, ci)
  }));
  console.log('[parseCompetitionSheet] הצלחה — קבוצות:', groups.length, 'שורות rawTable:', groups.rawTable ? groups.rawTable.length : null);
  const allManagerNames = new Set();
  let totalBranches = 0, has47 = false;
  groups.forEach(g=>g.branches.forEach(b=>{
    totalBranches++;
    allManagerNames.add(JSON.stringify(b.areaManager));
    if(b.rawName && b.rawName.indexOf('47')===0) has47 = true;
  }));
  console.log('[parseCompetitionSheet] סה"כ סניפים:', totalBranches, '| שמות מנהלי אזור שנמצאו:', [...allManagerNames], '| סניף 47 נמצא:', has47);
  return groups;
}
function matchBranchInCompetition(comp, directoryEntry){
  if(!comp.groups || !comp.groups.length || !directoryEntry) return null;
  const target = normalizeBranchName(directoryEntry.name);
  // Exact normalized-name identity always wins outright — name is the authoritative
  // key, so an exact match short-circuits before the area-code signal (a secondary,
  // sometimes-stale disambiguator) can override it.
  for(const g of comp.groups){
    for(const b of g.branches){ if(b.name === target) return {group:g, branch:b}; }
  }
  let best=null, bestScore=Infinity;
  for(const g of comp.groups){
    for(const b of g.branches){
      let score = branchMatchScore(target, b.name);
      if(directoryEntry.area && b.areaManager){
        score += (b.areaManager.indexOf(directoryEntry.area)===0) ? -0.5 : 2.0;
      }
      if(score < bestScore){ bestScore = score; best = {group:g, branch:b}; }
    }
  }
  return (best && bestScore < 3.2) ? best : null;
}

/* ---- Excel attach + logo attach, both live inside the single add/edit competition form ---- */
let pendingImportGroups = null;
let pendingImportManagerColors = null;
let pendingImportRawTable = null;
let pendingImportHeaderRowCells = null;
let pendingLogoDataUrl = undefined; // undefined = untouched this session, null = explicitly removed, string = new logo
let pendingHeroDesktopUrl = undefined; // undefined = untouched, null = explicitly removed, string = new Cloudinary URL
let pendingHeroMobileUrl = undefined;
let formCurrentLogo = null; // logo currently on the item being edited (or null for a new item)
let pendingMaterialFile = null; // {url, type, size} set after a successful Cloudinary upload this form session
let pendingMaterialThumbUrl = undefined; // undefined = untouched this session, null = removed, string = new Cloudinary URL
let pendingInstructionImageUrl = undefined; // undefined = untouched this session, null = explicitly removed, string = new Cloudinary URL
function triggerCompetitionImport(){
  // Quick shortcut: opens the same unified form and immediately prompts for the Excel file.
  openForm('competitions');
  setTimeout(()=>{ const el = document.getElementById('f-excel-input'); if(el) el.click(); }, 50);
}
function detectDateRangeFromRows(rows){
  // Best-effort: looks for exactly two DD.MM.YYYY-style dates in the top of the sheet
  // (e.g. a "תוקף המבצע" cell or a header like "23.08.2026 - 02.10.2026"). If it finds
  // anything other than exactly two, it stays silent rather than risk guessing wrong —
  // the marketing user can always type the dates in manually.
  const dateRe = /\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/g;
  const found = [];
  const limit = Math.min(rows.length, 15);
  for(let ri=0; ri<limit; ri++){
    const row = rows[ri]; if(!row) continue;
    for(let ci=0; ci<row.length; ci++){
      const v = (row[ci]||'').toString();
      let m;
      dateRe.lastIndex = 0;
      while((m = dateRe.exec(v))){
        const str = `${m[1].padStart(2,'0')}.${m[2].padStart(2,'0')}.${m[3]}`;
        if(!found.includes(str)) found.push(str);
      }
    }
  }
  if(found.length !== 2) return null;
  const [a,b] = found;
  return parseHebDate(a) <= parseHebDate(b) ? {start:a, end:b} : {start:b, end:a};
}
function handleFormExcelFile(evt){
  const file = evt.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(e){
    try{
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, {type:'array', cellStyles:true});
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, {header:1, raw:true, defval:null});
      const groups = parseCompetitionSheet(rows, sheet);
      if(!groups){
        toast('לא הצלחתי לזהות מבנה תחרות בקובץ. ודאו שקיימות עמודות שם חנות / יעד / מכירות / אחוז מהיעד / מנהל אזור.');
        evt.target.value = '';
        return;
      }
      pendingImportGroups = groups;
      pendingImportManagerColors = groups.managerColors || {};
      pendingImportRawTable = groups.rawTable || null;
      pendingImportHeaderRowCells = groups.headerRowCells || null;
      const totalBranches = groups.reduce((s,g)=>s+g.branches.length,0);
      const missingPrizes = groups.filter(g=>!g.prizes.length).length;
      const statusEl = document.getElementById('f-excel-status');
      if(statusEl){
        statusEl.innerHTML = `✅ זוהו ${groups.length} קבוצות ו-${totalBranches} סניפים מהקובץ (יוחלו בעת השמירה)${missingPrizes ? ` · לא זוהו פרסים עבור ${missingPrizes} קבוצות` : ''}`;
      }
      const titleGuess = ((rows[0]||[]).find(v=>v)||'').toString().replace(/['"\\]/g,'').trim();
      const titleEl = document.getElementById('f-title');
      if(titleEl && !titleEl.value && titleGuess) titleEl.value = titleGuess;
      const catEl = document.getElementById('f-category');
      if(catEl && !catEl.value) catEl.value = 'מכירות';
      const dateRange = detectDateRangeFromRows(rows);
      if(dateRange){
        const startEl = document.getElementById('f-start');
        const endEl = document.getElementById('f-end');
        if(startEl && !startEl.value) startEl.value = dateRange.start;
        if(endEl && !endEl.value) endEl.value = dateRange.end;
        toast(`זוהה גם טווח תאריכים בקובץ: ${dateRange.start} – ${dateRange.end}`);
      }
    }catch(err){
      console.error(err);
      toast('שגיאה בקריאת קובץ האקסל.');
    }
  };
  reader.readAsArrayBuffer(file);
  evt.target.value = '';
}
function logoPreviewBoxHtml(src){
  return src ? `<img src="${src}" alt="לוגו">` : '<span class="logo-preview-empty">אין לוגו</span>';
}
function logoRemoveHtml(src){
  return src ? `<button type="button" class="link-btn" onclick="clearLogoField()">🗑 הסרת לוגו</button>` : '';
}
function renderLogoPreview(){
  const src = pendingLogoDataUrl!==undefined ? pendingLogoDataUrl : formCurrentLogo;
  const box = document.getElementById('f-logo-preview');
  const rm = document.getElementById('f-logo-remove-wrap');
  if(box) box.innerHTML = logoPreviewBoxHtml(src);
  if(rm) rm.innerHTML = logoRemoveHtml(src);
}
function handleLogoFileChange(evt){
  const file = evt.target.files[0];
  if(!file) return;
  if(!file.type || file.type.indexOf('image/')!==0){ toast('נא לבחור קובץ תמונה (PNG / JPG / SVG)'); evt.target.value=''; return; }
  const reader = new FileReader();
  reader.onload = function(e){
    const img = new Image();
    img.onload = function(){
      // Downscale on a canvas so a large phone photo doesn't bloat the in-memory app state.
      const maxW = 480;
      const scale = Math.min(1, maxW/(img.width||maxW));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round((img.width||maxW)*scale));
      canvas.height = Math.max(1, Math.round((img.height||maxW)*scale));
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      pendingLogoDataUrl = canvas.toDataURL('image/png');
      renderLogoPreview();
    };
    img.onerror = function(){ toast('לא ניתן היה לקרוא את קובץ התמונה'); };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
  evt.target.value = '';
}
function clearLogoField(){
  pendingLogoDataUrl = null;
  renderLogoPreview();
}
function handleHeroFileChange(evt, which){
  const file = evt.target.files[0];
  if(!file) return;
  const statusEl = document.getElementById(`f-hero-${which}-status`);
  if(statusEl) statusEl.textContent = '⏳ מעלה את התמונה...';
  uploadFileToCloudinary(file).then(function(result){
    if(which==='desktop') pendingHeroDesktopUrl = result.secure_url;
    else pendingHeroMobileUrl = result.secure_url;
    if(statusEl) statusEl.innerHTML = '✅ הועלה בהצלחה';
  }).catch(function(err){
    console.error(err);
    if(statusEl) statusEl.textContent = '❌ ההעלאה נכשלה: ' + err.message;
    toast('שגיאה בהעלאת התמונה');
  });
  evt.target.value = '';
}
function handleInstructionImageFileChange(evt){
  const file = evt.target.files[0];
  if(!file) return;
  if(!file.type || file.type.indexOf('image/')!==0){ toast('נא לבחור קובץ תמונה (PNG / JPG)'); evt.target.value=''; return; }
  const statusEl = document.getElementById('f-instr-image-status');
  if(statusEl) statusEl.textContent = '⏳ מעלה את התמונה...';
  uploadFileToCloudinary(file).then(function(result){
    pendingInstructionImageUrl = result.secure_url;
    if(statusEl) statusEl.innerHTML = '✅ הועלה בהצלחה';
    renderInstructionImagePreview();
  }).catch(function(err){
    console.error(err);
    if(statusEl) statusEl.textContent = '❌ ההעלאה נכשלה: ' + err.message;
    toast('שגיאה בהעלאת התמונה');
  });
  evt.target.value = '';
}
function clearInstructionImage(){
  pendingInstructionImageUrl = null;
  renderInstructionImagePreview();
}
function renderInstructionImagePreview(){
  const wrap = document.getElementById('f-instr-image-preview-wrap');
  if(!wrap) return;
  const item = formState.editId ? appData.instructions.find(x=>x.id==formState.editId) : null;
  const src = pendingInstructionImageUrl!==undefined ? pendingInstructionImageUrl : (item ? item.imageUrl : null);
  const statusEl = document.getElementById('f-instr-image-status');
  if(src){
    wrap.innerHTML = `<div style="display:flex;align-items:center;gap:10px;margin-top:8px;">
      <img src="${src}" alt="תמונה להמחשה" style="width:100px;height:70px;object-fit:cover;border-radius:8px;border:1px solid var(--gridline);">
      <button type="button" class="link-btn" onclick="clearInstructionImage()">🗑 הסרת תמונה</button>
    </div>`;
  } else {
    wrap.innerHTML = '';
  }
  if(statusEl && src===null) statusEl.textContent = '';
}
function handleMaterialFileChange(evt){
  const file = evt.target.files[0];

  if(!file) return;
  const statusEl = document.getElementById('f-material-file-status');
  if(statusEl) statusEl.textContent = '⏳ מעלה את הקובץ...';
  uploadFileToCloudinary(file).then(function(result){
    const ext = (file.name.split('.').pop() || '').toUpperCase();
    pendingMaterialFile = {
      url: result.secure_url,
      type: ext || 'קובץ',
      size: formatFileSize(file.size)
    };
    if(statusEl) statusEl.innerHTML = `✅ הועלה בהצלחה: ${ext} · ${formatFileSize(file.size)}`;
    const nameEl = document.getElementById('f-name');
    if(nameEl && !nameEl.value) nameEl.value = file.name.replace(/\.[^.]+$/, '');
  }).catch(function(err){
    console.error(err);
    if(statusEl) statusEl.textContent = '❌ ההעלאה נכשלה: ' + err.message;
    toast('שגיאה בהעלאת הקובץ');
  });
}
function handleMaterialThumbChange(evt){
  const file = evt.target.files[0];
  if(!file) return;
  if(!file.type || file.type.indexOf('image/')!==0){ toast('נא לבחור קובץ תמונה (PNG / JPG)'); evt.target.value=''; return; }
  const statusEl = document.getElementById('f-material-thumb-status');
  if(statusEl) statusEl.textContent = '⏳ מעלה את התמונה...';
  uploadFileToCloudinary(file).then(function(result){
    pendingMaterialThumbUrl = result.secure_url;
    if(statusEl) statusEl.innerHTML = '✅ הועלה בהצלחה';
  }).catch(function(err){
    console.error(err);
    if(statusEl) statusEl.textContent = '❌ ההעלאה נכשלה: ' + err.message;
    toast('שגיאה בהעלאת התמונה');
  });
}
function handleMaterialFolderUpload(evt){
  const files = [...evt.target.files];
  if(!files.length) return;
  const detectedName = (files[0].webkitRelativePath || '').split('/')[0] || 'תיקייה מיובאת';
  const folderName = (prompt('שם קטגוריה לקבצים מהתיקייה (אפשר לשנות מהשם המקורי):', detectedName) || '').trim() || detectedName;
  toast(`מעלה ${files.length} קבצים מתוך "${folderName}"...`);
  let done = 0, failed = 0;
  const uploadOne = (file) => uploadFileToCloudinary(file).then(function(result){
    const ext = (file.name.split('.').pop() || '').toUpperCase();
    const obj = {
      name: file.name.replace(/\.[^.]+$/, ''),
      category: folderName,
      type: ext || 'קובץ',
      size: formatFileSize(file.size),
      fileUrl: result.secure_url,
      date: todayHeb(),
      time: new Date().toLocaleTimeString('he-IL', {hour:'2-digit', minute:'2-digit'}),
      unread: true,
      tags: [],
      thumbUrl: null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if(firebaseReady){
      return db.collection('materials').add(obj);
    } else {
      obj.id = nextIds.materials++;
      appData.materials.push(obj);
      return Promise.resolve();
    }
  }).then(()=>{ done++; }).catch(err=>{ console.error('folder upload item failed:', file.name, err); failed++; });

  Promise.all(files.map(uploadOne)).then(()=>{
    renderContent();
    toast(`הועלו ${done} מתוך ${files.length} קבצים מתוך "${folderName}"` + (failed ? ` (${failed} נכשלו)` : ''));
  });
  evt.target.value = '';
}
/* בחירת קבצים ספציפיים (לא תיקייה שלמה) — משתמשת בחלון בחירת קבצים רגיל של
   הדפדפן/המערכת, שמאפשר לראות ולסמן קבצים בודדים (עם Ctrl/Shift), בשונה
   מבחירת תיקייה (webkitdirectory) שמכריחה להעלות הכל-או-כלום ואינה מציגה
   קבצים בכלל בתוך חלון הבחירה. מכיוון שאין כאן שם תיקייה לשאוב ממנו קטגוריה
   אוטומטית, מבקשים אותה פעם אחת מהמשתמש. */
function handleMaterialFilesUpload(evt){
  const files = [...evt.target.files];
  if(!files.length) return;
  const category = (prompt('שם קטגוריה לקבצים שנבחרו:', '') || '').trim() || 'ללא קטגוריה';
  toast(`מעלה ${files.length} קבצים נבחרים...`);
  let done = 0, failed = 0;
  const uploadOne = (file) => uploadFileToCloudinary(file).then(function(result){
    const ext = (file.name.split('.').pop() || '').toUpperCase();
    const obj = {
      name: file.name.replace(/\.[^.]+$/, ''),
      category,
      type: ext || 'קובץ',
      size: formatFileSize(file.size),
      fileUrl: result.secure_url,
      date: todayHeb(),
      time: new Date().toLocaleTimeString('he-IL', {hour:'2-digit', minute:'2-digit'}),
      unread: true,
      tags: [],
      thumbUrl: null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if(firebaseReady){
      return db.collection('materials').add(obj);
    } else {
      obj.id = nextIds.materials++;
      appData.materials.push(obj);
      return Promise.resolve();
    }
  }).then(()=>{ done++; }).catch(err=>{ console.error('file upload item failed:', file.name, err); failed++; });

  Promise.all(files.map(uploadOne)).then(()=>{
    renderContent();
    toast(`הועלו ${done} מתוך ${files.length} קבצים` + (failed ? ` (${failed} נכשלו)` : ''));
  });
  evt.target.value = '';
}
function addCustomMaterialTag(){
  const input = document.getElementById('f-material-new-tag');
  const label = input.value.trim();
  if(!label) return;
  const id = 'custom_' + label.replace(/\s+/g,'_').replace(/[^\wא-ת_]/g,'');
  if(allMaterialTags().some(t=>t.id===id)){ toast('התגית כבר קיימת'); input.value=''; return; }
  const CUSTOM_TAG_COLORS = ['#0ea5e9','#8b5cf6','#f59e0b','#10b981','#ec4899','#6366f1'];
  const color = CUSTOM_TAG_COLORS[Math.floor(Math.random()*CUSTOM_TAG_COLORS.length)];
  const tagObj = {id, label, color, icon:'🏷'};
  appData.materialTags.push(tagObj);
  if(firebaseReady){
    db.collection('materialTags').doc(id).set(tagObj).catch(err=>toast('שגיאה בשמירת התגית: '+err.message));
  }
  const list = document.getElementById('f-material-tags-list');
  if(list){
    const label2 = document.createElement('label');
    label2.style.cssText = 'display:flex;align-items:center;gap:5px;font-weight:400;font-size:13px;background:#f2f3f5;border-radius:99px;padding:5px 10px;';
    label2.innerHTML = `<input type="checkbox" class="f-material-tag-cb" value="${id}" checked> 🏷 ${label}`;
    list.appendChild(label2);
  }
  input.value = '';
  toast('התגית נוספה');
}

/* ---- Daily sales report import (updates an existing competition's sales figures) ----
   Flexible parser: finds a header row containing a branch-name column (שם חנות/סניף)
   and a sales column (מכירות/סכום/סה"כ) on the same row, then reads cumulative sales
   per branch below it. Matching prefers the branch's store code (most reliable), then
   exact normalized name, then fuzzy fallback — reusing the same matching machinery
   already validated for competition-group imports. */
function parseDailyReportSheet(rows){
  const nameRe = /^(שם חנות|שם סניף|סניף)$/;
  const salesRe = /(מכירות|סכום|סה[״"]?כ)/;
  let headerRow=-1, nameCol=-1, salesCol=-1;
  for(let ri=0; ri<rows.length && headerRow<0; ri++){
    const row = rows[ri]; if(!row) continue;
    for(let ci=0; ci<row.length; ci++){
      const v = (row[ci]||'').toString().trim();
      if(!nameRe.test(v)) continue;
      for(let cj=0; cj<row.length; cj++){
        if(cj===ci) continue;
        const v2 = (row[cj]||'').toString().trim();
        if(salesRe.test(v2)){ headerRow=ri; nameCol=ci; salesCol=cj; break; }
      }
      if(headerRow>=0) break;
    }
  }
  if(headerRow<0) return null;
  const items = [];
  for(let ri=headerRow+1; ri<rows.length; ri++){
    const row = rows[ri]; if(!row) continue;
    const rawName = (row[nameCol]||'').toString().trim();
    if(!rawName || /סה[״"]?כ/.test(rawName)) continue;
    const salesVal = row[salesCol];
    if(typeof salesVal !== 'number') continue;
    const codeMatch = rawName.match(/^0*(\d+)/);
    items.push({ rawName, storeCode: codeMatch ? codeMatch[1] : null, name: normalizeBranchName(rawName), sales: salesVal });
  }
  return items.length ? items : null;
}
function matchDailyReportItem(comp, item){
  if(item.storeCode){
    for(const g of comp.groups){
      for(const b of g.branches){
        const bCode = b.rawName.match(/^0*(\d+)/);
        if(bCode && bCode[1]===item.storeCode) return {group:g, branch:b};
      }
    }
  }
  for(const g of comp.groups){
    for(const b of g.branches){ if(b.name===item.name) return {group:g, branch:b}; }
  }
  let best=null, bestScore=Infinity;
  for(const g of comp.groups){
    for(const b of g.branches){
      const score = branchMatchScore(item.name, b.name);
      if(score < bestScore){ bestScore=score; best={group:g, branch:b}; }
    }
  }
  return (best && bestScore < 2.0) ? best : null;
}
let dailyReportTargetCompId = null;
function triggerDailyReportImport(compId){
  dailyReportTargetCompId = compId;
  document.getElementById('daily-report-input').click();
}
function handleDailyReportFile(evt){
  const file = evt.target.files[0];
  if(!file) return;
  const compId = dailyReportTargetCompId;
  const reader = new FileReader();
  reader.onload = function(e){
    try{
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, {type:'array', cellStyles:true});
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, {header:1, raw:true, defval:null});
      const comp = appData.competitions.find(c=>c.id==compId);
      if(!comp){ toast('התחרות לא נמצאה.'); return; }

      /* אם הדוח היומי הוא בפועל אותו מבנה מלא (עם קבוצות/מנהלי אזור/צבעים) —
         מחליפים לגמרי את הקבוצות, צבעי המנהלים והטבלה הגולמית מהקובץ הטרי,
         ולא רק את מספרי המכירות. כך כל תיקון מבני (הסרת/שינוי מנהל אזור,
         סניף שחוזר וכו') נכנס לתוקף גם דרך העדכון היומי, לא רק דרך "עריכה מלאה". */
      const fullParse = parseCompetitionSheet(rows, sheet);
      let updated = 0, totalItems = 0, unmatched = [];

      if(fullParse){
        comp.groups = fullParse;
        comp.managerColors = fullParse.managerColors || {};
        comp.rawTable = fullParse.rawTable || null;
        comp.headerRowCells = fullParse.headerRowCells || null;
        updated = fullParse.reduce((s,g)=>s+g.branches.length,0);
        totalItems = updated;
        console.log('[עדכון יומי] זוהה מבנה מלא — הקבוצות, צבעי המנהלים והטבלה הגולמית רועננו במלואם.');
      } else {
        const items = parseDailyReportSheet(rows);
        if(!items){
          toast('לא הצלחתי לזהות בקובץ עמודות של שם סניף וסכום מכירות.');
          return;
        }
        totalItems = items.length;
        items.forEach(item=>{
          const m = matchDailyReportItem(comp, item);
          if(m){ m.branch.sales = item.sales; updated++; } else unmatched.push(item.rawName);
        });
      }

      comp.salesUpdatedAt = todayHeb() + ' ' + new Date().toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'});
      if(firebaseReady){
        db.collection('competitions').doc(comp.id).update({
          groups: comp.groups, managerColors: comp.managerColors || {}, rawTable: comp.rawTable || null,
          headerRowCells: comp.headerRowCells || null, salesUpdatedAt: comp.salesUpdatedAt
        })
          .then(()=>toast(`עודכנו ${updated} מתוך ${totalItems} סניפים בדוח.` + (unmatched.length ? ` (${unmatched.length} לא זוהו — ראו קונסול)` : '')))
          .catch(err=>toast('שגיאה בשמירת הדוח ל-Firestore: '+err.message));
      } else {
        renderContent();
        toast(`עודכנו ${updated} מתוך ${totalItems} סניפים בדוח.` + (unmatched.length ? ` (${unmatched.length} לא זוהו — ראו קונסול)` : ''));
      }
      if(unmatched.length) console.warn('שורות דוח יומי שלא זוהו:', unmatched);
    }catch(err){
      console.error(err);
      toast('שגיאה בקריאת קובץ הדוח.');
    }
  };
  reader.readAsArrayBuffer(file);
  evt.target.value = '';
}

/* מסמן קטע שלם (תחרויות/חומרים/אירועים) כ"נקרא" עבור הצופה הנוכחי בלבד —
   לא רץ עבור מחלקת השיווק. כל פריט "לא נקרא" מקבל רשומת קריאה אישית
   (ראו markItemRead/isItemRead), כך שזה משפיע רק על מי שבאמת צפה, לא על כל
   הסניפים/מנהלי האזור ברשת יחד. */
function markSectionRead(type){
  if(session.role==='marketing') return;
  const arr = appData[type];
  if(!arr || !arr.length) return;
  const toMark = arr.filter(x=>!isItemRead(type, x.id));
  if(!toMark.length) return;
  toMark.forEach(x=>markItemRead(type, x.id));
  renderNav();
}
function viewCompetitions(){
  markSectionRead('competitions');
  const order = {active:0, upcoming:1, ended:2};
  const list = [...appData.competitions].sort((a,b)=>order[a.status]-order[b.status]);
  return `
    <div class="page-head">
      <h1>תחרויות</h1>
      <p>${getText('competitions_desc')}</p>
    </div>
    ${list.length ? list.map(c=>compCard(c)).join('') : `
    <div class="card"><div class="empty-state">
      עדיין אין תחרויות פעילות.${session.role==='marketing' ? ' לחצו על "ניהול תוכן" כדי להוסיף תחרות ראשונה.' : ''}
    </div></div>`}
  `;
}
function formatCountdownParts(ms){
  if(ms<0) ms=0;
  const totalSec = Math.floor(ms/1000);
  const days = Math.floor(totalSec/86400);
  const hours = Math.floor((totalSec%86400)/3600);
  const mins = Math.floor((totalSec%3600)/60);
  const secs = totalSec%60;
  return {days,hours,mins,secs};
}
function countdownSegsHtml(p){
  // Visual order right-to-left (page is RTL): seconds, minutes, hours, days — days end up on the left.
  return `
        <span class="cd-seg"><b>${String(p.secs).padStart(2,'0')}</b><i>שנ'</i></span><span class="cd-sep">:</span>
        <span class="cd-seg"><b>${String(p.mins).padStart(2,'0')}</b><i>דק'</i></span><span class="cd-sep">:</span>
        <span class="cd-seg"><b>${String(p.hours).padStart(2,'0')}</b><i>שעות</i></span><span class="cd-sep">:</span>
        <span class="cd-seg"><b>${p.days}</b><i>ימים</i></span>`;
}
function countdownBlockHtml(id, cls, label, targetTs, now){
  const p = formatCountdownParts(targetTs-now);
  return `
    <div class="comp-countdown countdown-${cls}" data-countdown-target="${targetTs}" data-countdown-id="${id}">
      <span class="countdown-label">${label}</span>
      <span class="countdown-timer" id="${id}">${countdownSegsHtml(p)}</span>
    </div>`;
}
function compCountdownHtml(c){
  const now = Date.now();
  const startTs = parseHebDate(c.start);
  const endTs = parseHebDate(c.end) + 24*60*60*1000 - 1;
  if(now >= endTs){ return `<div class="comp-countdown countdown-ended">🏁 המבצע הסתיים</div>`; }
  if(now < startTs){
    return countdownBlockHtml(`cd-${c.id}`, 'upcoming', '⏳ המבצע יתחיל בעוד', startTs, now);
  }
  return countdownBlockHtml(`cd-${c.id}`, 'active', '⏳ נותרו להשלמת היעד', endTs, now);
}
function tickCountdowns(){
  document.querySelectorAll('.comp-countdown[data-countdown-target]').forEach(el=>{
    const targetTs = parseInt(el.getAttribute('data-countdown-target'),10);
    const cdId = el.getAttribute('data-countdown-id');
    const timerEl = document.getElementById(cdId);
    if(!timerEl) return;
    const remaining = targetTs - Date.now();
    if(remaining <= 0){
      el.outerHTML = cdId.indexOf('cd-end-')===0 ? '' : '<div class="comp-countdown countdown-ended">🏁 המבצע הסתיים</div>';
      return;
    }
    const p = formatCountdownParts(remaining);
    timerEl.innerHTML = countdownSegsHtml(p);
  });
}
