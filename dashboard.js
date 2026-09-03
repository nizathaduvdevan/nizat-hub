/* ---------- דף הבית הגלובלי (רב-מחלקתי) ---------- */
/* מוצג לסניפים/מנהלי אזור ברמה העליונה, לפני שנכנסים למחלקה ספציפית. פיד
   מאוחד מכל המחלקות (כרגע רק שיווק מפרסמת, אז זה כמעט זהה למה שהיה קודם —
   ההבדל היחיד הוא תגית המחלקה על כל פריט וכפתורי הכניסה למחלקות בניווט). */
function viewGlobalHome(){
  const feed = [
    ...appData.instructions.map(i=>({type:'instruction', date:i.date, title:i.title, id:i.id, unread:!isItemRead('instructions', i.id), department:itemDepartment(i)})),
    ...appData.competitions.map(c=>({type:'competition', date:c.start, title:c.title, id:c.id, department:itemDepartment(c)})),
    ...appData.events.filter(isEventVisibleToViewer).map(e=>({type:'event', date:e.date, title:e.title, id:e.id, department:itemDepartment(e)}))
  ].sort((a,b)=> parseHebDate(b.date)-parseHebDate(a.date)).slice(0,8);
  const greetName = session.role==='area' ? session.areaLabel
    : session.role==='marketing' ? marketingDisplayFor(currentUserEmail).name
    : (session.branchInfo && session.branchInfo.manager ? session.branchInfo.manager : session.branchName);
  return `
    <div class="page-head">
      <h1>שלום, ${greetName} 👋</h1>
      ${session.branchInfo ? `<p style="margin:-4px 0 8px;font-size:12.5px;color:var(--muted);">${session.branchName}</p>` : ''}
      <p>${session.role==='marketing' ? 'כך נראה כרגע כל מה שמפורסם לסניפים, מכל המחלקות' : 'עדכונים שוטפים מכל המחלקות'}</p>
    </div>
    ${isRealAreaManager() ? renderAreaManagerConversationsCard() : ''}
    ${session.role==='branch' ? renderBranchConversationsCard() : ''}
    <h3 style="font-size:15px;margin:8px 0 12px;">הכלים שלי</h3>
    ${renderMyCalendarCard()}
    <h3 style="font-size:15px;margin:8px 0 12px;">חדש עבורכם</h3>
    <div class="card" style="overflow:visible;">
      ${feed.length ? feed.map(f=>{
        const screenId = f.type==='instruction'?'instructions':f.type==='event'?'events':'competitions';
        return `
        <div class="dashboard-feed-item" onclick="goToDeptScreen('${f.department}','${screenId}')">
          <span class="df-icon">${f.type==='instruction'?'📋':f.type==='event'?'🗓':'🏆'}</span>
          <div class="df-main">
            <div class="df-title">${f.title}</div>
            <div class="df-meta">${f.type==='instruction'?'הוראה':f.type==='event'?'אירוע':'תחרות'} · ${f.date}</div>
          </div>
          <span class="badge cat" style="margin-inline-start:6px;flex:none;">${(DEPARTMENTS[f.department]||{}).short || 'שיווק'}</span>
          ${f.type==='instruction' ? `<span class="df-badge ${f.unread?'df-new':'df-read'}">${f.unread?'חדש':'נקרא'}</span>` : ''}
        </div>
      `;}).join('') : `<div class="empty-state">עדיין אין עדכונים. עדכונים חדשים מכל המחלקות יופיעו כאן.</div>`}
    </div>
  `;
}
/* מסך מחלקה שעדיין לא פרסמה שום תוכן — מוצג עד שהמחלקה מתחילה לפעול. */
function viewDepartmentEmpty(deptKey){
  const info = DEPARTMENTS[deptKey] || {label: deptKey};
  return `
    <div class="page-head">
      <h1>${info.label}</h1>
      <p>עדיין אין כאן תוכן</p>
    </div>
    <div class="card"><div class="empty-state">
      ${info.label} עדיין לא התחילה לפרסם כאן. עדכונים יופיעו במקום הזה ברגע שיהיו.
    </div></div>
  `;
}

/* ---------- Dashboard ---------- */
function viewDashboard(){
  const activeComps = appData.competitions.filter(c=>c.status==='active');
  const unreadInstr = appData.instructions.filter(i=>!isItemRead('instructions', i.id));
  const feed = [
    ...appData.instructions.map(i=>({type:'instruction', date:i.date, title:i.title, id:i.id, unread:!isItemRead('instructions', i.id)})),
    ...appData.competitions.map(c=>({type:'competition', date:c.start, title:c.title, id:c.id})),
    ...appData.events.filter(isEventVisibleToViewer).map(e=>({type:'event', date:e.date, title:e.title, id:e.id}))
  ].sort((a,b)=> parseHebDate(b.date)-parseHebDate(a.date)).slice(0,4);
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const todayMs = todayStart.getTime();
  const nextEvent = [...appData.events].filter(isEventVisibleToViewer).sort((a,b)=>parseHebDate(a.date)-parseHebDate(b.date)).find(e=>parseHebDate(e.date)>=todayMs);

  /* ---------- "דורש את הטיפול שלך" — task signals מנתונים אמיתיים בלבד ----------
     הוראות שלא נקראו: מעקב אישי לכל צופה (isItemRead/markItemRead).
     סטנדים/הודעות: אמיתיים ואישיים לסניף עצמו. */
  const isBranch = session.role==='branch' && !!session.branchInfo;
  let pendingStandsCount = 0;
  if(isBranch){
    appData.standCampaigns.forEach(camp=>{
      const b = camp.branches.find(x=>x.matchedBranchName===session.branchInfo.name);
      if(b && !getStandBranchStatus(camp,b).confirmed) pendingStandsCount++;
    });
  }
  const unreadMsgCount = isBranch
    ? appData.privateMessages.filter(m=>m.branchName===session.branchName && !m.deletedForBranch && m.unreadForBranch).length
    : 0;
  const pendingActionInstrs = isBranch
    ? appData.instructions.filter(i=>i.requiresAction && isInstructionTargetedAtBranch(i, session.branchInfo) && getInstructionStatusForBranch(i, session.branchInfo.email)!=='done')
    : [];
  const taskItems = [];
  if(unreadInstr.length) taskItems.push({icon:'📋', text:`${unreadInstr.length} הוראות שלא נקראו`, action:"instructions"});
  pendingActionInstrs.forEach(i=>{
    const overdue = getInstructionStatusForBranch(i, session.branchInfo.email)==='overdue';
    let text = overdue ? `${i.title} · באיחור (היה לביצוע עד ${i.dueDate})` : `${i.title} · לביצוע עד ${i.dueDate}`;
    if(i.requiresPhoto) text += ' · 📷 נדרש צילום';
    taskItems.push({icon: overdue?'🔴':'📌', text, action:"instructions"});
  });
  if(pendingStandsCount) taskItems.push({icon:'🪧', text:`${pendingStandsCount} סטנד${pendingStandsCount>1?'ים':''} ממתין${pendingStandsCount>1?'ים':''} לאישור`, action:"stands"});
  if(unreadMsgCount) taskItems.push({icon:'✉', text:`${unreadMsgCount} הודעות חדשות`, action:"messages"});
  const totalTasks = unreadInstr.length + pendingActionInstrs.length + pendingStandsCount + unreadMsgCount;

  const roleGreetingLine = session.role==='branch'
    ? 'הנה מה שדורש את תשומת הלב שלך היום'
    : (session.role==='area' ? 'הנה התמונה העדכנית באזור שלך' : 'הנה התמונה העדכנית ברשת');

  /* ---------- כרטיס תחרות ראשית — מנוגן אישי רק כשיש התאמת סניף אמיתית ---------- */
  let compSectionHtml = '';
  if(activeComps.length){
    const comp = activeComps[0];
    let personal = null;
    if(isBranch && comp.groups && comp.groups.length){
      const match = matchBranchInCompetition(comp, session.branchInfo);
      if(match){
        const groupBranches = match.group.branches.map(b=>{
          const pct = b.target>0 ? (b.sales/b.target)*100 : 0;
          return {rawName:b.rawName, sales:b.sales, target:b.target, pct};
        });
        groupBranches.sort((x,y)=> y.pct-x.pct || y.sales-x.sales);
        const myIdx = groupBranches.findIndex(x=>x.rawName===match.branch.rawName);
        const myPct = match.branch.target>0 ? Math.round((match.branch.sales/match.branch.target)*100) : 0;
        let gapText = null;
        if(myIdx>0){
          const above = groupBranches[myIdx-1];
          if(above.target===match.branch.target && above.target>0){
            const gap = above.sales - match.branch.sales;
            if(gap>0) gapText = `עוד ${fmtMoney(gap)} ₪ למקום ${myIdx}`;
          }
        }
        personal = {
          rank: myIdx>=0 ? myIdx+1 : null, total: groupBranches.length,
          groupName: match.group.name || null,
          sales: match.branch.sales, target: match.branch.target, pct: myPct, gapText
        };
      }
    }
    if(personal){
      compSectionHtml = `
      <div class="card dashboard-competition-card" onclick="goTo('competitions')">
        <div class="dc-top">
          <span class="badge active"><span class="dot"></span>פעיל</span>
          ${personal.rank ? `<span class="dc-rank">${personal.groupName ? `מקום ${personal.rank} בקבוצה ${personal.groupName}` : `מקום ${personal.rank}${personal.total?` מתוך ${personal.total}`:''}`}</span>` : ''}
        </div>
        <h3 class="dc-title">🏆 ${comp.title}</h3>
        <div class="dc-figures" dir="ltr">${fmtMoney(personal.sales)} ₪ <span class="dc-of">מתוך</span> ${fmtMoney(personal.target)} ₪</div>
        <div class="comp-progress-wrap">
          <div class="comp-progress-track"><div class="comp-progress-fill ${personal.pct>=100?'full':''}" style="width:${Math.min(100,personal.pct)}%"></div></div>
        </div>
        <div class="dc-bottom">
          <span class="dc-pct">${personal.pct}%</span>
          ${personal.gapText ? `<span class="dc-gap">${personal.gapText}</span>` : ''}
        </div>
        <button class="link-btn" onclick="event.stopPropagation();goTo('competitions')">לפרטי התחרות ←</button>
      </div>`;
    } else {
      compSectionHtml = `
      <div class="card comp-card" style="border-color:rgba(69,122,31,0.35); background:linear-gradient(180deg, rgba(69,122,31,0.05), var(--surface-1));cursor:pointer;" onclick="goTo('competitions')">
        <span class="badge active"><span class="dot"></span>תחרות פעילה מובילה</span>
        <h2 style="margin:10px 0 4px;font-size:18px;">${comp.title}</h2>
        <p class="comp-desc" style="margin-top:4px;">${comp.desc}</p>
        <button class="link-btn" onclick="event.stopPropagation();goTo('competitions')">לצפייה בכל התחרויות ←</button>
      </div>`;
    }
  }

  /* ---------- אירוע קרוב — קומפקטי, בלי שדה שעה (לא קיים במבנה הנתונים) ---------- */
  const DASH_WEEKDAYS = ['יום ראשון','יום שני','יום שלישי','יום רביעי','יום חמישי','יום שישי','יום שבת'];
  let eventSectionHtml = '';
  if(nextEvent){
    const evTs = parseHebDate(nextEvent.date);
    const weekday = isNaN(evTs) ? '' : DASH_WEEKDAYS[new Date(evTs).getDay()];
    eventSectionHtml = `
    <div class="dashboard-event-compact" onclick="goTo('events')">
      <div class="dec-main">
        <div class="dec-title">🗓 ${nextEvent.title}</div>
        <div class="dec-meta">${weekday ? weekday+' · ' : ''}<span dir="ltr">${nextEvent.date}</span></div>
      </div>
      <button class="link-btn" onclick="event.stopPropagation();goTo('events')">לכל האירועים ←</button>
    </div>`;
  }

  return `
    <div class="page-head">
      <h1>שלום, ${session.role==='area' ? session.areaLabel : (session.branchInfo && session.branchInfo.manager ? session.branchInfo.manager : (session.branchName || 'מחלקת שיווק'))} 👋</h1>
      ${session.branchInfo ? `<p style="margin:-4px 0 8px;font-size:12.5px;color:var(--muted);">${session.branchName}</p>` : ''}
      <p>${roleGreetingLine}</p>
    </div>

    <div class="card dashboard-task-card ${totalTasks>0 ? 'has-tasks' : 'all-clear'}">
      ${totalTasks>0 ? `
        <div class="dtc-head">
          <span class="dtc-dot"></span>
          <span class="dtc-title">${totalTasks===1?'דבר אחד דורש טיפול':`${totalTasks} דברים דורשים טיפול`}</span>
        </div>
        <div class="dtc-list">
          ${taskItems.map(t=>`
            <button type="button" class="dtc-item" onclick="goTo('${t.action}')">
              <span class="dtc-icon">${t.icon}</span><span class="dtc-text">${t.text}</span>
            </button>`).join('')}
        </div>
      ` : `
        <div class="dtc-head dtc-clear">
          <span class="dtc-title">הכל מעודכן ✓</span>
        </div>
        <div class="dtc-empty">אין כרגע משימות שממתינות לטיפול.</div>
      `}
    </div>

    <div class="dashboard-actions-grid">
      <button class="dashboard-action-btn" onclick="goTo('instructions')"><span class="da-icon">${icon('clipboard')}</span><span class="da-label">הוראות</span></button>
      <button class="dashboard-action-btn" onclick="goTo('materials')"><span class="da-icon">${icon('download')}</span><span class="da-label">חומרים</span></button>
      <button class="dashboard-action-btn" onclick="goTo('competitions')"><span class="da-icon">${icon('trophy')}</span><span class="da-label">תחרויות</span></button>
      <button class="dashboard-action-btn" onclick="goTo('messages')"><span class="da-icon">${icon('mail')}</span><span class="da-label">שיווק</span></button>
    </div>

    ${compSectionHtml}
    ${eventSectionHtml}

    <h3 style="font-size:15px;margin:26px 0 12px;">חדש מהשיווק</h3>
    <div class="card" style="overflow:visible;">
      ${feed.length ? feed.map(f=>`
        <div class="dashboard-feed-item" onclick="goTo('${f.type==='instruction'?'instructions':f.type==='event'?'events':'competitions'}')">
          <span class="df-icon">${f.type==='instruction'?'📋':f.type==='event'?'🗓':'🏆'}</span>
          <div class="df-main">
            <div class="df-title">${f.title}</div>
            <div class="df-meta">${f.type==='instruction'?'הוראה':f.type==='event'?'אירוע':'תחרות'} · ${f.date}</div>
          </div>
          ${f.type==='instruction' ? `<span class="df-badge ${f.unread?'df-new':'df-read'}">${f.unread?'חדש':'נקרא'}</span>` : ''}
        </div>
      `).join('') : `<div class="empty-state">
        עדיין אין עדכונים ברשת.${session.role==='marketing' ? ' התחילו בהוספת תוכן דרך "ניהול תוכן".' : ' עדכונים חדשים יופיעו כאן ברגע שמחלקת השיווק תפרסם אותם.'}
      </div>`}
    </div>
  `;
}
