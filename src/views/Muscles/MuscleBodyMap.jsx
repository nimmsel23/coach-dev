import BodyMap from "../../components/BodyMap.jsx";

export default function MuscleBodyMap({ scores, onGroupClick }) {
  const hitColors = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444'];

  return (
    <>
      <div className="text-center relative z-10">
        <div className="text-[10px] font-black uppercase tracking-[0.3em] opacity-20 mb-8 font-mono">Anterior</div>
        <BodyMap
          groupScores={scores}
          highlightedColors={hitColors}
          style={{ maxWidth: 300 }}
          onGroupClick={onGroupClick}
        />
      </div>
      <div className="text-center relative z-10">
        <div className="text-[10px] font-black uppercase tracking-[0.3em] opacity-20 mb-8 font-mono">Posterior</div>
        <BodyMap
          groupScores={scores}
          type="posterior"
          highlightedColors={hitColors}
          style={{ maxWidth: 300 }}
          onGroupClick={onGroupClick}
        />
      </div>
    </>
  );
}
