"""Gate A2/A3 — test_mcp_server.py

Tests for the STDIO MCP server interface (scripts/gate-a2/mcp_server.py).

Human-readable list (es prüft, dass …):
  1. initialize und ping korrekt ein MCP 2024-11-05 Protokoll-Envelope zurückgeben.
  2. tools/list alle 5 definierten Werkzeuge liefert.
  3. gate_read_roadmap und gate_read_stand den Dateiinhalt korrekt auslesen.
  4. gate_get_escalation_details bei fehlenden Dateien found: False und bei vorhandenen Dateien den Inhalt zurückgibt.
  5. gate_run_task die CLI cli.py via Subprozess aufruft und ein strukturiertes Ergebnis zurückgibt.
  6. gate_resume_task die Wiederaufnahme zur Diagnose durch den Reviewer korrekt ausführt.
  7. gate_run_task A2_ALLOW_WRITE=1 im Subprozess-Env erzwingt (unabhängig vom Prozess-Env),
     damit der Shell/agy-Worker nicht strukturell im Null-Schreibtest-Modus feststeckt.
  8. gate_apply_result ein APPROVED-Ergebnis sicher auf ein echtes Projekt anwendet: neuer
     Branch, Preflight-Checks (dirty tree, git apply --check VOR jedem Branch-Anlegen),
     Branch-Name-Validierung, patch_id nur als Run-Log-Nachschlage-Schlüssel (kein
     Path-Traversal), automatische Wahl des neuesten passenden project_dir-Ergebnisses.
  9. gate_run_task VOR jedem Subprozess-Start ablehnt, wenn der Task-Text einen
     Projektpfad nennt, project_dir aber fehlt/abweicht (Fail-Fast-Guard) — und
     DEFAULT_PROJECT_DIR aus der Umgebung nur greift, wenn kein abweichender
     Pfad im Task-Text steht.
  10. gate_run_task/gate_resume_task ein klares [Timeout]-ERROR liefern, wenn der
      cli.py-Subprozess SUBPROCESS_TIMEOUT_SECONDS überschreitet, statt den
      einzigen STDIO-Request-Thread unbegrenzt zu blockieren.
  11. gate_status laufende cli.py-Prozesse (per `ps aux`, fail-safe bei ps-Fehlern)
      und den letzten Run-Log-Eintrag korrekt meldet, auch ohne vorhandenes Run-Log.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
import pytest

# Ensure scripts/gate-a2 is in import path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import mcp_server

MOCKS_DIR = Path(__file__).resolve().parent.parent / "mocks"


def test_mcp_initialize_and_ping():
    init_req = {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}}
    resp = mcp_server.process_jsonrpc_request(init_req)
    assert resp["jsonrpc"] == "2.0"
    assert resp["id"] == 1
    assert resp["result"]["protocolVersion"] == "2024-11-05"
    assert resp["result"]["serverInfo"]["name"] == "gate-a2-mcp-server"

    ping_req = {"jsonrpc": "2.0", "id": 2, "method": "ping"}
    ping_resp = mcp_server.process_jsonrpc_request(ping_req)
    assert ping_resp["id"] == 2
    assert ping_resp["result"] == {}


def test_mcp_tools_list():
    list_req = {"jsonrpc": "2.0", "id": 3, "method": "tools/list"}
    resp = mcp_server.process_jsonrpc_request(list_req)
    assert resp["id"] == 3
    tools = resp["result"]["tools"]
    tool_names = [t["name"] for t in tools]
    assert "gate_run_task" in tool_names
    assert "gate_get_escalation_details" in tool_names
    assert "gate_resume_task" in tool_names
    assert "gate_apply_result" in tool_names
    assert "gate_read_roadmap" in tool_names
    assert "gate_read_stand" in tool_names
    assert "gate_status" in tool_names
    assert len(tools) == 7

    # Prüfen, dass gate_run_task nur noch task als Pflichtfeld fordert
    run_task_tool = next(t for t in tools if t["name"] == "gate_run_task")
    assert run_task_tool["inputSchema"]["required"] == ["task"]

    # worker_cmd/reviewer_cmd sind bewusst nicht mehr LLM-seitig aufrufbar
    # (verhindert, dass ein Modell sich einen falschen Pfad ausdenkt).
    assert "worker_cmd" not in run_task_tool["inputSchema"]["properties"]
    assert "reviewer_cmd" not in run_task_tool["inputSchema"]["properties"]

    resume_task_tool = next(t for t in tools if t["name"] == "gate_resume_task")
    assert "reviewer_cmd" not in resume_task_tool["inputSchema"]["properties"]


def test_mcp_gate_run_task_defaults_subprocess_invocation(monkeypatch, tmp_path):
    # Verifizieren, dass ohne reviewer_cmd / worker_cmd die Defaults gesetzt werden
    # (Config-Check umgangen: nicht vom echten .env-Zustand der Testmaschine abhängig)
    monkeypatch.setattr(mcp_server, "_reviewer_env_configured", lambda: None)
    captured_cmd = []

    def mock_subprocess_run(cmd, cwd=None, capture_output=None, text=None, check=None, env=None, timeout=None):
        nonlocal captured_cmd
        captured_cmd = cmd
        class DummyRes:
            returncode = 0
            stdout = "mock-stdout"
            stderr = ""
        return DummyRes()

    monkeypatch.setattr(subprocess, "run", mock_subprocess_run)

    res = mcp_server.execute_gate_run_task(task="Default-Test-Task", cwd=str(tmp_path))
    assert res["status"] == "APPROVED"
    assert "--reviewer-cmd" in captured_cmd
    rev_idx = captured_cmd.index("--reviewer-cmd")
    assert captured_cmd[rev_idx + 1] == mcp_server.DEFAULT_REVIEWER_CMD
    assert "--worker-cmd" in captured_cmd
    worker_idx = captured_cmd.index("--worker-cmd")
    assert captured_cmd[worker_idx + 1] == mcp_server.DEFAULT_WORKER_CMD


def test_mcp_gate_run_task_forces_allow_write_env(monkeypatch, tmp_path):
    # gate_run_task ist gedacht, echte Aufgaben zu erledigen (nicht den
    # Null-Schreibtest zu fahren) — A2_ALLOW_WRITE=1 muss im Subprozess-Env
    # gesetzt sein, unabhaengig davon, ob es im aktuellen Prozess-Env steht.
    monkeypatch.setattr(mcp_server, "_reviewer_env_configured", lambda: None)
    monkeypatch.delenv("A2_ALLOW_WRITE", raising=False)
    captured_env = {}

    def mock_subprocess_run(cmd, cwd=None, capture_output=None, text=None, check=None, env=None, timeout=None):
        captured_env.update(env or {})
        class DummyRes:
            returncode = 0
            stdout = "mock-stdout"
            stderr = ""
        return DummyRes()

    monkeypatch.setattr(subprocess, "run", mock_subprocess_run)

    res = mcp_server.execute_gate_run_task(task="Default-Test-Task", cwd=str(tmp_path))
    assert res["status"] == "APPROVED"
    assert captured_env.get("A2_ALLOW_WRITE") == "1"


def test_mcp_read_roadmap_and_stand(tmp_path):
    (tmp_path / "ROADMAP.md").write_text("# Test Roadmap\n- Item 1", encoding="utf-8")
    (tmp_path / "STAND.md").write_text("# Test Stand\n- Task 1", encoding="utf-8")

    roadmap_res = mcp_server.execute_gate_read_roadmap(cwd=str(tmp_path))
    assert roadmap_res["exists"] is True
    assert "# Test Roadmap" in roadmap_res["content"]

    stand_res = mcp_server.execute_gate_read_stand(cwd=str(tmp_path))
    assert stand_res["exists"] is True
    assert "# Test Stand" in stand_res["content"]


def test_mcp_get_escalation_details_missing(tmp_path):
    res = mcp_server.execute_gate_get_escalation_details(cwd=str(tmp_path))
    assert res["found"] is False
    assert "Keine Eskalationsdatei" in res["message"]


def test_mcp_get_escalation_details_existing(tmp_path):
    esc_file = tmp_path / "a2-eskalation.md"
    state_file = tmp_path / "a2-eskalation-state.json"
    esc_file.write_text("Eskalation: Bitte prüfen", encoding="utf-8")
    state_file.write_text(json.dumps({"task": "Test-Task", "reason": "Self-check failed"}), encoding="utf-8")

    res = mcp_server.execute_gate_get_escalation_details(cwd=str(tmp_path))
    assert res["found"] is True
    assert res["note"] == "Eskalation: Bitte prüfen"
    assert res["state"]["task"] == "Test-Task"


def test_mcp_gate_run_task_mock_subprocess_approve(tmp_path):
    # Run against shell mocks using mcp_server.dispatch_tool_call
    worker_sh = MOCKS_DIR / "mock_worker.sh"
    reviewer_sh = MOCKS_DIR / "mock_reviewer.sh"

    os.environ["A2_MOCK_STATE_DIR"] = str(tmp_path)
    os.environ["A2_MOCK_REVIEWER_SCENARIO"] = "approve"
    try:
        res = mcp_server.dispatch_tool_call(
            "gate_run_task",
            {
                "task": "Test-Task-Approved",
                "worker_backend": "shell",
                "worker_cmd": str(worker_sh),
                "reviewer_cmd": str(reviewer_sh),
                "escalation_out": "a2-eskalation.md",
            },
            cwd=str(tmp_path),
        )
    finally:
        os.environ.pop("A2_MOCK_STATE_DIR", None)
        os.environ.pop("A2_MOCK_REVIEWER_SCENARIO", None)

    assert res["status"] == "APPROVED"
    assert res["exit_code"] == 0


def test_mcp_gate_run_task_mock_subprocess_escalate(tmp_path):
    worker_sh = MOCKS_DIR / "mock_worker.sh"
    reviewer_sh = MOCKS_DIR / "mock_reviewer.sh"

    os.environ["A2_MOCK_STATE_DIR"] = str(tmp_path)
    os.environ["A2_MOCK_REVIEWER_SCENARIO"] = "revise"
    try:
        res = mcp_server.dispatch_tool_call(
            "gate_run_task",
            {
                "task": "Test-Task-Escalated",
                "worker_backend": "shell",
                "worker_cmd": str(worker_sh),
                "reviewer_cmd": str(reviewer_sh),
                "escalation_out": "a2-eskalation.md",
            },
            cwd=str(tmp_path),
        )
    finally:
        os.environ.pop("A2_MOCK_STATE_DIR", None)
        os.environ.pop("A2_MOCK_REVIEWER_SCENARIO", None)

    assert res["status"] == "ESCALATED"
    assert res["exit_code"] == 2
    assert "escalation_note" in res


def test_mcp_gate_resume_task_mock_subprocess(tmp_path):
    state_file = tmp_path / "a2-eskalation-state.json"
    state_file.write_text(
        json.dumps({
            "task": "Palindrome-Funktion",
            "last_result": {"diff": "d", "testlog": "fail", "committed": True, "tests_passed": False},
            "inner_attempts": [],
            "reason": "Tests rot",
        }),
        encoding="utf-8",
    )
    reviewer_sh = MOCKS_DIR / "mock_reviewer.sh"

    os.environ["A2_MOCK_STATE_DIR"] = str(tmp_path)
    os.environ["A2_MOCK_REVIEWER_SCENARIO"] = "approve"
    try:
        res = mcp_server.dispatch_tool_call(
            "gate_resume_task",
            {
                "reviewer_cmd": str(reviewer_sh),
                "to_reviewer": True,
                "resume": str(state_file),
            },
            cwd=str(tmp_path),
        )
    finally:
        os.environ.pop("A2_MOCK_STATE_DIR", None)
        os.environ.pop("A2_MOCK_REVIEWER_SCENARIO", None)

    assert res["status"] == "APPROVED"
    assert res["exit_code"] == 0


def test_mcp_server_stdio_subprocess_e2e_sequence(tmp_path):
    """E2E test running mcp_server.py as a real subprocess over STDIO pipes.

    Executes a realistic Open WebUI sequence:
    initialize -> tools/list -> tools/call (gate_read_roadmap).
    Includes strict timeout and guaranteed process cleanup.
    """
    (tmp_path / "ROADMAP.md").write_text("# Test Roadmap\n- Item Subprocess E2E", encoding="utf-8")
    server_script = Path(__file__).resolve().parent.parent / "mcp_server.py"

    proc = subprocess.Popen(
        [sys.executable, str(server_script)],
        cwd=str(tmp_path),
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    try:
        # 1. initialize
        init_req = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}}) + "\n"
        proc.stdin.write(init_req)
        proc.stdin.flush()
        init_resp_line = proc.stdout.readline()
        assert init_resp_line, "Subprozess hat keine Antwort auf initialize gesendet"
        init_resp = json.loads(init_resp_line)
        assert init_resp["id"] == 1
        assert init_resp["result"]["protocolVersion"] == "2024-11-05"

        # 2. tools/list
        list_req = json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/list"}) + "\n"
        proc.stdin.write(list_req)
        proc.stdin.flush()
        list_resp_line = proc.stdout.readline()
        assert list_resp_line, "Subprozess hat keine Antwort auf tools/list gesendet"
        list_resp = json.loads(list_resp_line)
        assert list_resp["id"] == 2
        assert len(list_resp["result"]["tools"]) == 7

        # 3. tools/call -> gate_read_roadmap (Kit meta-tool, reads REPO_ROOT/ROADMAP.md)
        call_req = json.dumps({
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {"name": "gate_read_roadmap", "arguments": {}}
        }) + "\n"
        proc.stdin.write(call_req)
        proc.stdin.flush()
        call_resp_line = proc.stdout.readline()
        assert call_resp_line, "Subprozess hat keine Antwort auf tools/call gesendet"
        call_resp = json.loads(call_resp_line)
        assert call_resp["id"] == 3
        content_text = call_resp["result"]["content"][0]["text"]
        tool_data = json.loads(content_text)
        assert tool_data["exists"] is True
        assert "ROADMAP" in tool_data["content"].upper() or "ERWÄGUNGEN" in tool_data["content"].upper()


    finally:
        # Guaranteed cleanup with timeout
        if proc.poll() is None:
            if proc.stdin:
                proc.stdin.close()
            try:
                proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()


def test_reviewer_env_configured_missing_file(tmp_path):
    error = mcp_server._reviewer_env_configured(tmp_path / "does-not-exist.env")
    assert error is not None
    assert "nicht gefunden" in error


def test_reviewer_env_configured_placeholder(tmp_path):
    env_file = tmp_path / ".env"
    env_file.write_text("REVIEWER_BASE_URL=your_reviewer_base_url_here\n", encoding="utf-8")
    error = mcp_server._reviewer_env_configured(env_file)
    assert error is not None
    assert "nicht konfiguriert" in error


def test_reviewer_env_configured_empty_value(tmp_path):
    env_file = tmp_path / ".env"
    env_file.write_text("REVIEWER_BASE_URL=\n", encoding="utf-8")
    error = mcp_server._reviewer_env_configured(env_file)
    assert error is not None


def test_reviewer_env_configured_quoted_placeholder(tmp_path):
    # reviewer-a2.sh strippt Quotes um den Wert (read_one()) — der Python-Check
    # muss denselben Platzhalter auch gequotet erkennen, sonst laeuft der
    # Fail-fast-Check am tatsaechlichen Bash-Verhalten vorbei.
    env_file = tmp_path / ".env"
    env_file.write_text('REVIEWER_BASE_URL="your_reviewer_base_url_here"\n', encoding="utf-8")
    error = mcp_server._reviewer_env_configured(env_file)
    assert error is not None
    assert "nicht konfiguriert" in error


def test_reviewer_env_configured_real_value(tmp_path):
    env_file = tmp_path / ".env"
    env_file.write_text("REVIEWER_BASE_URL=https://example.invalid\n", encoding="utf-8")
    error = mcp_server._reviewer_env_configured(env_file)
    assert error is None


def test_gate_run_task_fails_fast_on_unconfigured_env(monkeypatch, tmp_path):
    # Verifiziert: Bei unkonfiguriertem REVIEWER_BASE_URL (Default-Reviewer)
    # wird der Subprozess (Worker + Reviewer) gar nicht erst gestartet.
    monkeypatch.setattr(
        mcp_server, "_reviewer_env_configured", lambda: "REVIEWER_BASE_URL ist in .env nicht konfiguriert (Platzhalter oder leer)."
    )
    subprocess_called = False

    def mock_subprocess_run(*args, **kwargs):
        nonlocal subprocess_called
        subprocess_called = True
        raise AssertionError("subprocess.run haette bei fehlender Konfiguration nicht aufgerufen werden duerfen")

    monkeypatch.setattr(subprocess, "run", mock_subprocess_run)

    res = mcp_server.execute_gate_run_task(task="Test-Task", cwd=str(tmp_path))
    assert res["status"] == "ERROR"
    assert "Konfigurationsfehler" in res["stderr"]
    assert not subprocess_called


def test_gate_run_task_skips_env_check_with_explicit_reviewer_cmd(monkeypatch, tmp_path):
    # Ein explizit uebergebener reviewer_cmd (z. B. ein Mock in Tests) darf
    # nicht am REVIEWER_BASE_URL-Check der echten .env scheitern.
    called = {}

    def mock_subprocess_run(cmd, cwd=None, capture_output=None, text=None, check=None, env=None, timeout=None):
        called["cmd"] = cmd
        class DummyRes:
            returncode = 0
            stdout = "mock-stdout"
            stderr = ""
        return DummyRes()

    monkeypatch.setattr(subprocess, "run", mock_subprocess_run)
    monkeypatch.setattr(
        mcp_server,
        "_reviewer_env_configured",
        lambda: (_ for _ in ()).throw(AssertionError("Check haette bei explizitem reviewer_cmd nicht laufen duerfen")),
    )

    res = mcp_server.execute_gate_run_task(
        task="Test-Task", reviewer_cmd="/some/mock/reviewer.sh", cwd=str(tmp_path)
    )
    assert res["status"] == "APPROVED"
    assert "cmd" in called


def test_gate_resume_task_fails_fast_on_unconfigured_env(monkeypatch, tmp_path):
    monkeypatch.setattr(
        mcp_server, "_reviewer_env_configured", lambda: "REVIEWER_BASE_URL ist in .env nicht konfiguriert (Platzhalter oder leer)."
    )
    subprocess_called = False

    def mock_subprocess_run(*args, **kwargs):
        nonlocal subprocess_called
        subprocess_called = True
        raise AssertionError("subprocess.run haette bei fehlender Konfiguration nicht aufgerufen werden duerfen")

    monkeypatch.setattr(subprocess, "run", mock_subprocess_run)

    res = mcp_server.execute_gate_resume_task(cwd=str(tmp_path))
    assert res["status"] == "ERROR"
    assert "Konfigurationsfehler" in res["stderr"]
    assert not subprocess_called


# --- gate_apply_result (2026-08-19) -------------------------------------------
# es prüft, dass:
#   1. ein sauberer Apply-Lauf einen neuen Branch anlegt, den Patch anwendet
#      und committet (Happy Path).
#   2. ein unsauberer Arbeitsstand im Zielprojekt den Lauf abbricht, bevor
#      irgendetwas verändert wird.
#   3. ein Patch, der nicht mehr anwendbar ist (--check schlägt fehl), abbricht,
#      OHNE vorher einen Branch anzulegen.
#   4. ein ungültiger branch_name (z. B. beginnt mit '-') abgelehnt wird.
#   5. patch_id nur als Nachschlage-Schlüssel im Run-Log akzeptiert wird, nicht
#      als roher Dateipfad (Path-Traversal-Schutz).
#   6. ohne patch_id automatisch das neueste APPROVED-Ergebnis MIT PASSENDEM
#      project_dir gewählt wird — nicht irgendein anderes Projekts Patch.
#   7. project_dir, das kein Git-Repo (oder gar kein Verzeichnis) ist, klar abgelehnt wird.

def _init_git_repo(path: Path) -> None:
    subprocess.run(["git", "init", "-q"], cwd=path, check=True)
    subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=path, check=True)
    subprocess.run(["git", "config", "user.name", "Test"], cwd=path, check=True)
    (path / "README.md").write_text("hello\n", encoding="utf-8")
    subprocess.run(["git", "add", "-A"], cwd=path, check=True)
    subprocess.run(["git", "commit", "-q", "-m", "baseline"], cwd=path, check=True)


def _make_patch_for_new_file(repo: Path, filename: str = "UEBERBLICK.md", content: str = "# Overview\n") -> str:
    """Create filename in repo, capture a real `git diff` for it, then remove
    it again — returns a unified diff that `git apply` can cleanly re-apply
    to the still-clean repo. Using real git to generate the fixture avoids
    hand-rolled diff syntax that might not match what `git apply` expects.
    """
    target = repo / filename
    target.write_text(content, encoding="utf-8")
    subprocess.run(["git", "add", "-A"], cwd=repo, check=True)
    diff = subprocess.run(
        ["git", "diff", "--cached"], cwd=repo, capture_output=True, text=True, check=True
    ).stdout
    subprocess.run(["git", "reset", "-q"], cwd=repo, check=True)
    target.unlink()
    return diff


def _write_approved_entry(
    log_path: Path, project_dir: str, patch_file: str, timestamp: str = "2026-08-19T10:00:00+00:00",
    task: str = "Erstelle UEBERBLICK.md",
) -> None:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    entry = {
        "task": task, "worker_backend": "shell", "rounds": 1, "status": "APPROVED",
        "findings": [], "error": None, "timestamp": timestamp, "duration_seconds": 1.0,
        "patch_file": patch_file, "project_dir": project_dir,
    }
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry) + "\n")


def test_gate_apply_result_happy_path(tmp_path, monkeypatch):
    repo = tmp_path / "target-project"
    repo.mkdir()
    _init_git_repo(repo)
    diff = _make_patch_for_new_file(repo)

    patches_dir = tmp_path / "patches"
    patches_dir.mkdir()
    (patches_dir / "20260819T100000Z-test.patch").write_text(diff, encoding="utf-8")
    monkeypatch.setattr(mcp_server, "DEFAULT_PATCHES_DIR", patches_dir)

    log_path = tmp_path / "run-log.jsonl"
    _write_approved_entry(log_path, str(repo), "20260819T100000Z-test.patch")
    monkeypatch.setattr(mcp_server, "DEFAULT_RUN_LOG_PATH", log_path)

    res = mcp_server.execute_gate_apply_result(project_dir=str(repo), branch_name="a2/test-branch")

    assert res["status"] == "APPLIED"
    assert res["branch"] == "a2/test-branch"
    assert (repo / "UEBERBLICK.md").read_text(encoding="utf-8") == "# Overview\n"

    current_branch = subprocess.run(
        ["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=repo, capture_output=True, text=True, check=True
    ).stdout.strip()
    assert current_branch == "a2/test-branch"

    log_out = subprocess.run(
        ["git", "log", "--oneline", "-1"], cwd=repo, capture_output=True, text=True, check=True
    ).stdout
    assert "Gate-A2 result" in log_out

    status = subprocess.run(
        ["git", "status", "--porcelain"], cwd=repo, capture_output=True, text=True, check=True
    ).stdout
    assert status.strip() == ""  # applied AND committed, nothing left dangling


def test_gate_apply_result_aborts_on_dirty_working_tree(tmp_path, monkeypatch):
    repo = tmp_path / "target-project"
    repo.mkdir()
    _init_git_repo(repo)
    (repo / "README.md").write_text("dirty change\n", encoding="utf-8")  # uncommitted

    diff = "diff --git a/x b/x\n--- /dev/null\n+++ b/x\n@@ -0,0 +1 @@\n+y\n"
    patches_dir = tmp_path / "patches"
    patches_dir.mkdir()
    (patches_dir / "p.patch").write_text(diff, encoding="utf-8")
    monkeypatch.setattr(mcp_server, "DEFAULT_PATCHES_DIR", patches_dir)

    log_path = tmp_path / "run-log.jsonl"
    _write_approved_entry(log_path, str(repo), "p.patch")
    monkeypatch.setattr(mcp_server, "DEFAULT_RUN_LOG_PATH", log_path)

    res = mcp_server.execute_gate_apply_result(project_dir=str(repo))

    assert res["status"] == "ERROR"
    assert "uncommittete" in res["error"] or "unversionierte" in res["error"]
    branches = subprocess.run(["git", "branch"], cwd=repo, capture_output=True, text=True, check=True).stdout
    assert "a2/" not in branches  # no branch was created


def test_gate_apply_result_aborts_when_patch_no_longer_applies(tmp_path, monkeypatch):
    repo = tmp_path / "target-project"
    repo.mkdir()
    _init_git_repo(repo)
    # A patch that tries to modify a line that doesn't exist in this repo.
    bogus_diff = (
        "diff --git a/README.md b/README.md\n"
        "index 0000000..1111111 100644\n"
        "--- a/README.md\n"
        "+++ b/README.md\n"
        "@@ -1 +1 @@\n"
        "-this line does not exist\n"
        "+replacement\n"
    )
    patches_dir = tmp_path / "patches"
    patches_dir.mkdir()
    (patches_dir / "p.patch").write_text(bogus_diff, encoding="utf-8")
    monkeypatch.setattr(mcp_server, "DEFAULT_PATCHES_DIR", patches_dir)

    log_path = tmp_path / "run-log.jsonl"
    _write_approved_entry(log_path, str(repo), "p.patch")
    monkeypatch.setattr(mcp_server, "DEFAULT_RUN_LOG_PATH", log_path)

    res = mcp_server.execute_gate_apply_result(project_dir=str(repo))

    assert res["status"] == "ERROR"
    assert "git_apply_check_stderr" in res
    branches = subprocess.run(["git", "branch"], cwd=repo, capture_output=True, text=True, check=True).stdout
    assert "a2/" not in branches  # check runs BEFORE any branch is created


@pytest.mark.parametrize("bad_name", ["-x", "has space", "..", "trailing/", "weird`cmd`"])
def test_gate_apply_result_rejects_unsafe_branch_names(tmp_path, monkeypatch, bad_name):
    repo = tmp_path / "target-project"
    repo.mkdir()
    _init_git_repo(repo)
    diff = _make_patch_for_new_file(repo)

    patches_dir = tmp_path / "patches"
    patches_dir.mkdir()
    (patches_dir / "p.patch").write_text(diff, encoding="utf-8")
    monkeypatch.setattr(mcp_server, "DEFAULT_PATCHES_DIR", patches_dir)

    log_path = tmp_path / "run-log.jsonl"
    _write_approved_entry(log_path, str(repo), "p.patch")
    monkeypatch.setattr(mcp_server, "DEFAULT_RUN_LOG_PATH", log_path)

    res = mcp_server.execute_gate_apply_result(project_dir=str(repo), branch_name=bad_name)

    assert res["status"] == "ERROR"
    assert "Branch-Name" in res["error"]


def test_gate_apply_result_patch_id_must_match_a_run_log_entry(tmp_path, monkeypatch):
    # A patch_id that isn't a recorded patch_file must be rejected, even if a
    # file with that exact name happens to exist on disk — patch_id is a
    # lookup key into run-log.jsonl, never a raw filesystem path (traversal guard).
    repo = tmp_path / "target-project"
    repo.mkdir()
    _init_git_repo(repo)

    patches_dir = tmp_path / "patches"
    patches_dir.mkdir()
    (patches_dir / "real.patch").write_text("irrelevant", encoding="utf-8")
    monkeypatch.setattr(mcp_server, "DEFAULT_PATCHES_DIR", patches_dir)

    log_path = tmp_path / "run-log.jsonl"
    _write_approved_entry(log_path, str(repo), "some-other.patch")  # exists, but not "real.patch"
    monkeypatch.setattr(mcp_server, "DEFAULT_RUN_LOG_PATH", log_path)

    res = mcp_server.execute_gate_apply_result(project_dir=str(repo), patch_id="real.patch")

    assert res["status"] == "ERROR"
    assert "real.patch" in res["error"]
    assert "gefunden" in res["error"]


def test_gate_apply_result_picks_newest_matching_project_dir_when_patch_id_omitted(tmp_path, monkeypatch):
    repo_a = tmp_path / "project-a"
    repo_a.mkdir()
    _init_git_repo(repo_a)
    diff_a = _make_patch_for_new_file(repo_a, filename="from-a.md")

    patches_dir = tmp_path / "patches"
    patches_dir.mkdir()
    (patches_dir / "older-a.patch").write_text(diff_a, encoding="utf-8")
    (patches_dir / "newer-a.patch").write_text(diff_a, encoding="utf-8")
    (patches_dir / "other-project.patch").write_text("irrelevant", encoding="utf-8")
    monkeypatch.setattr(mcp_server, "DEFAULT_PATCHES_DIR", patches_dir)

    log_path = tmp_path / "run-log.jsonl"
    _write_approved_entry(log_path, "/some/other/project", "other-project.patch",
                           timestamp="2026-08-19T12:00:00+00:00")
    _write_approved_entry(log_path, str(repo_a), "older-a.patch", timestamp="2026-08-19T09:00:00+00:00")
    _write_approved_entry(log_path, str(repo_a), "newer-a.patch", timestamp="2026-08-19T11:00:00+00:00")
    monkeypatch.setattr(mcp_server, "DEFAULT_RUN_LOG_PATH", log_path)

    res = mcp_server.execute_gate_apply_result(project_dir=str(repo_a), branch_name="a2/pick-newest")

    assert res["status"] == "APPLIED"
    assert res["patch_file"] == "newer-a.patch"
    assert (repo_a / "from-a.md").exists()


def test_gate_apply_result_rejects_non_git_project_dir(tmp_path):
    not_a_repo = tmp_path / "just-a-folder"
    not_a_repo.mkdir()
    res = mcp_server.execute_gate_apply_result(project_dir=str(not_a_repo))
    assert res["status"] == "ERROR"
    assert "Git-Repository" in res["error"]


def test_gate_apply_result_rejects_missing_project_dir(tmp_path):
    res = mcp_server.execute_gate_apply_result(project_dir=str(tmp_path / "does-not-exist"))
    assert res["status"] == "ERROR"
    assert "existiert nicht" in res["error"]


def test_gate_apply_result_dispatched_via_tool_call(tmp_path, monkeypatch):
    repo = tmp_path / "target-project"
    repo.mkdir()
    _init_git_repo(repo)
    diff = _make_patch_for_new_file(repo)

    patches_dir = tmp_path / "patches"
    patches_dir.mkdir()
    (patches_dir / "p.patch").write_text(diff, encoding="utf-8")
    monkeypatch.setattr(mcp_server, "DEFAULT_PATCHES_DIR", patches_dir)

    log_path = tmp_path / "run-log.jsonl"
    _write_approved_entry(log_path, str(repo), "p.patch")
    monkeypatch.setattr(mcp_server, "DEFAULT_RUN_LOG_PATH", log_path)

    res = mcp_server.dispatch_tool_call("gate_apply_result", {"project_dir": str(repo)})
    assert res["status"] == "APPLIED"


# --- project_dir Fail-Fast-Guard + DEFAULT_PROJECT_DIR (2026-08-19) ----------

def test_mentioned_project_paths_requires_at_least_three_segments():
    assert mcp_server._mentioned_project_paths(
        "Analysiere /Users/alex/Documents/Programmierungsprojekte/cwa-alexandria"
    ) == ["/Users/alex/Documents/Programmierungsprojekte/cwa-alexandria"]
    # Short/generic paths (2 segments) must not trigger the guard.
    assert mcp_server._mentioned_project_paths("siehe /tmp/x oder /etc/hosts") == []
    assert mcp_server._mentioned_project_paths("kein Pfad hier") == []


def test_project_dir_mismatch_error_none_when_no_path_mentioned():
    assert mcp_server._project_dir_mismatch_error("Schreibe eine Palindrom-Funktion", None) is None


def test_project_dir_mismatch_error_none_when_project_dir_matches():
    task = "Analysiere /Users/alex/Documents/Programmierungsprojekte/cwa-alexandria"
    assert mcp_server._project_dir_mismatch_error(
        task, "/Users/alex/Documents/Programmierungsprojekte/cwa-alexandria"
    ) is None


def test_project_dir_mismatch_error_when_missing():
    task = "Analysiere /Users/alex/Documents/Programmierungsprojekte/cwa-alexandria"
    err = mcp_server._project_dir_mismatch_error(task, None)
    assert err is not None
    assert "nicht gesetzt" in err


def test_project_dir_mismatch_error_when_pointing_elsewhere():
    task = "Analysiere /Users/alex/Documents/Programmierungsprojekte/cwa-alexandria"
    err = mcp_server._project_dir_mismatch_error(task, "/Users/alex/other-project")
    assert err is not None
    assert "anderen Pfad" in err


def test_gate_run_task_fails_fast_when_task_mentions_path_but_project_dir_missing(monkeypatch, tmp_path):
    monkeypatch.setattr(mcp_server, "_reviewer_env_configured", lambda: None)
    monkeypatch.delenv("DEFAULT_PROJECT_DIR", raising=False)
    subprocess_called = False

    def mock_subprocess_run(*args, **kwargs):
        nonlocal subprocess_called
        subprocess_called = True
        raise AssertionError("subprocess.run haette wegen fehlendem project_dir nicht laufen duerfen")

    monkeypatch.setattr(subprocess, "run", mock_subprocess_run)

    res = mcp_server.execute_gate_run_task(
        task="Analysiere das Projekt unter /Users/alex/Documents/Programmierungsprojekte/cwa-alexandria "
             "und erstelle UEBERBLICK.md",
        cwd=str(tmp_path),
    )
    assert res["status"] == "ERROR"
    assert "project_dir-Warnung" in res["stderr"]
    assert not subprocess_called


def test_gate_run_task_proceeds_when_project_dir_explicitly_matches(monkeypatch, tmp_path):
    monkeypatch.setattr(mcp_server, "_reviewer_env_configured", lambda: None)
    captured_cmd = []

    def mock_subprocess_run(cmd, cwd=None, capture_output=None, text=None, check=None, env=None, timeout=None):
        nonlocal captured_cmd
        captured_cmd = cmd
        class DummyRes:
            returncode = 0
            stdout = "mock-stdout"
            stderr = ""
        return DummyRes()

    monkeypatch.setattr(subprocess, "run", mock_subprocess_run)

    res = mcp_server.execute_gate_run_task(
        task="Analysiere /Users/alex/Documents/Programmierungsprojekte/cwa-alexandria",
        project_dir="/Users/alex/Documents/Programmierungsprojekte/cwa-alexandria",
        cwd=str(tmp_path),
    )
    assert res["status"] == "APPROVED"
    assert "--project-dir" in captured_cmd
    idx = captured_cmd.index("--project-dir")
    assert captured_cmd[idx + 1] == "/Users/alex/Documents/Programmierungsprojekte/cwa-alexandria"


def test_gate_run_task_uses_default_project_dir_when_task_names_no_conflicting_path(monkeypatch, tmp_path):
    monkeypatch.setattr(mcp_server, "_reviewer_env_configured", lambda: None)
    monkeypatch.setenv("DEFAULT_PROJECT_DIR", "/Users/alex/Documents/Programmierungsprojekte/cwa-alexandria")
    captured_cmd = []

    def mock_subprocess_run(cmd, cwd=None, capture_output=None, text=None, check=None, env=None, timeout=None):
        nonlocal captured_cmd
        captured_cmd = cmd
        class DummyRes:
            returncode = 0
            stdout = "mock-stdout"
            stderr = ""
        return DummyRes()

    monkeypatch.setattr(subprocess, "run", mock_subprocess_run)

    res = mcp_server.execute_gate_run_task(task="Schreibe eine Palindrom-Funktion", cwd=str(tmp_path))
    assert res["status"] == "APPROVED"
    idx = captured_cmd.index("--project-dir")
    assert captured_cmd[idx + 1] == "/Users/alex/Documents/Programmierungsprojekte/cwa-alexandria"


def test_gate_run_task_default_project_dir_does_not_silently_override_a_different_mentioned_path(monkeypatch, tmp_path):
    # DEFAULT_PROJECT_DIR must never silently win over a DIFFERENT path the
    # task text actually names — that would work on the wrong project without
    # any error at all, worse than the original bug.
    monkeypatch.setattr(mcp_server, "_reviewer_env_configured", lambda: None)
    monkeypatch.setenv("DEFAULT_PROJECT_DIR", "/Users/alex/Documents/Programmierungsprojekte/cwa-alexandria")
    subprocess_called = False

    def mock_subprocess_run(*args, **kwargs):
        nonlocal subprocess_called
        subprocess_called = True
        raise AssertionError("subprocess.run haette wegen abweichendem Pfad nicht laufen duerfen")

    monkeypatch.setattr(subprocess, "run", mock_subprocess_run)

    res = mcp_server.execute_gate_run_task(
        task="Analysiere /Users/alex/Documents/Programmierungsprojekte/some-other-project",
        cwd=str(tmp_path),
    )
    assert res["status"] == "ERROR"
    assert not subprocess_called


# --- Subprocess-Timeout (2026-08-19) ------------------------------------------
# es prüft, dass: ein hängender cli.py-Subprozess nach SUBPROCESS_TIMEOUT_SECONDS
# beendet wird und ein klares [Timeout]-ERROR liefert, statt den einzigen
# STDIO-Request-Thread von mcp_server.py auf unbestimmte Zeit zu blockieren
# (reproduzierter Vorfall: ein zweiter gate_run_task-Aufruf verschwand spurlos,
# während der erste noch lief).

def test_gate_run_task_returns_clear_error_on_timeout(monkeypatch, tmp_path):
    monkeypatch.setattr(mcp_server, "_reviewer_env_configured", lambda: None)

    def mock_subprocess_run(cmd, cwd=None, capture_output=None, text=None, check=None, env=None, timeout=None):
        raise subprocess.TimeoutExpired(cmd=cmd, timeout=timeout)

    monkeypatch.setattr(subprocess, "run", mock_subprocess_run)

    res = mcp_server.execute_gate_run_task(task="Ein sehr langer Task", cwd=str(tmp_path))
    assert res["status"] == "ERROR"
    assert "[Timeout]" in res["stderr"]
    assert str(mcp_server.SUBPROCESS_TIMEOUT_SECONDS) in res["stderr"]


def test_gate_resume_task_returns_clear_error_on_timeout(monkeypatch, tmp_path):
    monkeypatch.setattr(mcp_server, "_reviewer_env_configured", lambda: None)

    def mock_subprocess_run(cmd, cwd=None, capture_output=None, text=None, check=None, timeout=None):
        raise subprocess.TimeoutExpired(cmd=cmd, timeout=timeout)

    monkeypatch.setattr(subprocess, "run", mock_subprocess_run)

    res = mcp_server.execute_gate_resume_task(cwd=str(tmp_path))
    assert res["status"] == "ERROR"
    assert "[Timeout]" in res["stderr"]


def test_gate_run_task_passes_timeout_to_subprocess_run(monkeypatch, tmp_path):
    monkeypatch.setattr(mcp_server, "_reviewer_env_configured", lambda: None)
    captured = {}

    def mock_subprocess_run(cmd, cwd=None, capture_output=None, text=None, check=None, env=None, timeout=None):
        captured["timeout"] = timeout
        class DummyRes:
            returncode = 0
            stdout = "mock-stdout"
            stderr = ""
        return DummyRes()

    monkeypatch.setattr(subprocess, "run", mock_subprocess_run)

    mcp_server.execute_gate_run_task(task="Default-Test-Task", cwd=str(tmp_path))
    assert captured["timeout"] == mcp_server.SUBPROCESS_TIMEOUT_SECONDS


# --- gate_status (2026-08-19) --------------------------------------------------
# es prüft, dass:
#   1. _find_running_cli_processes echte cli.py-Zeilen aus `ps aux`-Output erkennt
#      und andere Prozesse ignoriert (auch bei ps-Fehlern fail-safe: leere Liste).
#   2. execute_gate_status den letzten Run-Log-Eintrag korrekt zurückgibt und mit
#      fehlendem Run-Log sauber umgeht (kein Crash, last_run_log_entry: None).
#   3. gate_status über dispatch_tool_call erreichbar ist.

def test_find_running_cli_processes_detects_matching_line(monkeypatch):
    ps_output = (
        "USER  PID  %CPU %MEM VSZ  RSS TTY STAT START   TIME COMMAND\n"
        f"alex  4242 0.1  0.2 123  456 ??  SN   5:00PM 0:01.23 python3 {mcp_server.CLI_PATH} --task foo\n"
        "alex  9999 0.0  0.0 111  222 ??  SN   5:00PM 0:00.01 some-unrelated-process\n"
    )

    def mock_subprocess_run(cmd, capture_output=None, text=None, check=None, timeout=None):
        class DummyRes:
            returncode = 0
            stdout = ps_output
        return DummyRes()

    monkeypatch.setattr(subprocess, "run", mock_subprocess_run)
    matches = mcp_server._find_running_cli_processes()
    assert len(matches) == 1
    assert matches[0]["pid"] == "4242"


def test_find_running_cli_processes_fails_safe_on_ps_error(monkeypatch):
    def mock_subprocess_run(*args, **kwargs):
        raise OSError("ps not found")

    monkeypatch.setattr(subprocess, "run", mock_subprocess_run)
    assert mcp_server._find_running_cli_processes() == []


def test_gate_status_reports_last_run_log_entry(monkeypatch, tmp_path):
    log_path = tmp_path / "run-log.jsonl"
    log_path.write_text(
        json.dumps({"task": "t1", "status": "APPROVED", "timestamp": "2026-08-19T10:00:00Z"}) + "\n"
        + json.dumps({"task": "t2", "status": "ESCALATED", "timestamp": "2026-08-19T11:00:00Z"}) + "\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(mcp_server, "DEFAULT_RUN_LOG_PATH", log_path)
    monkeypatch.setattr(mcp_server, "_find_running_cli_processes", lambda: [])

    res = mcp_server.execute_gate_status()
    assert res["currently_running"] is False
    assert res["last_run_log_entry"]["task"] == "t2"  # the last line, not the first


def test_gate_status_handles_missing_run_log(monkeypatch, tmp_path):
    monkeypatch.setattr(mcp_server, "DEFAULT_RUN_LOG_PATH", tmp_path / "does-not-exist.jsonl")
    monkeypatch.setattr(mcp_server, "_find_running_cli_processes", lambda: [])

    res = mcp_server.execute_gate_status()
    assert res["last_run_log_entry"] is None
    assert res["currently_running"] is False


def test_gate_status_dispatched_via_tool_call(monkeypatch, tmp_path):
    monkeypatch.setattr(mcp_server, "DEFAULT_RUN_LOG_PATH", tmp_path / "does-not-exist.jsonl")
    monkeypatch.setattr(mcp_server, "_find_running_cli_processes", lambda: [])

    res = mcp_server.dispatch_tool_call("gate_status", {})
    assert "currently_running" in res
    assert "note" in res
