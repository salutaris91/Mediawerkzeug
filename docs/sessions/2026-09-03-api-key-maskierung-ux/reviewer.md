# Plan-Review: Briefing „API-Key-Maskierung UX" (Roadmap #24)

**Geprüft:** briefing.md, ALEX_ZUSAMMENFASSUNG.md, alle drei Session-Rohoutputs, FEATURE_BRIEFING.md (Template), ROADMAP.md Abschnitt 24 — plus eigenständige Code-Verifikation aller zitierten Stellen (`persistence.py`, `system_api.py`, `onboarding_api.py`, `app.js`, `index.html`, `main.py`, `tests/`).

**Vorab — was verifiziert korrekt ist** (damit die Findings richtig einordnenbar bleiben):

- **Quellen-Treue (Kernpflicht D):** Alle drei Stichproben bestanden. (1) produktberater lehnt Variante (b) tatsächlich ab (`produktberater.md:30`) und empfiehlt Option A „Feld leeren bei Fokus" (`:62, :85`) — das Briefing gibt das korrekt wieder (`briefing.md:84-85`). (2) advocatus benennt B3 tatsächlich als „kritischsten Zusatz" (`advocatus.md:97-99, :171`) und A4 als kritisch (`:60-72, :173`) — korrekt übernommen (`briefing.md:10-13, :92`). (3) grafiker empfiehlt tatsächlich Clear-on-Edit, nicht Clear-on-Focus (`grafiker.md:29, :66-70, :346`) — D2 korrekt wiedergegeben.
- **Code-Referenzen stimmen alle:** `is_masked()` bei `persistence.py:496` ✓; stilles Verwerfen in `system_api.py:97,101,113` und `onboarding_api.py:258` ✓; `dataset.original` existiert nur für TMDB/TVDB (`app.js:8445,8455`) ✓; Telegram/WhatsApp werden ungetrimmt und ohne Dirty-Check immer mitgeschickt (`app.js:9741-9745`) ✓; TMDB/TVDB getrimmt + Dirty-geprüft (`app.js:9787-9794`) ✓; Erfolgsmeldung trotz Verwurf (`app.js:9818-9821`) ✓; statische Placeholder ohne Hinterlegt-Anzeige (`index.html:1580-1609`) ✓; `tests/test_env_handling.py` existiert ✓.
- **Template-Treue (A):** Alle 4 Template-Abschnitte vorhanden und substanziell; Dissens-Dokumentation (Abschnitt 7), Offene Risiken inkl. A4/Whitespace/Over-Masking (Abschnitt 8), Aufwand KI vs. menschlicher Engpass getrennt (Abschnitt 9) ✓.
- **Akzeptanzkriterien (B):** 14 Kriterien, alle als „Es prüft, dass …" formuliert, beide Speicherpfade (AC8/AC9), alle 6 Felder (AC4/AC6/AC11) ✓.
- **Entscheidungs-Konsistenz (F):** D1-D4 in Briefing und Alex-Zusammenfassung konsistent; A4 sickert **nicht** in den #24-Scope (kein AC verlangt Auth-Härtung) ✓.
- **Alex-Zusammenfassung (G):** jargonfrei (kein „is_masked", „Dirty-Tracking", „HTTP 400", „Sentinel"), ~1 Bildschirmseite, Entscheidungen korrekt ✓.
- **D3-Heuristik ist code-valide:** `mask_credential("")` liefert `""` (`persistence.py:490-491`), d. h. „nicht-leerer Feldwert = hinterlegt" trägt gegen den Ist-Stand.

---

## Findings

### Blocker ([kritisch])

Keine. Die Kernpflichten C (Dissens dokumentiert, mit Begründung und Antwort auf die Scope-Warnung) und D (Rollenpositionen korrekt wiedergegeben) sind erfüllt; der #24-Plan selbst ist inhaltlich korrekt und sauber geschnitten.

### Sollte behoben werden ([wichtig])

**1. D4-Umsetzung fehlt: Das versprochene Roadmap-Item „Auth-Härtung" existiert nicht.**
`briefing.md:49` behauptet: „Wird als separates Roadmap-Item ‚Auth-Härtung' angelegt." Verifiziert: ROADMAP.md enthält 57 nummerierte Items — keines behandelt A4 (offener Default-Zustand, CSRF, Rate-Limit, `0.0.0.0`-Bind; Item 9 ist die *erledigte* Passwort-Funktion, nicht der offene Default). Ein workspace-weiter Grep nach „Auth-Härtung" findet **ausschließlich** `briefing.md:49` selbst. Damit ist das als `[kritisch]` gewichtete Risiko A4 (`briefing.md:92`) außerhalb des Session-Ordners **nirgends getrackt** — Verstoß gegen die Hausregel „Nicht sofort umgesetzte, aber relevante Sicherheitserwägungen gehören zwingend in ROADMAP.md". Verschärfend: Die Anlage ist in keinem Arbeitsschritt (Abschnitt 6), keiner Aufwandsposition (Abschnitt 9) und keinem AC verankert — genau die Struktur, in der Versprechen verloren gehen. **Vor dem Go:** Item in ROADMAP.md anlegen (inkl. A4- und B8-Verweis, siehe Finding 4) oder als expliziten, verifizierbaren ersten Umsetzungsschritt verankern.

**2. AC12 (Whitespace) spezifiziert keine Nutzer-Meldung — Risiko eines neuen stillen Pfads.**
`briefing.md:41` prüft nur „überschreibt nicht / löscht nicht", und der technische Ansatz (`:78`) sagt nur „Whitespace-only überschreibt nicht". Nicht spezifiziert: **wie** der Verwurf sichtbar gemeldet wird (HTTP 400 + Feldname? Per-Feld „übersprungen" im Sinne von AC14?). Die naheliegendste Implementierung wäre ein stiller Skip plus globale Erfolgsmeldung — exakt das Muster, das dieser Plan abschaffen will, nur mit neuem Trigger. AC7 (`:33`) ist nicht explizit mit AC12 verknüpft. Die Hausregel „Fehler müssen sichtbar sein — kein stilles Scheitern" verlangt hier eine explizite Anforderung. **AC12 ergänzen** um die Meldungs-Erwartung.

**3. Verwurfsbegründung des Rein-MVP: Die B3-Zuschreibung trägt nicht; das schlagende Argument fehlt.**
`briefing.md:47`: „Verworfen, weil es den destruktiven Fall B3 … nicht abfängt". Verifiziert gegen `produktberater.md:62-93`: Dessen empfohlene Option A (Clear-on-Focus) hätte den B3-UI-Pfad **faktisch verhindert** — ist das Feld bei Fokus geleert, kann kein teil-editierter maskierter Wert mit entferntem Präfix mehr entstehen. Die B3-Lücke gilt nur für die Nebenvariante „klare Validierung" (`produktberater.md:54`). Die korrekten Verwurfgründe (B4, fehlendes Dirty-Tracking) stehen daneben und tragen allein. Das tatsächlich schlagende, in `grafiker.md:70` dokumentierte Argument gegen Clear-on-Focus — **ohne Blur-Restore provoziert bloßes Reinklicken die Lösch-Semantik** („Sonst entsteht der Eindruck, der Key sei gelöscht") — fehlt im Briefing komplett, obwohl es D2 direkt begründet. Begründung präzisieren, damit die Verwurfung später korrekt nachvollziehbar bleibt und nicht als angreifbar reaktiviert wird.

**4. Advocatus-Befund B8 (Mass Assignment) geht verloren.**
Advocatus stuft B8 — kein serverseitiges Whitelisting der Settings-Felder, `system_api.py:111-115` übernimmt beliebige Keys — als `[wichtig]` ein (`advocatus.md:120-122, :178`). Das Briefing übernimmt B3, B4/B5, A4, Over-Masking, Key-in-URL, E1, E2 — **B8 fehlt vollständig**: weder in Abschnitt 4 („Bewusst verworfen") noch Abschnitt 8 („Offene Risiken") noch im Auth-Härtung-Verweis. Ein als wichtig gewichteter Einwand des Sicherheitsprüfers wird stillschweigend fallengelassen. Als Notiz in Abschnitt 8 und als Bestandteil des künftigen Auth-Härtung-Items dokumentieren.

**5. Lizenz- & Referenzpflicht: Der Abschnitt „Quellen, Referenzen & Lizenzen" fehlt.**
Das Briefing enthält keinen solchen Abschnitt. Verifiziert wurde aber: Es werden **keine lizenzpflichtigen Third-Party-Elemente** übernommen — grafiker setzt auf „SVG-Inline, keine Dependencies" (`grafiker.md:116`), und 1Password/GitHub/Stripe sind reine Inspirations-Patterns ohne Code-/Asset-Übernahme (`grafiker.md:17-21` trennt sauber übernommene Verhaltens-Patterns von bewusst ignorierten Features). Deshalb liegt **kein blockierendes Lizenz-Risiko** vor — aber der geforderte Abschnitt fehlt und sollte ergänzt werden (Quellen: Session-Rohoutputs; Kennzeichnung der Inspirations-Patterns als solche), damit die Referenzpflicht strukturell erfüllt ist und künftige Ergänzungen (z. B. Icons aus einer Bibliothek) einen definierten Ort haben.

### Optional ([kosmetisch])

**6.** Dissens-Tabelle, Zeile „`has_key`-Quelle" (`briefing.md:86`): Positionen ohne `[rolle]`-Attribution. Beide Positionen stammen aus grafikers offener Frage 1 (`grafiker.md:360`) — es ist kein Rollen-Dissens, sondern eine offene Frage. Attribuieren oder als solche kennzeichnen.

**7.** AC11-Kurztitel (`briefing.md:40`) missverständlich: „Unverändert lässt Wert angetastet" liest sich als Gegenteil; der Satz selbst ist korrekt („lässt … unangetastet"). → „Unverändert lässt Wert **un**angetastet".

**8.** Tippfehler `ALEX_ZUSAMMENFASSUNG.md:4`: „Zweierles" → „Zweierlei".

**9.** Nebennotizen der Rollen nur selektiv übernommen — nichts davon blockiert #24, aber nach der ROADMAP-Regel („Nichts wird stillschweigend gelöscht") sollten sie einen dokumentierten Ort haben: (a) grafikers Accessibility-Notizen (`--text-muted`-Kontrast ~4.1:1 knapp unter WCAG AA, schwacher Focus-Ring; `grafiker.md:264-268`, selbst als „Notiz, nicht Teil dieses Items" markiert), (b) grafikers offene Frage 4 (Onboarding-Felder ohne Badge-Pattern, `grafiker.md:363`) und das Escape-Verhalten des Zustandsmodells (`grafiker.md:256`), (c) advocatus' A1-Aspekt „asymmetrische Leckage bei 9-10-Zeichen-Keys (40-44 % sichtbar)" (`advocatus.md:14`) — nur der Over-Masking-Teil von A1 ist übernommen.

---

## Potenziale-Block (nicht bewertungsrelevant)

- **„Key entfernt" als eigener Per-Feld-Status** in AC14 ausweisen — entschärft die dokumentierte „Leeres Feld = Löschen"-Semantik (`briefing.md:93`) weiter, statt „gelöscht" nur als „gespeichert" zu melden.
- **grafikers Mikrotexte** (`grafiker.md` Abschnitt 3) direkt als UI-Textvorlage übernehmen — bereits hausregelkonform formuliert („Der Wert enthält Maskierungszeichen (****) und wurde nicht gespeichert …").
- **`data-has-key`-Attribut am Wrapper** (`grafiker.md:202, :221`) als Struktur für AC6 nutzen; die D3-Heuristik kann darauf aufbauen und bleibt später auf ein Backend-Flag erweiterbar.
- **Escape-Restore** in den Zustandsautomaten aufnehmen (grafiker-Modell), kostet minimal und roundet das Tastatur-Verhalten ab.

---

**Nicht ausgeführte Prüfungen:** `auth_middleware.py` nicht direkt gelesen (A4-Details aus advocatus.md übernommen; die `0.0.0.0`-Bindung wurde unabhängig gegen `main.py:297,302` verifiziert); `app.js:8436-8477` (Feld-Befüllung) nur indirekt verifiziert; keine Laufzeit-Tests ausgeführt (reine statische Prüfung); WCAG-Kontrastwerte aus grafiker.md nicht nachgerechnet.

---

VERDICT: REVISE

1. [wichtig] D4-Umsetzung fehlt: Das in `briefing.md:49` als angelegt deklarierte Roadmap-Item „Auth-Härtung" existiert nicht (ROADMAP.md, 57 Items, kein Treffer; Workspace-Grep findet nur die Behauptung selbst) — das als [kritisch] gewichtete Risiko A4 ist ungetrackt, Verstoß gegen die zwingende ROADMAP-Hausregel für Sicherheitserwägungen; Anlage ist in keinem Schritt/AC/Aufwandspunkt verankert. Vor dem Go: Item anlegen oder als verifizierbaren Umsetzungsschritt verankern.
2. [wichtig] AC12 (`briefing.md:41, :78`) spezifiziert keine Nutzer-Meldung beim Whitespace-only-Verwurf — Risiko der Reproduktion des stillen Verwurfs mit neuem Trigger (Hausregel „kein stilles Scheitern"); Meldungs-Anforderung (400 + Feldname oder AC14-„übersprungen") ergänzen.
3. [wichtig] Verwurfsbegründung Rein-MVP (`briefing.md:47`): B3-Zuschreibung trägt nicht — produktberaters Option A (Clear-on-Focus, `produktberater.md:62-93`) hätte den B3-UI-Pfad verhindert; das schlagende Argument aus `grafiker.md:70` (Clear-on-Focus ohne Blur-Restore provoziert versehentliches Löschen) fehlt. Begründung präzisieren.
4. [wichtig] Advocatus-Befund B8 (Mass Assignment, [wichtig], `advocatus.md:120-122, :178`) fehlt komplett im Briefing (weder verworfen noch als Risiko) — als Notiz in Abschnitt 8 und im Auth-Härtung-Item dokumentieren.
5. [wichtig] Lizenz- & Referenzpflicht: Abschnitt „Quellen, Referenzen & Lizenzen" fehlt im Briefing; kein blockierendes Lizenzrisiko (verifiziert: SVG-Inline ohne Dependencies, 1Password/GitHub/Stripe nur Inspirations-Pattern), aber Abschnitt ergänzen.
6. [kosmetisch] Dissens-Tabelle „has_key-Quelle" (`briefing.md:86`) ohne [rolle]-Attribution; beide Positionen stammen aus grafikers offener Frage 1 (`grafiker.md:360`) — attribuieren oder als offene Frage kennzeichnen.
7. [kosmetisch] AC11-Kurztitel (`briefing.md:40`) missverständlich („angetastet" statt „unangetastet").
8. [kosmetisch] Tippfehler „Zweierles" → „Zweierlei" (`ALEX_ZUSAMMENFASSUNG.md:4`).
9. [kosmetisch] Nebennotizen der Rollen (grafiker-Accessibility `grafiker.md:264-268`, Onboarding-Frage 4 `:363`, Escape `:256`, advocatus A1-Leckage-Aspekt `:14`) ohne dokumentierten Ort — als Notiz im Briefing oder ROADMAP erfassen.

---

> **Orchestrator-Notiz (nicht Teil des Reviewer-Beitrags):** Alle 9 Findings wurden am 04.09.2026 in `briefing.md` (Findings 1–7, 9) und `ALEX_ZUSAMMENFASSUNG.md` (Finding 8) eingearbeitet; Finding 1 dabei weisungsgemäß als verifizierbarer „Schritt 0" ohne die Behauptung, das ROADMAP-Item existiere bereits. Review-Runde 2 scheiterte zunächst dreimal an einem technischen Provider-Fehler des `reviewer`-Subagents (`invalid_request_error: Extra inputs are not permitted, field: 'promptCacheKey'`; Ursache laut Alex: global gesetztes `setCacheKey=true` beim opencode-go-Provider, vom glm-5.3/Console-Go-Endpoint abgelehnt). Ein Kontrolltest mit dem `explore`-Subagent bestätigte die Isolierung auf den `reviewer`-Typ. Nach Behebung durch Alex wurde Runde 2 erfolgreich ausgeführt — Ergebnis: **VERDICT: APPROVE** (vollständig unten archiviert). Der eine neue [kosmetisch]-Einwand (A1-Notiz, `briefing.md:104`) wurde unmittelbar danach im Sinne des Reviewer-Vorschlags behoben; anschließend lief eine Bestätigungs-Runde 3 gegen die finale Fassung.

---
---

# Review-Runde 2 — API-Key-Maskierung UX (Briefing)

**Verifikationsbasis:** Volllektüre von `briefing.md`, `ALEX_ZUSAMMENFASSUNG.md`, `produktberater.md`, `advocatus.md`, `grafiker.md`, `FEATURE_BRIEFING.md` (Template), `ROADMAP.md` (komplett, 1672 Zeilen) sowie Code-Verifikation aller zitierten Stellen: `persistence.py:489-497`, `system_api.py:84-135`, `onboarding_api.py:236-276`, `app.js:8436-8477, 9735-9829`, `index.html` (6 Felder), `package.json`, `tests/test_env_handling.py`. Zusätzlich workspace-weite Greps nach `is_masked`/`mask_credential` und „Auth-Härtung".

## 1. Prüfung der Runde-1-Findings

**Finding 1 [wichtig] — ROADMAP-Item „Auth-Härtung": BEHOBEN.**
ROADMAP.md enthält 57 Items, keines heißt „Auth-Härtung" (Item #9 ist die *erledigte* Passwort-Funktion, ein anderes Thema). Workspace-Grep findet „Auth-Härtung" nur im Briefing selbst und im historischen Runde-1-Review. Das Briefing sagt die Wahrheit: Abschnitt 4 (`briefing.md:49`), Abschnitt 6 (`:68`) und Abschnitt 8 (`:95`) sagen alle explizit „existiert noch NICHT", mit Hinweis auf die außerhalb liegenden Edit-Rechte und Anlage durch Alex/repo-operator. Schritt 0 ist in Abschnitt 6 als verbindlich verankert (inkl. Verifikationskriterium: Abschnitt „Auth-Härtung" mit A4/B8- und Session-Verweis), Abschnitt 9 hat die Aufwandszeile (`:110`, Alex-Go). Keine Stelle behauptet mehr „existiert bereits". Konsistenz über Abschnitte 4/6/8/9 gegeben.

**Finding 2 [wichtig] — AC12 sichtbare Meldung: BEHOBEN.**
AC12 (`briefing.md:41`) verlangt jetzt „weder überschreibt noch löscht **und** der Verwurf sichtbar gemeldet wird (HTTP 400 + Feldname bzw. Per-Feld-Status ‚übersprungen' gemäß AC14) — kein stiller Skip". AC14 (`:43`) liefert das Per-Feld-Feedback, Abschnitt 6 Backend Punkt 3 (`:81`) verweist zurück auf AC12. Beide Meldungsvarianten sind sichtbar — kein stiller Pfad. Konsistent.

**Finding 3 [wichtig] — Verwurfsbegründung Rein-MVP: BEHOBEN.**
Abschnitt 4 (`briefing.md:47`) nennt die drei neuen Gründe: (1) E1/E2-Ausklammerung (verifiziert gegen `produktberater.md:47`), (2) Clear-on-Focus ohne Blur-Restore → versehentliches Löschen (verifiziert gegen `grafiker.md:66-70` — das Zitat „Eindruck, der Key sei gelöscht" ist dort tatsächlich so begründet), (3) B4/B5 + fehlendes Telegram/WhatsApp-Dirty-Tracking (verifiziert: `produktberater.md` erwähnt beides tatsächlich nicht). B3 ist explizit aus der Verwurfsbegründung entfernt, mit Korrekturhinweis in Abschnitt 7 (`:91`). Die technische Aussage „Clear-on-Focus hätte den B3-UI-Pfad ebenfalls verhindert" ist korrekt (bei Fokus-leer ist Teil-Editieren des maskierten Werts unmöglich). Abschnitte 4 und 7 sind konsistent.

**Finding 4 [wichtig] — B8 in Abschnitt 8: BEHOBEN.**
`briefing.md:96` führt B8 als „[wichtig] Mass Assignment" mit korrekter Code-Referenz (verifiziert: `system_api.py:111-115` — `mutate()` übernimmt tatsächlich alle `params`-Keys ohne Whitelist) und Verweis ins Auth-Härtung-Item (Schritt 0). B8 ist zusätzlich in Schritt 0 (`:68`) als Bestandteil des künftigen Items benannt.

**Finding 5 [wichtig] — Quellen, Referenzen & Lizenzen: BEHOBEN.**
Abschnitt 10 (`briefing.md:116-119`) ist vorhanden und vollständig: Quellen (Session-Rohoutputs + verifizierter Code-Ist-Zustand), Referenzen (1Password/Bitwarden, GitHub PAT, Stripe — korrekt gegen `grafiker.md` Abschnitt 0 zitiert, ausdrücklich „nur Inspiration, keine Kopiervorlagen", keine Übernahme von Code/Assets/Design), Lizenzen (keine lizenzpflichtigen Third-Party-Elemente; Icons als Inline-SVG ohne externe Dependencies, gedeckt durch `grafiker.md:116`). Kein blockierendes Lizenz-Risiko.

**Finding 6 [kosmetisch] — Dissens-Kennzeichnung has_key: BEHOBEN.**
`briefing.md:89`: „(aus [grafiker]s offener Frage 1, kein Rollen-Dissens)" — verifiziert gegen `grafiker.md:360`.

**Finding 7 [kosmetisch] — AC11-Titel: BEHOBEN.**
`briefing.md:40`: „Unverändert lässt Wert unangetastet" — Titel und Text konsistent.

**Finding 8 [kosmetisch] — „Zweierlei": BEHOBEN.**
`ALEX_ZUSAMMENFASSUNG.md:4` verwendet „Zweierlei".

**Finding 9 [kosmetisch] — Notizen der Rollen: BEHOBEN.**
`briefing.md:101-104`: Unterabschnitt vorhanden mit allen vier Punkten; alle Zeilenreferenzen verifiziert und korrekt (`grafiker.md:264-268` Kontrast/Focus-Ring, `grafiker.md:363` Onboarding-Frage 4, `grafiker.md:256` Escape, `advocatus.md:14` 40-44 %-Leckage).

## 2. Neue Findings durch die Überarbeitung

Nur eines, kosmetischer Natur (siehe Einwand-Liste). Darüber hinaus: **keine neuen Verzerrungen gefunden.** Stichprobenartige Gegenprüfung aller Ist-Zustands-Behauptungen gegen den Code bestätigt das Briefing vollständig: `is_masked()` an `persistence.py:496` ✓, stille Skips an `system_api.py:97,101,113` und `onboarding_api.py:258` ✓, GET-Maskierung ✓, `dataset.original` nur für TMDB/TVDB (`app.js:8445,8455`) ✓, Telegram/WhatsApp immer ungetrimmt mitgeschickt (`app.js:9741-9745`) ✓, TMDB/TVDB getrimmt (`app.js:9787,9794`) ✓, Erfolgsmeldung (`app.js:9818-9821`) ✓, 6 Felder alle `type="text"` in `index.html` ✓. Der Grep über alle `is_masked`/`mask_credential`-Verwendungen bestätigt: Es gibt genau die zwei Endpunkte und 6 Felder, die das Briefing nennt — keine vergessenen dritten Pfade. Test-Infrastruktur-Behauptungen (`tests/test_env_handling.py`, `npm run test:frontend`) verifiziert ✓.

**Hausregeln-Check:** Durch die Korrekturen entsteht kein neuer stiller Pfad. Im Gegenteil — Schritt 0 macht den bisher stillsten Punkt (ungetracktes [kritisch]-Risiko) explizit, verbindlich und verifizierbar.

**Konsistenz D1-D4:** Briefing (Abschnitt 5, 4, 6, 7, 8, 9) und Zusammenfassung (Punkte 1-4 + „Was wir bewusst NICHT tun") sind durchgängig konsistent: Variante (b) eng geschnitten (E1 im Kern-Fix, E2 einziges Delta), Clear-on-Edit mit Blur-Restore, Frontend-Heuristik für has_key, A4 als separates Item mit Schritt-0-Verankerung.

**Zusammenfassung:** 24 Zeilen ≈ 1 Bildschirmseite, konsequent jargonfrei („Schlüssel", „verhüllt" statt „maskiert", keine Begriffe wie Dirty-Tracking/Heuristik), Freigabepunkt korrekt bei Alex („Mit deinem ‚Go'").

## 3. Verdict

**VERDICT: APPROVE**

## 4. Verbleibende Einwände

1. **[kosmetisch]** `briefing.md:104`: Die Formulierung „nur der Over-Masking-Teil von A1 ist in diesem Item übernommen" widerspricht in der engen Lesart Abschnitt 4 (Over-Masking: „nicht Teil dieses Items") und Abschnitt 8 (Over-Masking als bleibendes [kosmetisch]-Risiko). Gemeint ist vermutlich „in die Risiko-Dokumentation übernommen" — so steht es aber nicht da. Klarstellen (z. B. „kein Teil von A1 ist Umfang von #24; Over-Masking ist als [kosmetisch]-Risiko, die Leckage als Notiz dokumentiert"). Blockiert nicht, da Abschnitt 4 als verbindlicher Scope-Abschnitt eindeutig ist. *(Orchestrator-Notiz: unmittelbar nach Runde 2 im Sinne des Vorschlags behoben.)*

## 5. Restrisiken & nicht ausgeführte Prüfungen

- **Alex-Autorschaft der Entscheidungen:** Gate 1 und D1-D4 sind im Briefing als Alex-Entscheidungen deklariert. Das ist eine Behauptung des Orchestrators, die ich aus den Dateien heraus nicht verifizieren kann — nur Alex selbst kann bestätigen, dass er diese Entscheidungen tatsächlich getroffen hat (Multi-Agent-Grundregel: Ich-Form/Deklaration ist kein Beleg). *(Anmerkung des Orchestrators: Gate 1 und D1-D4 wurden von Alex im Chat explizit bestätigt.)*
- **A4 bleibt bis Schritt 0 offen:** Bis zur Anlage des Auth-Härtung-Items (Alex-Go) bleibt der offene Default-Endpoint ein reales, ungetracktes [kritisch]-Risiko — das Briefing führt es korrekt als solches; der Schutz ist rein prozessual.
- **Keine Laufzeit-Verifikation:** Alle Code-Befunde beruhen auf statischer Analyse (wie auch advocatus selbst anmerkt); Auth-Flows und Save-Verhalten wurden nicht live ausgeführt.
- **Zeilennummern sind Stand heute:** Die verifizierten Referenzen gelten zum aktuellen Code-Stand und können sich bis zur Umsetzung verschieben.
- **app.js nicht vollständig gelesen:** Verifiziert wurden alle zitierten Stellen plus vollständiger Grep der Maskierungs-Funktionen; die übrigen ~17k Zeilen wurden nicht durchgelesen.

## Potenziale (nicht verpflichtend)

- Bei Anlage des „Auth-Härtung"-Items in ROADMAP.md: Abgrenzung zum erledigten Item #9 („Eingebaute Authentifizierung") dokumentieren — #9 = Auth eingeführt; neues Item = Default-Härtung (offener Default-Zustand, CSRF, Rate-Limit, `0.0.0.0`-Bind, Mass Assignment B8). Der Runde-1-Reviewer hatte #9 bereits als Kontext identifiziert.
- Grafikers Escape-Restore (`grafiker.md:256`) ist korrekt als Notiz getrackt; bei der Umsetzung des Zustandsautomaten (Abschnitt 6 Frontend) könnte er direkt als Anforderung aufgenommen werden, statt nur als Notiz zu existieren.
- AC12 lässt bewusst zwei Meldungsvarianten zu („bzw."); für die Umsetzung könnte langfristig eine Variante festgelegt werden (immer 400 oder immer Per-Feld-Status), um die Testfälle eindeutiger zu machen.

---
---

# Review-Runde 3 (Bestätigungsrunde) — Briefing „API-Key-Maskierung UX" (#24)

Prüfgrundlage: Volllektüre `briefing.md` (119 Zeilen), `ALEX_ZUSAMMENFASSUNG.md`, `reviewer.md` (Runde 1 + 2), `advocatus.md`, `grafiker.md`, `produktberater.md`; eigenständige Verifikation von ROADMAP.md (Grep + Item-Auszüge) und der Code-Kernreferenzen (`persistence.py`, `system_api.py`, `onboarding_api.py`, `app.js`, `index.html`, `main.py`).

## 1. Status des Runde-2-Einwands (briefing.md:104): **BEHOBEN**

Die Zeile lautet jetzt:

> „[advocatus] A1-Teilaspekt: asymmetrische Leckage bei 9–10-Zeichen-Keys (40–44 % sichtbar, `advocatus.md:14`) — kein Teil von A1 ist Umfang von #24; Over-Masking ist als [kosmetisch]-Risiko (Abschnitt 8), die Leckage hier als Notiz dokumentiert."

Begründung (dreifach verifiziert):
- **Wörtlich im Sinne des Vorschlags:** Alle drei Elemente des Runde-2-Vorschlags („kein Teil von A1 ist Umfang von #24", „Over-Masking als [kosmetisch]-Risiko", „Leckage als Notiz dokumentiert") sind umgesetzt; der Klammerverweis „(Abschnitt 8)" präzisiert zusätzlich.
- **Konsistenz Abschnitt 4:** `briefing.md:50` führt Over-Masking unter „Bewusst verworfen" als „nicht Teil dieses Items" — kein Widerspruch mehr, da Zeile 104 nun keinerlei A1-Übernahme in den Scope behauptet, sondern Over-Masking nur als Risiko-Dokumentation referenziert.
- **Konsistenz Abschnitt 8:** `briefing.md:98` führt Over-Masking als „[kosmetisch]" — deckungsgleich mit dem Verweis in Zeile 104.
- **Konsistenz advocatus.md:14:** Dort steht „Länge 9 → ≈44 % sichtbar, Länge 10 → 40 %" — die Zusammenfassung „40–44 %" ist korrekt, die Zeilenreferenz `advocatus.md:14` stimmt exakt. Die Leckage ist damit im Notizen-Block („nichts wird stillschweigend gelöscht") dokumentiert, wie gefordert.

## 2. Regressionsbefund: **keine Regressionen gefunden**

Durchgeführte Stichproben (alle bestanden):

- **ALEX_ZUSAMMENFASSUNG.md:** „Zweierlei" (Zeile 4) korrekt. Inhaltlich durchgängig konsistent mit dem Briefing: Clear-on-Edit + Blur-Restore (Punkt 1 ↔ D2/AC1/AC2), sichtbare Fehlermeldung (Punkt 2 ↔ AC3/AC8/AC9), Hinterlegt-Anzeige für alle 6 Felder inkl. Kurz-Keys (Punkt 3 ↔ AC6/E2), ehrliche Erfolgsmeldung (Punkt 4 ↔ AC7/AC14), A4 als separates Projekt (↔ D4/Schritt 0), Restrisiken A4 + Leere-Feld-Semantik (↔ Abschnitt 8).
- **ROADMAP-Item „Auth-Härtung":** Workspace-Grep nach „Auth-Härtung" → 0 Treffer in ROADMAP.md (nur briefing.md und das historische reviewer.md). **Keine Stelle im Briefing behauptet Existenz** — alle vier Erwähnungen (`briefing.md:49, :68, :95, :110`) deklarieren korrekt „existiert noch NICHT" bzw. „bislang noch nicht" mit Anlage-Pflicht vor Umsetzung. ROADMAP.md:18 (Item #9 = *erledigte* Passwort-Funktion) und ROADMAP.md:33 (Item #24 = „geplant") stimmen mit den Briefing-Angaben überein; ROADMAP.md:740-752 beschreibt nur den Teil-Editierungs-Fall als reine Frontend-UX — konsistent mit `briefing.md:8` („Über den ursprünglich in der Roadmap beschriebenen Fall hinaus").
- **Code-Referenzen (Abschnitt 1/6/8), selbst gelesen:** `persistence.py:496` = `is_masked()` ✓; stille Skips exakt in `system_api.py:97, 101, 113` ✓; B8-Mass-Assignment exakt in `system_api.py:111-115` (`mutate()` übernimmt alle `params`-Keys ohne Whitelist) ✓; stiller Skip bei `/api/keys` in `onboarding_api.py:258` ✓; Telegram/WhatsApp werden in `app.js:9741-9745` ungetrimmt und ohne Dirty-Check immer mitgeschickt ✓; globale Erfolgsmeldung in `app.js:9818-9821` ✓; die 4 Telegram/WhatsApp-Felder in `index.html:1580-1609` alle `type="text"` mit statischen Placeholdern ✓; `0.0.0.0`-Bind in `main.py:297` und `:302` ✓.
- **Rohoutput-Referenzen (Abschnitt 7/8/10):** `grafiker.md:264-268` (Kontrast ~4.1:1 + schwacher Focus-Ring) ✓, `:363` (offene Frage 4) ✓, `:256` (Escape-Restore) ✓, `:116` („SVG-Inline, keine Dependencies") ✓, Abschnitt 0 (1Password/Bitwarden, GitHub PAT, Stripe als reine Verhaltens-Patterns) ✓, `:360` (offene Frage 1 → D3-Kennzeichnung) ✓; `produktberater.md:30` (Variante-(b)-Ablehnung), `:62/:85` (Option A Clear-on-Focus), keine Erwähnung von B4/B5/Dirty-Tracking in seinem Dokument ✓; `advocatus.md:14` ✓. Dissens-Abschnitt 7 und Verwurf-Abschnitt 4 sind synchron (B3-Korrektur in beiden).
- **Lizenz- & Referenzpflicht:** Abschnitt 10 (`briefing.md:116-119`) vorhanden und vollständig — Quellen (Rohoutputs + verifizierter Code), Referenzen ausdrücklich als „nur Inspiration, keine Kopiervorlagen", Lizenzen: keine lizenzpflichtigen Third-Party-Elemente, Icons als Inline-SVG ohne externe Dependencies. Keine unklare Lizenzangabe → kein blockierendes Lizenz-Risiko.

## 3. Statusliste der 9 Runde-1-Findings (Sichtprüfung, keine Tiefenprüfung)

| # | Finding | Status |
|---|---|---|
| 1 | [wichtig] ROADMAP-Item „Auth-Härtung" | **Behoben** (`:49/:68/:95/:110` — Nicht-Existenz korrekt deklariert, Schritt 0 verbindlich mit Verifikationskriterium + Aufwandszeile; ROADMAP-Grep bestätigt) |
| 2 | [wichtig] AC12 sichtbare Meldung | **Behoben** (`:41` — HTTP 400 + Feldname bzw. AC14-Status, „kein stiller Skip") |
| 3 | [wichtig] Verwurfsbegründung Rein-MVP | **Behoben** (`:47` — drei tragfähige Gründe, B3 explizit ausgenommen; Korrektur in `:91`) |
| 4 | [wichtig] B8 Mass Assignment | **Behoben** (`:96` als [wichtig]-Risiko mit Code-Referenz; Bestandteil von Schritt 0 in `:68`) |
| 5 | [wichtig] Quellen/Lizenzen-Abschnitt | **Behoben** (Abschnitt 10 vollständig) |
| 6 | [kosmetisch] has_key-Attribution | **Behoben** (`:89`) |
| 7 | [kosmetisch] AC11-Titel | **Behoben** (`:40` „unangetastet") |
| 8 | [kosmetisch] „Zweierlei" | **Behoben** (ALEX_ZUSAMMENFASSUNG.md:4) |
| 9 | [kosmetisch] Nebennotizen | **Behoben** (`:101-104`, alle vier Punkte mit korrekten Referenzen) |

Kein Runde-1-Finding wurde durch die Nachbearbeitung rückgängig gemacht; keine neuen Verzerrungen der Rollenpositionen entdeckt.

---

**VERDICT: APPROVE**

Keine neuen Einwände. (Nummerierte Einwandsliste: leer — der einzige Runde-2-Einwand ist verifiziert behoben, alle 9 Runde-1-Findings bleiben behoben, keine Regressionen.)

**Verbleibende Restrisiken:**
1. **Alex-Autorschaft der Entscheidungen:** Gate 1 und D1–D4 sind als Alex-Entscheidungen deklariert — aus den Dateien nicht verifizierbar (Multi-Agent-Grundregel: Deklaration ≠ Beleg). Die Orchestrator-Notiz in `reviewer.md` behauptet eine Chat-Bestätigung; letztlich kann nur Alex selbst bestätigen, dass er diese Entscheidungen getroffen hat.
2. **A4 bleibt bis Schritt 0 real und ungetrackt:** Der offene Default-Endpoint ([kritisch]) ist bis zur Anlage des Auth-Härtung-Items durch Alex/repo-operator nur prozessual geschützt — das Briefing führt es korrekt als solches.
3. **Keine Laufzeit-Verifikation:** Alle Code-Befunde beruhen auf statischer Analyse (auch in dieser Runde).
4. **Zeilennummern = Stand 04.09.2026** und können sich bis zur Umsetzung verschieben.

**Nicht ausgeführte Prüfungen (bewusst, Bestätigungsrunde):**
- `app.js` nicht vollständig gelesen (~17k Zeilen; zitierte Stellen + Umfeld selbst verifiziert, Rest aus Runde 2 übernommen).
- `auth_middleware.py` nicht direkt gelesen (A4-Detailketten aus advocatus.md; die `0.0.0.0`-Bindung habe ich unabhängig gegen `main.py:297/:302` verifiziert).
- `FEATURE_BRIEFING.md`-Template-Konformität nicht erneut geprüft (Runde 2 verifiziert); WCAG-Kontrastwerte nicht nachgerechnet; keine Testausführung (`pytest` / `npm run test:frontend`).
