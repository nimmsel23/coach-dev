# Obsolete Coach upstream units (archived 2026-11-09)

fitness-preview.service started uvicorn on :8100 as a fake Fitness upstream for Coach :9150.
Coach-API now mounts fitness.api in-process; unit was never linked under ~/.config/systemd/user.

