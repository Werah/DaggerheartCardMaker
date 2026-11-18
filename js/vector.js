/*
 * Saída vetorial das cartas (PDF e impressão).
 *
 * O mesmo renderizador do canvas desenha num "canvas falso" (canvas2svg), que grava
 * tudo como SVG: texto, faixas, molduras e formas viram vetor e saem nítidos na
 * impressora em qualquer tamanho. Só as imagens (arte, fundo, ícones) continuam
 * como bitmap, em 600 dpi.
 *
 * Para o PDF, o SVG é convertido com svg2pdf.js usando as fontes TTF embutidas
 * (js/vendor/pdf-fonts.js), então o texto fica como texto de verdade no arquivo.
 */
(function () {
  const W = DH_RENDER.W, H = DH_RENDER.H;
  const NS = 'http://www.w3.org/2000/svg';
  const RASTER = 2; // pixels por unidade da carta para as imagens (2 = 600 dpi)

  function available() {
    return !!(window.C2S && window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API.svg);
  }

  /* ---------- contexto que grava SVG ---------- */
  const baselineCache = new Map();
  const measure = document.createElement('canvas').getContext('2d');
  // distância da linha "middle" até a linha de base alfabética para uma fonte
  function middleToAlphabetic(font) {
    let d = baselineCache.get(font);
    if (d == null) {
      measure.font = font;
      measure.textBaseline = 'middle';
      const a1 = measure.measureText('H').actualBoundingBoxAscent;
      measure.textBaseline = 'alphabetic';
      const a2 = measure.measureText('H').actualBoundingBoxAscent;
      d = a2 - a1;
      baselineCache.set(font, d);
    }
    return d;
  }

  function rasterize(img, sx, sy, sw, sh, dw, dh) {
    const src = (img.getAttribute && img.getAttribute('src')) || '';
    const isSvg = src.startsWith('data:image/svg');
    const scale = Math.abs(dw) * RASTER;
    let outW = isSvg ? scale : Math.min(sw, scale);
    outW = Math.max(1, Math.round(outW));
    const outH = Math.max(1, Math.round(outW * (Math.abs(dh) / Math.abs(dw))));
    const c = document.createElement('canvas');
    c.width = outW; c.height = outH;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = 'high';
    x.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
    const opaque = img.nodeName === 'IMG' && src.startsWith('data:image/jpeg');
    const el = new Image();
    el.src = opaque ? c.toDataURL('image/jpeg', 0.95) : c.toDataURL('image/png');
    return el;
  }

  function vectorContext(target) {
    const fillText = (text, x, y) => {
      if (target.textBaseline === 'middle') {
        const d = middleToAlphabetic(target.font);
        target.textBaseline = 'alphabetic';
        target.fillText(text, x, y + d);
        target.textBaseline = 'middle';
      } else target.fillText(text, x, y);
    };
    const drawImage = (img, ...a) => {
      const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
      let sx = 0, sy = 0, sw = iw, sh = ih, dx, dy, dw, dh;
      if (a.length === 2) { [dx, dy] = a; dw = iw; dh = ih; }
      else if (a.length === 4) { [dx, dy, dw, dh] = a; }
      else { [sx, sy, sw, sh, dx, dy, dw, dh] = a; }
      if (!sw || !sh || !dw || !dh) return;
      // O drawImage do canvas2svg perde a posição da imagem; então o <image> é criado aqui,
      // dentro do grupo atual (que já carrega recortes e transformações do save/clip).
      const href = rasterize(img, sx, sy, sw, sh, dw, dh).getAttribute('src');
      const el = document.createElementNS(NS, 'image');
      el.setAttribute('x', dx);
      el.setAttribute('y', dy);
      el.setAttribute('width', dw);
      el.setAttribute('height', dh);
      el.setAttribute('preserveAspectRatio', 'none');
      el.setAttribute('href', href);
      el.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', href);
      if (target.globalAlpha < 1) el.setAttribute('opacity', target.globalAlpha);
      target.__closestGroupOrSvg().appendChild(el);
    };
    // canvas2svg 1.0.16: o clip() não grava o caminho no <clipPath> (ficaria vazio)
    const clip = () => {
      target.__applyCurrentDefaultPath();
      target.clip();
    };
    // canvas2svg 1.0.16: um contorno feito com preenchimento em gradiente herdaria esse
    // gradiente como preenchimento; troca o preenchimento por uma cor só durante o traço
    const withPlainFill = (fn) => (...a) => {
      const f = target.fillStyle;
      if (typeof f !== 'string') target.fillStyle = '#000000';
      try { return target[fn](...a); } finally { target.fillStyle = f; }
    };
    const stroke = withPlainFill('stroke');
    const strokeRect = withPlainFill('strokeRect');
    return new Proxy(target, {
      get(t, prop) {
        if (prop === 'fillText') return fillText;
        if (prop === 'drawImage') return drawImage;
        if (prop === 'clip') return clip;
        if (prop === 'stroke') return stroke;
        if (prop === 'strokeRect') return strokeRect;
        const v = t[prop];
        return typeof v === 'function' ? v.bind(t) : v;
      },
      set(t, prop, v) {
        // canvas2svg só aceita gradiente no preenchimento; no contorno usa a cor do meio
        if (prop === 'strokeStyle' && typeof v !== 'string') {
          const stops = v && v.__root ? v.__root.querySelectorAll('stop') : [];
          v = stops.length ? stops[Math.floor(stops.length / 2)].getAttribute('stop-color') : '#e7b93c';
        }
        t[prop] = v;
        return true;
      },
    });
  }

  // Desenha a frente ou o verso como <svg> (as imagens precisam estar carregadas: DH_RENDER.whenReady)
  function cardSvg(state, back, side) {
    const h = DH_RENDER.cardHeight(state);
    const c2s = new C2S(W, h);
    const ctx = vectorContext(c2s);
    const fakeCanvas = { width: W, height: h, getContext: () => ctx };
    if (side === 'back') DH_RENDER.renderBack(fakeCanvas, state, back);
    else DH_RENDER.renderFront(fakeCanvas, state);
    const svg = c2s.getSvg();
    svg.setAttribute('viewBox', `0 0 ${W} ${h}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    return svg;
  }

  /* ---------- PDF ---------- */
  let fontsPromise = null;
  function loadFonts() {
    if (window.DH_PDF_FONTS) return Promise.resolve();
    if (!fontsPromise) {
      fontsPromise = new Promise((resolve, reject) => {
        const sc = document.createElement('script');
        sc.src = 'js/vendor/pdf-fonts.js?v=1';
        sc.onload = () => resolve();
        sc.onerror = () => { fontsPromise = null; reject(new Error('Não foi possível carregar as fontes do PDF')); };
        document.head.appendChild(sc);
      });
    }
    return fontsPromise;
  }

  async function preparePdf(doc) {
    await loadFonts();
    for (const [name, b64] of Object.entries(window.DH_PDF_FONTS)) {
      doc.addFileToVFS(name + '.ttf', b64);
      doc.addFont(name + '.ttf', name, 'normal');
    }
  }

  // Converte família/peso/estilo do SVG no nome da fonte registrada no PDF
  function pdfFontName(family, weight, style) {
    const f = String(family || '').toLowerCase();
    let w = parseInt(weight, 10);
    if (isNaN(w)) w = /bold/i.test(weight || '') ? 700 : 400;
    const italic = /italic|oblique/i.test(style || '');
    if (f.includes('montserrat')) {
      const best = [600, 700, 800, 900].reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a));
      return 'Montserrat-' + best;
    }
    return 'Overpass-' + (w >= 600 ? 700 : 400) + (italic ? 'i' : '');
  }

  let holder = null;
  async function addSvgToPdf(doc, svg, x, y, w, h, rotate) {
    const el = svg.cloneNode(true);
    const vh = Number((el.getAttribute('viewBox') || '').split(/\s+/)[3]) || H;
    el.querySelectorAll('text').forEach((t) => {
      t.setAttribute('font-family', pdfFontName(t.getAttribute('font-family'), t.getAttribute('font-weight'), t.getAttribute('font-style')));
      t.setAttribute('font-weight', 'normal');
      t.setAttribute('font-style', 'normal');
      t.removeAttribute('dominant-baseline');
    });
    if (rotate) {
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('transform', `rotate(180 ${W / 2} ${vh / 2})`);
      while (el.firstChild) g.appendChild(el.firstChild);
      el.appendChild(g);
    }
    el.setAttribute('width', W);
    el.setAttribute('height', vh);
    if (!holder) {
      holder = document.createElement('div');
      holder.style.cssText = 'position:fixed;left:-99999px;top:0;width:0;height:0;overflow:hidden';
      document.body.appendChild(holder);
    }
    holder.appendChild(el);
    try {
      await doc.svg(el, { x, y, width: w, height: h });
    } finally {
      el.remove();
    }
  }

  window.DH_VECTOR = { available, cardSvg, preparePdf, addSvgToPdf, loadFonts };
})();
