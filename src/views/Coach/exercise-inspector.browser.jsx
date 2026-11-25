import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ExerciseInsightModal from '../../components/ExerciseInsightModal.jsx';
import '../../styles.css';
import { fixtureState } from './insights.browser-db.js';
window.insightsFixture = fixtureState;
function Fixture() {
  const [exercise, setExercise] = useState(null);
  window.selectInspectorExercise = setExercise;
  return <ExerciseInsightModal exercise={exercise} onExerciseChange={setExercise} onClose={() => setExercise(null)} />;
}
createRoot(document.getElementById('root')).render(<Fixture />);
