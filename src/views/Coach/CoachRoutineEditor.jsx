import { useMemo } from 'react';
import RoutineBuilder from '@plan/views/Plan/RoutineBuilder.jsx';
import { createPlanApi } from '@plan/views/Plan/api.js';
export default function CoachRoutineEditor({ coachUid, routineId, onBack }) {
  const api = useMemo(() => createPlanApi(coachUid), [coachUid]);
  return <RoutineBuilder routineId={routineId} apiClient={api} onBack={onBack} />;
}
