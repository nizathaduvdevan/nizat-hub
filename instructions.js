/* ---------- Instructions ---------- */
function renderInstructionExecutionArea(instr, myStatus){
  const myCompletion = session.branchInfo ? getInstructionCompletion(instr.id, session.branchInfo.email) : null;
  return `
    <div class="instr-task-area" onclick="event.stopPropagation();">
      <div class="instr-task-head">ביצוע המשימה</div>
      <div class="instr-task-due">לביצוע עד: <span dir="ltr">${instr.dueDate||''}</span>${myStatus==='overdue' && !myCompletion ? ' · <b style="color:var(--critical);">באיחור</b>' : ''}</div>
      ${myCompletion ? `
        <div class="instr-task-done">✓ בוצע ב-${myCompletion.completedAt}</div>
        ${myCompletion.photoUrl ? `<button class="link-btn" onclick="event.stopPropagation();viewCompletionPhotoModal('${myCompletion.photoUrl}')">📷 צפייה בצילום שהועלה</button>` : ''}
      ` : instr.requiresPhoto ? `
        <div class="field-hint" style="margin:8px 0 6px;">צילום לאחר ביצוע</div>
        <button type="button" class="btn-import" onclick="document.getElementById('instr-photo-input-${instr.id}').click()">📷 העלאת תמונה</button>
        <input type="file" accept="image/*" id="instr-photo-input-${instr.id}" style="display:none;" onchange="handleInstructionPhotoUpload('${instr.id}', event)">
        <div class="field-hint" id="instr-photo-status-${instr.id}">${pendingInstrPhotos[instr.id] ? '✅ התמונה הועלתה' : ''}</div>
        ${pendingInstrPhotos[instr.id] ? `<button type="button" class="btn-confirm" style="margin-top:8px;" onclick="submitInstructionCompletion('${instr.id}')">✓ שליחת ביצוע</button>` : ''}
      ` : `
        <button type="button" class="btn-confirm" style="margin-top:8px;" onclick="submitInstructionCompletion('${instr.id}')">✓ ביצעתי</button>
      `}
    </div>
  `;
}
function renderInstructionStatusPanel(instr){
  const targetBranches = BRANCH_DIRECTORY.filter(b=>isInstructionTargetedAtBranch(instr, b));
  const rows = targetBranches.map(b=>{
    const completion = getInstructionCompletion(instr.id, b.email);
    let status = 'pending';
    if(completion) status = 'done';
    else if(instr.dueDate && Date.now() > parseHebDate(instr.dueDate)+24*60*60*1000-1) status = 'overdue';
    return {branch:b, completion, status};
  });
  const doneCount = rows.filter(r=>r.status==='done').length;
  const overdueCount = rows.filter(r=>r.status==='overdue').length;
  const pendingCount = rows.filter(r=>r.status==='pending').length;
  const total = rows.length;
  const pct = total>0 ? Math.round(doneCount/total*100) : 0;
  const filtered = instrStatusFilter==='all' ? rows : rows.filter(r=>r.status===instrStatusFilter);
  return `
    <div class="instr-task-area" onclick="event.stopPropagation();">
      <div class="instr-task-head">סטטוס ביצוע בסניפים</div>
      <div class="instr-task-due">${doneCount} מתוך ${total} סניפים השלימו · ${pct}%</div>
      <div class="comp-progress-track" style="margin:8px 0 10px;"><div class="comp-progress-fill ${pct>=100?'full':''}" style="width:${pct}%"></div></div>
      <div style="display:flex;gap:14px;flex-wrap:wrap;font-size:13px;margin-bottom:12px;">
        <span>✅ בוצע ${doneCount}</span><span>⏳ ממתינים ${pendingCount}</span><span>🔴 באיחור ${overdueCount}</span>
      </div>
      <div class="instr-filter-row">
        <button class="comp-tab-btn ${instrStatusFilter==='all'?'active':''}" style="${instrStatusFilter==='all'?'background:#457a1f;border-color:#457a1f;color:#fff;':''}" onclick="setInstrStatusFilter('all')">הכל</button>
        <button class="comp-tab-btn ${instrStatusFilter==='done'?'active':''}" style="${instrStatusFilter==='done'?'background:#457a1f;border-color:#457a1f;color:#fff;':''}" onclick="setInstrStatusFilter('done')">בוצע</button>
        <button class="comp-tab-btn ${instrStatusFilter==='pending'?'active':''}" style="${instrStatusFilter==='pending'?'background:#457a1f;border-color:#457a1f;color:#fff;':''}" onclick="setInstrStatusFilter('pending')">ממתינים</button>
        <button class="comp-tab-btn ${instrStatusFilter==='overdue'?'active':''}" style="${instrStatusFilter==='overdue'?'background:#457a1f;border-color:#457a1f;color:#fff;':''}" onclick="setInstrStatusFilter('overdue')">באיחור</button>
      </div>
      <div class="instr-branch-list">
        ${filtered.map(r=>`
          <div class="instr-branch-row">
            <span class="ibr-name">${r.branch.name}</span>
            <span class="badge ${r.status==='done'?'active':r.status==='overdue'?'urgent':'normal'}">${r.status==='done'?'בוצע':r.status==='overdue'?'באיחור':'ממתין'}</span>
            <span class="ibr-photo">${r.completion && r.completion.photoUrl ? `<button class="link-btn" onclick="viewCompletionPhotoModal('${r.completion.photoUrl}')">📷 צפייה</button>` : '-'}</span>
            <span class="ibr-date">${r.completion ? r.completion.completedAt : '-'}</span>
          </div>
        `).join('') || '<div class="empty-state">אין סניפים בסינון הזה.</div>'}
      </div>
    </div>
  `;
}

function viewInstructions(){
  const list = [...appData.instructions].sort((a,b)=>parseHebDate(b.date)-parseHebDate(a.date));
  const myEmail = session.branchInfo ? session.branchInfo.email : null;
  return `
    <div class="page-head">
      <h1>הוראות ועדכונים</h1>
      <p>${getText('instructions_desc')}</p>
    </div>
    <div class="card">
      ${list.length ? list.map(i=>{
        const isTask = !!i.requiresAction;
        const myStatus = (isTask && session.role==='branch') ? getInstructionStatusForBranch(i, myEmail) : null;
        const taskAccent = myStatus==='overdue' ? 'var(--critical)' : (isTask ? 'var(--warning)' : null);
        const iUnread = !isItemRead('instructions', i.id);
        return `
        <div class="instr-card" onclick="toggleInstr('${i.id}')" style="border-bottom:1px solid var(--gridline);${taskAccent?`border-right:3px solid ${taskAccent};`:''}">
          <div class="instr-top">
            <div style="display:flex;align-items:center;gap:8px;min-width:0;">
              ${iUnread?'<span class="unread-dot"></span>':''}
              <h4 class="instr-title">${i.title}</h4>
            </div>
            <div style="display:flex;align-items:center;gap:6px;flex:none;">
              ${myStatus==='done' ? '<span class="badge active"><span class="dot"></span>בוצע ✓</span>' : ''}
              ${myStatus==='overdue' ? '<span class="badge urgent"><span class="dot"></span>באיחור</span>' : ''}
              ${myStatus==='pending' ? '<span class="badge cat">לטיפול</span>' : ''}
              <span class="badge ${i.priority==='urgent'?'urgent':'normal'}"><span class="dot"></span>${PRIORITY_LABEL[i.priority]}</span>
            </div>
          </div>
          <div class="instr-meta"><span class="badge cat" style="padding:2px 8px;">${i.category}</span><span>${i.date}${i.time?' · '+i.time:''}</span>${i.updateLength==='short'?'<span class="badge cat" style="padding:2px 8px;">⚡ עדכון קצר</span>':''}<span style="${iUnread?'color:var(--blue-dark);font-weight:600;':'color:var(--muted);'}">${iUnread?'עדכון חדש':'נקרא'}</span></div>
          <div class="instr-body ${i.updateLength==='short'?'open':''}" id="instr-body-${i.id}">
            <p style="margin:0 0 4px;">${i.body}</p>
            ${i.imageUrl ? `<img src="${i.imageUrl}" alt="תמונה להמחשה" style="max-width:100%;max-height:320px;border-radius:10px;margin:8px 0;display:block;" onclick="event.stopPropagation()">` : ''}
            ${isTask && session.role==='branch' ? renderInstructionExecutionArea(i, myStatus) : ''}
            ${isTask && session.role==='marketing' ? renderInstructionStatusPanel(i) : ''}
            ${commentsBox('instruction', i.id)}
          </div>
        </div>
      `;}).join('') : `<div class="empty-state">
        עדיין אין הוראות ועדכונים.${session.role==='marketing' ? ' לחצו על "ניהול תוכן" כדי לפרסם הוראה ראשונה.' : ''}
      </div>`}
    </div>
  `;
}
function toggleInstr(id){
  markItemRead('instructions', id);
  const el = document.getElementById('instr-body-'+id);
  el.classList.toggle('open');
  renderNav();
}

/* ============================================================
   משימות ביצוע לסניפים — הרחבה של מודול ההוראות הקיים.
   completion אחד = מסמך אחד ב-instructionCompletions, מזוהה ע"י
   instructionId+branchEmail (כמו standConfirmations), לא מערך בתוך ההוראה.
============================================================ */
/* בודקת אם אירוע מסוים אמור להיות גלוי לצופה הנוכחי, לפי קהל היעד שנבחר
   ביצירת האירוע: 'all' (ארצי, גלוי לכולם), 'branch' (גלוי רק לסניף הספציפי
   שנבחר), 'area' (גלוי למנהל האזור הרלוונטי ולכל הסניפים תחת אותו אזור).
   מחלקת השיווק תמיד רואה הכל (לצורך ניהול), בלי קשר לקהל היעד. */
function isEventVisibleToViewer(ev){
  if(session.role==='marketing') return true;
  const audience = ev.audience || 'all';
  if(audience==='all') return true;
  if(audience==='branch'){
    return session.role==='branch' && session.branchInfo && session.branchInfo.email===ev.targetBranchEmail;
  }
  if(audience==='area'){
    if(session.role==='area') return session.areaLabel===ev.targetAreaLabel;
    if(session.role==='branch' && session.branchInfo) return session.branchInfo.area===ev.targetAreaLabel;
  }
  return false;
}
function isInstructionTargetedAtBranch(instr, branchInfo){
  if(!branchInfo) return false;
  const target = instr.targetBranches;
  if(!target || target==='all') return true;
  if(Array.isArray(target)) return target.indexOf(branchInfo.name) !== -1;
  return true;
}
function getInstructionCompletion(instructionId, branchEmail){
  return (appData.instructionCompletions||[]).find(c=>c.instructionId==instructionId && c.branchEmail===branchEmail) || null;
}
function getInstructionStatusForBranch(instr, branchEmail){
  if(!instr.requiresAction) return null;
  const completion = getInstructionCompletion(instr.id, branchEmail);
  if(completion) return 'done';
  if(instr.dueDate){
    const dueEnd = parseHebDate(instr.dueDate) + 24*60*60*1000 - 1;
    if(Date.now() > dueEnd) return 'overdue';
  }
  return 'pending';
}
/* תמונת ההוכחה נשמרת ממתינה per-instruction (לא global יחיד) כדי לתמוך במקרה
   שיותר מהוראה אחת פתוחה/מנוסה באותו זמן, בלי לבלבל בין העלאות. */
let pendingInstrPhotos = {};
function handleInstructionPhotoUpload(instructionId, evt){
  const file = evt.target.files[0];
  if(!file) return;
  const statusEl = document.getElementById('instr-photo-status-'+instructionId);
  if(statusEl) statusEl.textContent = '⏳ מעלה את התמונה...';
  const reader = new FileReader();
  reader.onload = function(e){
    const img = new Image();
    img.onload = function(){
      // resize/compress בצד הלקוח לפני ההעלאה — תמונות מהטלפון לא יגיעו כבדות מדי
      const maxW = 1280;
      const scale = Math.min(1, maxW/(img.width||maxW));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round((img.width||maxW)*scale));
      canvas.height = Math.max(1, Math.round((img.height||maxW)*scale));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(function(blob){
        if(!blob){ if(statusEl) statusEl.textContent = '❌ לא ניתן היה לעבד את התמונה'; return; }
        uploadFileToCloudinary(blob).then(function(result){
          pendingInstrPhotos[instructionId] = result.secure_url;
          if(statusEl) statusEl.innerHTML = '✅ התמונה הועלתה';
          renderContent();
        }).catch(function(err){
          console.error(err);
          if(statusEl) statusEl.textContent = '❌ ההעלאה נכשלה: ' + err.message;
        });
      }, 'image/jpeg', 0.82);
    };
    img.onerror = function(){ if(statusEl) statusEl.textContent = '❌ לא ניתן היה לקרוא את קובץ התמונה'; };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
  evt.target.value = '';
}
function writeInstructionCompletion(instr, photoUrl){
  if(!session.branchInfo) return;
  const branchEmail = session.branchInfo.email;
  const confId = instr.id + '__' + branchEmail;
  const completedAt = todayHeb() + ' ' + new Date().toLocaleTimeString('he-IL', {hour:'2-digit', minute:'2-digit'});
  const data = {
    instructionId: instr.id, instructionTitle: instr.title,
    branchEmail, branchName: session.branchName,
    completedAt, photoUrl: photoUrl || null, requiresPhoto: !!instr.requiresPhoto
  };
  if(firebaseReady){
    db.collection('instructionCompletions').doc(confId).set(
      Object.assign({}, data, {createdAt: firebase.firestore.FieldValue.serverTimestamp()})
    ).then(function(){
      toast('✓ הביצוע נשלח בהצלחה');
      delete pendingInstrPhotos[instr.id];
      // המייל הוא התראה בלבד — ה-Firestore הוא מקור האמת. אם המייל נכשל,
      // הביצוע כבר נשמר ולא מתבטל (sendPrivateMessageEmail עצמה כבר "בולעת"
      // שגיאות שליחה ורק רושמת ל-console, בלי לזרוק/לבטל כלום).
      if(instr.requiresPhoto && photoUrl){
        const body = `התקבל ביצוע חדש דרך Nizat HUB\n\nמשימה: ${instr.title}\nסניף: ${session.branchName}\nתאריך ביצוע: ${completedAt}\n\nלצפייה בצילום:\n${photoUrl}`;
        sendPrivateMessageEmail(session.branchName, `ביצוע משימה - ${instr.title}`, body);
      }
    }).catch(function(err){
      console.error('שמירת ביצוע נכשלה:', err);
      toast('שגיאה בשמירת הביצוע: ' + err.message);
    });
  } else {
    appData.instructionCompletions.push(Object.assign({id:confId}, data));
    toast('✓ הביצוע נשלח בהצלחה');
    delete pendingInstrPhotos[instr.id];
    renderContent();
  }
}
function submitInstructionCompletion(instructionId){
  if(previewMode){ toast('פעולה לא זמינה במצב תצוגה'); return; }
  const instr = appData.instructions.find(i=>i.id==instructionId);
  if(!instr) return;
  if(instr.requiresPhoto){
    const photoUrl = pendingInstrPhotos[instructionId];
    if(!photoUrl){ toast('יש להעלות תמונה לפני שליחת הביצוע'); return; }
    writeInstructionCompletion(instr, photoUrl);
  } else {
    writeInstructionCompletion(instr, null);
  }
}
function viewCompletionPhotoModal(url){
  document.getElementById('modal-body').innerHTML = `
    <h3>צילום ביצוע</h3>
    <img src="${url}" style="width:100%;border-radius:10px;margin-top:8px;" alt="צילום ביצוע">
    <div class="modal-actions"><button class="btn-secondary" onclick="closeModal()">סגירה</button></div>
  `;
  document.getElementById('modal-overlay').classList.add('open');
}
let instrStatusFilter = 'all';
function setInstrStatusFilter(f){ instrStatusFilter = f; renderContent(); }
