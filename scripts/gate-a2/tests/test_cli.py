"""Gate A3 Paket 1 — cli.py's --resume/--to-reviewer wiring (ADR B4).

Human-readable list (es prüft, dass …):
  1. der Default-Pfad der Zustandsdatei aus --escalation-out abgeleitet wird.
  2. --resume ohne --to-reviewer ein klarer Fehler ist (exit 1), kein stilles
     Fehlverhalten.
  3. --resume mit einer fehlenden Zustandsdatei ein klarer Fehler ist (exit 1).
  4. ein vollständiger Resume-Lauf gegen den Mock-Reviewer bei APPROVE exit 0
     liefert.
  5. ein vollständiger Resume-Lauf gegen den Mock-Reviewer bei REVISE exit 2
     liefert und die Findings zeigt.
  6. --resume --to-reviewer OHNE --worker-cmd funktioniert (Review-Fund: der
     Resume-Pfad ruft den Worker nie auf, --worker-cmd darf dort nicht
     erzwungen sein).
  7. --worker-cmd fehlt im normalen (Nicht-Resume-)Pfad weiterhin klar
     abgelehnt wird (kein stiller Fallback).
  8. --inner-max 0 ein klarer Fehler ist, kein Absturz tief in adapters.py.
  9. write_patch_file() den Diff eines APPROVED-Laufs (normal + Resume) als
     .patch-Datei persistiert und patch_file/project_dir korrekt ins Run-Log
     schreibt; bei leerem Diff nichts geschrieben wird (gate_apply_result-Grundlage).
  10. der Resume/Diagnose-Pfad ein reviewer-seitiges APPROVE bei leerem Diff verwirft
      (default_sanity_check, Test-#10-Bugfix) statt fälschlich APPROVED zu melden.
  11. project_dir jetzt auch bei ESCALATED-Run-Log-Einträgen (normal + Resume)
      mitgeschrieben wird, nicht nur bei APPROVED (Regression, 2026-08-19).
  12. cli.py bei APPROVED die produktberater-Empfehlung anzeigt, wenn die
      winning-round Verdict eine hat — und schweigt, wenn nicht (2026-08-24,
      docs/kreativteam.md Abschnitt 3b).
"""

import os
from pathlib import Path

import pytest

import cli
from orchestrator import LoopOutcome, ResumableState, WorkerResult, resumable_state_to_json

MOCKS_DIR = Path(__file__).resolve().parent.parent / "mocks"


def test_default_resume_state_path_derivation():
    assert cli._default_resume_state_path("a2-eskalation.md") == Path("a2-eskalation-state.json")
    assert cli._default_resume_state_path("out/x.md") == Path("out/x-state.json")


def test_resume_without_to_reviewer_is_a_clear_error(capsys):
    rc = cli.main(["--worker-cmd", "irrelevant", "--reviewer-cmd", "irrelevant", "--resume"])
    assert rc == 1
    assert "--to-reviewer" in capsys.readouterr().err


def test_resume_missing_state_file_is_a_clear_error(tmp_path, capsys):
    missing = tmp_path / "does-not-exist.json"
    rc = cli.main(["--worker-cmd", "irrelevant", "--reviewer-cmd", "irrelevant",
                   "--resume", str(missing), "--to-reviewer"])
    assert rc == 1
    assert "nicht lesbar" in capsys.readouterr().err


def _write_state(tmp_path: Path) -> Path:
    state = ResumableState(
        task="Palindrome-Funktion",
        last_result=WorkerResult(diff="d", testlog="pytest: 1 failed", committed=True,
                                  tests_passed=False),
        inner_attempts=[],
        reason="Tests bleiben rot nach 3 Versuchen.",
    )
    path = tmp_path / "state.json"
    path.write_text(resumable_state_to_json(state), encoding="utf-8")
    return path


def _write_state_with_empty_diff(tmp_path: Path) -> Path:
    state = ResumableState(
        task="Erstelle UEBERBLICK.md",
        last_result=WorkerResult(diff="", testlog="agy exit: 0", committed=True,
                                  tests_passed=False),
        inner_attempts=[],
        reason="Diff war leer.",
    )
    path = tmp_path / "state-empty-diff.json"
    path.write_text(resumable_state_to_json(state), encoding="utf-8")
    return path


def test_resume_to_reviewer_rejects_approve_on_empty_diff(tmp_path):
    # Reproduces Test #10's bug via the resume/diagnose path too: even if the
    # mock reviewer says APPROVE, an empty diff must not become a real
    # APPROVED result (default_sanity_check applies here as well).
    state_path = _write_state_with_empty_diff(tmp_path)
    os.environ["A2_MOCK_STATE_DIR"] = str(tmp_path)
    os.environ["A2_MOCK_REVIEWER_SCENARIO"] = "approve"
    try:
        rc = cli.main(["--worker-cmd", "irrelevant",
                       "--reviewer-cmd", str(MOCKS_DIR / "mock_reviewer.sh"),
                       "--resume", str(state_path), "--to-reviewer"])
    finally:
        for k in ("A2_MOCK_STATE_DIR", "A2_MOCK_REVIEWER_SCENARIO"):
            os.environ.pop(k, None)
    assert rc == 2  # ESCALATED, not APPROVED


def test_resume_to_reviewer_approve_end_to_end(tmp_path):
    state_path = _write_state(tmp_path)
    os.environ["A2_MOCK_STATE_DIR"] = str(tmp_path)
    os.environ["A2_MOCK_REVIEWER_SCENARIO"] = "approve"
    try:
        rc = cli.main(["--worker-cmd", "irrelevant",
                       "--reviewer-cmd", str(MOCKS_DIR / "mock_reviewer.sh"),
                       "--resume", str(state_path), "--to-reviewer"])
    finally:
        for k in ("A2_MOCK_STATE_DIR", "A2_MOCK_REVIEWER_SCENARIO"):
            os.environ.pop(k, None)
    assert rc == 0


def test_resume_to_reviewer_revise_end_to_end(tmp_path, capsys):
    state_path = _write_state(tmp_path)
    os.environ["A2_MOCK_STATE_DIR"] = str(tmp_path)
    os.environ["A2_MOCK_REVIEWER_SCENARIO"] = "revise"
    try:
        rc = cli.main(["--worker-cmd", "irrelevant",
                       "--reviewer-cmd", str(MOCKS_DIR / "mock_reviewer.sh"),
                       "--resume", str(state_path), "--to-reviewer"])
    finally:
        for k in ("A2_MOCK_STATE_DIR", "A2_MOCK_REVIEWER_SCENARIO"):
            os.environ.pop(k, None)
    assert rc == 2
    assert "Fehlerbehandlung" in capsys.readouterr().out  # the mock's REVISE finding text


def test_resume_to_reviewer_works_without_worker_cmd(tmp_path):
    # Review finding: --worker-cmd was `required=True` at the argparse level,
    # so argparse rejected --resume --to-reviewer before main() ever ran —
    # even though _resume_to_reviewer() never touches args.worker_cmd.
    state_path = _write_state(tmp_path)
    os.environ["A2_MOCK_STATE_DIR"] = str(tmp_path)
    os.environ["A2_MOCK_REVIEWER_SCENARIO"] = "approve"
    try:
        rc = cli.main(["--reviewer-cmd", str(MOCKS_DIR / "mock_reviewer.sh"),
                       "--resume", str(state_path), "--to-reviewer"])
    finally:
        for k in ("A2_MOCK_STATE_DIR", "A2_MOCK_REVIEWER_SCENARIO"):
            os.environ.pop(k, None)
    assert rc == 0


def test_normal_path_still_requires_worker_cmd():
    with pytest.raises(SystemExit):
        cli.main(["--task", "t", "--reviewer-cmd", "irrelevant"])


def test_inner_max_zero_is_a_clear_error_not_a_crash():
    with pytest.raises(SystemExit):
        cli.main(["--task", "t", "--worker-cmd", "irrelevant", "--reviewer-cmd", "irrelevant",
                  "--test-cmd", "exit 0", "--inner-max", "0"])


# --- _read_worker_rules_excerpt (Regel-Auszug, ADR C3) -----------------------
# es prüft, dass: Datei vorhanden -> Inhalt zurückgegeben; Datei fehlt ->
# leerer String, keine Exception (das Skript darf ohne generierte Datei laufen).

def test_read_worker_rules_excerpt_returns_content_when_file_exists(tmp_path, monkeypatch):
    (tmp_path / "worker-rules.generated.md").write_text("Regel Z", encoding="utf-8")
    monkeypatch.setattr(cli, "__file__", str(tmp_path / "cli.py"))
    assert cli._read_worker_rules_excerpt() == "Regel Z"


def test_read_worker_rules_excerpt_is_empty_when_file_missing(tmp_path, monkeypatch):
    monkeypatch.setattr(cli, "__file__", str(tmp_path / "cli.py"))
    assert cli._read_worker_rules_excerpt() == ""


# --- notify_n8n_webhook (ADR 1-3: Push-Benachrichtigungskanal) ---------------
# es prüft, dass:
#   1. ein valider Webhook-POST an die URL mit vollständigem Payload abgesetzt wird.
#   2. ohne gesetzte Webhook-URL der Aufruf stillschweigend übersprungen wird.
#   3. Verbindungsfehler/Timeouts ausfallsicher abgefangen und als [WARN] geloggt werden.
#   4. extrem lange Texte für Telegram sicherheitshalber gekürzt werden.
#   5. cli.main im Eskalationsfall den Webhook auslöst.
#   6. cli.main im Resume-Eskalationsfall den Webhook ebenfalls auslöst.

import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer


class _MockWebhookHandler(BaseHTTPRequestHandler):
    received_payloads: list[dict] = []

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length).decode("utf-8")
        _MockWebhookHandler.received_payloads.append(json.loads(body))
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"status":"ok"}')

    def log_message(self, format, *args):
        pass  # Stille Mock-Server-Logs


def test_notify_n8n_webhook_success():
    _MockWebhookHandler.received_payloads = []
    server = HTTPServer(("127.0.0.1", 0), _MockWebhookHandler)
    port = server.server_port
    server_thread = threading.Thread(target=server.handle_request, daemon=True)
    server_thread.start()

    webhook_url = f"http://127.0.0.1:{port}/webhook"
    success = cli.notify_n8n_webhook(
        task="Test-Task",
        status="ESCALATED",
        rounds=3,
        escalation_text="# Eskalationstext",
        escalation_file="a2-eskalation.md",
        webhook_url=webhook_url,
    )
    server_thread.join(timeout=2.0)
    server.server_close()

    assert success is True
    assert len(_MockWebhookHandler.received_payloads) == 1
    p = _MockWebhookHandler.received_payloads[0]
    assert p["task"] == "Test-Task"
    assert p["status"] == "ESCALATED"
    assert p["round"] == 3
    assert p["escalation_text"] == "# Eskalationstext"
    assert p["escalation_file"] == "a2-eskalation.md"
    assert "timestamp" in p


def test_notify_n8n_webhook_skipped_when_no_url(monkeypatch):
    monkeypatch.delenv("N8N_WEBHOOK_URL", raising=False)
    assert cli.notify_n8n_webhook("t", "ESCALATED", 1, "text", "file.md") is False


def test_notify_n8n_webhook_graceful_error_handling(capsys):
    # Port 1 is guaranteed unreachable / connection refused
    success = cli.notify_n8n_webhook(
        task="t",
        status="ESCALATED",
        rounds=1,
        escalation_text="text",
        escalation_file="file.md",
        webhook_url="http://127.0.0.1:1/webhook",
        timeout=0.5,
    )
    assert success is False
    err = capsys.readouterr().err
    assert "[WARN] n8n-Webhook fehlgeschlagen" in err


def test_notify_n8n_webhook_truncates_extremely_long_text():
    _MockWebhookHandler.received_payloads = []
    server = HTTPServer(("127.0.0.1", 0), _MockWebhookHandler)
    port = server.server_port
    server_thread = threading.Thread(target=server.handle_request, daemon=True)
    server_thread.start()

    long_text = "A" * 5000
    success = cli.notify_n8n_webhook(
        task="Task",
        status="ESCALATED",
        rounds=1,
        escalation_text=long_text,
        escalation_file="f.md",
        webhook_url=f"http://127.0.0.1:{port}/webhook",
    )
    server_thread.join(timeout=2.0)
    server.server_close()

    assert success is True
    payload = _MockWebhookHandler.received_payloads[0]
    assert len(payload["escalation_text"]) < 4096
    assert "gekürzt" in payload["escalation_text"]


def test_cli_main_escalation_triggers_webhook(tmp_path):
    _MockWebhookHandler.received_payloads = []
    server = HTTPServer(("127.0.0.1", 0), _MockWebhookHandler)
    port = server.server_port
    server_thread = threading.Thread(target=server.handle_request, daemon=True)
    server_thread.start()

    os.environ["A2_MOCK_STATE_DIR"] = str(tmp_path)
    os.environ["A2_MOCK_REVIEWER_SCENARIO"] = "revise"
    out_file = tmp_path / "escalation.md"
    try:
        rc = cli.main([
            "--task", "Test-Webhooks",
            "--worker-cmd", str(MOCKS_DIR / "mock_worker.sh"),
            "--reviewer-cmd", str(MOCKS_DIR / "mock_reviewer.sh"),
            "--max-rounds", "1",
            "--escalation-out", str(out_file),
            "--webhook-url", f"http://127.0.0.1:{port}/webhook",
        ])
    finally:
        for k in ("A2_MOCK_STATE_DIR", "A2_MOCK_REVIEWER_SCENARIO"):
            os.environ.pop(k, None)
        server_thread.join(timeout=2.0)
        server.server_close()

    assert rc == 2
    assert len(_MockWebhookHandler.received_payloads) == 1
    assert _MockWebhookHandler.received_payloads[0]["task"] == "Test-Webhooks"


def test_cli_resume_escalation_triggers_webhook(tmp_path):
    _MockWebhookHandler.received_payloads = []
    server = HTTPServer(("127.0.0.1", 0), _MockWebhookHandler)
    port = server.server_port
    server_thread = threading.Thread(target=server.handle_request, daemon=True)
    server_thread.start()

    state_path = _write_state(tmp_path)
    os.environ["A2_MOCK_STATE_DIR"] = str(tmp_path)
    os.environ["A2_MOCK_REVIEWER_SCENARIO"] = "revise"
    try:
        rc = cli.main([
            "--reviewer-cmd", str(MOCKS_DIR / "mock_reviewer.sh"),
            "--resume", str(state_path),
            "--to-reviewer",
            "--webhook-url", f"http://127.0.0.1:{port}/webhook",
        ])
    finally:
        for k in ("A2_MOCK_STATE_DIR", "A2_MOCK_REVIEWER_SCENARIO"):
            os.environ.pop(k, None)
        server_thread.join(timeout=2.0)
        server.server_close()

    assert rc == 2
    assert len(_MockWebhookHandler.received_payloads) == 1
    assert _MockWebhookHandler.received_payloads[0]["status"] == "ESCALATED_RESUME"


# --- append_run_log (Strukturiertes Run-Log, ADR 2) --------------------------
# es prüft, dass:
#   1. ein erfolgreicher Lauf (APPROVED) einen vollständigen JSONL-Eintrag mit allen Pflichtfeldern erzeugt.
#   2. eine Eskalation (ESCALATED) die Runden, Findings und status korrekt festhält.
#   3. ein Orchestrator-Fehler (ERROR) geloggt wird mit der entsprechenden Fehlermeldung.
#   4. der Resume-Pfad bei Erfolg und bei fehlerhafter Zustandsdatei ein Run-Log schreibt.

def test_run_log_written_on_approved(tmp_path):
    log_file = tmp_path / "logs" / "run-log.jsonl"
    os.environ["A2_MOCK_STATE_DIR"] = str(tmp_path)
    os.environ["A2_MOCK_REVIEWER_SCENARIO"] = "approve"
    try:
        rc = cli.main([
            "--task", "Task-Log-Approve",
            "--worker-cmd", str(MOCKS_DIR / "mock_worker.sh"),
            "--reviewer-cmd", str(MOCKS_DIR / "mock_reviewer.sh"),
            "--log-file", str(log_file),
        ])
    finally:
        for k in ("A2_MOCK_STATE_DIR", "A2_MOCK_REVIEWER_SCENARIO"):
            os.environ.pop(k, None)

    assert rc == 0
    assert log_file.exists()
    lines = log_file.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 1
    entry = json.loads(lines[0])
    assert entry["task"] == "Task-Log-Approve"
    assert entry["worker_backend"] == "shell"
    assert entry["rounds"] == 1
    assert entry["status"] == "APPROVED"
    assert entry["findings"] == []
    assert entry["error"] is None
    assert "timestamp" in entry
    assert isinstance(entry["duration_seconds"], float)
    assert entry["duration_seconds"] >= 0.0


def test_run_log_written_on_escalated(tmp_path):
    log_file = tmp_path / "logs" / "run-log.jsonl"
    project_dir = tmp_path / "some-project"
    project_dir.mkdir()
    os.environ["A2_MOCK_STATE_DIR"] = str(tmp_path)
    os.environ["A2_MOCK_REVIEWER_SCENARIO"] = "revise"
    try:
        rc = cli.main([
            "--task", "Task-Log-Escalate",
            "--worker-cmd", str(MOCKS_DIR / "mock_worker.sh"),
            "--reviewer-cmd", str(MOCKS_DIR / "mock_reviewer.sh"),
            "--max-rounds", "1",
            "--log-file", str(log_file),
            "--project-dir", str(project_dir),
        ])
    finally:
        for k in ("A2_MOCK_STATE_DIR", "A2_MOCK_REVIEWER_SCENARIO"):
            os.environ.pop(k, None)

    assert rc == 2
    assert log_file.exists()
    lines = log_file.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 1
    entry = json.loads(lines[0])
    assert entry["task"] == "Task-Log-Escalate"
    assert entry["status"] == "ESCALATED"
    assert entry["rounds"] == 1
    assert len(entry["findings"]) > 0
    assert entry["error"] is None
    # Regression (2026-08-19): project_dir fehlte bisher bei ESCALATED-Einträgen,
    # nur APPROVED hatte es — erschwerte die Ground-Truth-Diagnose echter Läufe.
    assert entry["project_dir"] == str(project_dir)


def test_run_log_resume_escalated_records_project_dir(tmp_path):
    log_file = tmp_path / "logs" / "run-log.jsonl"
    project_dir = tmp_path / "some-project"
    project_dir.mkdir()
    state_path = _write_state(tmp_path)
    os.environ["A2_MOCK_STATE_DIR"] = str(tmp_path)
    os.environ["A2_MOCK_REVIEWER_SCENARIO"] = "revise"
    try:
        rc = cli.main([
            "--reviewer-cmd", str(MOCKS_DIR / "mock_reviewer.sh"),
            "--resume", str(state_path), "--to-reviewer",
            "--log-file", str(log_file),
            "--project-dir", str(project_dir),
        ])
    finally:
        for k in ("A2_MOCK_STATE_DIR", "A2_MOCK_REVIEWER_SCENARIO"):
            os.environ.pop(k, None)

    assert rc == 2
    entry = json.loads(log_file.read_text(encoding="utf-8").strip())
    assert entry["status"] == "ESCALATED"
    assert entry["project_dir"] == str(project_dir)


def test_run_log_written_on_simulated_error(tmp_path, monkeypatch):
    log_file = tmp_path / "logs" / "run-log.jsonl"

    def mock_run_loop(*args, **kwargs):
        raise RuntimeError("Simulierter Orchestrator-Crash")

    monkeypatch.setattr(cli, "run_loop", mock_run_loop)

    rc = cli.main([
        "--task", "Task-Log-Error",
        "--worker-cmd", str(MOCKS_DIR / "mock_worker.sh"),
        "--reviewer-cmd", str(MOCKS_DIR / "mock_reviewer.sh"),
        "--log-file", str(log_file),
    ])

    assert rc == 1
    assert log_file.exists()
    lines = log_file.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 1
    entry = json.loads(lines[0])
    assert entry["task"] == "Task-Log-Error"
    assert entry["status"] == "ERROR"
    assert entry["rounds"] == 0
    assert "Simulierter Orchestrator-Crash" in entry["error"]


# --- write_patch_file / gate_apply_result groundwork (ADR 1, 2026-08-19) -----
# es prüft, dass:
#   1. ein APPROVED-Lauf den Diff als .patch-Datei persistiert und den Dateinamen
#      + project_dir korrekt ins Run-Log schreibt.
#   2. ein APPROVED-Resume-Lauf dasselbe tut.
#   3. write_patch_file() bei leerem Diff nichts schreibt und None liefert.

def test_slugify_produces_filesystem_safe_names():
    # Truncated to max_len=40 chars, mid-word cut is fine (cosmetic only —
    # the timestamp prefix in write_patch_file() is what makes names unique).
    assert cli._slugify("Analysiere das Projekt / erstelle UEBERBLICK.md!") == "analysiere-das-projekt-erstelle-ueberbli"
    assert cli._slugify("") == "task"
    assert cli._slugify("   ") == "task"


def test_write_patch_file_writes_and_returns_filename(tmp_path):
    filename = cli.write_patch_file("diff --git a/x b/x\n+y", "Mein Task", patches_dir=tmp_path)
    assert filename is not None
    assert filename.endswith(".patch")
    assert (tmp_path / filename).read_text(encoding="utf-8") == "diff --git a/x b/x\n+y"


def test_write_patch_file_skips_empty_diff(tmp_path):
    assert cli.write_patch_file("", "Mein Task", patches_dir=tmp_path) is None
    assert cli.write_patch_file("   \n  ", "Mein Task", patches_dir=tmp_path) is None
    assert list(tmp_path.glob("*.patch")) == []


def test_run_log_records_patch_file_and_project_dir_on_approved(tmp_path, monkeypatch):
    monkeypatch.setattr(cli, "DEFAULT_PATCHES_DIR", tmp_path / "patches")
    log_file = tmp_path / "logs" / "run-log.jsonl"
    project_dir = tmp_path / "some-project"
    project_dir.mkdir()
    os.environ["A2_MOCK_STATE_DIR"] = str(tmp_path)
    os.environ["A2_MOCK_REVIEWER_SCENARIO"] = "approve"
    try:
        rc = cli.main([
            "--task", "Task-With-Patch",
            "--worker-cmd", str(MOCKS_DIR / "mock_worker.sh"),
            "--reviewer-cmd", str(MOCKS_DIR / "mock_reviewer.sh"),
            "--project-dir", str(project_dir),
            "--log-file", str(log_file),
        ])
    finally:
        for k in ("A2_MOCK_STATE_DIR", "A2_MOCK_REVIEWER_SCENARIO"):
            os.environ.pop(k, None)

    assert rc == 0
    entry = json.loads(log_file.read_text(encoding="utf-8").strip())
    assert entry["patch_file"] is not None
    assert entry["patch_file"].endswith(".patch")
    assert entry["project_dir"] == str(project_dir)
    written = (tmp_path / "patches" / entry["patch_file"]).read_text(encoding="utf-8")
    assert "demo.txt" in written


def test_run_log_records_patch_file_on_resume_approved(tmp_path, monkeypatch):
    monkeypatch.setattr(cli, "DEFAULT_PATCHES_DIR", tmp_path / "patches")
    log_file = tmp_path / "logs" / "run-log.jsonl"
    state_path = _write_state(tmp_path)  # WorkerResult(diff="d", ...) — non-empty
    os.environ["A2_MOCK_STATE_DIR"] = str(tmp_path)
    os.environ["A2_MOCK_REVIEWER_SCENARIO"] = "approve"
    try:
        rc = cli.main([
            "--reviewer-cmd", str(MOCKS_DIR / "mock_reviewer.sh"),
            "--resume", str(state_path), "--to-reviewer",
            "--log-file", str(log_file),
        ])
    finally:
        for k in ("A2_MOCK_STATE_DIR", "A2_MOCK_REVIEWER_SCENARIO"):
            os.environ.pop(k, None)

    assert rc == 0
    entry = json.loads(log_file.read_text(encoding="utf-8").strip())
    assert entry["patch_file"] is not None
    assert (tmp_path / "patches" / entry["patch_file"]).read_text(encoding="utf-8") == "d"


def test_run_log_written_on_resume_error_and_success(tmp_path):
    log_file = tmp_path / "logs" / "run-log.jsonl"

    # 1. Resume missing file -> ERROR
    missing_file = tmp_path / "missing-state.json"
    rc1 = cli.main([
        "--reviewer-cmd", str(MOCKS_DIR / "mock_reviewer.sh"),
        "--resume", str(missing_file),
        "--to-reviewer",
        "--log-file", str(log_file),
    ])
    assert rc1 == 1

    # 2. Resume valid file -> APPROVED
    state_path = _write_state(tmp_path)
    os.environ["A2_MOCK_STATE_DIR"] = str(tmp_path)
    os.environ["A2_MOCK_REVIEWER_SCENARIO"] = "approve"
    try:
        rc2 = cli.main([
            "--reviewer-cmd", str(MOCKS_DIR / "mock_reviewer.sh"),
            "--resume", str(state_path),
            "--to-reviewer",
            "--log-file", str(log_file),
        ])
    finally:
        for k in ("A2_MOCK_STATE_DIR", "A2_MOCK_REVIEWER_SCENARIO"):
            os.environ.pop(k, None)
    assert rc2 == 0

    lines = log_file.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 2
    err_entry = json.loads(lines[0])
    assert err_entry["status"] == "ERROR"
    assert "nicht lesbar" in err_entry["error"]

    ok_entry = json.loads(lines[1])
    assert ok_entry["status"] == "APPROVED"
    assert ok_entry["rounds"] == 1
    assert ok_entry["task"] == "Palindrome-Funktion"


def test_approved_shows_produktberater_empfehlung_when_present(monkeypatch, capsys):
    def mock_run_loop(*args, **kwargs):
        return LoopOutcome(status="APPROVED", rounds=1, memory=[], merge_gate=True,
                            pushed=False, diff="diff --git a/x b/x\n+neu",
                            produktberater_empfehlung=True)

    monkeypatch.setattr(cli, "run_loop", mock_run_loop)

    rc = cli.main([
        "--task", "Neues Feature X",
        "--worker-cmd", str(MOCKS_DIR / "mock_worker.sh"),
        "--reviewer-cmd", str(MOCKS_DIR / "mock_reviewer.sh"),
    ])

    assert rc == 0
    out = capsys.readouterr().out
    assert "[Empfehlung]" in out
    assert "produktberater" in out


def test_approved_stays_silent_without_produktberater_empfehlung(monkeypatch, capsys):
    def mock_run_loop(*args, **kwargs):
        return LoopOutcome(status="APPROVED", rounds=1, memory=[], merge_gate=True,
                            pushed=False, diff="diff --git a/x b/x\n+fix",
                            produktberater_empfehlung=None)

    monkeypatch.setattr(cli, "run_loop", mock_run_loop)

    rc = cli.main([
        "--task", "Bugfix Y",
        "--worker-cmd", str(MOCKS_DIR / "mock_worker.sh"),
        "--reviewer-cmd", str(MOCKS_DIR / "mock_reviewer.sh"),
    ])

    assert rc == 0
    assert "[Empfehlung]" not in capsys.readouterr().out
