/* ============================================================
   היומן שלי — כלי רוחבי עצמאי (לא חלק ממחלקת שיווק)
   ------------------------------------------------------------
   מאחד שלושה מקורות נתונים + חגים, בלי לגעת באף אחד מהם:
   - branchCalendarNotes (הורחב לכל תפקיד לפי ownerEmail) — אירועים אישיים.
   - areaCalendarEvents (קולקציה חדשה, נפרדת) — אירועים ששלח מנהל אזור
     לסניף אחד/מספר סניפים שבניהולו.
   - events (יומן השיווק הקיים, ללא שינוי) — מסונן כבר לפי isEventVisibleToViewer.
   - ISRAELI_HOLIDAYS — טבלה סטטית, לצפייה בלבד.
   כל אחד מהמקורות ממשיך להיכתב בדיוק כמו היום; כאן רק מאחדים לתצוגה אחת.
   ============================================================ */
const MYCAL_SOURCE_LABEL = {personal:'פרטי', area:'מנהל האזור', marketing:'שיווק', holiday:'חג'};
function getAllMyCalendarItems(){
  const items = [];
  (appData.branchCalendarNotes||[]).forEach(function(n){
    items.push({
      uid:'personal:'+n.id, source:'personal', id:n.id,
      title: n.title || n.text || '', desc: n.desc || '',
      date:n.date, endDate:null,
      allDay: n.allDay!==false, startTime:n.startTime||'', endTime:n.endTime||'',
      color: n.color || CALENDAR_NOTE_COLORS[0],
      canEdit:true, canDelete:true
    });
  });
  (appData.areaCalendarEvents||[]).forEach(function(ev){
    const mine = ev.areaManagerEmail===currentUserEmail;
    items.push({
      uid:'area:'+ev.id, source:'area', id:ev.id,
      title:ev.title, desc:ev.desc||'',
      date:ev.date, endDate:ev.endDate||null,
      allDay: !(ev.startTime||ev.endTime), startTime:ev.startTime||'', endTime:ev.endTime||'',
      color:'#CFE8CB',
      canEdit: mine, canDelete: mine,
      meta: (ev.targetBranchEmails||[]).length>1 ? `${(ev.targetBranchEmails||[]).length} סניפים` : ((BRANCH_DIRECTORY.find(function(b){return b.email===(ev.targetBranchEmails||[])[0];})||{}).name||'')
    });
  });
  (appData.events||[]).filter(isEventVisibleToViewer).forEach(function(ev){
    items.push({
      uid:'marketing:'+ev.id, source:'marketing', id:ev.id,
      title:ev.title, desc:ev.desc||'',
      date:ev.date, endDate:ev.endDate||null,
      allDay:true, startTime:'', endTime:'',
      color:'#DADADA',
      canEdit:false, canDelete:false,
      meta: ev.category||''
    });
  });
  ISRAELI_HOLIDAYS.forEach(function(h, idx){
    items.push({
      uid:'holiday:'+idx, source:'holiday', id:String(idx),
      title:h.title, desc:'',
      date:h.date, endDate:h.endDate||null,
      allDay:true, startTime:'', endTime:'',
      color:'#F6C9D6',
      canEdit:false, canDelete:false
    });
  });
  return items;
}
function myCalendarEventsByDay(items, year, month){
  const byDay = {};
  items.forEach(function(it){
    const startTs = parseHebDate(it.date);
    const endTs = it.endDate ? parseHebDate(it.endDate) : startTs;
    if(isNaN(startTs)) return;
    for(let t=startTs; t<=endTs; t+=86400000){
      const d = new Date(t);
      if(d.getFullYear()===year && d.getMonth()===month){
        const key = d.getDate();
        if(!byDay[key]) byDay[key]=[];
        byDay[key].push(it);
      }
    }
  });
  return byDay;
}
function shiftMyCalendarMonth(delta){
  ui.calMonth += delta;
  if(ui.calMonth<0){ ui.calMonth=11; ui.calYear--; }
  if(ui.calMonth>11){ ui.calMonth=0; ui.calYear++; }
  ui.calSelectedDay = null;
  renderContent();
}
function selectMyCalendarDay(day){
  ui.calSelectedDay = (ui.calSelectedDay===day) ? null : day;
  renderContent();
}
function renderMyCalendarGrid(){
  if(ui.calYear==null || ui.calMonth==null){
    const now = new Date();
    ui.calYear = now.getFullYear();
    ui.calMonth = now.getMonth();
  }
  const year = ui.calYear, month = ui.calMonth;
  const items = getAllMyCalendarItems();
  const eventsByDay = myCalendarEventsByDay(items, year, month);
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const monthLabel = `${HEB_MONTHS[month]} ${year}`;
  const cells = [];
  for(let i=0;i<startWeekday;i++) cells.push('<div class="cal-grid-cell empty"></div>');
  for(let day=1; day<=daysInMonth; day++){
    const evs = eventsByDay[day]||[];
    const hasEvents = evs.length>0;
    const isSelected = ui.calSelectedDay===day;
    const hasHoliday = evs.some(function(e){return e.source==='holiday';});
    const dotsHtml = evs.slice(0,4).map(function(e){
      return `<span style="width:5px;height:5px;border-radius:50%;background:${e.color||'#DADADA'};display:inline-block;"></span>`;
    }).join('');
    cells.push(`
      <div class="cal-grid-cell ${hasEvents?'has-event':''} ${isSelected?'selected':''}" onclick="selectMyCalendarDay(${day})">
        <div class="cal-grid-day" style="${hasHoliday?'color:var(--critical,#A32D2D);font-weight:600;':''}">${day}</div>
        ${hasEvents ? `<div style="position:absolute;bottom:6px;left:50%;transform:translateX(-50%);display:flex;gap:2px;">${dotsHtml}</div>` : ''}
      </div>
    `);
  }
  const selectedEvents = ui.calSelectedDay ? (eventsByDay[ui.calSelectedDay]||[]) : [];
  const selectedDeletablePersonal = selectedEvents.filter(function(e){ return e.source==='personal'; });
  return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <button class="icon-btn" onclick="shiftMyCalendarMonth(-1)">→</button>
        <div style="font-weight:600;font-size:15.5px;">${monthLabel}</div>
        <button class="icon-btn" onclick="shiftMyCalendarMonth(1)">←</button>
      </div>
      <div class="cal-grid-weekdays">${['א','ב','ג','ד','ה','ו','ש'].map(d=>`<div>${d}</div>`).join('')}</div>
      <div class="cal-grid">${cells.join('')}</div>
      ${ui.calSelectedDay ? `
        <div style="margin-top:16px;border-top:1px solid var(--gridline);padding-top:12px;">
          <div style="font-weight:600;margin-bottom:8px;">${ui.calSelectedDay} ב${HEB_MONTHS[month]}</div>
          ${selectedEvents.length ? selectedEvents.map(function(e){
            return `
              <div class="mycal-event-row" onclick="openMyCalendarEventDetail('${e.uid}')">
                <div class="mycal-event-top">
                  <span style="display:flex;align-items:center;gap:7px;min-width:0;">
                    <span style="width:10px;height:10px;border-radius:50%;background:${e.color||'#DADADA'};flex:none;"></span>
                    <span class="mycal-event-title">${e.title}</span>
                  </span>
                  <span style="display:flex;align-items:center;gap:5px;flex:none;">
                    <span class="mycal-source-tag ${e.source}">${MYCAL_SOURCE_LABEL[e.source]}</span>
                    ${e.canEdit ? `<button class="icon-btn" style="width:auto;padding:3px 7px;font-size:12px;" title="עריכה" onclick="event.stopPropagation();openNewMyCalendarEventForm(null,'${e.uid}')">✎</button>` : ''}
                    ${e.canDelete ? `<button class="icon-btn" style="width:auto;padding:3px 7px;font-size:12px;" title="מחיקה" onclick="event.stopPropagation();deleteMyCalendarEvent('${e.source}','${e.id}')">🗑</button>` : ''}
                  </span>
                </div>
                ${!e.allDay && e.startTime ? `<div style="font-size:12px;color:var(--muted);margin-top:2px;" dir="ltr">${e.startTime}${e.endTime?'–'+e.endTime:''}</div>` : ''}
              </div>
            `;
          }).join('') : `<div class="empty-state">אין אירועים ביום זה.</div>`}
          ${selectedDeletablePersonal.length>1 ? `
            <button class="btn-secondary" style="width:100%;margin-top:8px;color:var(--critical,#A32D2D);" onclick="deleteAllMyPersonalEventsForDay('${calendarNoteDateKey(year,month,ui.calSelectedDay)}')">🗑 מחיקת כל האירועים שלי ביום זה (${selectedDeletablePersonal.length})</button>
          ` : ''}
          <button class="mycal-create-btn" style="margin-top:12px;" onclick="openNewMyCalendarEventForm('${calendarNoteDateKey(year,month,ui.calSelectedDay)}')">+ צור אירוע ליום זה</button>
        </div>
      ` : ''}
    </div>
  `;
}
function viewMyCalendar(){
  syncMyCalendarData();
  return `
    <div class="page-head">
      <h1>היומן שלי</h1>
      <p>אירועים, תזכורות ודברים חשובים — במקום אחד.</p>
    </div>
    <button class="mycal-create-btn" onclick="openNewMyCalendarEventForm()">+ צור אירוע</button>
    ${renderMyCalendarGrid()}
  `;
}
function selectMyCalColor(color){
  document.getElementById('f-mycal-color').value = color;
  const picker = document.getElementById('f-mycal-color-picker');
  if(!picker) return;
  Array.from(picker.children).forEach(function(el){
    el.style.border = (el.getAttribute('data-color')===color) ? '2px solid var(--text-primary,#222)' : '2px solid transparent';
  });
}
function toggleMyCalAudienceFields(){
  const v = document.getElementById('f-mycal-audience').value;
  document.getElementById('f-mycal-one-wrap').style.display = v==='one' ? 'block' : 'none';
  document.getElementById('f-mycal-multi-wrap').style.display = v==='multi' ? 'block' : 'none';
}
function openNewMyCalendarEventForm(prefillDateKey, editUid){
  let editItem = null;
  if(editUid){
    editItem = getAllMyCalendarItems().find(function(it){return it.uid===editUid;});
    if(!editItem || !editItem.canEdit){ toast('אין אפשרות לערוך אירוע זה'); return; }
  }
  const isAreaMgr = isRealAreaManager();
  const areaBranches = isAreaMgr ? BRANCH_DIRECTORY.filter(function(b){return b.area===session.areaLabel;}) : [];
  let editTargets = [];
  let audience = 'me';
  if(editItem && editItem.source==='area'){
    const raw = (appData.areaCalendarEvents||[]).find(function(x){return x.id===editItem.id;});
    editTargets = raw ? (raw.targetBranchEmails||[]) : [];
    audience = editTargets.length>1 ? 'multi' : 'one';
  }
  document.getElementById('modal-body').innerHTML = `
    <h3>${editItem ? 'עריכת אירוע' : 'אירוע חדש'}</h3>
    <div class="field"><label>כותרת</label><input id="f-mycal-title" value="${editItem?editItem.title:''}" placeholder="למשל: ספירת מלאי"></div>
    <div class="field"><label>תאריך</label><input id="f-mycal-date" value="${editItem?editItem.date:(prefillDateKey||todayHeb())}" placeholder="DD.MM.YYYY"></div>
    <div class="field">
      <label style="display:flex;align-items:center;gap:6px;font-weight:400;">
        <input type="checkbox" id="f-mycal-allday" ${(!editItem || editItem.allDay)?'checked':''} onchange="document.getElementById('f-mycal-time-wrap').style.display=this.checked?'none':'flex';"> כל היום
      </label>
    </div>
    <div class="field" id="f-mycal-time-wrap" style="display:${(editItem && !editItem.allDay)?'flex':'none'};gap:10px;">
      <div style="flex:1;"><label>שעת התחלה</label><input type="time" id="f-mycal-start" value="${editItem?editItem.startTime||'':''}"></div>
      <div style="flex:1;"><label>שעת סיום</label><input type="time" id="f-mycal-end" value="${editItem?editItem.endTime||'':''}"></div>
    </div>
    <div class="field"><label>תיאור (אופציונלי)</label><textarea id="f-mycal-desc" rows="3">${editItem?editItem.desc||'':''}</textarea></div>
    <div class="field">
      <label>צבע</label>
      <div id="f-mycal-color-picker" style="display:flex;gap:8px;">
        ${CALENDAR_NOTE_COLORS.map(function(c,i){
          const isSel = editItem ? editItem.color===c : i===0;
          return `<div data-color="${c}" onclick="selectMyCalColor('${c}')" style="width:28px;height:28px;border-radius:50%;background:${c};cursor:pointer;border:2px solid ${isSel?'var(--text-primary,#222)':'transparent'};"></div>`;
        }).join('')}
      </div>
      <input type="hidden" id="f-mycal-color" value="${editItem?editItem.color:CALENDAR_NOTE_COLORS[0]}">
    </div>
    ${(isAreaMgr && (!editItem || editItem.source==='area')) ? `
      <div class="field">
        <label>למי מיועד האירוע?</label>
        <select id="f-mycal-audience" onchange="toggleMyCalAudienceFields()">
          <option value="me" ${audience==='me'?'selected':''}>רק לי</option>
          <option value="one" ${audience==='one'?'selected':''}>סניף אחד</option>
          <option value="multi" ${audience==='multi'?'selected':''}>מספר סניפים</option>
        </select>
      </div>
      <div class="field" id="f-mycal-one-wrap" style="display:${audience==='one'?'block':'none'};">
        <label>בחירת סניף</label>
        <select id="f-mycal-one-branch">
          ${areaBranches.map(function(b){return `<option value="${b.email}" ${editTargets[0]===b.email?'selected':''}>${b.name}</option>`;}).join('')}
        </select>
      </div>
      <div class="field" id="f-mycal-multi-wrap" style="display:${audience==='multi'?'block':'none'};max-height:160px;overflow:auto;">
        <label>בחירת סניפים</label>
        ${areaBranches.map(function(b){
          const checked = editTargets.indexOf(b.email)!==-1;
          return `<label style="display:flex;align-items:center;gap:6px;font-weight:400;font-size:13.5px;padding:3px 0;">
            <input type="checkbox" class="f-mycal-multi-cb" value="${b.email}" ${checked?'checked':''}> ${b.name}
          </label>`;
        }).join('')}
      </div>
    ` : ''}
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">ביטול</button>
      <button class="btn-confirm" onclick="submitMyCalendarEventForm('${editItem?editItem.source:''}','${editItem?editItem.id:''}')">${editItem?'שמירה':'יצירה'}</button>
    </div>
  `;
  document.getElementById('modal-overlay').classList.add('open');
}
function jumpMyCalendarToDate(dateKey){
  const ts = parseHebDate(dateKey);
  if(isNaN(ts)) return;
  const d = new Date(ts);
  ui.calYear = d.getFullYear();
  ui.calMonth = d.getMonth();
  ui.calSelectedDay = d.getDate();
}
function submitMyCalendarEventForm(editSource, editId){
  if(previewMode){ toast('פעולה לא זמינה במצב תצוגה'); return; }
  const title = val('f-mycal-title');
  const date = val('f-mycal-date');
  if(!title){ toast('נא למלא כותרת'); return; }
  if(!date){ toast('נא למלא תאריך'); return; }
  if(isNaN(parseHebDate(date))){ toast('תאריך לא תקין — יש להשתמש בפורמט DD.MM.YYYY'); return; }
  const allDay = document.getElementById('f-mycal-allday').checked;
  const startTime = allDay ? '' : (document.getElementById('f-mycal-start').value||'');
  const endTime = allDay ? '' : (document.getElementById('f-mycal-end').value||'');
  const desc = document.getElementById('f-mycal-desc').value.trim();
  const color = document.getElementById('f-mycal-color').value || CALENDAR_NOTE_COLORS[0];
  const audienceEl = document.getElementById('f-mycal-audience');
  const audience = audienceEl ? audienceEl.value : 'me';

  if(audience==='me' || !isRealAreaManager()){
    const payload = { ownerEmail: currentUserEmail, title, date, desc, color, allDay, startTime, endTime };
    if(editSource==='personal' && editId){
      db.collection('branchCalendarNotes').doc(editId).set(payload, {merge:true})
        .then(function(){ closeModal(); jumpMyCalendarToDate(date); toast('האירוע עודכן'); renderContent(); })
        .catch(function(err){ toast('שגיאה: '+err.message); });
    } else {
      payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      db.collection('branchCalendarNotes').add(payload)
        .then(function(){ closeModal(); jumpMyCalendarToDate(date); toast('האירוע נוצר'); renderContent(); })
        .catch(function(err){ toast('שגיאה: '+err.message); });
    }
    return;
  }

  let targetBranchEmails = [];
  if(audience==='one'){
    const email = document.getElementById('f-mycal-one-branch').value;
    if(!email){ toast('נא לבחור סניף'); return; }
    targetBranchEmails = [email];
  } else {
    targetBranchEmails = Array.from(document.querySelectorAll('.f-mycal-multi-cb:checked')).map(function(el){return el.value;});
    if(!targetBranchEmails.length){ toast('נא לבחור לפחות סניף אחד'); return; }
  }
  const payload = {
    areaManagerEmail: currentUserEmail, areaLabel: session.areaLabel,
    title, date, startTime, endTime, desc, targetBranchEmails
  };
  if(editSource==='area' && editId){
    db.collection('areaCalendarEvents').doc(editId).set(payload, {merge:true})
      .then(function(){ closeModal(); jumpMyCalendarToDate(date); toast('האירוע עודכן'); renderContent(); })
      .catch(function(err){ toast('שגיאה: '+err.message); });
  } else {
    payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    db.collection('areaCalendarEvents').add(payload)
      .then(function(){ closeModal(); jumpMyCalendarToDate(date); toast('האירוע נשלח'); renderContent(); })
      .catch(function(err){ toast('שגיאה: '+err.message); });
  }
}
function openMyCalendarEventDetail(uid){
  const item = getAllMyCalendarItems().find(function(it){return it.uid===uid;});
  if(!item) return;
  const dateLabel = item.endDate && item.endDate!==item.date ? `${item.date} – ${item.endDate}` : item.date;
  const timeLabel = (!item.allDay && item.startTime) ? `${item.startTime}${item.endTime?'–'+item.endTime:''}` : '';
  const gcalUrl = googleCalendarAddUrl(item.date, item.title, item.startTime||'', item.endTime||'');
  document.getElementById('modal-body').innerHTML = `
    <h3 style="display:flex;align-items:center;gap:8px;">
      <span style="width:12px;height:12px;border-radius:50%;background:${item.color||'#DADADA'};flex:none;"></span>
      ${item.title}
    </h3>
    <div style="font-size:13px;color:var(--text-secondary);margin-bottom:4px;" dir="ltr">${dateLabel}${timeLabel?' · '+timeLabel:''}</div>
    <div style="margin-bottom:10px;"><span class="mycal-source-tag ${item.source}">${MYCAL_SOURCE_LABEL[item.source]}</span>${item.meta?` · ${item.meta}`:''}</div>
    ${item.desc ? `<div style="font-size:13.5px;color:var(--text-secondary);white-space:pre-wrap;margin-bottom:12px;">${item.desc}</div>` : ''}
    <div class="modal-actions" style="justify-content:flex-start;flex-wrap:wrap;">
      <button class="btn-secondary" onclick="window.open('${gcalUrl}', '_blank', 'noopener')">📅 הוספה ל-Google Calendar</button>
      ${item.canEdit ? `<button class="btn-secondary" onclick="closeModal();openNewMyCalendarEventForm(null,'${item.uid}')">עריכה</button>` : ''}
      ${item.canDelete ? `<button class="btn-secondary" style="color:var(--critical,#A32D2D);" onclick="deleteMyCalendarEvent('${item.source}','${item.id}')">מחיקה</button>` : ''}
      <button class="btn-secondary" onclick="closeModal()">סגירה</button>
    </div>
  `;
  document.getElementById('modal-overlay').classList.add('open');
}
function deleteMyCalendarEvent(source, id){
  if(previewMode){ toast('פעולה לא זמינה במצב תצוגה'); return; }
  if(!confirm('למחוק את האירוע הזה?')) return;
  const coll = source==='personal' ? 'branchCalendarNotes' : (source==='area' ? 'areaCalendarEvents' : null);
  if(!coll) return;
  db.collection(coll).doc(id).delete()
    .then(function(){ closeModal(); toast('האירוע נמחק'); })
    .catch(function(err){ toast('שגיאה: '+err.message); });
}
/* מחיקת כל האירועים ה"אישיים" (source==='personal' בלבד — לעולם לא נוגעת
   באירועי מנהל אזור/שיווק/חג, גם אם הם מוצגים באותו יום) ביום נתון. */
function deleteAllMyPersonalEventsForDay(dateKey){
  if(previewMode){ toast('פעולה לא זמינה במצב תצוגה'); return; }
  const items = getAllMyCalendarItems().filter(function(it){ return it.source==='personal' && it.date===dateKey; });
  if(!items.length) return;
  if(!confirm(`למחוק את כל ${items.length} האירועים האישיים ביום זה?`)) return;
  Promise.all(items.map(function(it){
    return db.collection('branchCalendarNotes').doc(it.id).delete().catch(function(){});
  })).then(function(){ toast('האירועים נמחקו'); });
}
function renderMyCalendarCard(){
  return `
    <div class="aconv-home-card" onclick="ui.calSelectedDay=null;goTo('myCalendar');">
      <div class="aconv-home-icon">📅</div>
      <div class="aconv-home-main">
        <div class="aconv-home-title">היומן שלי</div>
        <div class="aconv-home-sub">אירועים, תזכורות ודברים חשובים</div>
      </div>
      <span class="aconv-home-arrow">›</span>
    </div>
  `;
}

