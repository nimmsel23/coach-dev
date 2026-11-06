"""Compatibility shim for older imports.

The canonical read/write muscle-KB service lives in `fitness.catalog.muscles_store`.
Keep this module only as a thin re-export while callers are being migrated.
"""

from fitness.catalog.muscles_store import *  # noqa: F401,F403
