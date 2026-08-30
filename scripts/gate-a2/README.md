# Gate A2/A3 — Worker↔Reviewer-Orchestrator

CLI-Durchstich des Worker↔Reviewer-Loops aus
[`docs/plan-gate-a2-bridge.md`](../../docs/plan-gate-a2-bridge.md), inklusive
Gate A3: autoritativer `--test-cmd`, Zwei-Schleifen-Architektur (innere
Selbstkorrektur getrennt vom Reviewer-Runden-Budget) und Resume nach
Eskalation.

**Steueroberfläche (2026-08-21):** Die im ursprünglichen Plan vorgesehene
OpenHands Agent Canvas (Schicht 1) wurde nie gebaut. Stattdessen läuft die
Steuerung produktiv über **Open WebUI + `mcpo`** (MCP-Tools, siehe unten) —
das war keine bewusst getroffene, dokumentierte Architekturentscheidung,
sondern hat sich in der Praxis so ergeben. Siehe `ROADMAP.md` für den
zugehörigen offenen Punkt.

## Aufbau

| Datei | Rolle |
|---|---|
| `orchestrator.py` | Die reine Loop-Zustandsmaschine (`run_loop`). Kennt **kein** subprocess, kein Docker — nur die Logik. Worker/Validator/Reviewer sind injizierte Ports. Trägt auch die Eskalations-Erklärschicht und die Resume-Zustandsdatenklassen. |
| `adapters.py` | Die **einzige** Schicht mit `subprocess`. `ShellWorker`/`ShellReviewer`, `TestCommandValidator` (autoritativer Test), `SelfCorrectingWorker` (innere Selbstkorrektur, ADR B2) + der Kommando-Kontrakt (Envelope). |
| `cli.py` | Verdrahtet den Loop mit realen oder Mock-Kommandos, inkl. `--test-cmd`/`--inner-max`/`--resume`. Exit: `0`=APPROVED, `2`=ESCALATED, `1`=Fehler. |
| `run_agy_worker_a2.sh` | **Echter** Worker-Runner: agy im isolierten Volume, `git init` im Workspace, **ohne** `--dangerously-skip-permissions`, Envelope auf stdout. A2-Kopie (nicht branch-gelockt). |
| `reviewer-a2.sh` | Reviewer-Wrapper mit **konfigurierbarem** Endpoint (`REVIEWER_BASE_URL` aus `.env` statt hartcodiert). Bewusst A2-scoped — hält beliebige Fremd-Endpoints aus dem geteilten Kit-Reviewer heraus. |
| `mocks/mock_worker.sh` | Erfüllt den Envelope-Kontrakt ohne Docker/agy. Szenario via `A2_MOCK_WORKER_SCENARIO`. |
| `mocks/mock_reviewer.sh` | Liefert ein `VERDICT` ohne echtes Modell. Szenario via `A2_MOCK_REVIEWER_SCENARIO`. |
| `status.sh` | Live-Statuscheck am (blockierten) `mcp_server.py` vorbei — läuft was gerade, letzte Run-Log-Einträge. Siehe „Live-Status" unten. |
| `tests/` | Die 6 A2-Akzeptanzkriterien + Adapter-Durchstich + VERDICT-Parsing + `--test-cmd` + `SelfCorrectingWorker`/Resume, alles als `pytest`. |

## Warum Dependency Injection

Die Loop-Intelligenz ist der Erfolgsfaktor (siehe Plan). Sie bleibt frei von
Docker/agy/subprocess, damit sie **billig und deterministisch** gegen Python-Fakes
getestet werden kann — und dieselbe Logik gegen die Shell-Mocks *und* später gegen
den echten agy-Runner läuft. Der eine teure End-to-End-Lauf kommt zum Schluss.

## Loop (Kurzform)

```
worker(task, memory)    -> commit + diff + testlog           (AK1)
validate(result)        -> rot? SOFORT eskalieren,            (AK2, ADR B1/B3:
                            Reviewer wird NIE gerufen           Wiederholungen
                                                                 leben nur im
                                                                 Worker/Wrapper)
reviewer(diff, testlog) -> VERDICT                            (AK3)
sanity_check(result, verdict) -> ggf. APPROVE -> REVISE        (Orchestrator-Fakten-Check,
                                                                 s. u. "Sanity-Check")
    APPROVE -> Merge-Gate, STOP, Alex drückt den Knopf        (AK6, kein autonomer Push)
    REVISE  -> Findings ins Runden-Memory                     (AK4)
nach max. 3 REVIEWER-Runden ohne APPROVE -> Eskalation        (AK5, ESCALATED_REVIEW_BUDGET_EXHAUSTED)
rote Validierung -> Eskalation, Reviewer nie gefragt          (ADR B3, ESCALATED_SELF_CHECK_FAILED,
                                                                 resumierbar via --resume --to-reviewer)
```

## Sanity-Check: der Orchestrator prüft auch den Reviewer (2026-08-19)

`--test-cmd` sorgt dafür, dass ein **objektiver Fakt** das Selbsturteil des *Workers*
schlägt (*Fakten schlagen Meinung*). Dasselbe Prinzip gilt jetzt auch für den
*Reviewer*: `run_loop` ruft nach jedem `VERDICT: APPROVE` zusätzlich
`sanity_check(result, verdict)` auf (Default: `default_sanity_check`,
`orchestrator.py`) — ein zweites, deterministisches Gate, symmetrisch zu
`validate()` (das *vor* dem Reviewer prüft, AK2).

Konkreter Anlass (Test #10, `cwa-alexandria`): Der Reviewer hat einen
**komplett leeren Diff** in Runde 1 sofort `APPROVE`d — nichts wurde je
geschrieben, trotzdem meldete der Loop `APPROVED`. `default_sanity_check`
verwirft ein `APPROVE` jetzt hart, wenn `result.diff` leer/nur Whitespace ist
(Finding `[kritisch] Diff ist leer …`), unabhängig davon, was der Reviewer
gesagt hat. Der Resume/Diagnose-Pfad (`--resume --to-reviewer`) wendet
denselben Check an.

**Erweiterbar, ohne den Loop anzufassen:** `sanity_check` ist ein eigener,
injizierbarer Port (`SanityCheckFn`, wie `validate`/`reviewer`). Weitere
objektive Prüfungen (z. B. die zurückgestellte Diff-vs-Task-Plausibilität,
siehe `ROADMAP.md`) kommen als zusätzliche Checks **innerhalb**
`default_sanity_check` (oder als eigene injizierte Funktion) dazu — `run_loop`
selbst bleibt unverändert.

## Gegen die Mocks laufen (kein Docker, keine `.env` nötig)

```bash
cd scripts/gate-a2
# APPROVE-Pfad (Runde 1 grün + APPROVE):
A2_MOCK_STATE_DIR=/tmp/a2s1 A2_MOCK_WORKER_SCENARIO="green" A2_MOCK_REVIEWER_SCENARIO="approve" \
  python3 cli.py --task "Null-Schreibtest" \
    --worker-cmd mocks/mock_worker.sh --reviewer-cmd mocks/mock_reviewer.sh

# Selbstprüfung schlägt fehl -> SOFORTIGE Eskalation, Reviewer wird NICHT gerufen:
A2_MOCK_STATE_DIR=/tmp/a2s2 A2_MOCK_WORKER_SCENARIO="red" A2_MOCK_REVIEWER_SCENARIO="approve" \
  python3 cli.py --task "Null-Schreibtest" \
    --worker-cmd mocks/mock_worker.sh --reviewer-cmd mocks/mock_reviewer.sh

# Eskalations-Pfad über den Reviewer (3x REVISE):
A2_MOCK_STATE_DIR=/tmp/a2s3 A2_MOCK_WORKER_SCENARIO="green" A2_MOCK_REVIEWER_SCENARIO="revise,revise,revise" \
  python3 cli.py --task "Null-Schreibtest" \
    --worker-cmd mocks/mock_worker.sh --reviewer-cmd mocks/mock_reviewer.sh
```

## Autoritative Validierung: `--test-cmd`

Standardmäßig glaubt der Loop dem `tests_passed` aus dem Worker-Envelope — ein
schwacher „hat geschrieben/committet"-Proxy, kein Beweis, dass der Code läuft. Mit
`--test-cmd` führt der Orchestrator einen **eigenen, unabhängigen** Test-/Lint-Befehl
aus. **Dessen Exit-Code entscheidet** (0 = grün, sonst rot); das Selbsturteil des
Workers wird ignoriert (*Fakten schlagen Meinung*).

```bash
cd scripts/gate-a2
# Worker behauptet grün, aber der echte Test ist rot -> Reviewer wird NIE gerufen,
# es eskaliert. Beweist: der unabhängige Lauf schlägt den Proxy.
A2_MOCK_STATE_DIR=$(mktemp -d) A2_MOCK_WORKER_SCENARIO="green" \
  python3 cli.py --task "Durchstich" \
    --worker-cmd mocks/mock_worker.sh --reviewer-cmd mocks/mock_reviewer.sh \
    --test-cmd "exit 1" --max-rounds 2

# Realer Einsatz: echter Testbefehl im Ziel-Workspace.
#   --test-cmd "pytest -q && ruff check"   --test-cwd <pfad-zum-code>
```

Zwei Fehlerklassen, strikt getrennt (kein stilles Scheitern):
- **`exit != 0`** — normales **Rot**, zurück an den Worker.
- **Runner nicht auffindbar (`exit 127`) oder Timeout** — **lauter Fehler**
  (`RuntimeError`). Ein fehlendes `pytest` ist ein *Umgebungs*problem, kein
  Code-Fehler, und darf den Worker nicht sinnlos rotieren lassen.

> **Sicherheit:** `--test-cmd` läuft über die Shell (damit `&&`/Pipes gehen) und
> darf **nur** aus vertrauenswürdiger CLI-Konfiguration kommen, **nie** aus
> Worker-/Modell-Ausgabe — sonst könnte der Worker Host-Befehle einschleusen.

> **Weiterhin offen:** Beim echten agy-Worker liegt der erzeugte Code im
> isolierten Docker-Volume. `--test-cwd` gegen diesen Workspace zu verdrahten
> (Test im Container **oder** kontrollierter Export, ADR A2-5) ist kein
> Loop-Thema mehr, sondern Integrationsarbeit für den scharfen End-to-End-Lauf.

## Innere Selbstkorrektur (`--inner-max`, Gate A3 Paket 1)

Mit `--test-cmd` wickelt `cli.py` den Worker automatisch in einen
`SelfCorrectingWorker` (ADR B2): Bei Rot ruft der Wrapper den Worker erneut auf
— bis zu `--inner-max`-mal (Default 3) — **bevor** `run_loop` das Ergebnis
überhaupt sieht. Diese inneren Versuche verbrauchen **kein** Reviewer-Runden-
Budget (ADR B1); nur wenn der Wrapper erschöpft ist, sieht der Orchestrator
ein rotes Ergebnis und eskaliert.

**Ohne `--test-cmd` gibt es keine Selbstkorrektur** — gegen den schwachen
Envelope-Proxy zu konvergieren wäre wertlos (Council-Entscheidung: Fakten
schlagen Meinung muss zuerst stehen, dann erst der innere Loop).

```bash
cd scripts/gate-a2
# --test-cmd selbst ist beim 1. Versuch rot, beim 2. grün (Marker-Datei) —
# der Wrapper fängt das INNERHALB Runde 1 auf, der Reviewer sieht nur 1 Runde:
MARKER=$(mktemp -u)
A2_MOCK_STATE_DIR=$(mktemp -d) A2_MOCK_WORKER_SCENARIO="green" A2_MOCK_REVIEWER_SCENARIO="approve" \
  python3 cli.py --task "Durchstich" \
    --worker-cmd mocks/mock_worker.sh --reviewer-cmd mocks/mock_reviewer.sh \
    --test-cmd "test -f $MARKER && exit 0 || { touch $MARKER; exit 1; }" --inner-max 3
```

## Eskalation & Resume (`--resume` / `--to-reviewer`, ADR B3/B4)

Es gibt zwei Eskalationsgründe mit unterschiedlichen Optionen für Alex:

- **`ESCALATED_SELF_CHECK_FAILED`** — die innere Selbstkorrektur ist erschöpft,
  **der Reviewer wurde nie gerufen**. Die Eskalationsdatei (`a2-eskalation.md`)
  erklärt nicht-technisch, was passiert ist, und bietet drei Optionen: (A)
  nochmal versuchen mit Hinweis, **(B) an den Reviewer abgeben**, (C) Aufgabe
  anpassen/verwerfen. Zusätzlich schreibt `cli.py` eine maschinenlesbare
  Zustandsdatei (`a2-eskalation-state.json`, Default-Pfad aus
  `--escalation-out` abgeleitet) und hängt einen fertigen Copy-Paste-Befehl
  für Option B an den Footer der `.md`-Datei an.
- **`ESCALATED_REVIEW_BUDGET_EXHAUSTED`** — der bestehende AK5-Pfad (3x
  REVISE). Der Reviewer war hier schon beteiligt; „an ihn abgeben" gibt es
  daher nur beim ersten Fall.

```bash
cd scripts/gate-a2
# Eskalation erzeugen (Selbstprüfung bleibt rot):
A2_MOCK_STATE_DIR=$(mktemp -d) A2_MOCK_WORKER_SCENARIO="green" A2_MOCK_REVIEWER_SCENARIO="approve" \
  python3 cli.py --task "Palindrome-Funktion" \
    --worker-cmd mocks/mock_worker.sh --reviewer-cmd mocks/mock_reviewer.sh \
    --test-cmd "exit 1" --inner-max 2
# -> schreibt a2-eskalation.md + a2-eskalation-state.json, Exit 2.
# Die .md enthält am Ende die fertige Befehlszeile für Option B, z. B.:
#   python3 cli.py --worker-cmd ... --reviewer-cmd ... \
#     --resume a2-eskalation-state.json --to-reviewer

# Option B ausführen — der Reviewer bekommt den zuletzt roten Diff+Testlog
# zur Diagnose (kein erneuter Worker-Lauf, kein Git-Stand-Abgleich, ADR B5):
python3 cli.py --worker-cmd mocks/mock_worker.sh --reviewer-cmd mocks/mock_reviewer.sh \
  --resume a2-eskalation-state.json --to-reviewer
```

`--resume` ohne `--to-reviewer` ist ein klarer Fehler (Exit 1) — Paket 1
implementiert nur diesen einen Wiedereinstieg; Option A braucht keinen
speziellen Flag (einfach `cli.py` mit ergänztem `--task` neu starten).

## Tests

```bash
cd scripts/gate-a2
python3 -m pytest tests/ -q     # braucht pytest
```

## Kommando-Kontrakt (für den echten Runner)

Ein Worker-Kommando muss auf stdout diesen Envelope liefern. `DIFF` und `TESTLOG`
sind **base64** (einzeilig), damit ihr Inhalt nie mit den Markern kollidiert (ein
echter Diff kann `===A2-...===` enthalten):

```
===A2-COMMITTED===
true|false
===A2-TESTS-PASSED===
true|false
===A2-DIFF-B64===
<base64 des Diffs>
===A2-TESTLOG-B64===
<base64 des Testlogs>
===A2-END===
```

Ein Reviewer-Kommando muss eine Zeile `VERDICT: APPROVE` oder `VERDICT: REVISE`
ausgeben. Details in [`adapters.py`](adapters.py).

## Echter Worker-Runner

`run_agy_worker_a2.sh` fährt agy im isolierten Volume mit lokalem git und gibt den
Envelope auf stdout aus (Diagnostik auf stderr).

```bash
cd scripts/gate-a2
# Plumbing-Self-Test: echtes Docker/git/Envelope, aber OHNE Modell-Call:
A2_SKIP_AGY=1 ./run_agy_worker_a2.sh "Null-Schreibtest"
./run_agy_worker_a2.sh teardown   # Workspace-Volume aufräumen
```

**Zwei Modi** (über `A2_ALLOW_WRITE`), jeweils mit passender `tests_passed`-Semantik:
- **Null-Schreibtest (Default):** agy läuft **ohne** `--dangerously-skip-permissions`
  (und ohne TTY) → kann nicht schreiben. `tests_passed=true`, wenn der Workspace nach
  sauberem Lauf **leer** ist (Berechtigungsgrenze hielt). Invertiert, bewusst.
- **Schreib-Modus (`A2_ALLOW_WRITE=1`):** agy läuft **mit**
  `--dangerously-skip-permissions` (sicher: Wegwerf-Container, kein Host-Mount, kein
  git-Remote) und soll Code schreiben. `tests_passed=true`, wenn der Workspace nach
  sauberem Lauf **nicht-leer** ist (agy hat geschrieben).

In beiden Modi bedeutet `agy exit != 0` (Absturz/Timeout) `tests_passed=false`.

> Dieses envelope-`tests_passed` ist nur noch der **Fallback-Proxy** (schwach: „hat
> geschrieben", nicht „funktioniert"). Der autoritative Weg ist `--test-cmd` — siehe
> unten.

## Projekt-Kontext für Worker & Reviewer (`AGENTS.md`/`CLAUDE.md`/`README.md`, 2026-08-19)

Hat das per `project_dir` bearbeitete **Zielprojekt** selbst eine `AGENTS.md`,
`CLAUDE.md` oder `README.md` (z. B. weil es auch mit diesem Starter-Kit
aufgesetzt wurde), wird sie automatisch dem Prompt vorangestellt — bei **beiden**
Worker-Backends (`run_agy_worker_a2.sh` und `OpenHandsWorker`) und beim
**Reviewer** (`ShellReviewer`). Priorität: `AGENTS.md` (bereits aufgelöster
Volltext, keine `@`-Import-Syntax) vor `CLAUDE.md` vor `README.md` — nur die
erste gefundene Datei wird verwendet, keine Duplizierung.

**Wichtig, zur Abgrenzung:** Das ist etwas anderes als der Kit-eigene
`rules_excerpt` (`worker-rules.generated.md`) — der enthält generische
Coding-Regeln *dieses Kits*, unabhängig vom Zielprojekt. Der Projekt-Kontext
hier ist die **Selbstbeschreibung des Zielprojekts**, geschrieben genau für
diesen Zweck (KI-Agenten-Onboarding). Beide Blöcke koexistieren im Prompt.

Ohne passende Datei im Zielprojekt ändert sich nichts am bisherigen Verhalten
(leerer String, byte-genau derselbe Prompt wie vorher).

## Aus einem Kreativteam-Briefing eine Task formulieren (2026-08-24)

Es gibt keine automatische Kopplung zwischen dem Kreativteam (OpenCode,
`docs/kreativteam.md`) und `gate_run_task` (siehe `ROADMAP.md`, "Brücke
Planung→Ausführung nicht gebaut") — der Übergang bleibt manuell. Eine
Konvention macht ihn aber verlustfrei:

**Akzeptanzkriterien gehören mit in den `--task`-Text**, nicht nur ins
Briefing-Dokument. Der Reviewer bekommt den vollständigen Task-Text als
`=== AUFGABE ===`-Block vor dem Diff (`_build_review_prompt()` in
`adapters.py`) — reicht ein einfaches Format:

```text
[Ziel/Kontext] ...

Akzeptanzkriterien:
- Es prüft, dass ...
- Es stellt sicher, dass ...
```

**Nach `APPROVED`, bei Feature-/UI-/API-Design-Tasks:** ein beratender
(nicht blockierender) inhaltlicher Check durch den `produktberater` aus dem
Kreativteam, bevor Alex sein eigenes Review macht — der technische Reviewer
hier urteilt über Code-Qualität, nicht über Produktpassung. Details, inkl.
Trigger-Regel wann sich der Schritt lohnt, in `docs/kreativteam.md`,
Abschnitt 3b.

**Automatische Einschätzung (2026-08-24):** Der Reviewer gibt bei jedem
`APPROVE` zusätzlich eine `EMPFEHLUNG: PRODUKTBERATER-CHECK JA/NEIN`-Zeile
ab (`_build_review_prompt()`, geparst in `orchestrator.parse_verdict()`).
`cli.py` zeigt sie bei `JA` als `[Empfehlung]`-Zeile in der
Abschluss-Zusammenfassung. Rein beratend — nie eine Bedingung für
`APPROVE`/`REVISE`, ersetzt nicht die eigene Einschätzung.

## Voraussetzung: Reviewer-Subagent global ausgespielt (Gate A3 Paket 3)

`reviewer-a2.sh` und `../opencode-reviewer.sh` starten Claude Code mit
`--agent reviewer` — dafür muss der Subagent `reviewer` in `.claude/agents/*.md`
definiert sein. Das Kit pflegt diese Definition als **eine Wahrheitsquelle** unter
[`agents/reviewer.md`](../../agents/reviewer.md) im Repo-Root (nicht projektlokal
dupliziert, siehe „Designprinzip: eine Wahrheitsquelle" im Haupt-README) und
spielt sie **global** aus:

```bash
~/Documents/ai-coding-starter-kit/scripts/build-global.sh
```

Das ist derselbe einmalige Setup-Schritt, den auch Regeln und Skills brauchen —
auf einem frischen Klon/einer neuen Maschine also **vor** dem ersten Gate-A2/A3-
Lauf einmal ausführen. Ohne diesen Schritt brechen `reviewer-a2.sh` und
`opencode-reviewer.sh` mit einer klaren Fehlermeldung ab, die genau auf diesen
Befehl verweist.

## Reviewer-Endpoint (`.env`)

`reviewer-a2.sh` liest Endpoint, Key und Modell aus der `.env` im Arbeitsverzeichnis
(alle drei **erforderlich** — kein stiller Default-Endpoint):

```
REVIEWER_BASE_URL=<endpoint>          # z.B. https://aiprimetech.io
REVIEWER_API_KEY=<token>
REVIEWER_MODEL=<model-id>             # z.B. claude-opus-4-8
```

Der Key wird als **Bearer-Token** (`ANTHROPIC_AUTH_TOKEN`) gesetzt — das erwarten
die meisten Fremd-Gateways. Für den **offiziellen** Anthropic-Endpoint wäre
stattdessen `ANTHROPIC_API_KEY` (x-api-key) nötig; dann die eine Export-Zeile im
Skript umstellen.

> **Sicherheit:** Der Endpoint sieht jeden Diff *und* kann die Reviewer-Antwort
> verändern. Für Fremd-Gateways nur bei Wegwerf-/Leer-Diff-Tests unbedenklich.

Prüfen ohne Key-Leak: `./reviewer-a2.sh --dry-run` (aus dem `.env`-Verzeichnis).

## Scharfer End-to-End-Lauf (Freigabepunkt)

Aus dem **Worktree-Root** (dort liegt die `.env`):

```bash
# Null-Schreibtest (agy darf nicht schreiben):
python3 scripts/gate-a2/cli.py --task "Null-Schreibtest" \
  --worker-cmd scripts/gate-a2/run_agy_worker_a2.sh \
  --reviewer-cmd scripts/gate-a2/reviewer-a2.sh

# Echter Coding-Task (Schreib-Modus):
A2_ALLOW_WRITE=1 python3 scripts/gate-a2/cli.py \
  --task "Schreibe in palindrome.py eine Funktion is_palindrome(text) …" \
  --worker-cmd scripts/gate-a2/run_agy_worker_a2.sh \
  --reviewer-cmd scripts/gate-a2/reviewer-a2.sh
```

Braucht `.env` (Reviewer-Endpoint) + **Alex' Go**. Beide Endpfade sind scharf
bewiesen: Eskalation (Null-Schreibtest) und APPROVE→Merge-Gate (Coding-Task, 3
Runden bis Konvergenz). Kein autonomer Push/Merge.

## Plan B: OpenHands als zweites Worker-Backend (`--worker-backend openhands`)

Als Alternative zum agy-Pfad (Abo-Login) kann der Worker vollständig **API-keyed** über das OpenHands SDK betrieben werden (Plan B). Dieser Pfad ist Docker-isoliert via `DockerWorkspace` und benötigt `WORKER_LLM_BASE_URL`, `WORKER_LLM_API_KEY` und `WORKER_LLM_MODEL` in der `.env`.

Beispielaufruf für Plan B:

```bash
uv run --with "openhands-sdk==1.36.1" --with "openhands-workspace==1.36.1" \
  python3 scripts/gate-a2/cli.py \
    --task "Schreibe in palindrome.py eine Funktion is_palindrome(text) …" \
    --worker-backend openhands \
    --reviewer-cmd scripts/gate-a2/reviewer-a2.sh
```

## MCP-Server (`mcp_server.py`) — Schnittstelle für Open WebUI & n8n

Der MCP-Server (`scripts/gate-a2/mcp_server.py`) exponiert die Gate-A2/A3-Operationen als Werkzeugset gemäß der MCP-Spezifikation (2024-11-05) über STDIO-Transport.

Um Protokollkollisionen auf `sys.stdout` zu verhindern, führt der MCP-Server `cli.py` über Subprozesse aus. Sämtliche Server-Logs werden strikt auf `sys.stderr` geschrieben.

### Verfügbare MCP-Werkzeuge

1. `gate_run_task`: Führt `cli.py` synchron mit den gewählten Parametern aus. **Dies ist das einzige Werkzeug für Zugriff auf lokale Projektdateien** — auch für reines Lesen/Analysieren eines Projekts (der Worker hat vollen Lese-/Schreibzugriff auf `project_dir`, nicht nur für Code-Änderungen). **Nur `task` ist ein Pflichtfeld.**
   - `reviewer_cmd`/`worker_cmd` sind **absichtlich nicht Teil des LLM-seitigen Werkzeugschemas** (nicht nur per Beschreibung abgeraten, sondern strukturell entfernt) — sie liegen fest im Kit-Repository (`reviewer-a2.sh` / `run_agy_worker_a2.sh`), unabhängig von `project_dir`. Wer sie dennoch braucht (z. B. Tests, Mocks), kann `execute_gate_run_task()` weiterhin direkt mit diesen Python-Parametern aufrufen — nur das LLM-Schema bietet sie nicht mehr an.
   - Weitere optionale Parameter: `project_dir` (betrifft nur den zu bearbeitenden Code, nicht die Skript-Pfade), `test_cmd`, `worker_backend`, `in_container_test`, `inner_max`, `max_rounds`, `escalation_out`.
   - **Fail-fast-Konfigurationscheck:** Bevor der Default-Reviewer läuft, prüft `mcp_server.py`, ob `REVIEWER_BASE_URL` in `.env` echt konfiguriert ist (nicht leer, nicht Platzhalter). Fehlt das, liefert `gate_run_task`/`gate_resume_task` sofort `status: ERROR` mit einer klaren `[Konfigurationsfehler]`-Meldung zurück — ohne den Worker überhaupt erst zu starten.
   - **Schreib-Modus ist über diesen Pfad immer aktiv:** `mcp_server.py` setzt `A2_ALLOW_WRITE=1` fest für den `cli.py`-Subprozess (beide Backends) — ebenfalls **strukturell, nicht als Werkzeugparameter**, aus demselben Grund wie bei `worker_cmd`/`reviewer_cmd`. `gate_run_task` soll echte Aufgaben erledigen, nicht den Null-Schreibtest fahren; der bleibt als manueller Diagnose-Pfad direkt über `run_agy_worker_a2.sh`/`cli.py` erhalten (siehe „Echter Worker-Runner" oben).
   - **`project_dir`-Fail-Fast-Guard (2026-08-19):** Erkennt heuristisch, wenn der Task-Text einen absoluten Projektpfad nennt, aber `project_dir` fehlt oder auf einen anderen Pfad zeigt — dann sofortiger `status: ERROR` (`[project_dir-Warnung]`), **bevor** überhaupt ein Worker/Reviewer-Durchlauf startet. Reproduzierter Anlass: das aufrufende Modell hat den Pfad wiederholt nur in der Aufgabenbeschreibung erwähnt, `project_dir` selbst aber nicht gesetzt — der Worker arbeitete dadurch mehrfach an einem leeren Workspace, ohne dass das erkennbar war (leerer Diff über mehrere Runden, ~13 Minuten verschwendet). Optionaler Fallback: `DEFAULT_PROJECT_DIR` in `.env` (siehe `.env.example`) — greift nur, wenn `project_dir` fehlt UND der Task-Text keinen abweichenden Pfad nennt, damit ein im Text genannter, anderer Pfad niemals still überschrieben wird.
2. `gate_get_escalation_details`: Liest den Inhalt von `a2-eskalation.md` und `a2-eskalation-state.json` aus.
3. `gate_resume_task`: Führt den Resume-Pfad (`cli.py --resume --to-reviewer`) zur Diagnose aus. `reviewer_cmd` ist ebenfalls nicht Teil des LLM-Schemas (siehe oben), gleicher Fail-fast-Check gilt.
4. `gate_apply_result`: Wendet ein zuvor `APPROVED`-Ergebnis auf einen **echten** Projektordner an — auf einem **neuen** Branch, nie auf dem aktuell ausgecheckten Stand. Siehe eigener Abschnitt „Ergebnis übernehmen" unten. **Darf niemals automatisch direkt nach `gate_run_task` aufgerufen werden** — nur auf Alex' separate, explizite Anweisung ("übernehmen").
5. `gate_read_roadmap`: Liest die `ROADMAP.md` **des Gate-A2/A3-Kit-Repositories selbst** — nicht des per `project_dir` bearbeiteten Zielprojekts.
6. `gate_read_stand`: Liest die flüchtige Datei `STAND.md` **des Gate-A2/A3-Kit-Repositories selbst** — nicht des per `project_dir` bearbeiteten Zielprojekts.
7. `gate_status`: Momentaufnahme — läuft gerade ein `cli.py`-Prozess, was war der letzte `run-log.jsonl`-Eintrag. **Nur zwischen Läufen nützlich**, siehe „Live-Status" unten für die Einschränkung.

## 📊 Live-Status während eines laufenden Aufrufs

`mcp_server.py` verarbeitet Anfragen strikt nacheinander (eine einzige STDIO-Pipe). Läuft bereits ein `gate_run_task`-Aufruf, kann `gate_status` als MCP-Werkzeug **nicht antworten** — die Anfrage wird erst gelesen, wenn der andere fertig ist. `gate_status` ist deshalb nur zwischen Läufen nützlich, nie als Live-Fortschrittsanzeige für einen aktiven Lauf.

Für den Live-Fall gibt es `status.sh` — ein eigenständiges Skript, das komplett am `mcp_server.py`-Prozess vorbei direkt auf Prozesse/Docker/Run-Log schaut:

```bash
cd scripts/gate-a2
./status.sh
```

Zeigt: laufende `cli.py`-Prozesse, laufenden Reviewer-Schritt (`claude --agent reviewer`), die letzten 3 Run-Log-Einträge, aktive Worker-Docker-Container. Read-only, kein Netzwerkzugriff, funktioniert auch während ein Lauf aktiv ist.

## 📥 Ergebnis übernehmen (`gate_apply_result`)

Der Worker läuft in einem Wegwerf-Docker-Container (AK6: keine automatische Schreib-Wirkung auf den Host). Ohne einen expliziten weiteren Schritt verpufft ein erfolgreiches (`APPROVED`) Ergebnis beim nächsten Lauf spurlos — es gab bis 2026-08-19 keinen Weg, es tatsächlich in ein echtes Projekt zu bekommen.

**Wie es jetzt funktioniert:**
1. Bei `APPROVED` schreibt `cli.py` automatisch den Diff der gewinnenden Runde als `.patch`-Datei nach `scripts/gate-a2/logs/patches/<utc-timestamp>-<task-slug>.patch` und verlinkt Dateiname + `project_dir` im `run-log.jsonl`-Eintrag.
2. Auf Alex' **separate, explizite** Anweisung ("übernehmen", "wende das an") ruft das Modell `gate_apply_result(project_dir)` auf.
3. `gate_apply_result` führt vier Sicherheits-Leitplanken aus, bevor irgendetwas verändert wird:
   - **Clean-Tree-Check:** `git status --porcelain` im `project_dir` muss leer sein, sonst Abbruch (kein Datenverlust durch Überschreiben).
   - **Trockenlauf zuerst:** `git apply --check <patch>` läuft, **bevor** überhaupt ein Branch angelegt wird — ein nicht mehr anwendbarer Patch hinterlässt keinen leeren Branch zum Aufräumen.
   - **Harter Branch-Zwang:** Immer ein neuer Branch (Default `a2/<utc-timestamp>`, optional `branch_name`), nie der aktuell ausgecheckte Stand — auch nicht bei einem Feature-Branch, den Alex gerade offen hat.
   - **Kein Push:** Nach `git apply` + `git commit` bleibt der neue Branch lokal und ausgecheckt — Alex öffnet die Dateien direkt (Finder/Editor), testet, entscheidet über den nächsten Schritt selbst.
4. `patch_id` ist optional — ohne Angabe wird automatisch das **neueste** `APPROVED`-Ergebnis **mit passendem `project_dir`** gewählt (nie versehentlich ein Patch eines anderen Projekts).

**Sicherheitshinweis:** `branch_name`/`patch_id` laufen ausschließlich über `subprocess.run([...])` mit Argument-Listen (nie `shell=True` mit interpolierten Strings) und werden validiert (`branch_name` gegen ein konservatives Zeichen-Set, `patch_id` nur als Nachschlage-Schlüssel im Run-Log, nie als roher Dateipfad) — Command-Injection- und Path-Traversal-sicher.

### Einbindung in Open WebUI

Open WebUI bindet externe Werkzeuge über OpenAPI/HTTP-Endpunkte an. Zur Anbindung des STDIO-MCP-Servers wird der native `mcpo`-Bridge-Prozess auf dem Mac-Host gestartet:

```bash
# 1. Open WebUI in Docker Compose starten:
docker compose up -d open-webui

# 2. Native mcpo Host-Bridge starten (Port 8001):
./scripts/start-mcpo-host.sh
```

In Open WebUI unter **Admin Panel → Einstellungen → Integrationen → Externe Werkzeug-Server (OpenAPI)**:
- **URL:** `http://localhost:8001` (bzw. `http://127.0.0.1:8001`)
- **Authentifizierung:** `Keine`

#### Empfohlener System-Prompt für Open-WebUI-Modelle

Für eine optimale Werkzeug-Nutzung empfiehlt sich in Open WebUI (**Arbeitsbereich → Modelle → Modell bearbeiten → System-Prompt**) folgende Vorlage:

```text
Du bist der Gate-A2/A3-Orchestrator-Assistent für Alex.
Du hast KEINEN eigenen Dateisystemzugriff. `gate_run_task` ist dein EINZIGES Mittel, um Inhalte in einem lokalen Projekt zu lesen, zu analysieren oder zu ändern — auch für reine Analyse-/Übersichtsaufgaben ohne Code-Änderung. Verwechsle es nicht mit einem reinen "Code ändern"-Werkzeug.
Du hast Zugriff auf Werkzeuge zur Steuerung von autonomen Coding-Aufgaben:
- `gate_run_task`: Startet eine neue Aufgabe mit Worker und Reviewer. Rufe dieses Werkzeug NUR mit `task` (und optional `project_dir`/`test_cmd`) auf — die verwendeten Worker-/Reviewer-Skripte sind fest im Kit-Repository vorkonfiguriert, unabhängig von `project_dir`. Wenn der Nutzer ein externes Projektverzeichnis nennt, übergib diesen Pfad IMMER als `project_dir` an `gate_run_task` — nicht nur im Task-Text erwähnen.
- `gate_read_roadmap` / `gate_read_stand`: Liest die Roadmap bzw. den Stand des Gate-A2/A3-Kit-Repositories SELBST — NICHT des per `project_dir` bearbeiteten Zielprojekts. Verwende diese Werkzeuge nicht, um etwas über ein externes Projekt herauszufinden.
- `gate_get_escalation_details`: Prüft Details zu offenen Eskalationen.
- `gate_resume_task`: Übergibt einen abgebrochenen Task an den Reviewer zur Diagnose.
- `gate_apply_result`: Wendet ein `APPROVED`-Ergebnis auf das echte Projekt an (neuer Branch, kein Push). Rufe dieses Werkzeug NIEMALS automatisch direkt nach `gate_run_task` auf — nur wenn Alex in einer eigenen, separaten Nachricht ausdrücklich "übernehmen"/"anwenden" sagt.
- `gate_status`: Zeigt den letzten Run-Log-Stand. Funktioniert NICHT, während gerade ein `gate_run_task`-Aufruf läuft — sag das Alex ehrlich, statt es zu verschweigen oder zu raten, was gerade passiert.

Regeln:
1. Erkläre vor dem Starten eines Tasks kurz die Parameter.
2. Nach Abschluss eines Laufs: Melde den Status ('APPROVED' oder 'ESCALATED') und betone stets: 'Der Merge-Knopf bleibt bei Alex'.
3. Antworten erfolgen stets auf Deutsch, präzise und ohne Füllphrasen.
4. Wenn ein Werkzeugaufruf fehlschlägt oder ein Pfad/Skript nicht gefunden wird: Melde den Fehler wörtlich und ehrlich zurück. Rate NIEMALS Parameter, weiche NIEMALS auf andere Werkzeuge oder eigenes Wissen aus und erfinde NIEMALS Inhalte über ein Projekt, das du nicht tatsächlich eingesehen hast.
```

---

## 📊 Strukturiertes Run-Log (gitignored)

`cli.py` protokolliert bei jedem Durchlauf (APPROVED, ESCALATED, Fehler oder Resume) automatisch einen strukturierten JSONL-Eintrag in:

```
scripts/gate-a2/logs/run-log.jsonl
```

Der Standardpfad ist fest an das Verzeichnis von `cli.py` verankert (unabhängig vom aktuellen `cwd` bei Subprozess- oder MCP-Aufrufen). Über das Argument `--log-file <pfad>` oder die Umgebungsvariable `A2_LOG_FILE` kann der Pfad überschrieben werden. Das Verzeichnis `scripts/gate-a2/logs/` ist in `.gitignore` eingetragen.

### Log-Format (JSON Lines)

Jede Zeile enthält ein valides JSON-Objekt mit folgenden Feldern:

```json
{
  "task": "Palindrome-Funktion implementieren",
  "worker_backend": "shell",
  "rounds": 1,
  "status": "APPROVED",
  "findings": [],
  "error": null,
  "timestamp": "2026-08-18T07:42:00.123456+00:00",
  "duration_seconds": 4.512
}
```

- **`task`:** Aufgabenbeschreibung (String).
- **`worker_backend`:** Verwendetes Backend (`"shell"` oder `"openhands"`).
- **`rounds`:** Anzahl durchlaufener äußerer Runden (`int`).
- **`status`:** Ergebnis-Status (`"APPROVED"`, `"ESCALATED"` oder `"ERROR"`).
- **`findings`:** Liste der Reviewer-Findings/Urteile je Runde (`list[str]`).
- **`error`:** Fehlermeldung bei Orchestrator- oder System-Exceptions (`str` oder `null`).
- **`timestamp`:** ISO-8601-Zeitstempel (UTC).
- **`duration_seconds`:** Gesamtlaufzeit in Sekunden (`float`).

---

## 🔔 Push-Benachrichtigungen via n8n & Telegram (Schritt 3)

Wenn ein autonomer Task auf eine Eskalation stößt (`STATUS_ESCALATED` oder `SELF_CHECK_FAILED`), sendet `cli.py` in Echtzeit einen Webhook-POST an eine konfigurierte `N8N_WEBHOOK_URL`.

### 1. Konfiguration in `.env`

Trage in deiner `.env` die Webhook-URL deines n8n-Workflows ein:

```bash
N8N_WEBHOOK_URL=http://<dein-n8n-host>:5678/webhook/gate-a2-escalation
```

*(Ist keine URL gesetzt, wird der Webhook stillschweigend übersprungen).*

### 2. n8n Workflow importieren

Unter `scripts/gate-a2/n8n/gate-a2-telegram-webhook.json` liegt eine fertige Workflow-Vorlage:

1. In n8n: **Add Workflow → Import from File** (`scripts/gate-a2/n8n/gate-a2-telegram-webhook.json`).
2. Im Knoten **Telegram: Send Escalation**: Wähle deine Telegram-Credentials aus und trage deine `chatId` ein.
3. Workflow aktivieren (**Active: ON**).

### 3. Payload-Struktur

Der Webhook überträgt den vollständigen, strukturierten `build_escalation()`-Inhalt direkt an Telegram:

```json
{
  "task": "Aufgabenbeschreibung",
  "status": "ESCALATED",
  "round": 3,
  "escalation_text": "# Gate-A2 Eskalation: ...\n\n## 1. Worum geht es? ...",
  "escalation_file": "a2-eskalation.md",
  "timestamp": "2026-08-17T08:53:00.000Z"
}
```
