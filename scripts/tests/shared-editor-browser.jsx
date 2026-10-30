import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ProgramEditor from '@plan/views/Plan/ProgramEditor.jsx';
import '../../src/styles.css';
function Fixture() {
  const [saved, setSaved] = useState(false);
  return saved ? <p role="status">Programm gespeichert</p> : <ProgramEditor
    coachUid="coach" program={{ id: 'fixture', name: 'Coach Programm', updatedAt: 'base', durationWeeks: 8, workouts: [] }} templates={[]}
    onClose={() => {}} onSave={async (value) => { window.savedProgram = value; return { ...value, updatedAt: 'saved' }; }} onSaved={() => setSaved(true)}
  />;
}
createRoot(document.getElementById('root')).render(<main className="mx-auto max-w-2xl p-4"><Fixture /></main>);
