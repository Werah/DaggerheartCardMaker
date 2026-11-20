/*
 * Saída para PDF e impressão — sem nenhuma transparência.
 *
 * Cada lado da carta vira um SVG com duas camadas:
 *   1. fundo: tudo menos o texto (arte, faixas, molduras, ícones, efeitos), desenhado no
 *      canvas e achatado numa imagem OPACA de 600 dpi;
 *   2. texto: por cima, em vetor (canvas2svg), em preto puro.
 *
 * Por quê: PDFs com elementos semitransparentes são "achatados" pelo driver da impressora
 * (ou pelo Acrobat) na hora de imprimir, e esse achatamento costuma transformar em imagem
 * de baixa resolução tudo o que está por perto — inclusive o texto —, que sai borrado.
 * Achatando o fundo aqui, em alta resolução, o PDF fica sem transparência e o texto
 * continua vetorial e nítido.
 *
 * No PDF, o SVG é convertido com svg2pdf.js usando as fontes TTF embutidas
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

  // Contexto do canvas que desenha tudo, menos o texto (camada de fundo)
  function noTextContext(target) {
    return new Proxy(target, {
      get(t, prop) {
        if (prop === 'fillText' || prop === 'strokeText') return () => {};
        const v = t[prop];
        return typeof v === 'function' ? v.bind(t) : v;
      },
      set(t, prop, v) { t[prop] = v; return true; },
    });
  }

  // Contexto canvas2svg que só grava o texto (camada de texto)
  const SHAPE_CALLS = ['fillRect', 'strokeRect', 'clearRect', 'beginPath', 'closePath', 'moveTo', 'lineTo',
    'arc', 'arcTo', 'bezierCurveTo', 'quadraticCurveTo', 'rect', 'ellipse', 'fill', 'stroke', 'clip',
    'drawImage', 'strokeText', 'putImageData'];
  function textOnlyContext(target) {
    const noop = () => {};
    const fillText = (text, x, y) => {
      const alpha = target.globalAlpha;
      target.globalAlpha = 1; // texto sempre opaco
      if (target.textBaseline === 'middle') {
        // o svg2pdf não entende dominant-baseline: converte para a linha de base alfabética
        const d = middleToAlphabetic(target.font);
        target.textBaseline = 'alphabetic';
        target.fillText(text, x, y + d);
        target.textBaseline = 'middle';
      } else target.fillText(text, x, y);
      target.globalAlpha = alpha;
    };
    return new Proxy(target, {
      get(t, prop) {
        if (prop === 'fillText') return fillText;
        if (SHAPE_CALLS.includes(prop)) return noop;
        const v = t[prop];
        return typeof v === 'function' ? v.bind(t) : v;
      },
      set(t, prop, v) {
        // gradientes não importam para o texto; evita estilos que o canvas2svg não suporta
        if ((prop === 'strokeStyle' || prop === 'fillStyle') && typeof v !== 'string') v = '#000000';
        t[prop] = v;
        return true;
      },
    });
  }

  function draw(canvasLike, state, back, side) {
    if (side === 'back') DH_RENDER.renderBack(canvasLike, state, back);
    else DH_RENDER.renderFront(canvasLike, state);
  }

  // Desenha a frente ou o verso como <svg> (as imagens precisam estar carregadas: DH_RENDER.whenReady)
  function cardSvg(state, back, side) {
    const h = DH_RENDER.cardHeight(state);

    // 1) fundo achatado e opaco, em 600 dpi
    const bg = document.createElement('canvas');
    bg.width = Math.round(W * RASTER);
    bg.height = Math.round(h * RASTER);
    const real = bg.getContext('2d');
    draw({ width: bg.width, height: bg.height, getContext: () => noTextContext(real) }, state, back, side);
    real.setTransform(1, 0, 0, 1, 0, 0);
    real.globalAlpha = 1;
    real.globalCompositeOperation = 'destination-over'; // o que ficou transparente vira branco
    real.fillStyle = '#ffffff';
    real.fillRect(0, 0, bg.width, bg.height);
    const bgHref = bg.toDataURL('image/jpeg', 0.95);

    // 2) texto em vetor
    const c2s = new C2S(W, h);
    draw({ width: W, height: h, getContext: () => textOnlyContext(c2s) }, state, back, side);
    const svg = c2s.getSvg();
    svg.querySelectorAll('text').forEach((t) => {
      t.removeAttribute('opacity');
      t.removeAttribute('fill-opacity');
      t.removeAttribute('stroke');
    });

    const img = document.createElementNS(NS, 'image');
    img.setAttribute('x', 0);
    img.setAttribute('y', 0);
    img.setAttribute('width', W);
    img.setAttribute('height', h);
    img.setAttribute('preserveAspectRatio', 'none');
    img.setAttribute('href', bgHref);
    img.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', bgHref);
    const defs = svg.querySelector('defs');
    svg.insertBefore(img, defs ? defs.nextSibling : svg.firstChild);

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
