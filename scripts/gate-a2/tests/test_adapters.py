"""Regel-Auszug im Reviewer-Prompt (ADR C3) + Projekt-Kontext für Worker/Reviewer.

Ursprünglich sollte Punkt 2 (kuratierte Regeln für den Reviewer) über einen
neuen ReviewPersonaValidator im validate-Port laufen — verworfen, weil ein
rotes Validierungsergebnis run_loop sofort eskalieren lässt (orchestrator.py)
und den REVISE->Findings->nächste-Runde-Mechanismus (AK4) nie erreicht. Der
bestehende Reviewer-Aufruf läuft ohnehin bei jeder grünen Runde — er bekommt
hier nur zusätzlich den Regel-Auszug (build-worker-rules.sh) als Prüfmaßstab.

Human-readable list (es prüft, dass …):
  1. ohne rules_excerpt ist der Prompt unverändert zum bisherigen Format
     (Regressionsschutz — kein Verhaltenswechsel für bestehende Aufrufer).
  2. mit rules_excerpt enthält der Prompt einen eigenen REGELN-Block vor DIFF.
  3. ShellReviewer reicht seinen rules_excerpt tatsächlich an den Prompt weiter,
     den es an das Reviewer-Kommando übergibt.
  4. ShellReviewer ohne rules_excerpt (Default) baut weiterhin den Prompt ohne
     REGELN-Block.
  5. _read_project_context() AGENTS.md gegenüber CLAUDE.md/README.md priorisiert,
     bei keiner der drei Dateien und bei project_dir=None leer zurückgibt (2026-08-19,
     "damit Agent und Reviewer sich im Projekt gut zurechtfinden").
  6. _build_review_prompt() den project_context-Block vor DIFF einfügt, wenn gesetzt.
  7. ShellReviewer(project_dir=...) den gelesenen Projekt-Kontext tatsächlich in den
     Prompt übernimmt, den es an das Reviewer-Kommando übergibt.
  8. _build_review_prompt() den ursprünglichen task-Block vor DIFF einfügt, wenn
     gesetzt — ohne task bleibt der Prompt unverändert (2026-08-21, schließt die
     Lücke aus docs/plan-gate-a2-bridge.md: "REVIEWER, der den Plan kennt").
  9. ShellReviewer(task=...) den Task tatsächlich in den Prompt übernimmt, den es
     an das Reviewer-Kommando übergibt — ohne task bleibt der Prompt unverändert.
  10. _build_review_prompt() den Reviewer immer (nicht nur mit task/rules/context)
      um eine EMPFEHLUNG-Zeile zum produktberater-Check bittet (2026-08-24,
      docs/kreativteam.md Abschnitt 3b) — reine Instruktionsergänzung, kein neuer
      Parameter.
"""

from unittest.mock import patch

from adapters import ShellReviewer, _build_review_prompt, _read_project_context


def test_prompt_without_rules_excerpt_matches_original_format():
    prompt = _build_review_prompt("d", "t")
    assert "REGELN" not in prompt
    assert prompt.startswith("Review-Modus (nur prüfen).")
    assert "=== DIFF ===\nd\n\n=== TESTLOG ===\nt\n" in prompt


def test_prompt_always_asks_for_produktberater_empfehlung():
    # Instruction is always present, independent of task/rules/context — the
    # reviewer already sees the diff itself, which is enough to classify.
    prompt = _build_review_prompt("d", "t")
    assert "EMPFEHLUNG: PRODUKTBERATER-CHECK JA" in prompt
    assert "EMPFEHLUNG: PRODUKTBERATER-CHECK NEIN" in prompt


def test_prompt_with_rules_excerpt_adds_a_block_before_diff():
    prompt = _build_review_prompt("d", "t", rules_excerpt="Regel X gilt.")
    assert "=== REGELN (Auszug) ===\nRegel X gilt." in prompt
    assert prompt.index("REGELN") < prompt.index("=== DIFF ===")


def test_shell_reviewer_passes_its_rules_excerpt_into_the_prompt():
    captured = {}

    def fake_run(cmd, env=None, timeout=600):
        captured["prompt"] = cmd[2]
        return "VERDICT: APPROVE"

    with patch("adapters._run", side_effect=fake_run):
        ShellReviewer("irrelevant-cmd", rules_excerpt="Regel Y gilt.")("d", "t")

    assert "Regel Y gilt." in captured["prompt"]


def test_shell_reviewer_without_rules_excerpt_stays_unchanged():
    captured = {}

    def fake_run(cmd, env=None, timeout=600):
        captured["prompt"] = cmd[2]
        return "VERDICT: APPROVE"

    with patch("adapters._run", side_effect=fake_run):
        ShellReviewer("irrelevant-cmd")("d", "t")

    assert "REGELN" not in captured["prompt"]


# --- Projekt-Kontext (AGENTS.md/CLAUDE.md/README.md) für Worker + Reviewer ---

def test_read_project_context_prefers_agents_md(tmp_path):
    (tmp_path / "AGENTS.md").write_text("Agenten-Regeln hier.", encoding="utf-8")
    (tmp_path / "CLAUDE.md").write_text("Sollte ignoriert werden.", encoding="utf-8")
    (tmp_path / "README.md").write_text("Sollte auch ignoriert werden.", encoding="utf-8")

    ctx = _read_project_context(str(tmp_path))
    assert "=== PROJEKT-KONTEXT (AGENTS.md) ===" in ctx
    assert "Agenten-Regeln hier." in ctx
    assert "ignoriert" not in ctx


def test_read_project_context_falls_back_to_claude_md(tmp_path):
    (tmp_path / "CLAUDE.md").write_text("Claude-spezifische Regeln.", encoding="utf-8")
    (tmp_path / "README.md").write_text("Sollte ignoriert werden.", encoding="utf-8")

    ctx = _read_project_context(str(tmp_path))
    assert "=== PROJEKT-KONTEXT (CLAUDE.md) ===" in ctx
    assert "Claude-spezifische Regeln." in ctx


def test_read_project_context_falls_back_to_readme(tmp_path):
    (tmp_path / "README.md").write_text("Nur ein README.", encoding="utf-8")

    ctx = _read_project_context(str(tmp_path))
    assert "=== PROJEKT-KONTEXT (README.md) ===" in ctx
    assert "Nur ein README." in ctx


def test_read_project_context_empty_when_nothing_found(tmp_path):
    assert _read_project_context(str(tmp_path)) == ""


def test_read_project_context_empty_when_project_dir_is_none():
    assert _read_project_context(None) == ""


def test_read_project_context_empty_on_invalid_utf8(tmp_path):
    (tmp_path / "AGENTS.md").write_bytes(b"\xff\xfe invalid utf-8 bytes")
    assert _read_project_context(str(tmp_path)) == ""


def test_build_review_prompt_includes_project_context_before_diff():
    prompt = _build_review_prompt("d", "t", project_context="=== PROJEKT-KONTEXT (AGENTS.md) ===\nRegel Z\n\n")
    assert "Regel Z" in prompt
    assert prompt.index("PROJEKT-KONTEXT") < prompt.index("=== DIFF ===")


def test_shell_reviewer_passes_project_context_into_the_prompt(tmp_path):
    (tmp_path / "AGENTS.md").write_text("Projektspezifische Konvention X.", encoding="utf-8")
    captured = {}

    def fake_run(cmd, env=None, timeout=600):
        captured["prompt"] = cmd[2]
        return "VERDICT: APPROVE"

    with patch("adapters._run", side_effect=fake_run):
        ShellReviewer("irrelevant-cmd", project_dir=str(tmp_path))("d", "t")

    assert "Projektspezifische Konvention X." in captured["prompt"]


# --- Task-Kontext für den Reviewer (2026-08-21) ---
# Schließt eine Lücke aus dem freigegebenen Architektur-Plan
# (docs/plan-gate-a2-bridge.md, Ebene 1: "REVIEWER, der den Plan kennt") —
# vorher bekam der Reviewer nie die ursprüngliche Aufgabenbeschreibung, konnte
# also nicht beurteilen, ob ein sauberer Diff auch tatsächlich die gestellte
# Aufgabe löst statt nur handwerklich in Ordnung zu sein.

def test_build_review_prompt_includes_task_before_diff():
    prompt = _build_review_prompt("d", "t", task="Erstelle eine Funktion is_even(n).")
    assert "=== AUFGABE ===\nErstelle eine Funktion is_even(n)." in prompt
    assert prompt.index("AUFGABE") < prompt.index("=== DIFF ===")


def test_build_review_prompt_without_task_stays_unchanged():
    prompt = _build_review_prompt("d", "t")
    assert "AUFGABE" not in prompt


def test_shell_reviewer_passes_task_into_the_prompt():
    captured = {}

    def fake_run(cmd, env=None, timeout=600):
        captured["prompt"] = cmd[2]
        return "VERDICT: APPROVE"

    with patch("adapters._run", side_effect=fake_run):
        ShellReviewer("irrelevant-cmd", task="Erstelle eine Funktion is_even(n).")("d", "t")

    assert "Erstelle eine Funktion is_even(n)." in captured["prompt"]


def test_shell_reviewer_without_task_stays_unchanged():
    captured = {}

    def fake_run(cmd, env=None, timeout=600):
        captured["prompt"] = cmd[2]
        return "VERDICT: APPROVE"

    with patch("adapters._run", side_effect=fake_run):
        ShellReviewer("irrelevant-cmd")("d", "t")

    assert "AUFGABE" not in captured["prompt"]
