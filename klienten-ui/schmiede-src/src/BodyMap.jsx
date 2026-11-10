import Model from "react-body-highlighter";
import { exercisesToModelData } from "./muscleMap.js";

const COLORS = ["#1e3a5f", "#1d6fa5", "#1a9fd4", "#22c55e"];

export function BodyMap({ exercises, type = "anterior", style }) {
  const data = exercisesToModelData(exercises);
  return (
    <Model
      type={type}
      data={data}
      highlightedColors={COLORS}
      bodyColor="var(--clientforge-line)"
      style={{ maxWidth: "160px", width: "100%", ...style }}
    />
  );
}

export function BodyMapPair({ exercises }) {
  const hasData = exercisesToModelData(exercises).length > 0;
  return (
    <div className="heute-bodymap">
      <div className="heute-section-label">Muskel-Belastung</div>
      <div className="heute-bodymap-pair">
        <div className="heute-bodymap-view">
          <BodyMap exercises={exercises} type="anterior" />
          <span>Vorne</span>
        </div>
        <div className="heute-bodymap-view">
          <BodyMap exercises={exercises} type="posterior" />
          <span>Hinten</span>
        </div>
      </div>
      {!hasData && (
        <p className="heute-bodymap-hint">Noch keine Muskeldaten für die Auswahl — Übungen ohne Katalog-Treffer bleiben grau.</p>
      )}
    </div>
  );
}
