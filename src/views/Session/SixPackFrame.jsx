import { useLayoutEffect, useRef, useState } from 'react';

// Gibt der 6Pack-Karte eine feste Höhe bis zum unteren Rand (abzüglich Mobile-Nav),
// damit die Screens den Bildschirm füllen und nur intern scrollen, nicht die ganze Seite.
export default function SixPackFrame({ children }) {
  const ref = useRef(null);
  const [top, setTop] = useState(0);

  useLayoutEffect(() => {
    const measure = () => {
      if (ref.current) setTop(Math.max(0, Math.round(ref.current.getBoundingClientRect().top + window.scrollY)));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  return (
    <div ref={ref} style={{ height: `calc(100dvh - ${top}px - var(--mobile-nav-height, 0px) - 1rem)`, minHeight: 360 }}>
      {children}
    </div>
  );
}
