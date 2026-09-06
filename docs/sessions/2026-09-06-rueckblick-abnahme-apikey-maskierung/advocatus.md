# [advocatus] Risiko-Check Rückblick-Session 06.09.2026 — K1/W1-Nacharbeit zu #24

> Rohoutput der Rückkanal-Konsultation vom 06.09.2026 (zweiter Abnahmedurchgang, Branch `a2/20260906T053604Z`), ungekürzt archiviert.

> Rolle: strikt prüfend, schreibgeschützt. Keine Dateien geschrieben, keine Befehle/Tests ausgeführt. Basis: Volllektüre der Prüfgrundlage `docs/sessions/2026-09-05-abnahme-apikey-maskierung/advocatus.md` (105 Zeilen), der drei geänderten Dateien (`gui/static/app.js`, `gui/static/js/masked_input.js`, `tests/frontend/masked_input.test.js`) sowie Gegenproben in `gui/api/system_api.py`, `gui/api/onboarding_api.py`, `gui/core/persistence.py`, `gui/static/index.html`. Der behauptete Diff (app.js +16, masked_input.js +14, test +109) wurde **nicht** per `git diff` verifiziert (kein bash) — ich habe den Ist-Zustand der Dateien gelesen und gegen die Behauptungen geprüft.

---

## 1. Befunde nach Schweregrad

### [wichtig]

**B1 — Bewusste Key-LÖSCHUNG über die Maske ist jetzt unmöglich (Verhaltensänderung, nicht im Auftrag).**
- Der Auftrag war, K1 und W1 zu beheben. Der W1-Fix hat aber die dokumentierte Semantik „leeres Feld = löschen" (`briefing.md:97`, im Alt-Befund Zeile 76 als „bewusst" bestätigt) im maskierten Pfad **abgeschaltet**.
- Beleg: `masked_input.js:257-264` — `validateMaskedInput` liefert bei `val.trim() === ""` jetzt `{valid:true, changed:false, value:orig}`. Damit kann ein Nutzer, der einen Key bewusst entfernen will (Feld leeren → Speichern), den Key **nicht mehr löschen**: `changed=false` ⇒ das Feld taucht in `changedFields` nicht auf ⇒ `app.js:9836-9847` setzt `payload.telegram_token` etc. gar nicht ⇒ Backend behält den alten Key.
- Der Badge-Zweig „Wird entfernt" (`masked_input.js:86-95`, `title="Wird entfernt"`) ist damit **toter Code**: Er wird nur erreicht, wenn `isPristine === false` und `val === ""` und nicht maskiert/whitespace — aber genau dieser Zustand wird durch den Blur-Restore (`:201`) und durch `validateMaskedInput` (`:258`) wieder auf `orig` zurückgesetzt bzw. als `changed=false` gewertet. Der Nutzer sieht also nie mehr „Wird entfernt", und selbst wenn, würde nichts gelöscht.
- **Schwere:** wichtig. Kein Datenverlust (eher das Gegenteil: Löschen unmöglich), aber eine stille Verhaltensänderung gegenüber der dokumentierten Semantik und dem Alt-Zustand. Es gibt jetzt **keinen** Weg mehr, einen hinterlegten Key über die UI zu entfernen. Das ist ein Entscheidungspunkt für Alex (siehe Abschnitt 4).

**B2 — `response.ok`-Prüfung im Theme-Autosave ist nur `console.error` ⇒ weiterhin stilles Scheitern für den Nutzer.**
- `app.js:512-514`: Bei `!response.ok` wird nur `console.error(...)` geloggt. Der Nutzer sieht das Theme sofort wechseln (`applyTheme` läuft vorher, `:483`), nach Reload ist es zurückgesetzt — ohne jede sichtbare Meldung.
- Das ist exakt die Fehlerklasse, die Item #24 beenden soll (stilles Scheitern). Der K1-Fix beseitigt zwar die *Ursache* (maskierte Werte im Payload), aber nicht die *Fehlerklasse*: Schlägt der POST aus einem anderen Grund fehl (Netzwerk, 500, Validator-Fehler durch ein anderes Feld), bleibt es still.
- **Schwere:** wichtig (Restrisiko), aber deutlich entschärft gegenüber K1, weil der konkrete 400-Auslöser (maskierte Werte) beseitigt ist. Ich stufe es als wichtig ein, weil die Hausregel „Fehler müssen sichtbar sein — kein stilles Scheitern" hier weiterhin verletzt ist.

### [kosmetisch]

**B3 — Blur-Bedingung ist logisch redundant/überbreit, aber funktional korrekt.**
- `masked_input.js:201`: `if (editing !== "true" || masked === "true" || value === "" || value.trim() === "")`. Die ersten beiden Klauseln decken den Alt-Fall (Fokus ohne Edit) ab; die neuen Klauseln `value === ""` und `value.trim() === ""` sind redundant (`value === ""` ist ein Spezialfall von `value.trim() === ""`). Kein Bug, aber die Bedingung ist schwerer lesbar als nötig.
- Wichtiger: Die Bedingung stellt bei `editing === "true"` **mit echtem neuem Wert** korrekt **nicht** wieder her (alle vier Klauseln falsch ⇒ kein Restore), und der `else if`-Zweig (`:205`) fängt `value === original` ab. Das ist korrekt (siehe Abschnitt 3).

**B4 — `dataset.original` whitespace-only oder nie gesetzt (orig="") — Blur-Restore setzt auf leeren String.**
- `masked_input.js:202`: `inputEl.value = inputEl.dataset.original || ""`. Ist `dataset.original` selbst leer (Feld nie per `setMaskedInputValue` befüllt, oder original war leer), ist der Restore ein No-op auf `""` — unkritisch, aber der `masked`-Flag wird dann via `isMaskedValue("")` auf `"false"` gesetzt (`:204`), was konsistent ist. Kein Fehler, nur ein Randfall ohne sichtbare Auswirkung.

---

## 2. Verifikationsurteil K1 — **ja** (mit Restrisiko B2)

**Payload-Pfad vollständig verfolgt:**
- `GET /api/settings` liefert maskierte Werte für **alle 6** Felder: `telegram_token`, `telegram_chat_id`, `whatsapp_apikey`, `whatsapp_phone` (`system_api.py:133-136`) sowie `tmdb_api_key`, `tvdb_api_key` aus `load_env_keys` (`:139-141`). Die Feldnamen in der Response sind exakt `tmdb_api_key`/`tvdb_api_key` (nicht `TMDB_API_KEY`), weil sie als `settings["tmdb_api_key"] = ...` gesetzt werden (`:140-141`).
- `loadSettings()` setzt `currentSettings = await response.json()` (`app.js:8356`) — `currentSettings` enthält also alle 6 maskierten Felder.
- Der Theme-Autosave baut `payload = {...currentSettings, app_theme, ...}` (`app.js:497-503`) und löscht jetzt per `delete payload[k]` alle 6 Key-Felder (`:504-506`). Die `keyFields`-Liste (`:489-496`) stimmt **exakt** mit den 6 Response-Feldnamen überein — inkl. `tmdb_api_key`/`tvdb_api_key`. **Korrekt.**
- **tmdb/tvdb-Frage:** Die tmdb/tvdb-Felder werden im UI **nicht** über `currentSettings` befüllt, sondern separat über `GET /api/keys` (`app.js:8483-8504`, `setMaskedInputValue(tmdbInput, keys.TMDB_API_KEY ...)`). Der Haupt-Save-Pfad schickt tmdb/tvdb über `/api/keys` (`app.js:9858-9872`), nicht über `/api/settings`. **Aber:** `currentSettings` enthält trotzdem `tmdb_api_key`/`tvdb_api_key` (weil `GET /api/settings` sie mitliefert, `system_api.py:140-141`). Ohne den `delete` hätte der Theme-Autosave also auch diese beiden maskierten Werte an `/api/settings` gepostet und dort den 400 ausgelöst (`system_api.py:102-103` prüft `tmdb_api_key`/`tvdb_api_key` in `key_fields`, `:94`). Der Fix entfernt sie korrekt mit. **Die keyFields-Liste ist vollständig und korrekt.**
- **Weitere POST-Pfade:** `grep fetch("/api/settings")` ergibt 7 Treffer: `:161` (POST `/api/settings/password`, anderer Endpoint), `:507` (Theme-Autosave, der Fix), `:5285` (GET), `:8354` (GET), `:9850` (Haupt-Save, Dirty-Tracking, sauber), `:12934` (GET), `:14493` (GET). **Kein weiterer POST mit Voll-Payload auf `/api/settings`.** Der Haupt-Save-Pfad (`:9850`) sendet nur explizit gesetzte Felder und ist unverändert sauber.

**Fazit K1:** Die Ursache (maskierte Werte im Autosave-Payload) ist behoben, die Feldnamen stimmen exakt, es gibt keinen weiteren betroffenen POST-Pfad. **Ja, behoben.** Restrisiko B2 (nur `console.error`) bleibt.

---

## 3. Verifikationsurteil W1 — **ja** (mit Restrisiko Browser-Event-Reihenfolge)

**Beide Verteidigungspfade geprüft:**

**(1) Tastendruck + Blur + Speichern:** Clear-on-Edit setzt `value=""`, `editing="true"`, `masked="false"` (`masked_input.js:170-173`). Beim Blur greift `:201` (`value === ""` ⇒ true) ⇒ Restore auf `dataset.original`, `editing="false"`, `masked` neu berechnet (`:202-204`). Danach `validateMaskedInput`: `val === orig` ⇒ `changed=false` (`:230-235`). **Behoben.**

**(2) Tastendruck + OHNE Blur sofort Speichern geklickt:** Hier greift der Blur-Handler nicht (kein Blur-Event vor dem Klick). Aber `validateMaskedInput` fängt es ab: `val.trim() === ""` ⇒ `{valid:true, changed:false, value:orig}` (`:257-264`). Der Save-Handler (`app.js:9779`) ruft `validateAllMaskedFields` **vor** dem POST auf, also wird `changed=false` ⇒ kein Lösch-Payload. **Behoben — unabhängig von der Blur/Click-Reihenfolge.** Das ist der entscheidende Punkt: Der Fix hängt nicht mehr allein am Blur-Event, sondern ist doppelt abgesichert (Blur-Handler für die UI-Anzeige, `validateMaskedInput` für den Save-Pfad).

**(3) Paste + sofort Blur:** Paste-Handler setzt `value=""`, `masked="false"`, `editing="true"` (`:183-188`). Danach Blur: `value === ""` ⇒ Restore. **Behoben.**

**(4) Escape-Pfad:** `:152-162` unverändert — Escape setzt `value = dataset.original`, `editing="false"`, `masked` neu, `blur()`. Der nachfolgende Blur-Handler (`:201`) sieht `editing !== "true"` ⇒ Restore auf `original` (No-op, da schon original). **Intakt.**

**Restrisiko (echte Browser-Semantik):** Die Mock-Tests (`createMockInput`) simulieren `blur()` als synchrones `dispatch("blur")` und `keydown`/`input` als manuell getriggerte Events. Die echte Reihenfolge `keydown → input → blur` bzw. `keydown → click(save)` unter echtem DOM ist nicht abgebildet. Da der Fix aber über `validateMaskedInput` (Save-Pfad) unabhängig vom Blur-Event greift, ist das Restrisiko gering — es betrifft nur die *Anzeige* (Badge/Value), nicht die *Datenintegrität*. Als Restunsicherheit dokumentiert (Abschnitt 5).

**Fazit W1:** Beide Verteidigungspfade greifen, alle vier Szenarien sind abgedeckt. **Ja, behoben.**

---

## 4. Neue Risiken / Kollateralschäden

**C1 — Key-Löschung unmöglich (siehe B1).** Der W1-Fix hat die bewusste Lösch-Semantik abgeschaltet. Es gibt jetzt keinen UI-Weg mehr, einen hinterlegten Key zu entfernen. Der Badge-Zweig „Wird entfernt" (`masked_input.js:86-95`) ist toter Code. **Das ist eine Verhaltensänderung außerhalb des Auftrags** (Auftrag war nur K1+W1) und ein Entscheidungspunkt für Alex:
- **Empfehlung:** Entweder (a) die Lösch-Semantik explizit wiederherstellen (z. B. ein eigener „Key entfernen"-Button oder eine Bestätigung bei leerem Feld), oder (b) die Semantik bewusst als „Löschen nur noch über einen expliziten Weg" dokumentieren und den toten Badge-Zweig entfernen. Nicht stillschweigend lassen.
- **Trade-off:** Option (a) erhält die dokumentierte Semantik, kostet aber zusätzliche UI-Arbeit; Option (b) ist minimal, ändert aber das Nutzerverhalten dauerhaft.

**C2 — `currentSettings.app_theme`-Mutation und Filter-Logik unverändert ok.** `app.js:487` mutiert `currentSettings.app_theme` vor dem POST; die Filter für `import_sources`/`sync_categories`/`local_download_folders` (`:500-502`) sind identisch zum Haupt-Save-Pfad (`:9829-9831`). Keine Regression durch den Fix erkennbar.

**C3 — Testabdeckung der 4 neuen W1-Tests:** Die 4 Tests (`masked_input.test.js:306-411`) sind schlüssig und decken genau die W1-Szenarien ab: (a) Clear-on-Edit + Blur leer → Restore + `changed=false` (`:306-337`), (b) Whitespace + Blur → Restore (`:339-359`), (c) Clear-on-Edit ohne Blur, direkte Validierung → `changed=false` (`:361-380`), (d) Clear + neuer echter Key + Blur → neuer Key bleibt, `changed=true` (`:382-411`). Test (c) ist wichtig, weil er den Save-Pfad ohne Blur abdeckt (Szenario 2). Mock-DOM-Grenzen: `dispatch`/`blur` sind synchron, echte Event-Reihenfolge nicht abgebildet — aber für die Logik-Verifikation ausreichend.

**C4 — „AC7"→„AC12"-Umschreibung:** Der Whitespace-Test heißt jetzt korrekt `AC12` (`:290`). Das behebt den kosmetischen Befund K2 (Fehlbeschriftung). **Aber:** Ein echter AC7-Test (Erfolgsmeldung „Erfolg/Teil-Erfolg/Fehler") existiert weiterhin **nicht** — K2 ist also nur als *Label* gerettet, nicht als *Testlücke* geschlossen. Das ist konsistent mit dem Auftrag (nur K1+W1), aber der Alt-Befund K2 („echter AC7-Test fehlt") bleibt inhaltlich offen. Kein neuer Befund, nur Klarstellung.

---

## 5. Nicht prüfbar (statisch nicht verifiziert)

- **Testausführung:** `pytest` und `npm run test:frontend` wurden **nicht** ausgeführt (kein bash). Import-Pfade und Runner-Konfiguration sind statisch plausibel (ESM-Import `:3-10`, `node --test` laut Alt-Befund `package.json:6`), aber grün/rot ist unbelegt.
- **Echte Browser-Events:** Paste/Input/Blur/Click-Reihenfolge unter echtem DOM ist nur via Mock-Eventsystem angenähert. Das Restrisiko aus Szenario (2) (Blur vs. Click-Reihenfolge) ist durch den `validateMaskedInput`-Pfad entschärft, aber nicht live verifiziert.
- **Git-Zustand:** Kein `git status`/`git diff` ausgeführt. Die Behauptung „diff-stat: app.js +16, masked_input.js +14, test +109" und „Branch a2/20260906T053604Z, ungemergt, kein Push" wurde **nicht** selbst geprüft. Ich habe den Ist-Zustand der Dateien gelesen, nicht den Diff.
- **K1-Reproduktion zur Laufzeit:** Statisch aus `currentSettings`-Inhalt + Backend-Validator abgeleitet, nicht gegen eine laufende Instanz geprüft.

---

## VERDICT: REVISE

1. `[wichtig]` B1 — W1-Fix schaltet die bewusste Key-Lösch-Semantik ab: `validateMaskedInput` liefert bei leerem Feld `changed=false` (`masked_input.js:257-264`), der Badge-Zweig „Wird entfernt" (`:86-95`) ist toter Code. Es gibt keinen UI-Weg mehr, einen hinterlegten Key zu entfernen. Verhaltensänderung außerhalb des Auftrags — Entscheidung durch Alex (Lösch-Semantik wiederherstellen oder bewusst dokumentieren + toten Code entfernen).
2. `[wichtig]` B2 — Theme-Autosave prüft `response.ok` nur mit `console.error` (`app.js:512-514`): weiterhin stilles Scheitern für den Nutzer, wenn der POST aus anderem Grund fehlschlägt. K1-Ursache ist behoben, die Fehlerklasse nicht.
3. `[kosmetisch]` B3 — Blur-Bedingung `masked_input.js:201` enthält redundante Klauseln (`value === ""` ⊂ `value.trim() === ""`); funktional korrekt, aber schwer lesbar.
4. `[kosmetisch]` B4 — Blur-Restore bei `dataset.original === ""` (nie gesetzt) ist ein No-op auf `""` (`:202`); unkritisch, aber Randfall ohne sichtbare Auswirkung.

**Verifikationsurteile:** K1 = **ja** behoben (Feldnamen exakt, kein weiterer POST-Pfad). W1 = **ja** behoben (doppelt abgesichert über Blur-Handler und `validateMaskedInput`).

**Restrisiken außerhalb des Scopes (kein Blocker für diese Nacharbeit):** A4 (offener Default-Endpoint) und B8 (Mass Assignment) bleiben bestehen — korrekt als ROADMAP-Item #58 getrackt (Alt-Befund Zeile 80). W2/W3/K3–K6 aus dem Alt-Befund sind durch diese Nacharbeit **nicht** angefasst und bleiben offen (nicht Teil des Auftrags K1+W1).
