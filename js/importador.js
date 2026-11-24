/* VMC Reuniones | importador EPUB/JSON, vista previa y guardado seguro.
   El EPUB se procesa localmente; solo el JSON normalizado se guarda en Supabase. */
(() => {
  'use strict';
  const panel = document.getElementById('vmc-importador');
  if (!panel) return;

  const $ = id => document.getElementById(id);
  const fileInput = $('importFile');
  const status = $('importStatus');
  const summaries = $('importSummary');
  const warningsPanel = $('importWarnings');
  const select = $('importWeek');
  const details = $('importDetail');
  const downloadBtn = $('exportJson');
  const saveBtn = $('saveProgram');
  let result = null;

  function el(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = String(value);
    return node;
  }
  function showStatus(text, kind = 'info') {
    status.textContent = text;
    status.className = `import-message import-message--${kind}`;
  }
  function reset() {
    result = null;
    summaries.hidden = true;
    warningsPanel.hidden = true;
    select.hidden = true;
    details.replaceChildren();
    downloadBtn.disabled = true;
    saveBtn.disabled = true;
  }
  function numeroTitulo(p) {
    return p.numero_visible != null ? `Punto ${p.numero_visible}` :
      p.tipo === 'cancion' ? 'Canción' : p.tipo === 'oracion' ? 'Oración' :
      p.tipo === 'conclusion' ? 'Conclusión' : p.tipo === 'introduccion' ? 'Introducción' : 'Parte';
  }
  const SECCIONES = {
    apertura: 'Apertura', tesoros: 'Tesoros de la Biblia', maestros: 'Seamos Mejores Maestros',
    vida: 'Nuestra Vida Cristiana', cierre: 'Cierre'
  };
  function showWeek(index) {
    details.replaceChildren();
    const semana = result?.json?.semanas?.[index];
    if (!semana) return;
    const header = el('div', 'import-week-header');
    header.append(el('h3', '', semana.semana), el('p', '', `${semana.semana_inicio} al ${semana.semana_fin}  ·  ${semana.lectura || 'Lectura no disponible'}`));
    details.append(header);
    let actual = null;
    let ul = null;
    for (const parte of semana.partes) {
      const etiqueta = SECCIONES[parte.seccion] || parte.seccion || 'Otra sección';
      if (actual !== etiqueta) {
        actual = etiqueta;
        details.append(el('h4', 'import-section-name', etiqueta));
        ul = el('div', 'import-part-list');
        details.append(ul);
      }
      const item = el('div', 'import-part');
      const textCol = el('div', 'import-part-text');
      textCol.append(el('span', 'import-part-label', numeroTitulo(parte)), el('strong', '', parte.titulo));
      // Las referencias adicionales no aparecen en el formato S-140 ni en esta vista previa.
      item.append(textCol);
      if (parte.minutos !== null && parte.minutos !== undefined) {
        item.append(el('span', 'import-minutes', `${parte.minutos} min`));
      }
      ul.append(item);
    }
  }
  function render(response) {
    result = response;
    const semanas = response.json.semanas;
    const num = semanas.reduce((n, s) => n + s.partes.filter(p => p.numero_visible !== null).length, 0);
    summaries.hidden = false;
    $('importGroupTitle').textContent = response.json.grupo_nombre || response.json.grupo_id;
    $('importCountWeeks').textContent = semanas.length;
    $('importCountParts').textContent = num;
    $('importCountSongs').textContent = semanas.reduce((n, s) => n + s.partes.filter(p => p.tipo === 'cancion').length, 0);
    select.replaceChildren();
    for (const [i, s] of semanas.entries()) {
      const option = el('option', '', `${s.semana} · ${s.partes.filter(p => p.numero_visible !== null).length} puntos`);
      option.value = String(i);
      select.append(option);
    }
    select.hidden = false;
    select.value = '0';
    showWeek(0);
    const warnings = response.advertencias || [];
    warningsPanel.hidden = !warnings.length;
    warningsPanel.replaceChildren();
    if (warnings.length) {
      warningsPanel.append(el('strong', '', `Revisar ${warnings.length} observación(es):`));
      const ul = el('ul');
      for (const warning of warnings) ul.append(el('li', '', warning));
      warningsPanel.append(ul);
    }
    downloadBtn.disabled = false;
    saveBtn.disabled = false;
    showStatus(`Se importaron ${semanas.length} semanas. Revisa cada una antes de utilizar el JSON.`, 'success');
  }
  fileInput.addEventListener('change', async () => {
    reset();
    const file = fileInput.files && fileInput.files[0];
    if (!file) { showStatus('Selecciona un EPUB o un JSON para empezar.'); return; }
    if (!/\.(?:epub|json)$/i.test(file.name)) {
      showStatus('Solo se aceptan archivos .epub o .json.', 'error'); return;
    }
    $('importChoose').disabled = true;
    showStatus(`Analizando ${file.name}…`);
    try {
      const response = /\.epub$/i.test(file.name)
        ? await window.VMCEpub.desdeEpub(file)
        : window.VMCEpub.desdeJson(await file.text());
      render(response);
    } catch (error) {
      showStatus(`No se pudo importar: ${error.message}`, 'error');
      console.error('[VMC] Error del importador:', error);
    } finally {
      $('importChoose').disabled = false;
    }
  });
  // No usa claves privadas: la sesión se verifica en Supabase y el RPC aplica RLS.
  // Cliente adicional con el mismo proyecto y almacenamiento de sesión compartido.
  let supabaseClient = null;
  function obtenerCliente() {
    if (!window.supabase?.createClient || !window.VMC_SUPABASE_URL ||
        !window.VMC_SUPABASE_PUBLISHABLE_KEY) {
      throw new Error('Falta la configuración pública de Supabase.');
    }
    if (!supabaseClient) {
      supabaseClient = window.supabase.createClient(
        window.VMC_SUPABASE_URL, window.VMC_SUPABASE_PUBLISHABLE_KEY);
    }
    return supabaseClient;
  }
  saveBtn.addEventListener('click', async () => {
    if (!result || saveBtn.disabled) return;
    const semanas = result.json.semanas || [];
    if (!window.confirm(`¿Guardar ${semanas.length} semana(s) en Supabase?\n` +
      'Las semanas ya existentes se omitirán para conservar sus asignaciones.')) return;
    saveBtn.disabled = true;
    showStatus('Guardando el programa en Supabase…');
    try {
      const client = obtenerCliente();
      const { data: authData, error: authError } = await client.auth.getUser();
      if (authError || !authData?.user) {
        throw new Error('Inicia sesión como administrador para guardar el programa.');
      }
      const { data, error } = await client.rpc('vmc_importar_programa', {
        p_documento: result.json
      });
      if (error) throw error;
      const omitidas = data.semanas_omitidas || 0;
      const resumen = `Guardadas ${data.semanas_guardadas} semana(s), ` +
        `${data.partes_guardadas} elementos y ${data.puestos_creados} puesto(s) de asignación.` +
        (omitidas ? ` ${omitidas} semana(s) ya existían y se conservaron sin cambios.` : '');
      showStatus(resumen, 'success');
    } catch (error) {
      console.error('[VMC] No se pudo guardar el programa:', error);
      showStatus(`No se guardó el programa: ${error.message}`, 'error');
    } finally {
      saveBtn.disabled = false;
    }
  });
  $('importChoose').addEventListener('click', () => fileInput.click());
  select.addEventListener('change', () => showWeek(Number(select.value)));
  downloadBtn.addEventListener('click', () => {
    if (!result) return;
    const filename = `${result.json.grupo_id || 'programa'}.json`;
    const blob = new Blob([JSON.stringify(result.json, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = el('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 3000);
  });
  showStatus('Elige el EPUB de la Guía de Actividades para ver las semanas. El archivo no se sube a ningún servidor.');
})();
