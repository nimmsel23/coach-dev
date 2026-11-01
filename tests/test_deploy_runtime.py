"""Check deployment boundaries using real rsync filters and a fake product tree."""
from pathlib import Path
import re
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]

class RuntimePayloadTest(unittest.TestCase):
    def test_runtime_only_and_persistent_data(self):
        array = re.search(r"RSYNC_RUNTIME=\(.*?\n\)", (ROOT / "deploy.sh").read_text(), re.S)[0]
        with tempfile.TemporaryDirectory() as tmp:
            source, dest = Path(tmp) / "source", Path(tmp) / "product"
            source.mkdir(); dest.mkdir()
            def write(base, name, text="keep"):
                file = base / name
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_text(text)
            for name in ("dist/index.html", "fitness/api/main.py", "fitness/catalog/config.yml", "frontend/node_modules/junk", ".env", "dist/old.js.bak", "docs/notes.md"):
                write(source, name)
            for name in ("frontend/node_modules/old", "node_modules/.keep", ".venv/.keep", "data/.keep", ".env", "fitness/catalog/kb/.keep"):
                write(dest, name)
            # A build-output link must become a real installed file.
            (source / "dist/linked.txt").symlink_to(source / "dist/index.html")
            subprocess.run(["bash", "-c", array + '\nrsync -aL --delete --delete-excluded "${RSYNC_RUNTIME[@]}" "$1/" "$2/"', "sync", str(source), str(dest)], check=True)
            for name in ("dist/index.html", "fitness/api/main.py", ".venv/.keep", "data/.keep", ".env", "fitness/catalog/kb/.keep"):
                self.assertTrue((dest / name).is_file(), name)
            for name in ("frontend", "node_modules", "docs", "dist/old.js.bak"):
                self.assertFalse((dest / name).exists(), name)
            self.assertFalse((dest / "dist/linked.txt").is_symlink())

if __name__ == "__main__":
    unittest.main()
