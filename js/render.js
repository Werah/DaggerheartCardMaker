/* Renderizador das cartas em canvas (750 x 1050 px = 63,5 x 88,9 mm a 300 dpi). */
(function () {
  const W = 750, H = 1050;
  const FONT_HEAD = '"Montserrat", "Arial Black", Arial, sans-serif';
  const FONT_BODY = '"Overpass", "Segoe UI", Arial, sans-serif';
  const INK = '#1f1d22';

  // Área da arte de cada tipo: vem do registro (js/types.js)
  const artOf = (type) => DH_TYPES.artRect(type);

  /* ------------------------------------------------------------------ */
  /* Imagens                                                             */
  /* ------------------------------------------------------------------ */
  const cache = new Map();
  let onImageLoad = null;

  function entry(src) {
    let e = cache.get(src);
    if (!e) {
      const img = new Image();
      e = { img, ok: false, err: false };
      e.promise = new Promise((resolve) => {
        img.onload = () => { e.ok = true; resolve(img); if (onImageLoad) onImageLoad(); };
        img.onerror = () => { e.err = true; resolve(null); };
      });
      img.src = src;
      cache.set(src, e);
    }
    return e;
  }
  function getImg(src) {
    if (!src) return null;
    const e = entry(src);
    return e.ok ? e.img : null;
  }
  function loadImg(src) {
    if (!src) return Promise.resolve(null);
    return entry(src).promise;
  }

  const tintCache = new Map();
  function tinted(img, src, color) {
    const key = src.length + ':' + src.slice(-64) + ':' + color;
    let c = tintCache.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    const max = 256;
    const r = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    c.width = Math.max(1, Math.round(img.naturalWidth * r));
    c.height = Math.max(1, Math.round(img.naturalHeight * r));
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0, c.width, c.height);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = color;
    x.fillRect(0, 0, c.width, c.height);
    tintCache.set(key, c);
    return c;
  }

  // Retorna algo desenhável para o ícone de domínio na cor pedida
  function domainIcon(dom, color, keepColors) {
    if (!dom) return null;
    if (dom.icon) {
      const img = getImg(dom.icon);
      if (!img) return null;
      return keepColors ? img : tinted(img, dom.icon, color);
    }
    const preset = DH_ICONS.domainById(dom.preset);
    return getImg(DH_ICONS.svgDataUrl(preset.icon, color));
  }
  function domainIconSrcs(dom, colors) {
    if (!dom) return [];
    if (dom.icon) return [dom.icon];
    const preset = DH_ICONS.domainById(dom.preset);
    return colors.map((c) => DH_ICONS.svgDataUrl(preset.icon, c));
  }

  function drawContain(ctx, img, cx, cy, size) {
    if (!img) return;
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const r = Math.min(size / iw, size / ih);
    const w = iw * r, h = ih * r;
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  }

  function coverCrop(iw, ih, aspect) {
    if (iw / ih > aspect) {
      const w = ih * aspect;
      return { x: (iw - w) / 2, y: 0, w, h: ih };
    }
    const h = iw / aspect;
    return { x: 0, y: (ih - h) / 2, w: iw, h };
  }

  function drawCropped(ctx, img, crop, dx, dy, dw, dh) {
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const c = crop || coverCrop(iw, ih, dw / dh);
    const kx = dw / c.w, ky = dh / c.h;
    const x0 = Math.max(0, c.x), y0 = Math.max(0, c.y);
    const x1 = Math.min(iw, c.x + c.w), y1 = Math.min(ih, c.y + c.h);
    if (x1 <= x0 || y1 <= y0) return;
    ctx.drawImage(img, x0, y0, x1 - x0, y1 - y0,
      dx + (x0 - c.x) * kx, dy + (y0 - c.y) * ky, (x1 - x0) * kx, (y1 - y0) * ky);
  }

  /* ------------------------------------------------------------------ */
  /* Cores                                                               */
  /* ------------------------------------------------------------------ */
  function hexToRgb(hex) {
    let h = (hex || '#000').replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    const r = A.map((v, i) => Math.round(v + (B[i] - v) * t));
    return '#' + r.map((v) => v.toString(16).padStart(2, '0')).join('');
  }
  const lighten = (c, t) => mix(c, '#ffffff', t);
  const darken = (c, t) => mix(c, '#000000', t);
  function rgba(hex, a) {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r},${g},${b},${a})`;
  }
  function luminance(hex) {
    const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  /* ------------------------------------------------------------------ */
  /* Texto                                                               */
  /* ------------------------------------------------------------------ */
  function headFont(size, weight) { return `${weight || 800} ${size}px ${FONT_HEAD}`; }
  function bodyFont(size, bold, italic) {
    return `${italic ? 'italic ' : ''}${bold ? 700 : 400} ${size}px ${FONT_BODY}`;
  }

  function spacedWidth(ctx, text, spacing) {
    let w = 0;
    for (const ch of text) w += ctx.measureText(ch).width + spacing;
    return w - (text.length ? spacing : 0);
  }
  function drawSpaced(ctx, text, x, y, spacing, align) {
    const w = spacedWidth(ctx, text, spacing);
    let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    const prev = ctx.textAlign;
    ctx.textAlign = 'left';
    for (const ch of text) {
      ctx.fillText(ch, cx, y);
      cx += ctx.measureText(ch).width + spacing;
    }
    ctx.textAlign = prev;
    return w;
  }

  function fitHead(ctx, text, maxW, size, weight, min) {
    let s = size;
    while (s > (min || 18)) {
      ctx.font = headFont(s, weight);
      if (ctx.measureText(text).width <= maxW) break;
      s -= 1;
    }
    ctx.font = headFont(s, weight);
    return s;
  }

  // "**negrito**", "*itálico*", "***ambos***"
  function parseRich(text, baseItalic) {
    const lines = String(text || '').replace(/\r/g, '').split('\n');
    return lines.map((line) => {
      let bold = false, italic = !!baseItalic, buf = '';
      const runs = [];
      const push = () => { if (buf) runs.push({ text: buf, bold, italic }); buf = ''; };
      let i = 0;
      while (i < line.length) {
        if (line.startsWith('***', i)) { push(); bold = !bold; italic = !italic; i += 3; }
        else if (line.startsWith('**', i)) { push(); bold = !bold; i += 2; }
        else if (line[i] === '*') { push(); italic = !italic; i += 1; }
        else { buf += line[i]; i += 1; }
      }
      push();
      return { runs, blank: !runs.some((r) => r.text.trim()) };
    });
  }

  function layoutRich(ctx, paras, width, size) {
    const lh = size * 1.3;
    const paraGap = size * 0.42;
    const out = [];
    let y = 0;
    let first = true;
    for (const p of paras) {
      if (p.gap) { y += p.gap * size; continue; }
      if (p.blank) { y += size * 0.55; continue; }
      if (!first) y += paraGap;
      first = false;
      // quebra em palavras preservando o estilo
      const words = [];
      let cur = [];
      for (const r of p.runs) {
        const parts = r.text.split(/( +)/);
        for (const part of parts) {
          if (!part) continue;
          if (/^ +$/.test(part)) {
            if (cur.length) words.push(cur);
            cur = [];
            words.push(null); // marcador de espaço
          } else cur.push({ text: part, bold: r.bold, italic: r.italic });
        }
      }
      if (cur.length) words.push(cur);

      let line = [], lineW = 0, pendingSpace = false;
      const flush = () => {
        out.push({ y, segs: line });
        y += lh;
        line = []; lineW = 0; pendingSpace = false;
      };
      for (const w of words) {
        if (w === null) { if (line.length) pendingSpace = true; continue; }
        let ww = 0;
        const segs = w.map((s) => {
          ctx.font = bodyFont(size, s.bold, s.italic);
          const mw = ctx.measureText(s.text).width;
          ww += mw;
          return { ...s, w: mw };
        });
        ctx.font = bodyFont(size, false, false);
        const sp = pendingSpace ? ctx.measureText(' ').width : 0;
        if (line.length && lineW + sp + ww > width) flush();
        let x = lineW + (line.length ? sp : 0);
        for (const s of segs) { line.push({ ...s, x }); x += s.w; }
        lineW = x;
        pendingSpace = false;
      }
      if (line.length) flush();
      else if (!out.length || out[out.length - 1].y !== y - lh) { /* parágrafo vazio */ }
    }
    return { lines: out, height: y > 0 ? y - (size * 1.3 - size * 1.05) : 0, size };
  }

  function fitRich(ctx, paras, box, baseSize) {
    let size = baseSize;
    let lay = layoutRich(ctx, paras, box.w, size);
    while (lay.height > box.h && size > baseSize * 0.45) {
      size -= 0.5;
      lay = layoutRich(ctx, paras, box.w, size);
    }
    return lay;
  }

  function drawRich(ctx, lay, x, y, color) {
    ctx.fillStyle = color || INK;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    for (const line of lay.lines) {
      for (const s of line.segs) {
        ctx.font = bodyFont(lay.size, s.bold, s.italic);
        ctx.fillText(s.text, x + s.x, y + line.y + lay.size * 0.92);
      }
    }
  }

  function bodyParas(s, withDescription) {
    const paras = [];
    if (withDescription && s.description && s.description.trim()) {
      paras.push(...parseRich(s.description, true));
      paras.push({ gap: 0.5 });
    }
    paras.push(...parseRich(s.text, false));
    return paras;
  }

  /* ------------------------------------------------------------------ */
  /* Formas                                                              */
  /* ------------------------------------------------------------------ */
  function pillPath(ctx, cx, cy, w, h, ch) {
    const l = cx - w / 2, r = cx + w / 2, t = cy - h / 2, b = cy + h / 2;
    ctx.beginPath();
    ctx.moveTo(l + ch, t); ctx.lineTo(r - ch, t); ctx.lineTo(r, cy);
    ctx.lineTo(r - ch, b); ctx.lineTo(l + ch, b); ctx.lineTo(l, cy);
    ctx.closePath();
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function goldGradientH(ctx, gold, x0, x1) {
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, darken(gold, 0.12));
    g.addColorStop(0.3, gold);
    g.addColorStop(0.5, lighten(gold, 0.45));
    g.addColorStop(0.7, gold);
    g.addColorStop(1, darken(gold, 0.12));
    return g;
  }

  function drawGoldBand(ctx, y, gold) {
    ctx.save();
    // Faixa principal
    ctx.fillStyle = goldGradientH(ctx, gold, 0, W);
    ctx.fillRect(0, y - 14, W, 28);
    ctx.fillStyle = rgba(lighten(gold, 0.7), 0.9);
    ctx.fillRect(0, y - 14, W, 3);
    ctx.fillStyle = rgba(darken(gold, 0.35), 0.6);
    ctx.fillRect(0, y + 12, W, 2);
    // Linhas decorativas
    ctx.strokeStyle = gold;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(W * 0.64, y - 22); ctx.lineTo(W - 70, y - 22); ctx.lineTo(W - 56, y - 30); ctx.lineTo(W, y - 30);
    ctx.moveTo(0, y + 30); ctx.lineTo(56, y + 30); ctx.lineTo(70, y + 22); ctx.lineTo(W * 0.36, y + 22);
    ctx.stroke();
    ctx.fillStyle = gold;
    ctx.fillRect(W * 0.64 - 18, y - 25, 10, 6);
    ctx.fillRect(W * 0.36 + 8, y + 19, 10, 6);
    ctx.restore();
  }

  function drawLabelPill(ctx, text, cx, cy, fill, gold) {
    const t = (text || '').toUpperCase();
    if (!t) return;
    ctx.save();
    ctx.font = headFont(26, 800);
    const tw = spacedWidth(ctx, t, 2);
    const w = Math.max(150, tw + 74), h = 50;
    ctx.shadowColor = 'rgba(0,0,0,.25)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    pillPath(ctx, cx, cy, w + 10, h + 10, 20);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    pillPath(ctx, cx, cy, w + 10, h + 10, 20);
    ctx.strokeStyle = gold;
    ctx.lineWidth = 2;
    ctx.stroke();
    pillPath(ctx, cx, cy, w, h, 17);
    const g = ctx.createLinearGradient(0, cy - h / 2, 0, cy + h / 2);
    g.addColorStop(0, lighten(fill, 0.12));
    g.addColorStop(1, darken(fill, 0.1));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.fillStyle = luminance(fill) > 0.72 ? INK : '#ffffff';
    ctx.textBaseline = 'middle';
    drawSpaced(ctx, t, cx, cy + 2, 2, 'center');
    ctx.restore();
  }

  function drawBanner(ctx, s, icons) {
    const x = 44, w = 120, notch = 34;
    const kind = DH_TYPES.get(s.type).banner;
    const h = kind === 2 ? 300 : 270;
    const color = s.color;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.35)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 5;
    ctx.beginPath();
    ctx.moveTo(x, 0); ctx.lineTo(x + w, 0); ctx.lineTo(x + w, h);
    ctx.lineTo(x + w / 2, h - notch); ctx.lineTo(x, h); ctx.closePath();
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, darken(color, 0.08));
    g.addColorStop(0.5, lighten(color, 0.1));
    g.addColorStop(1, darken(color, 0.08));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    // contorno interno
    const i = 10;
    ctx.beginPath();
    ctx.moveTo(x + i, -4); ctx.lineTo(x + w - i, -4); ctx.lineTo(x + w - i, h - i * 1.5);
    ctx.lineTo(x + w / 2, h - notch - i); ctx.lineTo(x + i, h - i * 1.5); ctx.closePath();
    ctx.strokeStyle = luminance(color) > 0.72 ? 'rgba(0,0,0,.25)' : 'rgba(255,255,255,.45)';
    ctx.lineWidth = 3;
    ctx.stroke();

    const fg = luminance(color) > 0.72 ? INK : '#ffffff';
    const cx = x + w / 2;
    if (kind === 1) {
      ctx.fillStyle = fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      const lvl = String(s.level ?? '');
      ctx.font = headFont(lvl.length > 1 ? 62 : 76, 800);
      ctx.fillText(lvl, cx, 112);
      drawContain(ctx, icons[0], cx, 178, 66);
    } else if (kind === 2) {
      drawContain(ctx, icons[0], cx, 82, 70);
      drawContain(ctx, icons[1], cx, 182, 70);
    } else {
      drawContain(ctx, icons[0], cx, 110, 76);
    }
    ctx.restore();
  }

  function drawRecall(ctx, s) {
    const v = String(s.recall ?? '').trim();
    if (!v) return;
    const cx = W - 84, cy = 84, r = 44;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.35)';
    ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
    ctx.fillStyle = goldGradientH(ctx, s.gold, cx - r, cx + r);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.beginPath(); ctx.arc(cx, cy, r - 2, 0, Math.PI * 2);
    ctx.fillStyle = '#161519';
    ctx.fill();
    ctx.font = headFont(38, 800);
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const nw = ctx.measureText(v).width;
    const bw = 18, gap = 3;
    let x = cx - (nw + gap + bw) / 2;
    ctx.fillText(v, x, cy + 3);
    const bx = x + nw + gap;
    ctx.beginPath();
    ctx.moveTo(bx + 12, cy - 17); ctx.lineTo(bx + 1, cy + 3); ctx.lineTo(bx + 9, cy + 3);
    ctx.lineTo(bx + 6, cy + 18); ctx.lineTo(bx + 18, cy - 4); ctx.lineTo(bx + 10, cy - 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawFooter(ctx, s, color) {
    ctx.save();
    ctx.fillStyle = color || '#5a5660';
    ctx.font = bodyFont(17, false, true);
    ctx.textBaseline = 'alphabetic';
    const y = H - 30;
    if (s.artist && s.artist.trim()) {
      const x = 46;
      ctx.beginPath();
      ctx.moveTo(x, y + 1); ctx.lineTo(x + 3, y - 4); ctx.lineTo(x + 17, y - 17);
      ctx.lineTo(x + 13, y - 7); ctx.lineTo(x + 4, y - 1); ctx.closePath();
      ctx.fill();
      ctx.textAlign = 'left';
      ctx.fillText(s.artist, x + 24, y);
    }
    if (s.footer && s.footer.trim()) {
      ctx.textAlign = 'right';
      ctx.fillText(s.footer, W - 46, y);
    }
    ctx.restore();
  }

  /* ------------------------------------------------------------------ */
  /* Arte                                                                */
  /* ------------------------------------------------------------------ */
  function drawArt(ctx, s, rect, placeholder) {
    const img = s.art && s.art.src ? getImg(s.art.src) : null;
    ctx.save();
    if (img) {
      drawCropped(ctx, img, s.art.crop, rect.x, rect.y, rect.w, rect.h);
    } else placeholder();
    ctx.restore();
  }

  // Fundo da frente: branco ou a imagem de fundo escolhida (com véu branco opcional)
  function drawBase(ctx, s) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    const img = s.bg && s.bg.src ? getImg(s.bg.src) : null;
    if (!img) return;
    drawCropped(ctx, img, s.bg.crop, 0, 0, W, H);
    const fade = Number(s.bgFade) || 0;
    if (fade > 0) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(0.95, fade)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function placeholderLight(ctx, rect, icon) {
    if (icon) {
      ctx.globalAlpha = 0.9;
      drawContain(ctx, icon, rect.x + rect.w / 2, rect.y + rect.h / 2 + 10, Math.min(rect.h * 0.55, 300));
      ctx.globalAlpha = 1;
    }
  }

  function placeholderScene(ctx, rect, color) {
    const g = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
    g.addColorStop(0, lighten(color, 0.55));
    g.addColorStop(0.6, lighten(color, 0.15));
    g.addColorStop(1, darken(color, 0.35));
    ctx.fillStyle = g;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    // montanhas simples
    ctx.fillStyle = rgba(darken(color, 0.45), 0.55);
    ctx.beginPath();
    ctx.moveTo(0, rect.y + rect.h);
    ctx.lineTo(0, rect.y + rect.h * 0.7);
    ctx.lineTo(rect.w * 0.22, rect.y + rect.h * 0.48);
    ctx.lineTo(rect.w * 0.4, rect.y + rect.h * 0.66);
    ctx.lineTo(rect.w * 0.62, rect.y + rect.h * 0.4);
    ctx.lineTo(rect.w * 0.85, rect.y + rect.h * 0.62);
    ctx.lineTo(rect.w, rect.y + rect.h * 0.52);
    ctx.lineTo(rect.w, rect.y + rect.h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = rgba('#ffffff', 0.7);
    ctx.beginPath();
    ctx.arc(rect.w * 0.74, rect.y + rect.h * 0.22, 44, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ------------------------------------------------------------------ */
  /* Layouts                                                             */
  /* ------------------------------------------------------------------ */
  function drawStandard(ctx, s) {
    const type = s.type;
    const def = DH_TYPES.get(type);
    const art = artOf(type);
    const bannerFg = luminance(s.color) > 0.72 ? INK : '#ffffff';
    const icons = [domainIcon(s.dom1, bannerFg, s.iconKeepColors)];
    if (def.banner === 2) icons.push(domainIcon(s.dom2, bannerFg, s.iconKeepColors));

    drawBase(ctx, s);

    drawArt(ctx, s, art, () => {
      const ph = domainIcon(s.dom1, '#bdbcc2', false);
      placeholderLight(ctx, art, ph);
    });

    const bandY = art.h;
    drawGoldBand(ctx, bandY, s.gold);
    if (def.banner) drawBanner(ctx, s, icons);
    if (def.features.includes('level')) drawRecall(ctx, s);
    drawLabelPill(ctx, s.label, W / 2, bandY, s.color, s.gold);

    // título
    let y = bandY + 82;
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const title = (s.title || '').toUpperCase();
    fitHead(ctx, title, W - 90, 46, 800, 24);
    drawSpaced(ctx, title, W / 2, y, 1, 'center');

    if (s.subtitle && s.subtitle.trim() && def.features.includes('subtitle')) {
      y += 38;
      ctx.font = bodyFont(28, false, true);
      ctx.fillStyle = '#4a4650';
      ctx.fillText(s.subtitle, W / 2, y);
    }

    const stats = def.features.includes('stats')
      ? def.stats(s).map((st) => [st.badge, String(s[st.key] ?? '').trim()]).filter(([, v]) => v)
      : [];
    if (stats.length) {
      y += 22;
      // diminui os selos se os valores forem longos
      let k = 1;
      let widths, total;
      const measure = () => {
        widths = stats.map(([l, v]) => {
          ctx.font = headFont(19 * k, 700);
          const lw = spacedWidth(ctx, l, 1.5 * k);
          ctx.font = headFont(26 * k, 800);
          return lw + 14 * k + ctx.measureText(v).width + 44 * k;
        });
        total = widths.reduce((a, b) => a + b, 0) + (stats.length - 1) * 18 * k;
      };
      measure();
      while (total > W - 80 && k > 0.55) { k -= 0.05; measure(); }
      let x = W / 2 - total / 2;
      const cy = y + 22;
      stats.forEach(([l, v], i) => {
        const w = widths[i];
        pillPath(ctx, x + w / 2, cy, w, 42, 12 * k);
        ctx.fillStyle = rgba(s.color, 0.08);
        ctx.fill();
        ctx.strokeStyle = s.gold;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#56515c';
        ctx.font = headFont(19 * k, 700);
        const lw = drawSpaced(ctx, l, x + 22 * k, cy + 1, 1.5 * k, 'left');
        ctx.fillStyle = s.color && luminance(s.color) < 0.6 ? s.color : INK;
        ctx.font = headFont(26 * k, 800);
        ctx.textAlign = 'left';
        ctx.fillText(v, x + 22 * k + lw + 14 * k, cy + 2);
        x += w + 18 * k;
      });
      ctx.textBaseline = 'alphabetic';
      y += 44;
    }

    const top = y + 24;
    const box = { x: 48, y: top, w: W - 96, h: H - 72 - top };
    const lay = fitRich(ctx, bodyParas(s, def.features.includes('description')), box, 28 * (s.textScale || 1));
    drawRich(ctx, lay, box.x, box.y);
    drawFooter(ctx, s);
  }

  function drawAncestry(ctx, s) {
    const art = artOf(s.type);
    const gold = s.gold;
    drawBase(ctx, s);
    drawArt(ctx, s, art, () => placeholderScene(ctx, art, '#5b6fa8'));

    const P = 585, tabX = W * 0.56, rise = 42;
    const panel = (dy) => {
      ctx.beginPath();
      ctx.moveTo(0, P + dy); ctx.lineTo(tabX, P + dy); ctx.lineTo(tabX + rise, P - rise + dy);
      ctx.lineTo(W, P - rise + dy); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
    };
    // borda dourada
    ctx.save();
    panel(-9);
    ctx.fillStyle = goldGradientH(ctx, gold, 0, W);
    ctx.fill();
    ctx.save();
    panel(0);
    ctx.clip();
    drawBase(ctx, s);
    ctx.restore();
    // linhas finas decorativas
    ctx.strokeStyle = rgba(gold, 0.85);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(W * 0.3, P + 12); ctx.lineTo(tabX + 3, P + 12);
    ctx.lineTo(tabX + rise + 3, P - rise + 12); ctx.lineTo(W * 0.8, P - rise + 12);
    ctx.stroke();
    ctx.restore();

    // rótulo
    const label = (s.label || '').toUpperCase();
    const cy = P + 50;
    let pillL = W - 40;
    if (label) {
      ctx.save();
      ctx.font = headFont(22, 700);
      const tw = spacedWidth(ctx, label, 4);
      const w = tw + 46, h = 46;
      const cx = W - 40 - w / 2;
      pillL = cx - w / 2;
      roundRect(ctx, cx - w / 2, cy - h / 2, w, h, 8);
      ctx.fillStyle = lighten(gold, 0.82);
      ctx.fill();
      ctx.strokeStyle = gold;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = darken(gold, 0.5);
      ctx.textBaseline = 'middle';
      drawSpaced(ctx, label, cx, cy + 2, 4, 'center');
      ctx.restore();
    }

    // título
    const title = (s.title || '').toUpperCase();
    ctx.fillStyle = '#0d0c0f';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    fitHead(ctx, title, pillL - 24 - 44, 68, 900, 26);
    ctx.fillText(title, 44, P + 74);

    const top = P + 106;
    const box = { x: 44, y: top, w: W - 88, h: H - 72 - top };
    const lay = fitRich(ctx, bodyParas(s, true), box, 28 * (s.textScale || 1));
    drawRich(ctx, lay, box.x, box.y, '#141316');
    drawFooter(ctx, s);

    // moldura dourada
    ctx.save();
    roundRect(ctx, 5, 5, W - 10, H - 10, 28);
    ctx.strokeStyle = gold;
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.restore();
  }

  function drawCommunity(ctx, s) {
    const art = artOf(s.type);
    const gold = s.gold;
    const A = art.h, ch = 70;
    drawBase(ctx, s);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(W, 0); ctx.lineTo(W, A - ch); ctx.lineTo(W - ch, A); ctx.lineTo(0, A);
    ctx.closePath();
    ctx.clip();
    drawArt(ctx, s, art, () => placeholderScene(ctx, art, '#3f8f8a'));
    ctx.restore();

    // linhas douradas
    ctx.save();
    ctx.strokeStyle = goldGradientH(ctx, gold, 0, W);
    ctx.lineWidth = 6;
    ctx.lineJoin = 'miter';
    ctx.beginPath();
    ctx.moveTo(0, A - 3); ctx.lineTo(W - ch - 1, A - 3); ctx.lineTo(W - 3, A - ch - 1); ctx.lineTo(W - 3, A - 330);
    ctx.stroke();
    ctx.strokeStyle = rgba(gold, 0.9);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(W * 0.18, A + 10); ctx.lineTo(W * 0.26, A + 10); ctx.lineTo(W * 0.29, A + 18); ctx.lineTo(W * 0.58, A + 18);
    ctx.moveTo(W - 18, A - 120); ctx.lineTo(W - 18, A - ch - 6); ctx.lineTo(W - ch - 6, A - 18); ctx.lineTo(W * 0.72, A - 18);
    ctx.stroke();
    ctx.restore();

    // rótulo
    const label = (s.label || '').toUpperCase();
    if (label) {
      ctx.save();
      ctx.font = headFont(30, 600);
      const tw = spacedWidth(ctx, label, 3);
      const w = tw + 50, h = 54;
      const right = W - 96, cy = A - 52;
      const l = right - w;
      ctx.beginPath();
      ctx.moveTo(l + 14, cy - h / 2); ctx.lineTo(right, cy - h / 2); ctx.lineTo(right, cy + h / 2 - 14);
      ctx.lineTo(right - 14, cy + h / 2); ctx.lineTo(l, cy + h / 2); ctx.lineTo(l, cy - h / 2 + 14);
      ctx.closePath();
      ctx.fillStyle = rgba(lighten(gold, 0.5), 0.93);
      ctx.fill();
      ctx.strokeStyle = darken(gold, 0.1);
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = darken(gold, 0.72);
      ctx.textBaseline = 'middle';
      drawSpaced(ctx, label, l + w / 2, cy + 2, 3, 'center');
      ctx.restore();
    }

    const title = (s.title || '').toUpperCase();
    ctx.fillStyle = '#0d0c0f';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    fitHead(ctx, title, W - 88, 84, 900, 28);
    ctx.fillText(title, 44, A + 104);

    const top = A + 132;
    const box = { x: 44, y: top, w: W - 88, h: H - 72 - top };
    const lay = fitRich(ctx, bodyParas(s, true), box, 29 * (s.textScale || 1));
    drawRich(ctx, lay, box.x, box.y, '#141316');
    drawFooter(ctx, s);
  }

  function renderFront(canvas, s) {
    const ctx = canvas.getContext('2d');
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const layout = DH_TYPES.get(s.type).layout;
    if (layout === 'ancestry') drawAncestry(ctx, s);
    else if (layout === 'community') drawCommunity(ctx, s);
    else drawStandard(ctx, s);
  }

  function renderBack(canvas, s, back) {
    const ctx = canvas.getContext('2d');
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const textMode = s.backMode === 'text';
    const img = back && back.src ? getImg(back.src) : null;
    if (img) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      drawCropped(ctx, img, back.crop, 0, 0, W, H);
    } else drawDefaultBack(ctx, s, !textMode);
    if (textMode) drawBackText(ctx, s);
  }

  // Painel de texto do verso (modo "Verso com texto")
  function drawBackText(ctx, s) {
    const gold = s.gold;
    const px = 66, py = 84, pw = W - px * 2, ph = H - py * 2;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.35)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 4;
    roundRect(ctx, px, py, pw, ph, 18);
    ctx.fillStyle = 'rgba(255,253,248,.95)';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = gold;
    ctx.lineWidth = 4;
    ctx.stroke();
    roundRect(ctx, px + 10, py + 10, pw - 20, ph - 20, 12);
    ctx.strokeStyle = rgba(gold, 0.6);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    const title = String((s.backTitle && s.backTitle.trim()) || s.title || '').toUpperCase();
    let top = py + 44;
    if (title) {
      ctx.save();
      ctx.fillStyle = INK;
      ctx.textBaseline = 'alphabetic';
      fitHead(ctx, title, pw - 80, 42, 800, 22);
      drawSpaced(ctx, title, W / 2, py + 86, 1, 'center');
      // divisória dourada com losango
      const dy = py + 112;
      ctx.strokeStyle = gold;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(px + 60, dy); ctx.lineTo(W / 2 - 16, dy);
      ctx.moveTo(W / 2 + 16, dy); ctx.lineTo(px + pw - 60, dy);
      ctx.stroke();
      ctx.fillStyle = gold;
      ctx.beginPath();
      ctx.moveTo(W / 2, dy - 9); ctx.lineTo(W / 2 + 9, dy); ctx.lineTo(W / 2, dy + 9); ctx.lineTo(W / 2 - 9, dy);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      top = dy + 30;
    }
    const box = { x: px + 36, y: top, w: pw - 72, h: py + ph - 40 - top };
    const lay = fitRich(ctx, parseRich(s.backText, false), box, 28 * (s.textScale || 1));
    // centraliza verticalmente quando o texto é curto
    const offset = Math.max(0, (box.h - lay.height) / 2);
    drawRich(ctx, lay, box.x, box.y + Math.min(offset, 60));
  }

  function drawDefaultBack(ctx, s, emblem) {
    const color = s.color;
    const gold = s.gold;
    const g = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, H * 0.7);
    g.addColorStop(0, lighten(color, 0.12));
    g.addColorStop(1, darken(color, 0.7));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.06)';
    ctx.lineWidth = 2;
    for (let i = -H; i < W + H; i += 46) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + H, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i, H); ctx.lineTo(i + H, 0); ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = gold;
    ctx.lineWidth = 5;
    const m = 34, c = 26;
    ctx.beginPath();
    ctx.moveTo(m + c, m); ctx.lineTo(W - m - c, m); ctx.lineTo(W - m, m + c); ctx.lineTo(W - m, H - m - c);
    ctx.lineTo(W - m - c, H - m); ctx.lineTo(m + c, H - m); ctx.lineTo(m, H - m - c); ctx.lineTo(m, m + c);
    ctx.closePath();
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = rgba(gold, 0.7);
    roundRect(ctx, m + 14, m + 14, W - 2 * m - 28, H - 2 * m - 28, 6);
    ctx.stroke();
    if (!emblem) { ctx.restore(); return; }

    // losango central
    const cx = W / 2, cy = H / 2, r = 150;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath();
    ctx.fillStyle = rgba(darken(color, 0.45), 0.85);
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = gold;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy - r - 22); ctx.lineTo(cx + r + 22, cy); ctx.lineTo(cx, cy + r + 22); ctx.lineTo(cx - r - 22, cy); ctx.closePath();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = rgba(gold, 0.7);
    ctx.stroke();
    // linhas verticais
    ctx.lineWidth = 3;
    ctx.strokeStyle = gold;
    ctx.beginPath();
    ctx.moveTo(cx, m + 40); ctx.lineTo(cx, cy - r - 40);
    ctx.moveTo(cx, cy + r + 40); ctx.lineTo(cx, H - m - 40);
    ctx.stroke();
    ctx.restore();

    let icon = domainIcon(s.dom1, lighten(gold, 0.35), s.iconKeepColors);
    if (!icon) icon = getImg(DH_ICONS.svgDataUrl('star', lighten(gold, 0.35)));
    drawContain(ctx, icon, cx, cy, 130);
  }

  // Garante que todas as imagens/fontes estejam carregadas antes de exportar
  async function whenReady(s, back) {
    const gold = s.gold || '#e7b93c';
    const fg = luminance(s.color || '#000') > 0.72 ? INK : '#ffffff';
    const srcs = [];
    if (s.art && s.art.src) srcs.push(s.art.src);
    if (s.bg && s.bg.src) srcs.push(s.bg.src);
    if (back && back.src) srcs.push(back.src);
    srcs.push(...domainIconSrcs(s.dom1, [fg, '#bdbcc2', lighten(gold, 0.35)]));
    srcs.push(...domainIconSrcs(s.dom2, [fg]));
    srcs.push(DH_ICONS.svgDataUrl('star', lighten(gold, 0.35)));
    await Promise.all(srcs.map(loadImg));
    await ensureFonts();
  }

  let fontsPromise = null;
  function ensureFonts() {
    if (!fontsPromise) {
      if (!document.fonts || !document.fonts.load) fontsPromise = Promise.resolve();
      else {
        const specs = [
          headFont(40, 600), headFont(40, 700), headFont(40, 800), headFont(40, 900),
          bodyFont(20, false, false), bodyFont(20, true, false),
          bodyFont(20, false, true), bodyFont(20, true, true),
        ];
        fontsPromise = Promise.all(specs.map((f) => document.fonts.load(f).catch(() => null)))
          .then(() => null);
      }
    }
    return fontsPromise;
  }

  window.DH_RENDER = {
    W, H,
    renderFront, renderBack, whenReady, ensureFonts, loadImg, coverCrop,
    setOnImageLoad(fn) { onImageLoad = fn; },
  };
})();
