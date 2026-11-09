#!/usr/bin/env python3
"""
anatomy-daemon — Der autonome Hintergrunddienst für anatomy-kb.

Aufgaben:
- Periodisches 'refine': Meistgenutzte unreviewed Übungen draften.
- Periodisches 'firestore sync': Wissen mit der PWA synchronisieren.
- Integritäts-Checks via 'audit'.
"""

import os
import time
import subprocess
import sys
from pathlib import Path
from loguru import logger

ROOT = Path(__file__).resolve().parent
AGENT = ROOT / "anatomy-agent"

# Konfiguration (könnte in .env ausgelagert werden)
REFINE_INTERVAL = 6 * 3600  # Alle 6 Stunden
SYNC_INTERVAL = 1 * 3600    # Jede Stunde

USER = os.environ.get("USER", "alpha")
LOG_FILE = f"/tmp/anatomy-daemon-{USER}.log"

logger.add(LOG_FILE, rotation="10 MB", level="INFO")

def run_cmd(args: list[str], label: str):
    logger.info(f"Starte {label}...")
    try:
        result = subprocess.run(
            [sys.executable, str(AGENT)] + args,
            capture_output=True,
            text=True,
            check=True
        )
        logger.info(f"{label} erfolgreich abgeschlossen.")
        # Logge nur bei wirklichen Änderungen oder Fehlern um das Log klein zu halten
        if "Draft gespeichert" in result.stdout or "Sync erfolgreich" in result.stdout:
            logger.info(result.stdout.strip())
    except subprocess.CalledProcessError as e:
        logger.error(f"{label} fehlgeschlagen (Exit {e.returncode}):")
        logger.error(e.stderr or e.stdout)
    except Exception as e:
        logger.error(f"Unerwarteter Fehler bei {label}: {e}")

def main():
    logger.info("Anatomy Expert Daemon gestartet.")
    
    last_refine = 0
    last_sync = 0
    
    try:
        while True:
            now = time.time()
            
            # 1. Refinement (Demand-Driven Analysis)
            if now - last_refine > REFINE_INTERVAL:
                run_cmd(["refine", "--limit", "3"], "Demand-Driven Refinement")
                last_refine = now
            
            # 2. Firestore Sync
            if now - last_sync > SYNC_INTERVAL:
                run_cmd(["firestore", "sync"], "Firestore Synchronization")
                last_sync = now
            
            # Kurze Pause um CPU zu schonen
            time.sleep(60)
            
    except KeyboardInterrupt:
        logger.info("Anatomy Expert Daemon wird beendet.")
    except Exception as e:
        logger.critical(f"Kritischer Fehler im Daemon-Loop: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
