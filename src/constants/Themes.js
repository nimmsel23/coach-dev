export const DARK_THEMES = [
  'vital', 'nordic', 'dracula', 'mocha',
  'gruvbox', 'solarized-dark',
  'ant-dark', 'arc-dark',
  'matrix', 'nothing',
  'sweet-mars', 'sweet-purple',
];

export const LIGHT_THEMES = [
  'vital-light', 'honey', 'latte', 'solarized', 'gruvbox-light',
  'arc', 'ant', 'alucard', 'sweet-amber-blue',
];

export const THEMES = {
  // Dark
  vital: { bg: '#0b0e14', accent: '#6ee7b7' },
  nordic:             { bg: '#2e3440', accent: '#88c0d0' },
  dracula:            { bg: '#1e1f29', accent: '#bd93f9' },
  mocha:              { bg: '#1e1e2e', accent: '#cba6f7' },
  gruvbox:            { bg: '#282828', accent: '#fabd2f' },
  'solarized-dark':   { bg: '#002b36', accent: '#268bd2' },
  'ant-dark':         { bg: '#222e32', accent: '#9bbfbf' },
  'arc-dark':         { bg: '#404552', accent: '#5294e2' },
  matrix:             { bg: '#000000', accent: '#00ff41' },
  nothing:            { bg: '#000000', accent: '#ff3333' },
  'sweet-mars':       { bg: '#2b1d1f', accent: '#ff5f5f' },
  'sweet-purple':     { bg: '#161925', accent: '#c50ed2' },

  // Light
  'vital-light': { bg: '#f5f6f8', accent: '#059669' },
  honey:              { bg: '#fdfaf0', accent: '#f59e0b' },
  latte:              { bg: '#eff1f5', accent: '#7287fd' },
  solarized:          { bg: '#fdf6e3', accent: '#268bd2' },
  'gruvbox-light':    { bg: '#fbf1c7', accent: '#b57614' },
  arc:                { bg: '#ffffff', accent: '#5294e2' },
  ant:                { bg: '#f0f2f5', accent: '#1677ff' },
  alucard:            { bg: '#fffbeb', accent: '#644ac9' },
  'sweet-amber-blue': { bg: '#f4f7fb', accent: '#e8a020' },
};

export const VALID_TABS = new Set(['dash', 'session', 'review', 'learn', 'settings', 'coach', 'gate']);
