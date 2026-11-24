
(() => {
  'use strict';

  const $ = id => document.getElementById(id);

  const pages = ['inicio', 'publicadores', 'reuniones'];

  const titles = {
    inicio: 'Inicio',
    publicadores: 'Publicadores',
    reuniones: 'Reuniones'
  };

  const mobile = () =>
    matchMedia('(max-width: 760px)').matches;

  const toggle = $('menuToggle');

  // ==========================================
  // MENÚ LATERAL Y NAVEGACIÓN
  // ==========================================

  const closeMobileMenu = () => {
    document.body.classList.remove('mobile-menu-open');

    toggle.setAttribute(
      'aria-expanded',
      mobile()
        ? 'false'
        : String(
            !document.body.classList.contains(
              'sidebar-collapsed'
            )
          )
    );
  };

  const renderPage = () => {
    const requested = location.hash
      .slice(1)
      .toLowerCase();

    const page = pages.includes(requested)
      ? requested
      : 'inicio';

    for (const name of pages) {
      const section = $(`page-${name}`);

      section.hidden = name !== page;
      section.classList.toggle(
        'active',
        name === page
      );
    }

    document
      .querySelectorAll('[data-page]')
      .forEach(link => {
        const active =
          link.dataset.page === page;

        link.classList.toggle('active', active);

        if (active) {
          link.setAttribute(
            'aria-current',
            'page'
          );
        } else {
          link.removeAttribute('aria-current');
        }
      });

    $('topbarLocation').textContent =
      titles[page];

    document.title =
      `${titles[page]} | VMC Reuniones`;

    closeMobileMenu();
  };

  toggle.addEventListener('click', () => {
    if (mobile()) {
      const opened =
        document.body.classList.toggle(
          'mobile-menu-open'
        );

      toggle.setAttribute(
        'aria-expanded',
        String(opened)
      );
    } else {
      const collapsed =
        document.body.classList.toggle(
          'sidebar-collapsed'
        );

      toggle.setAttribute(
        'aria-expanded',
        String(!collapsed)
      );
    }
  });

  $('closeSidebar').addEventListener(
    'click',
    closeMobileMenu
  );

  $('sidebarOverlay').addEventListener(
    'click',
    closeMobileMenu
  );

  document.addEventListener(
    'keydown',
    event => {
      if (event.key === 'Escape') {
        closeMobileMenu();
      }
    }
  );

  addEventListener('hashchange', renderPage);

  addEventListener('resize', () => {
    if (!mobile()) {
      closeMobileMenu();
    }
  });

  renderPage();

  // ==========================================
  // NOTIFICACIONES
  // ==========================================

  const notify = (
    id,
    message,
    type = ''
  ) => {
    const node = $(id);

    node.textContent = message;
    node.className = `notice ${type}`;
  };

  // ==========================================
  // SUPABASE
  // ==========================================

  let db = null;
  let records = [];
  let user = null;
  let authorized = false;

  const validConfig =
    typeof window.VMC_SUPABASE_URL ===
      'string' &&
    /^https:\/\/.+\.supabase\.co\/?$/.test(
      window.VMC_SUPABASE_URL
    ) &&
    typeof window.VMC_SUPABASE_PUBLISHABLE_KEY ===
      'string' &&
    window.VMC_SUPABASE_PUBLISHABLE_KEY
      .startsWith('sb_publishable_');

  if (
    !validConfig ||
    !window.supabase?.createClient
  ) {
    notify(
      'loginMessage',
      'No se pudo iniciar Supabase. Revisa js/config.js, la conexión a internet y abre la página con Live Server.',
      'error'
    );

    return;
  }

  db = window.supabase.createClient(
    window.VMC_SUPABASE_URL,
    window.VMC_SUPABASE_PUBLISHABLE_KEY
  );

  // ==========================================
  // ESTADO DE AUTENTICACIÓN
  // ==========================================

  const setSignedIn = account => {
    user = account;
    authorized = Boolean(account);

    $('authScreen').hidden =
      Boolean(account);

    $('logoutBtn').hidden =
      !account;

    $('userEmail').textContent =
      account?.email || '';
  };

  // ==========================================
  // VERIFICAR ADMINISTRADOR
  // ==========================================

  async function checkAdmin(account) {
    if (!account) {
      return false;
    }

    const { data, error } =
      await db.rpc('es_admin_vmc');

    if (error) {
      throw error;
    }

    return data === true;
  }

  // ==========================================
  // APLICAR SESIÓN
  // ==========================================

  async function applySession(session) {
    if (!session?.user) {
      setSignedIn(null);

      records = [];
      renderRecords();

      return;
    }

    try {
      const isAdmin =
        await checkAdmin(session.user);

      if (!isAdmin) {
        await db.auth.signOut();

        setSignedIn(null);

        notify(
          'loginMessage',
          'Este usuario no está autorizado como administrador de VMC.',
          'error'
        );

        return;
      }

      setSignedIn(session.user);

      notify('loginMessage', '');

      await loadPublishers();

    } catch (err) {
      setSignedIn(null);

      notify(
        'loginMessage',
        `No se pudo verificar el administrador: ${err.message}`,
        'error'
      );
    }
  }

  // ==========================================
  // INICIAR SESIÓN
  // ==========================================


  // ==========================================
  // INICIAR SESIÓN CON MENSAJES DE ERROR
  // ==========================================

  $('loginForm').addEventListener(
    'submit',
    async event => {
      event.preventDefault();

      const button = $('loginBtn');
      const email = $('loginEmail').value.trim();
      const password = $('loginPassword').value;

      button.disabled = true;

      notify(
        'loginMessage',
        'Verificando correo y contraseña…'
      );

      try {
        if (!email || !password) {
          notify(
            'loginMessage',
            'Debes escribir tu correo y contraseña.',
            'error'
          );
          return;
        }

        const { data, error } =
          await db.auth.signInWithPassword({
            email,
            password
          });

        if (error) {
          const message =
            error.message?.toLowerCase() || '';

          if (
            message.includes('invalid login credentials') ||
            message.includes('invalid credentials')
          ) {
            notify(
              'loginMessage',
              'Correo o contraseña incorrectos.',
              'error'
            );
          } else if (
            message.includes('email not confirmed')
          ) {
            notify(
              'loginMessage',
              'Debes confirmar tu correo electrónico antes de ingresar.',
              'error'
            );
          } else {
            notify(
              'loginMessage',
              'Error de autenticación: ' + error.message,
              'error'
            );
          }

          return;
        }

        if (!data.session) {
          notify(
            'loginMessage',
            'No se pudo obtener una sesión válida.',
            'error'
          );
          return;
        }

        // Verificar permisos de administrador
        const isAdmin = await checkAdmin(
          data.session.user
        );

        if (!isAdmin) {
          await db.auth.signOut();

          notify(
            'loginMessage',
            'Acceso denegado: este usuario no está autorizado como administrador.',
            'error'
          );
          return;
        }

        // Acceso autorizado
        setSignedIn(data.session.user);

        $('loginPassword').value = '';

        notify(
          'loginMessage',
          'Inicio de sesión correcto.',
          'success'
        );

        await loadPublishers();

      } catch (err) {
        console.error(
          'Error al iniciar sesión:',
          err
        );

        notify(
          'loginMessage',
          'No se pudo completar el inicio de sesión: ' +
          (err.message || 'Error desconocido'),
          'error'
        );

      } finally {
        button.disabled = false;
      }
    }
  );

  // ==========================================
  // CERRAR SESIÓN
  // ==========================================

  $('logoutBtn').addEventListener(
    'click',
    async () => {
      await db.auth.signOut();

      setSignedIn(null);

      records = [];
      renderRecords();

      notify(
        'loginMessage',
        'Sesión cerrada.'
      );
    }
  );

  // ==========================================
  // CARGAR PUBLICADORES
  // ==========================================

  async function loadPublishers() {
    if (!authorized) {
      return;
    }

    notify(
      'publisherMessage',
      'Cargando publicadores…'
    );

    const { data, error } = await db
      .from('publicadores')
      .select(
        'id,nombre,apellido,genero,rol,privilegio_servicio,activo'
      )
      .order('apellido', {
        ascending: true
      })
      .order('nombre', {
        ascending: true
      });

    if (error) {
      notify(
        'publisherMessage',
        `Error al consultar: ${error.message}`,
        'error'
      );

      return;
    }

    records = data || [];

    notify(
      'publisherMessage',
      `${records.length} publicador(es) registrado(s).`
    );

    renderRecords();
  }

  // ==========================================
  // EVITAR HTML INSEGURO
  // ==========================================

  const esc = value =>
    String(value ?? '').replace(
      /[&<>"']/g,
      char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[char])
    );

  // ==========================================
  // MOSTRAR Y FILTRAR PUBLICADORES
  // ==========================================

  function renderRecords() {
    const search = $('searchPublisher')
      .value
      .trim()
      .toLocaleLowerCase('es');

    const status =
      $('filterStatus').value;

    const gender =
      $('filterGender').value;

    const filtered = records.filter(
      record => {
        const fullName =
          `${record.nombre} ${record.apellido}`
            .toLocaleLowerCase('es');

        const matchesSearch =
          fullName.includes(search);

        const matchesStatus =
          status === 'todos' ||
          (
            status === 'activos' &&
            record.activo
          ) ||
          (
            status === 'inactivos' &&
            !record.activo
          );

        const matchesGender =
          gender === 'todos' ||
          record.genero === gender;

        return (
          matchesSearch &&
          matchesStatus &&
          matchesGender
        );
      }
    );

    $('publisherRows').innerHTML =
      filtered.length
        ? filtered.map(record => `
          <tr>
            <td>
              <strong>
                ${esc(record.nombre)}
                ${esc(record.apellido)}
              </strong>
            </td>

            <td>${esc(record.genero)}</td>

            <td>${esc(record.rol)}</td>

            <td>
              ${esc(
                record.privilegio_servicio || '—'
              )}
            </td>

            <td>
              <span class="pill-status ${
                record.activo ? '' : 'off'
              }">
                ${
                  record.activo
                    ? 'Activo'
                    : 'Inactivo'
                }
              </span>
            </td>

            <td>
              <div class="table-actions">
                <button
                  type="button"
                  data-action="edit"
                  data-id="${esc(record.id)}"
                >
                  Editar
                </button>

                <button
                  type="button"
                  data-action="toggle"
                  data-id="${esc(record.id)}"
                >
                  ${
                    record.activo
                      ? 'Desactivar'
                      : 'Activar'
                  }
                </button>
              </div>
            </td>
          </tr>
        `).join('')
        : `
          <tr>
            <td colspan="6">
              ${
                authorized
                  ? 'No hay publicadores que coincidan con los filtros.'
                  : 'Inicia sesión para ver los registros.'
              }
            </td>
          </tr>
        `;
  }

  [
    'searchPublisher',
    'filterStatus',
    'filterGender'
  ].forEach(id => {
    $(id).addEventListener(
      'input',
      renderRecords
    );
  });

  // ==========================================
  // FORMULARIO DE PUBLICADORES
  // ==========================================

  const dialog =
    $('publisherDialog');

  const syncPrivilege = () => {
    const woman =
      $('publisherGender').value ===
      'Mujer';

    $('publisherPrivilege').disabled =
      woman;

    if (woman) {
      $('publisherPrivilege').value = '';
    }
  };

  $('publisherGender').addEventListener(
    'change',
    syncPrivilege
  );

  function openForm(record = null) {
    $('publisherForm').reset();

    $('publisherId').value =
      record?.id || '';

    $('publisherDialogTitle').textContent =
      record
        ? 'Editar publicador'
        : 'Nuevo publicador';

    $('publisherName').value =
      record?.nombre || '';

    $('publisherSurname').value =
      record?.apellido || '';

    $('publisherGender').value =
      record?.genero || 'Hombre';

    $('publisherRole').value =
      record?.rol || 'Publicador';

    $('publisherPrivilege').value =
      record?.privilegio_servicio || '';

    $('publisherActive').checked =
      record?.activo ?? true;

    syncPrivilege();

    notify('formMessage', '');

    dialog.showModal();

    $('publisherName').focus();
  }

  // ==========================================
  // ABRIR Y CERRAR FORMULARIO
  // ==========================================

  $('newPublisher').addEventListener(
    'click',
    () => {
      if (authorized) {
        openForm();
      }
    }
  );

  $('closePublisher').addEventListener(
    'click',
    () => dialog.close()
  );

  $('cancelPublisher').addEventListener(
    'click',
    () => dialog.close()
  );

  // ==========================================
  // EDITAR / ACTIVAR / DESACTIVAR
  // ==========================================

  $('publisherRows').addEventListener(
    'click',
    async event => {
      const button = event.target.closest(
        'button[data-action]'
      );

      if (!button || !authorized) {
        return;
      }

      const record = records.find(
        item =>
          item.id === button.dataset.id
      );

      if (!record) {
        return;
      }

      if (
        button.dataset.action === 'edit'
      ) {
        openForm(record);
        return;
      }

      const next = !record.activo;

      const confirmed = confirm(
        `¿Deseas ${
          next ? 'activar' : 'desactivar'
        } a ${record.nombre} ${record.apellido}?`
      );

      if (!confirmed) {
        return;
      }

      button.disabled = true;

      try {
        const { error } = await db
          .from('publicadores')
          .update({
            activo: next
          })
          .eq('id', record.id)
          .select('id')
          .single();

        if (error) {
          throw error;
        }

        await loadPublishers();

      } catch (err) {
        notify(
          'publisherMessage',
          `No se pudo actualizar: ${err.message}`,
          'error'
        );

      } finally {
        button.disabled = false;
      }
    }
  );

  // ==========================================
  // GUARDAR PUBLICADOR
  // ==========================================

  $('publisherForm').addEventListener(
    'submit',
    async event => {
      event.preventDefault();

      if (!authorized) {
        return;
      }

      const nombre =
        $('publisherName').value.trim();

      const apellido =
        $('publisherSurname').value.trim();

      if (!nombre || !apellido) {
        notify(
          'formMessage',
          'El nombre y el apellido son obligatorios.',
          'error'
        );

        return;
      }

      const payload = {
        nombre,
        apellido,

        genero:
          $('publisherGender').value,

        rol:
          $('publisherRole').value,

        privilegio_servicio:
          $('publisherGender').value ===
          'Hombre'
            ? (
                $('publisherPrivilege').value ||
                null
              )
            : null,

        activo:
          $('publisherActive').checked
      };

      const id =
        $('publisherId').value;

      const button =
        $('savePublisher');

      button.disabled = true;

      notify(
        'formMessage',
        'Guardando…'
      );

      try {
        const query = id
          ? db
              .from('publicadores')
              .update(payload)
              .eq('id', id)
          : db
              .from('publicadores')
              .insert(payload);

        const { data, error } =
          await query
            .select('id')
            .single();

        if (error) {
          throw error;
        }

        if (!data) {
          throw new Error(
            'No se confirmó el registro.'
          );
        }

        dialog.close();

        await loadPublishers();

        notify(
          'publisherMessage',
          id
            ? 'Publicador actualizado correctamente.'
            : 'Publicador registrado correctamente.',
          'success'
        );

      } catch (err) {
        notify(
          'formMessage',
          `No se pudo guardar: ${err.message}`,
          'error'
        );

      } finally {
        button.disabled = false;
      }
    }
  );

  // ==========================================
  // RECUPERAR SESIÓN GUARDADA
  // ==========================================

  db.auth.onAuthStateChange(
    (event, session) => {
      if (event === 'SIGNED_OUT') {
        setSignedIn(null);

        records = [];
        renderRecords();
      }
    }
  );

  db.auth.getSession()
    .then(({ data, error }) => {
      if (error) {
        throw error;
      }

      return applySession(
        data.session
      );
    })
    .catch(err => {
      notify(
        'loginMessage',
        `Error al recuperar sesión: ${err.message}`,
        'error'
      );
    });

})();
