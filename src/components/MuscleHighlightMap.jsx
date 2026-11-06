import { useEffect, useRef, useState } from 'react';
import { BodyChart } from 'body-muscles';
import { getMuscle } from '@db';

export default function MuscleHighlightMap({ muscleId, size = 160 }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const [entry, setEntry] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!muscleId) { setEntry(null); return; }
    getMuscle(muscleId).then((data) => {
      if (cancelled) return;
      const viz = data?.viz?.body_muscles;
      if (viz) {
        setEntry(viz);
      } else {
        setEntry(null);
      }
    });
    return () => { cancelled = true; };
  }, [muscleId]);

  useEffect(() => {
    if (!containerRef.current || !entry) return;

    const bodyState = {};
    const ids = Array.isArray(entry.ids) ? entry.ids : (entry.id ? [entry.id] : []);
    ids.forEach(id => {
      bodyState[id] = { intensity: 8, selected: false };
    });

    chartRef.current = new BodyChart(containerRef.current, {
      view: entry.view || 'FRONT',
      bodyState,
    });

    return () => { chartRef.current?.destroy(); chartRef.current = null; };
  }, [entry]);

  if (!entry) return null;

  return (
    <div
      ref={containerRef}
      style={{ width: size, height: size * 1.6, flexShrink: 0 }}
      className="opacity-90"
    />
  );
}
