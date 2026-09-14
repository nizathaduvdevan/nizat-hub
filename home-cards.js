/* ---------- כרטיסי מסך הבית (בין ברכת הפתיחה ל"חדש עבורכם") ---------- */
function branchConversationSignals(){
  if(!session.branchInfo) return {unreadCount:0, openCount:0, total:0};
  const myEmail = session.branchInfo.email;
  const targeted = (appData.areaInstructions||[]).filter(function(instr){ return (instr.targetBranchEmails||[]).indexOf(myEmail)!==-1; });
  let unreadCount=0, openCount=0;
  targeted.forEach(function(instr){
    const conv = getAreaConversation(instr.id, myEmail);
    const status = conversationStatusOf(conv);
    if(status==='open') openCount++;
    if(!conv) unreadCount++;
    else if(conversationUnreadFor(conv,'branch')) unreadCount++;
  });
  return {unreadCount, openCount, total: targeted.length};
}
function renderBranchConversationsCard(){
  const sig = branchConversationSignals();
  let sub;
  if(sig.unreadCount>0) sub = 'הודעה חדשה ממנהל האזור';
  else if(sig.openCount>0) sub = `${sig.openCount} שיח${sig.openCount>1?'ות פתוחות':'ה פתוחה'}`;
  else sub = 'אין הודעות חדשות';
  return `
    <div class="aconv-home-card" onclick="ui.conversationOpenKey=null;goTo('areaConversations');">
      <div class="aconv-home-icon">💬</div>
      <div class="aconv-home-main">
        <div class="aconv-home-title">שיחות עם מנהל האזור</div>
        <div class="aconv-home-sub ${sig.unreadCount>0?'new':''}">${sub}</div>
      </div>
      ${sig.unreadCount>0 ? `<span class="aconv-home-badge">${sig.unreadCount}</span>` : ''}
      <span class="aconv-home-arrow">›</span>
    </div>
  `;
}
function areaConversationSignals(){
  const targeted = (appData.areaInstructions||[]).filter(function(instr){ return instr.areaManagerEmail===currentUserEmail; });
  let unreadCount=0;
  targeted.forEach(function(instr){
    (instr.targetBranchEmails||[]).forEach(function(email){
      const conv = getAreaConversation(instr.id, email);
      if(conversationUnreadFor(conv,'area')) unreadCount++;
    });
  });
  return {unreadCount, total: targeted.length};
}
function renderAreaManagerConversationsCard(){
  const sig = areaConversationSignals();
  return `
    <div class="aconv-home-card" onclick="ui.conversationOpenKey=null;goTo('sendAreaConversations');">
      <div class="aconv-home-icon">💬</div>
      <div class="aconv-home-main">
        <div class="aconv-home-title">עדכונים לסניפים שלי</div>
        <div class="aconv-home-sub ${sig.unreadCount>0?'new':''}">${sig.unreadCount>0 ? `${sig.unreadCount} תגוב${sig.unreadCount>1?'ות':'ה'} חדשה ממתינה לקריאה` : 'שליחת עדכון לכל הסניפים באזור או לסניף מסוים'}</div>
      </div>
      ${sig.unreadCount>0 ? `<span class="aconv-home-badge">${sig.unreadCount}</span>` : ''}
      <button class="btn-add" style="flex:none;" onclick="event.stopPropagation();openNewAreaInstructionForm()">+ שליחת עדכון</button>
    </div>
  `;
}
/* ---------- מודאל "שירות לקוחות" — כפתור בגריד "הכלים שלי" במסך הבית של הסניפים ----------
   פותח מודאל קצר עם שלוש דרכי פנייה: וואטסאפ, שיחת טלפון ומייל. משתמש
   במנגנון המודאל הקיים (modal-overlay/modal-body, ר' materials.js/admin.js)
   ובמחלקת dtc-item הקיימת (ר' main.css) לשורת פעולה עם אייקון וחץ, כדי
   לא להוסיף CSS חדש. */
function openCustomerServiceModal(){
  const branchName = (session.branchInfo && session.branchName) ? session.branchName : '';
  const greeting = branchName ? `שלום, פנייה לשירות הלקוחות מסניף ${branchName}` : 'שלום, פנייה לשירות הלקוחות';
  const waText = encodeURIComponent(greeting + ' - ');
  const mailSubject = encodeURIComponent(branchName ? `פנייה משירות הלקוחות - סניף ${branchName}` : 'פנייה משירות הלקוחות');
  const mailBody = encodeURIComponent(greeting + '\n\n');
  document.getElementById('modal-body').innerHTML = `
    <h3>שירות לקוחות</h3>
    <p style="font-size:13.5px;color:var(--text-secondary);line-height:1.6;margin:-8px 0 4px;">בחרו את הדרך הנוחה לכם לפנות</p>
    <div class="dtc-list">
      <a class="dtc-item" style="text-decoration:none;" href="https://wa.me/97225473584?text=${waText}" target="_blank" rel="noopener" onclick="closeModal()">
        <span class="dtc-icon">💬</span><span class="dtc-text">וואטסאפ</span>
        <span class="df-item-arrow" style="margin-inline-start:auto;">›</span>
      </a>
      <a class="dtc-item" style="text-decoration:none;" href="tel:025473584" onclick="closeModal()">
        <span class="dtc-icon">📞</span><span class="dtc-text">שיחת טלפון</span>
        <span class="df-item-arrow" style="margin-inline-start:auto;">›</span>
      </a>
      <a class="dtc-item" style="text-decoration:none;" href="mailto:service@nizat.co.il?subject=${mailSubject}&body=${mailBody}" onclick="closeModal()">
        <span class="dtc-icon">✉️</span><span class="dtc-text">מייל</span>
        <span class="df-item-arrow" style="margin-inline-start:auto;">›</span>
      </a>
    </div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">סגירה</button>
    </div>
  `;
  document.getElementById('modal-overlay').classList.add('open');
}
