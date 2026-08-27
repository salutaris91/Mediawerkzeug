"""Put the gate-a2 package dir on sys.path so tests can import orchestrator/adapters."""
import sys
from pathlib import Path

GATE_A2_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(GATE_A2_DIR))

collect_ignore_glob = ["fixtures/*"]
