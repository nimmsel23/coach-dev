import { useState, useEffect, useCallback } from 'react';
import { getInbox, getGlobalInbox, approveInbox, deleteInbox, reenrichInbox, getInboxMergeCandidates, linkInboxSource, describeCoachError } from '@db';

export function useInbox({ global = false } = {}) {
  const [exercises, setExercises] = useState([]);
  const [mergeCandidates, setMergeCandidates] = useState({});
  const [loading, setLoading]     = useState(true);
  const [actioning, setActioning] = useState(null);
  const [toast, setToast]         = useState('');

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2200); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await (global ? getGlobalInbox() : getInbox());
      setExercises(Array.isArray(data) ? data : []);
    } catch {
      showToast('Inbox konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
    // Eigener, unabhaengiger Ladepfad — reiner Zusatz-Hinweis, darf die
    // Haupt-Inbox-Liste nicht blockieren/verzoegern, wenn er langsam ist
    // oder fehlschlaegt (siehe getInboxMergeCandidates()-Fallbacks).
    getInboxMergeCandidates().then(setMergeCandidates).catch(() => setMergeCandidates({}));
  }, [global]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const handleInboxUpdate = () => {
      load();
    };
    window.addEventListener('fitness-inbox-updated', handleInboxUpdate);
    return () => {
      window.removeEventListener('fitness-inbox-updated', handleInboxUpdate);
    };
  }, [load]);

  async function approve(fileId) {
    setActioning(fileId);
    try {
      const ex = exercises.find(e => e.file_id === fileId);
      const userId = ex?.userId || null;
      const result = await approveInbox(fileId, userId, ex);
      if (result?.ok) {
        setExercises(prev => prev.filter(ex => ex.file_id !== fileId));
        showToast('Freigegeben ✓');
      } else {
        showToast('Freigabe fehlgeschlagen');
      }
    } catch (err) {
      showToast(describeCoachError(err, 'Fehler beim Freigeben'));
    } finally {
      setActioning(null);
    }
  }

  async function reenrich(fileId) {
    setActioning(fileId);
    try {
      const ex = exercises.find(e => e.file_id === fileId);
      const userId = ex?.userId || null;
      const result = await reenrichInbox(fileId, userId, ex);
      if (result?.ok) {
        showToast('Neu angereichert ✓');
        await load();
      } else {
        showToast('Anreicherung fehlgeschlagen');
      }
    } catch (err) {
      showToast(describeCoachError(err, 'Anreicherung fehlgeschlagen'));
    } finally {
      setActioning(null);
    }
  }

  async function linkSource(fileId, source, sourceId) {
    setActioning(`${fileId}:${source}`);
    try {
      const ex = exercises.find(e => e.file_id === fileId);
      const userId = ex?.userId || null;
      const currentData = ex?.exercises?.[0] || ex?.enriched || ex || {};
      const result = await linkInboxSource(fileId, source, sourceId, userId, currentData);
      if (result?.ok) {
        showToast(`${source} verlinkt ✓`);
        await load();
      } else {
        showToast('Quelle konnte nicht verlinkt werden');
      }
    } catch (err) {
      showToast(describeCoachError(err, 'Quelle konnte nicht verlinkt werden'));
    } finally {
      setActioning(null);
    }
  }

  async function remove(fileId) {
    setActioning(fileId);
    try {
      const ex = exercises.find(e => e.file_id === fileId);
      const userId = ex?.userId || null;
      await deleteInbox(fileId, userId);
      setExercises(prev => prev.filter(ex => ex.file_id !== fileId));
      showToast('Gelöscht');
    } catch (err) {
      showToast(describeCoachError(err, 'Fehler beim Löschen'));
    } finally {
      setActioning(null);
    }
  }

  return { exercises, mergeCandidates, loading, actioning, toast, approve, remove, reenrich, linkSource, reload: load };
}
