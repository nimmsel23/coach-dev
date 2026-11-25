import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ExerciseInsightModal from '../../components/ExerciseInsightModal.jsx';
import '../../styles.css';
import InboxCard from '../Inbox/InboxCard.jsx';
import { fixtureState } from './insights.browser-db.js';
window.insightsFixture = fixtureState;
function Fixture() {
  const [exercise, setExercise] = useState(null);
  window.selectInspectorExercise = setExercise;
  if (new URLSearchParams(location.search).has('request')) return exercise && <main className="p-6 max-w-xl mx-auto"><InboxCard ex={exercise} showUserId onInspect={setExercise} /></main>;
  return <ExerciseInsightModal exercise={exercise} onExerciseChange={setExercise} onClose={() => setExercise(null)} />;
}
createRoot(document.getElementById('root')).render(<Fixture />);
