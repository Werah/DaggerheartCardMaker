/* Lógica principal do editor. */
(function () {
  const $ = (id) => document.getElementById(id);
  const R = window.DH_RENDER;
  const T = window.DH_TYPES;
  const TYPES = T.ORDER;
  const typeName = (t) => T.get(t).name;
  const defaults = (t) => T.defaults(t);

  // Menu lateral gerado a partir do registro de tipos
  $('typeList').innerHTML = TYPES.map((t) =>
    `<button data-type="${t}"><span class="ti">${T.get(t).icon}</span>${T.get(t).name}</button>`).join('');
  $('f_itemKind').innerHTML = T.ITEM_KINDS.map((k) => `<option value="${k.id}">${k.name}</option>`).join('');

  /* ------------------------------------------------------------------ */
  /* Estado                                                              */
  /* ------------------------------------------------------------------ */
  const app = {
    current: 'domain',
    cards: Object.fromEntries(TYPES.map((t) => [t, defaults(t)])),
    back: { enabled: false, src: null, crop: null },
    sheet: { items: [], gap: 2, cut: true, unlink: false },
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
        resolve(png ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.95));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível ler a imagem')); };
      img.src = url;
    });
  }

  /* ------------------------------------------------------------------ */
  /* Renderização                                                        */
  /* ------------------------------------------------------------------ */
  // requestAnimationFrame para fluidez; o timer garante a renderização mesmo com a aba em segundo plano
  let renderPending = false;
  function scheduleRender() {
    if (renderPending) return;
    renderPending = true;
    const run = () => {
      if (!renderPending) return;
      renderPending = false;
      const h = R.cardHeight(cur());
      for (const id of ['frontCanvas', 'backCanvas']) {
        const c = $(id);
        if (c.height !== h) c.height = h;
        c.style.aspectRatio = `${R.W} / ${h}`;
      }
      R.renderFront($('frontCanvas'), cur());
      if (app.back.enabled) R.renderBack($('backCanvas'), cur(), app.back);
    };
    requestAnimationFrame(run);
    setTimeout(run, 60);
  }
  R.setOnImageLoad(scheduleRender);

  // Escala usada em PNG, PDF e impressão: 2 = 1500 x 2100 px (600 dpi no tamanho da carta).
  // A prévia e as miniaturas da folha continuam em 750 x 1050 (300 dpi).
  const PRINT_SCALE = 2;
  const PRINT_JPEG_QUALITY = 1;

  async function renderOffscreen(s, back, scale = 1) {
    await R.whenReady(s, back);
    const h = R.cardHeight(s);
    const front = document.createElement('canvas');
    front.width = R.W * scale; front.height = Math.round(h * scale);
    R.renderFront(front, s);
    let backC = null;
    if (back) {
      backC = document.createElement('canvas');
      backC.width = R.W * scale; backC.height = Math.round(h * scale);
      R.renderBack(backC, s, back);
    }
    return { front, back: backC };
  }

  // Redesenha as cartas da folha em alta resolução a partir dos dados salvos
  // (as imagens guardadas na folha são só miniaturas para a prévia).
  async function hiResItems(items) {
    const out = [];
    for (const it of items) {
      if (!it.state) { out.push(it); continue; }
      const { front, back } = await renderOffscreen(it.state, it.back ? it.backCfg : null, PRINT_SCALE);
      out.push({
        ...it,
        front: front.toDataURL('image/jpeg', PRINT_JPEG_QUALITY),
        back: back ? back.toDataURL('image/jpeg', PRINT_JPEG_QUALITY) : null,
      });
    }
    return out;
  }

  // Versão vetorial (texto e formas nítidos na impressora). Se as bibliotecas de vetor
  // não carregarem (sem internet, por exemplo), usa as imagens em alta resolução.
  async function printItems(items) {
    if (!window.DH_VECTOR || !DH_VECTOR.available()) return hiResItems(items);
    const out = [];
    for (const it of items) {
      if (!it.state) { out.push(it); continue; }
      const back = it.back ? (it.backCfg || {}) : null;
      await R.whenReady(it.state, back);
      out.push({
        ...it,
        frontSvg: DH_VECTOR.cardSvg(it.state, null, 'front'),
        backSvg: back ? DH_VECTOR.cardSvg(it.state, back, 'back') : null,
      });
    }
    return out;
  }

  async function busy(btn, label, fn) {
    const old = btn.textContent;
    btn.disabled = true;
    btn.textContent = label;
    try { await fn(); } finally { btn.disabled = false; btn.textContent = old; }
  }

  /* ------------------------------------------------------------------ */
  /* Formulário                                                          */
  /* ------------------------------------------------------------------ */
  const TEXT_FIELDS = ['title', 'label', 'label2', 'subtitle', 'recall', 'description', 'text', 'artist', 'footer', 'color', 'gold', 'backTitle', 'backText',
    'motives', 'impulses', 'difficulty', 'thresholds', 'advHp', 'advStress', 'atk', 'atkName', 'atkRange', 'atkDamage', 'adversaries'];

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
    const mode = cur().backMode === 'text' ? 'text' : 'image';
    document.querySelectorAll('#backModeSwitch button').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
    $('backModeHint').classList.toggle('hidden', mode !== 'text');
    $('backTextGroup').classList.toggle('hidden', !(app.back.enabled && mode === 'text'));
    $('bgGroup').classList.toggle('hidden', !app.back.enabled);
  }

  function fillForm() {
    const s = cur();
    const t = app.current;
    const def = T.get(t);
    document.querySelectorAll('[data-feat]').forEach((el) => {
      el.classList.toggle('hidden', !el.dataset.feat.split(' ').some((f) => def.features.includes(f)));
    });
    // data-unless: some quando o tipo tem o recurso (ex.: cartas de bloco não têm arte)
    document.querySelectorAll('[data-unless]').forEach((el) => {
      el.classList.toggle('hidden', el.dataset.unless.split(' ').some((f) => def.features.includes(f)));
    });
    $('labelFieldTitle').innerHTML = def.labelTitle
      ? escapeHtml(def.labelTitle)
      : 'Tipo da carta <small>(texto da faixa)</small>';
    $('abilitiesSummary').textContent = def.abilitiesTitle || 'Habilidades';
    $('addAbilityBtn').textContent = '+ Adicionar ' + (def.abilitiesTitle === 'Características' ? 'característica' : 'habilidade');
    $('f_tier').value = String(s.tier || '1');
    renderAbilities();
    document.querySelectorAll('#typeList button').forEach((b) => b.classList.toggle('active', b.dataset.type === t));
    $('editorTitle').textContent = 'Editar ' + typeName(t).toLowerCase();
    $('themeSummary').textContent = def.theme.title;
    $('themeColorLabel').textContent = def.theme.color;
    $('themeDom1Label').textContent = def.theme.dom1;
    $('themeHint').textContent = def.theme.hint;
    $('f_itemKind').value = s.itemKind || 'weapon';
    $('f_multiclass').checked = !!s.multiclass;
    $('label2Field').classList.toggle('hidden', !(def.features.includes('multiclass') && s.multiclass));
    updateStatsUI();

    for (const k of TEXT_FIELDS) $('f_' + k).value = s[k] ?? '';
    $('f_level').value = s.level ?? '';
    $('f_textScale').value = Math.round((s.textScale || 1) * 100);
    $('o_textScale').textContent = Math.round((s.textScale || 1) * 100) + '%';
    $('f_dom1Preset').value = s.dom1.preset;
    $('f_dom2Preset').value = s.dom2.preset;
    $('f_iconKeepColors').checked = !!s.iconKeepColors;
    $('f_bgFade').value = Math.round((Number(s.bgFade) || 0) * 100);
    $('o_bgFade').textContent = Math.round((Number(s.bgFade) || 0) * 100) + '%';

    $('labelList').innerHTML = def.labels.map((v) => `<option value="${escapeHtml(v)}">`).join('');
    $('subtitleList').innerHTML = def.subtitles.map((v) => `<option value="${escapeHtml(v)}">`).join('');

    updateIconThumb($('dom1Thumb'), s.dom1, s);
    updateIconThumb($('dom2Thumb'), s.dom2, s);
    updateArtUI();
    updateBgUI();
    updateBackUI();
    updateEditingUI();
  }

  // Os dois campos de destaque mudam de rótulo (e de dado salvo) conforme o tipo
  function currentStats() {
    const s = cur();
    return T.has(s.type, 'stats') ? T.get(s.type).stats(s) : [];
  }
  function updateStatsUI() {
    const stats = currentStats();
    const s = cur();
    $('statsRow').classList.toggle('hidden', !stats.length);
    [1, 2].forEach((n) => {
      const st = stats[n - 1];
      $('f_stat' + n).closest('.field').classList.toggle('hidden', !st);
      if (!st) return;
      $('l_stat' + n).textContent = st.label;
      $('f_stat' + n).value = s[st.key] ?? '';
    });
  }

  /* ---------- lista de habilidades / características ---------- */
  function renderAbilities() {
    const s = cur();
    const list = $('abilityList');
    if (!T.has(s.type, 'abilities')) { list.innerHTML = ''; return; }
    if (!Array.isArray(s.abilities)) s.abilities = [];
    list.innerHTML = '';
    s.abilities.forEach((a, i) => {
      const el = document.createElement('div');
      el.className = 'ability';
      el.innerHTML = `
        <div class="ability-head">
          <input type="text" class="ab-title" placeholder="Nome (passiva)">
          <button type="button" data-a="up" title="Mover para cima" ${i === 0 ? 'disabled' : ''}>▲</button>
          <button type="button" data-a="down" title="Mover para baixo" ${i === s.abilities.length - 1 ? 'disabled' : ''}>▼</button>
          <button type="button" data-a="del" title="Remover" class="btn-danger">✕</button>
        </div>
        <div class="fmt-bar">
          <button type="button" data-fmt="**" title="Negrito"><b>N</b></button>
          <button type="button" data-fmt="*" title="Itálico"><i>I</i></button>
        </div>
        <textarea class="ab-text" rows="3" placeholder="Texto"></textarea>`;
      const title = el.querySelector('.ab-title');
      const text = el.querySelector('.ab-text');
      title.value = a.title || '';
      text.value = a.text || '';
      title.addEventListener('input', () => { a.title = title.value; changed(); });
      text.addEventListener('input', () => { a.text = text.value; changed(); });
      el.querySelectorAll('.fmt-bar button').forEach((b) => b.addEventListener('click', () => {
        wrapSelection(text, b.dataset.fmt);
        a.text = text.value;
        changed();
      }));
      el.querySelectorAll('.ability-head button').forEach((b) => b.addEventListener('click', () => {
        const arr = s.abilities;
        if (b.dataset.a === 'up' && i > 0) [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
        if (b.dataset.a === 'down' && i < arr.length - 1) [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]];
        if (b.dataset.a === 'del') {
          if ((a.title || a.text) && !confirm(`Remover “${a.title || 'esta habilidade'}”?`)) return;
          arr.splice(i, 1);
        }
        renderAbilities();
        changed();
      }));
      list.appendChild(el);
    });
  }
  function wrapSelection(ta, m) {
    const { selectionStart: a, selectionEnd: z, value } = ta;
    const sel = value.slice(a, z);
    ta.value = value.slice(0, a) + m + sel + m + value.slice(z);
    ta.focus();
    ta.setSelectionRange(a + m.length, a + m.length + sel.length);
  }
  $('addAbilityBtn').addEventListener('click', () => {
    const s = cur();
    if (!Array.isArray(s.abilities)) s.abilities = [];
    s.abilities.push({ title: '', text: '' });
    renderAbilities();
    changed();
    const titles = $('abilityList').querySelectorAll('.ab-title');
    if (titles.length) titles[titles.length - 1].focus();
  });
  $('f_tier').addEventListener('change', (e) => { cur().tier = e.target.value; changed(); });

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
  [1, 2].forEach((n) => {
    $('f_stat' + n).addEventListener('input', (e) => {
      const st = currentStats()[n - 1];
      if (!st) return;
      cur()[st.key] = e.target.value;
      changed();
    });
  });
  $('f_multiclass').addEventListener('change', (e) => {
    cur().multiclass = e.target.checked;
    fillForm();
    changed();
  });
  $('f_itemKind').addEventListener('change', (e) => {
    const s = cur();
    s.itemKind = e.target.value;
    // troca o ícone padrão junto, se a pessoa não enviou um ícone próprio
    const kind = T.ITEM_KINDS.find((k) => k.id === s.itemKind);
    if (kind && !s.dom1.icon) s.dom1.preset = kind.icon;
    fillForm();
    changed();
  });
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
    if (T.get(s.type).presetSetsColor) {
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
        cur()[slot].icon = await readImageFile(f, 512, true);
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
      const field = b.closest('.fmt-bar').dataset.target || 'f_text';
      const ta = $(field);
      const m = b.dataset.fmt;
      const { selectionStart: a, selectionEnd: z, value } = ta;
      let sel = value.slice(a, z);
      if (!sel && m === '***') sel = 'Nome:';
      const next = value.slice(0, a) + m + sel + m + value.slice(z);
      ta.value = next;
      ta.focus();
      if (sel) ta.setSelectionRange(a + m.length, a + m.length + sel.length);
      else ta.setSelectionRange(a + m.length, a + m.length);
      cur()[field === 'f_backText' ? 'backText' : 'text'] = next;
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
    const a = T.artRect(app.current);
    return a.w / a.h;
  }

  async function setArtFromFile(f) {
    try {
      const src = await readImageFile(f, 4000, false);
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

  /* ------------------------------------------------------------------ */
  /* Imagem de fundo da frente                                           */
  /* ------------------------------------------------------------------ */
  function updateBgUI() {
    const s = cur();
    const has = !!(s.bg && s.bg.src);
    const th = $('bgThumb');
    th.classList.toggle('has-img', has);
    th.style.backgroundImage = has ? `url("${s.bg.src}")` : '';
    $('bgCropBtn').disabled = !has;
    $('bgRemoveBtn').disabled = !has;
    $('bgUploadBtn').textContent = has ? 'Trocar fundo' : 'Enviar fundo';
    $('bgFadeField').classList.toggle('hidden', !has);
  }
  $('bgUploadBtn').addEventListener('click', () => $('bgFile').click());
  $('bgFile').addEventListener('change', async () => {
    const f = $('bgFile').files[0];
    $('bgFile').value = '';
    if (!f) return;
    try {
      const src = await readImageFile(f, 4000, false);
      const crop = await DH_CROP.open(src, R.W / R.H, null);
      if (!crop) return;
      cur().bg = { src, crop };
      updateBgUI();
      changed();
    } catch (err) { toast(err.message); }
  });
  $('bgCropBtn').addEventListener('click', async () => {
    const s = cur();
    if (!s.bg) return;
    const crop = await DH_CROP.open(s.bg.src, R.W / R.H, s.bg.crop);
    if (crop) { s.bg.crop = crop; changed(); }
  });
  $('bgRemoveBtn').addEventListener('click', () => {
    cur().bg = null;
    updateBgUI();
    changed();
  });
  $('f_bgFade').addEventListener('input', (e) => {
    cur().bgFade = Number(e.target.value) / 100;
    $('o_bgFade').textContent = e.target.value + '%';
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
  document.querySelectorAll('#backModeSwitch button').forEach((b) => {
    b.addEventListener('click', () => {
      cur().backMode = b.dataset.mode;
      updateBackUI();
      changed();
    });
  });
  async function setBackFromFile(f) {
    try {
      const src = await readImageFile(f, 4000, false);
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

  // PNG no tamanho de carta de poker: 750 x 1050 px gravados como 300 dpi = 63,5 x 88,9 mm.
  const PNG_DPI = 300;
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  // Insere o bloco pHYs (resolução física) logo depois do cabeçalho IHDR do PNG,
  // para que programas de edição/impressão abram a imagem no tamanho real da carta.
  async function pngWithDpi(blob, dpi) {
    const src = new Uint8Array(await blob.arrayBuffer());
    const ihdrEnd = 8 + 4 + 4 + 13 + 4; // assinatura + IHDR completo
    const ppm = Math.round(dpi / 0.0254);
    const chunk = new Uint8Array(4 + 4 + 9 + 4);
    const dv = new DataView(chunk.buffer);
    dv.setUint32(0, 9);
    chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
    dv.setUint32(8, ppm);
    dv.setUint32(12, ppm);
    chunk[16] = 1; // unidade: metro
    dv.setUint32(17, crc32(chunk.subarray(4, 17)));
    const out = new Uint8Array(src.length + chunk.length);
    out.set(src.subarray(0, ihdrEnd), 0);
    out.set(chunk, ihdrEnd);
    out.set(src.subarray(ihdrEnd), ihdrEnd + chunk.length);
    return new Blob([out], { type: 'image/png' });
  }

  $('pngBtn').addEventListener('click', async () => {
    const s = cur();
    const { front, back } = await renderOffscreen(s, backCfg(), 1);
    let out = front;
    if (back) {
      out = document.createElement('canvas');
      out.width = front.width * 2; out.height = front.height;
      const x = out.getContext('2d');
      x.drawImage(front, 0, 0);
      x.drawImage(back, front.width, 0);
    }
    const raw = await new Promise((resolve) => out.toBlob(resolve, 'image/png'));
    const blob = await pngWithDpi(raw, PNG_DPI);
    const url = URL.createObjectURL(blob);
    download(url, slug(s.title) + (back ? '-frente-verso' : '') + '.png');
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  });

  $('pdfBtn').addEventListener('click', async () => {
    if (!window.jspdf) { toast('Biblioteca de PDF não carregou (verifique a internet).'); return; }
    const s = cur();
    const bc = backCfg();
    const cw = DH_SHEET.CARD_W;
    const chh = DH_SHEET.CARD_H * (R.cardHeight(s) / R.H);
    const w = bc ? cw * 2 : cw;
    await busy($('pdfBtn'), 'Gerando…', async () => {
      const doc = new window.jspdf.jsPDF({ unit: 'mm', format: [w, chh], orientation: w > chh ? 'landscape' : 'portrait', compress: true });
      if (window.DH_VECTOR && DH_VECTOR.available()) {
        await R.whenReady(s, bc);
        await DH_VECTOR.preparePdf(doc);
        await DH_VECTOR.addSvgToPdf(doc, DH_VECTOR.cardSvg(s, null, 'front'), 0, 0, cw, chh);
        if (bc) await DH_VECTOR.addSvgToPdf(doc, DH_VECTOR.cardSvg(s, bc, 'back'), cw, 0, cw, chh);
      } else {
        const { front, back } = await renderOffscreen(s, bc, PRINT_SCALE);
        doc.addImage(front.toDataURL('image/jpeg', PRINT_JPEG_QUALITY), 'JPEG', 0, 0, cw, chh);
        if (back) doc.addImage(back.toDataURL('image/jpeg', PRINT_JPEG_QUALITY), 'JPEG', cw, 0, cw, chh);
      }
      doc.save(slug(s.title) + '.pdf');
    });
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
        title: s.title || typeName(s.type),
        front: front.toDataURL('image/jpeg', 0.95),
        back: back ? back.toDataURL('image/jpeg', 0.95) : null,
        state: clone(s),
        backCfg: bc ? clone(bc) : null,
        h: front.height,
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
    $('sheetUnlink').checked = !!app.sheet.unlink;
    $('sheetEmpty').classList.toggle('hidden', items.length > 0);
    if (app.view !== 'sheet') return;
    DH_SHEET.renderPages($('sheetPages'), items, sheetOpts());

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
        <div class="meta">${typeName(it.type)}${it.back ? ' • frente e verso' : ''}</div>
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
  $('sheetUnlink').addEventListener('change', (e) => {
    app.sheet.unlink = e.target.checked;
    refreshSheet();
    scheduleSave();
  });
  function sheetOpts() {
    return { gap: app.sheet.gap, cut: app.sheet.cut, unlink: !!app.sheet.unlink };
  }
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
    busy($('sheetPdfBtn'), 'Gerando…', async () => {
      const items = await printItems(app.sheet.items);
      await DH_SHEET.exportPdf(items, sheetOpts());
    });
  });
  $('sheetPrintBtn').addEventListener('click', () => {
    if (!app.sheet.items.length) { toast('Adicione cartas à folha primeiro.'); return; }
    busy($('sheetPrintBtn'), 'Preparando…', async () => {
      const items = await printItems(app.sheet.items);
      await DH_SHEET.print(items, sheetOpts());
    });
  });

  function setView(v) {
    app.view = v;
    document.querySelectorAll('#viewSwitch button').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
    $('editorView').classList.toggle('hidden', v !== 'editor');
    $('sheetView').classList.toggle('hidden', v !== 'sheet');
    if (v === 'sheet') refreshSheet();
  }
  document.querySelectorAll('#viewSwitch button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

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
      app: 'daggerheart-card-maker', version: 2,
      current: app.current, cards: app.cards, back: app.back, sheet: app.sheet,
    };
  }
  function applySnapshot(p) {
    if (!p || p.app !== 'daggerheart-card-maker') throw new Error('Arquivo de projeto inválido');
    if (TYPES.includes(p.current)) app.current = p.current;
    // Até a versão 1, ancestralidade e comunidade não tinham cor própria: o verso usava uma cor fixa.
    const migrate = (card) => {
      if ((p.version || 1) < 2 && (card.type === 'ancestry' || card.type === 'community')) {
        card.color = defaults(card.type).color;
      }
      return card;
    };
    const merge = (t, saved) => {
      const d = defaults(t);
      const card = migrate({ ...d, ...saved, type: t });
      card.dom1 = { ...d.dom1, ...(saved.dom1 || {}) };
      card.dom2 = { ...d.dom2, ...(saved.dom2 || {}) };
      return card;
    };
    for (const t of TYPES) {
      if (p.cards && p.cards[t]) app.cards[t] = merge(t, p.cards[t]);
    }
    if (p.sheet && Array.isArray(p.sheet.items)) {
      p.sheet.items.forEach((i) => { if (i && i.state && TYPES.includes(i.type)) i.state = merge(i.type, i.state); });
    }
    if (p.back) app.back = { enabled: !!p.back.enabled, src: p.back.src || null, crop: p.back.crop || null };
    if (p.sheet) {
      app.sheet = {
        items: Array.isArray(p.sheet.items) ? p.sheet.items.filter((i) => i && i.front && TYPES.includes(i.type)) : [],
        gap: typeof p.sheet.gap === 'number' ? p.sheet.gap : 2,
        cut: p.sheet.cut !== false,
        unlink: !!p.sheet.unlink,
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
