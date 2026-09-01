# CLAUDE.md — Medienwerkzeug

> Die generischen Hausregeln, Skills und Subagenten liegen **global** (ausgespielt
> via `build-global.sh` nach `~/.claude`, `~/.codex`, `~/.gemini/config`) und
> gelten in jedem Projekt. Hier steht **nur Projektspezifisches**.
>
> Diese Datei wird (zusammen mit dem generierten `AGENTS.md`/`.agents/AGENTS.md`)
> von den Tools zusätzlich zu den globalen Regeln gelesen.

## Projektspezifisch (hier ausfüllen)

### Stack & Architektur
- Sprache/Framework: Python (Flask) Backend + Vanilla-JS Frontend, Docker-basiertes Deployment
- Einstiegspunkt: `gui/main.py`
- Wichtige Verzeichnisse: `gui/api/`, `gui/core/`, `gui/static/`, `gui/workers/`, `tests/`

### Commit-Co-Author-Zeile
Jede Commit-Message endet mit:
```
Co-Authored-By: AI Coding Assistant <noreply@github.com>
```

### Build / Test / Run
- Tests ausführen: `pytest` (Backend, `tests/`), `npm run test:frontend` (Frontend)
- App starten: `docker compose up` (siehe `compose.orbstack.yml`/`docker-compose.yml`) oder direkt `python gui/main.py`
- Lint/Format: —

### Projektspezifische Pflicht-Updates nach jedem Feature-Schritt
- Nach Codeänderungen `scripts/refresh_graphify.sh` ausführen, um den Wissensgraphen (`graphify-out/`) und seine benannten Exporte zu aktualisieren (AST-basiert, kein API-Aufruf nötig).

### Deployment-Notizen
- **Update-Mechanismus:** Das NAS hat kein Git und baut nichts lokal — es zieht ein per CI vorgebautes Docker-Image aus der Registry. Nach einem Merge nach `main` baut GitHub Actions (`.github/workflows/docker-build.yml`, Job "Docker Build and Publish") das Image.

- **Update-Befehle:**
  1. Build-Status prüfen: `gh run list --branch main` — erst wenn grün, weitermachen. `docker compose pull` VOR Build-Ende zieht kommentarlos das alte Image erneut (kein Fehler, aber auch kein Update).
  2. Auf dem NAS:
     ```bash
     cd ~/medienwerkzeug && docker compose pull && docker compose up -d
     ```
     `docker compose up -d` erstellt nur die Container mit geändertem Image neu — kein `git`, kein `--build`, kein vorheriges `down` nötig.

- **Verifikation danach:** (Live gegen das NAS verifiziert, 01.09.2026 — Update `v90`→`v91` real bestätigt, nicht nur angenommen.)
  - Erreichbarkeit: `ssh nas-ts "curl -s http://localhost:5811/api/healthz"` → erwartet `{"ok": true}`. Bestätigt nur, dass der Container läuft — **nicht**, dass die neue Version drin ist (ein hängengebliebenes altes Image antwortet identisch).
  - Version wirklich bestätigen: `ssh nas-ts "curl -s http://localhost:5811/ | grep -o 'app.js?v=[0-9]*'"` und mit dem aktuellen Stand in `gui/static/index.html` im gemergten Commit abgleichen.
  - Alternativ: Image-Alter des laufenden Containers gegen den Merge-Zeitpunkt prüfen (Arbeitsverzeichnis wichtig, sonst "no configuration file provided"): `ssh nas-ts "cd ~/medienwerkzeug && docker inspect --format '{{.Created}}' \$(docker compose ps -q | head -1)"`.

- **Worauf achten / Rollback:**
  - Kein automatisierter Rollback-Mechanismus. Rollback bedeutet: vorheriges Image-Tag/-Digest gezielt pullen (falls in der Registry noch vorhanden) statt `latest`, dann erneut `docker compose up -d`.
  - Kein Datenbank-/Migrationsschritt bekannt (Settings liegen als `data/settings.json`/`.env`, kein Schema-Migrationslauf beim Deploy) — insofern kein zusätzliches Migrations-Rollback-Risiko.
  - Vor jedem Image-Build sicherstellen, dass `data/settings.json`, `.env` und `rclone.conf` NICHT ins Image eingebacken werden (realer Sicherheitsbefund aus der Kreativteam-Session vom 30.08.2026, relevant sobald das Image je öffentlich verteilt würde).
