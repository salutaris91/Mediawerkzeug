#!/usr/bin/env python3
"""Gate A2 — Worker<->Reviewer orchestrator (CLI thin slice).

Drives ONE task through the loop from docs/plan-gate-a2-bridge.md:

    worker(task, memory)   -> commit + diff + testlog     (AK1)
    validate(result)       -> red? escalate immediately,   (AK2, ADR B1/B3:
                               reviewer NEVER called         retries live only
                                                              inside the worker)
    reviewer(diff, testlog)-> machine-readable VERDICT     (AK3)
        APPROVE -> merge gate, STOP, Alex decides          (AK6, no autonomous push)
        REVISE  -> findings into next round (round memory) (AK4)
    after max REVIEWER rounds without APPROVE -> escalate   (AK5)
    a red validate() also escalates, but as
        ESCALATED_SELF_CHECK_FAILED (ADR B3) — resumable    (ADR B4, --resume
        via ResumableState so Alex can hand it to the         --to-reviewer)
        reviewer later ("an den Reviewer abgeben")

Design note (why dependency injection): the loop logic is the actual
"Eigenbau" success factor. We keep it free of Docker/agy/subprocess so it can
be unit-tested against Python fakes AND driven end-to-end against shell mocks
through the real adapters. The loop below never imports subprocess itself.
"""

from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass, field
from typing import Callable, Optional

# --- LoopOutcome.status values -------------------------------------------------
# Two escalation reasons need different Alex-facing options (ADR B3):
# self-check-failed never bothered the reviewer, so "an ihn abgeben" is a real
# choice there; review-budget-exhausted already spent 3 reviewer rounds, so
# that choice makes no sense there.
STATUS_APPROVED = "APPROVED"
STATUS_ESCALATED_SELF_CHECK_FAILED = "ESCALATED_SELF_CHECK_FAILED"
STATUS_ESCALATED_REVIEW_BUDGET_EXHAUSTED = "ESCALATED_REVIEW_BUDGET_EXHAUSTED"


# --- Data carried between the stages -----------------------------------------

@dataclass
class InnerAttempt:
    """One self-correction attempt inside a wrapped worker (e.g.
    SelfCorrectingWorker in adapters.py) — part of the resumable escalation
    state (ADR B4), NOT the outer round memory. The outer loop never sees
    these as they happen; it only sees the final WorkerResult.
    """
    attempt: int
    validation_log: str


@dataclass
class WorkerResult:
    """What the worker hands back after one round.

    tests_passed is the FACT from the real test run inside the container
    (Fakten schlagen Meinung, ADR-A2 rationale) — not the worker's opinion.

    inner_attempts is populated only by a self-correcting worker (ADR B2) and
    lists what happened BEFORE this (possibly still red) result — empty for a
    plain, unwrapped worker.
    """
    diff: str
    testlog: str
    committed: bool
    tests_passed: bool = True
    commit_ref: Optional[str] = None
    inner_attempts: list[InnerAttempt] = field(default_factory=list)


@dataclass
class Validation:
    """Outcome of the automatic tests/linter run."""
    passed: bool
    log: str


@dataclass
class Verdict:
    """Parsed reviewer decision."""
    approved: bool
    findings: list[str]
    raw: str
    # Advisory-only classification the reviewer may add alongside VERDICT
    # (2026-08-24, docs/kreativteam.md Abschnitt 3b): does this task look
    # like a Feature/UI/API-design change worth a produktberater content
    # review, vs. a bugfix/refactor/dependency/docs change that isn't?
    # None = the reviewer didn't include the line (older reviewer, or the
    # line was unparseable) — never treated as a negative signal, just
    # "no recommendation available". This is purely a hint surfaced to
    # Alex, never a gate — same "beratend, nicht blockierend" principle as
    # the produktberater step itself.
    produktberater_empfehlung: Optional[bool] = None


@dataclass
class MemoryEntry:
    """One thing that happened in a round — the round memory the worker sees next."""
    round: int
    kind: str  # "validation-red" | "findings"
    detail: str


@dataclass
class ResumableState:
    """Everything --resume --to-reviewer needs to hand a self-check-failed
    attempt to the reviewer later, without re-running task or worker (ADR B4).

    Reuses the existing WorkerResult/InnerAttempt dataclasses instead of a
    hand-rolled JSON schema, so the two representations cannot drift apart
    (Alex' review comment on the original draft schema).
    """
    task: str
    last_result: WorkerResult
    inner_attempts: list[InnerAttempt]
    reason: str


@dataclass
class LoopOutcome:
    status: str  # one of the STATUS_* constants above
    rounds: int
    memory: list[MemoryEntry]
    merge_gate: bool = False        # True only on APPROVED; the human still pushes the button
    pushed: bool = False            # AK6: must stay False — no autonomous push/merge, ever
    escalation: Optional[str] = None
    resumable: Optional[ResumableState] = None  # set only on ESCALATED_SELF_CHECK_FAILED
    diff: Optional[str] = None      # set only on APPROVED — the winning round's diff, so
                                     # cli.py can persist it as a .patch (gate_apply_result)
    produktberater_empfehlung: Optional[bool] = None  # set only on APPROVED, from the
                                     # winning round's Verdict — see Verdict's own field
                                     # for the full explanation.


# --- Ports (injected; real adapters live in the adapters module) -------------
# A worker takes the task + current memory and returns a WorkerResult.
WorkerFn = Callable[[str, list[MemoryEntry]], WorkerResult]
# A validator inspects the produced work and returns a Validation.
ValidateFn = Callable[[WorkerResult], Validation]
# A reviewer takes diff + testlog and returns the raw reviewer text.
ReviewerFn = Callable[[str, str], str]
# A sanity check inspects the WorkerResult against the reviewer's parsed
# Verdict and may downgrade it — the orchestrator's own "Fakten schlagen
# Meinung" gate on the reviewer's judgment, symmetric to ValidateFn's role
# on the worker's self-report (AK2). Extend by adding checks INSIDE the
# default implementation (default_sanity_check) or injecting a different
# SanityCheckFn — the loop itself never special-cases individual checks.
SanityCheckFn = Callable[[WorkerResult, "Verdict"], "Verdict"]


def default_validate(result: WorkerResult) -> Validation:
    """FALLBACK validator: relay the worker's self-reported tests_passed.

    This is the advisory path, used only when no independent --test-cmd is
    configured. The worker's own tests_passed is a weak "did it write/commit"
    proxy, not proof the code works.

    The authoritative path is adapters.TestCommandValidator, which runs a real
    test command independently and IGNORES this self-report (Council decision —
    Fakten schlagen Meinung). Kept here so runs without a --test-cmd still work.
    """
    return Validation(passed=result.tests_passed, log=result.testlog)


# --- VERDICT parsing ---------------------------------------------------------

# Match VERDICT: anywhere on a line, not only at line start — real reviewers
# wrap it in markdown, e.g. "## Review-Ergebnis **VERDICT: APPROVE**". Capture
# the rest of that line (`.` stops at the newline).
_VERDICT_TAIL = re.compile(r"VERDICT:\s*(.*)", re.IGNORECASE)
_FINDING_LINE = re.compile(r"^\s*(?:\d+[.)]\s*)?(\[(?:kritisch|wichtig|kosmetisch)\].*)$",
                           re.IGNORECASE | re.MULTILINE)
# Advisory produktberater-check recommendation (2026-08-24, docs/kreativteam.md
# Abschnitt 3b) — same parsing style as VERDICT: last occurrence wins, markdown
# emphasis stripped, ambiguous/missing input safely resolves to "no
# recommendation" (None) rather than guessing.
_EMPFEHLUNG_TAIL = re.compile(r"EMPFEHLUNG:\s*(.*)", re.IGNORECASE)


def parse_verdict(raw: str) -> Verdict:
    """Parse the reviewer's machine-readable VERDICT (AK3) and, if present,
    its advisory produktberater-check recommendation.

    Safety choice: only an unambiguous, single APPROVE counts as approved.
    Anything else — REVISE, both words on the line, garbage, missing — is treated
    as NOT approved. A false APPROVE would open the merge gate wrongly; erring
    toward REVISE only costs extra rounds. The safe direction wins here.

    Uses the LAST 'VERDICT:' occurrence so a format-template line
    ("VERDICT: APPROVE | REVISE") near the top never decides. Markdown emphasis
    around the word is stripped before matching.
    """
    tails = _VERDICT_TAIL.findall(raw or "")
    approved = False
    if tails:
        tail = re.sub(r"[*`_#>]+", " ", tails[-1]).upper()
        approved = ("APPROVE" in tail) and ("REVISE" not in tail)

    findings = [m.strip() for m in _FINDING_LINE.findall(raw or "")]

    empfehlung_tails = _EMPFEHLUNG_TAIL.findall(raw or "")
    produktberater_empfehlung: Optional[bool] = None
    if empfehlung_tails:
        etail = re.sub(r"[*`_#>]+", " ", empfehlung_tails[-1]).upper()
        has_ja, has_nein = "JA" in etail, "NEIN" in etail
        if has_ja and not has_nein:
            produktberater_empfehlung = True
        elif has_nein and not has_ja:
            produktberater_empfehlung = False
        # both or neither present -> stays None, ambiguous input is never guessed

    return Verdict(approved=approved, findings=findings, raw=raw or "",
                    produktberater_empfehlung=produktberater_empfehlung)


# --- Sanity check (Fakten schlagen Meinung, applied to the reviewer) --------

def default_sanity_check(result: WorkerResult, verdict: Verdict) -> Verdict:
    """Objective post-review fact-check the orchestrator runs on its own,
    independent of what the reviewer LLM said — same principle as
    TestCommandValidator overriding the worker's self-reported tests_passed,
    now applied to the reviewer's verdict instead.

    Only touches APPROVE verdicts (a REVISE is already the safe outcome).
    Reproduced bug (2026-08-19, Test #10): the reviewer approved a
    completely empty diff in round 1 — nothing was ever written, yet the
    loop reported APPROVED. An empty diff can never be merged, so this is
    checked here deterministically rather than left to LLM judgment.

    Add further checks here as new plausibility bugs are found (see
    ROADMAP: Diff-vs-Task-Plausibilität) — run_loop itself never needs to
    change, only this function or the injected SanityCheckFn.
    """
    if not verdict.approved:
        return verdict
    if not (result.diff or "").strip():
        return Verdict(
            approved=False,
            findings=verdict.findings + [
                "[kritisch] Diff ist leer — ein leerer Diff kann nicht gemerged werden. "
                "VERDICT: APPROVE wurde vom Orchestrator verworfen (Sanity-Check)."
            ],
            raw=verdict.raw,
        )
    return verdict


# --- Escalation (AK5): translate technical state into one plain question -----

def build_escalation(task: str, outcome_memory: list[MemoryEntry]) -> str:
    """Turn the full round history into a short, context-free question for Alex.

    Rule from ADR A2-7: one clear question, understandable without context,
    with a recommendation. Kept plain on purpose — this is the "Erklär-Schicht".
    """
    lines = [
        "# Eskalation an Alex — Gate A2",
        "",
        f"**Aufgabe:** {task}",
        "",
        f"Der Worker↔Reviewer-Loop hat nach {_rounds_in(outcome_memory)} Runden "
        "**kein APPROVE** erreicht. Kurz, was passiert ist:",
        "",
    ]
    for entry in outcome_memory:
        label = "Tests rot" if entry.kind == "validation-red" else "Reviewer: Nachbesserung nötig"
        lines.append(f"- **Runde {entry.round} — {label}:** {_shorten(entry.detail)}")
    lines += [
        "",
        "**Empfehlung:** Der Loop konvergiert nicht von allein. Sieh dir den letzten "
        "Diff und die offenen Findings an und entscheide: erneut versuchen (mit deinem "
        "Hinweis), Aufgabe anpassen, oder verwerfen.",
        "",
        "**Deine Entscheidung:** Wie soll es weitergehen?",
    ]
    return "\n".join(lines)


def build_self_check_escalation(
    task: str, result: WorkerResult, reason: str,
    prior_memory: list[MemoryEntry],
) -> str:
    """Plain-language explain layer (ADR B3) for a self-check-failed escalation.

    Unlike build_escalation (AK5, reviewer said REVISE 3x), the reviewer here
    was NEVER called — the worker's own self-correction gave up first. Kept
    deliberately non-technical: what happened, why we stop here instead of
    paging the expensive reviewer, and the concrete choices Alex has. Option
    B ("an den Reviewer abgeben") is the resume path cli.py wires up.
    """
    lines = [
        "# Eskalation an Alex — Gate A3 (Selbstprüfung erschöpft)",
        "",
        f"**Aufgabe:** {task}",
        "",
        f"Der Worker hat versucht, seinen eigenen Fehler zu beheben "
        f"({len(result.inner_attempts)} Versuch(e)), aber es bleibt rot. "
        "**Der Reviewer wurde noch gar nicht gefragt** — bekannt kaputten Code "
        "an ihn zu schicken würde nur Zeit kosten, ohne dass er etwas Neues "
        "beitragen könnte.",
        "",
        f"**Was zuletzt schiefging:** {_shorten(reason)}",
        "",
    ]
    if prior_memory:
        lines.append("**Bisheriger Verlauf (vorherige Runden):**")
        for entry in prior_memory:
            label = "Tests rot" if entry.kind == "validation-red" else "Reviewer: Nachbesserung nötig"
            lines.append(f"- **Runde {entry.round} — {label}:** {_shorten(entry.detail)}")
        lines.append("")
    lines += [
        "**Deine Möglichkeiten:**",
        "- **A) Nochmal versuchen — mit deinem Hinweis.** Wenn du die Ursache "
        "erahnst, gib sie mit, der Worker startet neu.",
        "- **B) An den Reviewer abgeben.** Ein technischer Blick erkennt manchmal "
        "schneller, was dem Worker entgeht — der Reviewer bekommt den zuletzt "
        "roten Stand zur Diagnose.",
        "- **C) Aufgabe anpassen oder verwerfen.** Vielleicht war die Aufgabe "
        "zu groß oder unklar formuliert.",
        "",
        "**Deine Entscheidung:** Wie soll es weitergehen?",
    ]
    return "\n".join(lines)


def resumable_state_to_json(state: ResumableState) -> str:
    """Serialize for --resume (ADR B4): dataclasses.asdict() on the EXISTING
    dataclasses, not a hand-rolled schema — the two representations cannot
    drift apart because there is only one.
    """
    return json.dumps(asdict(state), indent=2, ensure_ascii=False)


def resumable_state_from_json(raw: str) -> ResumableState:
    """Inverse of resumable_state_to_json. Raises KeyError/TypeError on a
    malformed file — cli.py turns that into a loud, plain error, never a
    silent partial resume.
    """
    data = json.loads(raw)
    last_result_data = dict(data["last_result"])
    last_result_data["inner_attempts"] = [
        InnerAttempt(**a) for a in last_result_data.get("inner_attempts", [])
    ]
    return ResumableState(
        task=data["task"],
        last_result=WorkerResult(**last_result_data),
        inner_attempts=[InnerAttempt(**a) for a in data.get("inner_attempts", [])],
        reason=data["reason"],
    )


def _rounds_in(memory: list[MemoryEntry]) -> int:
    return max((e.round for e in memory), default=0)


def _shorten(text: str, limit: int = 200) -> str:
    text = " ".join((text or "").split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


# --- The loop ----------------------------------------------------------------

def run_loop(
    task: str,
    worker: WorkerFn,
    validate: ValidateFn,
    reviewer: ReviewerFn,
    max_rounds: int = 3,
    on_event: Optional[Callable[[str], None]] = None,
    sanity_check: SanityCheckFn = default_sanity_check,
) -> LoopOutcome:
    """Run one task through the Worker<->Reviewer loop.

    ADR B1: an outer round is consumed ONLY when the reviewer is actually
    called. Retries against a red self-check happen exclusively inside the
    injected worker (see adapters.SelfCorrectingWorker) — run_loop itself
    never retries a red result. This replaces the A2 "continue" provisorium,
    which silently burned a reviewer round on every red validation. A red
    result here therefore means self-checking is DONE (whether the worker
    self-corrected internally or not) and still red -> escalate immediately,
    the reviewer is never bothered with known-broken code (ADR B3).

    Never pushes or merges (AK6): on APPROVE it stops at the merge gate and
    leaves the button to Alex.
    """
    log = on_event or (lambda _msg: None)
    memory: list[MemoryEntry] = []

    for round_no in range(1, max_rounds + 1):
        log(f"[Runde {round_no}] Worker startet …")
        result = worker(task, memory)          # AK1: commit + diff + testlog
        if not result.committed:
            reason = "Worker hat keinen Commit erzeugt."
            log(f"[Runde {round_no}] Kein Commit — Selbstprüfung gescheitert, Eskalation.")
            return _escalate_self_check_failed(task, result, reason, round_no, memory)

        validation = validate(result)          # AK2 safety net: authoritative check
        if not validation.passed:
            log(f"[Runde {round_no}] Validierung ROT — Selbstprüfung erschöpft, Eskalation "
                "(Reviewer wird NICHT automatisch gerufen).")
            return _escalate_self_check_failed(task, result, validation.log, round_no, memory)

        log(f"[Runde {round_no}] Validierung grün — Reviewer prüft Diff + Testlog.")
        verdict = parse_verdict(reviewer(result.diff, result.testlog))  # AK3
        verdict = sanity_check(result, verdict)  # orchestrator's own fact-check on the verdict
        if verdict.approved:
            log(f"[Runde {round_no}] Reviewer: APPROVE — Merge-Gate erreicht (Alex drückt den Knopf).")
            return LoopOutcome(status=STATUS_APPROVED, rounds=round_no, memory=memory,
                               merge_gate=True, pushed=False,  # AK6: no autonomous push
                               diff=result.diff,
                               produktberater_empfehlung=verdict.produktberater_empfehlung)

        # REVISE: findings become context for the next worker round (AK4).
        detail = "; ".join(verdict.findings) if verdict.findings else _shorten(verdict.raw)
        memory.append(MemoryEntry(round_no, "findings", detail))
        log(f"[Runde {round_no}] Reviewer: REVISE — Findings ins Runden-Memory.")

    # AK5: max REVIEWER rounds without APPROVE -> escalate with full history.
    escalation = build_escalation(task, memory)
    log(f"[Eskalation] Nach {max_rounds} Runden kein APPROVE — an Alex.")
    return LoopOutcome(status=STATUS_ESCALATED_REVIEW_BUDGET_EXHAUSTED, rounds=max_rounds,
                       memory=memory, merge_gate=False, pushed=False, escalation=escalation)


def _escalate_self_check_failed(
    task: str, result: WorkerResult, reason: str,
    round_no: int, prior_memory: list[MemoryEntry],
) -> LoopOutcome:
    """Build the ESCALATED_SELF_CHECK_FAILED outcome, including the resumable
    state (ADR B4) that lets --resume --to-reviewer hand this exact attempt
    to the reviewer later without re-running the worker.
    """
    resumable = ResumableState(
        task=task, last_result=result,
        inner_attempts=list(result.inner_attempts), reason=reason,
    )
    escalation = build_self_check_escalation(task, result, reason, prior_memory)
    return LoopOutcome(
        status=STATUS_ESCALATED_SELF_CHECK_FAILED, rounds=round_no,
        memory=list(prior_memory), merge_gate=False, pushed=False,
        escalation=escalation, resumable=resumable,
    )
