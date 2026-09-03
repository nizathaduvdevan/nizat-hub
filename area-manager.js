/* ---------- Performance ---------- */
/* ---------- Area manager overview ("האזור שלי") ----------
   נבנה מנתוני התחרויות האמיתיים (appData.competitions) — אין צורך במאגר נפרד.
   כל סניף בתחרות כבר נושא שדה areaManager (שם מלא, למשל "שחר ירושלמי");
   אנו מקבצים לפי המילה הראשונה בשם (התואמת לשמות הקצרים ששולחים אליהם
   הזמנות ההתחברות — "שחר", "נתי" וכו'). */
function areaFirstName(full){
  return (full||'').trim().split(' ')[0] || 'לא ידוע';
}
function computeAreaStats(){
  const map = {};
  appData.competitions.forEach(c=>{
    (c.groups||[]).forEach(g=>{
      (g.branches||[]).forEach(b=>{
        const area = areaFirstName(b.areaManager);
        if(!map[area]) map[area] = {area, target:0, sales:0, branches:[]};
        map[area].target += (b.target||0);
        map[area].sales += (b.sales||0);
        map[area].branches.push({name:b.name, target:b.target||0, sales:b.sales||0, competitionTitle:c.title});
      });
    });
  });
  return Object.values(map);
}
function viewAreaOverview(){
  const stats = computeAreaStats();
  if(!stats.length){
    return `
      <div class="page-head">
        <h1>${session.areaName ? `האזור שלי · ${session.areaLabel}` : `${session.areaLabel} · תצוגה ארצית`}</h1>
        <p>נתוני ביצועים יופיעו כאן ברגע שתהיה תחרות פעילה עם יעדים לסניפים.</p>
      </div>
      <div class="card"><div class="empty-state">עדיין אין נתוני תחרויות להצגה.</div></div>
    `;
  }
  stats.forEach(s=>{ s.pct = s.target>0 ? Math.round(s.sales/s.target*100) : 0; });
  stats.sort((a,b)=>b.pct-a.pct);
  const myArea = session.areaName;
  const myStats = myArea ? stats.find(s=>s.area===myArea) : null;
  const maxPct = Math.max(...stats.map(s=>s.pct), 1);

  const summaryHtml = myStats ? `
    <div class="stat-row">
      <div class="stat-tile"><div class="label">יעד כולל לאזור שלי</div><div class="value" dir="ltr">${fmtMoney(myStats.target)} ₪</div><div class="delta flat">${myStats.branches.length} סניפים</div></div>
      <div class="stat-tile"><div class="label">מכירות בפועל</div><div class="value" dir="ltr">${fmtMoney(myStats.sales)} ₪</div><div class="delta flat">מצטבר בכל התחרויות הפעילות</div></div>
      <div class="stat-tile"><div class="label">אחוז מהיעד</div><div class="value">${myStats.pct}%</div><div class="delta ${myStats.pct>=100?'good':'flat'}">${myStats.pct>=100?'עברתם את היעד':'בדרך ליעד'}</div></div>
      <div class="stat-tile"><div class="label">דירוג מול שאר האזורים</div><div class="value">#${stats.findIndex(s=>s.area===myArea)+1}</div><div class="delta flat">מתוך ${stats.length} אזורים</div></div>
    </div>
  ` : '';

  const branchListHtml = myStats ? `
    <div class="page-head" style="margin-top:20px;"><h2 style="margin:0;font-size:16px;">הסניפים באזור שלי</h2></div>
    <div class="card">
      ${myStats.branches.map(b=>{
        const pct = b.target>0 ? Math.round(b.sales/b.target*100) : 0;
        return `<div class="admin-row"><div class="admin-row-main"><div class="t">${b.name}</div><div class="m">${b.competitionTitle} · יעד ${fmtMoney(b.target)} ₪ · מכירות ${fmtMoney(b.sales)} ₪</div></div><span class="badge ${pct>=100?'active':'cat'}">${pct}%</span></div>`;
      }).join('')}
    </div>
  ` : '';

  return `
    <div class="page-head">
      <h1>${myArea ? `האזור שלי · ${myArea}` : `${session.areaLabel} · תצוגה ארצית`}</h1>
      <p>${myArea ? 'הביצועים של האזור שלכם מול שאר האזורים ברשת.' : 'השוואת ביצועים בין כל אזורי הרשת.'}</p>
    </div>
    ${summaryHtml}
    ${branchListHtml}
    <div class="page-head" style="margin-top:20px;"><h2 style="margin:0;font-size:16px;">השוואה בין אזורים</h2></div>
    <div class="card" style="padding:6px 0;">
      ${stats.map((s,idx)=>`
        <div class="perf-row ${s.area===myArea?'perf-mine':''}">
          <div class="perf-rank">${idx+1}</div>
          <div class="perf-name">${s.area}${s.area===myArea?' (אתם)':''}</div>
          <div class="perf-bar-track"><div class="perf-bar-fill" style="width:${(s.pct/maxPct*100).toFixed(0)}%"></div></div>
          <div class="perf-val">${s.pct}%</div>
        </div>
      `).join('')}
    </div>
  `;
}

