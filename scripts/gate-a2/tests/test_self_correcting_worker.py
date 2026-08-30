"""Gate A3 Paket 1 — SelfCorrectingWorker (ADR B2) + Resume-Zustand (ADR B4).

Human-readable list (es prüft, dass …):
  1. ein sofort grüner Versuch ohne Umweg zurückgegeben wird, keine Historie.
  2. rot->grün: der Wrapper macht 2 innere Versuche, gibt den grünen zurück,
     die Historie enthält genau den einen roten Versuch davor.
  3. innere Versuche das Feedback des vorherigen Versuchs im Memory sehen.
  4. bei komplett erschöpftem inner_max der letzte (rote) Versuch mit voller
     Historie zurückkommt.
  5. run_loop mit einem beim ersten Versuch grünen Wrapper ganz normal zum
     Reviewer durchläuft (rounds == 1, EIN Reviewer-Aufruf).
  6. run_loop mit innerlich erschöpftem Wrapper sofort eskaliert
     (ESCALATED_SELF_CHECK_FAILED), der Reviewer NIE gerufen wird, und
     outcome.resumable Aufgabe + Versuchszahl korrekt trägt.
  7. rot->grün über die echten Shell-Mocks INNERHALB EINER äußeren Runde
     konvergiert (rounds == 1) — der Beweis, dass innere Versuche kein
     Reviewer-Budget verbrauchen (ADR B1).
  8. bei komplett rot über die Shell-Mocks eskaliert wird, resumable die
     korrekte Versuchszahl trägt.
  9. resumable_state_to_json / _from_json ein inhaltlich identisches
     ResumableState liefern (Round-Trip).
  10. inner_max < 1 sofort einen klaren ValueError wirft (Review-Fund: sonst
      bleibt `result` None und ein späterer Attributzugriff crasht kryptisch).
"""

import os
from pathlib import Path

import pytest

from adapters import ShellReviewer, ShellWorker, SelfCorrectingWorker
from orchestrator import (
    MemoryEntry,
    ResumableState,
    WorkerResult,
    default_validate,
    resumable_state_from_json,
    resumable_state_to_json,
    run_loop,
)

MOCKS_DIR = Path(__file__).resolve().parent.parent / "mocks"


class FakeInnerWorker:
    """Yields a preset WorkerResult per inner attempt; records the memory it saw."""

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


def green(log="ok"):
    return WorkerResult(diff="d", testlog=log, committed=True, tests_passed=True)


def red(log="boom"):
    return WorkerResult(diff="d", testlog=log, committed=True, tests_passed=False)


# --- 1/2/3/4: the wrapper's own inner-loop logic (pure fakes) ---------------

def test_immediate_green_has_no_inner_history():
    inner = FakeInnerWorker([green()])
    wrapper = SelfCorrectingWorker(inner, default_validate, inner_max=3)
    result = wrapper("t", [])
    assert result.tests_passed is True
    assert result.inner_attempts == []
    assert len(inner.calls) == 1


def test_red_then_green_converges_inside_wrapper_with_one_attempt_in_history():
    inner = FakeInnerWorker([red("first fail"), green()])
    wrapper = SelfCorrectingWorker(inner, default_validate, inner_max=3)
    result = wrapper("t", [])
    assert result.tests_passed is True
    assert len(inner.calls) == 2
    assert [a.attempt for a in result.inner_attempts] == [1]
    assert result.inner_attempts[0].validation_log == "first fail"


def test_inner_attempt_sees_prior_attempts_feedback():
    inner = FakeInnerWorker([red("boom-1"), red("boom-2"), green()])
    wrapper = SelfCorrectingWorker(inner, default_validate, inner_max=3)
    wrapper("t", [])
    # 3rd inner call's memory contains feedback entries from attempts 1 and 2.
    _, memory_seen_by_third_call = inner.calls[2]
    inner_red_entries = [e for e in memory_seen_by_third_call if e.kind == "inner-validation-red"]
    assert len(inner_red_entries) == 2


def test_inner_max_exhausted_returns_last_red_with_full_history():
    inner = FakeInnerWorker([red("a"), red("b"), red("c")])
    wrapper = SelfCorrectingWorker(inner, default_validate, inner_max=3)
    result = wrapper("t", [])
    assert result.tests_passed is False
    assert len(inner.calls) == 3
    assert [a.attempt for a in result.inner_attempts] == [1, 2, 3]
    assert result.testlog == "c"  # the LAST attempt's log, not the first


# --- 5/6: run_loop driven by the wrapper (pure fakes) -----------------------

def test_run_loop_with_wrapper_green_first_try_reaches_reviewer_normally():
    inner = FakeInnerWorker([green()])
    worker = SelfCorrectingWorker(inner, default_validate, inner_max=3)
    reviewer = FakeReviewer(["VERDICT: APPROVE"])
    outcome = run_loop("t", worker, default_validate, reviewer)
    assert outcome.status == "APPROVED"
    assert outcome.rounds == 1
    assert len(reviewer.calls) == 1


def test_run_loop_with_wrapper_exhausted_escalates_without_reviewer():
    inner = FakeInnerWorker([red("a"), red("b")])
    worker = SelfCorrectingWorker(inner, default_validate, inner_max=2)
    reviewer = FakeReviewer(["VERDICT: APPROVE"])
    outcome = run_loop("Aufgabe X", worker, default_validate, reviewer)
    assert outcome.status == "ESCALATED_SELF_CHECK_FAILED"
    assert reviewer.calls == []                       # never bothered
    assert outcome.resumable is not None
    assert outcome.resumable.task == "Aufgabe X"
    assert len(outcome.resumable.inner_attempts) == 2  # inner_max exhausted


# --- 7/8: same behaviour through the real shell mocks ------------------------

def test_adapters_wrapped_red_then_green_converges_within_one_outer_round(tmp_path):
    os.environ["A2_MOCK_STATE_DIR"] = str(tmp_path)
    os.environ["A2_MOCK_WORKER_SCENARIO"] = "red,green"
    os.environ["A2_MOCK_REVIEWER_SCENARIO"] = "approve"
    try:
        base_worker = ShellWorker(str(MOCKS_DIR / "mock_worker.sh"))
        worker = SelfCorrectingWorker(base_worker, default_validate, inner_max=2)
        reviewer = ShellReviewer(str(MOCKS_DIR / "mock_reviewer.sh"))
        outcome = run_loop("Durchstich", worker, default_validate, reviewer)
    finally:
        for k in ("A2_MOCK_STATE_DIR", "A2_MOCK_WORKER_SCENARIO", "A2_MOCK_REVIEWER_SCENARIO"):
            os.environ.pop(k, None)
    assert outcome.status == "APPROVED"
    assert outcome.rounds == 1  # the retry was absorbed by the wrapper (ADR B1)


def test_adapters_wrapped_all_red_escalates_with_resumable_state(tmp_path):
    os.environ["A2_MOCK_STATE_DIR"] = str(tmp_path)
    os.environ["A2_MOCK_WORKER_SCENARIO"] = "red"
    os.environ["A2_MOCK_REVIEWER_SCENARIO"] = "approve"
    try:
        base_worker = ShellWorker(str(MOCKS_DIR / "mock_worker.sh"))
        worker = SelfCorrectingWorker(base_worker, default_validate, inner_max=2)
        reviewer = ShellReviewer(str(MOCKS_DIR / "mock_reviewer.sh"))
        outcome = run_loop("Durchstich", worker, default_validate, reviewer)
        reviewer_calls_file = tmp_path / "reviewer_calls"
    finally:
        for k in ("A2_MOCK_STATE_DIR", "A2_MOCK_WORKER_SCENARIO", "A2_MOCK_REVIEWER_SCENARIO"):
            os.environ.pop(k, None)
    assert outcome.status == "ESCALATED_SELF_CHECK_FAILED"
    assert not reviewer_calls_file.exists()
    assert len(outcome.resumable.inner_attempts) == 2


# --- 9: ResumableState JSON round-trip (ADR B4) -------------------------------

def test_resumable_state_json_round_trip():
    original = ResumableState(
        task="Beispielaufgabe",
        last_result=WorkerResult(
            diff="diff --git a/x b/x", testlog="pytest: 1 failed",
            committed=True, tests_passed=False, commit_ref="abc123",
        ),
        inner_attempts=[],
        reason="Tests bleiben rot nach 3 Versuchen.",
    )
    restored = resumable_state_from_json(resumable_state_to_json(original))
    assert restored == original


# --- 10: inner_max guard (Review-Fund) ---------------------------------------

def test_inner_max_below_one_raises_immediately():
    with pytest.raises(ValueError):
        SelfCorrectingWorker(FakeInnerWorker([green()]), default_validate, inner_max=0)
