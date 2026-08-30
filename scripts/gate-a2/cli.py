#!/usr/bin/env python3
"""Gate A2 CLI — wire the loop to real (or mock) worker/reviewer commands.

Examples
--------
Dry-run against the shell mocks (no Docker, no .env needed):

    ./cli.py --task "Null-Schreibtest" \
        --worker-cmd mocks/mock_worker.sh \
        --reviewer-cmd mocks/mock_reviewer.sh

Real run (needs .env with REVIEWER_* and the agy A2 runner):

    ./cli.py --task "..." \
        --worker-cmd scripts/gate-a2/run_agy_worker_a2.sh \
        --reviewer-cmd scripts/gate-a2/reviewer-a2.sh

Exit codes:  0 = APPROVED (merge gate, Alex pushes the button)
             2 = ESCALATED to Alex
             1 = orchestrator/adapter error
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from adapters import OpenHandsWorker, ShellReviewer, ShellWorker, SelfCorrectingWorker, TestCommandValidator
from orchestrator import (
    STATUS_APPROVED,
    STATUS_ESCALATED_SELF_CHECK_FAILED,
    MemoryEntry,
    build_escalation,
    default_sanity_check,
    default_validate,
    parse_verdict,
    resumable_state_from_json,
    resumable_state_to_json,
    run_loop,
)

DEFAULT_LOG_PATH = Path(__file__).resolve().parent / "logs" / "run-log.jsonl"
DEFAULT_PATCHES_DIR = Path(__file__).resolve().parent / "logs" / "patches"

_SLUG_STRIP_RE = re.compile(r"[^a-z0-9]+")


def _slugify(text: str, max_len: int = 40) -> str:
    """Turn a task description into a short, filesystem-safe slug for patch
    filenames — purely cosmetic (uniqueness comes from the timestamp prefix).
    """
    slug = _SLUG_STRIP_RE.sub("-", (text or "").lower()).strip("-")
    return (slug[:max_len].rstrip("-")) or "task"


def write_patch_file(
    diff: str,
    task: str,
    patches_dir: str | Path | None = None,
) -> str | None:
    """Persist an APPROVED round's diff as a .patch file (gate_apply_result,
    ADR 1 of the Gate-A2 "Ergebnis kommt an" design). Returns the filename
    (relative to patches_dir, NOT a full path — mcp_server.py resolves it
    against its own known patches dir) or None if there was nothing to write
    or writing failed. Fails safely, never raises — a lost patch file must
    never crash an otherwise-successful run.
    """
    if not diff or not diff.strip():
        return None
    target_dir = Path(patches_dir) if patches_dir else DEFAULT_PATCHES_DIR
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    filename = f"{timestamp}-{_slugify(task)}.patch"
    try:
        target_dir.mkdir(parents=True, exist_ok=True)
        (target_dir / filename).write_text(diff, encoding="utf-8")
        return filename
    except OSError as exc:
        print(f"[WARN] Patch-Datei konnte nicht geschrieben werden ({target_dir / filename}): {exc}",
              file=sys.stderr)
        return None


def append_run_log(
    task: str,
    worker_backend: str,
    rounds: int,
    status: str,
    findings: list[str] | None = None,
    error: str | None = None,
    duration_seconds: float = 0.0,
    log_file: str | Path | None = None,
    patch_file: str | None = None,
    project_dir: str | None = None,
) -> bool:
    """Append a structured run-log entry to JSON Lines log (ADR 2).

    Fails safely without raising exceptions.
    """
    target = Path(log_file) if log_file else Path(os.environ.get("A2_LOG_FILE") or DEFAULT_LOG_PATH)
    payload = {
        "task": task,
        "worker_backend": worker_backend,
        "rounds": rounds,
        "status": status,
        "findings": findings if findings is not None else [],
        "error": error,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "duration_seconds": round(duration_seconds, 3),
        "patch_file": patch_file,
        "project_dir": project_dir,
    }

    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        with open(target, "a", encoding="utf-8") as f:
            f.write(json.dumps(payload, ensure_ascii=False) + "\n")
        return True
    except Exception as exc:
        print(f"[WARN] Run-Log konnte nicht geschrieben werden ({target}): {exc}", file=sys.stderr)
        return False


def notify_n8n_webhook(
    task: str,
    status: str,
    rounds: int,
    escalation_text: str,
    escalation_file: str,
    webhook_url: str | None = None,
    timeout: float = 5.0,
) -> bool:
    """Send an optional webhook notification to n8n upon escalation (ADR 1-3).

    Returns True if sent successfully, False otherwise.
    Fails safely without raising exceptions.
    """
    url = webhook_url or os.environ.get("N8N_WEBHOOK_URL")
    if not url:
        return False

    # Guard against Telegram character limit (~4096).
    safe_text = escalation_text
    if len(safe_text) > 4000:
        safe_text = safe_text[:3950] + "\n\n... [Text für Telegram gekürzt, siehe a2-eskalation.md]"

    payload = {
        "task": task,
        "status": status,
        "round": rounds,
        "escalation_text": safe_text,
        "escalation_file": escalation_file,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={
                "Content-Type": "application/json",
                "User-Agent": "Gate-A2-Orchestrator/1.0",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=timeout) as response:
            status_code = response.getcode()
            if 200 <= status_code < 300:
                print(f"[info] n8n-Eskalations-Webhook erfolgreich gesendet ({url})", file=sys.stderr)
                return True
            else:
                print(f"[WARN] n8n-Webhook antwortete mit Status {status_code}", file=sys.stderr)
                return False
    except Exception as exc:
        print(f"[WARN] n8n-Webhook fehlgeschlagen ({url}): {exc}", file=sys.stderr)
        return False



def _read_worker_rules_excerpt() -> str:
    """The same curated worker-safe rules excerpt the worker prompt gets
    (build-worker-rules.sh) — read here so the reviewer judges against the
    same rules. Missing file (not yet built) -> empty string, no error.
    """
    path = Path(__file__).parent / "worker-rules.generated.md"
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return ""


def _default_resume_state_path(escalation_out: str) -> Path:
    """Derive the state-file path from --escalation-out (ADR B4) — one flag
    to remember, not two. 'a2-eskalation.md' -> 'a2-eskalation-state.json'.
    """
    p = Path(escalation_out)
    return p.with_name(p.stem + "-state.json")


def _resume_to_reviewer(args: argparse.Namespace, start_time: float | None = None) -> int:
    """(ADR B4) Hand a self-check-failed attempt to the reviewer for a
    diagnostic opinion — the only resume mode Paket 1 implements. Option A
    ("nochmal versuchen mit Hinweis") needs no special flag: just re-run the
    normal command with an amended --task.
    """
    t0 = start_time if start_time is not None else time.time()
    state_path = Path(args.resume) if args.resume else _default_resume_state_path(args.escalation_out)
    try:
        state = resumable_state_from_json(state_path.read_text(encoding="utf-8"))
    except OSError as exc:
        print(f"[FEHLER] Zustandsdatei nicht lesbar ({state_path}): {exc}", file=sys.stderr)
        append_run_log(
            task=f"resume:{state_path.name}",
            worker_backend=args.worker_backend,
            rounds=0,
            status="ERROR",
            findings=[],
            error=f"Zustandsdatei nicht lesbar ({state_path}): {exc}",
            duration_seconds=time.time() - t0,
            log_file=args.log_file,
            project_dir=args.project_dir,
        )
        return 1
    except (ValueError, KeyError, TypeError) as exc:
        print(f"[FEHLER] Zustandsdatei beschädigt oder unvollständig ({state_path}): {exc}",
              file=sys.stderr)
        append_run_log(
            task=f"resume:{state_path.name}",
            worker_backend=args.worker_backend,
            rounds=0,
            status="ERROR",
            findings=[],
            error=f"Zustandsdatei beschädigt oder unvollständig ({state_path}): {exc}",
            duration_seconds=time.time() - t0,
            log_file=args.log_file,
            project_dir=args.project_dir,
        )
        return 1

    print(f"[info] Wiedereinstieg: '{state.task}' — {len(state.inner_attempts)} innere "
          f"Versuch(e), zuletzt: {state.reason}", file=sys.stderr)
    print("[info] Hinweis: Der Code-Stand im Workspace kann inzwischen abweichen — kein "
          "automatischer Abgleich (ADR B5).", file=sys.stderr)

    reviewer = ShellReviewer(args.reviewer_cmd, rules_excerpt=_read_worker_rules_excerpt(),
                              project_dir=args.project_dir, task=state.task)
    try:
        verdict = parse_verdict(reviewer(state.last_result.diff, state.last_result.testlog))
        verdict = default_sanity_check(state.last_result, verdict)
    except (RuntimeError, ValueError) as exc:
        print(f"[FEHLER] Reviewer abgebrochen: {exc}", file=sys.stderr)
        append_run_log(
            task=state.task,
            worker_backend=args.worker_backend,
            rounds=0,
            status="ERROR",
            findings=[],
            error=f"Reviewer abgebrochen: {exc}",
            duration_seconds=time.time() - t0,
            log_file=args.log_file,
            project_dir=args.project_dir,
        )
        return 1

    if verdict.approved:
        print("\n=== Ergebnis: APPROVED (Reviewer, Diagnose-Modus) ===")
        print("Merge-Gate erreicht. Der Merge-Knopf bleibt bei Alex.")
        patch_file = write_patch_file(state.last_result.diff, state.task)
        if patch_file:
            print(f"Diff gespeichert als: {DEFAULT_PATCHES_DIR / patch_file}")
        if verdict.produktberater_empfehlung:
            print("[Empfehlung] Task-Typ: Feature/UI/API-Design — produktberater-Check "
                  "könnte sich lohnen (beratend, siehe docs/kreativteam.md Abschnitt 3b).")
        append_run_log(
            task=state.task,
            worker_backend=args.worker_backend,
            rounds=1,
            status="APPROVED",
            findings=[],
            error=None,
            duration_seconds=time.time() - t0,
            log_file=args.log_file,
            patch_file=patch_file,
            project_dir=args.project_dir,
        )
        return 0

    detail = "; ".join(verdict.findings) if verdict.findings else verdict.raw
    escalation = build_escalation(state.task, [MemoryEntry(round=1, kind="findings", detail=detail)])
    print("\n=== Ergebnis: ESCALATED (Reviewer, Diagnose-Modus, weiterhin offen) ===")
    print(escalation)

    notify_n8n_webhook(
        task=state.task,
        status="ESCALATED_RESUME",
        rounds=1,
        escalation_text=escalation,
        escalation_file=str(state_path),
        webhook_url=args.webhook_url,
    )
    findings = verdict.findings if verdict.findings else ([detail] if detail else [])
    append_run_log(
        task=state.task,
        worker_backend=args.worker_backend,
        rounds=1,
        status="ESCALATED",
        findings=findings,
        error=None,
        duration_seconds=time.time() - t0,
        log_file=args.log_file,
        project_dir=args.project_dir,
    )
    return 2


def main(argv: list[str] | None = None) -> int:
    start_time = time.time()
    parser = argparse.ArgumentParser(description="Gate A2/A3 Worker<->Reviewer loop.")
    parser.add_argument("--task", default=None,
                        help="Task description handed to the worker. Required unless "
                             "--resume --to-reviewer is used (the task comes from the "
                             "state file there).")
    parser.add_argument("--worker-backend", choices=["shell", "openhands"], default="shell",
                        help="Worker backend implementation (default 'shell' for agy/mock runner, "
                             "or 'openhands' for isolated OpenHands SDK runner).")
    parser.add_argument("--worker-cmd", default=None,
                        help="Path to the worker command. Required when --worker-backend is shell "
                             "(unless --resume --to-reviewer is used).")
    parser.add_argument("--reviewer-cmd", required=True, help="Path to the reviewer command.")
    parser.add_argument("--max-rounds", type=int, default=3, help="Max rounds before escalation (default 3).")
    parser.add_argument("--webhook-url", default=None,
                        help="Optional webhook URL to notify on escalation (overrides N8N_WEBHOOK_URL env var).")
    parser.add_argument("--log-file", default=None,
                        help=f"Path to JSONL run-log file (default: {DEFAULT_LOG_PATH}).")

    parser.add_argument("--test-cmd", default=None,
                        help="Independent, AUTHORITATIVE test/lint command (e.g. 'pytest -q'). "
                             "Its exit code decides pass/fail; the worker's self-reported "
                             "tests_passed is ignored. Without it: fallback to that (weak) "
                             "self-report, and NO inner self-correction (see --inner-max).")
    parser.add_argument("--test-cwd", default=None,
                        help="Working directory for --test-cmd (default: current directory).")
    parser.add_argument("--project-dir", default=None,
                        help="Optional path to a real project directory to copy into the worker container.")
    parser.add_argument("--in-container-test", action="store_true",
                        help="Explicitly flag that --test-cmd is executed inside worker container "
                             "(bypasses host TestCommandValidator). Automatically true for --worker-backend openhands.")
    parser.add_argument("--inner-max", type=int, default=3,
                        help="Max self-correction attempts INSIDE the worker before escalating "
                             "(default 3, ADR B1/B2). Only active together with --test-cmd — "
                             "self-correcting against the weak envelope proxy would be pointless.")
    parser.add_argument("--escalation-out", default="a2-eskalation.md",
                        help="Where to write the escalation note if it happens.")
    parser.add_argument("--resume", nargs="?", const="", default=None, metavar="PFAD",
                        help="Resume a self-check-failed escalation from its state file "
                             "(ADR B4). Default path is derived from --escalation-out. "
                             "Requires --to-reviewer.")
    parser.add_argument("--to-reviewer", action="store_true",
                        help="With --resume: hand the last (red) attempt to the reviewer for "
                             "a diagnostic opinion — the only supported resume mode.")
    args = parser.parse_args(argv)

    if args.resume is not None:
        if not args.to_reviewer:
            print("[FEHLER] --resume braucht --to-reviewer (einziger unterstützter "
                  "Wiedereinstieg in Paket 1).", file=sys.stderr)
            append_run_log(
                task="resume",
                worker_backend=args.worker_backend,
                rounds=0,
                status="ERROR",
                findings=[],
                error="--resume braucht --to-reviewer (einziger unterstützter Wiedereinstieg in Paket 1).",
                duration_seconds=time.time() - start_time,
                log_file=args.log_file,
                project_dir=args.project_dir,
            )
            return 1
        return _resume_to_reviewer(args, start_time=start_time)

    if not args.task:
        parser.error("--task ist erforderlich (außer bei --resume --to-reviewer).")
    if args.worker_backend == "shell" and not args.worker_cmd:
        parser.error("--worker-cmd ist erforderlich bei --worker-backend shell.")
    if args.inner_max < 1:
        parser.error(f"--inner-max muss mindestens 1 sein, war {args.inner_max}.")

    is_container_run = (args.worker_backend == "openhands") or args.in_container_test

    if args.worker_backend == "openhands":
        base_worker = OpenHandsWorker(
            project_dir=args.project_dir,
            test_cmd=args.test_cmd if is_container_run else None,
        )
    else:
        # Project copy-in is independent of is_container_run (that flag only
        # decides where --test-cmd executes). Without this, --project-dir was
        # silently ignored for the shell/agy worker unless --in-container-test
        # was ALSO passed — a precondition no MCP caller could know about.
        if args.project_dir:
            os.environ["A2_PROJECT_DIR"] = os.path.abspath(args.project_dir)
        if is_container_run and args.test_cmd:
            os.environ["A2_TEST_CMD"] = args.test_cmd
        base_worker = ShellWorker(args.worker_cmd)

    reviewer = ShellReviewer(args.reviewer_cmd, rules_excerpt=_read_worker_rules_excerpt(),
                              project_dir=args.project_dir, task=args.task)

    if args.test_cmd:
        if is_container_run:
            # IN-CONTAINER VALIDATION PATH:
            # When running inside a container (--project-dir / openhands / agy), the test command
            # is executed IN-CONTAINER inside the workspace before the container is destroyed.
            # We intentionally pass default_validate here so SelfCorrectingWorker inspects the
            # in-container result (result.tests_passed / result.testlog) to drive the inner retry loop,
            # preventing host-side TestCommandValidator from executing against non-existent/unmodified host paths.
            validate = default_validate
            worker = SelfCorrectingWorker(base_worker, validate=validate, inner_max=args.inner_max)
            print(f"[info] In-Container Test-Befehl aktiv: {args.test_cmd}", file=sys.stderr)
            print(f"[info] Innere Selbstkorrektur aktiv (max. {args.inner_max} Versuche).", file=sys.stderr)
        else:
            # HOST-SIDE VALIDATION PATH:
            validator = TestCommandValidator(args.test_cmd, cwd=args.test_cwd)
            worker = SelfCorrectingWorker(base_worker, validator, inner_max=args.inner_max)
            validate = validator
            print(f"[info] Unabhängiger Test-Befehl auf Host (autoritativ): {args.test_cmd}", file=sys.stderr)
            print(f"[info] Innere Selbstkorrektur aktiv (max. {args.inner_max} Versuche).", file=sys.stderr)
    else:
        worker = base_worker
        validate = default_validate
        print("[info] Kein --test-cmd — Fallback auf tests_passed aus dem Worker-Envelope "
              "(schwacher Proxy), keine innere Selbstkorrektur.", file=sys.stderr)

    try:
        outcome = run_loop(
            task=args.task,
            worker=worker,
            validate=validate,
            reviewer=reviewer,
            max_rounds=args.max_rounds,
            on_event=lambda msg: print(msg, file=sys.stderr, flush=True),
        )
    except (RuntimeError, ValueError) as exc:
        print(f"[FEHLER] Orchestrator abgebrochen: {exc}", file=sys.stderr)
        append_run_log(
            task=args.task,
            worker_backend=args.worker_backend,
            rounds=0,
            status="ERROR",
            findings=[],
            error=f"Orchestrator abgebrochen: {exc}",
            duration_seconds=time.time() - start_time,
            log_file=args.log_file,
            project_dir=args.project_dir,
        )
        return 1

    print(f"\n=== Ergebnis: {outcome.status} nach {outcome.rounds} Runde(n) ===")
    # AK6: prove no autonomous push/merge ever happened.
    print(f"Autonomer Push/Merge: {'JA — FEHLER!' if outcome.pushed else 'nein (korrekt)'}")

    if outcome.status == STATUS_APPROVED:
        print("Merge-Gate erreicht. Der Merge-Knopf bleibt bei Alex.")
        findings = [e.detail for e in outcome.memory if e.kind == "findings"]
        patch_file = write_patch_file(outcome.diff or "", args.task)
        if patch_file:
            print(f"Diff gespeichert als: {DEFAULT_PATCHES_DIR / patch_file}")
        if outcome.produktberater_empfehlung:
            print("[Empfehlung] Task-Typ: Feature/UI/API-Design — produktberater-Check "
                  "könnte sich lohnen (beratend, siehe docs/kreativteam.md Abschnitt 3b).")
        append_run_log(
            task=args.task,
            worker_backend=args.worker_backend,
            rounds=outcome.rounds,
            status="APPROVED",
            findings=findings,
            error=None,
            duration_seconds=time.time() - start_time,
            log_file=args.log_file,
            patch_file=patch_file,
            project_dir=args.project_dir,
        )
        return 0

    # ESCALATED (either reason): write and show the plain-language question.
    escalation_text = outcome.escalation or ""

    if outcome.status == STATUS_ESCALATED_SELF_CHECK_FAILED and outcome.resumable is not None:
        state_path = _default_resume_state_path(args.escalation_out)
        try:
            state_path.write_text(resumable_state_to_json(outcome.resumable), encoding="utf-8")
            escalation_text += (
                "\n\n---\n💡 **Nächster Schritt, falls du (B) wählst:**\n"
                f"`python3 cli.py --worker-cmd {args.worker_cmd} "
                f"--reviewer-cmd {args.reviewer_cmd} --resume {state_path} --to-reviewer`\n"
            )
        except OSError as exc:
            print(f"[WARN] Zustandsdatei konnte nicht geschrieben werden: {exc}", file=sys.stderr)

    out_path = Path(args.escalation_out)
    try:
        out_path.write_text(escalation_text, encoding="utf-8")
        print(f"\nEskalation geschrieben nach: {out_path}")
    except OSError as exc:
        print(f"[WARN] Eskalation konnte nicht geschrieben werden: {exc}", file=sys.stderr)

    notify_n8n_webhook(
        task=args.task,
        status=outcome.status,
        rounds=outcome.rounds,
        escalation_text=escalation_text,
        escalation_file=str(out_path),
        webhook_url=args.webhook_url,
    )

    findings = [e.detail for e in outcome.memory if e.kind == "findings"]
    append_run_log(
        task=args.task,
        worker_backend=args.worker_backend,
        rounds=outcome.rounds,
        status="ESCALATED",
        findings=findings,
        error=None,
        duration_seconds=time.time() - start_time,
        log_file=args.log_file,
        project_dir=args.project_dir,
    )

    print("\n" + escalation_text)
    return 2

if __name__ == "__main__":
    raise SystemExit(main())
