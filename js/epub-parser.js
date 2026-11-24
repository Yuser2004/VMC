/* VMC Reuniones | lector EPUB/JSON en el navegador.
   Convierte una Guía de Actividades en datos de VISTA PREVIA.
   No envía archivos ni datos a ningún servidor. Requiere JSZip 3.x. */
(function () {
  'use strict';

  const MESES = {
    enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
    julio: 7, agosto: 8, septiembre: 9, setiembre: 9,
    octubre: 10, noviembre: 11, diciembre: 12
  };
  const NOMBRES = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const LETRAS_MES = '[A-ZÁÉÍÓÚÜÑ]+';
  const RE_NUMERO = /^(\d+)\s*[.．]\s*(.+)$/u;
  const RE_MINUTOS = /\(\s*(\d+(?:[,.]\d+)?)\s*mins?\.?\s*\)/iu;

  function limpio(texto) {
    return String(texto == null ? '' : texto)
      .replace(/[\u00a0\u2007\u202f\t\r\n]+/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  function sinTildes(str) {
    return limpio(str).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }
  function mesDesdePalabra(str) {
    return MESES[sinTildes(str)] || null;
  }
  function nombreMes(m) {
    const nombre = NOMBRES[m] || '';
    return nombre.charAt(0).toUpperCase() + nombre.slice(1);
  }
  function fechaISO(a, m, d) {
    const dt = new Date(Date.UTC(a, m - 1, d));
    if (dt.getUTCFullYear() !== a || dt.getUTCMonth() + 1 !== m || dt.getUTCDate() !== d) {
      throw new Error(`Fecha incorrecta en la guía: ${d}/${m}/${a}`);
    }
    return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  function anioCercano(mes, mesReferencia, anioReferencia) {
    if (mesReferencia && mes - mesReferencia >= 6) return anioReferencia - 1;
    if (mesReferencia && mesReferencia - mes >= 6) return anioReferencia + 1;
    return anioReferencia;
  }
  function fechasSemana(rotulo, anioGrupo, mesGrupo) {
    const t = limpio(rotulo).toUpperCase();
    let m = t.match(new RegExp(`^(\\d{1,2})\\s*[-–—]\\s*(\\d{1,2})\\s+DE\\s+(${LETRAS_MES})(?:\\s+DE\\s+(\\d{4}))?$`, 'u'));
    if (m) {
      const mes = mesDesdePalabra(m[3]);
      if (!mes) return null;
      const anio = m[4] ? Number(m[4]) : anioCercano(mes, mesGrupo, anioGrupo);
      return { inicio: fechaISO(anio, mes, Number(m[1])), fin: fechaISO(anio, mes, Number(m[2])) };
    }
    m = t.match(new RegExp(`^(\\d{1,2})\\s+DE\\s+(${LETRAS_MES})(?:\\s+DE\\s+(\\d{4}))?\\s+A\\s+(\\d{1,2})\\s+DE\\s+(${LETRAS_MES})(?:\\s+DE\\s+(\\d{4}))?$`, 'u'));
    if (!m) return null;
    const mesIni = mesDesdePalabra(m[2]);
    const mesFin = mesDesdePalabra(m[5]);
    if (!mesIni || !mesFin) return null;
    const anioIni = m[3] ? Number(m[3]) : anioCercano(mesIni, mesGrupo, anioGrupo);
    const anioFin = m[6] ? Number(m[6]) : anioIni + (mesFin < mesIni ? 1 : 0);
    return {
      inicio: fechaISO(anioIni, mesIni, Number(m[1])),
      fin: fechaISO(anioFin, mesFin, Number(m[4]))
    };
  }
  function xml(texto) {
    const doc = new DOMParser().parseFromString(texto, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) {
      throw new Error('Uno de los archivos XML/XHTML del EPUB contiene errores.');
    }
    return doc;
  }
  function xmlText(doc, nombreLocal) {
    const el = Array.from(doc.getElementsByTagName('*'))
      .find(n => n.localName.toLowerCase() === nombreLocal.toLowerCase());
    return el ? limpio(el.textContent) : '';
  }
  function carpeta(path) { return path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : ''; }
  function pathNormalizado(path) {
    const pila = [];
    for (const p of path.split('/')) {
      if (!p || p === '.') continue;
      if (p === '..') pila.pop();
      else pila.push(p);
    }
    return pila.join('/');
  }
  function infoGrupo(titulo, filename) {
    const t = sinTildes(titulo);
    const yearMatch = t.match(/(?:19|20)\d{2}/);
    const filenameMatch = filename.match(/((?:19|20)\d{2})[_-]?(0[1-9]|1[0-2])/);
    const year = yearMatch ? Number(yearMatch[0]) : filenameMatch ? Number(filenameMatch[1]) : null;
    const meses = [...t.matchAll(/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/g)]
      .map(x => mesDesdePalabra(x[1]));
    const mes = meses[0] || (filenameMatch ? Number(filenameMatch[2]) : null);
    if (!year || !mes) throw new Error('No se pudo reconocer el año o el mes del título del EPUB.');
    const segundo = meses.length > 1 ? meses[1] : (mes % 12) + 1;
    return {
      anio: year,
      mes: mes,
      id: `${year}_${String(mes).padStart(2, '0')}`,
      nombre: `${nombreMes(mes)} - ${nombreMes(segundo)} ${year}`
    };
  }
  function seccionDesdeTitulo(texto) {
    const t = sinTildes(texto).toUpperCase();
    if (t === 'TESOROS DE LA BIBLIA') return 'tesoros';
    if (t === 'SEAMOS MEJORES MAESTROS') return 'maestros';
    if (t === 'NUESTRA VIDA CRISTIANA') return 'vida';
    return null;
  }
  function esSemana(texto) {
    return /^\d{1,2}(?:\s*[-–—]\s*\d{1,2})?\s+DE\s+/iu.test(limpio(texto));
  }
  function lectura(cadena, anio, mes, warnings, source) {
    const doc = xml(cadena);
    const items = Array.from(doc.querySelectorAll('h1,h2,h3,p'));
    const h1 = items.find(n => n.localName.toLowerCase() === 'h1' && esSemana(n.textContent));
    if (!h1) return null;
    const etiqueta = limpio(h1.textContent);
    const fechas = fechasSemana(etiqueta, anio, mes);
    if (!fechas) {
      warnings.push(`No se reconocieron las fechas de «${etiqueta}» (${source}).`);
      return null;
    }
    const semana = {
      semana: etiqueta,
      semana_inicio: fechas.inicio,
      semana_fin: fechas.fin,
      lectura: '',
      partes: []
    };
    let seccion = 'apertura';
    let orden = 0;
    function incluir(secc, tipo, titulo, minutos = null, numero_visible = null, indicaciones = '') {
      semana.partes.push({
        clave_importacion: `${fechas.inicio}-${String(++orden).padStart(3, '0')}`,
        orden,
        seccion: secc,
        tipo,
        numero_visible,
        titulo: limpio(titulo),
        minutos,
        indicaciones: limpio(indicaciones)
      });
    }
    for (let i = 0; i < items.length; i++) {
      const node = items[i];
      const tag = node.localName.toLowerCase();
      const t = limpio(node.textContent);
      if (tag === 'h2') {
        const nueva = seccionDesdeTitulo(t);
        if (nueva) seccion = nueva;
        else if (!semana.lectura && seccion === 'apertura') semana.lectura = t;
        continue;
      }
      if (tag !== 'h3') continue;
      const numero = t.match(RE_NUMERO);
      if (numero) {
        let duracion = null;
        let indicaciones = '';
        // Primer párrafo que empieza con (N mins.), antes del siguiente encabezado.
        for (let j = i + 1; j < items.length; j++) {
          const siguiente = items[j];
          const nextTag = siguiente.localName.toLowerCase();
          if (/^h[1-3]$/.test(nextTag)) break;
          if (nextTag !== 'p') continue;
          const texto = limpio(siguiente.textContent);
          const hallado = texto.match(/^\s*\(\s*(\d+(?:[,.]\d+)?)\s*mins?\.?\s*\)/iu);
          if (hallado) {
            duracion = Number(hallado[1].replace(',', '.'));
            indicaciones = texto.slice(hallado[0].length).trim();
            break;
          }
        }
        if (duracion === null) warnings.push(`Sin duración: ${etiqueta}, ${t}`);
        incluir(seccion, 'parte', t, duracion, Number(numero[1]), indicaciones);
        continue;
      }
      // Apertura: canción + oración + palabras de introducción.
      if (seccion === 'apertura' && /canci[oó]n\s*\d+/iu.test(t) && /introducci[oó]n/iu.test(t)) {
        const cancion = t.match(/canci[oó]n\s*(\d+)/iu);
        const duracion = t.match(RE_MINUTOS);
        incluir('apertura', 'cancion', `Canción ${cancion[1]}`);
        incluir('apertura', 'oracion', 'Oración inicial');
        incluir('apertura', 'introduccion', 'Palabras de introducción', duracion ? Number(duracion[1].replace(',', '.')) : null);
        continue;
      }
      // Cierre: conclusión + canción + oración, incluso cuando están en un mismo H3.
      if (/palabras de conclusi[oó]n/iu.test(t)) {
        const duracion = t.match(RE_MINUTOS);
        incluir('cierre', 'conclusion', 'Palabras de conclusión', duracion ? Number(duracion[1].replace(',', '.')) : null);
        const cancion = t.match(/canci[oó]n\s*(\d+)/iu);
        if (cancion) incluir('cierre', 'cancion', `Canción ${cancion[1]}`);
        if (/oraci[oó]n/iu.test(t)) incluir('cierre', 'oracion', 'Oración final');
        continue;
      }
      // Canción intermedia en su posición real, no al principio del JSON.
      const song = t.match(/^canci[oó]n\s*(\d+)\b/iu);
      if (song) incluir(seccion, 'cancion', `Canción ${song[1]}`);
    }
    const numeradas = semana.partes.filter(p => p.numero_visible !== null);
    if (!numeradas.length) warnings.push(`No se encontraron partes numeradas en ${etiqueta}.`);
    if (semana.partes.filter(p => p.tipo === 'cancion').length !== 3) {
      warnings.push(`Revisar canciones de ${etiqueta}: no se detectaron exactamente tres.`);
    }
    return semana;
  }

  async function desdeEpub(file) {
    if (typeof JSZip === 'undefined') {
      throw new Error('No se cargó JSZip. Revisa la conexión y el script CDN de index.html.');
    }
    if (file.size > 35 * 1024 * 1024) throw new Error('El EPUB supera el límite de 35 MB para esta versión.');
    let zip;
    try { zip = await JSZip.loadAsync(file); }
    catch (_) { throw new Error('No se pudo abrir el EPUB. Verifica que sea un archivo EPUB válido.'); }
    const container = zip.file('META-INF/container.xml');
    if (!container) throw new Error('El EPUB no contiene META-INF/container.xml.');
    const rootDoc = xml(await container.async('string'));
    const rootFile = Array.from(rootDoc.getElementsByTagName('*'))
      .find(n => n.localName === 'rootfile');
    const opfPath = rootFile && rootFile.getAttribute('full-path');
    if (!opfPath || !zip.file(opfPath)) throw new Error('No se localizó el índice OPF del EPUB.');
    const opf = xml(await zip.file(opfPath).async('string'));
    const titulo = xmlText(opf, 'title');
    const grupo = infoGrupo(titulo, file.name);
    const directorio = carpeta(opfPath);
    const mapa = new Map();
    for (const el of Array.from(opf.getElementsByTagName('*')).filter(x => x.localName === 'item')) {
      mapa.set(el.getAttribute('id'), {
        ruta: pathNormalizado(directorio + (el.getAttribute('href') || '').split('#')[0]),
        formato: el.getAttribute('media-type') || ''
      });
    }
    const spine = Array.from(opf.getElementsByTagName('*'))
      .filter(x => x.localName === 'itemref');
    const warnings = [];
    const semanas = [];
    const seen = new Set();
    for (const item of spine) {
      const ref = mapa.get(item.getAttribute('idref'));
      if (!ref || !/xhtml|html/i.test(ref.formato)) continue;
      if (/(?:-extracted|pagenav\d*|cover)\.xhtml?$/i.test(ref.ruta)) continue;
      const archive = zip.file(ref.ruta);
      if (!archive) { warnings.push(`No se encontró ${ref.ruta} dentro del EPUB.`); continue; }
      const contenido = await archive.async('string');
      if (contenido.length > 2_000_000) { warnings.push(`Se omitió archivo XHTML demasiado grande: ${ref.ruta}`); continue; }
      let semana;
      try { semana = lectura(contenido, grupo.anio, grupo.mes, warnings, ref.ruta); }
      catch (err) { warnings.push(`Error leyendo ${ref.ruta}: ${err.message}`); continue; }
      if (semana && !seen.has(semana.semana_inicio)) {
        seen.add(semana.semana_inicio);
        semanas.push(semana);
      }
    }
    semanas.sort((a, b) => a.semana_inicio.localeCompare(b.semana_inicio));
    if (!semanas.length) throw new Error('No se encontraron semanas. El formato de este EPUB puede ser diferente.');
    return {
      json: {
        version_formato: 2,
        grupo_id: grupo.id,
        grupo_nombre: grupo.nombre,
        titulo_fuente: titulo,
        archivo_origen: file.name,
        semanas
      },
      advertencias: warnings
    };
  }

  function desdeJson(text) {
    let original;
    try { original = JSON.parse(text); }
    catch (_) { throw new Error('El archivo no contiene JSON válido.'); }
    if (!original || !Array.isArray(original.semanas)) throw new Error('El JSON debe contener un arreglo llamado «semanas».');
    if (original.version_formato === 2) {
      if (!original.semanas.every(s => Array.isArray(s.partes))) throw new Error('Hay semanas sin la lista «partes».');
      return { json: original, advertencias: [] };
    }
    // Adaptación limitada del formato 2026_07.json, sin inventar datos que no están en él.
    const m = String(original.grupo_id || '').match(/^(\d{4})_(\d{2})$/);
    if (!m) throw new Error('El JSON antiguo necesita un grupo_id como 2026_07.');
    const anio = Number(m[1]);
    const mes = Number(m[2]);
    const avisos = ['JSON antiguo: no incluye oraciones, introducción ni conclusión. No se han inventado.',
      'Las posiciones de las tres canciones se reconstruyeron por su orden (apertura, intermedia y cierre); revísalas.'];
    const semanas = original.semanas.map(s => {
      const fechas = fechasSemana(s.semana, anio, mes);
      if (!fechas) throw new Error(`No se reconocieron las fechas de: ${s.semana}`);
      const songs = s.partes.filter(p => sinTildes(p.seccion) === 'canciones');
      const numbered = s.partes.filter(p => sinTildes(p.seccion) !== 'canciones');
      const partes = [];
      function incluir(sec, tipo, titulo, min, num) {
        partes.push({
          clave_importacion: `${fechas.inicio}-${String(partes.length + 1).padStart(3, '0')}`,
          orden: partes.length + 1, seccion: sec, tipo,
          numero_visible: num,
          titulo: limpio(titulo), minutos: min,
          indicaciones: ''
        });
      }
      if (songs[0]) incluir('apertura', 'cancion', songs[0].titulo, null, null);
      let addedMiddle = false;
      for (const p of numbered) {
        const secText = sinTildes(p.seccion);
        const sec = secText.includes('tesoros') ? 'tesoros' : secText.includes('maestros') ? 'maestros' : 'vida';
        if (sec === 'vida' && !addedMiddle) {
          if (songs[1]) incluir('vida', 'cancion', songs[1].titulo, null, null);
          addedMiddle = true;
        }
        const nm = limpio(p.titulo).match(RE_NUMERO);
        const num = nm ? Number(nm[1]) : null;
        const mins = p.minutos == null || p.minutos === '' ? null : Number(p.minutos);
        incluir(sec, 'parte', p.titulo, Number.isFinite(mins) ? mins : null, num);
      }
      if (songs[2]) incluir('cierre', 'cancion', songs[2].titulo, null, null);
      if (songs.length !== 3) avisos.push(`Revisar canciones de ${s.semana}: se encontraron ${songs.length}.`);
      return {
        semana: limpio(s.semana), semana_inicio: fechas.inicio, semana_fin: fechas.fin,
        lectura: limpio(s.lectura), partes
      };
    });
    return {
      json: {
        version_formato: 2,
        grupo_id: original.grupo_id,
        grupo_nombre: original.grupo_nombre || `${nombreMes(mes)} ${anio}`,
        titulo_fuente: 'Importación de JSON antiguo',
        archivo_origen: 'JSON importado',
        semanas
      },
      advertencias: avisos
    };
  }

  window.VMCEpub = Object.freeze({ desdeEpub, desdeJson });
})();
