import time
import os
import subprocess
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

# --- Configuration ---
WATCH_PATHS = [
    "/home/alpha/anatomy-kb/muscles",
    "/home/alpha/anatomy-kb/exercises",
    "/home/alpha/dev/fitness-dev/catalog",
    "/home/alpha/dev/physio-dev/catalog",
    "/home/alpha/dev/relax-dev/knowledge"
]

class AnatomyWatchHandler(FileSystemEventHandler):
    def on_modified(self, event):
        if event.is_directory:
            return
        if event.src_path.endswith((".yml", ".yaml")):
            print(f"📝 Change in {os.path.basename(event.src_path)}")
            self.trigger_sync(event.src_path)

    def trigger_sync(self, file_path):
        print(f"🚀 Triggering Sync for {os.path.basename(file_path)}...")
        
        if "physio-dev" in file_path:
            cmd = ["/usr/bin/python", "/home/alpha/dev/physio-dev/scripts/sync.py"]
        elif "relax-dev" in file_path:
            cmd = ["/usr/bin/python", "/home/alpha/dev/relax-dev/scripts/sync_kb.py"]
        else:
            # Default to anatomy-agent
            cmd = ["/home/alpha/anatomy-kb/anatomy", "firestore", "sync"]

        try:
            subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            print(f"✅ Sync command dispatched: {' '.join(cmd)}")
        except Exception as e:
            print(f"❌ Error dispatching sync: {e}")

if __name__ == "__main__":
    print("🔍 Knowledge Base Watcher starting...")
    event_handler = AnatomyWatchHandler()
    observer = Observer()
    
    for path in WATCH_PATHS:
        if os.path.exists(path):
            print(f"  - Monitoring: {path}")
            observer.schedule(event_handler, path, recursive=True)
        else:
            print(f"  - Warning: Path not found: {path}")
            
    observer.start()
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()
