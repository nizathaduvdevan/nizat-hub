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
