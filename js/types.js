/*
 * Registro dos tipos de carta.
 *
 * Para criar um tipo novo basta adicionar uma entrada em DEFS. Tudo que não for
 * informado vem de DEFAULT_DEF, então o tipo novo já nasce com:
 *   - o grupo "Cor e ícone" (cor do tema + ícone, usados no verso padrão);
 *   - o layout padrão (arte em cima, faixa dourada, título e texto);
 *   - nenhum campo extra (features vazio).
 *
 * features (campos extras que aparecem no painel — atributo data-feat no HTML):
 *   subtitle    → Subtítulo
 *   level       → Nível e custo de recordação (e o número no estandarte)
 *   stats       → dois valores em destaque; os rótulos vêm de stats(s)
 *   description → descrição em itálico antes do texto
 *   dom2        → segundo domínio/ícone no estandarte
 *   itemKind    → seletor Arma / Armadura / Outro
 */
(function () {
  const BASE_STATE = {
    title: '', label: '', subtitle: '', level: 1, recall: '', description: '', text: '',
    evasion: '', hp: '', itemKind: 'weapon', trait: '', damage: '', armor: '', threshold: '',
    color: '#4e345b', gold: '#e7b93c',
    dom1: { preset: 'arcana', icon: null }, dom2: { preset: 'blade', icon: null },
    iconKeepColors: false, textScale: 1, artist: '', footer: 'Homebrew', art: null,
    bg: null, bgFade: 0,
    backMode: 'image', backTitle: '',
    backText: '*Escreva aqui o texto do verso: regras extras, história ou anotações.*',
  };

  const DEFAULT_THEME = {
    title: 'Cor e ícone',
    color: 'Cor do tema',
    dom1: 'Ícone',
    hint: 'A cor e o ícone aparecem no verso padrão da carta (quando não há imagem de verso).',
  };
  const BANNER_THEME = {
    title: 'Estandarte e domínios',
    color: 'Cor do estandarte',
    dom1: 'Domínio 1',
    hint: 'Ícones enviados são pintados de branco sobre o estandarte — use PNG com fundo transparente.',
  };

  const DEFAULT_DEF = {
    name: 'Carta',
    icon: '◆',
    layout: 'standard',      // 'standard' | 'ancestry' | 'community'
    banner: 0,               // 0 = sem estandarte, 1 = nível + ícone, 2 = dois ícones
    art: 560,                // altura da arte (px de 1050)
    features: [],
    theme: DEFAULT_THEME,
    presetSetsColor: false,  // escolher o domínio também troca a cor
    labels: [],
    subtitles: [],
    stats: () => [],
    example: {},
  };

  const ITEM_KINDS = [
    { id: 'weapon', name: 'Arma', icon: 'blade' },
    { id: 'armor', name: 'Armadura', icon: 'valor' },
    { id: 'other', name: 'Outro', icon: 'custom' },
  ];
  const ITEM_STATS = {
    weapon: [
      { key: 'trait', label: 'Atributo', badge: 'ATRIBUTO' },
      { key: 'damage', label: 'Dano', badge: 'DANO' },
    ],
    armor: [
      { key: 'armor', label: 'Armadura', badge: 'ARMADURA' },
      { key: 'threshold', label: 'Limiar', badge: 'LIMIAR' },
    ],
    other: [],
  };

  const DEFS = {
    class: {
      name: 'Classe', icon: '⚔', banner: 2, art: 500,
      features: ['subtitle', 'stats', 'description', 'dom2'],
      theme: BANNER_THEME,
      labels: ['Classe'],
      stats: () => [
        { key: 'evasion', label: 'Evasão inicial', badge: 'EVASÃO' },
        { key: 'hp', label: 'Pontos de Vida', badge: 'PONTOS DE VIDA' },
      ],
      example: {
        title: 'Andarilho', label: 'Classe', subtitle: 'Domínios: Sábio e Meia-noite', color: '#2f5d46',
        evasion: '10', hp: '6',
        dom1: { preset: 'sage', icon: null }, dom2: { preset: 'midnight', icon: null },
        description: 'Viajantes incansáveis que conhecem cada trilha esquecida e cada abrigo escondido.',
        text: '***Recurso de Esperança — Passo Certeiro:*** **Gaste 3 Esperança** para se mover até um ponto Distante sem fazer testes, ignorando terreno difícil.\n***Rastreador:*** Você tem vantagem em testes para seguir pegadas ou encontrar caminhos.',
      },
    },
    subclass: {
      name: 'Subclasse', icon: '🛡', banner: 2,
      features: ['subtitle', 'dom2'],
      theme: BANNER_THEME,
      labels: ['Bardo', 'Druida', 'Guardião', 'Patrulheiro', 'Ladino', 'Serafim', 'Feiticeiro', 'Guerreiro', 'Mago'],
      subtitles: ['Fundamental', 'Especialização', 'Maestria'],
      example: {
        title: 'Sentinela de Aço', label: 'Guardião', subtitle: 'Fundamental', color: '#c8401b',
        dom1: { preset: 'valor', icon: null }, dom2: { preset: 'blade', icon: null },
        text: '***Muralha Viva:*** Quando um aliado a até Muito Perto sofrer dano, você pode **marcar 1 Estresse** para receber o dano no lugar dele.\n***Postura Firme:*** Enquanto estiver empunhando um escudo, você não pode ser derrubado nem empurrado.',
      },
    },
    ancestry: {
      name: 'Ancestralidade', icon: '🧬', layout: 'ancestry', art: 640,
      features: ['description'],
      labels: ['Ancestralidade'],
      example: {
        title: 'Mariposa', label: 'Ancestralidade', color: '#3b4a7a',
        dom1: { preset: 'arcana', icon: null },
        description: 'Mariposas são um povo noturno de asas felpudas, atraído por luzes e segredos.',
        text: '***Asas Silenciosas:*** Você pode voar. Enquanto voa no escuro, tem vantagem em testes para se esconder.\n***Olhos Noturnos:*** Você enxerga na penumbra como se fosse dia claro.',
      },
    },
    community: {
      name: 'Comunidade', icon: '🏘', layout: 'community', art: 690,
      features: ['description'],
      labels: ['Comunidade'],
      example: {
        title: 'Porto-Névoa', label: 'Comunidade', color: '#2f6b67',
        dom1: { preset: 'arcana', icon: null },
        description: 'Ser de Porto-Névoa significa crescer entre docas encharcadas, sinos de nevoeiro e contrabandistas gentis.',
        text: '***Conhecer as Marés:*** Ao negociar com marinheiros, mercadores ou contrabandistas, você pode **gastar 1 Esperança** para descobrir um boato útil sobre a região.',
      },
    },
    domain: {
      name: 'Carta de Domínio', icon: '✦', banner: 1,
      features: ['level'],
      theme: { ...BANNER_THEME, title: 'Domínio', color: 'Cor do domínio', dom1: 'Domínio' },
      presetSetsColor: true,
      labels: ['Magia', 'Habilidade', 'Grimório'],
      example: {
        title: 'Eco Arcano', label: 'Magia', level: 4, recall: '1', color: '#4e345b',
        dom1: { preset: 'arcana', icon: null },
        text: 'Quando um aliado a até Perto conjurar uma magia, você pode **gastar 2 Esperança** para repetir o efeito dela contra um alvo diferente.\nUse esta carta uma vez por descanso longo.',
      },
    },
    item: {
      name: 'Item', icon: '🗡', art: 500,
      features: ['subtitle', 'itemKind', 'stats', 'description'],
      labels: ['Item', 'Arma', 'Armadura', 'Consumível', 'Relíquia'],
      subtitles: ['Arma Primária • Uma Mão', 'Arma Primária • Duas Mãos', 'Arma Secundária', 'Armadura', 'Consumível', 'Item Mágico'],
      stats: (s) => ITEM_STATS[s.itemKind] || [],
      example: {
        title: 'Lâmina do Crepúsculo', label: 'Item', subtitle: 'Arma Primária • Uma Mão', color: '#7a4b2a',
        itemKind: 'weapon', trait: 'Agilidade', damage: 'd8+2 fís', armor: '4', threshold: '7 / 15',
        dom1: { preset: 'blade', icon: null },
        description: '',
        text: '***Fio Sombrio:*** Quando você acerta um ataque com esta arma no escuro, cause **+1d6** de dano.',
      },
    },
  };

  // Ordem no menu lateral
  const ORDER = ['class', 'subclass', 'ancestry', 'community', 'domain', 'item'];

  const resolved = {};
  for (const id of Object.keys(DEFS)) resolved[id] = { ...DEFAULT_DEF, ...DEFS[id], id };
  for (const id of Object.keys(DEFS)) if (!ORDER.includes(id)) ORDER.push(id);

  function get(type) { return resolved[type] || { ...DEFAULT_DEF, id: type }; }
  function has(type, feature) { return get(type).features.includes(feature); }
  function defaults(type) {
    const d = get(type);
    return { ...JSON.parse(JSON.stringify(BASE_STATE)), label: d.name, ...JSON.parse(JSON.stringify(d.example)), type };
  }
  function artRect(type) { return { x: 0, y: 0, w: 750, h: get(type).art }; }

  window.DH_TYPES = { ORDER, ITEM_KINDS, get, has, defaults, artRect };
})();
