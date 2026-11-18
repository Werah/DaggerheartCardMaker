/* Montagem da folha A4: distribuição das cartas, prévia, PDF e impressão. */
(function () {
  const CARD_W = 63.5, CARD_H = 88.9;   // mm (2,5" x 3,5")
  const PAGE_W = 210, PAGE_H = 297;     // A4
  const COLS = 3, ROWS = 3;
  const BASE_PX = 1050;                 // altura de uma carta normal no renderizador

  /*
   * Distribui as cartas em 3 colunas por página. Cada coluna guarda até onde já está
   * ocupada, então cartas de alturas diferentes (Adversário e Ambiente crescem para
   * baixo) se encaixam umas embaixo das outras. Com cartas de tamanho normal, o
   * resultado é a mesma grade de 3 x 3.
   *
   * Vinculado (padrão): frente e verso ficam colados para dobrar.
   *   - primeiro tenta o par deitado (frente | verso), ocupando duas colunas;
   *   - se não couber, tenta o par em pé (frente em cima, verso embaixo, girado 180°
   *     para ficar na posição certa depois de dobrar) numa coluna;
   *   - cartas sem verso vão para o espaço livre mais alto da página.
   * Quebrar vínculo (opts.unlink): cada frente e cada verso vira uma carta solta,
   *   em sequência: Carta1, Verso1, Carta2 / Verso2, Carta3, Verso3 / ...
   */
  function pack(items, opts) {
    const gap = Number(opts.gap) || 0;
    const units = [];
    items.forEach((it) => {
      const n = Math.max(1, Math.min(99, parseInt(it.qty, 10) || 1));
      for (let i = 0; i < n; i++) units.push(it);
    });

    const gridW = COLS * CARD_W + (COLS - 1) * gap;
    const usableH = ROWS * CARD_H + (ROWS - 1) * gap;
    const x0 = (PAGE_W - gridW) / 2, y0 = (PAGE_H - usableH) / 2;
    const colX = (c) => x0 + c * (CARD_W + gap);
    const ext = Math.min(3, gap * 0.9);
    const heightOf = (it) => CARD_H * ((Number(it.h) || BASE_PX) / BASE_PX);
    const EPS = 0.01;

    const pages = [];
    const newPage = () => {
      const p = { cards: [], outlines: [], cols: new Array(COLS).fill(0) };
      pages.push(p);
      return p;
    };
    // posição mais alta (e mais à esquerda) onde cabe um bloco de `span` colunas e altura h
    const best = (p, span, h) => {
      let pick = null;
      for (let c = 0; c + span <= COLS; c++) {
        let y = 0;
        for (let k = 0; k < span; k++) y = Math.max(y, p.cols[c + k]);
        if (y + h > usableH + EPS) continue;
        if (!pick || y < pick.y - EPS) pick = { c, y };
      }
      return pick;
    };
    const occupy = (p, c, span, y, h) => {
      for (let k = 0; k < span; k++) p.cols[c + k] = y + h + gap;
    };
    const placeSingle = (p, spot, h, src, key, svg) => {
      const x = colX(spot.c), y = y0 + spot.y;
      occupy(p, spot.c, 1, spot.y, h);
      p.cards.push({ x, y, w: CARD_W, h, src, key, svg });
      p.outlines.push({ x, y, w: CARD_W, h, fold: null });
    };
    const findSingle = (h, onlyLast) => {
      const list = onlyLast ? pages.slice(-1) : pages;
      for (const p of list) { const b = best(p, 1, h); if (b) return { p, b }; }
      const p = newPage();
      return { p, b: best(p, 1, h) || { c: 0, y: 0 } };
    };

    if (opts.unlink) {
      units.forEach((it) => {
        const h = heightOf(it);
        let f = findSingle(h, true);
        placeSingle(f.p, f.b, h, it.front, it.id + 'f', it.frontSvg);
        if (it.back) {
          f = findSingle(h, true);
          placeSingle(f.p, f.b, h, it.back, it.id + 'b', it.backSvg);
        }
      });
    } else {
      for (const it of units) {
        const h = heightOf(it);
        if (!it.back) {
          const f = findSingle(h, false);
          placeSingle(f.p, f.b, h, it.front, it.id + 'f', it.frontSvg);
          continue;
        }
        // na mesma página: deitado primeiro, depois em pé; só então abre página nova
        let page = null, spot = null, mode = null;
        for (const p of pages) {
          spot = best(p, 2, h); mode = 'h';
          if (spot) { page = p; break; }
          spot = best(p, 1, h * 2); mode = 'v';
          if (spot) { page = p; break; }
        }
        if (!page) { page = newPage(); spot = best(page, 2, h) || { c: 0, y: 0 }; mode = 'h'; }
        const p = page;
        if (mode === 'h') {
          occupy(p, spot.c, 2, spot.y, h);
          const x = colX(spot.c) + gap / 2, y = y0 + spot.y;
          p.cards.push({ x, y, w: CARD_W, h, src: it.front, key: it.id + 'f', svg: it.frontSvg });
          p.cards.push({ x: x + CARD_W, y, w: CARD_W, h, src: it.back, key: it.id + 'b', svg: it.backSvg });
          p.outlines.push({ x, y, w: CARD_W * 2, h,
            fold: { x1: x + CARD_W, y1: y - ext, x2: x + CARD_W, y2: y + h + ext } });
        } else {
          occupy(p, spot.c, 1, spot.y, h * 2);
          const x = colX(spot.c), y = y0 + spot.y;
          p.cards.push({ x, y, w: CARD_W, h, src: it.front, key: it.id + 'f', svg: it.frontSvg });
          p.cards.push({ x, y: y + h, w: CARD_W, h, src: it.back, key: it.id + 'b', svg: it.backSvg, rotate: true });
          p.outlines.push({ x, y, w: CARD_W, h: h * 2,
            fold: { x1: x - ext, y1: y + h, x2: x + CARD_W + ext, y2: y + h } });
        }
      }
    }
    pages.forEach((p) => delete p.cols);
    return pages;
  }

  const pct = (v, total) => (v / total) * 100 + '%';

  function pageElement(page, cutLines) {
    const el = document.createElement('div');
    el.className = 'page';
    for (const c of page.cards) {
      let img;
      if (c.svg) {
        img = c.svg.cloneNode(true);
        img.setAttribute('class', 'card-svg');
      } else {
        img = document.createElement('img');
        img.src = c.src;
        img.alt = '';
      }
      img.style.left = pct(c.x, PAGE_W);
      img.style.top = pct(c.y, PAGE_H);
      img.style.width = pct(c.w, PAGE_W);
      img.style.height = pct(c.h, PAGE_H);
      if (c.rotate) img.style.transform = 'rotate(180deg)';
      el.appendChild(img);
    }
    if (cutLines) {
      const ns = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('class', 'cut');
      svg.setAttribute('viewBox', `0 0 ${PAGE_W} ${PAGE_H}`);
      svg.setAttribute('preserveAspectRatio', 'none');
      for (const o of page.outlines) {
        const r = document.createElementNS(ns, 'rect');
        r.setAttribute('x', o.x); r.setAttribute('y', o.y);
        r.setAttribute('width', o.w); r.setAttribute('height', o.h);
        r.setAttribute('fill', 'none');
        r.setAttribute('stroke', '#9a9a9a');
        r.setAttribute('stroke-width', '0.15');
        svg.appendChild(r);
        if (o.fold != null) {
          const l = document.createElementNS(ns, 'line');
          l.setAttribute('x1', o.fold.x1); l.setAttribute('y1', o.fold.y1);
          l.setAttribute('x2', o.fold.x2); l.setAttribute('y2', o.fold.y2);
          l.setAttribute('stroke', '#6b6b6b');
          l.setAttribute('stroke-width', '0.2');
          l.setAttribute('stroke-dasharray', '1.2 1');
          svg.appendChild(l);
        }
      }
      el.appendChild(svg);
    }
    return el;
  }

  function renderPages(container, items, opts) {
    container.innerHTML = '';
    const pages = pack(items, opts);
    pages.forEach((p, i) => {
      const wrap = document.createElement('div');
      wrap.className = 'sheet-page-wrap';
      wrap.appendChild(pageElement(p, opts.cut));
      const n = document.createElement('div');
      n.className = 'page-num';
      n.textContent = `Página ${i + 1} de ${pages.length}`;
      wrap.appendChild(n);
      container.appendChild(wrap);
    });
    return pages.length;
  }

  // Gira uma imagem 180° (usado no verso do par em pé)
  async function rotate180(src) {
    const bmp = await createImageBitmap(await (await fetch(src)).blob());
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    const x = c.getContext('2d');
    x.translate(c.width, c.height);
    x.rotate(Math.PI);
    x.drawImage(bmp, 0, 0);
    return c.toDataURL('image/jpeg', 1);
  }

  async function exportPdf(items, opts, filename) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    const pages = pack(items, opts);
    const vector = pages.some((p) => p.cards.some((c) => c.svg));
    if (vector) await DH_VECTOR.preparePdf(doc);
    const rotated = new Map();
    for (const p of pages) {
      for (const c of p.cards) {
        if (!c.svg && c.rotate && !rotated.has(c.key)) rotated.set(c.key, await rotate180(c.src));
      }
    }
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      if (i > 0) doc.addPage('a4', 'portrait');
      for (const c of p.cards) {
        if (c.svg) {
          await DH_VECTOR.addSvgToPdf(doc, c.svg, c.x, c.y, c.w, c.h, c.rotate);
          continue;
        }
        const src = c.rotate ? rotated.get(c.key) : c.src;
        const fmt = src.startsWith('data:image/png') ? 'PNG' : 'JPEG';
        doc.addImage(src, fmt, c.x, c.y, c.w, c.h, c.key + (c.rotate ? 'r' : ''), 'NONE');
      }
      if (opts.cut) {
        for (const o of p.outlines) {
          doc.setLineDashPattern([], 0);
          doc.setDrawColor(154);
          doc.setLineWidth(0.15);
          doc.rect(o.x, o.y, o.w, o.h, 'S');
          if (o.fold != null) {
            doc.setDrawColor(107);
            doc.setLineWidth(0.2);
            doc.setLineDashPattern([1.2, 1], 0);
            doc.line(o.fold.x1, o.fold.y1, o.fold.x2, o.fold.y2);
            doc.setLineDashPattern([], 0);
          }
        }
      }
    }
    doc.save(filename || 'cartas-daggerheart-a4.pdf');
  }

  async function print(items, opts) {
    const root = document.getElementById('printRoot');
    root.innerHTML = '';
    pack(items, opts).forEach((p) => root.appendChild(pageElement(p, opts.cut)));
    const imgs = [...root.querySelectorAll('img, image')].filter((i) => i.decode);
    await Promise.all(imgs.map((img) => (img.decode ? img.decode().catch(() => null) : null)));
    window.print();
  }

  window.DH_SHEET = { CARD_W, CARD_H, pack, renderPages, exportPdf, print };
})();
