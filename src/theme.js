// Centralised palette + helpers shared by TreeView, OffCanvasRight and the
// CSS variables in App.css. Two themes (dark/light) keep the same accent
// hues — only the neutral surfaces flip — so structural-stage colours stay
// recognisable when the user toggles. The accent palette intentionally
// avoids the Bootstrap-style success-green / danger-red / warning-amber
// triplet: insert is teal, delete is rose, search is violet.

const ACCENTS = {
  insert:          '#14b8a6', // teal
  delete:          '#f43f5e', // rose
  search:          '#a78bfa', // violet
  info:            '#0ea5e9', // sky
  random:          '#8b5cf6', // purple
  clear:           '#64748b', // slate
  log:             '#22d3ee', // cyan
  overflow:        '#fb923c', // orange (soft)
  split:           '#06b6d4', // cyan
  'root-split':    '#06b6d4',
  merge:           '#c084fc', // light purple
  'merge-drop':    '#c084fc',
  'borrow-left':   '#60a5fa', // blue
  'borrow-right':  '#60a5fa',
  'replace-pred':  '#fbbf24', // amber (used sparingly, only for replace)
  'replace-succ':  '#fbbf24',
  'leaf-insert':   '#14b8a6',
  'leaf-delete':   '#f43f5e',
  'root-collapse': '#c084fc',
};

export const THEMES = {
  dark: {
    name: 'dark',
    bg:           '#0b1220',
    panel:        '#141d33',
    panelAlt:     '#1b2540',
    border:       '#2a3654',
    text:         '#e6ecf7',
    textDim:      '#8893ad',
    nodeBg:       '#1b2540',
    nodeBorder:   '#3a4566',
    keyDivider:   '#2a3654',
    keyText:      '#e6ecf7',
    edge:         '#5b6788',
    edgeLit:      ACCENTS.search,
    bannerBg:     'rgba(11, 18, 32, 0.92)',
    bannerCaption:'#cbd5e1',
    activeKeyBg:  'rgba(167, 139, 250, 0.18)',
    activeKeyText:'#f5f3ff',
    deleteKeyBg:  'rgba(244, 63, 94, 0.28)',
    deleteKeyText:'#fecdd3',
    medianKeyBg:  '#fbbf24',
    medianKeyText:'#1c1400',
    chipStroke:   'rgba(255,255,255,0.35)',
    accents:      ACCENTS,
  },
  light: {
    name: 'light',
    bg:           '#f4f6fb',
    panel:        '#ffffff',
    panelAlt:     '#eef2f8',
    border:       '#dbe2ee',
    text:         '#0f172a',
    textDim:      '#5b6580',
    nodeBg:       '#ffffff',
    nodeBorder:   '#c9d2e2',
    keyDivider:   '#dbe2ee',
    keyText:      '#0f172a',
    edge:         '#94a3b8',
    edgeLit:      '#7c3aed',
    bannerBg:     'rgba(255, 255, 255, 0.95)',
    bannerCaption:'#475569',
    activeKeyBg:  'rgba(124, 58, 237, 0.16)',
    activeKeyText:'#3b0764',
    deleteKeyBg:  'rgba(244, 63, 94, 0.22)',
    deleteKeyText:'#9f1239',
    medianKeyBg:  '#f59e0b',
    medianKeyText:'#1c1400',
    chipStroke:   'rgba(15, 23, 42, 0.25)',
    accents:      ACCENTS,
  },
};

// Picked so chip text reads cleanly on each accent background.
const CHIP_FG = {
  insert: '#052e1f',
  delete: '#fff1f3',
  search: '#1c0a3d',
};

export function chipColors(theme, operation) {
  const bg = theme.accents[operation] || theme.accents.info;
  return { bg, fg: CHIP_FG[operation] || '#ffffff' };
}

export function kindColor(theme, kind) {
  return theme.accents[kind] || theme.accents.info;
}
