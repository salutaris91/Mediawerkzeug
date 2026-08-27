#!/usr/bin/env bash
#
# build-worker-rules.sh — erzeugt worker-rules.generated.md aus rules/*.md.
#
# Extrahiert NUR die Passagen, die zwischen <!-- WORKER-SAFE:START --> und
# <!-- WORKER-SAFE:END --> markiert sind (Marker in den rules/*.md-Quellen
# gesetzt) — der headless agy-Worker im Container bekommt so einen kuratierten
# Auszug statt der vollen, an Alex gerichteten Regeln (Freigabepunkte,
# Rückfragen, Branch-/Push-Workflow sind für den Wegwerf-Container irrelevant).
#
# rules/ bleibt einzige Quelle — nichts hier von Hand pflegen, nur Marker in
# rules/*.md setzen und dieses Skript neu laufen lassen.
#
# Aufruf:
#   scripts/gate-a2/build-worker-rules.sh

set -euo pipefail
export LC_ALL=C.UTF-8

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$OUT_DIR/worker-rules.generated.md"

# Feste Reihenfolge — nur Dateien, die tatsächlich WORKER-SAFE-Marker haben
# (Arbeitsweise/Sicherheit/Codequalität/Commit-Format/Abschluss-Checkliste).
# Freigabepunkte/Rückfrage-Regeln (01, 03, 04, 08) bleiben bewusst außen vor —
# ein headless Container kann nicht mit Alex rückfragen.
FILES=(
  "rules/02-arbeitsweise.md"
  "rules/05-sicherheit.md"
  "rules/06-codequalitaet.md"
  "rules/07-git-commits.md"
  "rules/12-abschluss.md"
)

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

{
  echo "<!-- AUTOMATISCH GENERIERT aus rules/*.md durch scripts/gate-a2/build-worker-rules.sh."
  echo "     NICHT direkt bearbeiten — WORKER-SAFE-Marker in rules/*.md ändern und neu bauen. -->"
  echo
  echo "# Regeln (Auszug für den headless Worker)"
  echo
} > "$TMP"

any_content=0
for rel in "${FILES[@]}"; do
  src="$ROOT/$rel"
  if [ ! -f "$src" ]; then
    echo "Warnung: Quelle nicht gefunden, übersprungen: $rel" >&2
    continue
  fi
  block="$(awk '/WORKER-SAFE:START/{on=1;next} /WORKER-SAFE:END/{on=0;next} on' "$src")"
  if [ -z "$block" ]; then
    continue
  fi
  {
    echo "## Aus $rel"
    echo
    echo "$block"
    echo
  } >> "$TMP"
  any_content=1
done

if [ "$any_content" -eq 0 ]; then
  echo "Fehler: Keine WORKER-SAFE-Marker in ${FILES[*]} gefunden." >&2
  exit 1
fi

# Trim trailing blank lines (loop always appends one after the last block) —
# exactly one final newline, no trailing blank line (CI whitespace check).
printf '%s\n' "$(cat "$TMP")" > "$OUT"
trap - EXIT
chmod 644 "$OUT"
echo "worker-rules.generated.md neu erzeugt: $OUT"

# Größen-Wächter — Vorwarnung, kein harter Abbruch (Prompt-Präfix, kein Volltext-Doc).
MAX_BYTES="${WORKER_RULES_MAX_BYTES:-4096}"
BYTES="$(wc -c < "$OUT" | tr -d ' ')"
echo "Größe: ${BYTES} Bytes (Warnschwelle ${MAX_BYTES})."
if [ "$BYTES" -gt "$MAX_BYTES" ]; then
  echo "Warnung: worker-rules.generated.md nähert sich der Vorwarnschwelle für ein" >&2
  echo "         Prompt-Präfix. Markierten Umfang in rules/*.md prüfen." >&2
fi
