/* ============================================================
   שיחות עם מנהל האזור — כלי רוחבי עצמאי (לא חלק ממחלקת שיווק)
   ------------------------------------------------------------
   שתי הקולקציות הקיימות נשארות, רק מורחבות:
   - areaInstructions: "כותרת העדכון" ששלח מנהל האזור. נשארת בדיוק כמו
     שהייתה. ההודעה הראשונה של כל שיחה נשלפת ישירות מכאן (title+body),
     ולא משוכפלת לתוך מסמך השיחה עצמה.
   - areaInstructionConfirmations: מסמך נפרד לכל <instructionId>__<branchEmail>
     (בדיוק כמו standConfirmations) — הופך כאן ל"שיחה פרטית" מלאה בין
     מנהל האזור לסניף הספציפי הזה. שדות חדשים: messages (מערך הודעות
     הלוך-חזור), conversationStatus ('open'/'closed'), branchReadCount/
     areaReadCount (מעקב "לא נקרא" פשוט — כמה הודעות כל צד כבר ראה).
   תאימות אחורה: הוראות/אישורים שנוצרו לפני השדרוג הזה (עם note+confirmedAt
   בלבד, בלי messages) ממשיכים להיות נגישים ומוצגים כשיחה קצרה שכבר
   נסגרה — ראו conversationStatusOf ו-buildConversationMessages.
   ============================================================ */
function createAreaInstruction(title, body, targetScope, specificBranchEmail){
  if(previewMode){ toast('פעולה לא זמינה במצב תצוגה'); return; }
  if(!isRealAreaManager()) return;
  if(!title || !title.trim()){ toast('נא למלא כותרת'); return; }
  const areaBranches = BRANCH_DIRECTORY.filter(b=>b.area===session.areaLabel);
  let targetBranchEmails;
  if(targetScope==='specific'){
    if(!specificBranchEmail){ toast('נא לבחור סניף'); return; }
    targetBranchEmails = [specificBranchEmail];
  } else if(targetScope==='multi'){
    targetBranchEmails = Array.from(document.querySelectorAll('.f-area-instr-multi-cb:checked')).map(function(el){return el.value;});
    if(!targetBranchEmails.length){ toast('נא לבחור לפחות סניף אחד'); return; }
  } else {
    targetBranchEmails = areaBranches.map(b=>b.email).filter(Boolean);
  }
  if(!targetBranchEmails.length){ toast('לא נמצאו סניפים ליעד'); return; }
  db.collection('areaInstructions').add({
    areaManagerEmail: currentUserEmail,
    areaLabel: session.areaLabel,
    title: title.trim(),
    body: (body||'').trim(),
    targetScope,
    targetBranchEmails,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(function(){
    closeModal();
    toast('העדכון נשלח');
  }).catch(function(err){ toast('שגיאה: ' + err.message); });
}
function toggleAreaInstrScopeFields(){
  const v = document.getElementById('f-area-instr-scope').value;
  document.getElementById('f-area-instr-branch-wrap').style.display = v==='specific' ? 'block' : 'none';
  document.getElementById('f-area-instr-multi-wrap').style.display = v==='multi' ? 'block' : 'none';
}
function openNewAreaInstructionForm(){
  const areaBranches = BRANCH_DIRECTORY.filter(b=>b.area===session.areaLabel);
  document.getElementById('modal-body').innerHTML = `
    <h3>עדכון חדש לסניפים שלי</h3>
    <div class="field"><label>כותרת</label><input id="f-area-instr-title" placeholder="למשל: עדכון לגבי מבצע השבוע"></div>
    <div class="field"><label>תוכן (אופציונלי)</label><textarea id="f-area-instr-body" rows="4" placeholder="פרטים נוספים..."></textarea></div>
    <div class="field">
      <label>יעד</label>
      <select id="f-area-instr-scope" onchange="toggleAreaInstrScopeFields()">
        <option value="all">כל הסניפים שלי (${areaBranches.length})</option>
        <option value="specific">סניף ספציפי</option>
        <option value="multi">מספר סניפים</option>
      </select>
    </div>
    <div class="field" id="f-area-instr-branch-wrap" style="display:none;">
      <label>סניף</label>
      <select id="f-area-instr-branch">
        ${areaBranches.map(function(b){ return `<option value="${b.email}">${b.name}</option>`; }).join('')}
      </select>
    </div>
    <div class="field" id="f-area-instr-multi-wrap" style="display:none;max-height:160px;overflow:auto;">
      <label>בחירת סניפים</label>
      ${areaBranches.map(function(b){
        return `<label style="display:flex;align-items:center;gap:6px;font-weight:400;font-size:13.5px;padding:3px 0;">
          <input type="checkbox" class="f-area-instr-multi-cb" value="${b.email}"> ${b.name}
        </label>`;
      }).join('')}
    </div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">ביטול</button>
      <button class="btn-confirm" onclick="createAreaInstruction(document.getElementById('f-area-instr-title').value, document.getElementById('f-area-instr-body').value, document.getElementById('f-area-instr-scope').value, document.getElementById('f-area-instr-branch').value)">שליחה</button>
    </div>
  `;
  document.getElementById('modal-overlay').classList.add('open');
}
function getAreaConversation(instructionId, branchEmail){
  return (appData.areaInstructionConfirmations||[]).find(function(c){
    return c.instructionId===instructionId && c.branchEmail===branchEmail;
  }) || null;
}
/* סטטוס שיחה בפועל: שיחות חדשות משתמשות בשדה conversationStatus מפורש.
   שיחות ישנות (מלפני השדרוג לשיחות אמיתיות) שכבר כללו מסמך אישור (יש בו
   שדה note, גם אם ריק) נחשבות סגורות אוטומטית — כי לא הייתה בהן מלכתחילה
   אפשרות להמשיך ולהגיב. שיחה שטרם החל בה שום דבר (אין עדיין מסמך) —
   פתוחה כברירת מחדל. */
function conversationStatusOf(conv){
  if(!conv) return 'open';
  if(conv.conversationStatus) return conv.conversationStatus;
  if(conv.note !== undefined) return 'closed';
  return 'open';
}
function fmtTsShort(ts){
  if(ts && typeof ts.seconds === 'number') return new Date(ts.seconds*1000).toLocaleString('he-IL',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
  return '';
}
/* בונה את רשימת ההודעות המלאה להצגה: הודעה ראשונה תמיד גוף ההוראה המקורי
   (נשלף מ-areaInstructions, לא משוכפל לתוך מסמך השיחה), ואחריה הודעות
   מ-messages (סכימה חדשה), או הערת אישור בודדת מ-note (סכימה ישנה —
   תאימות אחורה, מוצגת רק אם אכן נכתבה הערה). */
function buildConversationMessages(instr, conv){
  const areaLabel = (AREA_MANAGER_INFO[instr.areaManagerEmail]||{}).label || 'מנהל האזור';
  const msgs = [{
    senderRole:'area', senderLabel: areaLabel,
    body: instr.title + (instr.body ? '\n'+instr.body : ''),
    createdAtLabel: fmtTsShort(instr.createdAt),
    idx: -1
  }];
  if(conv && conv.messages && conv.messages.length){
    conv.messages.forEach(function(m, i){ msgs.push(Object.assign({}, m, {idx: i})); });
  } else if(conv && conv.note){
    msgs.push({ senderRole:'branch', senderLabel: conv.branchName||'', body: conv.note, createdAtLabel: fmtTsShort(conv.confirmedAt), idx: -1 });
  }
  return msgs;
}
function safeConvId(instructionId, branchEmail){
  return instructionId + '__' + (branchEmail||'').replace(/[^a-zA-Z0-9]/g,'_');
}
function conversationUnreadFor(conv, viewerRole){
  if(!conv || !conv.messages || !conv.messages.length) return false;
  const field = viewerRole==='branch' ? 'branchReadCount' : 'areaReadCount';
  return conv.messages.length > (conv[field]||0);
}
function sendConversationMessage(instructionId, branchEmail, areaManagerEmail, senderRole, senderLabel, bodyText){
  if(previewMode){ toast('פעולה לא זמינה במצב תצוגה'); return; }
  const text = (bodyText||'').trim();
  if(!text) return;
  const id = safeConvId(instructionId, branchEmail);
  const existing = getAreaConversation(instructionId, branchEmail);
  if(conversationStatusOf(existing)==='closed'){ toast('השיחה סגורה'); return; }
  const msg = {
    senderRole, senderLabel: senderLabel||'',
    body: text,
    createdAtLabel: todayHeb() + ' ' + new Date().toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'})
  };
  const newCount = ((existing && existing.messages) ? existing.messages.length : 0) + 1;
  const update = {
    instructionId, areaManagerEmail, branchEmail,
    branchName: session.branchInfo ? session.branchInfo.name : (existing ? existing.branchName : ((BRANCH_DIRECTORY.find(b=>b.email===branchEmail)||{}).name||'')),
    messages: firebase.firestore.FieldValue.arrayUnion(msg)
  };
  update[senderRole==='branch' ? 'branchReadCount' : 'areaReadCount'] = newCount;
  db.collection('areaInstructionConfirmations').doc(id).set(update, {merge:true})
    .then(function(){ renderContent(); })
    .catch(function(err){ toast('שגיאה בשליחת ההודעה: ' + err.message); });
}
function ackConversation(instructionId, branchEmail, areaManagerEmail){
  if(previewMode){ toast('פעולה לא זמינה במצב תצוגה'); return; }
  const id = safeConvId(instructionId, branchEmail);
  db.collection('areaInstructionConfirmations').doc(id).set({
    instructionId, areaManagerEmail, branchEmail,
    branchName: session.branchInfo ? session.branchInfo.name : '',
    confirmedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, {merge:true}).then(function(){
    toast('האישור נשלח');
    renderContent();
  }).catch(function(err){ toast('שגיאה: ' + err.message); });
}
function closeAreaConversation(instructionId, branchEmail){
  if(!isRealAreaManager()) return;
  document.getElementById('modal-body').innerHTML = `
    <h3>לסגור את השיחה?</h3>
    <p style="font-size:13.5px;color:var(--text-secondary);">לאחר סגירת השיחה הסניף לא יוכל לשלוח תגובות נוספות.</p>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">ביטול</button>
      <button class="btn-confirm" onclick="doCloseAreaConversation('${instructionId}','${branchEmail}')">🔒 סגירת שיחה</button>
    </div>
  `;
  document.getElementById('modal-overlay').classList.add('open');
}
function doCloseAreaConversation(instructionId, branchEmail){
  if(previewMode){ toast('פעולה לא זמינה במצב תצוגה'); return; }
  const id = safeConvId(instructionId, branchEmail);
  db.collection('areaInstructionConfirmations').doc(id).set({
    instructionId, branchEmail,
    areaManagerEmail: currentUserEmail,
    conversationStatus: 'closed',
    closedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, {merge:true}).then(function(){
    closeModal();
    toast('השיחה נסגרה');
    renderContent();
  }).catch(function(err){ toast('שגיאה: ' + err.message); });
}
/* פתיחת שיחה סגורה מחדש - רק מנהל האזור, בלי אישור נוסף (פעולה הפיכה,
   לא הרסנית כמו סגירה). עובד גם על שיחות ישנות (סטטוס משוער מ-note) כי
   הכתיבה קובעת שדה conversationStatus מפורש שגובר על ההשערה. */
function reopenAreaConversation(instructionId, branchEmail){
  if(!isRealAreaManager()) return;
  if(previewMode){ toast('פעולה לא זמינה במצב תצוגה'); return; }
  const id = safeConvId(instructionId, branchEmail);
  db.collection('areaInstructionConfirmations').doc(id).set({
    instructionId, branchEmail,
    areaManagerEmail: currentUserEmail,
    conversationStatus: 'open'
  }, {merge:true}).then(function(){
    toast('השיחה נפתחה מחדש');
    renderContent();
  }).catch(function(err){ toast('שגיאה: ' + err.message); });
}
function markConversationRead(instructionId, branchEmail, viewerRole){
  const conv = getAreaConversation(instructionId, branchEmail);
  const count = (conv && conv.messages) ? conv.messages.length : 0;
  const field = viewerRole==='branch' ? 'branchReadCount' : 'areaReadCount';
  if(conv && (conv[field]||0) >= count) return;
  if(!conv && count===0) return; // אין עדיין מסמך ואין מה לסמן כנקרא - לא ליצור מסמך ריק לשווא
  const id = safeConvId(instructionId, branchEmail);
  const update = { instructionId, branchEmail };
  if(viewerRole==='area') update.areaManagerEmail = currentUserEmail;
  update[field] = count;
  db.collection('areaInstructionConfirmations').doc(id).set(update, {merge:true}).catch(function(){});
}
function openConversationThread(instructionId, branchEmail, viewerRole){
  ui.conversationOpenKey = instructionId + '__' + branchEmail;
  markConversationRead(instructionId, branchEmail, viewerRole);
  renderContent();
  renderNav();
}
function closeConversationThread(){
  ui.conversationOpenKey = null;
  renderContent();
}
/* רינדור משותף לשיחה בודדת — משמש גם למסך הסניף וגם למסך מנהל האזור. */
function renderConversationThreadHtml(instr, conv, viewerRole){
  const status = conversationStatusOf(conv);
  const messages = buildConversationMessages(instr, conv);
  const branchEmail = viewerRole==='branch' ? session.branchInfo.email : (conv ? conv.branchEmail : '');
  const branchName = viewerRole==='branch' ? session.branchName : ((conv && conv.branchName) || (BRANCH_DIRECTORY.find(b=>b.email===branchEmail)||{}).name || branchEmail);
  const acked = !!(conv && conv.confirmedAt);
  const areaLabel = (AREA_MANAGER_INFO[instr.areaManagerEmail]||{}).label || 'מנהל האזור';
  return `
    <div class="page-head">
      <button class="link-btn" onclick="closeConversationThread()">→ חזרה לרשימת השיחות</button>
      <h1 style="margin-top:8px;">${instr.title}</h1>
      <p>${viewerRole==='area' ? `מול ${branchName}` : `מול מנהל האזור שלכם`} · <span style="${status==='open'?'color:var(--good,#0ca30c);':'color:var(--muted);'}">${status==='open'?'🟢 שיחה פתוחה':'🔒 שיחה סגורה'}</span></p>
    </div>
    <div class="card">
      ${viewerRole==='branch' ? `
        <div style="margin-bottom:12px;">
          ${acked ? `<span style="font-size:13px;color:var(--good,#0ca30c);">✓ התקבל ואושר</span>` : `<button class="btn-confirm" onclick="ackConversation('${instr.id}','${session.branchInfo.email}','${instr.areaManagerEmail}')">✓ קראתי ואישרתי קבלה</button>`}
        </div>
      ` : ''}
      <div class="aconv-thread">
        ${messages.map(function(m){
          const mine = m.senderRole===viewerRole;
          let seenHtml = '';
          if(mine && m.idx>=0 && conv){
            const otherReadCount = viewerRole==='branch' ? (conv.areaReadCount||0) : (conv.branchReadCount||0);
            if(otherReadCount > m.idx) seenHtml = ' · 👁 נצפה';
          }
          return `
            <div class="aconv-msg ${m.senderRole==='area'?'from-area':'from-branch'}">
              <div>${m.body}</div>
              <div class="aconv-msg-meta">${m.senderRole==='area' ? areaLabel : (m.senderLabel||branchName||'')} · ${m.createdAtLabel||''}${seenHtml}</div>
            </div>
          `;
        }).join('')}
      </div>
      ${status==='open' ? `
        <div class="aconv-input-row">
          <input type="text" id="aconv-input-${instr.id}" placeholder="כתבו הודעה...">
          <button class="btn-confirm" onclick="sendConversationMessage('${instr.id}','${branchEmail}','${instr.areaManagerEmail}','${viewerRole}','${viewerRole==='branch'?(session.branchName||''):areaLabel}', document.getElementById('aconv-input-${instr.id}').value)">שליחה</button>
        </div>
        ${viewerRole==='area' ? `<button class="link-btn" style="margin-top:10px;" onclick="closeAreaConversation('${instr.id}','${branchEmail}')">🔒 סגירת שיחה</button>` : ''}
      ` : `
        <div class="aconv-closed-banner">
          🔒 השיחה נסגרה על ידי מנהל האזור<br>ניתן לצפות בהתכתבות, אך לא ניתן לשלוח תגובות נוספות.
        </div>
        ${viewerRole==='area' ? `<button class="btn-secondary" style="margin-top:10px;width:100%;" onclick="reopenAreaConversation('${instr.id}','${branchEmail}')">🔓 פתיחת השיחה מחדש</button>` : ''}
      `}
    </div>
  `;
}
/* מסך הסניף: רשימת שיחות עם מנהל האזור + פירוט שיחה בודדת. */
function viewBranchConversations(){
  const myEmail = session.branchInfo ? session.branchInfo.email : null;
  if(ui.conversationOpenKey){
    const parts = ui.conversationOpenKey.split('__');
    const instrId = parts[0];
    const instr = (appData.areaInstructions||[]).find(function(i){return i.id===instrId;});
    if(instr) return renderConversationThreadHtml(instr, getAreaConversation(instrId, myEmail), 'branch');
    ui.conversationOpenKey = null;
  }
  const list = (appData.areaInstructions||[])
    .filter(function(instr){ return (instr.targetBranchEmails||[]).indexOf(myEmail)!==-1; })
    .map(function(instr){
      const conv = getAreaConversation(instr.id, myEmail);
      return { instr, conv, status: conversationStatusOf(conv), unread: !conv || conversationUnreadFor(conv,'branch') };
    })
    .sort(function(a,b){
      const rank = function(x){ return x.unread ? 0 : (x.status==='open' ? 1 : 2); };
      const rd = rank(a)-rank(b);
      if(rd!==0) return rd;
      const ta = a.instr.createdAt && a.instr.createdAt.seconds ? a.instr.createdAt.seconds : 0;
      const tb = b.instr.createdAt && b.instr.createdAt.seconds ? b.instr.createdAt.seconds : 0;
      return tb-ta;
    });
  return `
    <div class="page-head">
      <h1>שיחות עם מנהל האזור</h1>
      <p>הודעות ועדכונים פרטיים מהאזור שלכם בלבד — לא נראים לסניפים אחרים.</p>
    </div>
    ${list.length ? list.map(function(row){
      const msgCount = (row.conv && row.conv.messages) ? row.conv.messages.length : 0;
      return `
        <div class="card aconv-list-card" onclick="openConversationThread('${row.instr.id}','${myEmail}','branch')">
          <div class="aconv-list-top">
            <div class="aconv-list-title">${row.unread?'<span class="aconv-unread-dot"></span>':''}${row.instr.title}</div>
            <span class="aconv-list-status ${row.status}">${row.status==='open'?'🟢 פתוחה':'🔒 סגורה'}</span>
          </div>
          <div class="aconv-list-meta">
            <span>${row.conv && row.conv.confirmedAt ? '✓ אישרתם קבלה' : 'טרם אושר'}</span>
            <span>💬 ${msgCount ? msgCount+' תגובות' : 'אין תגובות'}</span>
          </div>
        </div>
      `;
    }).join('') : `<div class="card"><div class="empty-state">אין כרגע שיחות עם מנהל האזור שלכם.</div></div>`}
  `;
}
/* מסך מנהל האזור: יצירת עדכון חדש + מעקב שיחות פרטיות לכל סניף יעד. */
function viewAreaManagerConversations(){
  if(ui.conversationOpenKey){
    const parts = ui.conversationOpenKey.split('__');
    const instr = (appData.areaInstructions||[]).find(function(i){return i.id===parts[0];});
    if(instr) return renderConversationThreadHtml(instr, getAreaConversation(parts[0], parts[1]), 'area');
    ui.conversationOpenKey = null;
  }
  const areaBranches = BRANCH_DIRECTORY.filter(function(b){return b.area===session.areaLabel;});
  const list = [...(appData.areaInstructions||[])].sort(function(a,b){
    const ta = a.createdAt && a.createdAt.seconds ? a.createdAt.seconds : 0;
    const tb = b.createdAt && b.createdAt.seconds ? b.createdAt.seconds : 0;
    return tb - ta;
  });
  return `
    <div class="page-head">
      <h1>עדכונים לסניפים שלי</h1>
      <p>הודעות פרטיות לסניפים באזור שלכם בלבד — לא נראות לאזורים אחרים.</p>
    </div>
    <button class="btn-add" style="margin-bottom:14px;" onclick="openNewAreaInstructionForm()">+ שליחת עדכון</button>
    ${list.length ? list.map(function(instr){
      const targets = instr.targetBranchEmails||[];
      const rows = targets.map(function(email){
        const conv = getAreaConversation(instr.id, email);
        return { email, conv, status: conversationStatusOf(conv), unread: conversationUnreadFor(conv,'area') };
      });
      const ackedCount = rows.filter(function(r){return r.conv && r.conv.confirmedAt;}).length;
      const repliedCount = rows.filter(function(r){return r.conv && r.conv.messages && r.conv.messages.length;}).length;
      const openCount = rows.filter(function(r){return r.status==='open';}).length;
      const pct = targets.length ? Math.round(ackedCount/targets.length*100) : 0;
      const scopeLabel = instr.targetScope==='specific'
        ? (areaBranches.find(function(b){return b.email===targets[0];})||{}).name || 'סניף ספציפי'
        : instr.targetScope==='multi'
        ? `${targets.length} סניפים נבחרים`
        : `כל הסניפים שלי (${targets.length})`;
      return `
        <div class="card" style="margin-bottom:12px;">
          <div style="font-weight:500;font-size:15px;margin-bottom:4px;">${instr.title}</div>
          <div style="font-size:12px;color:var(--muted);margin-bottom:6px;">יעד: ${scopeLabel}</div>
          ${instr.body ? `<div style="font-size:13.5px;color:var(--text-secondary);margin-bottom:10px;white-space:pre-wrap;">${instr.body}</div>` : ''}
          <div style="font-size:12.5px;color:var(--text-secondary);margin-bottom:6px;">
            נשלח ל-${targets.length} סניפים · ✓ ${ackedCount} אישרו · ⏳ ${targets.length-ackedCount} טרם אישרו · 💬 ${repliedCount} הגיבו · 🟢 ${openCount} שיחות פתוחות
          </div>
          <div class="comp-progress-track" style="margin-bottom:10px;"><div class="comp-progress-fill ${pct>=100?'full':''}" style="width:${pct}%"></div></div>
          <div>
            ${rows.map(function(r){
              const b = areaBranches.find(function(x){return x.email===r.email;});
              const msgCount = (r.conv && r.conv.messages) ? r.conv.messages.length : 0;
              return `
                <div class="aconv-branch-row" onclick="openConversationThread('${instr.id}','${r.email}','area')">
                  <span>${r.unread?'<span class="aconv-unread-dot"></span>':''}${b ? b.name : r.email}</span>
                  <span style="color:${r.conv && r.conv.confirmedAt ?'var(--good,#0ca30c)':'var(--muted)'};">
                    ${r.conv && r.conv.confirmedAt ? '✓ אישר' : 'טרם אישר'} · 💬 ${msgCount||'אין תגובה'} · ${r.status==='open'?'🟢 פתוח':'🔒 סגור'}
                  </span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }).join('') : `<div class="card"><div class="empty-state">עדיין לא נשלחו עדכונים. לחצו על "+ שליחת עדכון" כדי להתחיל.</div></div>`}
  `;
}
