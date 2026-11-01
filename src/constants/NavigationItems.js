import { BookOpen, Dumbbell, Brain, BarChart3, Settings2, CalendarDays, ClipboardList, History, LibraryBig, Microscope, HelpCircle, Layers, Zap, Crosshair, TimerReset, Sparkles, Bike, LayoutGrid, FileText } from "lucide-react";

const baseItems = [
  { id: 'session',  label: 'Training', Icon: Dumbbell,  sub: [
    { id: 'today',   label: 'Heute',    Icon: CalendarDays },
    { id: 'timer',   label: '6Pack-App', Icon: TimerReset },
    { id: 'skills',  label: 'Skills-App', Icon: Sparkles },
    { id: 'plan',    label: 'Plan',     Icon: ClipboardList },
    { id: 'history', label: 'History',  Icon: History },
    { id: 'logbuch', label: 'Logbuch',  Icon: BookOpen },
  ]},
  // 'Bericht' ist bewusst KEIN eigener Sub-Eintrag: das ist der Review-Tab
  // selbst (Default-Ansicht beim Klick auf "Review"), keine gleichrangige
  // Nebenansicht wie Muskeln/Readiness/Verlauf — die sind innerhalb von
  // WeeklyReview verschachtelt und werden hier als Sprungmarken angeboten.
  // noDefaultSub: fehlender subTab markiert keinen der sub-Einträge als aktiv
  // (anders als z.B. bei 'session', wo subTab=null == sub[0]/"Heute").
  { id: 'review',   label: 'Review',   Icon: BarChart3, noDefaultSub: true, sub: [
    { id: 'muscles',   label: 'Muskeln',      Icon: Layers },
    { id: 'readiness', label: 'Readiness',    Icon: Zap },
    { id: 'verlauf',   label: 'Verlauf',      Icon: History },
    { id: 'protokoll', label: 'Protokoll',    Icon: FileText },
  ]},
  { id: 'learn',    label: 'Lernen',   Icon: Brain,     sub: [
    { id: 'exercises', label: 'Übungen',  Icon: LibraryBig },
    { id: 'anatomy',   label: 'Anatomie', Icon: Microscope },
    { id: 'quiz',      label: 'Quiz',     Icon: HelpCircle },
    // Stärke-Matrix (1RM-Rechner) lebt seit 2026-10-15 im Learn-Tab (learn-dev: views/Learn/StrengthMatrix.jsx).
    { id: 'strength',  label: 'Stärke',   Icon: Dumbbell },
  ]},
  // Atlas: Übersicht über alle lokal gespiegelten Übungs-DBs (Mirror in
  // IndexedDB, siehe lib/exerciseDbs/) — bewusst unabhängig vom Learn-Tab.
  // Position 4 (nach session/review/learn): getNavItems() fügt den dynamischen
  // Fokus/Anamnese-Eintrag per slice(0,3) davor ein.
  { id: 'atlas',    label: 'Atlas',    Icon: LayoutGrid },
  // Eigener Haupt-Tab, kein Subtab von WeeklyReview/Muscles — Radtouren waren
  // bisher nur ein kleines Cardio-Addon im Session-Modal, sollen aber als
  // vollwertiger, gleichrangiger Bereich neben dem Krafttraining stehen
  // (User-Klarstellung 2026-09-23, siehe views/Touren/index.jsx). Bewusst
  // NACH den ersten 3 baseItems eingefügt (session/review/learn) — die
  // getNavItems()-Slices unten (slice(0,3)/slice(3)) setzen genau diese
  // Kopf-Reihenfolge voraus, um den dynamischen Fokus/Anamnese-Eintrag
  // an der richtigen Stelle einzuschieben.
  { id: 'touren',   label: 'Radtouren', Icon: Bike },
  { id: 'settings', label: 'Setup',    Icon: Settings2 },
];

// Solo-Build (vite --mode training → .env.training, vos-training.web.app): nur dieser
// eine Haupt-Tab. Alles andere fällt über VALID_TABS/parseHashRoute auf ihn zurück.
export const SOLO_TAB = import.meta.env.VITE_SOLO_TAB || '';
export const IS_SOLO = Boolean(SOLO_TAB);

export function getNavItems({ focusReady = false, devBypass = false } = {}) {
  if (SOLO_TAB) return baseItems.filter((item) => item.id === SOLO_TAB);
  if (devBypass) {
    return [
      ...baseItems.slice(0, 3),
      { id: 'anamnese', label: 'Anamnese', Icon: ClipboardList },
      { id: 'focus', label: 'Fokus', Icon: Crosshair },
      ...baseItems.slice(3),
    ];
  }
  return [
    ...baseItems.slice(0, 3),
    focusReady
      ? { id: 'focus', label: 'Fokus', Icon: Crosshair }
      : { id: 'anamnese', label: 'Anamnese', Icon: ClipboardList },
    ...baseItems.slice(3),
  ];
}

export const NAV_ITEMS = getNavItems();

export const VALID_TABS = new Set(SOLO_TAB ? [SOLO_TAB] : [
  ...baseItems.map(item => item.id),
  'anamnese',
  'focus',
  'inbox',
]);
