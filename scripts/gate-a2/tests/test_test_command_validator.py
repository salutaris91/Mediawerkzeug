"""Gate A3 — the independent, authoritative test command (--test-cmd).

Replaces the weak "did the worker say tests passed" proxy with a real command
whose exit code is the single source of truth (Council decision — Fakten schlagen
Meinung).

Human-readable list (es prüft, dass …):
  1. exit 0            -> passed=True, und der Log nennt Befehl + Exit-Code.
  2. exit != 0         -> passed=False (normales Rot), KEINE Exception; stderr im Log.
  3. autoritativ ROT   -> Envelope sagt tests_passed=true, aber --test-cmd fällt:
                          Loop wertet die Runde als rot und ruft den Reviewer NICHT.
  4. autoritativ GRÜN  -> Envelope sagt false, aber --test-cmd grün: Runde gilt grün,
                          Reviewer läuft. (Beweist: der Test zählt, nicht der Proxy.)
  5. Runner nicht auffindbar (exit 127) -> lauter RuntimeError (Umgebungsfehler).
  6. Timeout           -> lauter RuntimeError, kein stilles Schlucken.
  7. ohne --test-cmd bleibt default_validate der Fallback (tests_passed durchgereicht).
"""

import pytest

from adapters import TestCommandValidator
from orchestrator import WorkerResult, default_validate, run_loop


# --- Minimal-Fakes (nur was diese Datei braucht) -----------------------------

class FakeWorker:
    def __init__(self, results):
        self._results = list(results)
        self.calls = []

    def __call__(self, task, memory):
        self.calls.append((task, list(memory)))
        idx = min(len(self.calls) - 1, len(self._results) - 1)
        return self._results[idx]


class FakeReviewer:
    def __init__(self, verdicts):
        self._verdicts = list(verdicts)
        self.calls = []

    def __call__(self, diff, testlog):
        self.calls.append((diff, testlog))
        idx = min(len(self.calls) - 1, len(self._verdicts) - 1)
        return self._verdicts[idx]


def green():
    return WorkerResult(diff="d", testlog="ok", committed=True, tests_passed=True)


def red():
    return WorkerResult(diff="d", testlog="boom", committed=True, tests_passed=False)


# --- 1/2: der Validator selbst ----------------------------------------------

def test_exit_zero_is_passed():
    out = TestCommandValidator("exit 0")(green())
    assert out.passed is True
    assert "exit 0" in out.log


def test_nonzero_exit_is_failed_not_error():
    # A failing test is normal red — it must NOT raise.
    out = TestCommandValidator("echo boom >&2; exit 3")(green())
    assert out.passed is False
    assert "exit 3" in out.log
    assert "boom" in out.log


def test_cwd_is_honoured(tmp_path):
    (tmp_path / "marker").write_text("x", encoding="utf-8")
    ok = TestCommandValidator("test -f marker", cwd=str(tmp_path))(green())
    assert ok.passed is True
    missing = TestCommandValidator("test -f marker")(green())  # different cwd
    assert missing.passed is False


# --- 3: authoritative red overrides a green envelope -------------------------

def test_independent_red_overrides_green_envelope_and_skips_reviewer():
    # Worker claims tests_passed=True, but the real command fails.
    worker = FakeWorker([green()])
    validate = TestCommandValidator("exit 1")
    reviewer = FakeReviewer(["VERDICT: APPROVE"])
    outcome = run_loop("t", worker, validate, reviewer, max_rounds=2)
    # The loop trusted the independent red, not the envelope — reviewer never ran.
    # (ADR B1, Paket 1: a red validation escalates immediately, run_loop does
    # not retry — that retry now belongs exclusively to the inner worker/wrapper.)
    assert reviewer.calls == []
    assert len(worker.calls) == 1
    assert outcome.status == "ESCALATED_SELF_CHECK_FAILED"


# --- 4: authoritative green overrides a red envelope -------------------------

def test_independent_green_overrides_red_envelope_and_runs_reviewer():
    # Envelope says tests_passed=False, but the real command passes.
    worker = FakeWorker([red()])
    validate = TestCommandValidator("exit 0")
    reviewer = FakeReviewer(["VERDICT: APPROVE"])
    outcome = run_loop("t", worker, validate, reviewer, max_rounds=1)
    assert len(reviewer.calls) == 1          # green -> reviewer was asked
    assert outcome.status == "APPROVED"


# --- 5: runner not found is an environment error, not red --------------------

def test_command_not_found_raises_loudly():
    validate = TestCommandValidator("definitely_not_a_real_binary_xyz --run")
    with pytest.raises(RuntimeError, match="nicht gefunden|127"):
        validate(green())


# --- 6: timeout is loud, not swallowed ---------------------------------------

def test_timeout_raises_loudly():
    validate = TestCommandValidator("sleep 5", timeout=1)
    with pytest.raises(RuntimeError, match="Timeout"):
        validate(green())


# --- 7: without a test command, the fallback proxy still works ----------------

def test_default_validate_is_the_fallback():
    assert default_validate(green()).passed is True
    assert default_validate(red()).passed is False
