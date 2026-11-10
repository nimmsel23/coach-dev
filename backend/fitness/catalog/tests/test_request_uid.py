import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from fitness.api import config


class RequestUidTest(unittest.TestCase):
    def _request(self, query_uid=None, header_uid=None):
        query = {}
        headers = {}
        if query_uid is not None:
            query["uid"] = query_uid
        if header_uid is not None:
            headers["X-User-UID"] = header_uid
        return SimpleNamespace(query_params=query, headers=headers)

    def test_explicit_query_uid_wins(self):
        request = self._request(query_uid="client-123", header_uid="header-uid")
        self.assertEqual(config._uid_from_request(request), "client-123")

    def test_active_uid_file_used_when_request_has_no_uid(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            uid_file = home / ".aos" / "users" / ".active-uid"
            uid_file.parent.mkdir(parents=True, exist_ok=True)
            uid_file.write_text("active-456")
            request = self._request()
            with mock.patch.object(config.Path, "home", return_value=home):
                with mock.patch.dict(os.environ, {}, clear=False):
                    self.assertEqual(config._uid_from_request(request), "active-456")

    def test_default_only_when_no_request_uid_and_no_active_uid(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            request = self._request()
            with mock.patch.object(config.Path, "home", return_value=home):
                with mock.patch.dict(os.environ, {}, clear=False):
                    self.assertEqual(config._uid_from_request(request), "default")


if __name__ == "__main__":
    unittest.main()
