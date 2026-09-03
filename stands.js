/* ---------- Stands ("סטנדים לאישור") ----------
   Marketing uploads an Excel where SOME branch-name cells are highlighted in color;
   per Inbar's workflow, each distinct color marks a different brand/stand campaign.
   We scan every sheet in the workbook, and for every colored cell whose text matches a
   real branch (via the same normalizeBranchName/branchMatchScore matching already used
   for competitions — this avoids needing to hand-detect header/manager rows: a manager's
   name simply won't match any branch and gets skipped), we record it. Cells are grouped
   by color for review; Inbar labels each color with a brand name and enters ONE takedown
   date for the whole upload (her choice — she uploads per removal-date wave). Two separate
   reminders (10 days before, and 1 day before) are then checked periodically. */
/* Some branches are referred to in marketing spreadsheets by a colloquial/street name
   that differs from their canonical name in BRANCH_DIRECTORY (e.g. the "תל אביב" branch,
   whose address is "אבן גבירול 58", is consistently referred to as "אבן גבירול" in stand
   tracking sheets — matching the naming convention used for its sibling Tel-Aviv branches,
   which ARE named after their street: בוגרשוב, דיזנגוף, פלורנטין, שינקין, שרונה, חשמונאים).
   Add entries here (normalized alias -> canonical branch name) as such cases surface,
   rather than doing broad address-based fuzzy matching, which would risk false matches on
   generic address words ("ביג", "מרכז", etc.) shared across many branches. */
const STAND_BRANCH_ALIASES = { 'אבן גבירול':'תל אביב' };
function matchDirectoryBranch(rawName){
  const target = normalizeBranchName(rawName);
  if(!target) return null;
  const aliasTarget = STAND_BRANCH_ALIASES[target];
  if(aliasTarget){
    const aliased = BRANCH_DIRECTORY.find(b=>normalizeBranchName(b.name)===normalizeBranchName(aliasTarget));
    if(aliased) return aliased;
  }
  for(const b of BRANCH_DIRECTORY){ if(normalizeBranchName(b.name)===target) return b; }
  let best=null, bestScore=Infinity;
  for(const b of BRANCH_DIRECTORY){
    const score = branchMatchScore(target, normalizeBranchName(b.name));
    if(score<bestScore){ bestScore=score; best=b; }
  }
  return (best && bestScore<3.2) ? best : null;
}
/* Campaign grouping key: sheet name + color (NOT color alone). Inspecting Inbar's real
   workbook showed only ~5 distinct highlight colors reused across 13 different product
   sheets (e.g. the same orange marks branches in both the "לבידו" sheet and the unrelated
   "אקוסאפ" sheet) — grouping by color alone would silently merge stands from different,
   unrelated products into one campaign. The sheet name (which IS the real product/period
   identifier, e.g. "סטנדים אקוסאפ 7-12.26") is a much safer grouping key; color within a
   sheet still splits into separate sub-groups, in case a sheet marks more than one wave. */
function cleanSheetLabel(sheetName){
  return (sheetName||'').toString().replace(/^\s*סטנדים\s*/,'').trim() || (sheetName||'').toString().trim();
}
function parseStandsWorkbook(wb){
  const matched = [];
  let unmatchedCount = 0;
  wb.SheetNames.forEach(sheetName=>{
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, {header:1, raw:true, defval:null});
    rows.forEach((row, ri)=>{
      if(!row) return;
      row.forEach((val, ci)=>{
        const text = (val||'').toString().trim();
        if(!text) return;
        const hex = cellFillHex(sheet, ri, ci);
        if(!hex || hex==='#FFFFFF') return;
        const m = matchDirectoryBranch(text);
        if(m) matched.push({colorHex:hex, rawName:text, matchedBranch:m, sheetName});
        else unmatchedCount++;
      });
    });
  });
  return {matched, unmatchedCount};
}
let pendingStandsGroups = null;
function triggerStandsImport(){ document.getElementById('stands-file-input').click(); }
function handleStandImageChange(evt, idx){
  const file = evt.target.files[0];
  if(!file) return;
  if(!file.type || file.type.indexOf('image/')!==0){ toast('נא לבחור קובץ תמונה (PNG / JPG)'); evt.target.value=''; return; }
  const statusEl = document.getElementById('stand-image-status-'+idx);
  if(statusEl) statusEl.textContent = '⏳ מעלה את התמונה...';
  uploadFileToCloudinary(file).then(function(result){
    if(pendingStandsGroups && pendingStandsGroups[idx]) pendingStandsGroups[idx].imageUrl = result.secure_url;
    if(statusEl) statusEl.innerHTML = '✅ הועלה בהצלחה';
  }).catch(function(err){
    console.error(err);
    if(statusEl) statusEl.textContent = '❌ ההעלאה נכשלה: ' + err.message;
    toast('שגיאה בהעלאת התמונה');
  });
}
function handleStandsFile(evt){
  const file = evt.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(e){
    try{
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, {type:'array', cellStyles:true});
      const {matched, unmatchedCount} = parseStandsWorkbook(wb);
      if(!matched.length){
        toast('לא זוהו תאים צבועים עם שמות סניפים מזוהים בקובץ.');
        return;
      }
      openStandsReview(matched, unmatchedCount);
    }catch(err){
      console.error(err);
      toast('שגיאה בקריאת קובץ הסטנדים.');
    }
  };
  reader.readAsArrayBuffer(file);
  evt.target.value = '';
}
function openStandsReview(matched, unmatchedCount){
  const groups = {};
  const order = [];
  matched.forEach(it=>{
    const key = it.sheetName + '||' + it.colorHex;
    if(!groups[key]){ groups[key] = { key, sheetName: it.sheetName, colorHex: it.colorHex, branchMap: new Map() }; order.push(key); }
    const g = groups[key];
    if(!g.branchMap.has(it.matchedBranch.name)) g.branchMap.set(it.matchedBranch.name, { matchedBranch: it.matchedBranch, sheets: new Set() });
    g.branchMap.get(it.matchedBranch.name).sheets.add(it.sheetName);
  });
  pendingStandsGroups = order.map(k=>groups[k]);
  // when a single sheet contains more than one highlight color, disambiguate the
  // pre-filled labels ("לבידו 11-12.26 · קבוצה 1/2/...") instead of repeating the same one
  const sheetCounts = {};
  pendingStandsGroups.forEach(g=>{ sheetCounts[g.sheetName] = (sheetCounts[g.sheetName]||0) + 1; });
  const sheetSeen = {};
  pendingStandsGroups.forEach(g=>{
    const base = cleanSheetLabel(g.sheetName);
    if(sheetCounts[g.sheetName] > 1){
      sheetSeen[g.sheetName] = (sheetSeen[g.sheetName]||0) + 1;
      g.defaultLabel = `${base} · קבוצה ${sheetSeen[g.sheetName]}`;
    } else {
      g.defaultLabel = base;
    }
  });
  const totalBranchEntries = matched.length;
  const sheetCount = new Set(pendingStandsGroups.map(g=>g.sheetName)).size;
  document.getElementById('modal-body').innerHTML = `
    <h3>ייבוא סטנדים מאקסל</h3>
    <p style="font-size:12.5px;color:var(--text-secondary);margin:0 0 12px;">זוהו ${totalBranchEntries} סימוני סניפים על פני ${sheetCount} גיליונות בקובץ, שחולקו ל-${pendingStandsGroups.length} קמפיינים (לפי גיליון, ולפי צבע כשיש יותר מצבע אחד באותו גיליון). אשרו/ערכו את שם כל קמפיין.</p>
    ${unmatchedCount ? `<div class="import-warn">בנוסף אותרו ${unmatchedCount} תאים צבועים נוספים שלא זוהו כשמות סניפים (כנראה כותרות/שמות מנהלי אזור בקובץ) — ניתן להתעלם, אך אם חלקם כן סניפים כדאי לבדוק ידנית.</div>` : ''}
    ${pendingStandsGroups.map((g,idx)=>{
      const branches = Array.from(g.branchMap.keys());
      return `
      <div class="import-summary-group stand-group-row">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <span class="stand-color-dot" style="background:${g.colorHex};"></span>
          <input type="text" id="stand-label-${idx}" value="${g.defaultLabel.replace(/"/g,'&quot;')}" placeholder="שם המותג/הסטנד" style="flex:1;padding:8px 10px;border-radius:8px;border:1px solid var(--gridline);font-size:13px;">
          <span style="font-size:11.5px;color:var(--muted);flex:none;">${branches.length} סניפים</span>
        </div>
        <div style="font-size:10.5px;color:var(--muted);margin-bottom:4px;">מתוך גיליון "${g.sheetName}"</div>
        <div style="font-size:11px;color:var(--muted);line-height:1.6;margin-bottom:8px;">${branches.join(', ')}</div>
        <div class="field" style="margin-bottom:8px;">
          <label style="font-size:12px;">טקסט מצד מחלקת השיווק (אופציונלי)</label>
          <textarea id="stand-text-${idx}" rows="2" style="font-size:13px;" placeholder="הנחיות/הערות שיוצגו לסניפים...">${g.marketingText||''}</textarea>
        </div>
        <div class="field">
          <label style="font-size:12px;">תמונה להמחשה (אופציונלי)</label>
          <button type="button" class="btn-import" onclick="document.getElementById('stand-image-input-${idx}').click()">🖼 בחירת תמונה</button>
          <input type="file" id="stand-image-input-${idx}" accept="image/*" style="display:none;" onchange="handleStandImageChange(event, ${idx})">
          <div class="field-hint" id="stand-image-status-${idx}"></div>
        </div>
      </div>`;
    }).join('')}
    <div class="field" style="margin-top:14px;">
      <label>תאריך עליית הסטנד (אופציונלי, חל על כל הקמפיינים בייבוא זה)</label>
      <input id="stands-install-date" placeholder="DD.MM.YYYY">
    </div>
    <div class="field">
      <label>תאריך הורדת הסטנד (חל על כל הקמפיינים בייבוא זה)</label>
      <input id="stands-takedown-date" placeholder="DD.MM.YYYY">
    </div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">ביטול</button>
      <button class="btn-confirm" onclick="saveStandsImport()">יצירת קמפיינים ושליחת התראות</button>
    </div>
  `;
  document.getElementById('modal-overlay').classList.add('open');
}
function saveStandsImport(){
  const takedownDate = val('stands-takedown-date');
  if(!/^\d{2}\.\d{2}\.\d{4}$/.test(takedownDate)){
    toast('נא להזין תאריך הורדה תקין בפורמט DD.MM.YYYY');
    return;
  }
  const installDateRaw = val('stands-install-date');
  if(installDateRaw && !/^\d{2}\.\d{2}\.\d{4}$/.test(installDateRaw)){
    toast('נא להזין תאריך עלייה תקין בפורמט DD.MM.YYYY, או להשאיר ריק');
    return;
  }
  const installDate = installDateRaw || null;
  if(!pendingStandsGroups || !pendingStandsGroups.length){ closeModal(); return; }
  let missingLabel = false;
  const newCampaigns = [];
  pendingStandsGroups.forEach((g,idx)=>{
    const inputEl = document.getElementById('stand-label-'+idx);
    const label = inputEl ? inputEl.value.trim() : '';
    if(!label){ missingLabel = true; return; }
    const textEl = document.getElementById('stand-text-'+idx);
    const marketingText = textEl ? textEl.value.trim() : '';
    const branches = Array.from(g.branchMap.values()).map(v=>({
      matchedBranchName: v.matchedBranch.name,
      matchedBranchEmail: v.matchedBranch.email,
      areaManager: v.matchedBranch.area || '',
      sourceSheets: Array.from(v.sheets),
      confirmed: false,
      confirmedAt: null
    }));
    newCampaigns.push({
      id: nextIds.standCampaigns++,
      label, colorHex: g.colorHex, sourceSheet: g.sheetName, takedownDate, installDate,
      marketingText: marketingText || null, imageUrl: g.imageUrl || null,
      createdAt: todayHeb(),
      reminder5Sent: false, reminder3Sent: false,
      branches
    });
  });
  if(missingLabel){
    toast('נא למלא שם מותג/סטנד עבור כל קמפיין לפני השמירה');
    return;
  }
  pendingStandsGroups = null;
  closeModal();
  if(firebaseReady){
    const batch = db.batch();
    newCampaigns.forEach(camp=>{
      const ref = db.collection('standCampaigns').doc();
      const {id, ...campData} = camp;
      campData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      batch.set(ref, campData);
    });
    batch.commit()
      .then(()=>{
        const totalBranchesAffected = newCampaigns.reduce((s,c)=>s+c.branches.length,0);
        toast(`נוצרו ${newCampaigns.length} קמפיינים חדשים · ${totalBranchesAffected} סניפים סומנו לאישור.`);
      })
      .catch(err=>toast('שגיאה בשמירת הקמפיינים: '+err.message));
    return;
  }
  newCampaigns.forEach(camp=>{
    appData.standCampaigns.push(camp);
    addNotification({
      id: Date.now() + camp.id,
      title: 'יש לאשר את הסטנד',
      body: `${camp.label} — ${camp.branches.length} סניפים סומנו לאישור הצבה, עד ${camp.takedownDate}.`,
      date: todayHeb(), type:'stand', read:false
    });
  });
  renderContent();
  renderNotifPanel();
  const totalBranchesAffected = newCampaigns.reduce((s,c)=>s+c.branches.length,0);
  toast(`נוצרו ${newCampaigns.length} קמפיינים חדשים · ${totalBranchesAffected} סניפים סומנו לאישור.`);
}
function toggleStandTable(campId){
  const el = document.getElementById('stand-table-'+campId);
  const arrow = document.getElementById('stand-arrow-'+campId);
  el.classList.toggle('open');
  arrow.textContent = el.classList.contains('open') ? '▴' : '▾';
}
let pendingEditStandImageUrl = undefined;
function openEditStandModal(campId){
  const camp = appData.standCampaigns.find(c=>c.id==campId);
  if(!camp) return;
  pendingEditStandImageUrl = undefined;
  document.getElementById('modal-body').innerHTML = `
    <h3>עריכת קמפיין סטנד</h3>
    <div class="field"><label>שם המותג/הסטנד</label><input id="edit-stand-label" value="${camp.label.replace(/"/g,'&quot;')}"></div>
    <div class="field"><label>תאריך עלייה (אופציונלי)</label><input id="edit-stand-install" value="${camp.installDate||''}" placeholder="DD.MM.YYYY"></div>
    <div class="field"><label>תאריך הורדה</label><input id="edit-stand-takedown" value="${camp.takedownDate||''}" placeholder="DD.MM.YYYY"></div>
    <div class="field"><label>טקסט מצד מחלקת השיווק</label><textarea id="edit-stand-text" rows="3">${camp.marketingText||''}</textarea></div>
    <div class="field">
      <label>תמונה להמחשה</label>
      ${camp.imageUrl ? `<div style="margin-bottom:8px;"><img src="${camp.imageUrl}" style="max-width:100%;max-height:160px;border-radius:8px;"></div>` : ''}
      <button type="button" class="btn-import" onclick="document.getElementById('edit-stand-image-input').click()">🖼 ${camp.imageUrl ? 'החלפת תמונה' : 'בחירת תמונה'}</button>
      <input type="file" id="edit-stand-image-input" accept="image/*" style="display:none;" onchange="handleEditStandImageChange(event)">
      <div class="field-hint" id="edit-stand-image-status"></div>
    </div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">ביטול</button>
      <button class="btn-confirm" onclick="saveEditStand('${campId}')">שמירה</button>
    </div>
  `;
  document.getElementById('modal-overlay').classList.add('open');
}
function handleEditStandImageChange(evt){
  const file = evt.target.files[0];
  if(!file) return;
  if(!file.type || file.type.indexOf('image/')!==0){ toast('נא לבחור קובץ תמונה (PNG / JPG)'); evt.target.value=''; return; }
  const statusEl = document.getElementById('edit-stand-image-status');
  if(statusEl) statusEl.textContent = '⏳ מעלה את התמונה...';
  uploadFileToCloudinary(file).then(function(result){
    pendingEditStandImageUrl = result.secure_url;
    if(statusEl) statusEl.innerHTML = '✅ הועלה בהצלחה';
  }).catch(function(err){
    console.error(err);
    if(statusEl) statusEl.textContent = '❌ ההעלאה נכשלה: ' + err.message;
    toast('שגיאה בהעלאת התמונה');
  });
}
function saveEditStand(campId){
  const camp = appData.standCampaigns.find(c=>c.id==campId);
  if(!camp) return;
  const label = val('edit-stand-label');
  const installDate = val('edit-stand-install');
  const takedownDate = val('edit-stand-takedown');
  if(!label){ toast('נא למלא שם מותג/סטנד'); return; }
  if(!/^\d{2}\.\d{2}\.\d{4}$/.test(takedownDate)){ toast('נא להזין תאריך הורדה תקין'); return; }
  if(installDate && !/^\d{2}\.\d{2}\.\d{4}$/.test(installDate)){ toast('נא להזין תאריך עלייה תקין, או להשאיר ריק'); return; }
  const marketingText = val('edit-stand-text');
  const updates = {
    label, installDate: installDate || null, takedownDate,
    marketingText: marketingText || null,
    imageUrl: pendingEditStandImageUrl!==undefined ? pendingEditStandImageUrl : (camp.imageUrl || null)
  };
  Object.assign(camp, updates);
  pendingEditStandImageUrl = undefined;
  closeModal();
  if(firebaseReady){
    db.collection('standCampaigns').doc(campId).update(updates)
      .then(()=>toast('הקמפיין עודכן בהצלחה'))
      .catch(err=>toast('שגיאה בעדכון הקמפיין: '+err.message));
  } else {
    renderContent();
    toast('הקמפיין עודכן בהצלחה');
  }
}
/* אישור סטנד — הסטטוס נשמר כעת במסמך נפרד לכל סניף (standConfirmations), לא במערך משותף
   בתוך הקמפיין. זה מאפשר להגביל בכללי Firestore: רק הסניף עצמו יכול לכתוב לאישור שלו.
   נופל חזרה לשדות confirmed/confirmedAt הישנים על branches[idx] לתאימות עם קמפיינים ישנים. */
function getStandBranchStatus(camp, b){
  const conf = (appData.standConfirmations || []).find(c => c.campaignId === camp.id && c.branchEmail === b.matchedBranchEmail);
  if(conf) return { confirmed: !!conf.confirmed, confirmedAt: conf.confirmedAt || null };
  return { confirmed: !!b.confirmed, confirmedAt: b.confirmedAt || null };
}
function confirmStand(campId, idx){
  if(previewMode){ toast('פעולה לא זמינה במצב תצוגה'); return; }
  const camp = appData.standCampaigns.find(c=>c.id==campId);
  if(!camp) return;
  const b = camp.branches[idx];
  if(!b) return;
  if(getStandBranchStatus(camp, b).confirmed) return;
  const confirmedAt = todayHeb();
  if(firebaseReady){
    const confId = campId + '__' + b.matchedBranchEmail;
    db.collection('standConfirmations').doc(confId).set({
      campaignId: campId,
      branchEmail: b.matchedBranchEmail,
      branchName: b.matchedBranchName,
      confirmed: true,
      confirmedAt
    }, {merge:true})
      .then(()=>{
        toast('תודה! האישור נשמר בהצלחה.');
        sendPrivateMessageEmail(b.matchedBranchName, `אישור סטנד: ${camp.label}`, `סניף ${b.matchedBranchName} אישר את סטנד ${camp.label} — הוצב בסניף בהצלחה.`);
      })
      .catch(err=>toast('שגיאה בשמירת האישור: '+err.message));
    return;
  }
  b.confirmed = true;
  b.confirmedAt = confirmedAt;
  addNotification({
    id: Date.now(),
    title: 'סטנד אושר',
    body: `${b.matchedBranchName} אישר/ה שהסטנד "${camp.label}" תקין ומוצב בסניף.`,
    date: todayHeb(), type:'stand', read:false
  });
  renderContent();
  renderNotifPanel();
  toast('תודה! האישור נשמר בהצלחה.');
  sendPrivateMessageEmail(b.matchedBranchName, `אישור סטנד: ${camp.label}`, `סניף ${b.matchedBranchName} אישר את סטנד ${camp.label} — הוצב בסניף בהצלחה.`);
}
/* אישור "ראיתי, אוריד את הסטנד" — תזכורת 3 ימים לפני ההורדה שחובה לאשר.
   כל עוד לא קיים מסמך אישור לצירוף (קמפיין+סניף) הזה, הבאנר ימשיך להופיע —
   זה לא נגזר מ"נקרא" (עיגול אדום) אלא מהיעדר אישור בפועל, כל טעינה מחדש. */
function hasAckedTakedown(campId, branchEmail){
  return (appData.standTakedownAcks||[]).some(a=>a.campaignId===campId && a.branchEmail===branchEmail);
}
function ackStandTakedown(campId){
  if(previewMode){ toast('פעולה לא זמינה במצב תצוגה'); return; }
  if(!session.branchInfo) return;
  const camp = appData.standCampaigns.find(c=>c.id==campId);
  if(!camp) return;
  const branchEmail = session.branchInfo.email;
  const ackedAt = todayHeb() + ' ' + new Date().toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'});
  if(hasAckedTakedown(campId, branchEmail)) return;
  const rec = {campaignId: campId, branchEmail, branchName: session.branchName, ackedAt};
  appData.standTakedownAcks.push(rec);
  renderContent();
  toast('תודה, מסומן כנקרא.');
  if(firebaseReady){
    const ackId = campId + '__' + branchEmail;
    db.collection('standTakedownAcks').doc(ackId).set(rec).catch(err=>toast('שגיאה בשמירת האישור: '+err.message));
  }
}
function checkStandReminders(){
  const now = Date.now();
  let any = false;
  appData.standCampaigns.forEach(camp=>{
    const t = parseHebDate(camp.takedownDate);
    if(isNaN(t)) return;
    const daysLeft = (t-now)/86400000;
    /* תזכורת מידעית, חד-פעמית, 5 ימים לפני ההורדה. */
    if(!camp.reminder5Sent && daysLeft<=5 && daysLeft>3){
      camp.reminder5Sent = true;
      if(firebaseReady) db.collection('standCampaigns').doc(camp.id).update({reminder5Sent:true}).catch(()=>{});
      addNotification({
        id: Date.now()+Math.random(),
        title: '🪧 תזכורת: יש להוריד סטנד בקרוב',
        body: `${camp.label} — יש להוריד את הסטנד בעוד כ-5 ימים (${camp.takedownDate}).`,
        date: todayHeb(), type:'stand', read:false
      });
      any = true;
    }
    /* תזכורת דחופה 3 ימים לפני ההורדה — לא חד-פעמית: מוצגת פעם אחת כהתראה בפעמון,
       אבל הבאנר החובה-לאישור ב"סטנדים לאישור" ממשיך להופיע כל עוד לא אושר בפועל
       (ראו hasAckedTakedown/ackStandTakedown), ללא תלות בשדה הזה. */
    if(!camp.reminder3Sent && daysLeft<=3 && daysLeft>=-3){
      camp.reminder3Sent = true;
      if(firebaseReady) db.collection('standCampaigns').doc(camp.id).update({reminder3Sent:true}).catch(()=>{});
      addNotification({
        id: Date.now()+Math.random(),
        title: '⏰ תזכורת דחופה: להוריד סטנד — נדרש אישור',
        body: `${camp.label} — יש להוריד את הסטנד עד ${camp.takedownDate}. יש לאשר קבלת התזכורת במסך "סטנדים לאישור".`,
        date: todayHeb(), type:'stand', read:false
      });
      any = true;
    }
  });
  if(any) renderNotifPanel();
}
function viewStands(){
  return session.role==='marketing' ? viewStandsMarketing() : viewStandsBranch();
}
function standCardHtml(camp, b, idx, pending, confirmedAt){
  const daysLeft = Math.ceil((parseHebDate(camp.takedownDate)-Date.now())/86400000);
  return `
    <div class="admin-row" style="align-items:flex-start;flex-direction:column;gap:8px;">
      <div style="display:flex;justify-content:space-between;width:100%;flex-wrap:wrap;gap:6px;align-items:flex-start;">
        <div class="admin-row-main">
          <div class="t"><span class="stand-color-dot" style="background:${camp.colorHex};"></span> ${camp.label}${camp.demo ? ' <span class="badge ended">🧪 נתוני הדגמה</span>' : ''}</div>
          <div class="m">${camp.installDate ? `עלייה ב-<span dir="ltr">${camp.installDate}</span> · ` : ''}יש להוריד עד <span dir="ltr">${camp.takedownDate}</span>${daysLeft>=0 ? ` · עוד ${daysLeft} ימים` : ' · התאריך עבר'}</div>
        </div>
        ${pending ? '' : '<span class="badge active"><span class="dot"></span>אושר</span>'}
      </div>
      ${camp.imageUrl ? `<img src="${camp.imageUrl}" alt="תמונה להמחשה" style="max-width:100%;max-height:260px;border-radius:10px;display:block;">` : ''}
      ${camp.marketingText ? `<div style="font-size:13.5px;background:#f2f3f5;border-radius:8px;padding:10px 12px;white-space:pre-wrap;">${camp.marketingText}</div>` : ''}
      ${pending ? `<button class="stand-confirm-btn" onclick="confirmStand('${camp.id}',${idx})">✅ אשר שהסטנד תקין ומוצב בסניף</button>` : `<div class="field-hint">אושר בתאריך ${confirmedAt}</div>`}
    </div>
  `;
}
