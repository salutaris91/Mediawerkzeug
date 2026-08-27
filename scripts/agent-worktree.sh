#!/usr/bin/env bash
#
# agent-worktree.sh — Erzeugt isolierte Git-Worktrees für Agenten
#
# Aufruf:
#   scripts/agent-worktree.sh <branch-name> [base-branch]
#
# Beispiel:
#   scripts/agent-worktree.sh feature/new-login
#   scripts/agent-worktree.sh hotfix/button main
#

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Fehler: Zu wenige Argumente." >&2
  echo "Aufruf: $0 <branch-name> [base-branch]" >&2
  exit 1
fi

BRANCH="$1"
BASE_BRANCH="${2:-main}"

# 1. Branch-Namen validieren (Git-Regeln)
if ! git check-ref-format --branch "$BRANCH"; then
  echo "Fehler: '$BRANCH' ist kein gültiger Git-Branch-Name." >&2
  exit 1
fi

# 2. Branch-Namen für den Ordnernamen sanitizen
SAFE_NAME=$(echo "$BRANCH" | sed -e 's/\//-/g' -e 's/[^a-zA-Z0-9._-]//g' -e 's/^\.//')
WORKTREE_DIR=".worktrees/$SAFE_NAME"

# 3. Prüfen, ob der Worktree-Pfad bereits existiert
if [ -d "$WORKTREE_DIR" ]; then
  echo "Fehler: Worktree-Verzeichnis '$WORKTREE_DIR' existiert bereits!" >&2
  echo "Bitte lösche es zuerst oder wähle einen anderen Branch-Namen." >&2
  exit 1
fi

# 4. Prüfen, ob base-branch existiert
if ! git rev-parse --verify "$BASE_BRANCH^{commit}" >/dev/null 2>&1; then
  echo "Fehler: Base-Branch '$BASE_BRANCH' existiert nicht oder ist ungültig." >&2
  exit 1
fi

# 5. Prüfen, ob der Branch bereits existiert, andernfalls ab base-branch anlegen
if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  echo "Branch '$BRANCH' existiert bereits. Nutze existierenden Branch."
else
  echo "Lege neuen Branch '$BRANCH' basierend auf '$BASE_BRANCH' an..."
  git branch "$BRANCH" "$BASE_BRANCH"
fi

# 6. Worktree anlegen
echo "Erzeuge Worktree in '$WORKTREE_DIR'..."
mkdir -p .worktrees
git worktree add "$WORKTREE_DIR" "$BRANCH"

echo ""
echo "=== Worktree erfolgreich erstellt ==="
echo "Wechsle nun in das Verzeichnis, bevor du den Agenten startest:"
echo "  cd $WORKTREE_DIR"
echo ""
