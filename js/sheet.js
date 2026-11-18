/* Montagem da folha A4: distribuição das cartas, prévia, PDF e impressão. */
(function () {
  const CARD_W = 63.5, CARD_H = 88.9;   // mm (2,5" x 3,5")
  const PAGE_W = 210, PAGE_H = 297;     // A4
  const COLS = 3, ROWS = 3;

  /*
   * Distribui as cartas numa grade de 3 x 3 vagas por página.
   *
   * Vinculado (padrão): frente e verso ficam colados para dobrar.
   *   - primeiro tenta o par deitado (frente | verso) numa linha;
   *   - se não couber, tenta o par em pé (frente em cima, verso embaixo, girado 180°
   *     para ficar na posição certa depois de dobrar) numa coluna livre;
   *   - cartas sem verso ocupam qualquer vaga livre.
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
    const gridH = ROWS * CARD_H + (ROWS - 1) * gap;
    const x0 = (PAGE_W - gridW) / 2, y0 = (PAGE_H - gridH) / 2;
    const colX = (c) => x0 + c * (CARD_W + gap);
    const rowY = (r) => y0 + r * (CARD_H + gap);
    const ext = Math.min(3, gap * 0.9);
    const pages = [];
    const newPage = () => {
      const p = { cards: [], outlines: [], grid: Array.from({ length: ROWS }, () => new Array(COLS).fill(false)) };
      pages.push(p);
      return p;
    };
    const single = (page, r, c, src, key) => {
      page.grid[r][c] = true;
      page.cards.push({ x: colX(c), y: rowY(r), w: CARD_W, h: CARD_H, src, key });
      page.outlines.push({ x: colX(c), y: rowY(r), w: CARD_W, h: CARD_H, fold: null });
    };

    if (opts.unlink) {
      const seq = [];
      units.forEach((it) => {
        seq.push({ src: it.front, key: it.id + 'f' });
        if (it.back) seq.push({ src: it.back, key: it.id + 'b' });
      });
      seq.forEach((card, i) => {
        const slot = i % (COLS * ROWS);
        const page = slot === 0 ? newPage() : pages[pages.length - 1];
        single(page, Math.floor(slot / COLS), slot % COLS, card.src, card.key);
      });
    } else {
      const free = (p, r, c) => r < ROWS && c < COLS && !p.grid[r][c];
      const findIn = (p, test) => {
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (test(p, r, c)) return { p, r, c };
        return null;
      };
      const horiz = (p, r, c) => free(p, r, c) && free(p, r, c + 1);
      const vert = (p, r, c) => free(p, r, c) && free(p, r + 1, c);

      for (const it of units) {
        if (!it.back) {
          let s = null;
          for (const p of pages) { s = findIn(p, free); if (s) break; }
          if (!s) s = { p: newPage(), r: 0, c: 0 };
          single(s.p, s.r, s.c, it.front, it.id + 'f');
          continue;
        }
        // na mesma página: deitado primeiro, depois em pé; só então abre página nova
        let spot = null, mode = null;
        for (const p of pages) {
          spot = findIn(p, horiz); mode = 'h';
          if (spot) break;
          spot = findIn(p, vert); mode = 'v';
          if (spot) break;
        }
        if (!spot) { spot = { p: newPage(), r: 0, c: 0 }; mode = 'h'; }
        const { p, r, c } = spot;
        if (mode === 'h') {
          p.grid[r][c] = p.grid[r][c + 1] = true;
          const x = colX(c) + gap / 2, y = rowY(r);
          p.cards.push({ x, y, w: CARD_W, h: CARD_H, src: it.front, key: it.id + 'f' });
          p.cards.push({ x: x + CARD_W, y, w: CARD_W, h: CARD_H, src: it.back, key: it.id + 'b' });
          p.outlines.push({ x, y, w: CARD_W * 2, h: CARD_H,
            fold: { x1: x + CARD_W, y1: y - ext, x2: x + CARD_W, y2: y + CARD_H + ext } });
        } else {
          p.grid[r][c] = p.grid[r + 1][c] = true;
          const x = colX(c), y = rowY(r) + gap / 2;
          p.cards.push({ x, y, w: CARD_W, h: CARD_H, src: it.front, key: it.id + 'f' });
          p.cards.push({ x, y: y + CARD_H, w: CARD_W, h: CARD_H, src: it.back, key: it.id + 'b', rotate: true });
          p.outlines.push({ x, y, w: CARD_W, h: CARD_H * 2,
            fold: { x1: x - ext, y1: y + CARD_H, x2: x + CARD_W + ext, y2: y + CARD_H } });
        }
      }
    }
    pages.forEach((p) => delete p.grid);
    return pages;
  }

  const pct = (v, total) => (v / total) * 100 + '%';

  function pageElement(page, cutLines) {
    const el = document.createElement('div');
    el.className = 'page';
    for (const c of page.cards) {
      const img = document.createElement('img');
      img.src = c.src;
      img.alt = '';
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
    const rotated = new Map();
    for (const p of pages) {
      for (const c of p.cards) {
        if (c.rotate && !rotated.has(c.key)) rotated.set(c.key, await rotate180(c.src));
      }
    }
    pages.forEach((p, i) => {
      if (i > 0) doc.addPage('a4', 'portrait');
      for (const c of p.cards) {
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
    });
    doc.save(filename || 'cartas-daggerheart-a4.pdf');
  }

  async function print(items, opts) {
    const root = document.getElementById('printRoot');
    root.innerHTML = '';
    pack(items, opts).forEach((p) => root.appendChild(pageElement(p, opts.cut)));
    const imgs = [...root.querySelectorAll('img')];
    await Promise.all(imgs.map((img) => (img.decode ? img.decode().catch(() => null) : null)));
    window.print();
  }

  window.DH_SHEET = { CARD_W, CARD_H, pack, renderPages, exportPdf, print };
})();
