"""Gate A2/A3 Plan B — OpenHands Worker Backend & CLI Wiring Tests.

Human-readable list (es prüft, dass …):
  1. `read_env_var` Schlüssel korrekt aus einer .env-Datei ausliest und Platzhalter/fehlende Werte erkennt.
  2. `OpenHandsWorker` bei fehlender oder unvollständiger Konfiguration laut abbricht (RuntimeError).
  3. `OpenHandsWorker` benutzerdefinierte Konstruktor-Argumente gegenüber .env vorzieht.
  4. `OpenHandsWorker.__call__` mit gemocktem DockerWorkspace/Conversation ordnungsgemäß
     Git-Baseline, Agent-Lauf, Commit und Diff ausführt.
  5. `cli.py` mit `--worker-backend openhands` ohne `--worker-cmd` aufgerufen werden kann und den OpenHandsWorker verwendet.
  6. `cli.py` mit `--worker-backend shell` weiterhin zwingend `--worker-cmd` verlangt.
  7. `OpenHandsWorker`s Tar-Filter `.env`-Dateien beim Projekt-Copy-in strikt ausschließt.
  8. `OpenHandsWorker`s Tar-Filter verschachtelte `.claude/worktrees/` beim Projekt-Copy-in
     ausschließt (gleiche Lücke wie run_agy_worker_a2.sh vor PR #57).
  9. `OpenHandsWorker` die AGENTS.md des ZIELPROJEKTS (nicht die Kit-eigene) dem an
     agy gesendeten Prompt voranstellt, wenn project_dir eine hat (2026-08-19).
  10. `OpenHandsWorker` den Diff gegen den gemerkten Baseline-Commit berechnet,
      nicht gegen `HEAD~1` — sonst geht der Diff verloren, wenn der Agent (z. B.
      weil er den globalen Git-Regeln aus der AGENTS.md des Zielprojekts folgt)
      selbst schon auf einem eigenen Branch committet hat, bevor dieser Code
      läuft (2026-08-21, realer Fund gegen cwa-alexandria).
"""

from unittest.mock import MagicMock, patch
import os
from pathlib import Path
import pytest

from adapters import OpenHandsWorker, read_env_var
import cli
from orchestrator import MemoryEntry, WorkerResult


def test_read_env_var_reads_from_env_file(tmp_path):
    env_file = tmp_path / ".env"
    env_file.write_text(
        "# Comment line\n"
        "WORKER_LLM_BASE_URL=https://api.example.com\n"
        "WORKER_LLM_API_KEY=\"secret_key_123\"\n"
        "WORKER_LLM_MODEL='custom-model'\n",
        encoding="utf-8",
    )

    assert read_env_var("WORKER_LLM_BASE_URL", str(env_file)) == "https://api.example.com"
    assert read_env_var("WORKER_LLM_API_KEY", str(env_file)) == "secret_key_123"
    assert read_env_var("WORKER_LLM_MODEL", str(env_file)) == "custom-model"
    assert read_env_var("NON_EXISTENT", str(env_file)) == ""


def test_openhands_worker_config_validation(tmp_path):
    empty_env = tmp_path / ".env"
    empty_env.write_text("", encoding="utf-8")

    worker = OpenHandsWorker(env_file=str(empty_env))
    with pytest.raises(RuntimeError, match="WORKER_LLM_BASE_URL"):
        worker("some task", [])

    # Custom args override missing .env
    valid_worker = OpenHandsWorker(
        base_url="https://api.example.com",
        api_key="key123",
        model="model-x",
        env_file=str(empty_env),
    )
    assert valid_worker.base_url == "https://api.example.com"
    assert valid_worker.api_key == "key123"
    assert valid_worker.model == "model-x"


def test_resolve_openhands_tools_primary_submodule_path():
    mock_file_editor = MagicMock()
    mock_file_editor.FileEditorTool.name = "file_editor"

    mock_terminal = MagicMock()
    mock_terminal.TerminalTool.name = "terminal"

    mock_sdk = MagicMock()
    mock_sdk.Tool = lambda name: f"Tool({name})"

    with patch.dict("sys.modules", {
        "openhands": MagicMock(),
        "openhands.tools": MagicMock(),
        "openhands.tools.file_editor": mock_file_editor,
        "openhands.tools.terminal": mock_terminal,
        "openhands.sdk": mock_sdk,
    }):
        from adapters import _resolve_openhands_tools
        tool_errors = []
        tools = _resolve_openhands_tools(tool_errors)

        assert len(tools) == 2
        assert tools == ["Tool(terminal)", "Tool(file_editor)"]
        assert tool_errors == []


def test_resolve_openhands_tools_records_errors_loudly_when_all_fail():
    with patch.dict("sys.modules", {
        "openhands": None,
        "openhands.tools": None,
        "openhands.tools.file_editor": None,
        "openhands.tools.terminal": None,
        "openhands.sdk": None,
    }):
        from adapters import _resolve_openhands_tools
        tool_errors = []
        tools = _resolve_openhands_tools(tool_errors)

        assert tools == []
        assert len(tool_errors) == 3
        assert "file_editor/terminal" in tool_errors[0]
        assert "openhands.tools" in tool_errors[1]
        assert "openhands.sdk.default_tools" in tool_errors[2]


def test_openhands_worker_call_executes_workspace_and_conversation(tmp_path):
    env_file = tmp_path / ".env"
    env_file.write_text(
        "WORKER_LLM_BASE_URL=https://api.example.com\n"
        "WORKER_LLM_API_KEY=key123\n"
        "WORKER_LLM_MODEL=model-x\n",
        encoding="utf-8",
    )

    mock_workspace_instance = MagicMock()

    def fake_execute_command(cmd):
        res = MagicMock()
        res.exit_code = 0
        if "diff" in cmd:
            res.stdout = "diff --git a/test.py b/test.py\n+print('hello')"
        elif "status" in cmd:
            res.stdout = " M test.py"
        elif "commit" in cmd:
            res.stdout = "[main 123456] worker attempt"
        else:
            res.stdout = "OK"
        return res

    mock_workspace_instance.execute_command.side_effect = fake_execute_command

    mock_workspace_cls = MagicMock()
    mock_workspace_cls.return_value.__enter__.return_value = mock_workspace_instance

    mock_llm = MagicMock()
    mock_agent = MagicMock()
    mock_conversation_instance = MagicMock()
    mock_conversation_cls = MagicMock(return_value=mock_conversation_instance)

    mock_openhands_workspace = MagicMock()
    mock_openhands_workspace.DockerWorkspace = mock_workspace_cls

    mock_openhands_sdk = MagicMock()
    mock_openhands_sdk.LLM.return_value = mock_llm
    mock_openhands_sdk.Agent.return_value = mock_agent
    mock_openhands_sdk.Conversation = mock_conversation_cls

    mock_file_editor = MagicMock()
    mock_file_editor.FileEditorTool.name = "file_editor"
    mock_terminal = MagicMock()
    mock_terminal.TerminalTool.name = "terminal"

    with patch.dict("sys.modules", {
        "openhands": MagicMock(),
        "openhands.workspace": mock_openhands_workspace,
        "openhands.sdk": mock_openhands_sdk,
        "openhands.tools": MagicMock(),
        "openhands.tools.file_editor": mock_file_editor,
        "openhands.tools.terminal": mock_terminal,
    }):
        worker = OpenHandsWorker(env_file=str(env_file))
        memory = [MemoryEntry(round=1, kind="findings", detail="Fix typo")]
        result = worker("Schreibe Test", memory)

        assert isinstance(result, WorkerResult)
        assert result.committed is True
        assert result.tests_passed is True
        assert "print('hello')" in result.diff
        assert "OpenHands Run Summary" in result.testlog
        mock_conversation_instance.send_message.assert_called_once()
        mock_conversation_instance.run.assert_called_once()


def test_openhands_worker_diffs_against_baseline_not_head_minus_1(tmp_path):
    # Reproduces the real 2026-08-21 finding against cwa-alexandria: the agent
    # follows the target project's own "own branch per feature" git rule and
    # commits there itself, so by the time this code runs, `git status --short`
    # is already clean (has_changes=False, no wrapper commit made) — yet real
    # work happened. `git diff HEAD~1 HEAD` would see nothing; the fix diffs
    # against the remembered baseline commit hash instead, which is always an
    # ancestor of HEAD regardless of branch switches in between.
    env_file = tmp_path / ".env"
    env_file.write_text(
        "WORKER_LLM_BASE_URL=https://api.example.com\n"
        "WORKER_LLM_API_KEY=key123\n"
        "WORKER_LLM_MODEL=model-x\n",
        encoding="utf-8",
    )

    mock_workspace_instance = MagicMock()

    def fake_execute_command(cmd):
        res = MagicMock()
        res.exit_code = 0
        if "rev-parse" in cmd:
            res.stdout = "baseline0123abc\n"
        elif "diff baseline0123abc HEAD" in cmd:
            res.stdout = "diff --git a/x.py b/x.py\n+print('agent committed on its own branch')"
        elif "diff HEAD~1 HEAD" in cmd:
            # The bug this test guards against: this would be empty even
            # though real work happened, because the agent's own commit sits
            # further back than one commit from HEAD.
            res.stdout = ""
        elif "status" in cmd:
            res.stdout = ""  # clean: the agent already committed its own work
        else:
            res.stdout = "OK"
        return res

    mock_workspace_instance.execute_command.side_effect = fake_execute_command

    mock_workspace_cls = MagicMock()
    mock_workspace_cls.return_value.__enter__.return_value = mock_workspace_instance

    mock_conversation_instance = MagicMock()
    mock_openhands_sdk = MagicMock()
    mock_openhands_sdk.Conversation = MagicMock(return_value=mock_conversation_instance)

    mock_openhands_workspace = MagicMock()
    mock_openhands_workspace.DockerWorkspace = mock_workspace_cls

    with patch.dict("sys.modules", {
        "openhands": MagicMock(),
        "openhands.workspace": mock_openhands_workspace,
        "openhands.sdk": mock_openhands_sdk,
    }):
        worker = OpenHandsWorker(env_file=str(env_file))
        result = worker("Schreibe Test", [])

        assert result.committed is True
        assert result.tests_passed is True
        assert "print('agent committed on its own branch')" in result.diff


def test_openhands_worker_prepends_target_project_agents_md_to_prompt(tmp_path):
    # 2026-08-19, Alex: "was können wir tun, damit Agent und Reviewer sich im
    # Projekt gut zurechtfinden" — the TARGET project's own AGENTS.md (distinct
    # from this kit's worker-rules excerpt) should reach the agent's prompt.
    env_file = tmp_path / ".env"
    env_file.write_text(
        "WORKER_LLM_BASE_URL=https://api.example.com\n"
        "WORKER_LLM_API_KEY=key123\n"
        "WORKER_LLM_MODEL=model-x\n",
        encoding="utf-8",
    )
    proj_dir = tmp_path / "target-project"
    proj_dir.mkdir()
    (proj_dir / "AGENTS.md").write_text("Projekt-Konvention: nutze snake_case.", encoding="utf-8")

    mock_workspace_instance = MagicMock()

    def fake_execute_command(cmd):
        res = MagicMock()
        res.exit_code = 0
        res.stdout = ""
        return res

    mock_workspace_instance.execute_command.side_effect = fake_execute_command

    mock_workspace_cls = MagicMock()
    mock_workspace_cls.return_value.__enter__.return_value = mock_workspace_instance

    mock_conversation_instance = MagicMock()
    mock_openhands_sdk = MagicMock()
    mock_openhands_sdk.Conversation = MagicMock(return_value=mock_conversation_instance)

    mock_openhands_workspace = MagicMock()
    mock_openhands_workspace.DockerWorkspace = mock_workspace_cls

    with patch.dict("sys.modules", {
        "openhands": MagicMock(),
        "openhands.workspace": mock_openhands_workspace,
        "openhands.sdk": mock_openhands_sdk,
    }):
        worker = OpenHandsWorker(env_file=str(env_file), project_dir=str(proj_dir))
        worker("Schreibe Test", [])

        sent_prompt = mock_conversation_instance.send_message.call_args[0][0]
        assert "PROJEKT-KONTEXT (AGENTS.md)" in sent_prompt
        assert "Projekt-Konvention: nutze snake_case." in sent_prompt
        assert sent_prompt.index("PROJEKT-KONTEXT") < sent_prompt.index("Schreibe Test")


def test_openhands_worker_no_changes_in_write_mode_is_not_passed(tmp_path):
    env_file = tmp_path / ".env"
    env_file.write_text(
        "WORKER_LLM_BASE_URL=https://api.example.com\n"
        "WORKER_LLM_API_KEY=key123\n"
        "WORKER_LLM_MODEL=model-x\n",
        encoding="utf-8",
    )

    mock_workspace_instance = MagicMock()

    def fake_execute_command(cmd):
        res = MagicMock()
        res.exit_code = 0
        res.stdout = ""  # No status changes
        return res

    mock_workspace_instance.execute_command.side_effect = fake_execute_command

    mock_workspace_cls = MagicMock()
    mock_workspace_cls.return_value.__enter__.return_value = mock_workspace_instance

    mock_openhands_workspace = MagicMock()
    mock_openhands_workspace.DockerWorkspace = mock_workspace_cls

    mock_openhands_sdk = MagicMock()

    with patch.dict("sys.modules", {
        "openhands": MagicMock(),
        "openhands.workspace": mock_openhands_workspace,
        "openhands.sdk": mock_openhands_sdk,
    }):
        worker = OpenHandsWorker(env_file=str(env_file))
        result = worker("Schreibe Test", [])

        # In write mode (default A2_ALLOW_WRITE != "0"), no changes = committed False & tests_passed False
        assert result.committed is False
        assert result.tests_passed is False
        assert result.diff == ""


def test_cli_worker_backend_openhands_wiring(tmp_path):
    mock_worker_result = WorkerResult(
        diff="diff --git a/x.py b/x.py",
        testlog="",
        committed=True,
        tests_passed=True,
    )

    with patch("cli.OpenHandsWorker") as mock_openhands_cls, \
         patch("cli.ShellReviewer") as mock_reviewer_cls:

        mock_worker_inst = MagicMock()
        mock_worker_inst.return_value = mock_worker_result
        mock_openhands_cls.return_value = mock_worker_inst

        mock_reviewer_inst = MagicMock()
        mock_reviewer_inst.return_value = "VERDICT: APPROVE"
        mock_reviewer_cls.return_value = mock_reviewer_inst

        rc = cli.main([
            "--task", "OpenHands Task",
            "--worker-backend", "openhands",
            "--reviewer-cmd", "mocks/mock_reviewer.sh",
        ])

        assert rc == 0
        mock_openhands_cls.assert_called_once()


def test_cli_worker_backend_shell_requires_worker_cmd():
    with pytest.raises(SystemExit):
        cli.main([
            "--task", "Shell Task",
            "--worker-backend", "shell",
            "--reviewer-cmd", "mocks/mock_reviewer.sh",
        ])


def test_openhands_worker_copy_in_and_in_container_test(tmp_path):
    env_file = tmp_path / ".env"
    env_file.write_text(
        "WORKER_LLM_BASE_URL=https://api.example.com\n"
        "WORKER_LLM_API_KEY=key123\n"
        "WORKER_LLM_MODEL=model-x\n",
        encoding="utf-8",
    )
    proj_dir = tmp_path / "my_project"
    proj_dir.mkdir()
    (proj_dir / "app.py").write_text("print('hello')", encoding="utf-8")

    executed_cmds = []
    mock_workspace_instance = MagicMock()

    def fake_execute_command(cmd):
        executed_cmds.append(cmd)
        res = MagicMock()
        res.exit_code = 0
        if "pytest" in cmd:
            res.stdout = "pytest: 2 passed"
        elif "diff" in cmd:
            res.stdout = "diff --git a/app.py b/app.py\n+print('fixed')"
        elif "status" in cmd:
            res.stdout = " M app.py"
        else:
            res.stdout = "OK"
        return res

    mock_workspace_instance.execute_command.side_effect = fake_execute_command

    mock_workspace_cls = MagicMock()
    mock_workspace_cls.return_value.__enter__.return_value = mock_workspace_instance

    mock_openhands_workspace = MagicMock()
    mock_openhands_workspace.DockerWorkspace = mock_workspace_cls
    mock_openhands_sdk = MagicMock()

    with patch.dict("sys.modules", {
        "openhands": MagicMock(),
        "openhands.workspace": mock_openhands_workspace,
        "openhands.sdk": mock_openhands_sdk,
    }):
        worker = OpenHandsWorker(
            env_file=str(env_file),
            project_dir=str(proj_dir),
            test_cmd="pytest test_app.py",
        )
        result = worker("Fix app", [])

        assert result.committed is True
        assert result.tests_passed is True
        assert "pytest: 2 passed" in result.testlog

        # Verify exact chunking, extraction, and in-container test commands were issued to workspace
        cmd_text = "\n".join(executed_cmds)
        assert "cat << 'EOF' >> /tmp/proj.tar.gz.b64" in cmd_text
        assert "tar -xz -f /tmp/proj.tar.gz -C /workspace" in cmd_text
        assert "pytest test_app.py" in cmd_text


def test_openhands_worker_excludes_dotenv_files(tmp_path):
    """Verify that .env and .env.* files are strictly excluded from the project tarball."""
    import base64, io, tarfile

    env_file = tmp_path / "global.env"
    env_file.write_text(
        "WORKER_LLM_BASE_URL=https://api.example.com\n"
        "WORKER_LLM_API_KEY=key123\n"
        "WORKER_LLM_MODEL=model-x\n",
        encoding="utf-8",
    )

    proj_dir = tmp_path / "secret_project"
    proj_dir.mkdir()
    (proj_dir / "app.py").write_text("print('hello')", encoding="utf-8")
    (proj_dir / ".env").write_text("SECRET_KEY=super_secret_1", encoding="utf-8")
    (proj_dir / ".env.local").write_text("SECRET_KEY=super_secret_2", encoding="utf-8")
    sub_dir = proj_dir / "config"
    sub_dir.mkdir()
    (sub_dir / "setting.json").write_text("{}", encoding="utf-8")
    (sub_dir / ".env.prod").write_text("SECRET_KEY=super_secret_3", encoding="utf-8")

    executed_cmds = []
    mock_workspace_instance = MagicMock()

    def fake_execute_command(cmd):
        executed_cmds.append(cmd)
        res = MagicMock()
        res.exit_code = 0
        res.stdout = "OK"
        return res

    mock_workspace_instance.execute_command.side_effect = fake_execute_command

    mock_workspace_cls = MagicMock()
    mock_workspace_cls.return_value.__enter__.return_value = mock_workspace_instance
    mock_openhands_workspace = MagicMock()
    mock_openhands_workspace.DockerWorkspace = mock_workspace_cls

    with patch.dict("sys.modules", {
        "openhands": MagicMock(),
        "openhands.workspace": mock_openhands_workspace,
        "openhands.sdk": MagicMock(),
    }):
        worker = OpenHandsWorker(
            env_file=str(env_file),
            project_dir=str(proj_dir),
        )
        worker("Check exclusions", [])

    # Reconstruct the b64 tarball sent to execute_command
    b64_chunks = []
    for cmd in executed_cmds:
        if "cat << 'EOF' >> /tmp/proj.tar.gz.b64" in cmd:
            lines = cmd.splitlines()
            if len(lines) >= 3:
                b64_chunks.append(lines[1])

    b64_combined = "".join(b64_chunks)
    tar_bytes = base64.b64decode(b64_combined)

    buf = io.BytesIO(tar_bytes)
    with tarfile.open(fileobj=buf, mode="r:gz") as tar:
        names = tar.getnames()

    # Assert secrets are strictly excluded
    assert ".env" not in names
    assert ".env.local" not in names
    assert "config/.env.prod" not in names
    # Assert regular files ARE included
    assert "app.py" in names
    assert "config/setting.json" in names


def test_openhands_worker_excludes_claude_worktrees(tmp_path):
    """Verify nested .claude/worktrees/ (project's own git worktrees) are excluded.

    Mirrors the fix in run_agy_worker_a2.sh's tar --exclude list (PR #57): without
    this, a project's own nested worktrees get fully copied into the container
    workspace, multiplying its size for no benefit.
    """
    import base64, io, tarfile

    env_file = tmp_path / "global.env"
    env_file.write_text(
        "WORKER_LLM_BASE_URL=https://api.example.com\n"
        "WORKER_LLM_API_KEY=key123\n"
        "WORKER_LLM_MODEL=model-x\n",
        encoding="utf-8",
    )

    proj_dir = tmp_path / "project_with_worktrees"
    proj_dir.mkdir()
    (proj_dir / "app.py").write_text("print('hello')", encoding="utf-8")
    claude_dir = proj_dir / ".claude"
    claude_dir.mkdir()
    (claude_dir / "settings.local.json").write_text("{}", encoding="utf-8")
    worktree_dir = claude_dir / "worktrees" / "fake-worktree-1" / "cps"
    worktree_dir.mkdir(parents=True)
    (worktree_dir / "app.py").write_text("print('nested copy')", encoding="utf-8")

    executed_cmds = []
    mock_workspace_instance = MagicMock()

    def fake_execute_command(cmd):
        executed_cmds.append(cmd)
        res = MagicMock()
        res.exit_code = 0
        res.stdout = "OK"
        return res

    mock_workspace_instance.execute_command.side_effect = fake_execute_command

    mock_workspace_cls = MagicMock()
    mock_workspace_cls.return_value.__enter__.return_value = mock_workspace_instance
    mock_openhands_workspace = MagicMock()
    mock_openhands_workspace.DockerWorkspace = mock_workspace_cls

    with patch.dict("sys.modules", {
        "openhands": MagicMock(),
        "openhands.workspace": mock_openhands_workspace,
        "openhands.sdk": MagicMock(),
    }):
        worker = OpenHandsWorker(
            env_file=str(env_file),
            project_dir=str(proj_dir),
        )
        worker("Check exclusions", [])

    b64_chunks = []
    for cmd in executed_cmds:
        if "cat << 'EOF' >> /tmp/proj.tar.gz.b64" in cmd:
            lines = cmd.splitlines()
            if len(lines) >= 3:
                b64_chunks.append(lines[1])

    b64_combined = "".join(b64_chunks)
    tar_bytes = base64.b64decode(b64_combined)

    buf = io.BytesIO(tar_bytes)
    with tarfile.open(fileobj=buf, mode="r:gz") as tar:
        names = tar.getnames()

    # Nested worktree copy must be fully excluded ...
    assert not any(n.startswith(".claude/worktrees") for n in names)
    # ... while the rest of .claude/ and the real project files stay intact.
    assert "app.py" in names
    assert ".claude/settings.local.json" in names
