/* Popup de recorte: arrastar para mover, roda/pinça/barra para zoom. */
(function () {
  const $ = (id) => document.getElementById(id);
  const modal = $('cropModal');
  const stage = $('cropStage');
  const canvas = $('cropCanvas');
  const zoom = $('cropZoom');
  const ctx = canvas.getContext('2d');

  let st = null; // estado da sessão atual

  function layout() {
    const dpr = window.devicePixelRatio || 1;
    const cw = stage.clientWidth, ch = stage.clientHeight;
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pad = 28;
    let fw = cw - pad * 2, fh = fw / st.aspect;
    if (fh > ch - pad * 2) { fh = ch - pad * 2; fw = fh * st.aspect; }
    st.cw = cw; st.ch = ch;
    st.fx = (cw - fw) / 2; st.fy = (ch - fh) / 2; st.fw = fw; st.fh = fh;
    const iw = st.img.naturalWidth, ih = st.img.naturalHeight;
    st.minS = Math.min(fw / iw, fh / ih);
    st.coverS = Math.max(fw / iw, fh / ih);
    st.maxS = st.coverS * 8;
  }

  function fromCrop(crop) {
    st.s = st.fw / crop.w;
    st.ox = st.fx - crop.x * st.s;
    st.oy = st.fy - crop.y * st.s;
    clamp();
  }
  function toCrop() {
    return { x: (st.fx - st.ox) / st.s, y: (st.fy - st.oy) / st.s, w: st.fw / st.s, h: st.fh / st.s };
  }
  function center(scale) {
    st.s = scale;
    st.ox = st.fx + (st.fw - st.img.naturalWidth * scale) / 2;
    st.oy = st.fy + (st.fh - st.img.naturalHeight * scale) / 2;
    clamp();
  }
  function clamp() {
    st.s = Math.min(st.maxS, Math.max(st.minS, st.s));
    const iw = st.img.naturalWidth * st.s, ih = st.img.naturalHeight * st.s;
    const ax = iw >= st.fw ? [st.fx + st.fw - iw, st.fx] : [st.fx, st.fx + st.fw - iw];
    const ay = ih >= st.fh ? [st.fy + st.fh - ih, st.fy] : [st.fy, st.fy + st.fh - ih];
    st.ox = Math.min(ax[1], Math.max(ax[0], st.ox));
    st.oy = Math.min(ay[1], Math.max(ay[0], st.oy));
  }
  function zoomAt(ns, px, py) {
    ns = Math.min(st.maxS, Math.max(st.minS, ns));
    st.ox = px - (px - st.ox) * (ns / st.s);
    st.oy = py - (py - st.oy) * (ns / st.s);
    st.s = ns;
    clamp();
    syncSlider();
    draw();
  }
  function syncSlider() {
    const t = Math.log(st.s / st.minS) / Math.log(st.maxS / st.minS);
    zoom.value = String(Math.round(t * 1000));
  }

  function draw() {
    const { cw, ch, fx, fy, fw, fh } = st;
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(fx, fy, fw, fh);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(st.img, st.ox, st.oy, st.img.naturalWidth * st.s, st.img.naturalHeight * st.s);
    // escurece o que fica fora
    ctx.beginPath();
    ctx.rect(0, 0, cw, ch);
    ctx.rect(fx, fy, fw, fh);
    ctx.fillStyle = 'rgba(8,6,12,.68)';
    ctx.fill('evenodd');
    // grade dos terços
    ctx.strokeStyle = 'rgba(255,255,255,.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < 3; i++) {
      ctx.moveTo(fx + (fw * i) / 3, fy); ctx.lineTo(fx + (fw * i) / 3, fy + fh);
      ctx.moveTo(fx, fy + (fh * i) / 3); ctx.lineTo(fx + fw, fy + (fh * i) / 3);
    }
    ctx.stroke();
    ctx.strokeStyle = '#e7b93c';
    ctx.lineWidth = 2;
    ctx.strokeRect(fx, fy, fw, fh);
  }

  /* ---------- interação ---------- */
  const pointers = new Map();
  let pinch = null;
  function localPos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (!st) return;
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, localPos(e));
    canvas.classList.add('grabbing');
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: st.s };
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!st || !pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    const cur = localPos(e);
    pointers.set(e.pointerId, cur);
    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt(pinch.s * (d / pinch.d), (a.x + b.x) / 2, (a.y + b.y) / 2);
    } else if (pointers.size === 1) {
      st.ox += cur.x - prev.x;
      st.oy += cur.y - prev.y;
      clamp();
      draw();
    }
  });
  const up = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!pointers.size) canvas.classList.remove('grabbing');
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => {
    if (!st) return;
    e.preventDefault();
    const p = localPos(e);
    zoomAt(st.s * Math.exp(-e.deltaY * 0.0015), p.x, p.y);
  }, { passive: false });

  zoom.addEventListener('input', () => {
    if (!st) return;
    const t = Number(zoom.value) / 1000;
    const ns = st.minS * Math.pow(st.maxS / st.minS, t);
    zoomAt(ns, st.fx + st.fw / 2, st.fy + st.fh / 2);
  });
  $('cropFit').addEventListener('click', () => { if (st) { center(st.minS); syncSlider(); draw(); } });
  $('cropFill').addEventListener('click', () => { if (st) { center(st.coverS); syncSlider(); draw(); } });

  window.addEventListener('resize', () => {
    if (!st) return;
    const c = toCrop();
    layout();
    fromCrop(c);
    syncSlider();
    draw();
  });

  function close(result) {
    if (!st) return;
    const done = st.resolve;
    st = null;
    modal.classList.add('hidden');
    document.removeEventListener('keydown', onKey);
    done(result);
  }
  function onKey(e) {
    if (e.key === 'Escape') close(null);
    if (e.key === 'Enter') close(toCrop());
  }
  $('cropOk').addEventListener('click', () => close(toCrop()));
  $('cropCancel').addEventListener('click', () => close(null));
  $('cropClose').addEventListener('click', () => close(null));
  modal.addEventListener('pointerdown', (e) => { if (e.target === modal) close(null); });

  async function open(src, aspect, crop) {
    const img = await DH_RENDER.loadImg(src);
    if (!img) return null;
    if (st) close(null);
    return new Promise((resolve) => {
      st = { img, aspect, resolve };
      modal.classList.remove('hidden');
      layout();
      if (crop) fromCrop(crop);
      else center(st.coverS);
      syncSlider();
      draw();
      document.addEventListener('keydown', onKey);
    });
  }

  window.DH_CROP = { open };
})();
