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
- Das NAS hat kein Git und baut nichts lokal — es zieht ein per CI vorgebautes Image aus der Registry. Nach einem Merge nach `main` baut GitHub Actions (`.github/workflows/docker-build.yml`, Job "Docker Build and Publish") das Image. Sobald dieser Build grün ist (mit `gh run list --branch main` prüfen), auf dem NAS ausführen:
  ```bash
  cd ~/medienwerkzeug && docker compose pull && docker compose up -d
  ```
  `docker compose up -d` erstellt nur die Container mit geändertem Image neu — kein `git`, kein `--build`, kein vorheriges `down` nötig.
