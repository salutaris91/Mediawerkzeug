#!/usr/bin/env bash
#
# status.sh — Live-Statuscheck für Gate A2/A3, komplett am (blockierten)
# mcp_server.py vorbei.
#
# mcp_server.py verarbeitet Anfragen strikt nacheinander (eine STDIO-Pipe):
# während ein gate_run_task-Aufruf läuft, kann es keine weitere Anfrage
# beantworten, auch keinen Status-Check. Dieses Skript prüft Prozesse/Docker/
# Run-Log direkt auf dem Host — funktioniert deshalb auch WÄHREND ein Lauf
# aktiv ist. Kein Docker/Python-Import nötig, nur Bordmittel.
#
# Nutzung: ./status.sh   (kein Argument, kein Netzwerkzugriff, read-only)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Laufende cli.py-Prozesse ==="
if ps aux | grep -- "$SCRIPT_DIR/cli.py" | grep -v grep; then
  :
else
  echo "(keiner)"
fi

echo ""
echo "=== Laufender Reviewer (claude --agent reviewer)? ==="
if ps aux | grep -- "--agent reviewer" | grep -v grep; then
  :
else
  echo "(keiner)"
fi

echo ""
echo "=== Letzte Run-Log-Einträge ==="
if [ -f "$SCRIPT_DIR/logs/run-log.jsonl" ]; then
  tail -3 "$SCRIPT_DIR/logs/run-log.jsonl" | python3 -c "
import json, sys
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        d = json.loads(line)
    except json.JSONDecodeError:
        print('(beschädigte Zeile im Run-Log, übersprungen)')
        continue
    print(d.get('timestamp'), d.get('status'), (d.get('task') or '')[:60])
"
else
  echo "(kein Run-Log unter $SCRIPT_DIR/logs/run-log.jsonl gefunden)"
fi

echo ""
echo "=== Docker-Container gerade aktiv? ==="
if command -v docker >/dev/null 2>&1; then
  docker ps --format "{{.Names}}\t{{.Status}}\t{{.Image}}" | grep -Ei "agy|openhands" || echo "(kein Worker-Container aktiv — normal, wenn gerade der Reviewer-Schritt läuft, nicht der Worker)"
else
  echo "(docker nicht verfügbar)"
fi
