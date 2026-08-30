#!/usr/bin/env python3
"""Gate A2/A3 MCP Server — STDIO-based MCP Server interface.

Exposes Gate A2/A3 loop operations (run task, resume task, read escalation details,
read ROADMAP.md, read STAND.md) as standard Model Context Protocol (MCP) tools.

Subprocess encapsulation ensures cli.py's stdout prints do not corrupt the
MCP JSON-RPC protocol stream on sys.stdout. All server logging goes to sys.stderr.

Protocol: MCP Spec 2024-11-05 (JSON-RPC 2.0 over STDIO)
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


REPO_ROOT = Path(__file__).resolve().parent.parent.parent
CLI_PATH = Path(__file__).resolve().parent / "cli.py"
DEFAULT_REVIEWER_CMD = str(REPO_ROOT / "scripts" / "gate-a2" / "reviewer-a2.sh")
DEFAULT_WORKER_CMD = str(REPO_ROOT / "scripts" / "gate-a2" / "run_agy_worker_a2.sh")
DEFAULT_RUN_LOG_PATH = Path(__file__).resolve().parent / "logs" / "run-log.jsonl"
DEFAULT_PATCHES_DIR = Path(__file__).resolve().parent / "logs" / "patches"

# mcp_server.py's STDIO loop (main(), below) processes one JSON-RPC request at
# a time — a cli.py subprocess that hangs would silently block every
# subsequent gate_run_task/gate_resume_task call forever, with no feedback to
# the caller (observed 2026-08-19: a second Test-#12 call appeared to vanish
# entirely). Longest real run observed so far: ~780s (3 escalated rounds).
# 1800s gives generous headroom while still turning "hangs forever" into a
# clear, bounded error instead of an indefinite silent wait.
SUBPROCESS_TIMEOUT_SECONDS = 1800

_BRANCH_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]*$")


def _log(msg: str) -> None:
    """Log server messages to sys.stderr (never sys.stdout!)."""
    print(f"[gate-a2-mcp] {msg}", file=sys.stderr, flush=True)


def _default_resume_state_path(escalation_out: str) -> Path:
    p = Path(escalation_out)
    return p.with_name(p.stem + "-state.json")


_REVIEWER_BASE_URL_PLACEHOLDER = "your_reviewer_base_url_here"


def _reviewer_env_configured(env_path: Optional[Path] = None) -> Optional[str]:
    """Return an error message if REVIEWER_BASE_URL isn't configured in .env, else None.

    Mirrors the check in reviewer-a2.sh so misconfiguration is caught before
    the worker runs, instead of only after a full round has already executed.
    """
    path = env_path or (REPO_ROOT / ".env")
    if not path.exists():
        return f".env nicht gefunden unter {path}."
    try:
        content = path.read_text(encoding="utf-8")
    except OSError as exc:
        return f".env konnte nicht gelesen werden: {exc}"
    value = ""
    for line in content.splitlines():
        stripped = line.strip()
        if stripped.startswith("REVIEWER_BASE_URL="):
            value = stripped.split("=", 1)[1].strip().strip("'\"")
            break
    if not value or value == _REVIEWER_BASE_URL_PLACEHOLDER:
        return "REVIEWER_BASE_URL ist in .env nicht konfiguriert (Platzhalter oder leer)."
    return None


def _config_error_result(config_error: str) -> Dict[str, Any]:
    return {
        "status": "ERROR",
        "exit_code": 1,
        "stdout": "",
        "stderr": (
            f"[Konfigurationsfehler] {config_error} Bitte REVIEWER_BASE_URL, "
            "REVIEWER_API_KEY und REVIEWER_MODEL in .env setzen, bevor ein "
            "echter Lauf gestartet wird."
        ),
    }


# Absolute Pfade im Task-Text erkennen (mind. 3 Segmente, um generische kurze
# Pfade wie "/tmp/x" nicht fälschlich zu treffen). Rein heuristisch — deckt
# gezielt den einen real beobachteten Fehlerfall ab (Task-Text nennt einen
# Projektpfad in Prosa, project_dir wird als Werkzeug-Argument vergessen),
# keine allgemeine Plausibilitätsprüfung.
_PATH_IN_TASK_RE = re.compile(r"`?(/(?:[\w.\-]+/){2,}[\w.\-]+)/?`?")


def _mentioned_project_paths(task: str) -> List[str]:
    return [os.path.normpath(m) for m in _PATH_IN_TASK_RE.findall(task or "")]


def _project_dir_mismatch_error(task: str, effective_project_dir: Optional[str]) -> Optional[str]:
    """Fail fast, before any worker/reviewer round runs, if the task text
    names a project path but the resolved project_dir (explicit argument or
    DEFAULT_PROJECT_DIR fallback) is missing or points somewhere else.
    Reproduced 2026-08-19 (Test #11): the caller kept forgetting to pass
    project_dir as a real argument, burning ~13 minutes over 4 escalating
    rounds before anyone noticed why the diff was always empty.
    """
    mentioned = _mentioned_project_paths(task)
    if not mentioned:
        return None
    if effective_project_dir:
        normalized = os.path.normpath(os.path.expanduser(effective_project_dir))
        if normalized in mentioned:
            return None
    paths_list = ", ".join(mentioned)
    where = (
        "project_dir ist nicht gesetzt"
        if not effective_project_dir
        else f"project_dir zeigt auf einen anderen Pfad ({effective_project_dir})"
    )
    return (
        f"Der Task-Text nennt einen Projektpfad ({paths_list}), aber {where}. "
        "Bitte project_dir explizit als eigenes Werkzeug-Argument übergeben, nicht nur "
        "im Task-Text erwähnen — sonst arbeitet der Worker an einem leeren/falschen Workspace."
    )


def _project_dir_error_result(message: str) -> Dict[str, Any]:
    return {
        "status": "ERROR",
        "exit_code": 1,
        "stdout": "",
        "stderr": f"[project_dir-Warnung] {message}",
    }


def execute_gate_run_task(
    task: str,
    reviewer_cmd: Optional[str] = None,
    worker_backend: str = "shell",
    worker_cmd: Optional[str] = None,
    test_cmd: Optional[str] = None,
    project_dir: Optional[str] = None,
    in_container_test: bool = False,
    inner_max: int = 3,
    max_rounds: int = 3,
    escalation_out: str = "a2-eskalation.md",
    cwd: Optional[str] = None,
) -> Dict[str, Any]:
    """Invoke cli.py via subprocess to execute an orchestrated task."""
    effective_project_dir = project_dir or os.environ.get("DEFAULT_PROJECT_DIR") or None
    mismatch_error = _project_dir_mismatch_error(task, effective_project_dir)
    if mismatch_error:
        return _project_dir_error_result(mismatch_error)

    effective_reviewer_cmd = reviewer_cmd or DEFAULT_REVIEWER_CMD
    if effective_reviewer_cmd == DEFAULT_REVIEWER_CMD:
        config_error = _reviewer_env_configured()
        if config_error:
            return _config_error_result(config_error)
    cmd = [
        sys.executable,
        str(CLI_PATH),
        "--task", task,
        "--reviewer-cmd", effective_reviewer_cmd,
        "--worker-backend", worker_backend,
        "--max-rounds", str(max_rounds),
        "--inner-max", str(inner_max),
        "--escalation-out", escalation_out,
    ]

    if worker_backend == "shell":
        effective_worker_cmd = worker_cmd or DEFAULT_WORKER_CMD
        cmd.extend(["--worker-cmd", effective_worker_cmd])
    elif worker_cmd:
        cmd.extend(["--worker-cmd", worker_cmd])

    if test_cmd:
        cmd.extend(["--test-cmd", test_cmd])
    if effective_project_dir:
        cmd.extend(["--project-dir", effective_project_dir])
    if in_container_test:
        cmd.append("--in-container-test")

    effective_cwd = cwd or os.getcwd()
    _log(f"Running subprocess: {' '.join(cmd)}")

    # gate_run_task is the tool's whole purpose (do real coding work), not a
    # permission self-test — so write mode is hardcoded here, never exposed
    # as an LLM-controllable tool argument (same reasoning as worker_cmd/
    # reviewer_cmd, PR #51). The shell/agy worker's "A1 NULL-WRITE TEST" stays
    # available as a manual diagnostic (A2_ALLOW_WRITE unset, direct CLI call).
    env = dict(os.environ)
    env["A2_ALLOW_WRITE"] = "1"

    try:
        res = subprocess.run(
            cmd,
            cwd=effective_cwd,
            capture_output=True,
            text=True,
            check=False,
            env=env,
            timeout=SUBPROCESS_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired:
        # kill() only reaches this direct child (cli.py) — a docker run it
        # spawned keeps running until it exits on its own (--rm cleans up
        # afterwards); accepted limitation, out of scope for "stop silent hangs".
        return {
            "status": "ERROR",
            "exit_code": 1,
            "stdout": "",
            "stderr": (
                f"[Timeout] cli.py lief länger als {SUBPROCESS_TIMEOUT_SECONDS}s und wurde beendet. "
                "Ein evtl. noch laufender Worker-Container beendet sich selbst (--rm)."
            ),
        }
    except Exception as exc:
        return {
            "success": False,
            "error": f"Subprozess konnte nicht gestartet werden: {exc}",
        }

    status_str = "APPROVED" if res.returncode == 0 else ("ESCALATED" if res.returncode == 2 else "ERROR")
    result: Dict[str, Any] = {
        "status": status_str,
        "exit_code": res.returncode,
        "stdout": res.stdout,
        "stderr": res.stderr,
    }

    if res.returncode == 2:
        # Check escalation details file
        esc_file = Path(effective_cwd) / escalation_out
        if esc_file.exists():
            try:
                result["escalation_note"] = esc_file.read_text(encoding="utf-8")
            except OSError:
                pass
        state_file = _default_resume_state_path(str(esc_file))
        if state_file.exists():
            try:
                result["escalation_state"] = json.loads(state_file.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                pass

    return result


def execute_gate_get_escalation_details(
    escalation_out: str = "a2-eskalation.md",
    cwd: Optional[str] = None,
) -> Dict[str, Any]:
    """Read escalation markdown note and state JSON file."""
    effective_cwd = Path(cwd or os.getcwd())
    esc_file = effective_cwd / escalation_out
    state_file = _default_resume_state_path(str(esc_file))

    exists = esc_file.exists() or state_file.exists()
    if not exists:
        return {
            "found": False,
            "message": f"Keine Eskalationsdatei gefunden unter '{esc_file}'.",
        }

    data: Dict[str, Any] = {"found": True, "escalation_file": str(esc_file)}
    if esc_file.exists():
        try:
            data["note"] = esc_file.read_text(encoding="utf-8")
        except OSError as exc:
            data["note_error"] = str(exc)

    if state_file.exists():
        try:
            data["state"] = json.loads(state_file.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            data["state_error"] = str(exc)

    return data


def execute_gate_resume_task(
    reviewer_cmd: Optional[str] = None,
    to_reviewer: bool = True,
    escalation_out: str = "a2-eskalation.md",
    resume: Optional[str] = None,
    cwd: Optional[str] = None,
) -> Dict[str, Any]:
    """Resume a self-check-failed escalation by handing it to the reviewer."""
    if not to_reviewer:
        return {
            "success": False,
            "error": "to_reviewer=True ist erforderlich für --resume (einziger unterstützter Wiedereinstieg).",
        }

    effective_reviewer_cmd = reviewer_cmd or DEFAULT_REVIEWER_CMD
    if effective_reviewer_cmd == DEFAULT_REVIEWER_CMD:
        config_error = _reviewer_env_configured()
        if config_error:
            return _config_error_result(config_error)
    cmd = [
        sys.executable,
        str(CLI_PATH),
        "--reviewer-cmd", effective_reviewer_cmd,
        "--to-reviewer",
        "--escalation-out", escalation_out,
    ]
    if resume:
        cmd.extend(["--resume", resume])
    else:
        cmd.append("--resume")

    effective_cwd = cwd or os.getcwd()
    _log(f"Running resume subprocess: {' '.join(cmd)}")

    try:
        res = subprocess.run(
            cmd,
            cwd=effective_cwd,
            capture_output=True,
            text=True,
            check=False,
            timeout=SUBPROCESS_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired:
        return {
            "status": "ERROR",
            "exit_code": 1,
            "stdout": "",
            "stderr": f"[Timeout] cli.py lief länger als {SUBPROCESS_TIMEOUT_SECONDS}s und wurde beendet.",
        }
    except Exception as exc:
        return {
            "success": False,
            "error": f"Resume-Subprozess konnte nicht gestartet werden: {exc}",
        }

    status_str = "APPROVED" if res.returncode == 0 else ("ESCALATED" if res.returncode == 2 else "ERROR")
    return {
        "status": status_str,
        "exit_code": res.returncode,
        "stdout": res.stdout,
        "stderr": res.stderr,
    }


def _git(args: List[str], cwd: str) -> subprocess.CompletedProcess:
    """Run git with an argument list (never shell=True with interpolated
    strings) — the only injection-safe way to pass an LLM-supplied
    branch_name/patch_id anywhere near a subprocess call.
    """
    return subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, check=False)


def _validate_branch_name(name: str) -> Optional[str]:
    """Return an error message if name is unsafe/invalid for `git checkout -b`, else None.

    A name starting with '-' could be parsed as a git flag even inside an
    argument list (git itself, not the shell, would misinterpret it) — reject
    that plus anything outside a conservative safe character set.
    """
    if not name:
        return "Branch-Name ist leer."
    if name.startswith("-"):
        return f"Branch-Name darf nicht mit '-' beginnen: {name!r}"
    if not _BRANCH_NAME_RE.match(name):
        return f"Branch-Name enthält ungültige Zeichen: {name!r}"
    if ".." in name or name.endswith("/") or name.endswith("."):
        return f"Branch-Name ungültig (Git-Ref-Regeln): {name!r}"
    return None


def _default_branch_name() -> str:
    return "a2/" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _resolve_patch_entry(
    project_dir: str,
    patch_id: Optional[str],
    run_log_path: Optional[Path] = None,
) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """Find the run-log entry (and thus patch file) to apply.

    patch_id given: must exactly match an APPROVED entry's own patch_file
    name — never accepted as a raw filesystem path (path-traversal guard).
    patch_id omitted: newest APPROVED entry whose recorded project_dir
    matches the given one, so "letztes Ergebnis" cannot accidentally grab
    another project's patch.
    """
    log_path = run_log_path or DEFAULT_RUN_LOG_PATH
    if not log_path.exists():
        return None, "Kein Run-Log gefunden — es gibt noch keine gespeicherten Ergebnisse."

    project_dir_norm = os.path.normpath(os.path.abspath(os.path.expanduser(project_dir)))
    candidates: List[Dict[str, Any]] = []
    try:
        with open(log_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if entry.get("status") == "APPROVED" and entry.get("patch_file"):
                    candidates.append(entry)
    except OSError as exc:
        return None, f"Run-Log konnte nicht gelesen werden: {exc}"

    if patch_id:
        for entry in candidates:
            if entry.get("patch_file") == patch_id:
                return entry, None
        return None, f"patch_id {patch_id!r} wurde in keinem APPROVED-Run-Log-Eintrag gefunden."

    matching = [
        e for e in candidates
        if e.get("project_dir")
        and os.path.normpath(os.path.abspath(os.path.expanduser(e["project_dir"]))) == project_dir_norm
    ]
    if not matching:
        return None, (
            f"Kein gespeichertes APPROVED-Ergebnis für project_dir={project_dir!r} gefunden. "
            "Wurde gate_run_task mit genau diesem project_dir erfolgreich abgeschlossen?"
        )
    matching.sort(key=lambda e: e.get("timestamp", ""))
    return matching[-1], None


def execute_gate_apply_result(
    project_dir: str,
    patch_id: Optional[str] = None,
    branch_name: Optional[str] = None,
) -> Dict[str, Any]:
    """Apply a previously APPROVED gate_run_task result onto a real project
    directory, on a fresh branch (never the currently checked-out one).

    NEVER call this automatically right after gate_run_task in the same
    turn — only when Alex explicitly asks for it ("übernehmen",
    "wende das Ergebnis an" o.ä.) in a separate instruction.
    """
    if not project_dir:
        return {"status": "ERROR", "error": "project_dir ist erforderlich."}

    project_path = Path(project_dir).expanduser()
    if not project_path.is_dir():
        return {"status": "ERROR", "error": f"project_dir existiert nicht oder ist kein Verzeichnis: {project_dir}"}

    is_repo = _git(["rev-parse", "--is-inside-work-tree"], cwd=str(project_path))
    if is_repo.returncode != 0 or is_repo.stdout.strip() != "true":
        return {"status": "ERROR", "error": f"project_dir ist kein Git-Repository: {project_dir}"}

    entry, err = _resolve_patch_entry(str(project_path), patch_id)
    if err:
        return {"status": "ERROR", "error": err}
    assert entry is not None  # for type-checkers; err is None iff entry is not None
    patch_filename = entry["patch_file"]

    patches_dir_resolved = DEFAULT_PATCHES_DIR.resolve()
    patch_path = (DEFAULT_PATCHES_DIR / patch_filename).resolve()
    try:
        patch_path.relative_to(patches_dir_resolved)
    except ValueError:
        return {"status": "ERROR", "error": f"Ungültiger Patch-Pfad (außerhalb von logs/patches/): {patch_filename}"}
    if not patch_path.is_file():
        return {"status": "ERROR", "error": f"Patch-Datei fehlt auf der Platte: {patch_path}"}

    effective_branch = branch_name or _default_branch_name()
    branch_err = _validate_branch_name(effective_branch)
    if branch_err:
        return {"status": "ERROR", "error": branch_err}

    # Preflight 1: clean working tree — never risk silently burying uncommitted work.
    status_res = _git(["status", "--porcelain"], cwd=str(project_path))
    if status_res.returncode != 0:
        return {"status": "ERROR", "error": f"git status fehlgeschlagen: {status_res.stderr.strip()}"}
    if status_res.stdout.strip():
        return {
            "status": "ERROR",
            "error": "project_dir hat unversionierte/uncommittete Änderungen — Abbruch, um nichts zu "
                     "überschreiben. Erst committen oder stashen, dann erneut versuchen.",
            "git_status": status_res.stdout,
        }

    # Preflight 2: dry-run BEFORE touching any branch, so a failed check
    # never leaves an empty new branch behind to clean up.
    check_res = _git(["apply", "--check", str(patch_path)], cwd=str(project_path))
    if check_res.returncode != 0:
        return {
            "status": "ERROR",
            "error": "Patch lässt sich nicht anwenden (git apply --check fehlgeschlagen) — "
                     "Projektstand hat sich vermutlich seit dem Lauf verändert.",
            "git_apply_check_stderr": check_res.stderr,
        }

    branch_res = _git(["checkout", "-b", effective_branch], cwd=str(project_path))
    if branch_res.returncode != 0:
        return {
            "status": "ERROR",
            "error": f"Branch konnte nicht erstellt werden ({effective_branch}): {branch_res.stderr.strip()}",
        }

    apply_res = _git(["apply", str(patch_path)], cwd=str(project_path))
    if apply_res.returncode != 0:
        # Best-effort cleanup: back to the previous branch, drop the now-empty one.
        _git(["checkout", "-"], cwd=str(project_path))
        _git(["branch", "-D", effective_branch], cwd=str(project_path))
        return {
            "status": "ERROR",
            "error": f"git apply fehlgeschlagen trotz erfolgreichem --check: {apply_res.stderr.strip()}",
        }

    _git(["add", "-A"], cwd=str(project_path))
    task_desc = (entry.get("task") or "").strip()
    commit_message = f"Apply Gate-A2 result: {task_desc[:72]}" if task_desc else "Apply Gate-A2 result"
    commit_res = _git(["commit", "-m", commit_message], cwd=str(project_path))
    if commit_res.returncode != 0:
        return {
            "status": "ERROR",
            "error": f"git commit fehlgeschlagen: {commit_res.stderr.strip()}",
            "note": f"Änderungen sind bereits angewendet, aber uncommitted, auf Branch {effective_branch}.",
        }

    stat_res = _git(["diff", "--stat", "HEAD~1", "HEAD"], cwd=str(project_path))

    return {
        "status": "APPLIED",
        "project_dir": str(project_path),
        "branch": effective_branch,
        "patch_file": patch_filename,
        "commit_message": commit_message,
        "files_changed": stat_res.stdout.strip(),
        "note": f"Branch '{effective_branch}' ist jetzt in {project_path} ausgecheckt — bereit zum "
                "Ansehen/Testen. Kein automatischer Push.",
    }


def execute_gate_read_roadmap(cwd: Optional[str] = None) -> Dict[str, Any]:
    """Read ROADMAP.md content (Kit meta-tool, bound to REPO_ROOT by default)."""
    path = (Path(cwd) / "ROADMAP.md") if cwd else (REPO_ROOT / "ROADMAP.md")
    if not path.exists():
        path = REPO_ROOT / "ROADMAP.md"
    if not path.exists():
        return {"exists": False, "content": ""}
    try:
        return {"exists": True, "content": path.read_text(encoding="utf-8")}
    except OSError as exc:
        return {"exists": False, "error": str(exc)}


def execute_gate_read_stand(cwd: Optional[str] = None) -> Dict[str, Any]:
    """Read STAND.md content (Kit meta-tool, bound to REPO_ROOT by default)."""
    path = (Path(cwd) / "STAND.md") if cwd else (REPO_ROOT / "STAND.md")
    if not path.exists():
        path = REPO_ROOT / "STAND.md"
    if not path.exists():
        return {"exists": False, "content": ""}
    try:
        return {"exists": True, "content": path.read_text(encoding="utf-8")}
    except OSError as exc:
        return {"exists": False, "error": str(exc)}


def _find_running_cli_processes() -> List[Dict[str, str]]:
    """Best-effort scan of `ps aux` for cli.py invocations belonging to this
    Gate-A2/A3 install. Fails safely (empty list) if `ps` itself errors —
    this is a diagnostic aid, never allowed to break the status call itself.
    """
    try:
        res = subprocess.run(["ps", "aux"], capture_output=True, text=True, check=False, timeout=5)
    except Exception:
        return []
    if res.returncode != 0:
        return []
    cli_path_str = str(CLI_PATH)
    matches: List[Dict[str, str]] = []
    for line in res.stdout.splitlines()[1:]:  # skip the header row
        if cli_path_str in line:
            parts = line.split(None, 10)
            if len(parts) >= 11:
                matches.append({"pid": parts[1], "started": parts[8], "command": parts[10][:200]})
    return matches


def execute_gate_status(cwd: Optional[str] = None) -> Dict[str, Any]:
    """Best-effort status snapshot: is a cli.py run currently active (per `ps`),
    and what did the last run-log.jsonl entry say.

    IMPORTANT LIMITATION (2026-08-19): mcp_server.py's STDIO loop processes
    one JSON-RPC request at a time. If a gate_run_task call is already in
    flight, this call cannot even be READ until that one returns — the
    process is blocked inside subprocess.run(). This tool is therefore only
    useful BETWEEN calls, never as a live progress monitor for an active run
    (for that, use scripts/gate-a2/status.sh directly on the host, which
    reads process/Docker/log state without going through mcp_server.py at all).
    """
    running = _find_running_cli_processes()

    log_path = DEFAULT_RUN_LOG_PATH
    last_entry: Optional[Dict[str, Any]] = None
    if log_path.exists():
        try:
            lines = log_path.read_text(encoding="utf-8").strip().splitlines()
            if lines:
                last_entry = json.loads(lines[-1])
        except (OSError, json.JSONDecodeError):
            pass

    return {
        "currently_running": bool(running),
        "running_processes": running,
        "last_run_log_entry": last_entry,
        "note": (
            "Momentaufnahme, kein Live-Fortschritt: Läuft bereits ein gate_run_task-Aufruf, "
            "verarbeitet mcp_server.py Anfragen strikt nacheinander — diese Anfrage wird erst "
            "gelesen, wenn der andere fertig ist. Für Status WÄHREND eines aktiven Laufs "
            "stattdessen scripts/gate-a2/status.sh direkt auf dem Host ausführen (lassen)."
        ),
    }


TOOLS_DEFINITIONS: List[Dict[str, Any]] = [
    {
        "name": "gate_run_task",
        "description": "Führt eine orchestrierte Gate-A2/A3-Aufgabe (Worker-Reviewer-Schleife) synchron als Subprozess aus. Dies ist das EINZIGE Werkzeug für Zugriff auf lokale Projektdateien — nutze es auch, um ein Projekt zu analysieren, Fragen dazu zu beantworten oder Dateien zu erstellen/ändern. Der Worker liest den unter project_dir angegebenen Projektordner vollständig und hat dort Lese- und Schreibzugriff.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "task": {"type": "string", "description": "Die Aufgabenbeschreibung für den Worker."},
                "worker_backend": {"type": "string", "enum": ["shell", "openhands"], "default": "shell", "description": "Worker-Backend."},
                "test_cmd": {"type": "string", "description": "Autoritativer Test-Befehl (z. B. 'pytest -q')."},
                "project_dir": {"type": "string", "description": "ZWINGEND erforderlich, wenn ein lokales Projekt analysiert/bearbeitet werden soll — den Pfad NICHT nur im Task-Text erwähnen, sondern hier als eigenes Argument übergeben, sonst arbeitet der Worker an einem leeren Workspace. Betrifft NUR den zu bearbeitenden Code, NICHT die Pfade von worker_cmd/reviewer_cmd (die bleiben Kit-intern). Ohne Angabe UND ohne passenden Pfad im Task-Text greift optional DEFAULT_PROJECT_DIR aus .env."},
                "in_container_test": {"type": "boolean", "default": False, "description": "Test-Befehl im Container ausführen."},
                "inner_max": {"type": "integer", "default": 3, "description": "Max innere Selbstkorrekturen."},
                "max_rounds": {"type": "integer", "default": 3, "description": "Max äußere Runden."},
                "escalation_out": {"type": "string", "default": "a2-eskalation.md", "description": "Pfad für Eskalationshinweise."}
            },
            "required": ["task"],
        },
    },
    {
        "name": "gate_get_escalation_details",
        "description": "Liest den aktuellen Eskalationszustand aus (a2-eskalation.md und a2-eskalation-state.json).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "escalation_out": {"type": "string", "default": "a2-eskalation.md", "description": "Pfad zur Eskalationsdatei."}
            },
        },
    },
    {
        "name": "gate_resume_task",
        "description": "Nimmt eine SELF_CHECK_FAILED-Eskalation zur Diagnose durch den Reviewer wieder auf.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "to_reviewer": {"type": "boolean", "default": True, "description": "Muss True sein."},
                "escalation_out": {"type": "string", "default": "a2-eskalation.md", "description": "Pfad zur Eskalationsdatei."},
                "resume": {"type": "string", "description": "Optionaler Pfad zur Zustandsdatei."}
            },
        },
    },
    {
        "name": "gate_apply_result",
        "description": (
            "Wendet das Ergebnis eines vorherigen, APPROVED gate_run_task-Laufs auf einen echten "
            "Projektordner an — auf einem NEUEN Branch, nie auf dem aktuell ausgecheckten Stand. "
            "Danach liegen die echten Dateien im Projekt bereit (ansehen, testen, selbst committen "
            "war schon erledigt). Kein automatischer Push. WICHTIG: Rufe dieses Werkzeug NIEMALS "
            "automatisch direkt im selben Zug wie gate_run_task auf — nur wenn Alex im Chat "
            "ausdrücklich 'übernehmen'/'anwenden' o. Ä. sagt, als eigene, separate Anweisung."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "project_dir": {"type": "string", "description": "Pfad zum echten Zielprojekt, auf das angewendet werden soll (muss ein Git-Repository sein, sauberer Arbeitsstand vorausgesetzt)."},
                "patch_id": {"type": "string", "description": "Optional: Dateiname eines bestimmten gespeicherten Patches. Ohne Angabe wird automatisch das neueste APPROVED-Ergebnis für dieses project_dir verwendet."},
                "branch_name": {"type": "string", "description": "Optional: Name des neuen Branches. Ohne Angabe wird automatisch 'a2/<Zeitstempel>' generiert."}
            },
            "required": ["project_dir"],
        },
    },
    {
        "name": "gate_read_roadmap",
        "description": "Liest die ROADMAP.md des Gate-A2/A3-Kit-Repositories selbst (NICHT des per project_dir bearbeiteten Zielprojekts). Enthält Backlog/Architekturerwägungen des Kits, keine Informationen über externe Projekte.",
        "inputSchema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "gate_read_stand",
        "description": "Liest die flüchtige Übergabedatei STAND.md des Gate-A2/A3-Kit-Repositories selbst (NICHT des per project_dir bearbeiteten Zielprojekts). Enthält den Arbeitsstand des Kits, keine Informationen über externe Projekte.",
        "inputSchema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "gate_status",
        "description": (
            "Momentaufnahme: läuft gerade ein cli.py-Prozess, und was war der letzte Run-Log-Eintrag. "
            "WICHTIG: Läuft bereits ein gate_run_task-Aufruf, kann DIESE Anfrage nicht beantwortet werden, "
            "bevor der andere fertig ist (mcp_server.py verarbeitet Anfragen strikt nacheinander) — nützlich "
            "nur ZWISCHEN Läufen, nicht als Live-Fortschrittsanzeige während eines aktiven Laufs."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {},
        },
    },
]


def dispatch_tool_call(name: str, arguments: Dict[str, Any], cwd: Optional[str] = None) -> Dict[str, Any]:
    """Execute a tool call by name and return a structured dictionary."""
    if name == "gate_run_task":
        return execute_gate_run_task(
            task=arguments["task"],
            reviewer_cmd=arguments.get("reviewer_cmd"),
            worker_backend=arguments.get("worker_backend", "shell"),
            worker_cmd=arguments.get("worker_cmd"),
            test_cmd=arguments.get("test_cmd"),
            project_dir=arguments.get("project_dir"),
            in_container_test=arguments.get("in_container_test", False),
            inner_max=arguments.get("inner_max", 3),
            max_rounds=arguments.get("max_rounds", 3),
            escalation_out=arguments.get("escalation_out", "a2-eskalation.md"),
            cwd=cwd,
        )
    elif name == "gate_get_escalation_details":
        return execute_gate_get_escalation_details(
            escalation_out=arguments.get("escalation_out", "a2-eskalation.md"),
            cwd=cwd,
        )
    elif name == "gate_resume_task":
        return execute_gate_resume_task(
            reviewer_cmd=arguments.get("reviewer_cmd"),
            to_reviewer=arguments.get("to_reviewer", True),
            escalation_out=arguments.get("escalation_out", "a2-eskalation.md"),
            resume=arguments.get("resume"),
            cwd=cwd,
        )
    elif name == "gate_apply_result":
        return execute_gate_apply_result(
            project_dir=arguments["project_dir"],
            patch_id=arguments.get("patch_id"),
            branch_name=arguments.get("branch_name"),
        )
    elif name == "gate_read_roadmap":
        return execute_gate_read_roadmap(cwd=cwd)
    elif name == "gate_read_stand":
        return execute_gate_read_stand(cwd=cwd)
    elif name == "gate_status":
        return execute_gate_status(cwd=cwd)
    else:
        raise ValueError(f"Unbekanntes Werkzeug: {name}")


def process_jsonrpc_request(req: Dict[str, Any], cwd: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Process a single JSON-RPC 2.0 request and return the JSON-RPC response."""
    method = req.get("method")
    req_id = req.get("id")

    # Notifications do not receive responses
    if req_id is None and method == "notifications/initialized":
        _log("Client sent notifications/initialized")
        return None

    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {}},
                "serverInfo": {
                    "name": "gate-a2-mcp-server",
                    "version": "1.0.0",
                },
            },
        }
    elif method == "ping":
        return {"jsonrpc": "2.0", "id": req_id, "result": {}}
    elif method == "tools/list":
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {"tools": TOOLS_DEFINITIONS},
        }
    elif method == "tools/call":
        params = req.get("params", {})
        tool_name = params.get("name")
        arguments = params.get("arguments", {})
        try:
            raw_res = dispatch_tool_call(tool_name, arguments, cwd=cwd)
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "content": [
                        {
                            "type": "text",
                            "text": json.dumps(raw_res, ensure_ascii=False, indent=2),
                        }
                    ],
                    "isError": False,
                },
            }
        except Exception as exc:
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "content": [
                        {
                            "type": "text",
                            "text": f"Fehler bei Werkzeugausführung ({tool_name}): {exc}",
                        }
                    ],
                    "isError": True,
                },
            }
    else:
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "error": {
                "code": -32601,
                "message": f"Method not found: {method}",
            },
        }


def main() -> int:
    """Run STDIO MCP server loop."""
    _log("Gate A2/A3 MCP Server gestartet (STDIO Transport)")
    for line in sys.stdin:
        line_str = line.strip()
        if not line_str:
            continue
        try:
            req = json.loads(line_str)
        except json.JSONDecodeError as exc:
            _log(f"Ungültiges JSON empfangen: {exc}")
            continue

        resp = process_jsonrpc_request(req)
        if resp is not None:
            sys.stdout.write(json.dumps(resp, ensure_ascii=False) + "\n")
            sys.stdout.flush()

    _log("Gate A2/A3 MCP Server beendet")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
