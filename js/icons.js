/* Ícones genéricos (desenhados à mão, viewBox 0 0 64 64) e predefinições de domínio. */
(function () {
  const ICONS = {
    star: '<path d="M32 2 L38.5 25.5 L62 32 L38.5 38.5 L32 62 L25.5 38.5 L2 32 L25.5 25.5 Z"/>',
    sword:
      '<path d="M32 2 L39 13 L39 41 L25 41 L25 13 Z"/>' +
      '<path d="M14 41 H50 L47 48 H17 Z"/>' +
      '<rect x="28.5" y="48" width="7" height="9"/>' +
      '<circle cx="32" cy="59" r="4"/>',
    bone:
      '<g transform="rotate(-45 32 32)">' +
      '<rect x="14" y="27" width="36" height="10"/>' +
      '<circle cx="13" cy="26" r="7"/><circle cx="13" cy="38" r="7"/>' +
      '<circle cx="51" cy="26" r="7"/><circle cx="51" cy="38" r="7"/></g>',
    book:
      '<path d="M6 12 Q18 6 30 13 V56 Q18 49 6 54 Z"/>' +
      '<path d="M34 13 Q46 6 58 12 V54 Q46 49 34 56 Z"/>',
    heart:
      '<path d="M32 58 C12 44 4 33 4 21 C4 11 11 6 18.5 6 C25 6 30 10 32 16 C34 10 39 6 45.5 6 C53 6 60 11 60 21 C60 33 52 44 32 58 Z"/>',
    moon:
      '<defs><mask id="m"><rect width="64" height="64" fill="#fff"/><circle cx="44" cy="22" r="21" fill="#000"/></mask></defs>' +
      '<circle cx="30" cy="34" r="27" mask="url(#m)"/>' +
      '<path d="M50 40 L52 46 L58 48 L52 50 L50 56 L48 50 L42 48 L48 46 Z"/>',
    leaf:
      '<path d="M12 52 C10 26 30 8 60 4 C58 34 40 54 12 52 Z"/>' +
      '<path d="M4 60 L26 38" stroke="{c}" stroke-width="5" stroke-linecap="round" fill="none"/>',
    crown:
      '<path d="M6 48 L9 16 L22 31 L32 8 L42 31 L55 16 L58 48 Z"/>' +
      '<rect x="6" y="52" width="52" height="7" rx="1"/>',
    shield:
      '<path d="M32 3 L57 11 V30 C57 46 47 56 32 62 C17 56 7 46 7 30 V11 Z"/>',
    diamond: '<path d="M32 3 L61 32 L32 61 L3 32 Z"/>',
    flame:
      '<path d="M32 62 C16 62 8 51 8 40 C8 28 18 22 20 8 C28 14 30 22 30 28 C34 24 36 18 36 12 C48 20 56 30 56 42 C56 53 47 62 32 62 Z"/>',
    eye:
      '<defs><mask id="e"><rect width="64" height="64" fill="#fff"/><circle cx="32" cy="32" r="8" fill="#000"/></mask></defs>' +
      '<path mask="url(#e)" d="M2 32 C12 16 22 10 32 10 C42 10 52 16 62 32 C52 48 42 54 32 54 C22 54 12 48 2 32 Z"/>',
  };

  // Cores aproximadas dos domínios do jogo base + opção livre.
  const DOMAINS = [
    { id: 'arcana', name: 'Arcano', color: '#4e345b', icon: 'star' },
    { id: 'blade', name: 'Lâmina', color: '#af231c', icon: 'sword' },
    { id: 'bone', name: 'Osso', color: '#9a9fa0', icon: 'bone' },
    { id: 'codex', name: 'Códice', color: '#24395d', icon: 'book' },
    { id: 'grace', name: 'Graça', color: '#c0307a', icon: 'heart' },
    { id: 'midnight', name: 'Meia-noite', color: '#1e201f', icon: 'moon' },
    { id: 'sage', name: 'Sábio', color: '#244e30', icon: 'leaf' },
    { id: 'splendor', name: 'Esplendor', color: '#b8a342', icon: 'crown' },
    { id: 'valor', name: 'Valor', color: '#e2680e', icon: 'shield' },
    { id: 'custom-flame', name: 'Chama (extra)', color: '#c2410c', icon: 'flame' },
    { id: 'custom-eye', name: 'Olho (extra)', color: '#0f766e', icon: 'eye' },
    { id: 'custom', name: 'Losango (extra)', color: '#5b5b7a', icon: 'diamond' },
  ];

  function svgFor(iconKey, color) {
    const body = (ICONS[iconKey] || ICONS.diamond);
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="256" height="256">' +
      '<g fill="' + color + '">' + body.split('{c}').join(color) + '</g></svg>'
    );
  }

  function svgDataUrl(iconKey, color) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgFor(iconKey, color));
  }

  function domainById(id) {
    return DOMAINS.find((d) => d.id === id) || DOMAINS[DOMAINS.length - 1];
  }

  window.DH_ICONS = { ICONS, DOMAINS, svgDataUrl, domainById };
})();
