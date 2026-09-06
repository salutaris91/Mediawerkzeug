# [scout] Chancen & Anschlussideen zur Abnahme von #24 — Ideen mit Bezug zum real gelesenen Code

> Rohoutput der Rückkanal-Konsultation vom 05.09.2026, ungekürzt archiviert. Gegenstand: Umsetzung von Roadmap-Item #24 (Branch `a2/20260905T133902Z`), Prüfgrundlage Briefing `docs/sessions/2026-09-03-api-key-maskierung-ux/briefing.md`.

---

## Sofort anschlussfähig (keine weitere Alex-Decision nötig)

### 1. Onboarding-Felder (TMDB/TVDB) mit demselben Zustandsautomaten ausstatten

**Bezug:** `gui/static/js/masked_input.js:132` (`setupMaskedInput`) ist DOM-agnostisch — die Funktion arbeitet auf beliebigen `HTMLInputElement`-Objekten. Die Onboarding-Felder `onboarding-tmdb-key` und `onboarding-tvdb-key` (`index.html:146,159`) sind aktuell nackte `type="text"`-Inputs ohne Badge/Error-Wrapper.

**Nutzen:** Das Briefing (`grafiker.md:363`, referenziert in `briefing.md:103`) nennt explizit „Onboarding-Felder ohne Badge-Pattern" als offene Flanke. Die JS-Funktionen `setupMaskedInput`, `setMaskedInputValue` und `validateMaskedInput` könnten direkt wiederverwendet werden — es müsste nur die HTML-Struktur der beiden Onboarding-Felder um `.masked-key-field`-Wrapper, Badge- und Error-`<span>` ergänzt werden (Muster liegt in `index.html:1578-1586` für Telegram Token als Blaupause vor).

**Aufwand grob:** ~30 Min KI (HTML-Struktur nachbauen, `app.js:1037-1041` um `setupMaskedInput`/`setMaskedInputValue` ergänzen). Kein Backend-Wechsel nötig — das Onboarding-POST (`onboarding_api.py:247-277`) hat die Maskierungs-Validierung bereits mitgezogen.

---

### 2. CSS-Badge-Pattern als Design-Token für beliebige Status-Indikatoren

**Bezug:** `style.css:3692-3750` definiert vier Badge-Zustände (`badge-configured`, `badge-unconfigured`, `badge-valid`, `badge-invalid`) plus Helper- und Error-Text-Klassen. Die Klassen nutzen CSS-Variablen (`--accent`, `--text-muted`, `--success`, `--danger`) und sind damit theme-fähig.

**Nutzen:** Dieses Muster (Kreis-Badge mit ✓/○/⚠, positions-absolute im Input, plus ausblendbare Error-Zeile via `:not(:empty)`) ist ein allgemeines „Formularfeld mit Statusanzeige"-Pattern. Denkbar als Vorlage für: Health-Check-Felder, NAS-IP-Validierung, rclone-Remote-Namen. Der `masked-key-error:not(:empty)`-Trick (`style.css:3748`) ist besonders wiederverwendbar — er blendet die Fehlerzeile nur bei Bedarf ein, ohne JS.

**Aufwand grob:** 0 (ist bereits geliefert). Nur Dokumentation/Konvention nötig, damit zukünftige Entwickler das Pattern erkennen und nicht doppelt erfinden.

---

### 3. Mock-DOM-Pattern der Frontend-Tests für weitere UI-Module nutzbar

**Bezug:** `tests/frontend/masked_input.test.js:12-96` implementiert `createMockInput()` und `createMockDOM()` — ein leichtgewichtiges DOM-Mocking ohne jsdom, das `dataset`, `classList`, `addEventListener`, `dispatch` und `document.getElementById` nachbildet.

**Nutzen:** Dieses Pattern funktioniert für jedes Modul, das DOM-Elemente mit `dataset` und `classList` manipuliert. Kandidaten aus dem bestehenden Code:
- **Theme-Wechsel** (`js/theme.js`) — prüft, ob CSS-Klassen korrekt gesetzt werden
- **Queue-Badge-Updates** — prüft, ob der Header-Badge-Zähler korrekt hoch-/runterzählt
- **Storage-Target-Formular** — prüft, ob dynamisch erzeugte Formularzeilen korrekt gerendert werden

**Aufwand grob:** Die Mock-Helper könnten in ein gemeinsames `tests/frontend/helpers/mock_dom.js` extrahiert werden (~15 Min). Danach kann jedes neue Test-File sie importieren statt eigene zu schreiben.

---

### 4. Escape-Restore und Paste-Handler (implizit mitgeliefert, über AC hinaus)

**Bezug:** `masked_input.js:153-161` implementiert Escape-to-Restore (stellt den Originalwert wieder her und blurred), `masked_input.js:183-189` behandelt Paste-Events (cleart den Mask-Wert vor dem Einfügen). Beides ist nicht in den AC1-AC7 gefordert, sondern wurde als logische Konsequenz des Clear-on-Edit-Zustandsmodells mitgebaut.

**Nutzen:** Escape-Restore ist ein etabliertes UX-Pattern aus 1Password/Bitwarden (im Briefing `briefing.md:118` als Referenz genannt). Der Paste-Handler verhindert den Edge-Case, dass ein Paste in ein maskiertes Feld den `****`-Prefix mit dem neuen Wert vermischt. Beides ist sofort produktiv nutzbar.

**Aufwand:** 0 (bereits implementiert und getestet in `masked_input.test.js:168-186`).

---

### 5. Per-Feld-Backend-Feedback: Struktur steht, Frontend-Konsum ist ausbaufähig

**Bezug:** `system_api.py:95-105` baut `field_feedback` pro Key-Feld auf (`{"status": "saved"}`). Die Response `{"status": "success", "fields": field_feedback}` wird bereits ausgeliefert (`system_api.py:126`). Das Frontend (`app.js:9868-9872`) wertet dies jedoch noch nicht differenziert aus — es zeigt entweder „Einstellungen erfolgreich gespeichert!" oder „Einstellungen gespeichert, aber Fehler beim Speichern der API-Keys."

**Nutzen:** Die Backend-Architektur für „ehrliche Erfolgsmeldung pro Feld" (AC7/AC14) ist gebaut. Das Frontend könnte die `fields`-Antwort zukünftig auswerten, um z.B. anzuzeigen: „TMDB: gespeichert, TVDB: gespeichert, Telegram: unverändert". Der Schritt von „alles-oder-nichts"-Alert zu einer differenzierten Zusammenfassung (z.B. als nicht-blockierende Toast-Meldung) ist architektonisch vorbereitet.

**Aufwand grob:** ~1 h KI (Frontend: `fields`-Objekt iterieren, pro Feld Status extrahieren, differenzierte Meldung bauen). Backend-seitig müsste man für „übersprungen" (nicht gesendet) vs. „gespeichert" noch die nicht-Key-Felder ins Feedback aufnehmen, um es wirklich vollständig zu machen.

---

## Nur mit Alex-Decision

### 6. `has_key`-Backend-Flag als spätere Aufwertung (D3 im Briefing verworfen, aber Pfad liegt bereit)

**Bezug:** Briefing D3 (`briefing.md:58`): „Frontend-Heuristik" wurde gewählt. Aktuell bestimmt `masked_input.js:110-111` (`setMaskedInputValue`) das `hasKey`-Flag rein aus der Länge des vom Backend gelieferten Strings. Ein Backend-Flag (`{"TMDB_API_KEY": {"value": "****abcd", "has_key": true}}`) wäre robuster — insbesondere für Kurz-Keys, die zu nacktem `****` maskiert werden.

**Nutzen:** Die Frontend-Heuristik funktioniert heute, weil `mask_credential()` in `persistence.py` für nicht-leere Strings immer mindestens `****` zurückgibt. Aber: Wenn `mask_credential` jemals das Verhalten ändert (z.B. bei sehr kurzen Keys nur `***` zurückgibt), bricht die Heuristik. Ein explizites `has_key`-Flag wäre defensiver.

**Trade-off:** Erfordert Änderung an zwei GET-Endpoints (`/api/settings`, `/api/keys`) und Anpassung der Frontend-Pfade. Kein drängendes Problem, aber ein sauberer „nächster Schritt", wenn die Maskierungslogik je komplexer wird.

**Entscheidung:** Wann (ob) das Backend `has_key` liefert — aktuell nicht nötig, aber die Tür ist offen.

---

### 7. Over-Masking nicht-geheimer Felder (chat_id, phone) — kosmetisch, aber mit dem Pattern einfach

**Bezug:** Briefing Abschnitt 8 (`briefing.md:98`): „Over-Masking nicht-geheimer Felder (`telegram_chat_id`, `whatsapp_phone`)" als [kosmetisch] gelistet. Die Chat-ID und Handynummer sind keine Secrets, werden aber aktuell wie API-Keys maskiert (z.B. `****chatid`).

**Nutzen:** Eine selective Unmasking-Logik (z.B. Chat-ID und Phone nur teilweise maskieren: `****5678` → `-100123****789`) wäre mit dem bestehenden `masked_input.js`-Pattern einfach umsetzbar — das Modul maskiert nicht selbst, es verwaltet nur den Zustand. Die Maskierungslogik liegt in `persistence.py:mask_credential()`. Man bräuchte eine zweite Maskierungsfunktion für „nicht-geheime" Felder und müsste dem Frontend mitteilen, welches Feld welche Behandlung bekommt.

**Trade-off:** Kosmetisch, kein Sicherheitsgewinn. Könnte die UX sogar verschlechtern, wenn Nutzer ihre eigene Chat-ID nicht mehr erkennen. Entscheidung: Priorität vs. andere Roadmap-Items.

---

### 8. Anschluss an Auth-Härtung (Item #58): Per-Feld-Feedback als Basis für Feld-Whitelist (B8)

**Bezug:** ROADMAP.md:1685 (Item #58, B8): „`system_api.py:111-115` übernimmt beliebige Keys ohne Server-Whitelist." Die neue `field_feedback`-Struktur (`system_api.py:95-105`) iteriert bereits über eine explizite `key_fields`-Liste. Diese Liste (`system_api.py:94`) ist de facto eine Whitelist für Key-Felder.

**Nutzen:** Wenn Item #58 angegangen wird, kann die `key_fields`-Liste aus `system_api.py:94` als Blaupause für eine allgemeine Settings-Whitelist dienen. Die Logik „nur bekannte Felder akzeptieren, unbekannte zurückweisen" ist im Key-Bereich bereits implementiert — sie muss nur auf die nicht-Key-Settings-Felder ausgedehnt werden.

**Entscheidung:** Reihenfolge — Item #58 zuerst (weil [kritisch]), dann die Whitelist als natürliche Erweiterung des #24-Patterns.

---

### 9. Zukünftige Secret-Felder (rclone-Zugangsdaten, Passwort-Setting) — Modul ist bereit, HTML muss angepasst werden

**Bezug:** Aktuell gibt es keine rclone-Credential-Felder in der UI (rclone-Config läuft über `rclone.conf` auf Dateisystem-Ebene, `index.html:2173-2191` zeigt nur den Remote-Namen als Textfeld). Das Passwort-Setting (`index.html:1840-1845`) nutzt `type="password"` — der Browser maskiert selbst, das `masked_input.js`-Pattern ist hier nicht nötig.

**Nutzen:** Wenn zukünftig rclone-Credentials (Token, Service-Account-Keys) in der UI editierbar werden sollen, ist `masked_input.js` sofort einsetzbar. Voraussetzung: Die Felder werden als `.masked-key-field` mit Badge/Error-Elementen aufgebaut.

**Entscheidung:** Ob und wann rclone-Credentials in der UI editierbar werden (Item #19 „Geführter rclone-Web-Flow" ist geplant, aber groß).

---

### 10. Frontend-Test als Living Spec: AC-Tests könnten in CI-Gate integriert werden

**Bezug:** `package.json:6` definiert `"test:frontend": "node --test \"tests/frontend/**/*.test.js\""`. Die 11 bestehenden Test-Files (inkl. `masked_input.test.js` mit 304 Zeilen und 9 Testfällen für AC1-AC7) laufen lokal, aber es gibt keinen Hinweis auf CI-Integration (keine `.github/workflows` für Tests gefunden).

**Nutzen:** Die AC-Tests für #24 sind als ausführbare Specs geschrieben. Wenn sie in CI laufen würden, wäre jede zukünftige Änderung an `masked_input.js` oder `app.js` automatisch gegen die ACs geprüft. Das ist besonders wertvoll, weil das Clear-on-Edit-Verhalten subtil ist (Reihenfolge von focus/keydown/input/blur-Events) und leicht bei Refactorings brechen könnte.

**Entscheidung:** Ob CI für Frontend-Tests eingerichtet wird (Aufwand: GitHub-Actions-Workflow, ~30 Min).

---

## Zusammenfassung

| # | Idee | Ertrag | Aufwand | Kategorie |
|---|------|--------|---------|-----------|
| 1 | Onboarding-Felder mit Badge ausstatten | Mittel (Konsistenz) | ~30 Min | sofort |
| 2 | CSS-Badge-Pattern als Design-Token | Niedrig (Doku) | 0 | sofort |
| 3 | Mock-DOM-Helper extrahieren | Mittel (Testbarkeit) | ~15 Min | sofort |
| 4 | Escape-Restore + Paste-Handler | Hoch (UX, implizit geliefert) | 0 | sofort |
| 5 | Per-Feld-Feedback im Frontend konsumieren | Mittel (ehrliche UX) | ~1 h | sofort |
| 6 | `has_key`-Backend-Flag | Niedrig (defensiv) | ~2 h | Alex-Decision |
| 7 | Over-Masking chat_id/phone reduzieren | Niedrig (kosmetisch) | ~1 h | Alex-Decision |
| 8 | Anschluss an #58 (Feld-Whitelist) | Hoch (Sicherheit) | Mittel | Alex-Decision |
| 9 | Zukünftige Secret-Felder (rclone) | Niedrig (Bereitschaft) | 0 | Alex-Decision |
| 10 | Frontend-Tests in CI | Hoch (Regressionsschutz) | ~30 Min | Alex-Decision |

**Gesamteinschätzung:** Der substantiellste über #24 hinausgehende Wert ist die **Kombination aus Mock-DOM-Pattern + AC-Test-Infrastruktur** (Punkte 3+10) — sie legt ein Fundament, das jede weitere Frontend-Logik testbar macht. Die zweitwichtigste Mitnahme ist das **Per-Feld-Backend-Feedback** (Punkt 5), das architektonisch gebaut, aber im Frontend noch nicht ausgeschöpft ist. Alles andere ist entweder bereits geliefert und nutzbar (Punkte 1, 2, 4) oder erfordert eine Produktentscheidung über Priorität (Punkte 6-9).
