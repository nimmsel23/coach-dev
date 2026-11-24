import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase.js';

// Subscribe only for the selected client; cache data never confirms a live cloud state.
export function useWorkspaceCloudPlans(uid) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ uid: '', status: 'loading', plans: [] });
  useEffect(() => {
    if (!uid) return undefined;
    setState({ uid, status: 'loading', plans: [] });
    return onSnapshot(collection(db, 'fitness', uid, 'macrocycles'), { includeMetadataChanges: true }, (snapshot) => {
      setState({ uid, status: snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites ? 'cached' : 'ready',
        plans: snapshot.docs.map((doc) => {
          const value = doc.data();
          return { id: doc.id, name: value.name || 'Trainingsplan', status: value.status,
            version: value.headVersion, source: value.source, sourceLocalVersion: value.sourceLocalVersion };
        }) });
    }, () => setState({ uid, status: 'error', plans: [] }));
  }, [uid, revision]);
  return { ...(state.uid === uid ? state : { status: 'loading', plans: [] }), retry: () => setRevision((value) => value + 1) };
}
