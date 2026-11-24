/* VMC Reuniones: formulario dinámico de asignaciones. No modifica el editor S-140. */
(() => {
  'use strict';
  const root = document.getElementById('vmc-asignaciones');
  if (!root) return;
  const $ = id => document.getElementById(id);
  const weekSelect = $('assignWeek'), partsBox = $('assignParts');
  const saveButton = $('assignSave'), refreshButton = $('assignRefresh');
  const summary = $('assignSummary');
  const pickerIds = ['assignPickerSearch','assignPickerGender','assignPickerRole','assignPickerPrivilege'];
  const picker = $('assignPicker');
  let pickerSlotId = null;
  let pickerOpener = null;
  let client, publishers = [], assignments = [], original = new Map();
  let currentProgram = null, loading = false, dirty = false;
  const PRESIDENT_ID='__vmc_presidente__';
  let presidenteId=null, originalPresidenteId=null;
  const LABELS = {presidente:'Presidente',oracion:'Oración',orador:'Orador',conductor:'Conductor',lector:'Lector',estudiante:'Estudiante',ayudante:'Ayudante',encargado:'Encargado'};
  const SECTIONS = {apertura:'Apertura',tesoros:'Tesoros de la Biblia',maestros:'Seamos Mejores Maestros',vida:'Nuestra Vida Cristiana',cierre:'Cierre'};
  const RANK = {estudiante:1,ayudante:2,conductor:3,lector:4,orador:5,encargado:6,oracion:7};
  const node = (tag,cls,text) => {const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
  function status(message,kind='info'){$('assignStatus').textContent=message;$('assignStatus').className=`import-message import-message--${kind}`;}
  function getClient(){
    if (!window.supabase?.createClient || !window.VMC_SUPABASE_URL || !window.VMC_SUPABASE_PUBLISHABLE_KEY) throw new Error('No se encontró la configuración de Supabase.');
    if (!client) client=window.supabase.createClient(window.VMC_SUPABASE_URL,window.VMC_SUPABASE_PUBLISHABLE_KEY);
    return client;
  }
  async function ensureAdmin(){
    const db=getClient();
    const {data:auth,error:authError}=await db.auth.getUser();
    if(authError||!auth?.user)throw new Error('Debes iniciar sesión para administrar asignaciones.');
    const {data,error}=await db.rpc('es_admin_vmc');
    if(error)throw error;
    if(data!==true)throw new Error('Esta cuenta no tiene permisos de administrador.');
    return db;
  }
  function fmt(date){if(!date)return '';const [y,m,d]=date.split('-').map(Number);return new Intl.DateTimeFormat('es-CO',{day:'numeric',month:'long',year:'numeric'}).format(new Date(y,m-1,d));}
  function setBusy(value){loading=value;weekSelect.disabled=value;saveButton.disabled=value||!dirty;refreshButton.disabled=value;}
  function sortSlots(a,b){return (RANK[a.puesto]??50)-(RANK[b.puesto]??50)||(a.puesto_orden??1)-(b.puesto_orden??1)||a.puesto.localeCompare(b.puesto);}
  function changed(){dirty=(presidenteId||null)!==(originalPresidenteId||null)||assignments.some(a=>(a.publicador_id||null)!==(original.get(a.id)||null));saveButton.disabled=loading||!dirty;summary.dataset.dirty=dirty?'yes':'no';}
  function normalized(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();}
  function personName(p){return `${p.apellido}, ${p.nombre}`;}
  function getSlotText(slot){
    if(!slot?.publicador_id)return 'Seleccionar publicador…';
    const p=publishers.find(x=>x.id===slot.publicador_id);
    return p ? `${personName(p)}${p.activo?'':' (inactivo)'}` : 'Publicador no disponible';
  }
  function getPresidentSlot(){return {id:PRESIDENT_ID,parte_id:PRESIDENT_ID,puesto:'presidente',publicador_id:presidenteId};}
  function getActiveSlot(){return pickerSlotId===PRESIDENT_ID ? {id:PRESIDENT_ID,parte_id:PRESIDENT_ID,puesto:'presidente',publicador_id:presidenteId} : assignments.find(a=>a.id===pickerSlotId);}
  function modalMatches(){
    const name=normalized($('assignPickerSearch').value);
    const gender=$('assignPickerGender').value;
    const role=$('assignPickerRole').value;
    const privilege=$('assignPickerPrivilege').value;
    return publishers.filter(p=>p.activo &&
      (!name || normalized(`${p.nombre} ${p.apellido}`).includes(name) || normalized(`${p.apellido} ${p.nombre}`).includes(name)) &&
      (!gender || p.genero===gender) &&
      (!role || p.rol===role) &&
      (!privilege || (privilege==='ninguno' ? !p.privilegio_servicio : p.privilegio_servicio===privilege)));
  }
  function refreshSummary(){
    if(!currentProgram)return;
    const filled=assignments.filter(a=>a.publicador_id).length;
    summary.textContent=`${currentProgram.partes.length} elementos · ${assignments.length} puestos · ${filled} asignados · ${assignments.length-filled} pendientes${dirty?' · Cambios sin guardar':''}`;
  }
  function refreshSlotButton(id){
    const slot=id===PRESIDENT_ID ? {id:PRESIDENT_ID,publicador_id:presidenteId} : assignments.find(a=>a.id===id);
    const btn=[...partsBox.querySelectorAll('button[data-slot-id]')].find(b=>b.dataset.slotId===id);
    if(btn&&slot){
      const span=btn.querySelector('.assign-selected-name');
      span.textContent=getSlotText(slot);
      btn.classList.toggle('assign-slot-empty',!slot.publicador_id);
    }
  }
  function renderPickerList(){
    const list=$('assignPickerList');list.replaceChildren();
    const matches=modalMatches().sort((a,b)=>personName(a).localeCompare(personName(b),'es'));
    $('assignPickerCount').textContent=`${matches.length} publicador(es) disponibles`;
    const slot=getActiveSlot();
    if(!matches.length){list.append(node('p','assign-picker-empty','Ningún publicador coincide con los filtros.'));return;}
    for(const p of matches){
      const button=node('button','assign-picker-person');button.type='button';button.dataset.personId=p.id;
      button.setAttribute('role','listitem');
      if(slot?.publicador_id===p.id){button.classList.add('is-selected');button.setAttribute('aria-current','true');}
      button.append(node('strong','',personName(p)));
      button.append(node('small','',`${p.genero} · ${p.rol}${p.privilegio_servicio?' · '+p.privilegio_servicio:''}`));
      list.append(button);
    }
  }
  function resetPickerFilters(){
    $('assignPickerSearch').value='';$('assignPickerRole').value='';$('assignPickerPrivilege').value='';
    const slot=getActiveSlot();
    const part=currentProgram?.partes.find(p=>p.id===slot?.parte_id);
    // Solo filtro predeterminado; nunca impide cambiar a Mujeres o Todos.
    $('assignPickerGender').value=part?.seccion==='maestros' ? '' : 'Hombre';
    renderPickerList();
  }
  function openPicker(slotId,opener){
    const slot=slotId===PRESIDENT_ID ? getPresidentSlot() : assignments.find(a=>a.id===slotId);
    if(!slot||!currentProgram||loading)return;
    pickerSlotId=slotId;pickerOpener=opener;
    const part=currentProgram.partes.find(p=>p.id===slot.parte_id);
    $('assignPickerTitle').textContent=`Elegir ${LABELS[slot.puesto]||slot.puesto}`;
    $('assignPickerPart').textContent=slotId===PRESIDENT_ID?'Presidencia de la reunión':(part?.titulo||'');
    resetPickerFilters();
    if(typeof picker.showModal==='function')picker.showModal();else picker.setAttribute('open','');
    $('assignPickerSearch').focus();
  }
  function closePicker(){
    if(picker.open&&typeof picker.close==='function')picker.close();else picker.removeAttribute('open');
    pickerSlotId=null;
    const opener=pickerOpener;pickerOpener=null;
    if(opener?.isConnected)opener.focus();
  }
  function choosePerson(personId){
    const slot=getActiveSlot();if(!slot)return;
    const p=publishers.find(x=>x.id===personId);
    if(personId&&(!p||!p.activo))return;
    if(slot.id===PRESIDENT_ID)presidenteId=personId||null;else slot.publicador_id=personId||null;
    refreshSlotButton(slot.id);changed();refreshSummary();closePicker();
  }
  function validateAssignments(){
    for(const part of currentProgram?.partes||[]){
      const filled=assignments.filter(a=>a.parte_id===part.id && a.publicador_id);
      const seen=new Set();
      for(const slot of filled){
        if(seen.has(slot.publicador_id))return `La misma persona aparece dos veces en «${part.titulo}». Elige personas distintas para sus puestos.`;
        seen.add(slot.publicador_id);
      }
    }
    return null;
  }
  function render(){
    partsBox.replaceChildren();
    if(!currentProgram)return;
    const parts=currentProgram.partes;
    const presidency=node('article','assign-card assign-presidency');
    const head=node('div','assign-part-heading');head.append(node('strong','','Presidente de la reunión'));presidency.append(head);
    const pg=node('div','assign-grid');const pf=node('label','assign-field');pf.append(node('span','','Presidente'));
    const pb=node('button','assign-person-button');pb.type='button';pb.dataset.slotId=PRESIDENT_ID;
    pb.setAttribute('aria-label','Elegir presidente de la reunión');
    pb.append(node('span','assign-selected-name',getSlotText(getPresidentSlot())),node('span','assign-chevron','›'));
    pb.classList.toggle('assign-slot-empty',!presidenteId);pf.append(pb);pg.append(pf);presidency.append(pg);partsBox.append(presidency);
    const filled=assignments.filter(a=>a.publicador_id).length;
    summary.hidden=false;
    summary.textContent=`${parts.length} elementos · ${assignments.length} puestos · ${filled} asignados · ${assignments.length-filled} pendientes`;
    let currentSection='';
    for(const part of parts){
      const slots=assignments.filter(a=>a.parte_id===part.id).sort(sortSlots);
      if(part.seccion!==currentSection){currentSection=part.seccion;partsBox.append(node('h3','assign-section',SECTIONS[currentSection]||currentSection));}
      const card=node('article','assign-card');
      const heading=node('div','assign-part-heading');
      heading.append(node('strong','',part.titulo));
      if(part.duracion_minutos!==null&&part.duracion_minutos!==undefined)heading.append(node('span','assign-time',`${Number(part.duracion_minutos)} min`));
      card.append(heading);
      if(!slots.length){card.append(node('p','assign-no-slots','Sin puesto individual de asignación.'));}
      else {
        const grid=node('div','assign-grid');
        for(const slot of slots){
          const label=node('label','assign-field');
          const title=node('span','',LABELS[slot.puesto]||slot.puesto);
          const button=node('button','assign-person-button assign-slot-empty');
          button.type='button';button.dataset.slotId=slot.id;
          button.setAttribute('aria-label',`Elegir ${LABELS[slot.puesto]||slot.puesto} para ${part.titulo}`);
          button.append(node('span','assign-selected-name',getSlotText(slot)),node('span','assign-chevron','›'));
          button.classList.toggle('assign-slot-empty',!slot.publicador_id);
          label.append(title,button);grid.append(label);
        }
        card.append(grid);
      }
      partsBox.append(card);
    }
    changed();
  }
  async function loadWeeks(){
    if(dirty&&!confirm('Hay cambios sin guardar. ¿Descartarlos y actualizar?'))return;
    setBusy(true);status('Cargando semanas guardadas…');
    try{
      const db=await ensureAdmin();
      const {data,error}=await db.from('programas_semanales').select('id,semana_inicio,semana_fin,referencia_biblica').order('semana_inicio',{ascending:false});
      if(error)throw error;
      const selected=weekSelect.value;
      weekSelect.replaceChildren();
      const first=node('option','','Selecciona una semana…');first.value='';weekSelect.append(first);
      for(const w of data||[]){const opt=node('option','',`${fmt(w.semana_inicio)} — ${fmt(w.semana_fin)}${w.referencia_biblica?' · '+w.referencia_biblica:''}`);opt.value=w.id;weekSelect.append(opt);}
      if((data||[]).some(w=>w.id===selected))weekSelect.value=selected;
      status(`${(data||[]).length} semana(s) disponibles.`,'success');
      if(weekSelect.value)await loadWeek(weekSelect.value);
      else {presidenteId=null;originalPresidenteId=null;currentProgram=null;assignments=[];dirty=false;summary.hidden=true;partsBox.replaceChildren();}
    }catch(e){status(`No se pudieron cargar las semanas: ${e.message}`,'error');}
    finally{setBusy(false);changed();}
  }
  async function loadWeek(programId){
    if(!programId){presidenteId=null;originalPresidenteId=null;currentProgram=null;assignments=[];original.clear();dirty=false;summary.hidden=true;partsBox.replaceChildren();saveButton.disabled=true;return;}
    setBusy(true);status('Cargando partes, puestos y publicadores…');
    try{
      const db=await ensureAdmin();
      const [partResult,meetingResult,publisherResult]=await Promise.all([
        db.from('programa_partes').select('id,programa_id,orden,seccion,titulo,duracion_minutos,tipo').eq('programa_id',programId).order('orden'),
        db.from('reuniones').select('id,programa_id,presidente_id').eq('programa_id',programId).single(),
        db.from('publicadores').select('id,nombre,apellido,activo,genero,rol,privilegio_servicio').order('apellido').order('nombre')
      ]);
      for(const r of [partResult,meetingResult,publisherResult])if(r.error)throw r.error;
      const {data:slotData,error:slotError}=await db.from('asignaciones').select('id,reunion_id,parte_id,puesto,puesto_orden,publicador_id').eq('reunion_id',meetingResult.data.id);
      if(slotError)throw slotError;
      currentProgram={id:programId,partes:partResult.data||[],reunionId:meetingResult.data.id};
      presidenteId=meetingResult.data.presidente_id||null;originalPresidenteId=presidenteId;
      publishers=publisherResult.data||[];
      assignments=(slotData||[]).map(a=>({...a}));
      original=new Map(assignments.map(a=>[a.id,a.publicador_id||null]));
      dirty=false;
      render();
      status('Selecciona los publicadores y pulsa Guardar asignaciones.','success');
    }catch(e){presidenteId=null;originalPresidenteId=null;currentProgram=null;assignments=[];original.clear();dirty=false;summary.hidden=true;partsBox.replaceChildren();status(`No se pudo cargar la semana: ${e.message}`,'error');}
    finally{setBusy(false);changed();}
  }
  partsBox.addEventListener('click',e=>{
    const button=e.target.closest('button[data-slot-id]');
    if(button)openPicker(button.dataset.slotId,button);
  });
  for(const id of pickerIds){$(id).addEventListener(id==='assignPickerSearch'?'input':'change',renderPickerList);}
  $('assignPickerReset').addEventListener('click',resetPickerFilters);
  $('assignPickerClose').addEventListener('click',closePicker);
  $('assignPickerCancel').addEventListener('click',closePicker);
  $('assignPickerClear').addEventListener('click',()=>choosePerson(null));
  $('assignPickerList').addEventListener('click',e=>{
    const button=e.target.closest('button[data-person-id]');
    if(button)choosePerson(button.dataset.personId);
  });
  picker.addEventListener('close',()=>{pickerSlotId=null;const opener=pickerOpener;pickerOpener=null;if(opener?.isConnected)opener.focus();});
  picker.addEventListener('click',e=>{if(e.target===picker)closePicker();});
  weekSelect.addEventListener('change',async()=>{
    if(dirty&&!confirm('Hay asignaciones sin guardar. ¿Descartar cambios?')){
      weekSelect.value=currentProgram?.id||'';return;
    }
    await loadWeek(weekSelect.value);
  });
  refreshButton.addEventListener('click',loadWeeks);
  saveButton.addEventListener('click',async()=>{
    if(!dirty||!currentProgram)return;
    const issue=validateAssignments();
    if(issue){status(issue,'error');return;}
    const updates=assignments.filter(a=>(a.publicador_id||null)!==(original.get(a.id)||null));
    const presidentChanged=(presidenteId||null)!==(originalPresidenteId||null);
    if(!updates.length&&!presidentChanged)return;
    setBusy(true);status(`Guardando ${updates.length} cambio(s)…`);
    try{
      const db=await ensureAdmin();
      // RPC atómica: si una actualización falla, no se guarda ninguna parcialmente.
      const {data,error}=await db.rpc('vmc_guardar_asignaciones',{
        p_reunion_id:currentProgram.reunionId,
        p_cambios:[...updates.map(a=>({id:a.id,publicador_id:a.publicador_id})),...(presidentChanged?[{tipo:'presidente',publicador_id:presidenteId}]:[])]
      });
      if(error)throw error;
      original=new Map(assignments.map(a=>[a.id,a.publicador_id||null]));
      originalPresidenteId=presidenteId;dirty=false;render();
      status(`Asignaciones guardadas correctamente (${data?.actualizadas??updates.length} cambio(s)).`,'success');
    }catch(e){status(`No se guardaron los cambios: ${e.message}`,'error');}
    finally{setBusy(false);changed();}
  });
  // Se activa al entrar en Reuniones, no requiere modificar app.js.
  let initialized=false;
  function onRoute(){if(location.hash.slice(1)==='reuniones'&&!initialized){initialized=true;loadWeeks();}}
  window.addEventListener('hashchange',onRoute);
  window.addEventListener('vmc-programa-guardado',()=>{if(initialized)loadWeeks();});
  onRoute();
})();
