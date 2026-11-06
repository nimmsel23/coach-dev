"""Wer startet welche Firestore-Watcher? Nutzerdaten-Sync (Sessions/Journal/Habits) gehört
ausschließlich dem Staging-Prozess (FITNESS_SYNC_OWNER=1); Dev und Prod synchronisieren nie.
Core4 loggt Fitness aus den lokal gespiegelten Session-Dateien — fehlt der Sync, fehlen die Workouts."""
import os
import unittest
from unittest import mock

CALLS: list[str] = []


def _fake(name):
    def _start(*_a, **_k):
        CALLS.append(name)

        class Handle:
            def stop(self): pass
            def join(self, *a, **k): pass
            def unsubscribe(self): pass

        return [Handle()] if name in ("catalog", "userdata") else Handle()
    return _start


class SyncOwnerTests(unittest.IsolatedAsyncioTestCase):
    async def _started(self, env, coach_sync_active):
        from fitness.api import main
        CALLS.clear()
        base = {"FITNESS_SKIP_WATCHERS": "", "FITNESS_SYNC_OWNER": ""}
        with mock.patch.dict(os.environ, {**base, **env}), \
             mock.patch("fitness.coach.sync.external_worker_active", return_value=coach_sync_active), \
             mock.patch("fitness.firestore.mirror.start_catalog_watchers", _fake("catalog")), \
             mock.patch("fitness.firestore.mirror.start_userdata_watchers", _fake("userdata")), \
             mock.patch("fitness.firestore.local_watch.start_session_file_watcher", _fake("sessionfile")), \
             mock.patch("fitness.firestore.coach_bridge.start_coach_bridge", lambda: (None, None)), \
             mock.patch("fitness.catalog.api.watcher.start_enrichment_watcher", lambda: (None, None, None)), \
             mock.patch("fitness.catalog.api.muscle_watcher.start_muscle_kb_watcher", _fake("muscle")), \
             mock.patch.object(main, "close_httpx_client", mock.AsyncMock()):
            async with main.lifespan(main.app):
                pass
        return sorted(set(CALLS))

    async def test_staging_ist_einziger_nutzerdaten_sync(self):
        got = await self._started({"FITNESS_SKIP_WATCHERS": "1", "FITNESS_SYNC_OWNER": "1"}, True)
        self.assertEqual(got, ["sessionfile", "userdata"])  # kein Katalog/Enrichment: das macht coach-sync

    async def test_prod_synchronisiert_nicht(self):
        self.assertEqual(await self._started({"FITNESS_SKIP_WATCHERS": "1"}, False), [])

    async def test_dev_ohne_coach_sync_nur_katalog_nie_nutzerdaten(self):
        got = await self._started({}, False)
        self.assertEqual(got, ["catalog", "muscle"])
        self.assertNotIn("userdata", got)
        self.assertNotIn("sessionfile", got)

    async def test_dev_mit_coach_sync_startet_nichts(self):
        self.assertEqual(await self._started({}, True), [])


if __name__ == "__main__":
    unittest.main()
