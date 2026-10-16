import { create } from 'zustand';

export const ls = (key, fallback) => {
  const v = localStorage.getItem(key);
  return v === null ? fallback : v;
};
export const lsInt = (key, fallback) => parseInt(ls(key, String(fallback)), 10);
export const lsFloat = (key, fallback) => parseFloat(ls(key, String(fallback)));

/**
 * Zustand-Settings-Store — SSOT-Definition, per Factory statt fest
 * verdrahteter Key-Prefixe. fitness-app (standalone, fitness-aos.web.app)
 * und die vitalos-Shell (vitalos.web.app, embedded via @fitness alias) sind
 * zwei getrennte Origins mit getrennten localStorage-Buckets, brauchen also
 * unterschiedliche Key-Prefixe — sollen aber dieselbe Feld-/Setter-Definition
 * nutzen statt zwei Implementierungen (Context+useState vs. Zustand) von
 * Hand synchron zu halten.
 */
export function createSettingsStore(prefix, extraFields = {}) {
  const key = (name) => `${prefix}-${name}`;

  const FIELDS = {
    theme:             [key('theme'),             () => ls(key('theme'), 'vital')],
    themeMode:         [key('theme-mode'),        () => ls(key('theme-mode'), 'manual')],
    circDark:          [key('circ-dark'),         () => ls(key('circ-dark'), 'vital')],
    circLight:         [key('circ-light'),        () => ls(key('circ-light'), 'vital-light')],
    recentDays:        [key('recentDays'),        () => lsInt(key('recentDays'), 7)],
    coverageThreshold: [key('coverageThreshold'), () => lsFloat(key('coverageThreshold'), 1.0)],
    showAdvanced:      [key('showAdvanced'),      () => ls(key('showAdvanced'), 'false') === 'true'],
    sidebarPinned:     [key('sidebarPinned'),     () => ls(key('sidebarPinned'), 'true') !== 'false'],
    swipeEnabled:      [key('swipeEnabled'),      () => ls(key('swipeEnabled'), 'false') === 'true'],
    muscleLanguage:    [key('muscleLanguage'),    () => ls(key('muscleLanguage'), 'de')],
    navMode:           [key('navMode'),           () => ls(key('navMode'), 'tabs')],
    // Konsumenten (z.B. vitalos-Shell) können zusätzliche, app-eigene Felder
    // (Profil/Domain-Daten wie gender/age/split) in derselben [lsKey, init]-
    // Tupel-Form mitgeben — landen im selben Store, gleiche Setter-Konvention.
    ...extraFields,
  };

  const useStore = create((set) => {
    const state = {};
    for (const [k, [lsKey, init]] of Object.entries(FIELDS)) {
      state[k] = init();
      const setterName = 'set' + k[0].toUpperCase() + k.slice(1);
      state[setterName] = (value) => {
        localStorage.setItem(lsKey, value);
        set({ [k]: value });
      };
    }
    return state;
  });

  // Setter-Aliase für Komponenten, die historische Namen erwarten
  // (SettingsContext hieß diese seit jeher setThemeState/setModeState).
  useStore.setState({
    setThemeState: useStore.getState().setTheme,
    setModeState:  useStore.getState().setThemeMode,
  });

  return useStore;
}

export const DAY_START = 8;
export const DAY_END = 20;
