# [advocatus] Abnahme-Befund — Roadmap-Item #24 „API-Key Maskierung UX" (Branch `a2/20260905T133902Z`, ungemergt)

> Rohoutput der Rückkanal-Konsultation vom 05.09.2026, ungekürzt archiviert. Prüfgrundlage: Briefing `docs/sessions/2026-09-03-api-key-maskierung-ux/briefing.md` (AC1–AC14). Rolle: strikt prüfend. Keine Änderungen vorgenommen, kein Code geschrieben, keine Tests ausgeführt. Basis: Volllektüre des Briefings (119 Zeilen, 14 ACs) und aller 8 gelisteten Dateien plus Gegenprobe `gui/core/persistence.py:489-497`, `gui/core/auth_middleware.py`, `ROADMAP.md` (Schritt 0), `package.json`.

---

## 1. Befunde nach Schweregrad

### [kritisch]

**K1 — Theme-Autosave bricht mit HTTP 400, sobald ein Key hinterlegt ist (Regression + stilles Scheitern).**
- `gui/static/app.js:488-500`: Der Theme-Change-Handler baut `payload = {...currentSettings, app_theme: newTheme, ...}` und postet ihn unverändert an `/api/settings`. `fetch(...)` wird **ohne** `response.ok`-Prüfung abgesetzt (kein Fehlerpfad, kein `alert`).
- `currentSettings` enthält die maskierten Werte: `loadSettings()` setzt `currentSettings = await response.json()` (`app.js:8342`), und `GET /api/settings` maskiert **alle 6** Credential-Felder (`system_api.py:130-143`, inkl. `tmdb_api_key`/`tvdb_api_key` aus `load_env_keys`).
- Der neue POST-Validator (`system_api.py:94-105`) antwortet auf jedes in `params` enthaltene `****`-Feld mit `400` (`system_api.py:102-103`).
- **Folge:** Sobald mindestens eines der 6 Felder belegt (und damit maskiert) ist, schlägt jeder Theme-Wechsel still fehl. Der Nutzer sieht das Theme sofort wechseln (`applyTheme` läuft zuvor, `app.js:483`), nach Reload ist es aber zurückgesetzt — klassisches stilles Scheitern, genau die Fehlerklasse, die dieses Item beenden soll.
- Vor der Änderung übersprang das Backend maskierte Werte still (`is_masked`-Skip, belegt in `briefing.md:8` und `docs/sessions/.../reviewer.md:119,174` mit den Alt-Zeilennummern `system_api.py:97,101,113`) — der Autosave funktionierte. Das ist eine echte Regression.
- Es ist der einzige weitere POST-Pfad auf `/api/settings` mit Voll-Payload; der Haupt-Save-Pfad (`app.js:9836`) sendet per Dirty-Tracking nur geänderte Felder und ist sauber.

### [wichtig]

**W1 — Blur-Restore-Lücke: „Tastendruck ohne Eingabe" lässt das Feld geleert → versehentliches Löschen.**
- `masked_input.js:199-209` (blur): Restore greift nur, wenn `editing !== "true"` **oder** `masked === "true"`. Nach Clear-on-Edit (`keydown`, `:170-172`: `value=""`, `editing="true"`, `masked="false"`) ist beides falsch → der Wert wird **nicht** wiederhergestellt.
- `masked_input.js:261` + `app.js:9822-9824`: `value=""` ≠ `dataset.original` → `changed=true`, `value=""` → `payload.telegram_token=""` → Backend löscht den Key (leere Zeichenkette ist weder whitespace-only noch maskiert, `system_api.py:100-103` fällt durch).
- AC2 deckt nur „Fokus **ohne** Eingabe" ab; dieser Zwischenzustand (ein versehentlicher Tastendruck, dann Feld verlassen, dann Speichern) ist weder durch AC2 noch durch einen Test abgedeckt. Er ist die konkrete Ausprägung der in `briefing.md:97` als „potenziell überraschend" dokumentierten Leere-Feld=Löschen-Semantik, durch Clear-on-Edit aber deutlich leichter auslösbar. Die Badge zeigt zwar „Wird entfernt" (`:91-95`), eine Bestätigung/Barriere vor dem Speichern gibt es nicht.

**W2 — AC14/AC7 unvollständig: Per-Feld-Feedback existiert nur als „saved", das Frontend wertet es gar nicht aus.**
- Backend erzeugt ausschließlich `{"status": "saved"}` (`system_api.py:105`, `onboarding_api.py:267`). Die im Briefing geforderten Zustände „übersprungen" und „Fehler" (`briefing.md:43`) werden nie produziert.
- Der Save-Handler (`app.js:9842-9877`) liest `response.json()` des Settings-POST **nie** — er prüft nur `response.ok`. Das gelieferte `fields`-Objekt verpufft.
- AC7-Differenzierung „Erfolg / Teil-Erfolg / Fehler" (`briefing.md:33`) ist nur teilweise realisiert: Es gibt „Erfolg" (`:9869`), „API-Key-Fehler" (`:9871`), „Fehler" (`:9876`) — einen „Teil-Erfolg"-Pfad gibt es nicht (durch die Backend-Umstellung auf 400-statt-Skip ist das auch konzeptionell weggefallen, ohne dass die AC-Formulierung nachgezogen wurde).

**W3 — Scope-Abweichung: Over-Masking von `telegram_chat_id` und `whatsapp_phone` wurde trotz „nicht Teil dieses Items" implementiert.**
- `system_api.py:134,136` maskieren `telegram_chat_id` und `whatsapp_phone` — genau die nicht-geheimen Felder, deren Over-Masking `briefing.md:50` explizit als „Kosmetisch, optional, **nicht Teil dieses Items**" deklariert. Praktisch sieht ein Nutzer seine eigene Chat-ID/Telefonnummer nur noch als `****xxxx`.
- Fairness-Hinweis: Das Briefing ist hier in sich widersprüchlich — AC6 (`briefing.md:32`) verlangt die „Hinterlegt"-Anzeige für **alle 6** Felder, was ohne Maskierung von chat_id/phone keinen Sinn ergibt. Die Umsetzung hat sich für AC6 entschieden. Der Widerspruch gehört dokumentiert bzw. von Alex entschieden, nicht stillschweigend aufgelöst.

### [kosmetisch]

**K2 — Test „AC7" ist fehlbeschriftet.** `masked_input.test.js:290` heißt `test("AC7: Whitespace-only input is rejected…")`, testet aber Whitespace-Validierung (gehört zu AC5/AC12), nicht die Erfolgsmeldung. Ein echter AC7-Test fehlt.

**K3 — `field_feedback` meldet „saved" auch für unveränderte und non-string-Werte.** `system_api.py:105` setzt `"saved"` für jedes in `params` vorhandene Feld — unabhängig davon, ob der Wert tatsächlich abwich oder (via B8) ein non-string Objekt ist, das die `isinstance(val, str)`-Prüfung (`:99`) umgeht. Semantisch ungenau, kein Sicherheitsneuzugang (B8 ist bereits in ROADMAP #58 getrackt).

**K4 — AC10-Wortlaut nicht getroffen.** AC10 verlangt „als **geändert** meldet"; der Status heißt „saved" (`system_api.py:105`, `onboarding_api.py:267`). Tests prüfen nur `"saved"` (`test_env_handling.py:124-125,205`).

**K5 — AC11-Test prüft `tvdb_api_key` nicht explizit.** `test_env_handling.py:178-191` verifiziert TMDB (env) sowie die vier Settings-Felder; `TVDB_API_KEY` bleibt ungeprüft (nur indirekt über die env-Ressourcenfreigabe). AC11 fordert „für alle 6 Felder".

**K6 — Pflicht-Update offen:** `ROADMAP.md:33` führt Item #24 weiter als `| geplant |` statt `erledigt`. Angesichts des ungemergten Branches nachvollziehbar, aber gemäß Hausregel „Roadmap-Status nachführen" ausstehend.

---

## 2. AC-Abdeckungstabelle (AC1–AC14)

| AC | Status | Beleg (Datei:Zeile) | Test |
|---|---|---|---|
| AC1 Clear-on-Edit (bei erster Eingabe, nicht bei Fokus) | **erfüllt** | `masked_input.js:145-181` (focus leer, keydown leert) | `masked_input.test.js:107-148` |
| AC2 Blur-Restore (Fokus ohne Eingabe) | **erfüllt** (enger Fall; Lücke s. W1) | `masked_input.js:199-209` | `masked_input.test.js:150-186` |
| AC3 Validierungs-Gate (**** blockiert) | **erfüllt** | `masked_input.js:237-244, 269-289`; `app.js:9765-9772` | `masked_input.test.js:188-209` |
| AC4 Dirty-Tracking alle 6 Felder | **erfüllt** | `app.js:8388-8420, 8477-8490` (dataset.original); `app.js:9821-9833` | `masked_input.test.js:211-249` |
| AC5 Trimming | **erfüllt** | `masked_input.js:261`; `system_api.py:104` | `masked_input.test.js:251-264` |
| AC6 Hinterlegt-Anzeige entkoppelt (inkl. Kurz-Key „****") | **erfüllt** | `masked_input.js:106-126, 42-57` | `masked_input.test.js:266-288` |
| AC7 Ehrliche Erfolgsmeldung | **teilweise** | `app.js:9868-9877` (Erfolg/Key-Fehler/Fehler, kein Teil-Erfolg) | kein echter Test (K2) |
| AC8 400 + Feldname `/api/settings` | **erfüllt** | `system_api.py:100-103` | `test_env_handling.py:142-154` |
| AC9 400 + Feldname `/api/keys` | **erfüllt** | `onboarding_api.py:259-263` | `test_env_handling.py:156-162` |
| AC10 Legitimer neuer Key gespeichert | **erfüllt** | `system_api.py:105,125-126`; `onboarding_api.py:265-267` | `test_env_handling.py:110-128, 200-206` |
| AC11 Unverändert unangetastet (alle 6) | **erfüllt** (tvdb-Testlücke K5) | `app.js:9821-9833`; `system_api.py:97` (`k in params`) | `test_env_handling.py:178-191` |
| AC12 Whitespace überschreibt nicht + sichtbar | **erfüllt** | `system_api.py:100-101`; `onboarding_api.py:259-260`; `masked_input.js:247-254` | `test_env_handling.py:164-176`; `masked_input.test.js:290-303` |
| AC13 Kein Klartext-Leck (GET) | **erfüllt** | `system_api.py:130-143`; `onboarding_api.py:278-284` | `test_env_handling.py:130-140, 193-198` |
| AC14 Per-Feld-Feedback (saved/übersprungen/Fehler) | **teilweise** | `system_api.py:95,105` (nur „saved"); Frontend nutzt `fields` nicht | nur „saved" (`test_env_handling.py:124-125,205`) |

Zusammenfassung: 11 von 14 ACs erfüllt, AC7/AC14 teilweise, AC10-Wortlaut kosmetisch abweichend. Kein AC fehlt vollständig.

---

## 3. Beantwortung der Einzelfragen

**B3-Dichtheit (destruktiv, beide Richtungen):** Dicht. Richtung „harmlos" (maskiert zurückgesendet → still verworfen) ist durch 400 ersetzt (`system_api.py:102-103`, `onboarding_api.py:262-263`). Richtung „destruktiv" (maskiert + überschrieben → echter Key) ist durch Clear-on-Edit unterbunden — der `****`-Präfix wird bei erster Eingabe geleert, kann also nie als Basis eines neuen Keys dienen (`masked_input.js:170-179`). Sonderfälle: **Paste** eines maskierten Werts wird vom Gate gefangen (`isMaskedValue` in `validateMaskedInput`, `:237-244`); **Autofill** setzt über den `input`-Listener `masked=false` (`:191-195`) und liefert typischerweise Klartext — kein `****`-Ergebnis; **IME** leert beim Kompositions-keydown, der komponierte Text enthält kein `****`; **Escape** stellt `dataset.original` wieder her (`:153-161`); **nacktes `****`** (Kurz-Key ≤ 8) wird sowohl frontend (`isMaskedValue("****")→true`) als auch backend (`is_masked("****")→true`, `persistence.py:496-497`) korrekt als maskiert/hinterlegt erkannt und beim POST mit 400 abgewiesen. Der einzige offene Pfad ist die **Blur-Race-Lücke (W1)** — sie führt aber zu *Löschung*, nicht zu falschem echtem Key.

**Leere-Feld-Semantik:** Bleibt erhalten und ist durch Clear-on-Edit **mehrdeutiger** geworden (W1): Feld geleert + Blur ohne weitere Eingabe + Speichern ⇒ Löschung, obwohl der Nutzer u. U. nichts löschen wollte. Die Semantik selbst ist wie im Briefing (`:97`) bewusst; das neue Risiko ist die leichte versehentliche Auslösung.

**Testqualität:** Die Frontend-Tests importieren echten Modulcode (`import { … } from "../../gui/static/js/masked_input.js"`, `masked_input.test.js:3-10`), keine nachgebauten Logik-Attrappen. DOM-Elemente sind Mocks (`createMockInput`/`createMockDOM`), was für `node:test` ohne jsdom üblich ist; dadurch ist die echte Browser-Eventsemantik (paste/input-Reihenfolge, Autofill, IME) nur angenähert. Runner-Anbindung korrekt: `package.json:6` → `node --test "tests/frontend/**/*.test.js"`, `"type": "module"` (`:4`) macht den ESM-Import gültig. `test_env_handling.py` enthält echte AC8–AC14-Fälle in `test_api_protection` (`:110-206`), AC14 jedoch nur als „saved"-Assertion.

**Sicherheits-Fremdeinfluss (A4/B8):** A4 wird **unverändert getragen, nicht verschärft**: `/api/keys` steht in der Onboarding-Allowlist (`auth_middleware.py:17`), `/api/settings` nicht; ohne Passwort sind beide offen (kein CSRF/Rate-Limit). Die neuen Fehlermeldungen (`system_api.py:101,103`) leaken **kein** Key-Material — nur Feldname + generischer Text; AC13 bleibt gewahrt. Die bekannte A1-Teilaspekt-Leckage (`mask_credential` zeigt letzte 4 Zeichen, `persistence.py:494`) besteht unverändert und ist als Notiz dokumentiert (`briefing.md:104`). B8 (Mass Assignment) wird durch den `isinstance(val, str)`-Bypass (`system_api.py:99`) nicht verschärft, bleibt aber bestehen. **Schritt 0 ist erfüllt**: `ROADMAP.md:1677-1691` enthält Item #58 „Auth-Härtung" mit A4- und B8-Verweis auf die Session.

**Stilles Scheitern:** Genau ein neuer stiller Pfad — der Theme-Autosave (K1). Der Haupt-Save-Pfad meldet Fehler sichtbar; Rest: `keysRes.json()` wird im Fehlerfall nicht gelesen (`app.js:9859-9861`), daher generische Meldung ohne Feldname/Grund (kosmetisch). Backend-`save_env_keys`-Exceptions enden in 500 (sichtbar).

---

## 4. Nicht prüfbar (statisch nicht verifiziert)

- **Testausführung:** `pytest` und `npm run test:frontend` wurden bewusst nicht ausgeführt. Import-Pfade und Runner-Konfiguration sind statisch korrekt; grün/rot ist unbelegt.
- **Browser-Semantik:** Paste/Input-Reihenfolge, Autofill, IME-Komposition, Blur-Race unter echtem DOM — nur via Mock-Eventsystem getestet.
- **K1-Reproduktion zur Laufzeit:** Statisch aus `currentSettings`-Inhalt + Backend-Validator abgeleitet, nicht gegen eine laufende Instanz geprüft.
- **Git-Zustand:** Kein `git status`/`git diff` ausgeführt (reine Prüfrolle); die 8 Dateien wurden direkt aus dem Arbeitsverzeichnis gelesen. Der genannte Alt-Zustand (stille Skips) stützt sich auf Briefing/Reviewer, nicht auf einen selbst gelesenen Diff.

---

## VERDICT: REVISE

1. `[kritisch]` K1 — Theme-Autosave-POST sendet maskierte Werte aus `currentSettings` und erhält HTTP 400 ohne Fehlerpfad (`app.js:488-500` vs. `system_api.py:102-103`). Regression + stilles Scheitern; vor Merge beheben (z. B. Key-Felder im Autosave-Payload auslassen oder Response prüfen).
2. `[wichtig]` W1 — Blur-Restore stellt nach Clear-on-Edit ohne Folge-Eingabe nicht wieder her; ein versehentlicher Tastendruck + Blur + Speichern löscht den Key (`masked_input.js:199-209`). Entscheidung/Abhilfe durch Alex (z. B. Restore bei `value === ""` nach editierendem Zustand, oder explizite Lösch-Bestätigung).
3. `[wichtig]` W2 — AC14/AC7 unvollständig: `fields` wird frontendseitig nie gelesen, „übersprungen"/„Fehler" nie erzeugt, kein Teil-Erfolg-Pfad (`system_api.py:105`, `onboarding_api.py:267`, `app.js:9842-9877`).
4. `[wichtig]` W3 — Over-Masking von `telegram_chat_id`/`whatsapp_phone` implementiert trotz Scope-Ausschluss (`system_api.py:134,136` vs. `briefing.md:50`); AC6-Widerspruch im Briefing klären.
5. `[kosmetisch]` K2 — Test `masked_input.test.js:290` fälschlich als „AC7" beschriftet; echter AC7-Test fehlt.
6. `[kosmetisch]` K3 — `field_feedback` meldet „saved" auch für unveränderte/non-string Werte (`system_api.py:105`).
7. `[kosmetisch]` K4/K5/K6 — AC10-Wortlaut „geändert" vs. „saved"; AC11-Test ohne explizite `TVDB_API_KEY`-Prüfung; ROADMAP-Item #24 noch „geplant".

**Restrisiken außerhalb des Scopes (kein Blocker für #24):** A4 (offener Default-Endpoint) und B8 (Mass Assignment) bleiben bestehen — aber als ROADMAP-Item #58 korrekt getrackt (Schritt 0 erfüllt).
