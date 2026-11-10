import pytest

from fitness.core.store import SessionStore

UID = "uid-test-123"


@pytest.fixture
def store(tmp_path):
    return SessionStore(tmp_path)


@pytest.fixture
def uid():
    return UID
