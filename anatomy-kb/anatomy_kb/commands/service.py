"""service command — manages background server and daemon lifecycle."""
import os
import sys
import time
import signal
import socket
import subprocess
from pathlib import Path
import typer
from rich.table import Table
from rich import box
from rich.text import Text

from anatomy_kb.commands._helpers import console, _gum_log, SERVER_PORT, ANATOMY_KB_ROOT

server_app = typer.Typer(help="Anatomy-KB Server control")
daemon_app = typer.Typer(help="Anatomy-KB Daemon control")

USER = os.environ.get("USER", "alpha")
PIDFILE = Path(f"/tmp/anatomy-kb-{USER}.pid")
LOGFILE = Path(f"/tmp/anatomy-kb-{USER}.log")
DAEMON_PIDFILE = Path(f"/tmp/anatomy-daemon-{USER}.pid")
DAEMON_LOGFILE = Path(f"/tmp/anatomy-daemon-{USER}.log")

def is_port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) == 0

def is_process_running(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False

def tail_file(path: Path):
    if not path.exists():
        console.print(f"[red]Log file does not exist: {path}[/red]")
        return
    try:
        # Using tail command via subprocess for platform tailing
        subprocess.run(["tail", "-f", str(path)])
    except KeyboardInterrupt:
        pass

# --- Server Commands ---

@server_app.command("start")
def server_start(port: int = typer.Option(SERVER_PORT, "--port", "-p")):
    """Start the API server in the background."""
    if is_port_in_use(port):
        _gum_log("warn", f"Port :{port} is already in use — server might be running.")
        server_status()
        return

    # Start server.py in background
    cmd = [sys.executable, "-u", str(ANATOMY_KB_ROOT / "server.py"), "--port", str(port)]
    log_handle = LOGFILE.open("w", encoding="utf-8")
    
    # Run in background
    proc = subprocess.Popen(cmd, stdout=log_handle, stderr=log_handle, close_fds=True, start_new_session=True)
    PIDFILE.write_text(str(proc.pid), encoding="utf-8")
    
    time.sleep(1.5)
    if is_process_running(proc.pid):
        _gum_log("info", f"Server started successfully (PID {proc.pid}, port :{port})")
    else:
        _gum_log("error", f"Failed to start server. Check log at {LOGFILE}")

@server_app.command("stop")
def server_stop():
    """Stop the running API server."""
    pid = None
    if PIDFILE.exists():
        try:
            pid = int(PIDFILE.read_text(encoding="utf-8").strip())
        except ValueError:
            pass
            
    if pid and is_process_running(pid):
        try:
            os.kill(pid, signal.SIGTERM)
            _gum_log("info", f"Stopped server (PID {pid})")
        except OSError as e:
            _gum_log("error", f"Failed to kill process {pid}: {e}")
        if PIDFILE.exists():
            PIDFILE.unlink(missing_ok=True)
    else:
        _gum_log("warn", "No running server process found via PID file.")

@server_app.command("status")
def server_status():
    """Show the status of the server."""
    pid = "—"
    status = "down"
    if PIDFILE.exists():
        try:
            p_val = int(PIDFILE.read_text(encoding="utf-8").strip())
            if is_process_running(p_val):
                pid = str(p_val)
                status = "up"
        except ValueError:
            pass
            
    table = Table(box=box.ROUNDED, show_header=True, header_style="bold cyan")
    table.add_column("Service")
    table.add_column("PID")
    table.add_column("Port")
    table.add_column("Status")
    
    status_text = Text("up", style="bold green") if status == "up" else Text("down", style="bold red")
    table.add_row("anatomy-kb", pid, f":{SERVER_PORT}", status_text)
    console.print(table)

@server_app.command("restart")
def server_restart(port: int = typer.Option(SERVER_PORT, "--port", "-p")):
    """Restart the API server."""
    server_stop()
    time.sleep(0.5)
    server_start(port=port)

@server_app.command("logs")
def server_logs():
    """View server log file output in real-time."""
    tail_file(LOGFILE)

@server_app.command("health")
def server_health():
    """Check /health server endpoint."""
    import urllib.request
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{SERVER_PORT}/health", timeout=3) as resp:
            if resp.status == 200:
                _gum_log("info", "Health Check: OK")
            else:
                _gum_log("error", f"Health Check failed with status {resp.status}")
    except Exception as e:
        _gum_log("error", f"Health Check failed: {e}")
        raise typer.Exit(1)

# --- Daemon Commands ---

@daemon_app.command("start")
def daemon_start():
    """Start the autonomous refinement daemon in the background."""
    # Check if daemon already running
    pid = None
    if DAEMON_PIDFILE.exists():
        try:
            pid = int(DAEMON_PIDFILE.read_text(encoding="utf-8").strip())
        except ValueError:
            pass
            
    if pid and is_process_running(pid):
        _gum_log("warn", f"Daemon is already running (PID {pid}).")
        daemon_status()
        return

    cmd = [sys.executable, "-u", str(ANATOMY_KB_ROOT / "daemon.py")]
    log_handle = DAEMON_LOGFILE.open("w", encoding="utf-8")
    
    proc = subprocess.Popen(cmd, stdout=log_handle, stderr=log_handle, close_fds=True, start_new_session=True)
    DAEMON_PIDFILE.write_text(str(proc.pid), encoding="utf-8")
    
    time.sleep(1.5)
    if is_process_running(proc.pid):
        _gum_log("info", f"Daemon started successfully (PID {proc.pid})")
    else:
        _gum_log("error", f"Failed to start daemon. Check log at {DAEMON_LOGFILE}")

@daemon_app.command("stop")
def daemon_stop():
    """Stop the refinement daemon."""
    pid = None
    if DAEMON_PIDFILE.exists():
        try:
            pid = int(DAEMON_PIDFILE.read_text(encoding="utf-8").strip())
        except ValueError:
            pass
            
    if pid and is_process_running(pid):
        try:
            os.kill(pid, signal.SIGTERM)
            _gum_log("info", f"Stopped daemon (PID {pid})")
        except OSError as e:
            _gum_log("error", f"Failed to kill process {pid}: {e}")
        if DAEMON_PIDFILE.exists():
            DAEMON_PIDFILE.unlink(missing_ok=True)
    else:
        _gum_log("warn", "No running daemon process found.")

@daemon_app.command("status")
def daemon_status():
    """Show daemon status."""
    pid = "—"
    status = "down"
    if DAEMON_PIDFILE.exists():
        try:
            p_val = int(DAEMON_PIDFILE.read_text(encoding="utf-8").strip())
            if is_process_running(p_val):
                pid = str(p_val)
                status = "active"
        except ValueError:
            pass
            
    table = Table(box=box.ROUNDED, show_header=True, header_style="bold cyan")
    table.add_column("Service")
    table.add_column("PID")
    table.add_column("Status")
    
    status_text = Text("active", style="bold green") if status == "active" else Text("down", style="bold red")
    table.add_row("expert-daemon", pid, status_text)
    console.print(table)

@daemon_app.command("logs")
def daemon_logs():
    """View daemon logs."""
    tail_file(DAEMON_LOGFILE)
