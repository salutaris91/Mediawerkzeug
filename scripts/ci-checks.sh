#!/usr/bin/env bash
#
# ci-checks.sh — Zentrale CI-Checks für lokales Ausführen, GitHub Actions und andere Worker.
#

set -euo pipefail

echo "=== 1. Syntax Check ==="
for script in scripts/*.sh; do
  if [ -f "$script" ]; then
    bash -n "$script"
  fi
done
echo "[OK] Syntax Check"
echo ""

echo "=== 2. Whitespace Check ==="
# Prüfe gestagte Änderungen auf Whitespace-Fehler
if ! git diff --cached --check; then
  echo "::error::Whitespace-Fehler in gestagten Änderungen gefunden!"
  exit 1
fi

DIFF_BASE="${CI_BASE_REF:-HEAD~1}"
if ! git rev-parse --verify "$DIFF_BASE" >/dev/null 2>&1; then
  echo "Basis $DIFF_BASE existiert nicht (erstes Commit?), falle auf empty-tree zurück."
  DIFF_BASE="4b825dc642cb6eb9a060e54bf8d69288fbee4904"
fi
echo "Prüfe gegen Basis: $DIFF_BASE"
git diff --check "$DIFF_BASE" HEAD
echo "[OK] Keine Trailing Whitespaces"
echo ""

echo "=== 3. Secrets Check ==="
if forbidden="$(git ls-files | grep -iE '(^|/)\.env($|\.)|\.key$|\.pem$|id_rsa|id_ed25519' | grep -v '\.env\.example$')"; then
  if [ -n "$forbidden" ]; then
    echo "::error::Verbotene Dateien (Secrets/Keys) gefunden!"
    echo "$forbidden"
    exit 1
  fi
fi
echo "[OK] Keine verbotenen Secrets eingecheckt"
echo ""

echo "=== 4. Pipeline Validation ==="
./scripts/validate-pipeline.sh "$PWD"
echo "[OK] validate-pipeline.sh erfolgreich"
echo ""

echo "=== 5. Drift Check (Generierte Artefakte) ==="
DRIFT_TARGETS=""
if [ -f "./scripts/build-index.sh" ]; then
  ./scripts/build-index.sh
  DRIFT_TARGETS="$DRIFT_TARGETS rules/99-verfuegbare-tools.md"
fi
if [ -f "./scripts/build-agents-md.sh" ]; then
  ./scripts/build-agents-md.sh .
  DRIFT_TARGETS="$DRIFT_TARGETS AGENTS.md .agents/AGENTS.md"
fi
if [ -f "./scripts/build-skills.sh" ]; then
  ./scripts/build-skills.sh
  DRIFT_TARGETS="$DRIFT_TARGETS .agents/skills/ .claude/skills/"
fi
if [ -d "./rules" ] && [ -f "./scripts/gate-a2/build-worker-rules.sh" ]; then
  ./scripts/gate-a2/build-worker-rules.sh
  DRIFT_TARGETS="$DRIFT_TARGETS scripts/gate-a2/worker-rules.generated.md"
fi

if [ -n "$DRIFT_TARGETS" ]; then
  git diff --exit-code $DRIFT_TARGETS || {
    echo "::error::Drift gefunden! Bitte die Build-Skripte lokal ausführen und die generierten Artefakte mitcommitten."
    exit 1
  }
  echo "[OK] Kein Artefakt-Drift"
fi
echo ""

echo "=== 6. Kit Preflight ==="
if [ -f "./scripts/kit-preflight.py" ] && [ -f "./config/opencode-agents.json" ]; then
  ./scripts/kit-preflight.py
  echo "[OK] kit-preflight.py erfolgreich"
else
  echo "[OK] Kein Kit oder keine SoT vorhanden, überspringe Kit-Preflight."
fi
echo ""

echo "=== ALLE CHECKS BESTANDEN ==="
