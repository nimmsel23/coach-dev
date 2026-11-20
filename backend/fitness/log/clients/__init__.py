"""
fitness.log.clients — Klienten-Logging, Timeline und Coaching-Auswertungen.
"""
from .cli import (
    cmd_clients,
    cmd_clients_journal,
    cmd_clients_list,
    cmd_clients_stats,
)
from .models import (
    ClientFilter,
    ClientMeta,
    ClientSessionItem,
    ClientStats,
    TimelineEntry,
)
from .service import (
    build_client_timeline,
    compute_client_stats,
    get_clients_registry,
    load_client_journal,
    load_client_sessions,
)

__all__ = [
    "cmd_clients",
    "cmd_clients_list",
    "cmd_clients_stats",
    "cmd_clients_journal",
    "ClientMeta",
    "ClientSessionItem",
    "TimelineEntry",
    "ClientFilter",
    "ClientStats",
    "get_clients_registry",
    "load_client_sessions",
    "load_client_journal",
    "build_client_timeline",
    "compute_client_stats",
]
