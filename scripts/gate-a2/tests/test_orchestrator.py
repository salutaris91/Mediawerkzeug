"""Gate A2/A3 acceptance tests — the 6 A2 criteria from docs/plan-gate-a2-bridge.md
(AK2 updated for ADR B1/B3, Paket 1), plus an adapter thin-slice through the
shell mocks and VERDICT parsing.

Human-readable list (es prüft, dass …):
  1. ein grüner Worker + APPROVE -> APPROVED, Merge-Gate offen, kein Push (AK1).
  2. rote Validierung eskaliert SOFORT (ESCALATED_SELF_CHECK_FAILED), OHNE den
     Reviewer zu rufen UND ohne dass run_loop selbst einen zweiten Worker-Aufruf
     macht (ADR B1 — Wiederholungen gehören ausschließlich in den Worker/Wrapper).
  3. der Reviewer Diff UND Testlog bekommt (AK3).
  4. Findings nach REVISE im Memory der nächsten Worker-Runde stehen (AK4).
  5. nach 3 Reviewer-Runden ohne APPROVE eskaliert wird (ESCALATED_REVIEW_BUDGET_
     EXHAUSTED), mit vollem Verlauf + Frage (AK5).
  6. in keinem Pfad autonom gepusht/gemergt wird (AK6).
  7. die echten Adapter den Envelope über die Shell-Mocks korrekt verarbeiten.
  8. eine Template-Zeile nicht als APPROVE zählt; nur eindeutiges APPROVE öffnet das Gate.
  9. LoopOutcome.diff nur bei APPROVED gesetzt ist (und dann exakt der Diff der gewinnenden
     Runde) — gate_apply_result braucht das, um das Ergebnis als .patch zu persistieren.
  10. default_sanity_check ein APPROVE mit leerem Diff verwirft (kritisches Finding, REVISE),
      ein APPROVE mit echtem Diff unangetastet lässt und eine bereits REVISE-Verdict nicht anfasst.
  11. run_loop selbst ein fälschliches APPROVE bei leerem Diff nicht durchlässt — reproduziert
      und schließt den echten Bug aus Test #10 (Reviewer approved leeren Diff in Runde 1).

Der SelfCorrectingWorker-Wrapper (innere Selbstkorrektur, ADR B2) und der
Resume-Pfad (ADR B4) haben eigene Tests in test_self_correcting_worker.py.
"""

import os
from pathlib import Path

import pytest

from adapters import ShellReviewer, ShellWorker
from orchestrator import (
    MemoryEntry,
    Validation,
    Verdict,
    WorkerResult,
    default_sanity_check,
    default_validate,
    parse_verdict,
    run_loop,
)

MOCKS_DIR = Path(__file__).resolve().parent.parent / "mocks"


# --- Fakes (pure Python, record what they saw) -------------------------------

class FakeWorker:
    """Yields a preset WorkerResult per round; records the memory it was handed."""

    def __init__(self, results):
        self._results = list(results)
        self.calls = []            # (task, memory) per call
        self.seen_memory = []      # snapshot (list of kind) per call

    def __call__(self, task, memory):
        self.calls.append((task, list(memory)))
        self.seen_memory.append([e.kind for e in memory])
        idx = min(len(self.calls) - 1, len(self._results) - 1)
        return self._results[idx]


class FakeReviewer:
    """Returns a preset raw verdict per call; records (diff, testlog)."""

    def __init__(self, verdicts):
        self._verdicts = list(verdicts)
        self.calls = []

    def __call__(self, diff, testlog):
        self.calls.append((diff, testlog))
        idx = min(len(self.calls) - 1, len(self._verdicts) - 1)
        return self._verdicts[idx]


def green(diff="d", log="ok"):
    return WorkerResult(diff=diff, testlog=log, committed=True, tests_passed=True)


def red(log="boom"):
    return WorkerResult(diff="d", testlog=log, committed=True, tests_passed=False)


# --- AK1 ---------------------------------------------------------------------

def test_ak1_green_worker_plus_approve_reaches_merge_gate():
    worker = FakeWorker([green()])
    reviewer = FakeReviewer(["VERDICT: APPROVE"])
    outcome = run_loop("t", worker, default_validate, reviewer)
    assert outcome.status == "APPROVED"
    assert outcome.rounds == 1
    assert outcome.merge_gate is True
    assert outcome.pushed is False


def test_approved_outcome_carries_the_winning_round_diff():
    # gate_apply_result (2026-08-19) needs the diff out of LoopOutcome to
    # persist it as a .patch file — must be exactly the diff of the APPROVED
    # round, not stale/empty.
    worker = FakeWorker([green(diff="diff --git a/x b/x\n+real change")])
    reviewer = FakeReviewer(["VERDICT: APPROVE"])
    outcome = run_loop("t", worker, default_validate, reviewer)
    assert outcome.status == "APPROVED"
    assert outcome.diff == "diff --git a/x b/x\n+real change"


def test_escalated_outcome_has_no_diff():
    worker = FakeWorker([green(), green(), green()])
    reviewer = FakeReviewer(["VERDICT: REVISE"] * 3)
    outcome = run_loop("t", worker, default_validate, reviewer, max_rounds=3)
    assert outcome.status == "ESCALATED_REVIEW_BUDGET_EXHAUSTED"
    assert outcome.diff is None


# --- default_sanity_check / orchestrator's post-review fact-check (2026-08-19) ----

def test_default_sanity_check_downgrades_approve_with_empty_diff():
    result = WorkerResult(diff="", testlog="ok", committed=True, tests_passed=True)
    verdict = Verdict(approved=True, findings=[], raw="VERDICT: APPROVE")
    checked = default_sanity_check(result, verdict)
    assert checked.approved is False
    assert any("leer" in f for f in checked.findings)
    assert checked.raw == verdict.raw  # raw text preserved for the human explain-layer


def test_default_sanity_check_downgrades_approve_with_whitespace_only_diff():
    result = WorkerResult(diff="   \n  \n", testlog="ok", committed=True, tests_passed=True)
    verdict = Verdict(approved=True, findings=[], raw="VERDICT: APPROVE")
    checked = default_sanity_check(result, verdict)
    assert checked.approved is False


def test_default_sanity_check_leaves_real_diff_approved():
    result = WorkerResult(diff="diff --git a/x b/x\n+y", testlog="ok", committed=True, tests_passed=True)
    verdict = Verdict(approved=True, findings=["ok"], raw="VERDICT: APPROVE")
    checked = default_sanity_check(result, verdict)
    assert checked is verdict  # untouched, not just equal — no needless copy


def test_default_sanity_check_leaves_revise_untouched_even_with_empty_diff():
    # A REVISE is already the safe outcome — nothing for the sanity check to add.
    result = WorkerResult(diff="", testlog="ok", committed=True, tests_passed=True)
    verdict = Verdict(approved=False, findings=["[wichtig] irrelevant"], raw="VERDICT: REVISE")
    checked = default_sanity_check(result, verdict)
    assert checked is verdict


def test_run_loop_does_not_approve_when_reviewer_wrongly_approves_empty_diff():
    # Reproduces the real Test #10 bug: reviewer said APPROVE in round 1 despite
    # a completely empty diff (nothing was ever written). With max_rounds=1 this
    # must now escalate (review-budget-exhausted with round 1 as its only entry)
    # instead of returning a false APPROVED.
    worker = FakeWorker([green(diff="")])
    reviewer = FakeReviewer(["VERDICT: APPROVE"])
    outcome = run_loop("Erstelle UEBERBLICK.md", worker, default_validate, reviewer, max_rounds=1)
    assert outcome.status == "ESCALATED_REVIEW_BUDGET_EXHAUSTED"
    assert any("leer" in e.detail for e in outcome.memory)


def test_run_loop_recovers_when_worker_writes_something_in_a_later_round():
    # Round 1: reviewer wrongly approves an empty diff -> sanity check downgrades
    # it to REVISE. Round 2: worker actually writes something, reviewer approves
    # for real -> APPROVED with the real diff, exactly like Test #9's recovery.
    worker = FakeWorker([green(diff=""), green(diff="diff --git a/x b/x\n+real")])
    reviewer = FakeReviewer(["VERDICT: APPROVE", "VERDICT: APPROVE"])
    outcome = run_loop("Erstelle UEBERBLICK.md", worker, default_validate, reviewer, max_rounds=3)
    assert outcome.status == "APPROVED"
    assert outcome.rounds == 2
    assert outcome.diff == "diff --git a/x b/x\n+real"


def test_run_loop_passes_produktberater_empfehlung_through_on_approve():
    # 2026-08-24: the winning round's advisory recommendation must survive
    # into LoopOutcome, not just Verdict — cli.py reads it from there.
    worker = FakeWorker([green(diff="diff --git a/x b/x\n+real")])
    reviewer = FakeReviewer(["VERDICT: APPROVE\nEMPFEHLUNG: PRODUKTBERATER-CHECK JA"])
    outcome = run_loop("Neues Feature X", worker, default_validate, reviewer, max_rounds=1)
    assert outcome.status == "APPROVED"
    assert outcome.produktberater_empfehlung is True


# --- AK2 (ADR B1/B3: replaces the old A2 "continue" provisorium) ------------

def test_ak2_red_validation_escalates_immediately_without_calling_reviewer():
    worker = FakeWorker([red(), green()])   # the "green()" would never be reached
    reviewer = FakeReviewer(["VERDICT: APPROVE"])
    outcome = run_loop("t", worker, default_validate, reviewer)
    # run_loop itself does NOT retry a red result — that would silently burn
    # a reviewer round again (the exact A2 bug ADR B1 fixes). Retries live
    # only inside an injected self-correcting worker (see adapters.py).
    assert len(worker.calls) == 1
    assert reviewer.calls == []
    assert outcome.status == "ESCALATED_SELF_CHECK_FAILED"
    assert outcome.rounds == 1
    assert outcome.merge_gate is False
    assert outcome.pushed is False
    assert outcome.resumable is not None
    assert outcome.resumable.task == "t"
    assert "Reviewer wurde noch gar nicht gefragt" in outcome.escalation


def test_ak2_no_commit_also_escalates_immediately():
    nocommit = WorkerResult(diff="", testlog="", committed=False)
    worker = FakeWorker([nocommit])
    reviewer = FakeReviewer(["VERDICT: APPROVE"])
    outcome = run_loop("t", worker, default_validate, reviewer)
    assert len(worker.calls) == 1
    assert reviewer.calls == []
    assert outcome.status == "ESCALATED_SELF_CHECK_FAILED"


# --- AK3 ---------------------------------------------------------------------

def test_ak3_reviewer_receives_diff_and_testlog():
    worker = FakeWorker([green(diff="THE-DIFF", log="THE-LOG")])
    reviewer = FakeReviewer(["VERDICT: APPROVE"])
    run_loop("t", worker, default_validate, reviewer)
    diff, testlog = reviewer.calls[0]
    assert diff == "THE-DIFF"
    assert testlog == "THE-LOG"


# --- AK4 ---------------------------------------------------------------------

def test_ak4_findings_flow_into_next_worker_round():
    worker = FakeWorker([green(), green()])
    reviewer = FakeReviewer(["VERDICT: REVISE\n1. [wichtig] Fix X", "VERDICT: APPROVE"])
    outcome = run_loop("t", worker, default_validate, reviewer)
    # Round 2's worker call saw a findings entry in memory that round 1 did not.
    assert worker.seen_memory[0] == []
    assert "findings" in worker.seen_memory[1]
    finding_entry = next(e for e in outcome.memory if e.kind == "findings")
    assert "Fix X" in finding_entry.detail


# --- AK5 ---------------------------------------------------------------------

def test_ak5_three_revises_escalate_with_history_and_question():
    worker = FakeWorker([green(), green(), green()])
    reviewer = FakeReviewer(["VERDICT: REVISE\n1. [wichtig] A",
                             "VERDICT: REVISE\n1. [wichtig] B",
                             "VERDICT: REVISE\n1. [wichtig] C"])
    outcome = run_loop("Null-Schreibtest", worker, default_validate, reviewer, max_rounds=3)
    assert outcome.status == "ESCALATED_REVIEW_BUDGET_EXHAUSTED"
    assert outcome.rounds == 3
    assert outcome.merge_gate is False
    assert outcome.pushed is False
    esc = outcome.escalation
    assert "Runde 1" in esc and "Runde 2" in esc and "Runde 3" in esc
    assert "Null-Schreibtest" in esc
    assert "Deine Entscheidung" in esc  # the plain question


# --- AK6 ---------------------------------------------------------------------

def test_ak6_no_autonomous_push_in_any_path():
    # Approve path
    o1 = run_loop("t", FakeWorker([green()]), default_validate,
                  FakeReviewer(["VERDICT: APPROVE"]))
    # Escalation path
    o2 = run_loop("t", FakeWorker([green(), green(), green()]), default_validate,
                  FakeReviewer(["VERDICT: REVISE", "VERDICT: REVISE", "VERDICT: REVISE"]))
    assert o1.pushed is False and o2.pushed is False


def test_ak6_loop_module_has_no_push_capability():
    # The loop must not even import subprocess — it has no way to push/merge.
    import orchestrator
    src = Path(orchestrator.__file__).read_text(encoding="utf-8")
    assert "import subprocess" not in src
    assert "git push" not in src and "pr merge" not in src


# --- 7: adapter thin-slice through the shell mocks ---------------------------

def test_adapters_drive_shell_mocks_end_to_end(tmp_path):
    os.environ["A2_MOCK_STATE_DIR"] = str(tmp_path)
    os.environ["A2_MOCK_WORKER_SCENARIO"] = "green"
    os.environ["A2_MOCK_REVIEWER_SCENARIO"] = "approve"
    try:
        worker = ShellWorker(str(MOCKS_DIR / "mock_worker.sh"))
        reviewer = ShellReviewer(str(MOCKS_DIR / "mock_reviewer.sh"))
        outcome = run_loop("Durchstich", worker, default_validate, reviewer)
    finally:
        for k in ("A2_MOCK_STATE_DIR", "A2_MOCK_WORKER_SCENARIO", "A2_MOCK_REVIEWER_SCENARIO"):
            os.environ.pop(k, None)
    assert outcome.status == "APPROVED"
    assert outcome.rounds == 1


def test_adapters_plain_worker_escalates_on_first_red_via_shell_mocks(tmp_path):
    # A raw (unwrapped) ShellWorker gets NO retry from run_loop anymore
    # (ADR B1) — "green" in the scenario is never reached, reviewer never runs.
    os.environ["A2_MOCK_STATE_DIR"] = str(tmp_path)
    os.environ["A2_MOCK_WORKER_SCENARIO"] = "red,green"
    os.environ["A2_MOCK_REVIEWER_SCENARIO"] = "approve"
    try:
        worker = ShellWorker(str(MOCKS_DIR / "mock_worker.sh"))
        reviewer = ShellReviewer(str(MOCKS_DIR / "mock_reviewer.sh"))
        outcome = run_loop("Durchstich", worker, default_validate, reviewer)
        reviewer_calls_file = tmp_path / "reviewer_calls"
    finally:
        for k in ("A2_MOCK_STATE_DIR", "A2_MOCK_WORKER_SCENARIO", "A2_MOCK_REVIEWER_SCENARIO"):
            os.environ.pop(k, None)
    assert outcome.status == "ESCALATED_SELF_CHECK_FAILED"
    assert not reviewer_calls_file.exists()  # mock_reviewer.sh was never invoked


# --- envelope robustness: markers inside the diff must not corrupt parsing ---

def test_envelope_survives_marker_text_in_diff():
    import base64
    from adapters import parse_worker_envelope
    # A real diff that literally contains the envelope markers.
    evil = "diff --git a/x\n===A2-TESTLOG-B64===\n===A2-END===\nstill the diff"
    log = "log mentioning ===A2-DIFF-B64=== inline"
    env = (
        "===A2-COMMITTED===\ntrue\n"
        "===A2-TESTS-PASSED===\ntrue\n"
        "===A2-DIFF-B64===\n" + base64.b64encode(evil.encode()).decode() + "\n"
        "===A2-TESTLOG-B64===\n" + base64.b64encode(log.encode()).decode() + "\n"
        "===A2-END===\n"
    )
    r = parse_worker_envelope(env)
    assert r.diff == evil          # fully preserved, not truncated at a marker
    assert r.testlog == log
    assert r.committed is True and r.tests_passed is True


# --- 8: VERDICT parsing safety ----------------------------------------------

def test_parse_verdict_template_line_is_not_an_approve():
    # A format-template line must never be mistaken for the decision.
    raw = "VERDICT: APPROVE | REVISE\n...\nVERDICT: REVISE\n1. [wichtig] X"
    v = parse_verdict(raw)
    assert v.approved is False
    assert any("wichtig" in f for f in v.findings)


def test_parse_verdict_clean_approve():
    assert parse_verdict("alles gut\nVERDICT: APPROVE").approved is True


def test_parse_verdict_markdown_inline_approve():
    # The exact shape a real reviewer produced: VERDICT inline in a heading,
    # wrapped in markdown bold. Must still count as APPROVE.
    raw = "## Review-Ergebnis **VERDICT: APPROVE**\n\nBegründung: Diff sauber."
    assert parse_verdict(raw).approved is True


def test_parse_verdict_missing_is_not_approved():
    assert parse_verdict("kein urteil hier").approved is False


# --- 9: EMPFEHLUNG (produktberater-check) parsing safety ---------------------
# Advisory-only classification (2026-08-24, docs/kreativteam.md Abschnitt 3b) —
# same parsing rules as VERDICT: last occurrence wins, ambiguous/missing input
# safely resolves to None (no recommendation), never guessed.

def test_parse_verdict_empfehlung_ja():
    raw = "VERDICT: APPROVE\nEMPFEHLUNG: PRODUKTBERATER-CHECK JA"
    assert parse_verdict(raw).produktberater_empfehlung is True


def test_parse_verdict_empfehlung_nein():
    raw = "VERDICT: APPROVE\nEMPFEHLUNG: PRODUKTBERATER-CHECK NEIN"
    assert parse_verdict(raw).produktberater_empfehlung is False


def test_parse_verdict_empfehlung_missing_is_none():
    assert parse_verdict("VERDICT: APPROVE").produktberater_empfehlung is None


def test_parse_verdict_empfehlung_markdown_wrapped():
    raw = "## Review\n**EMPFEHLUNG: PRODUKTBERATER-CHECK JA**\nVERDICT: APPROVE"
    assert parse_verdict(raw).produktberater_empfehlung is True


def test_parse_verdict_empfehlung_last_occurrence_wins():
    # A format-template line near the top must never decide, same rule as VERDICT.
    raw = ("EMPFEHLUNG: PRODUKTBERATER-CHECK JA | NEIN\n"
           "...\nEMPFEHLUNG: PRODUKTBERATER-CHECK NEIN\nVERDICT: APPROVE")
    assert parse_verdict(raw).produktberater_empfehlung is False
