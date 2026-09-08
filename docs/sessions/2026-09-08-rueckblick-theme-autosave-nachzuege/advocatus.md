# Advocatus-Rohoutput — Rückblick-Session Theme-Autosave-Nachzüge (#60)

> Rohoutput der Rückkanal-Konsultation vom 08.09.2026 (Rückblick-Session/Abnahme der zwei
> Nachzüge zu Roadmap-Item #60, Branch `a2/20260908T095833Z`, ungemergt, kein Push),
> ungekürzt archiviert.

---

# Advocatus-Rohoutput — Rückblick-Session Theme-Autosave-Nachzüge (#60)

**Datum:** 2026-09-08
**Branch:** a2/20260908T095833Z
**Rolle:** Advocatus (Risikoprüfer, schreibgeschützt)
**Verifikationsmethode:** ausschließlich statisches Lesen der Dateien (read/grep). Keine Bash, kein Testlauf, kein Git-Zugriff — siehe Restrisiken am Ende.

---

## 0. Verifikationsstatus der behaupteten Fakten

Alle sechs „von mir bereits verifizierten Fakten" des Auftrags habe ich **selbst gegengelesen und bestätigt**:

| Behauptung | Selbst verifiziert? | Befund |
|---|---|---|
| index.html:1729 = `<div id="settings-app-theme-error" class="hidden theme-autosave-error"></div>` | Ja (gelesen) | Korrekt, kein `style`-Attribut |
| style.css:3752–3756 = `.theme-autosave-error { font-size: 0.85em; color: var(--danger, #ef4444); margin-top: 6px; }` | Ja (gelesen) | Korrekt, **keine** `display`-Deklaration |
| `.hidden` in style.css:640 | Ja (gelesen) | `display: none !important;` |
| Fünf body.theme-\*-Blöcke (48–159) überschreiben `--danger` nicht; einzige `:root`-Def Zeile 26 | Ja (gelesen) | Korrekt |
| Testdatei enthält fünf `test()`-Aufrufe | Ja (gelesen) | Korrekt: Zeilen 15, 111, 174, 226, 280 |
| ROADMAP.md:1716 Status „Erledigt (2026-09-08)" | Ja (gelesen) | Korrekt |

Die behaupteten **Diff-Zahlen** (ROADMAP.md 2 Zeilen, index.html 2, style.css +6, Testdatei 26+/3-) konnte ich **nicht** per `git diff` verifizieren — sie sind mit dem Ist-Zustand *plausibel vereinbar*, bleiben aber **unverifizierte Behauptung**.

Die Behauptung „Fehlerlogik in app.js unverändert" konnte ich **nicht** per Git verifizieren. Ich habe app.js:479–536 selbst gelesen und bestätigt, dass der Sichtbarkeitsmechanismus dort `classList.add("hidden")` / `classList.remove("hidden")` ist (Zeilen 488, 522, 529) und kein Inline-Style setzt.

---

## 1. Befunde nach Schwere

### Blocker

**Keine.** Kein Befund verhindert die Abnahme fachlich.

---

### Sollte behoben werden

**S1 — AC4-Wortlaut widerspricht dem Ist-Zustand der Testdatei.**
AC4 verlangt wörtlich: „die **vier bestehenden** Tests bleiben **unverändert** grün". Ist-Zustand: Die Datei enthält **fünf** `test()`-Aufrufe, der erste (Struktur-Test) wurde **angepasst** (neue Assertions Zeilen 31–43: class `theme-autosave-error`, *kein* `style`-Attribut, CSS-Regel mit `var(--danger)`), und ein **fünfter Test** (Roadmap, Zeilen 280–287) wurde **hinzugefügt**.
- **Verifikationsstatus:** Selbst gelesen (fünf Tests vorhanden; Struktur-Test-Inhalt prüft heute class statt style). Die konkrete Alt-Fassung des Struktur-Tests konnte ich mangels Git nicht diffen — die Annahme, dass er zuvor das `style`-Attribut assertierte, ist **plausibel, aber nicht belegt**.
- **Bewertung:** Die Anpassung des Struktur-Tests war **unvermeidlich und legitim**: Entfernt man das `style`-Attribut, muss die Alt-Assertion, die es prüfte, ersetzt werden, sonst schlägt der Test fehl. Inhaltlich ist die Abdeckung **nicht schwächer** — sie prüft heute zusätzlich (a) die neue Klasse, (b) die Abwesenheit eines Inline-Styles, (c) dass die CSS-Regel `var(--danger)` nutzt. Die einzig „verlorene" Assertion (hartcodierte Farbe im HTML) war genau das, was der Nachzug entfernen sollte.
- **Empfehlung:** Kein Code-Blocker, aber der AC4-Wortlaut („unverändert", „vier") ist faktisch nicht erfüllt. Für die Abnahme-Sauberkeit sollte der Auftrag entweder dokumentieren, dass der Struktur-Test **erwartungsgemäß angepasst** und ein 5. Test ergänzt wurde, oder AC4 nachträglich präzisieren. Sonst entsteht ein Dauer-Widerspruch zwischen Auftragstext und Repository-Zustand.

**S2 — Roadmap-Test assertiert nur lose Substrings, nicht die eigentliche Begründung.**
Der neue Test (Zeilen 280–287) prüft `Scope Creep`, `localhost` und `Status:** Erledigt` als bloße `includes(...)`. Er prüft **nicht**, dass der eigentliche Inhalt der Begründung („… stellt kein Datenverlust- oder Sicherheitsrisiko dar") erhalten bleibt. Eine Kürzung der Begründung auf „Scope Creep … localhost"-Stummel würde den Test weiter grün lassen.
- **Verifikationsstatus:** Selbst gelesen (Test Zeilen 280–287 vs. ROADMAP Zeile 1720).
- **Bewertung:** Für den Zweck (Regressionsschutz gegen erneutes versehentliches Löschen der Begründung) minimal ausreichend, aber schwach. Da die Begründung jetzt per Test „eingefroren" ist, hätte ein Test auf den vollständigen Kernsatz mehr Schutz geboten. Kein Blocker.

**S3 — ROADMAP-Status „Erledigt" datiert vor dem Merge des Nachzugs-Branches.**
ROADMAP.md:1716 trägt „Erledigt (2026-09-08)", während der Branch laut Auftrag **noch ungemergt** ist.
- **Verifikationsstatus:** Status selbst gelesen; „ungemergt/kein Push" ist **Behauptung** (nicht prüfbar ohne Git).
- **Bewertung:** Mildert ab durch die Auftragsvorgabe „Status Erledigt … unverändert lassen" — der Status war also schon vorher „Erledigt", der Nachzug fügt nur die Begründung wieder ein. Verbleibendes Risiko: Das Datum `2026-09-08` suggeriert Abschluss der *Nachzüge*, obwohl deren Merge noch aussteht. Bei Verwerfen des Branches stünde in `main` ein „Erledigt (2026-09-08)" ohne die Begründung. Für die Nachvollziehbarkeit sollte das Datum erst mit dem tatsächlichen Merge gesetzt bzw. der Status-Wortlaut angepasst werden.

---

### Notiz (keine Behebungspflicht, aber bewusst zu halten)

**N1 — `var(--danger, #ef4444)` ist aktuell eine rein potenzielle Theme-Fähigkeit.**
Kein `body.theme-*`-Block überschreibt `--danger` (selbst geprüft, Zeilen 48–159); die einzige Definition ist `:root` Zeile 26. Die Farbe ist damit in **allen fünf Themes identisch `#ef4444`**. Der reale theme-spezifische Nutzen ist null — der Wert ist Konsistenz mit `.masked-key-error` (style.css:3740–3746, dasselbe Muster), nicht Funktionsgewinn. Das ist **konform zum Auftrag** („analog .masked-key-error"), sollte aber nicht als „Theme-Fähigkeit" verkauft werden. Wenn echte Theme-Fähigkeit gewollt ist, müsste mindestens ein Theme `--danger` überschreiben — das war aber bewusst nicht im Scope.

**N2 — Kontrast `#ef4444` auf Superfood Light.**
`#ef4444` auf hellem Creme (`--bg-surface: #f4e6da`, `--bg-base: #fcefe6`) erreicht grob ~3.5–3.8:1 — unter WCAG AA (4.5:1) für den kleinen 0.85em-Text. **Vorbestehend** (auch `.masked-key-error` betroffen) und **nicht im Scope** dieser Nachzüge; gehört aber in die Roadmap als offene UX-/A11y-Erwägung, falls Superfood Light unterstützt bleiben soll.

**N3 — `.hidden` nutzt `display: none !important` (style.css:640–642).**
Das beantwortet die CSS-Konfliktfrage des Prüfauftrags eindeutig **positiv**: `.theme-autosave-error` (Zeile 3752, später im File, gleiche Spezifität 0,1,0) hat **keine** `display`-Deklaration → aktuell kein Konflikt. Selbst wenn künftig jemand `display: block` in die Klasse schreibt, **gewinnt `.hidden` wegen `!important`** — das Ausblenden bleibt robust. Das `!important` ist hier ein unbeabsichtigtes, aber wirksames Sicherheitsnetz gegen das genannte „später display in die Klasse fassen"-Risiko. Kein Handlungsbedarf; als Merkposten: `!important` würde auch ein künftiges Inline-`style="display:block"` (ohne `!important`) schlagen.

**N4 — `margin-top: 6px` ist bei ausgeblendetem Element wirkungslos.**
Da `.hidden` auf `display:none` setzt, kollabiert das Element vollständig — kein „toter Abstand" im Ruhezustand. Sichtbar wird das div als `display:block` (Default) mit Inhalt (app.js setzt `textContent` vor dem `remove("hidden")`). Kein Leerzustand mit sichtbarem 6px-Gap beobachtet. Randfall akzeptabel.

**N5 — Testqualität: regex-basierte Tests ohne echten Browser fangen bestimmte Regressionen nicht.**
Selbst gelesen, folgende Lücken:
- Der CSS-Test (Zeilen 41–43) prüft nur, dass `var(--danger` **in** der Regel steht. Er prüft **nicht**, dass die Regel **keine** `display`-Deklaration bekommt — genau das „display nachträglich ergänzt"-Szenario des Prüfauftrags bliebe grün (funktional durch N3 abgefedert, aber der Test würde es nicht melden).
- Die Regex `\.theme-autosave-error\s*\{([^}]+)\}` matcht nur bis zur ersten `}`. Eine künftige verschachtelte/`@media`-Regel würde das Match brechen oder nur den Rumpf prüfen.
- Kein Browser: keine Kaskaden-Auflösung, kein tatsächliches Rendering, kein Kontrast-Test. Die JS-Tests mocken das DOM vollständig (Zeilen 47–109).
- Die JS-Tests extrahieren den Prüfling per String-Marker `const themeSelect = document.getElementById("settings-app-theme");` … `loadStatus();` (Zeilen 94–101). Jede app.js-Refaktorierung, die einen Marker verschiebt, bricht die Tests mit Assertion-Fehler — fragiler Canary, aber kein Funktionsfehler.

**N6 — „kein Push" / „Tests grün" sind für mich nicht verifizierbar.**
Ich habe **keine** Bash/Git-Rechte. Weder der Branch-Status (ungemergt, kein Push) noch der Testlauf (`npm run test:frontend`) wurden von mir geprüft. Ich habe stattdessen **alle** Assertions statisch gegen die realen Dateiinhalte gehalten; jede einzelne geprüfte Bedingung (Literale `theme-autosave-error`, `var(--danger`, `Scope Creep`, `localhost`, `Status:** Erledigt`, Abwesenheit `style=`) ist im Ist-Zustand erfüllt. Das ist eine **statische Plausibilitätsprüfung, kein Testlauf**.

---

## 2. Vollständigkeit der Akzeptanzkriterien

| AC | Wörtliche Anforderung | Abgedeckt durch | Status |
|---|---|---|---|
| AC1 | index.html kein `style`-Attribut, dafür CSS-Klasse | index.html:1729; Test Zeile 36 | ✅ erfüllt |
| AC2 | Klasse nutzt `var(--danger, …)` als Quelle | style.css:3754; Test Zeile 43 | ✅ erfüllt |
| AC3 | Ein-/Ausblenden weiterhin über `hidden` | `.theme-autosave-error` ohne `display` (3752–3756); app.js:488/522/529 `classList`; AK-Tests prüfen `classList.contains('hidden')` | ✅ erfüllt |
| AC4 | vier bestehende Tests unverändert grün | **Widerspruch** (S1): Struktur-Test angepasst, 5. Test ergänzt; „grün" nicht ausführbar geprüft (N6) | ⚠ Wortlaut nicht erfüllt, Intention (keine Abdeckungs-Regression) erfüllt |
| AC5 | ROADMAP enthält Begründung wieder | ROADMAP.md:1720; Test Zeilen 280–287 | ✅ erfüllt |

**Scope-Treue (bewusst NICHT im Scope):** geprüft und eingehalten —
- Kein Umbau auf `display/:not(:empty)`: `.theme-autosave-error` hat weder `display` noch `:not(:empty)` (selbst gelesen). ✅
- Keine neuen Abhängigkeiten: Testdatei importiert nur `node:test`, `node:assert`, `fs`, `path`, `url` (Zeilen 1–5). ✅
- Kein Duplikat der id `settings-app-theme-error` (grep über das Repo: genau ein Vorkommen in index.html, dazu app.js:485 und Tests). ✅
- „Keine Änderung an app.js-Fehlerlogik": **nicht git-verifizierbar** (Restunsicherheit); der gelesene Stand (app.js:479–536) ist konsistent mit ROADMAP-Beschreibung und Tests. ✅/⚠

---

## 3. Abschluss

**Urteil: keine Blocker.** Die beiden Nachzüge sind fachlich korrekt und konsistent umgesetzt; alle fünf Akzeptanzkriterien sind inhaltlich erfüllt (AC4 nur dem Wortsinn nach nicht, der Intention nach schon — siehe S1).

**Vor dem Merge zu klären/beheben (Sollte behoben):**
1. **S1** — AC4-Wortlaut („vier unverändert") vs. angepasster Struktur-Test + fünfter Test: dokumentieren/präzisieren, sonst bleibender Auftrags-Widerspruch.
2. **S2** — Roadmap-Test auf den vollständigen Kernsatz der Begründung verschärfen (optional, verbessert Regressionsschutz).
3. **S3** — ROADMAP-Datum „Erledigt (2026-09-08)" erst zum tatsächlichen Merge bestätigen.

**Restrisiken / nicht ausgeführte Prüfungen (explizit, nicht geglaubt):**
- `npm run test:frontend` **nicht ausgeführt** — „Tests grün" ist unverifizierte Behauptung; nur statische Plausibilitätsprüfung aller Assertions gegen die realen Dateiinhalte erfolgt (alle konsistent).
- Git-Zustand (Branch existiert, ungemergt, kein Push, Diff-Zahlen 2/2/+6/26+/3-) **nicht geprüft** — mangels Bash/Git-Zugriff.
- Alt-Fassung des Struktur-Tests und „app.js unverändert" **nicht per `git diff` verifiziert** — Annahme plausibel, aber unbelegt.
- Kein visueller/Rendering-Test (Kaskade, `var()`-Auflösung, Kontrast) — von den regex-/Mock-Tests strukturell nicht abgedeckt (N5, N2).

**Notizen ohne Behebungspflicht:** N1 (Schein-Theme-Fähigkeit), N2 (Kontrast Superfood Light → ROADMAP-Kandidat), N3/N4 (CSS-Kaskade sicher, `!important`-Sicherheitsnetz), N5/N6 (Testmethodik-Grenzen).
