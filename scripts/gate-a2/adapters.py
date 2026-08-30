#!/usr/bin/env python3
"""Adapters — the ONLY layer that talks to external commands (subprocess).

Contract between the orchestrator and a worker/reviewer command, so the exact
same adapters drive the real Docker/agy runner AND the shell mocks.

Worker command:
    invoked as:  <worker_cmd> "<task>"
    round memory passed via env A2_MEMORY (JSON list of {round, kind, detail})
    stdout must be an envelope. DIFF and TESTLOG are base64 (single line) so
    their content can never collide with the marker literals — a real diff may
    itself contain "===A2-...===" strings:

        ===A2-COMMITTED===
        true|false
        ===A2-TESTS-PASSED===
        true|false
        ===A2-DIFF-B64===
        <base64 of the diff>
        ===A2-TESTLOG-B64===
        <base64 of the test/lint log>
        ===A2-END===

Reviewer command:
    invoked as:  <reviewer_cmd> -p "<prompt with diff + testlog>"
    stdout must contain a line  VERDICT: APPROVE  or  VERDICT: REVISE
"""

from __future__ import annotations

import base64
import binascii
import json
import os
import subprocess
from typing import Optional

from orchestrator import InnerAttempt, MemoryEntry, ValidateFn, Validation, WorkerFn, WorkerResult

_TIMEOUT_S = 600  # generous: the real worker runs agy in a container
_TEST_TIMEOUT_S = 300  # a test/lint command should be far quicker than an agy run
_EXIT_COMMAND_NOT_FOUND = 127  # shell convention: the command itself was not found


def _run(cmd: list[str], env: Optional[dict] = None, timeout: int = _TIMEOUT_S) -> str:
    """Run an external command, surface failures loudly (no silent errors)."""
    try:
        proc = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout, env=env,
        )
    except FileNotFoundError as exc:
        raise RuntimeError(f"Kommando nicht gefunden: {cmd[0]} ({exc})") from exc
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"Kommando lief in Timeout ({timeout}s): {' '.join(cmd)}") from exc
    if proc.returncode != 0:
        raise RuntimeError(
            f"Kommando fehlgeschlagen (exit {proc.returncode}): {' '.join(cmd)}\n"
            f"--- stderr ---\n{proc.stderr}"
        )
    return proc.stdout


def _section(text: str, start: str, end: str) -> str:
    """Extract the block strictly between two markers."""
    s = text.find(start)
    if s == -1:
        raise ValueError(f"Worker-Ausgabe: Marker {start} fehlt.")
    s += len(start)
    e = text.find(end, s)
    if e == -1:
        raise ValueError(f"Worker-Ausgabe: Marker {end} fehlt.")
    return text[s:e].strip("\n")


def _decode_b64(blob: str) -> str:
    """Decode a base64 envelope section back to text (empty stays empty)."""
    blob = blob.strip()
    if not blob:
        return ""
    try:
        return base64.b64decode(blob, validate=True).decode("utf-8", errors="replace")
    except (binascii.Error, ValueError) as exc:
        raise ValueError(f"Worker-Ausgabe: base64-Sektion nicht dekodierbar ({exc}).") from exc


def parse_worker_envelope(stdout: str) -> WorkerResult:
    committed = _section(stdout, "===A2-COMMITTED===", "===A2-TESTS-PASSED===").strip().lower() == "true"
    tests_passed = _section(stdout, "===A2-TESTS-PASSED===", "===A2-DIFF-B64===").strip().lower() == "true"
    diff = _decode_b64(_section(stdout, "===A2-DIFF-B64===", "===A2-TESTLOG-B64==="))
    testlog = _decode_b64(_section(stdout, "===A2-TESTLOG-B64===", "===A2-END==="))
    return WorkerResult(diff=diff, testlog=testlog, committed=committed, tests_passed=tests_passed)


class ShellWorker:
    """Runs a worker command that fulfils the envelope contract above."""

    def __init__(self, cmd_path: str):
        self.cmd_path = cmd_path

    def __call__(self, task: str, memory: list[MemoryEntry]) -> WorkerResult:
        env = dict(os.environ)
        env["A2_MEMORY"] = json.dumps(
            [{"round": e.round, "kind": e.kind, "detail": e.detail} for e in memory]
        )
        stdout = _run([self.cmd_path, task], env=env)
        return parse_worker_envelope(stdout)


def read_env_var(key: str, env_path: str = ".env") -> str:
    """Read a single key from a .env file (or os.environ).

    Returns empty string if file missing or key not present.
    """
    if os.getenv(key):
        return os.environ[key]

    if not os.path.exists(env_path):
        return ""

    matches = []
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            if "=" in line:
                k, v = line.split("=", 1)
                if k.strip() == key:
                    val = v.strip().strip("'\"")
                    matches.append(val)

    if len(matches) > 1:
        raise ValueError(f"Mehrfacher Eintrag für {key} in {env_path}")
    return matches[0] if matches else ""


_DEFAULT_OPENHANDS_IMAGE = (
    "ghcr.io/openhands/agent-server:1.36.1-python@sha256:"
    "ee836fa6f75a1d425d6949fd230d94338d0f56a39b02f8c73d536f3a965947fe"
)


def _resolve_openhands_tools(tool_errors: list[str]) -> list:
    """Resolve and instantiate OpenHands tools with explicit error recording.

    Primary path (Official OpenHands SDK spec):
        from openhands.tools.file_editor import FileEditorTool
        from openhands.tools.terminal import TerminalTool
        from openhands.sdk import Tool
        Tool(name=TerminalTool.name), Tool(name=FileEditorTool.name)
    Fallback paths:
        Direct classes or default_tools.
    """
    # Attempt 1: Submodule imports + Tool wrapper (Official OpenHands SDK doc pattern)
    try:
        from openhands.tools.file_editor import FileEditorTool
        from openhands.tools.terminal import TerminalTool
        from openhands.sdk import Tool

        term_name = getattr(TerminalTool, "name", "terminal")
        file_name = getattr(FileEditorTool, "name", "file_editor")
        return [Tool(name=term_name), Tool(name=file_name)]
    except ImportError as exc:
        tool_errors.append(f"Submodul-Import (file_editor/terminal): {exc}")

    # Attempt 2: Direct class instantiation if exported at openhands.tools
    try:
        from openhands.tools import FileEditorTool, TerminalTool
        return [TerminalTool(), FileEditorTool()]
    except ImportError as exc:
        tool_errors.append(f"Direkt-Import (openhands.tools): {exc}")

    # Attempt 3: SDK default_tools export
    try:
        from openhands.sdk import default_tools
        return list(default_tools)
    except ImportError as exc:
        tool_errors.append(f"SDK-Default (openhands.sdk.default_tools): {exc}")

    return []


def _read_project_context(project_dir: Optional[str]) -> str:
    """Read the TARGET project's own AGENTS.md/CLAUDE.md/README.md, if it has
    one — written specifically for AI-agent onboarding, distinct from this
    kit's own worker-safe rules excerpt (see run_agy_worker_a2.sh's
    rules_excerpt). AGENTS.md preferred (already-resolved plain text, no
    @-import syntax to choke on); CLAUDE.md/README.md as fallback. Fails
    safely (empty string) — a missing/unreadable file is never fatal.
    """
    if not project_dir:
        return ""
    for candidate in ("AGENTS.md", "CLAUDE.md", "README.md"):
        path = os.path.join(project_dir, candidate)
        if os.path.isfile(path):
            try:
                with open(path, encoding="utf-8") as f:
                    content = f.read()
            except (OSError, UnicodeDecodeError):
                return ""
            return f"=== PROJEKT-KONTEXT ({candidate}) ===\n{content}\n\n"
    return ""


class OpenHandsWorker:
    """Runs a worker inside an isolated OpenHands DockerWorkspace using OpenHands SDK.

    Fulfills the WorkerFn contract: `(task, memory) -> WorkerResult`.
    LLM parameters come from WORKER_LLM_BASE_URL, WORKER_LLM_API_KEY, WORKER_LLM_MODEL
    in .env or environment variables.
    """

    def __init__(
        self,
        base_url: Optional[str] = None,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        server_image: str = _DEFAULT_OPENHANDS_IMAGE,
        host_port: int = 8099,
        env_file: str = ".env",
        project_dir: Optional[str] = None,
        test_cmd: Optional[str] = None,
    ):
        self.server_image = server_image
        self.host_port = host_port
        self.env_file = env_file
        self.project_dir = project_dir
        self.test_cmd = test_cmd
        self._custom_base_url = base_url
        self._custom_api_key = api_key
        self._custom_model = model

    @property
    def base_url(self) -> str:
        return self._custom_base_url or read_env_var("WORKER_LLM_BASE_URL", self.env_file)

    @property
    def api_key(self) -> str:
        return self._custom_api_key or read_env_var("WORKER_LLM_API_KEY", self.env_file)

    @property
    def model(self) -> str:
        return self._custom_model or read_env_var("WORKER_LLM_MODEL", self.env_file)

    def _validate_config(self) -> None:
        if not self.base_url or self.base_url == "your_worker_llm_base_url_here":
            raise RuntimeError("WORKER_LLM_BASE_URL ist nicht in .env konfiguriert.")
        if not self.api_key or self.api_key == "your_worker_llm_api_key_here":
            raise RuntimeError("WORKER_LLM_API_KEY ist nicht in .env konfiguriert.")
        if not self.model or self.model == "your_worker_llm_model_here":
            raise RuntimeError("WORKER_LLM_MODEL ist nicht in .env konfiguriert.")

    def __call__(self, task: str, memory: list[MemoryEntry]) -> WorkerResult:
        self._validate_config()

        # Lazy imports so adapters.py can be loaded without openhands installed
        try:
            from openhands.workspace import DockerWorkspace
        except ImportError as exc:
            raise RuntimeError(
                "openhands-workspace (oder openhands-sdk) ist nicht installiert. "
                "Führe das Skript mit `uv run --with openhands-sdk==1.36.1 "
                "--with openhands-workspace==1.36.1 ...` aus."
            ) from exc

        try:
            from openhands.sdk import Agent, Conversation, LLM
        except ImportError:
            try:
                from openhands.core.main import create_agent  # type: ignore # noqa: F401
            except ImportError as exc:
                raise RuntimeError(
                    "openhands-sdk konnte Agent/Conversation/LLM nicht importieren."
                ) from exc

        tool_errors: list[str] = []
        tools = _resolve_openhands_tools(tool_errors)

        if not tools:
            import sys
            tool_status = (
                "WARNUNG: Agent läuft OHNE Werkzeuge! Keine OpenHands-Tools ladbar.\n"
                "Import-Fehler:\n" + "\n".join(f"  - {e}" for e in tool_errors)
            )
            print(f"[WARN] {tool_status}", file=sys.stderr)
        else:
            tool_status = f"Geladene Tools ({len(tools)}): {[getattr(t, 'name', str(t)) for t in tools]}"

        import platform as _platform
        machine = _platform.machine()
        plat = "linux/arm64" if machine in ("arm64", "aarch64") else "linux/amd64"

        # Configurable port fallback to avoid collisions
        port_env = read_env_var("WORKER_HOST_PORT", self.env_file)
        actual_host_port = int(port_env) if port_env.isdigit() else self.host_port

        project_context = _read_project_context(self.project_dir)
        prompt = f"{project_context}{task}"
        if memory:
            memory_text = "\n".join(
                f"- [Runde {m.round} - {m.kind}]: {m.detail}" for m in memory
            )
            prompt = (
                f"{project_context}{task}\n\n"
                f"=== BISHERIGER VERLAUF (Feedback/Findings aus früheren Versuchen) ===\n"
                f"{memory_text}\n"
                f"Bitte berücksichtige dieses Feedback und korrigiere die genannten Punkte."
            )

        with DockerWorkspace(
            server_image=self.server_image,
            platform=plat,
            host_port=actual_host_port,
        ) as workspace:
            # 1. Project copy-in (if project_dir is provided)
            if self.project_dir and os.path.isdir(self.project_dir):
                import io, tarfile
                buf = io.BytesIO()

                def _tar_filter(tarinfo):
                    base = os.path.basename(tarinfo.name)
                    if (
                        base in (".git", "__pycache__", ".pytest_cache", ".venv")
                        or base == ".env"
                        or base.startswith(".env.")
                    ):
                        return None
                    # Path-based (not just basename) exclude: nested .claude/worktrees/
                    # are the project's OWN git worktrees (see run_agy_worker_a2.sh
                    # tar --exclude fix) and would otherwise multiply the copy-in size.
                    if tarinfo.name == ".claude/worktrees" or tarinfo.name.startswith(".claude/worktrees/"):
                        return None
                    return tarinfo

                with tarfile.open(fileobj=buf, mode="w:gz") as tar:
                    for item in os.listdir(self.project_dir):
                        item_path = os.path.join(self.project_dir, item)
                        tar.add(item_path, arcname=item, filter=_tar_filter)
                b64_tar = base64.b64encode(buf.getvalue()).decode("ascii")
                # Chunk base64 string (32KB chunks) to avoid command-line length limits (ARG_MAX)
                chunk_size = 32768
                workspace.execute_command("rm -f /tmp/proj.tar.gz.b64 /tmp/proj.tar.gz")
                for i in range(0, len(b64_tar), chunk_size):
                    chunk = b64_tar[i:i + chunk_size]
                    workspace.execute_command(f"cat << 'EOF' >> /tmp/proj.tar.gz.b64\n{chunk}\nEOF")
                workspace.execute_command(
                    "base64 -d /tmp/proj.tar.gz.b64 > /tmp/proj.tar.gz && "
                    "tar -xz -f /tmp/proj.tar.gz -C /workspace && "
                    "rm -f /tmp/proj.tar.gz.b64 /tmp/proj.tar.gz"
                )

            # 2. Baseline Git setup in disposable container
            workspace.execute_command("git init")
            workspace.execute_command("git config user.name 'OpenHands Worker'")
            workspace.execute_command("git config user.email 'openhands@localhost'")
            workspace.execute_command("git add -A")
            workspace.execute_command("git commit --allow-empty -m 'baseline'")
            baseline_res = workspace.execute_command("git rev-parse HEAD")
            baseline_hash = (getattr(baseline_res, "stdout", "") or "").strip()

            # 3. Run OpenHands Agent with tools attached
            llm = LLM(model=self.model, api_key=self.api_key, base_url=self.base_url)
            agent = Agent(llm=llm, tools=tools) if tools else Agent(llm=llm)
            conversation = Conversation(agent=agent, workspace=workspace)
            conversation.send_message(prompt)
            conversation.run()

            # 4. Audit changes BEFORE commit to prevent false-positive green runs
            status_before = workspace.execute_command("git status --short")
            status_stdout = getattr(status_before, "stdout", "") or ""
            has_changes = bool(status_stdout.strip())

            if has_changes:
                workspace.execute_command("git add -A")
                workspace.execute_command("git commit -m 'worker attempt'")

            # Diff against baseline_hash, NOT HEAD~1: the agent may follow the
            # target project's own git rules (own branch, own commit) before
            # reaching this point — HEAD~1..HEAD would then be empty even
            # though real work happened further back (same bug class fixed
            # 2026-08-21 in run_agy_worker_a2.sh, verified against a real
            # cwa-alexandria run where agy did exactly this). baseline_hash
            # is always an ancestor of HEAD regardless of branch switches.
            diff_res = workspace.execute_command(f"git diff {baseline_hash} HEAD")
            diff_stdout = getattr(diff_res, "stdout", "") or ""
            diff = diff_stdout if getattr(diff_res, "exit_code", 0) == 0 else ""
            committed = bool(diff.strip())

            # 5. In-container test execution or mode check
            if self.test_cmd:
                test_run = workspace.execute_command(self.test_cmd)
                test_exit = getattr(test_run, "exit_code", -1)
                test_out = getattr(test_run, "stdout", "") or ""
                test_err = getattr(test_run, "stderr", "") or ""
                tests_passed = committed and (test_exit == 0)
                test_log_detail = _compose_test_log(self.test_cmd, test_exit, test_out, test_err)
            else:
                allow_write = os.getenv("A2_ALLOW_WRITE", "1") != "0"
                if allow_write:
                    tests_passed = committed and bool(diff.strip())
                    boundary_info = (
                        "Coding-Task: OpenHands hat Code geschrieben und committet"
                        if tests_passed
                        else "Coding-Task FEHLGESCHLAGEN: Keine Änderungen am Workspace vorgenommen"
                    )
                else:
                    tests_passed = not has_changes
                    boundary_info = (
                        "Berechtigungsgrenze: hielt (Workspace unverändert)"
                        if tests_passed
                        else f"Berechtigungsgrenze VERLETZT: Geänderte Dateien ({status_stdout.strip()})"
                    )
                test_log_detail = f"Modus-Check Details: {boundary_info}"

            testlog = (
                "$ openhands conversation.run()\n"
                "[exit 0]\n"
                "--- OpenHands Run Summary ---\n"
                f"Tool-Status: {tool_status}\n"
                f"Committed: {committed}\n"
                f"Tests Passed: {tests_passed}\n"
                f"In-Container Test Log:\n{test_log_detail}\n"
            )

            return WorkerResult(
                diff=diff,
                testlog=testlog,
                committed=committed,
                tests_passed=tests_passed,
            )




def _compose_test_log(cmd: str, returncode: int, stdout: str, stderr: str) -> str:
    """Human- and machine-readable record of what the test command actually did."""
    return (
        f"$ {cmd}\n"
        f"[exit {returncode}]\n"
        f"--- stdout ---\n{stdout.rstrip(chr(10))}\n"
        f"--- stderr ---\n{stderr.rstrip(chr(10))}\n"
    )


class TestCommandValidator:
    """Runs a configurable test/lint command and returns an AUTHORITATIVE Validation.

    This replaces the "did the worker say tests passed" proxy (default_validate):
    the independent run is the single source of truth (Council decision — Fakten
    schlagen Meinung). The worker envelope's tests_passed is advisory and is
    deliberately ignored here — we do not even look at the WorkerResult.

    Two failure classes, kept strictly apart (no silent failure):
    - exit != 0  -> a NORMAL red test result (passed=False). Back to the worker.
    - the command cannot run at all (not found = exit 127, or timeout)
                 -> RuntimeError. That is an ENVIRONMENT problem, not broken code;
                    swallowing it as "red" would spin the worker against a setup
                    bug forever.

    Security note: test_cmd runs via the shell (so `pytest -q && ruff check` works).
    It MUST come only from trusted CLI configuration (the --test-cmd flag), NEVER
    from worker/LLM output — otherwise the worker could inject host commands.
    """

    # Not a pytest test class despite the "Test" prefix — stop collection.
    __test__ = False

    def __init__(self, test_cmd: str, cwd: Optional[str] = None,
                 timeout: int = _TEST_TIMEOUT_S):
        self.test_cmd = test_cmd
        self.cwd = cwd
        self.timeout = timeout

    def __call__(self, result: WorkerResult) -> Validation:
        try:
            proc = subprocess.run(
                self.test_cmd, shell=True, capture_output=True, text=True,
                timeout=self.timeout, cwd=self.cwd,
            )
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError(
                f"Test-Kommando lief in Timeout ({self.timeout}s): {self.test_cmd}"
            ) from exc
        if proc.returncode == _EXIT_COMMAND_NOT_FOUND:
            raise RuntimeError(
                f"Test-Kommando nicht gefunden (exit 127): {self.test_cmd}\n"
                "Umgebungsproblem (Runner nicht installiert?), kein Code-Fehler.\n"
                f"--- stderr ---\n{proc.stderr}"
            )
        passed = proc.returncode == 0
        log = _compose_test_log(self.test_cmd, proc.returncode, proc.stdout, proc.stderr)
        return Validation(passed=passed, log=log)


class SelfCorrectingWorker:
    """(ADR B2) Wraps a worker so it self-corrects against an independent
    validator BEFORE ever returning to run_loop.

    The clean seam (Council decision): the worker PORT contract stays exactly
    `(task, memory) -> WorkerResult` — run_loop needs no knowledge that
    retries happened here. When the real agy container worker lands, this
    wrapper is swapped for it; run_loop stays unchanged. Inner attempts do
    NOT consume the outer/reviewer round budget (ADR B1) because run_loop
    only ever sees the one, final result.

    Self-correcting against a WEAK proxy validator is pointless (Council
    Decision 1 — Fakten schlagen Meinung): cli.py only constructs this
    wrapper when a real --test-cmd is configured.
    """

    def __init__(self, inner_worker: WorkerFn, validate: ValidateFn, inner_max: int = 3):
        if inner_max < 1:
            raise ValueError(f"inner_max muss mindestens 1 sein, war {inner_max}.")
        self.inner_worker = inner_worker
        self.validate = validate
        self.inner_max = inner_max

    def __call__(self, task: str, memory: list[MemoryEntry]) -> WorkerResult:
        inner_memory = list(memory)
        attempts: list[InnerAttempt] = []
        result: Optional[WorkerResult] = None

        for attempt_no in range(1, self.inner_max + 1):
            result = self.inner_worker(task, inner_memory)

            if not result.committed:
                passed, validation_log = False, "Worker hat keinen Commit erzeugt."
            else:
                validation = self.validate(result)
                passed, validation_log = validation.passed, validation.log

            if passed:
                result.inner_attempts = attempts  # history of what preceded the green one
                return result

            attempts.append(InnerAttempt(attempt=attempt_no, validation_log=validation_log))
            # Feedback for the next inner attempt — round=0 marks it as inner,
            # not an outer-loop round (which starts at 1).
            inner_memory = inner_memory + [
                MemoryEntry(round=0, kind="inner-validation-red", detail=validation_log)
            ]

        # Exhausted: return the LAST (still red) result with the full inner
        # history attached, so run_loop's escalation (ADR B3/B4) can show it.
        result.inner_attempts = attempts
        return result


def _build_review_prompt(
    diff: str, testlog: str, rules_excerpt: str = "", project_context: str = "", task: str = ""
) -> str:
    """Compose the reviewer prompt — pulled out of ShellReviewer so it can be
    unit-tested without a subprocess. `rules_excerpt` is the same curated
    worker-safe rules text the worker prompt gets (build-worker-rules.sh).
    `project_context` is the TARGET project's own AGENTS.md/CLAUDE.md/README.md
    (see _read_project_context) — lets the reviewer judge whether a diff fits
    the project's own conventions, not just whether diff/testlog are internally
    consistent. `task` is the original task description the worker was given —
    without it the reviewer can only judge internal consistency (does the diff
    look clean, do the tests pass), not whether the diff actually does what was
    asked (2026-08-21, closes a gap flagged in the original architecture plan,
    docs/plan-gate-a2-bridge.md: "REVIEWER, der den Plan kennt"). All three
    optional, so omitting them reproduces the original prompt byte-for-byte.
    """
    rules_block = f"=== REGELN (Auszug) ===\n{rules_excerpt}\n\n" if rules_excerpt else ""
    context_block = project_context if project_context else ""
    task_block = f"=== AUFGABE ===\n{task}\n\n" if task else ""
    return (
        "Review-Modus (nur prüfen). Beurteile den folgenden Diff anhand der "
        "Aufgabe, des Testlogs und, falls vorhanden, der Regeln und des "
        "Projekt-Kontexts — prüfe nicht nur, ob der Diff sauber aussieht, "
        "sondern ob er tatsächlich die gestellte Aufgabe löst. "
        "Schließe mit einer eigenen Zeile 'VERDICT: APPROVE' oder 'VERDICT: REVISE' "
        "und liste Findings mit [kritisch]/[wichtig]/[kosmetisch]. "
        "Schließe außerdem mit einer eigenen Zeile 'EMPFEHLUNG: PRODUKTBERATER-CHECK JA' "
        "oder 'EMPFEHLUNG: PRODUKTBERATER-CHECK NEIN' — JA, wenn die Aufgabe ein neues "
        "Feature, eine UI-/Interaktionsänderung oder eine API-Design-Entscheidung "
        "betrifft; NEIN bei Bugfixes mit eindeutigem Repro-Test, internen "
        "Refactorings, Abhängigkeits-Updates oder reinen Dokumentationsänderungen. "
        "Das ist eine reine Einschätzungshilfe für Alex, keine Bedingung für APPROVE/REVISE.\n\n"
        f"{task_block}{rules_block}{context_block}=== DIFF ===\n{diff}\n\n=== TESTLOG ===\n{testlog}\n"
    )


class ShellReviewer:
    """Runs a reviewer command; passes diff + testlog (+ optional curated
    rules excerpt + target-project context + original task) as a single prompt.
    """

    def __init__(self, cmd_path: str, rules_excerpt: str = "", project_dir: Optional[str] = None,
                 task: str = ""):
        self.cmd_path = cmd_path
        self.rules_excerpt = rules_excerpt
        self.project_context = _read_project_context(project_dir)
        self.task = task

    def __call__(self, diff: str, testlog: str) -> str:
        prompt = _build_review_prompt(diff, testlog, self.rules_excerpt, self.project_context, self.task)
        return _run([self.cmd_path, "-p", prompt])
