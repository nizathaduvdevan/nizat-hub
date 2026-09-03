/* ---------- Comments / feedback ---------- */
function getComments(itemType, itemId){
  return appData.comments.filter(c=>c.itemType===itemType && c.itemId==itemId);
}
function findItemTitle(itemType, itemId){
  if(itemType==='competitionGroup'){
    const [compId, groupNum] = itemId.split('::');
    const comp = appData.competitions.find(x=>x.id==compId);
    return comp ? `${comp.title} · קבוצה ${groupNum}` : '(פריט נמחק)';
  }
  const src = itemType==='instruction' ? appData.instructions : appData.competitions;
  const item = src.find(x=>x.id==itemId);
  return item ? item.title : '(פריט נמחק)';
}
/* המחלקה שאליה שייך פריט תוכן — לצורך ניתוב שאלות למחלקה הנכונה.
   נופל חזרה ל'marketing' לכל תוכן קיים שאין עליו שדה department. */
function itemDepartmentByRef(itemType, itemId){
  if(itemType==='competitionGroup'){
    const [compId] = itemId.split('::');
    return itemDepartment(appData.competitions.find(x=>x.id==compId));
  }
  const src = itemType==='instruction' ? appData.instructions : appData.competitions;
  return itemDepartment(src.find(x=>x.id==itemId));
}
/* מזהה שולח אחיד להודעות פרטיות — עובד גם לסניף וגם למנהל אזור
   (בעבר תמך רק בסניפים, כי session.branchName הוא null עבור מנהלי אזור). */
function currentSenderName(){
  if(session.role==='branch') return session.branchName;
  if(session.role==='area') return session.areaLabel;
  return null;
}
function commentsBox(itemType, itemId, forceOpen){
  const list = getComments(itemType, itemId);
  const boxId = `comments-${itemType}-${itemId}`;
  const mySender = currentSenderName();
  const myPrivate = mySender
    ? appData.privateMessages.filter(m=>m.itemType===itemType && m.itemId===itemId && m.branchName===mySender && !m.deletedForBranch)
    : [];
  return `
    <div class="comments-box" id="cbox-${boxId}" onclick="event.stopPropagation()">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <button class="comments-toggle" onclick="toggleComments('${itemType}','${itemId}')">
          💬 משוב ותגובות (${list.length}${myPrivate.length ? ' · '+myPrivate.length+' 🔒' : ''}) <span id="ct-arrow-${boxId}">${forceOpen?'▴':'▾'}</span>
        </button>
        ${session.role!=='marketing' ? `<button class="comments-toggle" style="flex:none;" onclick="openPrivateMessageModal('${itemType}','${itemId}')">🔒 שאלה לשיווק</button>` : ''}
      </div>
      <div class="comments-list ${forceOpen?'open':''}" id="ct-${boxId}">
        ${myPrivate.map(m=>`
          <div class="comment-row private">
            <div class="comment-avatar">🔒</div>
            <div class="comment-body">
              <div class="comment-name">הודעה פרטית ל${MARKETING_CONTACT_NAME} <span class="comment-private-badge">פרטי</span></div>
              <div class="comment-text">${m.text}</div>
              <div class="comment-date">${m.date}</div>
              ${m.replies.map(r=>`
                <div class="comment-reply">
                  <div class="rn">${r.from==='marketing' ? MARKETING_CONTACT_NAME+' · מחלקת שיווק' : session.branchName}</div>
                  <div>${r.text}</div>
                  <div class="comment-date">${r.date}</div>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}
        ${list.map(c=>{
          const canManage = session.role==='marketing' || (currentUserEmail && c.authorEmail===currentUserEmail);
          return `
          <div class="comment-row">
            <div class="comment-avatar">${(c.branchName||'').replace('סניף ','').slice(0,2)}</div>
            <div class="comment-body">
              <div class="comment-name">${c.branchName}${c.edited ? ' <span style="color:var(--muted);font-weight:400;font-size:11px;">(נערך)</span>' : ''}</div>
              <div class="comment-text" id="comment-text-${c.id}">${c.text}</div>
              <div class="comment-date">${c.date}</div>
            </div>
            ${canManage ? `
            <div style="display:flex;gap:4px;">
              <button class="icon-btn" title="עריכה" onclick="event.stopPropagation();openEditCommentModal('${itemType}','${itemId}','${c.id}')">✎</button>
              <button class="icon-btn danger" title="מחיקה" onclick="event.stopPropagation();confirmDeleteComment('${itemType}','${itemId}','${c.id}')">🗑</button>
            </div>` : ''}
          </div>
        `;}).join('') || (myPrivate.length ? '' : '<div class="empty-state" style="padding:14px 0;">אין עדיין תגובות. היו הראשונים להגיב!</div>')}
        <div class="comment-form" onclick="event.stopPropagation()">
          <input type="text" id="comment-input-${boxId}" placeholder="כתבו תגובה ציבורית שכל הסניפים יראו…">
          <div class="comment-form-actions">
            <button class="comment-send" onclick="submitComment('${itemType}','${itemId}','${boxId}')">💬 שליחת תגובה ציבורית</button>
          </div>
        </div>
        ${(session.role==='branch' || session.role==='area') ? `
        <div class="comment-form-hint" style="margin-top:10px;padding-top:10px;border-top:1px solid var(--gridline);">
          יש לכם משהו שרוצים לומר רק ל${MARKETING_CONTACT_NAME}, בלי שסניפים אחרים יראו?
          <button class="comment-send-private" style="margin-inline-start:6px;" onclick="openPrivateMessageModal('${itemType}','${itemId}')">🔒 שליחת הודעה פרטית ל${MARKETING_CONTACT_NAME}</button>
        </div>` : ''}
      </div>
    </div>
  `;
}
function toggleComments(itemType, itemId){
  const boxId = `comments-${itemType}-${itemId}`;
  const el = document.getElementById('ct-'+boxId);
  const arrow = document.getElementById('ct-arrow-'+boxId);
  el.classList.toggle('open');
  arrow.textContent = el.classList.contains('open') ? '▴' : '▾';
}
function submitComment(itemType, itemId, boxId){
  if(previewMode){ toast('פעולה לא זמינה במצב תצוגה'); return; }
  const input = document.getElementById('comment-input-'+boxId);
  const text = input.value.trim();
  if(!text){ toast('נא לכתוב תוכן לפני השליחה'); input.focus(); return; }
  const commentObj = {
    itemType, itemId,
    branchName: session.role==='marketing' ? 'מחלקת שיווק' : (session.role==='area' ? `מנהל אזור · ${session.areaLabel}` : session.branchName),
    authorEmail: currentUserEmail || '',
    text,
    date: todayHeb()
  };
  if(firebaseReady){
    input.value = '';
    commentObj.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    db.collection('comments').add(commentObj)
      .then(()=>toast('התגובה נשלחה בהצלחה'))
      .catch(err=>toast('שגיאה בשליחת התגובה: '+err.message));
    return;
  }
  commentObj.id = nextIds.comments++;
  appData.comments.push(commentObj);
  const wrap = document.getElementById('cbox-'+boxId);
  if(wrap){ wrap.outerHTML = commentsBox(itemType, itemId, true); } else { renderContent(); }
  toast('התגובה נשלחה בהצלחה');
}
function openEditCommentModal(itemType, itemId, commentId){
  const c = appData.comments.find(x=>x.id==commentId);
  if(!c) return;
  document.getElementById('modal-body').innerHTML = `
    <h3>עריכת תגובה</h3>
    <div class="field">
      <label>תוכן התגובה</label>
      <textarea id="edit-comment-text" rows="4">${c.text}</textarea>
    </div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">ביטול</button>
      <button class="btn-confirm" onclick="submitEditComment('${itemType}','${itemId}','${commentId}')">שמירת שינויים</button>
    </div>
  `;
  document.getElementById('modal-overlay').classList.add('open');
}
function submitEditComment(itemType, itemId, commentId){
  const input = document.getElementById('edit-comment-text');
  const text = input.value.trim();
  if(!text){ toast('נא לכתוב תוכן לפני השמירה'); input.focus(); return; }
  closeModal();
  if(firebaseReady){
    db.collection('comments').doc(commentId).update({text, edited:true})
      .then(()=>toast('התגובה עודכנה בהצלחה'))
      .catch(err=>toast('שגיאה בעדכון התגובה: '+err.message));
    return;
  }
  const c = appData.comments.find(x=>x.id==commentId);
  if(c){ c.text = text; c.edited = true; }
  renderContent();
  toast('התגובה עודכנה בהצלחה');
}
let pendingDeleteComment = null;
function confirmDeleteComment(itemType, itemId, commentId){
  pendingDeleteComment = {itemType, itemId, commentId};
  document.getElementById('modal-body').innerHTML = `
    <h3>מחיקת תגובה</h3>
    <p style="font-size:13.5px;color:var(--text-secondary);line-height:1.6;">האם למחוק את התגובה? הפעולה תשפיע מיידית על התצוגה בכל הסניפים.</p>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">ביטול</button>
      <button class="btn-confirm btn-danger" onclick="doDeleteComment()">מחיקה</button>
    </div>
  `;
  document.getElementById('modal-overlay').classList.add('open');
}
function doDeleteComment(){
  const {itemType, itemId, commentId} = pendingDeleteComment;
  closeModal();
  if(firebaseReady){
    db.collection('comments').doc(commentId).delete()
      .then(()=>toast('התגובה נמחקה'))
      .catch(err=>toast('שגיאה במחיקת התגובה: '+err.message));
    return;
  }
  appData.comments = appData.comments.filter(x=>x.id!=commentId);
  renderContent();
  toast('התגובה נמחקה');
}
function buildMailtoForMessage(itemTitle, branchName, text){
  const subject = itemTitle || 'הודעה מה-HUB';
  const body = `שם הסניף ממנו נשלחה ההודעה: ${branchName}\n\nתוכן ההודעה:\n${text}`;
  return `mailto:${MARKETING_CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
function openMailDraft(mailtoUrl){
  // Uses a throwaway <a> click (rather than window.location) since it behaves more
  // consistently across browsers/embedded previews for handing off to a mailto: handler.
  // This can only OPEN a pre-filled compose window — it never sends anything by itself,
  // and if the browser/device has no mail client configured, nothing visible will happen here
  // (the in-app save above still succeeded regardless).
  try{
    const a = document.createElement('a');
    a.href = mailtoUrl;
    a.style.position = 'fixed';
    a.style.opacity = '0';
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>a.remove(), 0);
  }catch(e){
    console.warn('פתיחת טיוטת המייל נכשלה (ייתכן שאין תוכנת מייל מוגדרת בדפדפן/במכשיר):', e);
  }
}
/* ---------- הודעה פרטית — חלון ייעודי נפרד לגמרי מתיבת התגובה הציבורית ----------
   כדי שלא יהיה שום סיכוי שהודעה שנועדה רק למחלקת השיווק "תיפול בטעות" לקיר
   הציבורי, השליחה נעשית דרך מודל (modal) עצמאי עם שדה טקסט וכפתור שליחה משלו,
   ולא דרך אותה תיבת קלט המשמשת גם לתגובה הציבורית. */
function openPrivateMessageModal(itemType, itemId){
  const itemTitle = findItemTitle(itemType, itemId);
  document.getElementById('modal-body').innerHTML = `
    <h3>🔒 הודעה פרטית ל${MARKETING_CONTACT_NAME}</h3>
    <p style="font-size:13px;color:var(--text-secondary);margin:0 0 12px;">
      בנוגע ל"${itemTitle}". ההודעה תוצג רק ל${MARKETING_CONTACT_NAME} (מחלקת שיווק) — לא לסניפים אחרים.
    </p>
    <div class="field">
      <label>תוכן ההודעה</label>
      <textarea id="private-msg-text" rows="5" placeholder="כתבו כאן את ההודעה הפרטית שלכם…"></textarea>
    </div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">ביטול</button>
      <button class="btn-confirm" onclick="submitPrivateMessageFromModal('${itemType}','${itemId}')">🔒 שליחת הודעה פרטית</button>
    </div>
  `;
  document.getElementById('modal-overlay').classList.add('open');
}
function submitPrivateMessageFromModal(itemType, itemId){
  if(previewMode){ toast('פעולה לא זמינה במצב תצוגה'); return; }
  const input = document.getElementById('private-msg-text');
  const text = input.value.trim();
  if(!text){ toast('נא לכתוב תוכן לפני השליחה'); input.focus(); return; }
  const itemTitle = findItemTitle(itemType, itemId);
  /* נמען מחלקתי: השאלה מנותבת למחלקה שמחזיקה את הפריט שעליו שואלים. כל התוכן
     הקיים הוא של שיווק, ולכן היום כל ההודעות ממשיכות להגיע לענבר בדיוק כמו
     קודם — אבל כשתפעול או רכש יפרסמו תוכן, השאלות עליו ינותבו אליהם. */
  const toDepartment = itemDepartmentByRef(itemType, itemId);
  const msgObj = {
    itemType, itemId, itemTitle,
    toDepartment,
    branchName: currentSenderName(),
    branchEmail: session.branchInfo ? session.branchInfo.email : '',
    senderRole: session.role,
    text,
    date: todayHeb(),
    replies: [],
    unreadForMarketing: true,
    unreadForBranch: false,
    deletedForBranch: false,
    deletedForMarketing: false
  };
  closeModal();
  if(firebaseReady){
    msgObj.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    db.collection('privateMessages').add(msgObj)
      .then(()=>{
        toast(`ההודעה נשלחה בהצלחה ל${MARKETING_CONTACT_NAME} · נשלח גם מייל אוטומטי`);
        sendPrivateMessageEmail(currentSenderName(), itemTitle, text);
      })
      .catch(err=>toast('שגיאה בשליחת ההודעה: '+err.message));
    return;
  }
  msgObj.id = nextIds.privateMessages++;
  appData.privateMessages.push(msgObj);
  addNotification({
    id: Date.now(),
    title: 'התקבלה הודעה פרטית חדשה',
    body: `${currentSenderName()} · ${itemTitle}: ${text.slice(0,60)}${text.length>60?'…':''}`,
    date: todayHeb(), type:'message', read:false
  });
  renderContent();
  renderNotifPanel();
  toast(`ההודעה נשלחה בהצלחה ל${MARKETING_CONTACT_NAME} · נשלח גם מייל אוטומטי`);
  sendPrivateMessageEmail(currentSenderName(), itemTitle, text);
}

/* ---------- Private messages inbox ("ההודעות שלי") ---------- */
function viewMessages(){
  if(session.role==='marketing'){
    /* כל מחלקה רואה רק הודעות שמופנות אליה (toDepartment) — הודעה שנוצרה
       לפני שהמנגנון הזה נבנה תיפול תמיד ל-marketing (ברירת המחדל). */
    const list = [...appData.privateMessages]
      .filter(m=>!m.deletedForMarketing && canManageDepartment(m.toDepartment))
      .sort((a,b)=>parseHebDate(b.date)-parseHebDate(a.date));
    list.forEach(m=>{
      if(m.unreadForMarketing){
        m.unreadForMarketing=false;
        if(firebaseReady) db.collection('privateMessages').doc(m.id).update({unreadForMarketing:false}).catch(()=>{});
      }
    });
    return `
      <div class="page-head">
        <h1>הודעות פרטיות מהסניפים</h1>
        <p>${getText('messages_desc_marketing')}</p>
      </div>
      <div class="card">
        ${list.map(m=>messageThreadHtml(m)).join('') || '<div class="empty-state">אין עדיין הודעות פרטיות מהסניפים.</div>'}
      </div>
    `;
  }
  const mySender = currentSenderName();
  const list = appData.privateMessages.filter(m=>m.branchName===mySender && !m.deletedForBranch).sort((a,b)=>parseHebDate(b.date)-parseHebDate(a.date));
  list.forEach(m=>{
    if(m.unreadForBranch){
      m.unreadForBranch=false;
      if(firebaseReady) db.collection('privateMessages').doc(m.id).update({unreadForBranch:false}).catch(()=>{});
    }
  });
  return `
    <div class="page-head">
      <h1>ההודעות שלי</h1>
      <p>${getText('messages_desc_branch')}</p>
    </div>
    <div class="card">
      ${list.map(m=>messageThreadHtml(m)).join('') || `<div class="empty-state">עדיין לא שלחתם הודעה פרטית. ניתן לשלוח הודעה פרטית ל${MARKETING_CONTACT_NAME} ישירות מתוך "משוב ותגובות" בכל תחרות או הוראה.</div>`}
    </div>
  `;
}
function messageThreadHtml(m){
  const boxId = `msg-${m.id}`;
  return `
    <div class="admin-row" style="flex-direction:column;align-items:stretch;gap:8px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:6px;">
        <div class="admin-row-main">
          <div class="t">${session.role==='marketing' ? m.branchName : m.itemTitle}</div>
          <div class="m">${session.role==='marketing' ? m.itemTitle+' · ' : ''}${m.date}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <span class="badge cat">${m.itemType==='instruction' ? 'הוראה' : 'תחרות'}</span>
          <button class="icon-btn danger" title="מחיקת השיחה" onclick="event.stopPropagation();confirmDeleteMessageThread('${m.id}')">🗑</button>
        </div>
      </div>
      <div class="comment-text" style="font-size:13px;">${m.text}</div>
      ${m.replies.map(r=>`
        <div class="comment-reply">
          <div class="rn">${r.from==='marketing' ? MARKETING_CONTACT_NAME+' · מחלקת שיווק' : m.branchName}</div>
          <div>${r.text}</div>
          <div class="comment-date">${r.date}</div>
        </div>
      `).join('')}
      <div class="comment-form" onclick="event.stopPropagation()">
        <input type="text" id="reply-input-${boxId}" placeholder="${session.role==='marketing' ? 'כתבו תשובה לסניף…' : 'כתבו הודעת המשך…'}">
        <div class="comment-form-actions">
          <button class="comment-send" onclick="submitMessageReply('${m.id}','${boxId}')">שליחת תשובה</button>
        </div>
      </div>
    </div>
  `;
}
let pendingDeleteMessageThread = null;
function confirmDeleteMessageThread(msgId){
  pendingDeleteMessageThread = msgId;
  document.getElementById('modal-body').innerHTML = `
    <h3>מחיקת שיחה</h3>
    <p style="font-size:13.5px;color:var(--text-secondary);line-height:1.6;">השיחה תוסר מהתצוגה שלכם בלבד — הצד השני עדיין יראה אותה, אלא אם גם הוא ימחק אותה מצדו.</p>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">ביטול</button>
      <button class="btn-confirm btn-danger" onclick="doDeleteMessageThread()">מחיקה</button>
    </div>
  `;
  document.getElementById('modal-overlay').classList.add('open');
}
function doDeleteMessageThread(){
  const msgId = pendingDeleteMessageThread;
  closeModal();
  const m = appData.privateMessages.find(x=>x.id==msgId);
  const iAmMarketing = session.role==='marketing';
  const otherSideAlreadyDeleted = m && (iAmMarketing ? m.deletedForBranch : m.deletedForMarketing);
  if(firebaseReady){
    if(otherSideAlreadyDeleted){
      db.collection('privateMessages').doc(msgId).delete()
        .then(()=>toast('השיחה נמחקה'))
        .catch(err=>toast('שגיאה במחיקת השיחה: '+err.message));
    } else {
      const field = iAmMarketing ? 'deletedForMarketing' : 'deletedForBranch';
      db.collection('privateMessages').doc(msgId).update({[field]: true})
        .then(()=>toast('השיחה נמחקה מהתצוגה שלכם'))
        .catch(err=>toast('שגיאה במחיקת השיחה: '+err.message));
    }
    return;
  }
  if(m){
    if(otherSideAlreadyDeleted){
      appData.privateMessages = appData.privateMessages.filter(x=>x.id!=msgId);
    } else {
      if(iAmMarketing) m.deletedForMarketing = true; else m.deletedForBranch = true;
    }
  }
  renderContent();
  toast('השיחה נמחקה מהתצוגה שלכם');
}
function submitMessageReply(msgId, boxId){
  const input = document.getElementById('reply-input-'+boxId);
  const text = input.value.trim();
  if(!text){ toast('נא לכתוב תוכן לפני השליחה'); input.focus(); return; }
  const m = appData.privateMessages.find(x=>x.id==msgId);
  if(!m) return;
  const from = session.role==='marketing' ? 'marketing' : 'branch';
  const reply = {from, text, date: todayHeb()};
  input.value = '';
  if(firebaseReady){
    const update = { replies: firebase.firestore.FieldValue.arrayUnion(reply) };
    if(from==='marketing') update.unreadForBranch = true; else update.unreadForMarketing = true;
    db.collection('privateMessages').doc(msgId).update(update)
      .then(()=>toast('התשובה נשלחה בהצלחה'))
      .catch(err=>toast('שגיאה בשליחת התשובה: '+err.message));
    return;
  }
  m.replies.push(reply);
  if(from==='marketing'){ m.unreadForBranch = true; }
  else { m.unreadForMarketing = true; }
  addNotification({
    id: Date.now(),
    title: from==='marketing' ? `${MARKETING_CONTACT_NAME} השיבה להודעה שלכם` : 'התקבלה תגובה חדשה מסניף',
    body: from==='marketing' ? `בנוגע ל"${m.itemTitle}": ${text.slice(0,60)}${text.length>60?'…':''}` : `${m.branchName}: ${text.slice(0,60)}${text.length>60?'…':''}`,
    date: todayHeb(), type:'message', read:false
  });
  renderContent();
  renderNotifPanel();
  toast('התשובה נשלחה בהצלחה');
}

