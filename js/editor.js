/* Editor S-140 VMC · edición por hoja (dos semanas). No actualiza asignaciones en Supabase. */
document.addEventListener('DOMContentLoaded', async () => {
  'use strict';
  const $ = id => document.getElementById(id);
  const sheet = $('sheet-template');
  const status = $('editor-status');
  const defaults = {
    fontSize:['--sheet-font-size','px',12.5], margin:['--sheet-margin','mm',10],
    meetingGap:['--meeting-gap','px',25], hCong:['--cong-font-size','px',20.5],
    hPad:['--header-padding-bottom','px',4], secTitle:['--section-title-size','px',11],
    rowPad:['--row-padding-y','px',1.5]
  };
  const inputs = {
    fontSize:['range-font-size','val-font-size'],margin:['range-margin','val-margin'],
    meetingGap:['range-meeting-gap','val-meeting-gap'],hCong:['range-h-cong','val-h-cong'],
    hPad:['range-h-pad','val-h-pad'],secTitle:['range-sec-title','val-sec-title'],
    rowPad:['range-row-pad','val-row-pad']
  };
  let client, weeks = [], currentKey = null;
  let requestNumber = 0;
  // La semana elegida puede ser cualquiera; siempre se carga su par fijo.
  // Por ejemplo: 2 -> (1,2), 3 -> (3,4), 9 -> (9,vacía).
  function chosenPair() {
    const ix = weeks.findIndex(w => w.id === $('week-select').value);
    if (ix < 0) return [null, null];
    const first = Math.floor(ix / 2) * 2;
    return [weeks[first] || null, weeks[first + 1] || null];
  }
  const html = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state = msg => {status.textContent=msg;status.className=msg.startsWith('Error')?'error':msg.startsWith('ATENCIÓN')?'warn':'ok';};
  const nameOf = p => p ? [p.nombre,p.apellido].filter(Boolean).join(' ').trim() || 'Sin asignar' : 'Sin asignar';
  function getClient(){
    // Reutiliza la instancia de la aplicación si existe.
    if(typeof supabaseClient !== 'undefined' && supabaseClient?.from) return supabaseClient;
    if(window.supabaseClient?.from) return window.supabaseClient;
    if(window.vmcSupabase?.from) return window.vmcSupabase;
    if(window.supabaseDb?.from) return window.supabaseDb;
    const cfg = window.VMC_CONFIG || window.CONFIG || {};
    const url = window.VMC_SUPABASE_URL || cfg.supabaseUrl || cfg.SUPABASE_URL || window.SUPABASE_URL || '';
    const key = window.VMC_SUPABASE_PUBLISHABLE_KEY || cfg.supabaseAnonKey || cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_PUBLISHABLE_KEY || window.SUPABASE_ANON_KEY || window.SUPABASE_PUBLISHABLE_KEY || '';
    if(!url || !key || !window.supabase?.createClient) throw new Error('No se detectaron las credenciales públicas de Supabase de js/config.js. Revisa getClient() en editor.js.');
    return window.supabase.createClient(url,key);
  }
  function checked(res, table){if(res.error)throw new Error(`${table}: ${res.error.message}`);return res.data||[];}
  function weekText(w){
    const fmt = s => {const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d).toLocaleDateString('es-CO',{day:'numeric',month:'short',year:'numeric'});};
    return `${fmt(w.semana_inicio)} – ${fmt(w.semana_fin)}`;
  }
  function saveKey(){
    const [top,bottom] = chosenPair();
    return `vmc_s140_hoja_${top?.id || 'ninguna'}_${bottom?.id || 'ninguna'}`;
  }
  function applySettings(settings={}){
    for (const [k,[cssVar,unit,defaultVal]] of Object.entries(defaults)) {
      const n = Number(settings[k]??defaultVal);
      const control = $(inputs[k][0]);control.value=String(Number.isFinite(n)?n:defaultVal);
      $(inputs[k][1]).textContent=`${control.value}${unit}`;
      sheet.style.setProperty(cssVar,control.value+unit);
    }
  }
  function readSaved(){
    if(!currentKey)return {};
    try {return JSON.parse(localStorage.getItem(currentKey)||'{}')||{};} catch {return {};}
  }
  // Solo se guardan textos de títulos/encabezados identificados por una clave
  // estable. NUNCA se guardan ni se restauran nombres de los publicadores:
  // siempre deben proceder de las asignaciones actuales de Supabase.
  // Los ajustes de tamaño sí se guardan por elemento, incluso en nombres.
  function editableNodes(){return [...sheet.querySelectorAll('[contenteditable="true"]')];}
  function prepareEditableKeys(){
    const congregation=sheet.querySelector('.editable-congregation');
    const subtitle=sheet.querySelector('.sheet-subtitle');
    if(congregation) congregation.dataset.editKey='cabecera:congregacion';
    if(subtitle) subtitle.dataset.editKey='cabecera:subtitulo';
    if(congregation) congregation.dataset.allowTextEdit='false';
  }
  function captureEdits(){
    const result={};
    for(const el of editableNodes()){
      const key=el.dataset.editKey;
      if(!key) continue;
      const record={};
      if(el.style.fontSize) record.fontSize=el.style.fontSize;
      // Solo los elementos expresamente marcados pueden guardar texto.
      if(el.dataset.allowTextEdit==='true' && el.textContent!==el.dataset.sourceText){
        record.text=el.textContent;
      }
      if(Object.keys(record).length) result[key]=record;
    }
    return result;
  }
  function restoreEdits(items){
    // La versión anterior guardaba ediciones por índice en una matriz. Ese
    // formato podía reemplazar nombres reales por 'Sin asignar': se ignora.
    if(!items || Array.isArray(items) || typeof items!=='object') return;
    for(const el of editableNodes()){
      const record=items[el.dataset.editKey];
      if(!record || typeof record!=='object') continue;
      if(typeof record.fontSize==='string' && /^(\d+(?:\.\d+)?)px$/.test(record.fontSize)){
        el.style.fontSize=record.fontSize;
      }
      if(el.dataset.allowTextEdit==='true' && typeof record.text==='string'){
        el.textContent=record.text;
      }
      // Nombres protegidos: jamás se escribe textContent aquí.
    }
  }
  function loadSettings(keepTime=false){
    currentKey=saveKey();
    const stored=readSaved();
    applySettings(stored.settings||stored); // compatibilidad con los ajustes anteriores
    if(!keepTime && stored.meetingTime && /^\d{2}:\d{2}$/.test(stored.meetingTime)){
      $('meeting-time').value=stored.meetingTime;
    }
    prepareEditableKeys();
    restoreEdits(stored.edits);
    sheet.querySelector('.editable-congregation').textContent='CONGREGACIÓN: LOS ANDES';
  }
  function values(){return Object.fromEntries(Object.keys(defaults).map(k=>[k,Number($(inputs[k][0]).value)]));}
  for (const [k,[inputId,valueId]] of Object.entries(inputs)){
    $(inputId).addEventListener('input',()=>{
      const [cssVar,unit]=defaults[k], v=$(inputId).value;
      sheet.style.setProperty(cssVar,v+unit);$(valueId).textContent=v+unit;
      requestAnimationFrame(checkPageFit);
    });
  }
  function persistCurrentSettings() {
    if (!currentKey) throw new Error('Selecciona una hoja primero.');
    localStorage.setItem(currentKey,JSON.stringify({
      version:3,settings:values(),meetingTime:$('meeting-time').value,edits:captureEdits()
    }));
  }
  $('btn-save-config').addEventListener('click',()=>{
    try {
      persistCurrentSettings();
      state('Guardado: ajustes de esta hoja. Los nombres siempre se cargarán desde Supabase.');
    } catch(e) {state('Error: No se pudieron guardar los ajustes en este navegador: '+e.message);}
  });
  $('btn-reset-config').addEventListener('click',()=>{
    if(currentKey)localStorage.removeItem(currentKey);
    loadPage().then(()=>state('Esta hoja volvió a los valores predeterminados.')).catch(e=>state('Error: '+e.message));
  });
  function halvesOverfull() {
    return ['sheet-top-half','sheet-bottom-half']
      .map(id=>$(id))
      .filter(Boolean)
      .some(el=>el.scrollHeight>el.clientHeight+2);
  }
  function checkPageFit() {
    if (!currentKey) return;
    if (halvesOverfull()) state('ATENCIÓN: una reunión excede su mitad de página. Reduce la fuente, el margen o el espacio entre filas.');
    else if (status.className==='warn') state('La hoja cabe correctamente en sus dos mitades.');
  }
  $('btn-print-doc').addEventListener('click',()=>{
    if (halvesOverfull()) {
      alert('El contenido supera una de las mitades de la hoja. Ajusta el tamaño antes de imprimir.');
      checkPageFit();
      return;
    }
    document.querySelector('.word-floating-toolbar')?.remove();
    window.print();
  });

  function timeText(min){const n=Math.round(min);const h=Math.floor(n/60)%24;return `${String(h).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;}
  function duration(part){
    const v=Number(part.duracion_minutos);
    if(Number.isFinite(v) && v>0)return v;
    if(part.tipo==='cancion')return 5;
    if(part.tipo==='oracion')return 1;
    return 0;
  }
  function titleText(p){
    let t=String(p.titulo||'').trim();
    if(p.tipo==='oracion')return '';
    if(p.tipo==='cancion')return `• ${t}`;
    if(p.tipo==='introduccion'||p.tipo==='conclusion')t=`• ${t}`;
    const mins=Number(p.duracion_minutos);
    return t+(Number.isFinite(mins)&&mins>0?` (${Number.isInteger(mins)?mins:String(mins).replace('.',',')} min${mins===1?'':'s' }.)`:'');
  }
  const edit = (value,key) => `<span contenteditable="true" spellcheck="false" data-edit-key="${html(key)}" data-allow-text-edit="true" data-source-text="${html(value)}">${html(value)}</span>`;
  const editableName=(value,key,cssClass='assigned-person')=>`<span class="${cssClass}" contenteditable="true" spellcheck="false" data-edit-key="${html(key)}">${html(value)}</span>`;
  const leader='<span class="assignee-leader" aria-hidden="true"></span>';
  function assignee(part, slotRows, pubs){
    const slots=slotRows.filter(a=>a.parte_id===part.id);
    const byRole=r=>nameOf(pubs.get(slots.find(s=>s.puesto===r)?.publicador_id));
    const person=(role,cssClass='assigned-person')=>editableName(byRole(role),`puesto:${part.id}:${role}`,cssClass);
    const roles = new Set(slots.map(s=>s.puesto));
    if(roles.has('estudiante') && roles.has('ayudante'))return `<span class="assignee-col"><span class="role-label">Estudiante/Ayudante:</span><span class="assigned-pair">${person('estudiante','assigned-name')}<span class="pair-separator">›</span><span class="pair-last">${person('ayudante','assigned-name')}${leader}</span></span></span>`;
    if(roles.has('conductor') && roles.has('lector'))return `<span class="assignee-col"><span class="role-label">Conductor/Lector:</span><span class="assigned-pair">${person('conductor','assigned-name')}<span class="pair-separator">›</span><span class="pair-last">${person('lector','assigned-name')}${leader}</span></span></span>`;
    if(roles.has('estudiante'))return `<span class="assignee-col assignee-student"><span class="role-label">Estudiante:</span><span class="role-leader"></span>${person('estudiante')}</span>`;
    if(roles.has('oracion'))return `<span class="assignee-col"><span class="role-label">Oración:</span>${person('oracion')}${leader}</span>`;
    const slot=slots.find(s=>s.puesto!=='oracion');
    return slot?`<span class="assignee-col assignee-single">${person(slot.puesto)}${leader}</span>`:'<span class="assignee-col"></span>';
  }
  function row(p,slotRows,pubs,elapsed,extraAssignee=''){
    return `<div class="program-row"><span class="time-col">${html(timeText(elapsed))}</span><span class="part-wrap"><span class="part-col" contenteditable="true" spellcheck="false" data-edit-key="parte:${html(p.id)}:titulo" data-allow-text-edit="true" data-source-text="${html(titleText(p))}">${html(titleText(p))}</span><span class="row-leader" aria-hidden="true"></span></span>${extraAssignee||assignee(p,slotRows,pubs)}</div>`;
  }
  function section(key,label,rows){return rows?`<div class="section-container section-${key}"><div class="section-title-bar"><span>${label}</span></div>${rows}</div>`:'';}
  function renderMeeting(w,parts,slots,pubs,start,presidents=new Map()){
    if(!w)return '<p style="font-size:11px">Sin reunión seleccionada.</p>';
    const weekParts=parts.filter(p=>p.programa_id===w.id).sort((a,b)=>a.orden-b.orden);
    const asign=slots.filter(a=>a.programa_id===w.id);
    const initial=weekParts.find(p=>p.tipo==='oracion'||p.seccion==='apertura'&&/oraci[oó]n/i.test(p.titulo));
    const final=weekParts.filter(p=>p.tipo==='oracion').at(-1);
    const own=a=>nameOf(pubs.get(asign.find(s=>s.parte_id===a?.id&&s.puesto==='oracion')?.publicador_id));
    let out = `<div class="meta-grid"><div class="meta-left">${edit(`${weekText(w)} | LECTURA: ${w.referencia_biblica||''}`,`semana:${w.id}:lectura`)}</div></div>`;
    let elapsed=start, current=null, buffer='';
    const labels={tesoros:'TESOROS DE LA BIBLIA',maestros:'SEAMOS MEJORES MAESTROS',vida:'NUESTRA VIDA CRISTIANA'};
    const flush=()=>{if(current&&buffer)out+=section(current,labels[current],buffer);buffer='';};
    const push=(piece)=>{if(current)buffer+=piece;else out+=piece;};
    for (const p of weekParts){
      // Oraciones de apertura/cierre se representan en cabecera o junto a canción final.
      if(p.tipo==='oracion'){elapsed+=duration(p);continue;}
      let sec=['tesoros','maestros','vida'].includes(p.seccion)?p.seccion:null;
      // Los elementos de cierre continúan dentro de Vida, como en la maqueta.
      if(p.seccion==='cierre'&&current==='vida')sec='vida';
      if(sec!==current){flush();current=sec;}
      let extra='';
      if(p.tipo==='cancion' && p.seccion==='apertura'){
        extra=`<span class="assignee-col assignee-opening"><span class="role-label">Presidente:</span>${editableName(nameOf(pubs.get(presidents.get(w.id))),`semana:${w.id}:presidente`)}${leader}</span>`;
      } else if(p.tipo==='introduccion'){
        extra=`<span class="assignee-col assignee-opening"><span class="role-label">Oración:</span>${editableName(own(initial),`semana:${w.id}:oracion_inicial`)}${leader}</span>`;
      }
      if(p.tipo==='cancion' && p.seccion==='cierre' && final){
        extra=`<span class="assignee-col"><span class="role-label">Oración:</span>${editableName(own(final),`semana:${w.id}:oracion_final`)}${leader}</span>`;
      }
      push(row(p,asign,pubs,elapsed,extra));elapsed+=duration(p);
    }
    flush();return out;
  }
  async function loadPage(keepTime=false){
    const [top,bottom] = chosenPair();
    if(!top)throw new Error('No hay semana seleccionada.');
    const a=top.id,b=bottom?.id || '';
    $('week-top-label').textContent=weekText(top);
    $('week-bottom-label').textContent=bottom ? weekText(bottom) : 'Sin reunión (última semana impar)';
    state('Cargando las reuniones y los nombres…');
    const requestId=++requestNumber;
    const ids=[a,b].filter(Boolean);
    // Las asignaciones se guardan desde el formulario por reunion_id, NO por
    // el id de la semana. Consultamos primero las reuniones reales de AMBAS
    // semanas y recuperamos los mismos puestos que usa el formulario.
    const [parts, meetings, publishers] = await Promise.all([
      client.from('programa_partes').select('id,programa_id,seccion,orden,tipo,titulo,duracion_minutos').in('programa_id',ids).order('orden',{ascending:true}),
      client.from('reuniones').select('id,programa_id,presidente_id').in('programa_id',ids),
      client.from('publicadores').select('id,nombre,apellido')
    ]);
    if(requestId!==requestNumber) return;
    const p=checked(parts,'programa_partes');
    const meetingRows=checked(meetings,'reuniones');
    const pubs=new Map(checked(publishers,'publicadores').map(x=>[x.id,x]));
    const meetingByProgram=new Map(meetingRows.map(m=>[m.programa_id,m.id]));
    const missing=ids.filter(id=>!meetingByProgram.has(id));
    if(missing.length)throw new Error('No se encontró una reunión para '+missing.length+' semana(s). Comprueba la tabla reuniones.');
    const meetingIds=ids.map(id=>meetingByProgram.get(id));
    const slotsResult=await client.from('asignaciones')
      .select('id,reunion_id,parte_id,puesto,puesto_orden,publicador_id')
      .in('reunion_id',meetingIds);
    if(requestId!==requestNumber)return;
    const rawSlots=checked(slotsResult,'asignaciones');
    // Asociar cada puesto con la semana de su reunión, sin depender de que
    // el programa_id de la tabla de asignaciones esté disponible/correcto.
    const presidents=new Map(meetingRows.map(m=>[m.programa_id,m.presidente_id]));
    const programByMeeting=new Map(meetingRows.map(m=>[m.id,m.programa_id]));
    const s=rawSlots.map(slot=>({...slot,programa_id:programByMeeting.get(slot.reunion_id)}));
    const partIds=new Set(p.map(part=>part.id));
    if(s.some(slot=>!partIds.has(slot.parte_id))){
      throw new Error('Se encontraron asignaciones vinculadas a partes que no pertenecen a estas semanas. Revisa las relaciones en Supabase.');
    }
    if(bottom && !p.some(x=>x.programa_id===bottom.id)){
      throw new Error('No se recuperaron las partes de la segunda semana. Revisa la carga del programa en Supabase.');
    }
    if(!p.some(x=>x.programa_id===top.id)){
      throw new Error('No se recuperaron las partes de la primera semana.');
    }
    currentKey=saveKey();
    const saved=readSaved();
    if(!keepTime && saved.meetingTime && /^\d{2}:\d{2}$/.test(saved.meetingTime)) $('meeting-time').value=saved.meetingTime;
    const [hh,mm]=$('meeting-time').value.split(':').map(Number);const start=hh*60+mm;
    $('meeting-a').innerHTML=renderMeeting(top,p,s,pubs,start,presidents);
    // La última hoja impar ocupa solo la mitad SUPERIOR.
    $('meeting-b').innerHTML=bottom ? renderMeeting(bottom,p,s,pubs,start,presidents) : '';
    loadSettings(keepTime);
    const pending=s.filter(x=>!x.publicador_id).length;
    const filledA=s.filter(x=>x.programa_id===a && x.publicador_id).length;
    const filledB=bottom?s.filter(x=>x.programa_id===b && x.publicador_id).length:null;
    const countA=s.filter(x=>x.programa_id===a).length;
    const countB=bottom?s.filter(x=>x.programa_id===b).length:0;
    const topOver=halvesOverfull();
    const rowSummary=`Arriba: ${filledA}/${countA} asignados`+(bottom?` · Abajo: ${filledB}/${countB} asignados`:' · Mitad inferior vacía');
    console.info('[S-140] Asignaciones reales leídas por reunion_id:',{arriba:{semana:top.semana_inicio,asignados:filledA,total:countA},abajo:bottom?{semana:bottom.semana_inicio,asignados:filledB,total:countB}:null});
    const prefix=(countA===0||(bottom&&countB===0))?'ATENCIÓN: No se encontraron puestos para alguna semana. ':'Hoja '+(Math.floor(weeks.findIndex(w=>w.id===a)/2)+1)+' · ';
    state(prefix+rowSummary+` · ${pending} puesto(s) vacíos.`+(topOver?' ATENCIÓN: el contenido supera su mitad.':''));
  }
  // EXPORTACIÓN COMPLETA: fuente de datos Supabase y edición visual por pareja.
  // Se generan las páginas fuera de la vista, sin modificar la pareja abierta.
  async function exportAllPdf() {
    const button=$('btn-export-pdf');
    if (!client || !weeks.length) throw new Error('Primero debe terminar de cargar Supabase.');
    if (!window.html2canvas || !window.jspdf?.jsPDF)
      throw new Error('No se cargaron html2canvas y jsPDF. Revisa tu conexión a internet.');
    if (halvesOverfull()) throw new Error('La hoja actual excede su mitad de página. Ajusta los tamaños antes de exportar.');
    // Conservar lo que se ve en la hoja actual antes de generar las otras.
    persistCurrentSettings();
    button.disabled=true;
    const pairCount=Math.ceil(weeks.length/2);
    const originalStatus=status.textContent;
    const staging=document.createElement('div');
    staging.id='vmc-pdf-staging';
    staging.setAttribute('aria-hidden','true');
    document.body.appendChild(staging);
    try {
      state('Preparando los datos de todas las semanas…');
      const ids=weeks.map(w=>w.id);
      const [partsResult,meetingsResult,pubsResult]=await Promise.all([
        client.from('programa_partes').select('id,programa_id,seccion,orden,tipo,titulo,duracion_minutos').in('programa_id',ids).order('orden',{ascending:true}),
        client.from('reuniones').select('id,programa_id,presidente_id').in('programa_id',ids),
        client.from('publicadores').select('id,nombre,apellido')
      ]);
      const parts=checked(partsResult,'programa_partes');
      const meetings=checked(meetingsResult,'reuniones');
      const pubs=new Map(checked(pubsResult,'publicadores').map(p=>[p.id,p]));
      const byProgram=new Map(meetings.map(m=>[m.programa_id,m]));
      const missingMeetings=weeks.filter(w=>!byProgram.has(w.id));
      if(missingMeetings.length) throw new Error('Faltan reuniones para: '+missingMeetings.map(w=>w.semana_inicio).join(', '));
      const partsByWeek=new Set(parts.map(p=>p.programa_id));
      const missingParts=weeks.filter(w=>!partsByWeek.has(w.id));
      if(missingParts.length) throw new Error('Faltan partes de: '+missingParts.map(w=>w.semana_inicio).join(', '));
      const slotsResult=await client.from('asignaciones')
        .select('id,reunion_id,parte_id,puesto,puesto_orden,publicador_id')
        .in('reunion_id',meetings.map(m=>m.id));
      const meetingProgram=new Map(meetings.map(m=>[m.id,m.programa_id]));
      const slots=checked(slotsResult,'asignaciones').map(s=>({...s,programa_id:meetingProgram.get(s.reunion_id)}));
      if(slots.some(s=>!s.programa_id))throw new Error('Hay asignaciones con reunion_id inválido.');
      const presidents=new Map(meetings.map(m=>[m.programa_id,m.presidente_id]));
      const pdf=new window.jspdf.jsPDF({orientation:'portrait',unit:'mm',format:'letter',compress:true});
      const maxWidth=215.9,maxHeight=279.4;
      for(let i=0;i<pairCount;i++){
        const top=weeks[2*i], bottom=weeks[2*i+1]||null;
        const key=`vmc_s140_hoja_${top.id}_${bottom?.id||'ninguna'}`;
        let stored={};
        try {stored=JSON.parse(localStorage.getItem(key)||'{}')||{};} catch {stored={};}
        const settings=stored.settings||stored;
        // Las hojas que no tienen preferencias usan los mismos valores predeterminados de la vista.
        const page=sheet.cloneNode(true);
        page.removeAttribute('id');
        page.classList.add('vmc-pdf-page');
        page.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
        const topContainer=page.querySelector('.sheet-top-half .meeting-block');
        const bottomContainer=page.querySelector('.sheet-bottom-half .meeting-block');
        const meetingTime=/^\d{2}:\d{2}$/.test(stored.meetingTime||'')?stored.meetingTime:'18:30';
        const [hh,mm]=meetingTime.split(':').map(Number);
        topContainer.innerHTML=renderMeeting(top,parts,slots,pubs,hh*60+mm,presidents);
        bottomContainer.innerHTML=bottom?renderMeeting(bottom,parts,slots,pubs,hh*60+mm,presidents):'';
        for(const [k,[cssVar,unit,def]] of Object.entries(defaults)){
          const n=Number(settings[k]??def);
          page.style.setProperty(cssVar, (Number.isFinite(n)?n:def)+unit);
        }
        // Permitir la edición local de títulos, pero nunca de los nombres de Supabase.
        const edits=stored.edits;
        if(edits && !Array.isArray(edits) && typeof edits==='object'){
          page.querySelectorAll('[data-edit-key]').forEach(el=>{
            const record=edits[el.dataset.editKey];
            if(!record || typeof record!=='object')return;
            if(typeof record.fontSize==='string' && /^\d+(?:\.\d+)?px$/.test(record.fontSize))el.style.fontSize=record.fontSize;
            if(el.dataset.allowTextEdit==='true' && el.dataset.editKey!=='cabecera:congregacion' && typeof record.text==='string')el.textContent=record.text;
          });
        }
        page.querySelector('.editable-congregation').textContent='CONGREGACIÓN: LOS ANDES';
        staging.replaceChildren(page);
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        const sections=[page.querySelector('.sheet-top-half'),page.querySelector('.sheet-bottom-half')];
        if(sections.some(el=>el.scrollHeight>el.clientHeight+2)){
          throw new Error('La hoja '+(i+1)+' ('+top.semana_inicio+') excede su mitad. Abre esa pareja y reduce la fuente o el espaciado.');
        }
        state(`Generando PDF: página ${i+1} de ${pairCount}…`);
        const canvas=await window.html2canvas(page,{
          backgroundColor:'#ffffff',scale:2,useCORS:true,logging:false,
          width:page.offsetWidth,height:page.offsetHeight,scrollX:0,scrollY:0
        });
        const data=canvas.toDataURL('image/jpeg',0.95);
        if(i>0)pdf.addPage('letter','portrait');
        pdf.addImage(data,'JPEG',0,0,maxWidth,maxHeight,undefined,'FAST');
      }
      const first=weeks[0].semana_inicio,last=weeks.at(-1).semana_fin;
      const filename=`VMC_Los_Andes_${first}_${last}.pdf`;
      pdf.save(filename);
      state(`PDF exportado: ${pairCount} página(s), ${weeks.length} reuniones, tamaño carta. Los nombres provienen de Supabase.`);
    } finally {
      staging.remove();
      button.disabled=false;
    }
  }
  $('btn-export-pdf').addEventListener('click',()=>{
    exportAllPdf().catch(e=>{state('Error: '+e.message);console.error('[S-140 PDF]',e);});
  });

  $('btn-load-weeks').addEventListener('click',()=>loadPage().catch(e=>state('Error: '+e.message)));
  $('week-select').addEventListener('change',()=>loadPage().catch(e=>state('Error: '+e.message)));
  $('meeting-time').addEventListener('change',()=>loadPage(true).catch(e=>state('Error: '+e.message)));
  // Ajuste puntual de letra (en elementos editables) no se guarda en Supabase.
  sheet.addEventListener('click',e=>{
    const el=e.target.closest('[contenteditable="true"]');if(!el)return;
    document.querySelector('.word-floating-toolbar')?.remove();
    const toolbar=document.createElement('div');toolbar.className='word-floating-toolbar no-print';
    toolbar.innerHTML='<div class="toolbar-content">Letra: <button type="button" data-d="-0.5">A-</button><span class="size-label"></span><button type="button" data-d="0.5">A+</button><button type="button" data-reset="1">↺</button><button type="button" data-close="1">✕</button></div>';
    const rect=el.getBoundingClientRect();toolbar.style.position='fixed';toolbar.style.top=Math.max(5,rect.top-45)+'px';toolbar.style.left=Math.max(5,rect.left)+'px';
    document.body.appendChild(toolbar);
    const update=()=>toolbar.querySelector('.size-label').textContent=parseFloat(getComputedStyle(el).fontSize).toFixed(1)+'px';update();
    toolbar.addEventListener('click',event=>{
      const btn=event.target.closest('button');if(!btn)return;
      if(btn.dataset.close){toolbar.remove();return;}
      if(btn.dataset.reset){el.style.fontSize='';update();return;}
      const n=Math.min(22,Math.max(6.5,parseFloat(getComputedStyle(el).fontSize)+Number(btn.dataset.d)));
      el.style.fontSize=n+'px';update();
    });
  });
  document.addEventListener('click',e=>{if(!e.target.closest('.word-floating-toolbar')&&!sheet.contains(e.target))document.querySelector('.word-floating-toolbar')?.remove();});
  try{
    client=getClient();
    const { data: authData, error: authError } = await client.auth.getSession();
    if (authError) throw authError;
    if (!authData.session) {
      state('Error: Inicia sesión en el panel principal antes de abrir el editor.');
      return;
    }
    const { data: isAdmin, error: adminError } = await client.rpc('es_admin_vmc');
    if (adminError) throw adminError;
    if (isAdmin !== true) throw new Error('La sesión actual no tiene acceso de administrador.');
    weeks=checked(await client.from('programas_semanales').select('id,semana_inicio,semana_fin,referencia_biblica').order('semana_inicio',{ascending:true}),'programas_semanales');
    if(!weeks.length){state('No hay programas semanales en Supabase.');return;}
    const params=new URLSearchParams(location.search);
    const requested=params.get('programa_id')||params.get('semana')||params.get('semana_inicio');
    const ix=Math.max(0,weeks.findIndex(w=>w.id===requested||w.semana_inicio===requested));
    const options=weeks.map((w,i)=>`<option value="${html(w.id)}">Semana ${i+1} · ${html(weekText(w))}</option>`).join('');
    $('week-select').innerHTML=options;
    $('week-select').value=weeks[ix]?.id||'';
    await loadPage();
  }catch(e){state('Error: '+e.message);console.error('[S-140]',e);}
});
