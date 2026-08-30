"""End-to-End Real-Code Validation Tests for Gate A2/A3.

Verifies that Gate A2/A3 orchestrator runs against real project code,
executing in-container test commands, and feeding diff + testlog to Reviewer A2.
"""

from __future__ import annotations

import os
import shutil
import tempfile
from pathlib import Path

import pytest

from adapters import (
    SelfCorrectingWorker,
    ShellReviewer,
    ShellWorker,
    _compose_test_log,
    parse_worker_envelope,
)
from orchestrator import (
    MemoryEntry,
    ReviewerFn,
    WorkerResult,
    default_validate,
    run_loop,
)

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "sample_project"


def test_sample_project_fixture_exists():
    """Verify that sample_project fixture exists with calculator.py and test_calculator.py."""
    assert FIXTURE_DIR.exists()
    assert (FIXTURE_DIR / "calculator.py").exists()
    assert (FIXTURE_DIR / "test_calculator.py").exists()


def test_e2e_mock_container_worker_loop(tmp_path: Path):
    """End-to-End proof: Mock container worker copies sample_project, fixes bug, runs pytest in-container."""
    # 1. Copy sample_project fixture into disposable workspace
    ws_dir = tmp_path / "workspace"
    shutil.copytree(FIXTURE_DIR, ws_dir)

    # Verify initial bug in fixture
    import sys
    sys.path.insert(0, str(ws_dir))
    try:
        from calculator import subtract
        assert subtract(5, 3) == 8  # Intentional bug in fixture (5 + 3 = 8)
    finally:
        sys.path.pop(0)

    # 2. Worker mock simulates fixing calculator.py and running in-container pytest
    def mock_container_worker(task: str, memory: list[MemoryEntry]) -> WorkerResult:
        calc_file = ws_dir / "calculator.py"
        calc_file.write_text(
            "def add(a: int, b: int) -> int:\n"
            "    return a + b\n\n\n"
            "def subtract(a: int, b: int) -> int:\n"
            "    return a - b\n"
        )
        # Execute in-container test command simulation
        testlog = _compose_test_log("pytest test_calculator.py", 0, "test_subtract PASSED", "")
        diff = (
            "--- a/calculator.py\n"
            "+++ b/calculator.py\n"
            "@@ -5,2 +5,2 @@\n"
            "-    return a + b\n"
            "+    return a - b\n"
        )
        return WorkerResult(diff=diff, testlog=testlog, committed=True, tests_passed=True)

    # 3. Reviewer mock inspects diff + in-container testlog
    def mock_reviewer(diff: str, testlog: str) -> str:
        assert "subtract" in diff or "a - b" in diff
        assert "PASSED" in testlog
        return "## Review Verdict\nVERDICT: APPROVE"

    # 4. Execute orchestrator loop
    task = "Behebe den Subtraktions-Bug in calculator.py"
    worker = SelfCorrectingWorker(mock_container_worker, validate=default_validate)
    outcome = run_loop(task=task, worker=worker, validate=default_validate, reviewer=mock_reviewer)

    assert outcome.status == "APPROVED"
    assert outcome.merge_gate is True
    assert outcome.pushed is False
    assert outcome.rounds == 1


def test_cli_container_wiring_bypasses_host_validator(monkeypatch, tmp_path: Path):
    """Verify cli.py wiring uses default_validate for container runs without host TestCommandValidator crash."""
    from cli import main

    task = "Fix bug in calculator.py"
    mock_reviewer_script = tmp_path / "mock_reviewer.sh"
    mock_reviewer_script.write_text("#!/bin/sh\necho 'VERDICT: APPROVE'\n")
    mock_reviewer_script.chmod(0o755)

    import base64
    diff_b64 = base64.b64encode(b"+diff").decode("ascii")
    testlog_b64 = base64.b64encode(b"pytest passed").decode("ascii")

    mock_worker_script = tmp_path / "mock_worker.sh"
    mock_worker_script.write_text(
        "#!/bin/sh\n"
        "printf '===A2-COMMITTED===\ntrue\n'\n"
        "printf '===A2-TESTS-PASSED===\ntrue\n'\n"
        f"printf '===A2-DIFF-B64===\n{diff_b64}\n'\n"
        f"printf '===A2-TESTLOG-B64===\n{testlog_b64}\n'\n"
        "printf '===A2-END===\n'\n"
    )
    mock_worker_script.chmod(0o755)

    exit_code = main([
        "--task", task,
        "--worker-backend", "shell",
        "--worker-cmd", str(mock_worker_script),
        "--reviewer-cmd", str(mock_reviewer_script),
        "--project-dir", str(FIXTURE_DIR),
        "--test-cmd", "pytest test_calculator.py",
        "--in-container-test",
    ])

    assert exit_code == 0


def test_cli_project_dir_copy_in_without_in_container_test_flag(monkeypatch, tmp_path: Path):
    """Regression test: --project-dir must set A2_PROJECT_DIR for the shell/agy
    worker even WITHOUT --in-container-test. An MCP caller (Open WebUI) has no
    way to know it needs that second flag — it only passes task + project_dir,
    exactly as documented. Bug found via a real E2E run against cwa-alexandria:
    the worker container silently got an empty workspace because A2_PROJECT_DIR
    was never set, and the worker fabricated a result instead of failing loudly.
    """
    from cli import main

    monkeypatch.delenv("A2_PROJECT_DIR", raising=False)

    task = "Analysiere das Projekt"
    mock_reviewer_script = tmp_path / "mock_reviewer.sh"
    mock_reviewer_script.write_text("#!/bin/sh\necho 'VERDICT: APPROVE'\n")
    mock_reviewer_script.chmod(0o755)

    import base64
    diff_b64 = base64.b64encode(b"+diff").decode("ascii")
    testlog_b64 = base64.b64encode(b"ok").decode("ascii")

    mock_worker_script = tmp_path / "mock_worker.sh"
    mock_worker_script.write_text(
        "#!/bin/sh\n"
        f"echo \"A2_PROJECT_DIR_SEEN=${{A2_PROJECT_DIR:-UNSET}}\" >> {tmp_path}/worker_env.log\n"
        "printf '===A2-COMMITTED===\ntrue\n'\n"
        "printf '===A2-TESTS-PASSED===\ntrue\n'\n"
        f"printf '===A2-DIFF-B64===\n{diff_b64}\n'\n"
        f"printf '===A2-TESTLOG-B64===\n{testlog_b64}\n'\n"
        "printf '===A2-END===\n'\n"
    )
    mock_worker_script.chmod(0o755)

    exit_code = main([
        "--task", task,
        "--worker-backend", "shell",
        "--worker-cmd", str(mock_worker_script),
        "--reviewer-cmd", str(mock_reviewer_script),
        "--project-dir", str(FIXTURE_DIR),
        # Deliberately NOT passing --in-container-test, matching how the MCP
        # tool / Open WebUI actually calls gate_run_task.
    ])

    assert exit_code == 0
    worker_env_log = (tmp_path / "worker_env.log").read_text(encoding="utf-8")
    assert f"A2_PROJECT_DIR_SEEN={FIXTURE_DIR}" in worker_env_log


def test_openhands_worker_real_code_flow_with_workspace_mock(tmp_path: Path):
    """End-to-End proof of OpenHandsWorker code path: Tarball chunking, in-container pytest, envelope generation."""
    from unittest.mock import MagicMock, patch
    from adapters import OpenHandsWorker

    env_file = tmp_path / ".env"
    env_file.write_text(
        "WORKER_LLM_BASE_URL=https://api.example.com\n"
        "WORKER_LLM_API_KEY=key123\n"
        "WORKER_LLM_MODEL=model-x\n",
        encoding="utf-8",
    )

    executed_cmds = []
    mock_workspace_instance = MagicMock()

    def fake_execute_command(cmd):
        executed_cmds.append(cmd)
        res = MagicMock()
        res.exit_code = 0
        if "pytest" in cmd:
            res.stdout = "test_calculator.py PASSED [100%]"
        elif "diff" in cmd:
            res.stdout = "diff --git a/calculator.py b/calculator.py\n-return a + b\n+return a - b"
        elif "status" in cmd:
            res.stdout = " M calculator.py"
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
            project_dir=str(FIXTURE_DIR),
            test_cmd="pytest test_calculator.py",
        )
        result = worker("Fix subtract in calculator.py", [])

        assert result.committed is True
        assert result.tests_passed is True
        assert "PASSED" in result.testlog
        assert "return a - b" in result.diff

        cmd_summary = "\n".join(executed_cmds)
        assert "cat << 'EOF' >> /tmp/proj.tar.gz.b64" in cmd_summary
        assert "pytest test_calculator.py" in cmd_summary
