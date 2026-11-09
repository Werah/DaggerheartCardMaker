/* Lógica principal do editor. */
(function () {
  const $ = (id) => document.getElementById(id);
  const R = window.DH_RENDER;
  const TYPES = ['class', 'subclass', 'ancestry', 'community', 'domain'];
  const TYPE_NAMES = {
    class: 'Classe', subclass: 'Subclasse', ancestry: 'Ancestralidade',
    community: 'Comunidade', domain: 'Carta de Domínio',
  };

  /* ------------------------------------------------------------------ */
  /* Valores de exemplo                                                  */
  /* ------------------------------------------------------------------ */
  function defaults(type) {
    const base = {
      type, title: '', label: '', subtitle: '', level: 1, recall: '', description: '', text: '',
      evasion: '', hp: '', color: '#4e345b', gold: '#e7b93c',
      dom1: { preset: 'arcana', icon: null }, dom2: { preset: 'blade', icon: null },
      iconKeepColors: false, textScale: 1, artist: '', footer: 'Homebrew', art: null,
    };
    const ex = {
      domain: {
        title: 'Eco Arcano', label: 'Magia', level: 4, recall: '1', color: '#4e345b',
        dom1: { preset: 'arcana', icon: null },
        text: 'Quando um aliado a até Perto conjurar uma magia, você pode **gastar 2 Esperança** para repetir o efeito dela contra um alvo diferente.\nUse esta carta uma vez por descanso longo.',
      },
      subclass: {
        title: 'Sentinela de Aço', label: 'Guardião', subtitle: 'Fundamental', color: '#c8401b',
        dom1: { preset: 'valor', icon: null }, dom2: { preset: 'blade', icon: null },
        text: '***Muralha Viva:*** Quando um aliado a até Muito Perto sofrer dano, você pode **marcar 1 Estresse** para receber o dano no lugar dele.\n***Postura Firme:*** Enquanto estiver empunhando um escudo, você não pode ser derrubado nem empurrado.',
      },
      class: {
        title: 'Andarilho', label: 'Classe', subtitle: 'Domínios: Sábio e Meia-noite', color: '#2f5d46',
        evasion: '10', hp: '6',
        dom1: { preset: 'sage', icon: null }, dom2: { preset: 'midnight', icon: null },
        description: 'Viajantes incansáveis que conhecem cada trilha esquecida e cada abrigo escondido.',
        text: '***Recurso de Esperança — Passo Certeiro:*** **Gaste 3 Esperança** para se mover até um ponto Distante sem fazer testes, ignorando terreno difícil.\n***Rastreador:*** Você tem vantagem em testes para seguir pegadas ou encontrar caminhos.',
      },
      ancestry: {
        title: 'Mariposa', label: 'Ancestralidade',
        description: 'Mariposas são um povo noturno de asas felpudas, atraído por luzes e segredos.',
        text: '***Asas Silenciosas:*** Você pode voar. Enquanto voa no escuro, tem vantagem em testes para se esconder.\n***Olhos Noturnos:*** Você enxerga na penumbra como se fosse dia claro.',
      },
      community: {
        title: 'Porto-Névoa', label: 'Comunidade',
        description: 'Ser de Porto-Névoa significa crescer entre docas encharcadas, sinos de nevoeiro e contrabandistas gentis.',
        text: '***Conhecer as Marés:*** Ao negociar com marinheiros, mercadores ou contrabandistas, você pode **gastar 1 Esperança** para descobrir um boato útil sobre a região.',
      },
    };
    return { ...base, ...ex[type] };
  }

  const LABEL_SUGGESTIONS = {
    domain: ['Magia', 'Habilidade', 'Grimório'],
    subclass: ['Bardo', 'Druida', 'Guardião', 'Patrulheiro', 'Ladino', 'Serafim', 'Feiticeiro', 'Guerreiro', 'Mago'],
    class: ['Classe'],
    ancestry: ['Ancestralidade'],
    community: ['Comunidade'],
  };
  const SUBTITLE_SUGGESTIONS = {
    subclass: ['Fundamental', 'Especialização', 'Maestria'],
    class: [],
  };

  /* ------------------------------------------------------------------ */
  /* Estado                                                              */
  /* ------------------------------------------------------------------ */
  const app = {
    current: 'domain',
    cards: Object.fromEntries(TYPES.map((t) => [t, defaults(t)])),
    back: { enabled: false, src: null, crop: null },
    sheet: { items: [], gap: 2, cut: true },
    view: 'editor',
    editingId: null,
    stash: null,
  };
  const cur = () => app.cards[app.current];
  const clone = (o) => JSON.parse(JSON.stringify(o));

  /* ------------------------------------------------------------------ */
  /* Utilidades                                                          */
  /* ------------------------------------------------------------------ */
  let toastTimer = null;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
  }
  function slug(s) {
    return (s || 'carta').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'carta';
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function download(href, name) {
    const a = document.createElement('a');
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // Lê um arquivo de imagem e reduz para no máximo maxDim px.
  function readImageFile(file, maxDim, forcePng) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith('image/')) { reject(new Error('Arquivo não é uma imagem')); return; }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const r = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * r));
        c.height = Math.max(1, Math.round(img.naturalHeight * r));
        const x = c.getContext('2d');
        x.imageSmoothingQuality = 'high';
        x.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        let png = forcePng;
        if (!png && /png|webp|gif|svg/.test(file.type)) {
          const data = x.getImageData(0, 0, c.width, c.height).data;
          for (let i = 3; i < data.length; i += 4) if (data[i] < 250) { png = true; break; }
        }
        resolve(png ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.92));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível ler a imagem')); };
      img.src = url;
    });
  }

  /* ------------------------------------------------------------------ */
  /* Renderização                                                        */
  /* ------------------------------------------------------------------ */
  let rafId = 0;
  function scheduleRender() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      R.renderFront($('frontCanvas'), cur());
      if (app.back.enabled) R.renderBack($('backCanvas'), cur(), app.back);
    });
  }
  R.setOnImageLoad(scheduleRender);

  async function renderOffscreen(s, back) {
    await R.whenReady(s, back);
    const front = document.createElement('canvas');
    front.width = R.W; front.height = R.H;
    R.renderFront(front, s);
    let backC = null;
    if (back) {
      backC = document.createElement('canvas');
      backC.width = R.W; backC.height = R.H;
      R.renderBack(backC, s, back);
    }
    return { front, back: backC };
  }

  /* ------------------------------------------------------------------ */
  /* Formulário                                                          */
  /* ------------------------------------------------------------------ */
  const TEXT_FIELDS = ['title', 'label', 'subtitle', 'recall', 'evasion', 'hp', 'description', 'text', 'artist', 'footer', 'color', 'gold'];

  function fillDomainSelect(sel) {
    sel.innerHTML = DH_ICONS.DOMAINS.map((d) => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');
  }
  fillDomainSelect($('f_dom1Preset'));
  fillDomainSelect($('f_dom2Preset'));

  function updateIconThumb(el, dom, s) {
    let src;
    if (dom.icon) src = dom.icon;
    else src = DH_ICONS.svgDataUrl(DH_ICONS.domainById(dom.preset).icon, '#ffffff');
    el.style.backgroundColor = s.color;
    el.style.backgroundImage = `url("${src}")`;
  }

  function updateArtUI() {
    const s = cur();
    const has = !!(s.art && s.art.src);
    const th = $('artThumb');
    th.classList.toggle('has-img', has);
    th.style.backgroundImage = has ? `url("${s.art.src}")` : '';
    $('artCropBtn').disabled = !has;
    $('artRemoveBtn').disabled = !has;
  }

  function updateBackUI() {
    $('backEnabled').checked = app.back.enabled;
    $('backControls').classList.toggle('hidden', !app.back.enabled);
    $('backFig').classList.toggle('hidden', !app.back.enabled);
    $('backCropBtn').disabled = !app.back.src;
    $('backRemoveBtn').disabled = !app.back.src;
    $('backUploadBtn').textContent = app.back.src ? 'Trocar imagem do verso' : 'Enviar imagem do verso';
  }

  function fillForm() {
    const s = cur();
    const t = app.current;
    document.querySelectorAll('[data-show]').forEach((el) => {
      el.classList.toggle('hidden', !el.dataset.show.split(' ').includes(t));
    });
    document.querySelectorAll('#typeList button').forEach((b) => b.classList.toggle('active', b.dataset.type === t));
    $('editorTitle').textContent = 'Editar ' + TYPE_NAMES[t].toLowerCase();
    $('domainSummary').textContent = t === 'domain' ? 'Domínio' : 'Estandarte e domínios';

    for (const k of TEXT_FIELDS) $('f_' + k).value = s[k] ?? '';
    $('f_level').value = s.level ?? '';
    $('f_textScale').value = Math.round((s.textScale || 1) * 100);
    $('o_textScale').textContent = Math.round((s.textScale || 1) * 100) + '%';
    $('f_dom1Preset').value = s.dom1.preset;
    $('f_dom2Preset').value = s.dom2.preset;
    $('f_iconKeepColors').checked = !!s.iconKeepColors;

    $('labelList').innerHTML = (LABEL_SUGGESTIONS[t] || []).map((v) => `<option value="${escapeHtml(v)}">`).join('');
    $('subtitleList').innerHTML = (SUBTITLE_SUGGESTIONS[t] || []).map((v) => `<option value="${escapeHtml(v)}">`).join('');

    updateIconThumb($('dom1Thumb'), s.dom1, s);
    updateIconThumb($('dom2Thumb'), s.dom2, s);
    updateArtUI();
    updateBackUI();
    updateEditingUI();
  }

  function changed() {
    scheduleRender();
    scheduleSave();
  }

  for (const k of TEXT_FIELDS) {
    $('f_' + k).addEventListener('input', (e) => {
      cur()[k] = e.target.value;
      if (k === 'color') {
        updateIconThumb($('dom1Thumb'), cur().dom1, cur());
        updateIconThumb($('dom2Thumb'), cur().dom2, cur());
      }
      changed();
    });
  }
  $('f_level').addEventListener('input', (e) => { cur().level = e.target.value; changed(); });
  $('f_textScale').addEventListener('input', (e) => {
    cur().textScale = Number(e.target.value) / 100;
    $('o_textScale').textContent = e.target.value + '%';
    changed();
  });
  $('f_iconKeepColors').addEventListener('change', (e) => { cur().iconKeepColors = e.target.checked; changed(); });

  $('f_dom1Preset').addEventListener('change', (e) => {
    const s = cur();
    s.dom1 = { preset: e.target.value, icon: null };
    if (s.type === 'domain') {
      s.color = DH_ICONS.domainById(e.target.value).color;
      $('f_color').value = s.color;
    }
    fillForm();
    changed();
  });
  $('f_dom2Preset').addEventListener('change', (e) => {
    cur().dom2 = { preset: e.target.value, icon: null };
    fillForm();
    changed();
  });

  function bindIconUpload(slot) {
    const file = $(slot + 'File');
    $(slot + 'UploadBtn').addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      const f = file.files[0];
      file.value = '';
      if (!f) return;
      try {
        cur()[slot].icon = await readImageFile(f, 256, true);
        fillForm();
        changed();
      } catch (err) { toast(err.message); }
    });
    $(slot + 'ResetBtn').addEventListener('click', () => {
      cur()[slot].icon = null;
      fillForm();
      changed();
    });
  }
  bindIconUpload('dom1');
  bindIconUpload('dom2');

  // Barra de formatação do texto
  document.querySelectorAll('.fmt-bar button').forEach((b) => {
    b.addEventListener('click', () => {
      const ta = $('f_text');
      const m = b.dataset.fmt;
      const { selectionStart: a, selectionEnd: z, value } = ta;
      let sel = value.slice(a, z);
      if (!sel && m === '***') sel = 'Nome:';
      const next = value.slice(0, a) + m + sel + m + value.slice(z);
      ta.value = next;
      ta.focus();
      if (sel) ta.setSelectionRange(a + m.length, a + m.length + sel.length);
      else ta.setSelectionRange(a + m.length, a + m.length);
      cur().text = next;
      changed();
    });
  });

  // Tipo de carta
  document.querySelectorAll('#typeList button').forEach((b) => {
    b.addEventListener('click', () => {
      app.current = b.dataset.type;
      fillForm();
      setView('editor');
      changed();
    });
  });

  $('resetBtn').addEventListener('click', () => {
    if (!confirm('Começar uma nova carta deste tipo? O conteúdo atual do editor será substituído pelo exemplo.')) return;
    app.cards[app.current] = defaults(app.current);
    fillForm();
    changed();
  });

  /* ------------------------------------------------------------------ */
  /* Imagem da carta                                                     */
  /* ------------------------------------------------------------------ */
  function artAspect() {
    const a = R.ART[app.current];
    return a.w / a.h;
  }

  async function setArtFromFile(f) {
    try {
      const src = await readImageFile(f, 2400, false);
      const crop = await DH_CROP.open(src, artAspect(), null);
      if (!crop) return;
      cur().art = { src, crop };
      updateArtUI();
      changed();
    } catch (err) { toast(err.message); }
  }

  $('artUploadBtn').addEventListener('click', () => $('artFile').click());
  $('artFile').addEventListener('change', () => {
    const f = $('artFile').files[0];
    $('artFile').value = '';
    if (f) setArtFromFile(f);
  });
  $('artCropBtn').addEventListener('click', async () => {
    const s = cur();
    if (!s.art) return;
    const crop = await DH_CROP.open(s.art.src, artAspect(), s.art.crop);
    if (crop) { s.art.crop = crop; changed(); }
  });
  $('artRemoveBtn').addEventListener('click', () => {
    cur().art = null;
    updateArtUI();
    changed();
  });

  // Arrastar e soltar
  const wrap = $('previewWrap');
  ['dragenter', 'dragover'].forEach((ev) => wrap.addEventListener(ev, (e) => {
    e.preventDefault();
    wrap.classList.add('drag-over');
  }));
  ['dragleave', 'drop'].forEach((ev) => wrap.addEventListener(ev, (e) => {
    e.preventDefault();
    wrap.classList.remove('drag-over');
  }));
  wrap.addEventListener('drop', (e) => {
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f) return;
    if (e.target && e.target.id === 'backCanvas' && app.back.enabled) setBackFromFile(f);
    else setArtFromFile(f);
  });
  $('frontCanvas').addEventListener('dblclick', () => {
    if (cur().art) $('artCropBtn').click();
    else $('artFile').click();
  });

  /* ------------------------------------------------------------------ */
  /* Verso                                                               */
  /* ------------------------------------------------------------------ */
  $('backEnabled').addEventListener('change', (e) => {
    app.back.enabled = e.target.checked;
    updateBackUI();
    changed();
  });
  async function setBackFromFile(f) {
    try {
      const src = await readImageFile(f, 2200, false);
      const crop = await DH_CROP.open(src, R.W / R.H, null);
      if (!crop) return;
      app.back.src = src;
      app.back.crop = crop;
      updateBackUI();
      changed();
    } catch (err) { toast(err.message); }
  }
  $('backUploadBtn').addEventListener('click', () => $('backFile').click());
  $('backFile').addEventListener('change', () => {
    const f = $('backFile').files[0];
    $('backFile').value = '';
    if (f) setBackFromFile(f);
  });
  $('backCropBtn').addEventListener('click', async () => {
    if (!app.back.src) return;
    const crop = await DH_CROP.open(app.back.src, R.W / R.H, app.back.crop);
    if (crop) { app.back.crop = crop; changed(); }
  });
  $('backRemoveBtn').addEventListener('click', () => {
    app.back.src = null;
    app.back.crop = null;
    updateBackUI();
    changed();
  });
  $('backCanvas').addEventListener('dblclick', () => {
    if (app.back.src) $('backCropBtn').click();
    else $('backFile').click();
  });

  /* ------------------------------------------------------------------ */
  /* Exportação da carta                                                 */
  /* ------------------------------------------------------------------ */
  function backCfg() {
    return app.back.enabled ? { src: app.back.src, crop: app.back.crop } : null;
  }

  $('pngBtn').addEventListener('click', async () => {
    const s = cur();
    const { front, back } = await renderOffscreen(s, backCfg());
    let out = front;
    if (back) {
      out = document.createElement('canvas');
      out.width = R.W * 2; out.height = R.H;
      const x = out.getContext('2d');
      x.drawImage(front, 0, 0);
      x.drawImage(back, R.W, 0);
    }
    out.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      download(url, slug(s.title) + (back ? '-frente-verso' : '') + '.png');
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }, 'image/png');
  });

  $('pdfBtn').addEventListener('click', async () => {
    if (!window.jspdf) { toast('Biblioteca de PDF não carregou (verifique a internet).'); return; }
    const s = cur();
    const { front, back } = await renderOffscreen(s, backCfg());
    const cw = DH_SHEET.CARD_W, chh = DH_SHEET.CARD_H;
    const w = back ? cw * 2 : cw;
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: [w, chh], orientation: w > chh ? 'landscape' : 'portrait' });
    doc.addImage(front.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, cw, chh);
    if (back) doc.addImage(back.toDataURL('image/jpeg', 0.95), 'JPEG', cw, 0, cw, chh);
    doc.save(slug(s.title) + '.pdf');
  });

  /* ------------------------------------------------------------------ */
  /* Folha A4                                                            */
  /* ------------------------------------------------------------------ */
  let uid = Date.now();
  const newId = () => 'c' + (uid++).toString(36);

  $('addSheetBtn').addEventListener('click', async () => {
    const btn = $('addSheetBtn');
    btn.disabled = true;
    try {
      const s = cur();
      const bc = backCfg();
      const { front, back } = await renderOffscreen(s, bc);
      const item = {
        id: newId(),
        type: s.type,
        title: s.title || TYPE_NAMES[s.type],
        front: front.toDataURL('image/jpeg', 0.95),
        back: back ? back.toDataURL('image/jpeg', 0.95) : null,
        state: clone(s),
        backCfg: bc ? clone(bc) : null,
        qty: 1,
      };
      const idx = app.editingId ? app.sheet.items.findIndex((i) => i.id === app.editingId) : -1;
      if (idx >= 0) {
        item.id = app.editingId;
        item.qty = app.sheet.items[idx].qty;
        app.sheet.items[idx] = item;
        app.editingId = null;
        app.stash = null;
        toast('Carta atualizada na folha A4');
      } else {
        app.sheet.items.push(item);
        toast(`Carta adicionada à folha A4 (${app.sheet.items.length} no total)`);
      }
      updateEditingUI();
      refreshSheet();
      scheduleSave();
    } finally {
      btn.disabled = false;
    }
  });

  function updateEditingUI() {
    const editing = !!app.editingId && app.sheet.items.some((i) => i.id === app.editingId);
    if (!editing) app.editingId = null;
    $('editingBanner').classList.toggle('hidden', !editing);
    $('addSheetBtn').textContent = editing ? '✓ Atualizar carta na folha A4' : '+ Adicionar à folha A4';
  }

  function editItem(id) {
    const it = app.sheet.items.find((i) => i.id === id);
    if (!it) return;
    if (!app.editingId) app.stash = { current: app.current, card: clone(app.cards[it.type]), back: clone(app.back) };
    app.editingId = id;
    app.current = it.type;
    app.cards[it.type] = clone(it.state);
    if (it.backCfg) app.back = { enabled: true, src: it.backCfg.src, crop: it.backCfg.crop };
    else app.back = { ...app.back, enabled: false };
    setView('editor');
    fillForm();
    changed();
  }

  $('cancelEditBtn').addEventListener('click', () => {
    const it = app.sheet.items.find((i) => i.id === app.editingId);
    if (app.stash && it) {
      app.cards[it.type] = app.stash.card;
      app.back = app.stash.back;
      app.current = app.stash.current;
    }
    app.editingId = null;
    app.stash = null;
    fillForm();
    refreshSheet();
    changed();
  });

  function refreshSheet() {
    const items = app.sheet.items;
    $('sheetCount').textContent = items.reduce((n, i) => n + (parseInt(i.qty, 10) || 1), 0);
    $('sheetGap').value = app.sheet.gap;
    $('sheetCutLines').checked = app.sheet.cut;
    $('sheetEmpty').classList.toggle('hidden', items.length > 0);
    if (app.view !== 'sheet') return;
    DH_SHEET.renderPages($('sheetPages'), items, { gap: app.sheet.gap, cut: app.sheet.cut });

    const list = $('sheetList');
    list.innerHTML = '';
    items.forEach((it, i) => {
      const el = document.createElement('div');
      el.className = 'sheet-item' + (it.id === app.editingId ? ' editing' : '');
      el.innerHTML = `
        <div class="thumbs">
          <img src="${it.front}" alt="">
          ${it.back ? `<img src="${it.back}" alt="">` : ''}
        </div>
        <div class="name" title="${escapeHtml(it.title)}">${escapeHtml(it.title)}</div>
        <div class="meta">${TYPE_NAMES[it.type]}${it.back ? ' • frente e verso' : ''}</div>
        <label class="qty">Cópias <input type="number" min="1" max="99" value="${parseInt(it.qty, 10) || 1}"></label>
        <div class="acts">
          <button data-a="edit">Editar</button>
          <button data-a="dup">Duplicar</button>
          <button data-a="left" ${i === 0 ? 'disabled' : ''}>◀ Mover</button>
          <button data-a="right" ${i === items.length - 1 ? 'disabled' : ''}>Mover ▶</button>
          <button data-a="del" class="btn-danger" style="grid-column: span 2">Remover</button>
        </div>`;
      el.querySelector('.qty input').addEventListener('change', (e) => {
        it.qty = Math.max(1, Math.min(99, parseInt(e.target.value, 10) || 1));
        refreshSheet();
        scheduleSave();
      });
      el.querySelectorAll('.acts button').forEach((b) => b.addEventListener('click', () => {
        const a = b.dataset.a;
        if (a === 'edit') { editItem(it.id); return; }
        if (a === 'dup') items.splice(i + 1, 0, { ...clone(it), id: newId() });
        if (a === 'left' && i > 0) [items[i - 1], items[i]] = [items[i], items[i - 1]];
        if (a === 'right' && i < items.length - 1) [items[i + 1], items[i]] = [items[i], items[i + 1]];
        if (a === 'del') {
          if (!confirm(`Remover “${it.title}” da folha?`)) return;
          items.splice(i, 1);
          if (it.id === app.editingId) { app.editingId = null; updateEditingUI(); }
        }
        refreshSheet();
        scheduleSave();
      }));
      list.appendChild(el);
    });
  }

  $('sheetGap').addEventListener('change', (e) => {
    app.sheet.gap = Math.max(0, Math.min(6, Number(e.target.value) || 0));
    refreshSheet();
    scheduleSave();
  });
  $('sheetCutLines').addEventListener('change', (e) => {
    app.sheet.cut = e.target.checked;
    refreshSheet();
    scheduleSave();
  });
  $('sheetClearBtn').addEventListener('click', () => {
    if (!app.sheet.items.length) return;
    if (!confirm('Remover todas as cartas da folha A4?')) return;
    app.sheet.items = [];
    app.editingId = null;
    updateEditingUI();
    refreshSheet();
    scheduleSave();
  });
  $('sheetPdfBtn').addEventListener('click', () => {
    if (!app.sheet.items.length) { toast('Adicione cartas à folha primeiro.'); return; }
    if (!window.jspdf) { toast('Biblioteca de PDF não carregou (verifique a internet).'); return; }
    DH_SHEET.exportPdf(app.sheet.items, { gap: app.sheet.gap, cut: app.sheet.cut });
  });
  $('sheetPrintBtn').addEventListener('click', () => {
    if (!app.sheet.items.length) { toast('Adicione cartas à folha primeiro.'); return; }
    DH_SHEET.print(app.sheet.items, { gap: app.sheet.gap, cut: app.sheet.cut });
  });

  function setView(v) {
    app.view = v;
    document.querySelectorAll('.view-switch button').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
    $('editorView').classList.toggle('hidden', v !== 'editor');
    $('sheetView').classList.toggle('hidden', v !== 'sheet');
    if (v === 'sheet') refreshSheet();
  }
  document.querySelectorAll('.view-switch button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

  /* ------------------------------------------------------------------ */
  /* Persistência (IndexedDB + arquivo .json)                            */
  /* ------------------------------------------------------------------ */
  const DB_NAME = 'dh-card-maker', STORE = 'kv', KEY = 'project';
  function db() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbGet() {
    const d = await db();
    return new Promise((resolve, reject) => {
      const r = d.transaction(STORE).objectStore(STORE).get(KEY);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async function idbSet(v) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(v, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  function snapshot() {
    return {
      app: 'daggerheart-card-maker', version: 1,
      current: app.current, cards: app.cards, back: app.back, sheet: app.sheet,
    };
  }
  function applySnapshot(p) {
    if (!p || p.app !== 'daggerheart-card-maker') throw new Error('Arquivo de projeto inválido');
    if (TYPES.includes(p.current)) app.current = p.current;
    for (const t of TYPES) {
      if (p.cards && p.cards[t]) {
        const d = defaults(t);
        app.cards[t] = { ...d, ...p.cards[t], type: t };
        app.cards[t].dom1 = { ...d.dom1, ...(p.cards[t].dom1 || {}) };
        app.cards[t].dom2 = { ...d.dom2, ...(p.cards[t].dom2 || {}) };
      }
    }
    if (p.back) app.back = { enabled: !!p.back.enabled, src: p.back.src || null, crop: p.back.crop || null };
    if (p.sheet) {
      app.sheet = {
        items: Array.isArray(p.sheet.items) ? p.sheet.items.filter((i) => i && i.front && TYPES.includes(i.type)) : [],
        gap: typeof p.sheet.gap === 'number' ? p.sheet.gap : 2,
        cut: p.sheet.cut !== false,
      };
    }
    app.editingId = null;
    app.stash = null;
  }

  let saveTimer = null;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { idbSet(snapshot()).catch(() => {}); } catch (e) { /* armazenamento indisponível */ }
    }, 700);
  }

  $('saveProjectBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(snapshot())], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    download(url, 'projeto-cartas-daggerheart.json');
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  });
  $('loadProjectBtn').addEventListener('click', () => $('projectFile').click());
  $('projectFile').addEventListener('change', async () => {
    const f = $('projectFile').files[0];
    $('projectFile').value = '';
    if (!f) return;
    try {
      applySnapshot(JSON.parse(await f.text()));
      fillForm();
      refreshSheet();
      changed();
      toast('Projeto carregado');
    } catch (err) { toast('Não foi possível abrir: ' + err.message); }
  });

  /* ------------------------------------------------------------------ */
  /* Início                                                              */
  /* ------------------------------------------------------------------ */
  async function init() {
    try {
      const saved = await idbGet();
      if (saved) applySnapshot(saved);
    } catch (e) { /* sem armazenamento: segue com os exemplos */ }
    fillForm();
    refreshSheet();
    scheduleRender();
    R.ensureFonts().then(scheduleRender);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleRender);
  }
  init();
})();
