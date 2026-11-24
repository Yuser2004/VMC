/* Navegación al editor S-140 sin cambiar el módulo de asignaciones. */
document.addEventListener('DOMContentLoaded', () => {
  'use strict';
  const week = document.getElementById('assignWeek');
  const button = document.getElementById('openS140Editor');
  if (!week || !button) return;
  const refresh = () => { button.disabled = !week.value; };
  week.addEventListener('change', refresh);
  // Los módulos cargan las semanas de forma asíncrona.
  const observer = new MutationObserver(refresh);
  observer.observe(week, { childList: true, subtree: true, attributes: true, attributeFilter: ['value'] });
  button.addEventListener('click', () => {
    if (!week.value) return;
    const url = new URL('editor.html', window.location.href);
    url.searchParams.set('programa_id', week.value);
    window.location.assign(url.href);
  });
  refresh();
});
