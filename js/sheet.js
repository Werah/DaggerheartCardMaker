/* Montagem da folha A4: distribuição das cartas, prévia, PDF e impressão. */
(function () {
  const CARD_W = 63.5, CARD_H = 88.9;   // mm (2,5" x 3,5")
  const PAGE_W = 210, PAGE_H = 297;     // A4
  const COLS = 3, ROWS = 3;

  // Cada item vira 1 vaga (só frente) ou 2 vagas lado a lado (frente + verso).
  function pack(items, gap) {
    const units = [];
    items.forEach((it) => {
      const n = Math.max(1, Math.min(99, parseInt(it.qty, 10) || 1));
      for (let i = 0; i < n; i++) units.push(it);
    });

    const rows = [];
    const placed = [];
    for (const it of units) {
      const need = it.back ? 2 : 1;
      let spot = null;
      for (let r = 0; r < rows.length && !spot; r++) {
        for (let c = 0; c + need <= COLS; c++) {
          let free = true;
          for (let k = 0; k < need; k++) if (rows[r][c + k]) free = false;
          if (free) { spot = { r, c }; break; }
        }
      }
      if (!spot) { rows.push(new Array(COLS).fill(false)); spot = { r: rows.length - 1, c: 0 }; }
      for (let k = 0; k < need; k++) rows[spot.r][spot.c + k] = true;
      placed.push({ it, r: spot.r, c: spot.c, need });
    }

    const gridW = COLS * CARD_W + (COLS - 1) * gap;
    const gridH = ROWS * CARD_H + (ROWS - 1) * gap;
    const x0 = (PAGE_W - gridW) / 2, y0 = (PAGE_H - gridH) / 2;
    const pageCount = Math.ceil(rows.length / ROWS);
    const pages = Array.from({ length: pageCount }, () => ({ cards: [], outlines: [] }));

    for (const p of placed) {
      const page = pages[Math.floor(p.r / ROWS)];
      const y = y0 + (p.r % ROWS) * (CARD_H + gap);
      let x = x0 + p.c * (CARD_W + gap);
      if (p.need === 2) {
        x += gap / 2; // centraliza o par nas duas colunas
        page.cards.push({ x, y, w: CARD_W, h: CARD_H, src: p.it.front, key: p.it.id + 'f' });
        page.cards.push({ x: x + CARD_W, y, w: CARD_W, h: CARD_H, src: p.it.back, key: p.it.id + 'b' });
        page.outlines.push({ x, y, w: CARD_W * 2, h: CARD_H, fold: x + CARD_W, ext: Math.min(3, gap * 0.9) });
      } else {
        page.cards.push({ x, y, w: CARD_W, h: CARD_H, src: p.it.front, key: p.it.id + 'f' });
        page.outlines.push({ x, y, w: CARD_W, h: CARD_H, fold: null });
      }
    }
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
          l.setAttribute('x1', o.fold); l.setAttribute('x2', o.fold);
          l.setAttribute('y1', o.y - o.ext); l.setAttribute('y2', o.y + o.h + o.ext);
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
    const pages = pack(items, opts.gap);
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

  function exportPdf(items, opts, filename) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    const pages = pack(items, opts.gap);
    pages.forEach((p, i) => {
      if (i > 0) doc.addPage('a4', 'portrait');
      for (const c of p.cards) {
        const fmt = c.src.startsWith('data:image/png') ? 'PNG' : 'JPEG';
        doc.addImage(c.src, fmt, c.x, c.y, c.w, c.h, c.key, 'NONE');
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
            doc.line(o.fold, o.y - o.ext, o.fold, o.y + o.h + o.ext);
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
    pack(items, opts.gap).forEach((p) => root.appendChild(pageElement(p, opts.cut)));
    const imgs = [...root.querySelectorAll('img')];
    await Promise.all(imgs.map((img) => (img.decode ? img.decode().catch(() => null) : null)));
    window.print();
  }

  window.DH_SHEET = { CARD_W, CARD_H, pack, renderPages, exportPdf, print };
})();
