# Advocatus-Rohoutput — Rückblick-Session Theme-Autosave (#60)

Session: 2026-09-08, Theme-Autosave-Fehler sichtbar (Abnahme)
Rolle: advocatus
Auftrag: Risiken/Regressionsgefahren zum Ergebnis auf Branch `a2/20260908T063755Z`

## Ungekürzter Beitrag

## Advocatus-Review: Theme-Autosave-Fehlersichtbarkeit (#60)

**Blocker:** keine gefunden. Alle fünf Akzeptanzkriterien sind funktional umgesetzt und formal durch den Test abgedeckt.

**Wichtige Risiken:**

1. **Race Condition beim Autosave** — `app.js:481-533`: Der `change`-Handler ist `async` ohne Request-Guard, ohne Debounce und ohne `finally`-Absicherung. Zwei schnelle Theme-Wechsel erzeugen zwei parallele `POST /api/settings`-Requests. Ein später ankommender älterer Request kann (a) die Fehlermeldung des neueren überschreiben und (b) serverseitig den neueren `app_theme`-Wert zurückrollen (Lost Update). Die Codebase besitzt das Anti-Race-Muster bereits (`lastQualityRequestIds`, `selectShowRequestId`); es wurde hier nicht angewendet. Real sichtbar wird das erst durch das neue UI-Feedback — genau die Stelle, die diese Aufgabe verändert.

2. **Test testet eine Code-Kopie, nicht die reale Bindung** — `theme_autosave.test.js:82-90, 122`: Der Handler wird per `indexOf`-Marker aus `app.js` extrahiert und in einer `new Function()`-Sandbox ausgeführt. Das beweist nicht, dass der echte `DOMContentLoaded`-Handler das Dropdown tatsächlich bindet, und es bricht still, sobald sich die Struktur verschiebt (z. B. ein früheres `loadStatus();` im String). Falsch-positive Tests sind möglich, weil eine Kopie des Codes geprüft wird, die vom echten Ablauf entkoppelt ist.

3. **Accessibility: Meldung für Screenreader unsichtbar** — `index.html:1729`: Das Fehler-Div hat weder `role="alert"` noch `aria-live`. Die dynamisch eingeblendete Meldung wird von assistiven Technologien nicht angekündigt. Das Projekt nutzt `aria-live="polite"` an anderer Stelle (z. B. `header-queue-badge`), hier fehlt es.

**Restrisiken / kosmetisch:**

4. **Hartcodierte Farbe statt CSS-Variable** — `index.html:1729` setzt `color: #ef4444` inline, während der Rest `var(--danger)`/`var(--error)` nutzt. Beim hellen Theme („Superfood Light") bleibt die Meldung hart rot — ausgerechnet in einem Theme-Feature eine Konsistenzlücke.

5. **Duplizierter Fehlerbehandlungscode** — `app.js:518-531`: Der `!response.ok`- und der `catch`-Zweig setzen die Meldung identisch; eine kleine Helper-Funktion würde beide Zweige sichern und künftige Drifts verhindern.

6. **Stiller Pfad bei fehlendem `currentSettings`** — `app.js:492`: Wird `change` vor `loadSettings()` ausgelöst, wird das Theme visuell angewendet (`applyTheme`), aber nicht gespeichert — ohne jede Meldung. Inkonistent zum neuen Ziel „Fehler sichtbar machen".

7. **Doppeltes Feedback bei 401** — `app.js:30-32` zeigt der `fetch`-Wrapper bei 401 den Login-Screen; zusätzlich erscheint dann „konnte nicht gespeichert werden". Semantisch korrekt, aber doppelt.

8. **`applyTheme` sofort trotz Fehlschlag** — der Nutzer sieht das neue Theme, das nicht persistiert wird und nach Reload verschwindet. Konsistent mit den AKs, aber potenziell irreführend (kein Hinweis, dass ein Reload das Theme verwirft) — bewusst außerhalb des Scopes (keine Retry-Logik), nur zur Kenntnis.

9. **Roadmap-Status vor Merge gesetzt** — `ROADMAP.md:67` markiert #60 bereits als „erledigt", obwohl der Branch laut Auftrag noch nicht gemergt ist. Prozess-Frage, kein Code-Risiko.

Fazit: Funktion und AK-Abdeckung stimmen, die Umsetzung ist minimal-invasiv und scope-treu. Vor dem Merge würde ich mindestens Punkt 1 (Race/Request-Guard) und Punkt 3 (`role="alert"`) klären; der Testmechanismus (Punkt 2) ist die größte strukturelle Schwachstelle für die langfristige Wartbarkeit.
