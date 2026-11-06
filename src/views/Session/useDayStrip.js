/**
 * Shared day-strip logic for all three header concepts — extracted from the
 * original DateStrip.jsx so Calm/Dense/Timeline don't each reimplement
 * offset/jump/date-label handling.
 *
 * Umbau 2026-09-06 (User-Feedback: "date picker slidebar/side-scrollbar
 * wird"): vorher ein festes 7-Tage-Fenster (`rollingDays.slice(offset,
 * offset+7)`), nur per Chevron-Klick um je 3 Tage verschiebbar, kein
 * Touch-Swipe/Scroll. Jetzt: alle `rollingDays` (bis zu 365, siehe
 * `getRollingDays()` in useSession.js) werden gerendert, der Container in
 * SessionHeader.jsx ist `overflow-x-auto` — echtes Scrollen/Wischen statt
 * Sprung-Navigation. `goBack`/`goFwd` bleiben als Komfort-Buttons, scrollen
 * jetzt aber den Container statt einen Fenster-Offset zu verschieben.
 */

import { useEffect, useRef } from 'react';
import { localToday } from '@utils';
import { parseLocalDate } from './utils';

const MON = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

export function useDayStrip({ date, setDate, rollingDays }) {
  const today = localToday();
  const dateInputRef = useRef(null);
  const stripRef = useRef(null);

  // Ausgewähltes Datum immer sichtbar halten — beim ersten Mount (Sprung ans
  // Ende, "heute") genauso wie bei jedem externen Datumswechsel (Kalender-
  // Icon, History-"Edit öffnen", Datumswechsel-Buttons anderswo). Kein
  // "smooth" hier, damit der erste Mount nicht sichtbar durch 365 Tage
  // scrollt — nur die Chevron-Buttons unten scrollen animiert.
  useEffect(() => {
    const el = stripRef.current?.querySelector(`[data-date="${date}"]`);
    el?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [date]);

  function jumpToDate(d) {
    if (!d) return;
    setDate(d);
  }

  function scrollByDays(days) {
    const el = stripRef.current;
    if (!el) return;
    const itemWidth = el.firstElementChild?.offsetWidth || 32;
    const gap = 4;
    el.scrollBy({ left: days * (itemWidth + gap), behavior: 'smooth' });
  }

  const selectedObj = parseLocalDate(date);
  const dateLabel = `${selectedObj.getDate()}. ${MON[selectedObj.getMonth()]} ${selectedObj.getFullYear()}`;

  return {
    today, allDays: rollingDays, stripRef, dateInputRef, dateLabel,
    goBack: () => scrollByDays(-3),
    goFwd: () => scrollByDays(3),
    jumpToDate,
  };
}
