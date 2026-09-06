# [scout] Chancen Rückblick-Session 06.09.2026 — K1/W1-Nacharbeit zu #24

> Rohoutput der Rückkanal-Konsultation vom 06.09.2026 (zweiter Abnahmedurchgang, Branch `a2/20260906T053604Z`), ungekürzt archiviert. Gegenstand: Nacharbeit zu K1 (Theme-Autosave) und W1 (Blur-Lücke) aus der Session vom 05.09.2026.

---

## Idee 1: Single Source of Truth für die Key-Field-Liste

**Beobachtung im Diff:** Die Liste der 6 Key-Felder existiert jetzt an **drei** Stellen unabhängig voneinander:

| Ort | Datei:Zeile | Format |
|-----|-------------|--------|
| Theme-Autosave-Whitelist | `app.js:489-496` | Backend-Feldnamen (`"tmdb_api_key"`, …) |
| Settings-Save-Dirty-Track | `app.js:9770-9776` | DOM-ID's (`"settings-tmdb-key"`, …) |
| Server-Validierung | `system_api.py:94` | Backend-Feldnamen |

Die Theme-Autosave-Liste (`app.js:489-496`) und die Server-Liste (`system_api.py:94`) sind **inhaltlich identisch** (beides Backend-Feldnamen), aber unabhängig gewartet. Wenn morgen ein 7. Key-Feld dazukommt, müssen zwei Stellen synchron geändert werden — und die Theme-Whitelist ist genau die Art Stelle, die man dabei vergisst.

**Nutzen:** Eine Stelle statt drei (bzw. zwei, denn DOM-ID's haben ein anderes Format). Eliminiert die Klasse "Key-Liste auseinander-gedriftet"-Bugs, die K1 erst ermöglicht hat.

**Aufwand:**
- KI schnell: 30 min — Konstante `MASKED_KEY_BACKEND_FIELDS` in `masked_input.js` als Export, Import in `app.js` an beiden Stellen, Server-Liste als `/api/settings/field-schema` oder hart kodiert, aber mit Kommentar-Querverweis.
- Menschlicher Engpass: Review, ob DOM-ID-Liste (`app.js:9770-9776`) ebenfalls abbildbar ist (Mapping DOM-ID → Backend-Name), oder ob die bewusst getrennt bleibt.

**Entscheidung nötig?** Ja — ob das Mapping DOM-ID ↔ Backend-Name auch vereinheitlicht wird oder nur die Backend-Listen.

---

## Idee 2: Expliziter Lösch-Flow für Keys (da implizite Leeren-Semantik jetzt zu ist)

**Beobachtung im Diff:** Durch den W1-Fix ist der Pfad "Feld leeren → Key wird gelöscht" bewusst geschlossen:
- `masked_input.js:199-210` (Blur-Handler): Leeres Feld nach Clear-on-Edit → `dataset.original` wird wiederhergestellt.
- `masked_input.js:257-264` (validateMaskedInput): Leeres Feld → `changed: false, value: orig`.
- Konsequenz: Der Badge-Zweig "Wird entfernt" (`masked_input.js:86-95`) ist **toter Code** — er kann über keine reguläre Nutzerinteraktion mehr erreicht werden.

Das heißt: Es gibt aktuell **keinen Weg**, einen hinterlegten Key über die UI zu entfernen. Das ist ein Produkt-Loch, kein Feature.

**Konkreter Lösungsvorschlag:** Ein expliziter "Key entfernen"-Button neben jedem maskierten Feld (kleines × oder Trash-Icon), der:
1. Einen Bestätigungsdialog auslöst ("Key für TMDB wirklich entfernen?").
2. Nach Bestätigung ein spezifisches Flag `"_delete_tmdb_api_key": true` im Payload setzt (oder den Key auf `""` setzt, aber nur wenn explizit bestätigt).
3. Der Server (`system_api.py:96-104`) prüft dieses Flag und löscht den Key gezielt.

**Nutzen:** Sichere, reversible, nachvollziehbare Key-Entfernung. Kein versehentliches Löschen mehr möglich. Die Badge-Logik bei `masked_input.js:86-95` bekäme wieder eine Daseinsberechtigung (könnte den "wird entfernt"-Zustand nach Button-Klick, vor Bestätigung anzeigen).

**Aufwand:**
- KI schnell: 2-3 h (Button + Bestätigungsdialog + Backend-Flag + Test).
- Menschlicher Engpass: UX-Design-Frage (Position des Buttons, Bestätigungstext, ob pro Feld oder globaler "Keys verwalten"-Bereich).

**Entscheidung nötig?** Ja — Alex muss entscheiden, ob Key-Entfernung überhaupt ein use case ist, der unterstützt werden soll, und wenn ja, welches Interaktionsmuster.

---

## Idee 3: Frontend-Tests in CI — der natürliche Anschluss

**Beobachtung im Diff:** Die 4 neuen W1-Tests (`masked_input.test.js:306-411`) laufen lokal via `node --test` (package.json). Der einzige CI-Workflow (`.github/workflows/docker-build.yml`) baut ausschließlich das Docker-Image — **kein Test-Schritt**, weder `pytest` noch `npm run test:frontend`. Die Tests existieren, aber sie laufen bei keinem PR und keinem Push automatisch.

Die W1-Tests sind besonders CI-tauglich, weil sie:
- Reinen Node.js-Code testen (kein Browser, kein jsdom nötig).
- Deterministisch sind (keine Zeitabhängigkeiten, keine externen Services).
- Schnell laufen (< 1s pro Test).

**Konkreter Anschluss:** Ein `test`-Job im bestehenden `docker-build.yml` (oder separater `ci-tests.yml`), der vor dem Docker-Build läuft:
```yaml
test:
  runs-on: ubuntu-latest
  steps:
    - checkout
    - setup-node
    - run: npm ci && npm run test:frontend
    - setup-python
    - run: pip install -r requirements.txt && pytest
```

**Nutzen:** K1 (Theme-Autosave-Regression) und W1 (Blur-Lücke) wären beide durch Tests abgedeckt gewesen, bevor sie in den Branch gelangten. CI hätte sie als Gate sichtbar gemacht.

**Aufwand:**
- KI schnell: 1 h (Workflow-Datei schreiben, `node` + `python` Setup).
- Menschlicher Engpass: Entscheidung, ob `pytest` auch gleich mitkommt (braucht ggf. mehr Dependencies im CI) oder nur Frontend-Tests.

**Entscheidung nötig?** Ja — Scope des CI-Jobs (nur Frontend-Tests oder auch Backend?).

---

## Idee 4: Server-Whitelist als Defense-in-Depth statt Frontend-Strip

**Beobachtung im Diff:** Die Theme-Autosave-Fix (`app.js:489-506`) löscht Key-Felder aus dem Payload, bevor er postet. Das ist korrekt als **Frontend-Defense**. Aber der Server (`system_api.py:96-104`) validiert Key-Felder ohnehin — er akzeptiert keine maskierten Werte (`:102-103`) und keine Whitespace-Werte (`:100-101`). Was passiert aber, wenn der Server ein Key-Feld bekommt, das **nicht** in seiner `key_fields`-Liste steht? Antwort: Es fällt durch an `mutate()` (`system_api.py:121-123`) und wird ungeprüft in `settings.json` geschrieben — das ist B8 / Mass Assignment aus ROADMAP #58.

**Chance:** Die Logik aus `app.js:489-496` (Key-Felder aus Theme-Payload entfernen) und `system_api.py:94-104` (Key-Felder validieren) ließe sich zu einem serverseitigen "Settings-Whitelist"-Ansatz vereinheitlichen: Der Server akzeptiert nur bekannte Felder und ignoriert/verwirft alles andere. Damit wäre die Frontend-Whitelist nur noch Komfort (frühe Fehlermeldung), nicht mehr notwendig für Korrektheit.

**Nutzen:**
- B8 (Mass Assignment, ROADMAP #58) wird teilweise adressiert — der Server wird zur autoritativen Instanz.
- K1-artige Bugs (Frontend vergisst zu strippen) werden automatisch abgefangen.
- Die `keyFields`-Liste in `app.js:489-496` könnte entfallen, wenn der Server robust genug ist.

**Aufwand:**
- KI schnell: 2 h (Server-Whitelist für alle Settings-Felder, unknown fields → 400 oder silent ignore).
- Menschlicher Engpass: Review der vollständigen Settings-Feld-Liste (alle Felder aus `app.js:9790-9833` müssen erfasst werden), Entscheidung "reject unknown" vs. "ignore unknown".

**Entscheidung nötig?** Ja — das ist im Kern ein #58-Teilbereich und sollte als solcher getrackt werden.

---

## Idee 5: Response-Handling des Theme-Autosave sichtbar machen

**Beobachtung im Diff:** `app.js:512-514` prüft jetzt `response.ok` und loggt bei Fehler via `console.error`. Das ist besser als vorher (stilles Scheitern), aber für Alex als Nutzer unsichtbar — der Theme-Wechsel sieht erfolgreich aus, ist es aber nicht, wenn der POST fehlschlägt.

**Chance:** Ein minimales visuelles Feedback, das zum Muster des Theme-Autosave passt (kein lauter Alert, sondern eine dezente Anzeige):
- Ein kurzes "⚠ Theme konnte nicht gespeichert werden"-Toast oder ein temporärer Badge am Theme-Dropdown.
- Oder: `currentSettings.app_theme` auf den alten Wert zurücksetzen, damit der nächste Speichern-Versuch es erneut probiert.

**Nutzen:** Nutzer sieht sofort, wenn Autosave fehlschlug, statt erst beim nächsten Reload zu merken, dass das Theme verloren ging (exakt das K1-Symptom).

**Aufwand:**
- KI schnell: 30 min (Toast-Element + CSS + 3 Zeilen im catch-Block).
- Menschlicher Engpass: Review des Toast-Designs (passt es zum bestehenden Theme?).

**Entscheidung nötig?** Nein — rein additive UX-Verbesserung, kein Architektur-Entscheid. Könnte als "klein und naheliegend" direkt umgesetzt werden.

---

## Idee 6: Test-Abdeckung für den Theme-Autosave-Pfad (app.js:486-518)

**Beobachtung im Diff:** Der Theme-Autosave (`app.js:486-518`) war die Quelle von K1. Die Nacharbeit hat den Bug gefixt, aber es gibt **keinen Test**, der diesen Pfad absichert. Die bestehenden `masked_input.test.js`-Tests prüfen nur die Modul-Funktionen, nicht die `app.js`-Integration.

**Chance:** Ein Integrationstest (oder zumindest ein gezieltes Test-Szenario), der prüft:
1. Theme-Autosave sendet **kein** Key-Feld im Payload (keyFields-Whitelist wirkt).
2. Theme-Autosave mit `response.ok = false` triggert `console.error` (kein stiller Fehler).
3. `currentSettings` wird nicht mutiert (die `delete`-Operation bei `app.js:504-506` arbeitet auf einer Kopie via `{...currentSettings}` — das ist korrekt, aber nicht getestet).

**Nutzen:** Verhindert Regression von K1. Gerade Punkt 3 (Spread-Kopie vs. Original-Mutation) ist ein subtiler Bug-Kandidat, der ohne Test leicht wieder eingebaut wird.

**Aufwand:**
- KI schnell: 1-2 h (Mock-DOM + fetch-Mock + Test-Case; `app.js` ist aber 17k Zeilen und nicht modular aufgebaut, was einen isolierten Import erschwert).
- Menschlicher Engpass: Entscheidung, ob `app.js` dafür refactored werden muss (Theme-Autosave als exportierbare Funktion) oder ob ein End-to-End-Test sinnvoller ist.

**Entscheidung nötig?** Ja — Test-Strategie-Frage: Unit-Test mit Refactor vs. E2E-Test ohne Refactor.

---

## Zusammenfassung

| # | Idee | Nutzen | KI schnell | Mensch | Alex-Decision? |
|---|------|--------|-----------|--------|----------------|
| 1 | Single Source of Truth für Key-Listen | Verhindert Drift-Bugs (K1-Ursache) | 30 min | Review | Ja (Scope) |
| 2 | Expliziter Lösch-Flow für Keys | Schließt Produkt-Loch (kein Key-Remove mehr möglich) | 2-3 h | UX-Design | Ja (ob + wie) |
| 3 | Frontend-Tests in CI | K1/W1 wären als Gate sichtbar geworden | 1 h | Scope-Entscheid | Ja (Frontend nur oder auch Backend?) |
| 4 | Server-Whitelist (Defense-in-Depth) | Adressiert B8/#58 teilweise, macht Frontend-Strip überflüssig | 2 h | Feld-Liste reviewen | Ja (#58-Teilbereich) |
| 5 | Theme-Autosave-Fehler sichtbar | K1-Symptom (stiller Fehler) UX-sichtbar | 30 min | — | Nein |
| 6 | Test für Theme-Autosave-Pfad | Verhindert K1-Regression | 1-2 h | Test-Strategie | Ja (Refactor oder E2E?) |
