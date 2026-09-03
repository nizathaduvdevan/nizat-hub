/* ---------- Materials ---------- */
function viewMaterials(){
  markSectionRead('materials');
  const nonVideoMaterials = appData.materials.filter(m=>!m.isVideo);
  const cats = [...new Set(nonVideoMaterials.map(m=>m.category))];
  const activeFilter = (ui.materialFilter && cats.includes(ui.materialFilter)) ? ui.materialFilter : cats[0];
  const list = activeFilter ? nonVideoMaterials.filter(m=>m.category===activeFilter) : nonVideoMaterials;
  return `
    <div class="page-head">
      <h1>הורדה חומרי שיווק / דיגיטל ורשתות חברתיות</h1>
      <p>${getText('materials_desc')}</p>
    </div>
    <div class="filter-row">
      ${cats.map(c=>`<button class="chip ${activeFilter===c?'active':''}" onclick="setMaterialFilter('${c}')">${c}</button>`).join('')}
    </div>
    <div class="materials-grid">
      ${list.map(m=>materialCard(m)).join('') || `<div class="empty-state">${nonVideoMaterials.length ? 'אין חומרים בקטגוריה זו כרגע.' : ('עדיין אין הורדה חומרי שיווק / דיגיטל ורשתות חברתיות.' + (session.role==='marketing' ? ' לחצו על "ניהול תוכן" כדי להעלות חומר ראשון.' : ''))}</div>`}
    </div>
  `;
}
function setMaterialFilter(c){ ui.materialFilter=c; renderContent(); }
/* ---------- סרטוני הדרכה (שיווק) — קישורי YouTube "לא רשום", מוטמעים
   בתוך האתר. נשמרים כרשומת materials רגילה עם isVideo:true, כדי לא ליצור
   קולקציה/הרשאות נפרדות ב-Firestore. ---------- */
function extractYouTubeId(url){
  const m = (url||'').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}
function viewVideos(){
  const videos = appData.materials.filter(m=>m.isVideo).sort((a,b)=>parseHebDate(b.date)-parseHebDate(a.date));
  const canManage = canManageDepartment('marketing');
  return `
    <div class="page-head">
      <h1>סרטוני הדרכה</h1>
      <p>סרטונים קצרים שמסבירים איך להציב אלמנטים ותצוגות בסניף.</p>
    </div>
    ${canManage ? `<button class="btn-add" style="margin-bottom:14px;" onclick="openVideoForm()">+ הוספת סרטון</button>` : ''}
    ${videos.length ? videos.map(v=>{
      const ytId = extractYouTubeId(v.fileUrl);
      return `
      <div class="card" style="margin-bottom:14px;">
        <div style="font-weight:500;font-size:15px;margin-bottom:8px;">${v.name}</div>
        ${ytId ? `<div style="position:relative;padding-top:56.25%;border-radius:10px;overflow:hidden;background:#000;">
          <iframe src="https://www.youtube.com/embed/${ytId}" style="position:absolute;inset:0;width:100%;height:100%;border:0;" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
        </div>` : `<div class="empty-state">קישור לא תקין.</div>`}
        ${v.category ? `<div style="font-size:12.5px;color:var(--text-secondary);margin-top:8px;">${v.category}</div>` : ''}
        ${canManage ? `<div style="display:flex;gap:8px;margin-top:10px;">
          <button class="icon-btn" onclick="openVideoForm('${v.id}')" title="עריכה">✎</button>
          <button class="icon-btn danger" onclick="confirmDelete('materials', '${v.id}')" title="מחיקה">🗑</button>
        </div>` : ''}
      </div>`;
    }).join('') : `<div class="card"><div class="empty-state">עדיין אין סרטוני הדרכה.${canManage ? ' לחצו על "הוספת סרטון" כדי להעלות ראשון.' : ''}</div></div>`}
  `;
}
function openVideoForm(editId){
  const item = editId ? appData.materials.find(x=>x.id==editId) : null;
  document.getElementById('modal-body').innerHTML = `
    <h3>${editId ? 'עריכת' : 'הוספת'} סרטון הדרכה</h3>
    <div class="field"><label>כותרת</label><input id="f-video-name" value="${item?.name||''}" placeholder="למשל: איך להציב סטנד Lavido"></div>
    <div class="field"><label>קטגוריה (אופציונלי)</label><input id="f-video-category" value="${item?.category||''}" placeholder="הצבת סטנדים / תצוגה / ..."></div>
    <div class="field">
      <label>קישור YouTube</label>
      <input id="f-video-url" value="${item?.fileUrl||''}" placeholder="https://youtu.be/...">
      <div class="field-hint">העלו את הסרטון ל-YouTube במצב "לא רשום" (Unlisted), והדביקו כאן את הקישור.</div>
    </div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">ביטול</button>
      <button class="btn-confirm" onclick="saveVideoForm('${editId||''}')">שמירה</button>
    </div>
  `;
  document.getElementById('modal-overlay').classList.add('open');
}
function saveVideoForm(editId){
  const name = document.getElementById('f-video-name').value.trim();
  const category = document.getElementById('f-video-category').value.trim();
  const url = document.getElementById('f-video-url').value.trim();
  if(!name){ toast('נא למלא כותרת'); return; }
  if(!extractYouTubeId(url)){ toast('קישור YouTube לא תקין'); return; }
  const existing = editId ? appData.materials.find(x=>x.id==editId) : null;
  const obj = {
    name, category, fileUrl: url, isVideo: true, type: 'YouTube', size: '',
    date: existing ? existing.date : todayHeb(),
    time: existing ? (existing.time||null) : new Date().toLocaleTimeString('he-IL', {hour:'2-digit', minute:'2-digit'}),
    unread: existing ? (existing.unread||false) : true,
    tags: existing ? (existing.tags||[]) : [],
    thumbUrl: null,
    department: existing ? itemDepartment(existing) : (staffDepartments(currentUserEmail)[0] || DEFAULT_DEPARTMENT)
  };
  closeModal();
  if(editId){
    db.collection('materials').doc(editId).update(obj).then(()=>toast('הסרטון עודכן')).catch(err=>toast('שגיאה: '+err.message));
  } else {
    obj.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    db.collection('materials').add(obj).then(()=>toast('הסרטון נוסף')).catch(err=>toast('שגיאה: '+err.message));
  }
}
const IMAGE_FILE_TYPES = ['JPG','JPEG','PNG','GIF','WEBP','SVG'];
/* תגיות מובנות לחומרי שיווק. אייקונים כלליים (לא לוגו רשמי מדויק) — כדי לא
   לשכפל סימן מסחרי, אבל עדיין ברור אינטואיטיבית איזו פלטפורמה מיועדת. */
const BUILTIN_MATERIAL_TAGS = [
  {id:'facebook', label:'תצוגת Facebook', color:'#1877F2', icon:'f'},
  {id:'instagram', label:'תצוגת Instagram', color:'#E1306C', icon:'📷'},
  {id:'quarterly_print', label:'במות רבעוניות להדפסה', color:'#6b7280', icon:'🖨'}
];
function allMaterialTags(){
  const custom = (appData.materialTags||[]).map(t=>({id:t.id, label:t.label, color:t.color||'#6b7280', icon:t.icon||'🏷'}));
  return [...BUILTIN_MATERIAL_TAGS, ...custom];
}
function materialTagBadge(tagId){
  const tag = allMaterialTags().find(t=>t.id===tagId);
  if(!tag) return '';
  return `<span class="mat-tag" style="background:${tag.color};">${tag.icon} ${tag.label}</span>`;
}
function materialCard(m){
  const isImage = IMAGE_FILE_TYPES.indexOf((m.type||'').toUpperCase()) !== -1;
  const thumbSrc = m.thumbUrl || (isImage ? m.fileUrl : null);
  return `
  <div class="card material-card">
    ${thumbSrc ? `<img class="file-thumb" src="${thumbSrc}" alt="${m.name}">` : `<div class="file-icon">${m.type}</div>`}
    <div class="material-name">${m.name}</div>
    <div class="material-meta">${m.category} · ${m.size} · עודכן ${m.date}${m.time ? ' '+m.time : ''}</div>
    ${m.tags && m.tags.length ? `<div style="display:flex;flex-wrap:wrap;gap:5px;">${m.tags.map(t=>materialTagBadge(t)).join('')}</div>` : ''}
    <a class="download-btn" href="${m.fileUrl}" target="_blank" rel="noopener" download="${m.name}">⬇ הורדה</a>
  </div>`;
}

