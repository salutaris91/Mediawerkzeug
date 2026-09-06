# Feature Briefing: API-Key-Maskierung UX (Fokus/Editierung-Verhalten)

> Roadmap-Item #24 · Session `2026-09-03-api-key-maskierung-ux` · Gate 1 (Scope) = Variante (b) eng geschnitten, bestätigt durch Alex.
> Template-Basis: `FEATURE_BRIEFING.md`. Rohoutputs der Rollen: `produktberater.md`, `advocatus.md`, `grafiker.md` im selben Ordner.

## 1. Problemstellung

Maskierte API-Keys (z. B. `****1234`) stehen als normaler Text in `type="text"`-Inputs der Einstellungen. Editiert der Nutzer einen solchen Wert nur **teilweise**, bleibt das `****`-Präfix erhalten. Das Backend erkennt den Wert über `is_masked()` (`gui/core/persistence.py:496`) als „maskiert" und **verwirft ihn stillschweigend** — während das Frontend weiterhin „Einstellungen erfolgreich gespeichert!" meldet. Der Nutzer glaubt, der Key sei geändert, tatsächlich bleibt der alte aktiv. Das ist **stilles Scheitern + irreführende Erfolgsmeldung** und untergräbt das Vertrauen in die gesamte UI.

Über den ursprünglich in der Roadmap beschriebenen Fall hinaus hat die Security-Prüfung ([advocatus]) zwei gravierendere, reale Probleme identifiziert:

- **Destruktiver Fall (B3):** Markiert der Nutzer `****ABCD` und tippt `12345`, beginnt der Wert *nicht* mehr mit `****` → `is_masked()` = False → der Wert wird **als echter Key persistiert** und überschreibt den gültigen Key unwiderruflich (stiller Datenverlust). `is_masked()` schützt also nur die harmlose Richtung und lässt die zerstörerische Richtung ungehindert durch.
- **Whitespace-Fall (B4/B5):** Telegram-/WhatsApp-Werte werden im Frontend nicht getrimmt; ein Leerzeichen-/Whitespace-Wert überschreibt den echten Credential in `settings.json` still.

Betroffen sind 6 Felder (alle `gui/static/index.html`, `type="text"`): `settings-tmdb-key`, `settings-tvdb-key` (Speicherpfad `/api/keys`), `settings-telegram-token`, `settings-telegram-chat-id`, `settings-whatsapp-apikey`, `settings-whatsapp-phone` (Speicherpfad `/api/settings`).

## 2. Zielnutzer

Alex bzw. ein Admin-Nutzer, der API-Keys für Metadaten-Dienste (TMDB, TVDB) oder Benachrichtigungen (Telegram, WhatsApp) einrichtet oder ändert. Der Workflow: Einstellungen öffnen → maskierten Key sehen → Key ändern oder entfernen wollen → speichern. Genau in diesem Flow darf es kein stilles Scheitern und keine falsche Erfolgsmeldung geben. Keys werden selten geändert; wenn es passiert, muss die Rückmeldung verlässlich sein.

## 3. Akzeptanzkriterien (als Testfälle)

Jedes Kriterium ist als ausführbarer Test formuliert. Frontend-Tests nutzen die bestehende `node:test`-Infrastruktur (`npm run test:frontend`), Backend-Tests `pytest` (`tests/test_env_handling.py` als Ausgangspunkt).

### Frontend (`gui/static/app.js`, `gui/static/index.html`)

- [ ] **AC1 (Clear-on-Edit):** Es prüft, dass ein maskiertes Feld geleert wird, sobald der Nutzer die **erste Eingabe** macht (nicht schon beim reinen Fokus).
- [ ] **AC2 (Blur-Restore):** Es prüft, dass ein maskiertes Feld seinen `****`-Wert wiederherstellt, wenn der Nutzer es fokussiert und ohne Eingabe verlässt.
- [ ] **AC3 (Validierungs-Gate):** Es prüft, dass beim Speichern ein Feld, dessen Wert noch `****` enthält, als ungültig markiert, mit einer beschreibenden Fehlermeldung versehen und am Absenden gehindert wird.
- [ ] **AC4 (Dirty-Tracking alle 6 Felder):** Es prüft, dass nur tatsächlich geänderte Felder gesendet werden; ein unverändertes maskiertes Feld wird nicht mitgeschickt (heute nur für TMDB/TVDB vorhanden, muss auf Telegram/WhatsApp ausgeweitet werden).
- [ ] **AC5 (Trimming):** Es prüft, dass Telegram-/WhatsApp-Werte vor dem Senden getrimmt werden und führende/nachfolgende Leerzeichen entfernt werden.
- [ ] **AC6 (Hinterlegt-Anzeige, E2):** Es prüft, dass für alle 6 Felder ein Status „hinterlegt" vs. „nicht konfiguriert" angezeigt wird, der **vom Input-Wert entkoppelt** ist (Frontend-Heuristik: nicht-leerer maskierter Wert = hinterlegt) — auch für Kurz-Keys ≤ 8 Zeichen, die zu nacktem `****` maskiert werden.
- [ ] **AC7 (Ehrliche Erfolgsmeldung):** Es prüft, dass die Erfolgsmeldung nur erscheint, wenn tatsächlich gespeichert wurde; bei übersprungenen/verworfenen Key-Feldern erscheint eine differenzierte Meldung (Erfolg / Teil-Erfolg / Fehler).

### Backend (`gui/api/system_api.py`, `gui/api/onboarding_api.py`, `gui/core/persistence.py`)

- [ ] **AC8 (Kein stilles Verwerfen, E1):** Es prüft, dass ein POST an `/api/settings` mit einem `****`-präfixierten `telegram_token` **nicht** still übersprungen wird, sondern HTTP 400 mit Feldname und klarer Meldung zurückgibt.
- [ ] **AC9 (Kein stilles Verwerfen /api/keys):** Es prüft, dass ein POST an `/api/keys` mit einem `****`-präfixierten TMDB-/TVDB-Key HTTP 400 mit Feldname und klarer Meldung zurückgibt.
- [ ] **AC10 (Legitimer neuer Key):** Es prüft, dass ein legitimer neuer Key korrekt gespeichert wird und die Antwort das Feld als „geändert" meldet.
- [ ] **AC11 (Unverändert lässt Wert unangetastet):** Es prüft, dass ein unverändert gelassenes (maskiertes, nicht gesendetes) Feld den bestehenden Wert unangetastet lässt — für alle 6 Felder.
- [ ] **AC12 (Whitespace überschreibt nicht):** Es prüft, dass ein Whitespace-only-Input den bestehenden Key weder überschreibt noch löscht **und** der Verwurf sichtbar gemeldet wird (HTTP 400 + Feldname bzw. Per-Feld-Status „übersprungen" gemäß AC14) — kein stiller Skip.
- [ ] **AC13 (Kein Klartext-Leck):** Es prüft, dass `GET /api/settings` und `GET /api/keys` niemals unmaskierte echte Keys ausliefern.
- [ ] **AC14 (Per-Feld-Feedback):** Es prüft, dass die Save-Antwort pro Feld zurückmeldet (gespeichert / übersprungen / Fehler), damit das Frontend ehrlich berichten kann.

## 4. Bewusst verworfen (Scope-Eingrenzung)

- **[produktberater]-Rein-MVP („Feld leeren bei Fokus + Fehlermeldung", E1/E2 ausgeklammert):** Verworfen aus drei Gründen: (1) Es klammert die in Gate 1/D1 beschlossenen Scope-Punkte E1/E2 aus. (2) Sein Mechanismus Clear-on-Focus ohne Blur-Restore provoziert versehentliches Löschen: Wer nur ins Feld klickt und wieder weggeht, hätte den Wert bereits geleert — Eindruck, der Key sei gelöscht ([grafiker]). (3) Es adressiert die erst von [advocatus] identifizierten Fälle B4/B5 (Whitespace/Trimming) und das fehlende Dirty-Tracking für Telegram/WhatsApp nicht. Explizit NICHT als Verwurfgrund angeführt wird B3: [produktberater]s Clear-on-Focus hätte den B3-UI-Pfad ebenfalls verhindert. Sein gültiger Kern — „klein halten" — wird übernommen, indem E1 als kostenloser Bestandteil des Kern-Fix und E2 als einzige echte Ergänzung geschnitten wird.
- **`has_key`-Flag vom Backend (D3):** Verworfen für das MVP. Die Frontend-Heuristik (nicht-leerer maskierter Wert = „hinterlegt") reicht; ein Backend-Flag kann später nachgerüstet werden.
- **Auth-Härtung / offener Default-Endpoint (A4, D4):** Bewusst nicht Teil dieses Items. Die Anlage eines separaten Roadmap-Items „Auth-Härtung" (A4 + B8) ist als verbindlicher **Schritt 0** in Abschnitt 6 verankert. Stand jetzt existiert dieses Item in ROADMAP.md noch NICHT — die Anlage muss vor der Umsetzung von #24 durch Alex bzw. via repo-operator erfolgen (ROADMAP.md liegt außerhalb der Edit-Rechte dieses Planungs-Agents).
- **Over-Masking nicht-geheimer Felder** (`telegram_chat_id`, `whatsapp_phone`): Kosmetisch, optional, nicht Teil dieses Items.
- **Mindestlängen-Validierung für Keys** ([grafiker], offene Frage): Nicht entschieden, daher nicht Teil dieses Items.
- **Key-in-URL bei TMDB/Telegram** (egress-Logging-Falle): Nur als Notiz/Restrisiko, kein Blocker, nicht Teil dieses Items.
- **„Key anzeigen"/„Key kopieren"-Toggles, Regenerate-Buttons:** Nicht Teil dieses Items.

## 5. Entscheidungen (Alex, Gate 1 + D1–D4)

| ID | Entscheidung | Gewählte Option |
|---|---|---|
| Gate 1 | Scope-Variante | **(b)** Backend-Edge-Cases mit im Scope |
| D1 | Scope-Schnitt | **Variante (b) eng geschnitten:** E1 = Teil des Kern-Fix, E2 = Hinterlegt-Anzeige |
| D2 | Leeren-Verhalten | **Clear-on-Edit** (leeren bei erster Eingabe, Blur stellt `****` wieder her) |
| D3 | `has_key`-Quelle | **Frontend-Heuristik** (kein Backend-Flag im MVP) |
| D4 | A4 (offener Auth-Default) | **Separates Roadmap-Item**, nicht in #24 gelöst |

## 6. Technischer Ansatz

### Schritt 0 (vor der Code-Umsetzung, verbindlich)
**ROADMAP-Item „Auth-Härtung" in ROADMAP.md anlegen** — umfasst A4 (offener Default-Endpoint: kein Auth/CSRF/Rate-Limit ohne Passwort, Bind an `0.0.0.0`) und B8 (Mass Assignment, fehlende Server-Whitelist in den Settings). Damit wird das [kritisch]-Risiko A4 verbindlich getrackt (Hausregel: relevante Sicherheitserwägungen gehören zwingend in ROADMAP.md). **Wichtig:** Dieses Roadmap-Item existiert aktuell noch NICHT. `ROADMAP.md` liegt außerhalb der Edit-Rechte des Planungs-Agents; die Anlage erfolgt vor der Umsetzung von #24 durch Alex oder via repo-operator mit Alex-Go. Verifikation danach: ROADMAP.md enthält einen Abschnitt „Auth-Härtung" mit Verweis auf A4/B8 und die Session `2026-09-03-api-key-maskierung-ux`.

### Frontend
1. **Clear-on-Edit:** Pro maskiertem Feld ein Zustandsautomat (pristine → editing → valid/invalid). Bei erster Eingabe wird der maskierte Wert geleert; bei Blur ohne Eingabe wiederhergestellt. Verhindert beide destruktiven Fälle (mit und ohne `****`-Präfix).
2. **Dirty-Tracking für alle 6 Felder:** `dataset.original` wird auf Telegram/WhatsApp ausgeweitet; nur geänderte Felder werden gesendet.
3. **Validierungs-Gate:** Vor dem Submit werden Felder mit `****`-Anteil als ungültig markiert und blockiert (Sicherheitsnetz hinter Clear-on-Edit).
4. **Trimming** für Telegram/WhatsApp.
5. **Hinterlegt-Anzeige (E2):** Statusindikator entkoppelt vom Input-Wert, via Frontend-Heuristik.
6. **Differenzierte Save-Rückmeldung** (Erfolg / Teil-Erfolg / Fehler), gekoppelt an das tatsächliche Backend-Ergebnis.

### Backend
1. **Kein stilles Verwerfen (E1):** `****`-präfixierte Werte werden mit HTTP 400 + Feldname + beschreibender Meldung zurückgewiesen statt still übersprungen (`system_api.py:97,101,113`, `onboarding_api.py:258`).
2. **Per-Feld-Feedback** in der Save-Antwort statt globalem `{"status":"success"}`.
3. **Whitespace-Schutz:** Trimming serverseitig; Whitespace-only überschreibt nicht und wird sichtbar gemeldet (kein stiller Skip, siehe AC12).

## 7. Dissens-Dokumentation (Pflicht)

| Dissens | Position A | Position B | Synthese / Entscheidung |
|---|---|---|---|
| **Scope Variante (b)** | [produktberater]: E1/E2 verwerfen, reines Frontend-MVP | [advocatus]+[grafiker]: Backend-Härtung + E2 nötig | **Variante (b) eng geschnitten** (Alex, D1). E1 ist Teil des Kern-Fix (kein Mehraufwand), E2 die einzige echte Ergänzung. |
| **Leeren-Verhalten** | [produktberater]: Clear-on-**Focus** | [grafiker]: Clear-on-**Edit** mit Blur-Restore | **Clear-on-Edit** (Alex, D2). |
| **`has_key`-Quelle** (aus [grafiker]s offener Frage 1, kein Rollen-Dissens) | Backend-Flag (sauberer) | Frontend-Heuristik (spart Backend-Arbeit) | **Frontend-Heuristik** (Alex, D3). |

**Verworfene Alternative (mit Begründung):** Das [produktberater]-Rein-MVP wird verworfen, weil es E1/E2 ausklammert, sein Clear-on-Focus ohne Blur-Restore versehentliches Löschen provoziert ([grafiker]) und es B4/B5 sowie das fehlende Telegram/WhatsApp-Dirty-Tracking nicht adressiert. (Korrektur gegenüber Review-Runde 1: Sein Clear-on-Focus hätte den B3-UI-Pfad ebenfalls verhindert — B3 taugt daher nicht als Verwurfgrund.) [produktberater]s Warnung „Scope-Aufblähung" wird ernst genommen und durch den engen Schnitt (E1 kostenlos, nur E2 als Delta) beantwortet.

## 8. Offene Risiken (bleiben auch nach Umsetzung bestehen)

- **[kritisch, separat] A4 — Offener Auth-Default:** Ohne Passwort sind `/api/settings` und `/api/keys` offen, ohne CSRF/Rate-Limit, bei Bind an `0.0.0.0`. → **Eigenes Roadmap-Item** (D4), nicht Teil von #24; Anlage als verbindlicher Schritt 0 (Abschnitt 6). Das Item existiert bislang noch nicht.
- **[wichtig] B8 — Mass Assignment:** `/api/settings` übernimmt beliebige Keys ohne Server-Whitelist (`system_api.py:111-115`). Nicht Teil von #24; gehört in das Auth-Härtung-Item (Schritt 0).
- **[wichtig] Whitespace-/Leer-Semantik:** „Leeres Feld = Key löschen" bleibt eine bewusste, aber potenziell überraschende Semantik; durch Trimming und Validierung entschärft, nicht vollständig eliminiert.
- **[kosmetisch] Over-Masking** nicht-geheimer Felder (`chat_id`, `phone`).
- **[Notiz] Key-in-URL** bei TMDB/Telegram: bei künftigem egress-seitigem Proxy-Logging ein Leck; aktuell kein Blocker.

### Notizen der Rollen (nicht Teil von #24, aber dokumentiert — „nichts wird stillschweigend gelöscht")
- [grafiker] Accessibility: `--text-muted`-Kontrast ~4.1:1 knapp unter WCAG AA; schwacher Focus-Ring (`grafiker.md:264-268`) — übergreifendes Theme-Thema.
- [grafiker] Offene Frage 4: Onboarding-Felder ohne Badge-Pattern (`grafiker.md:363`); Escape-Restore im Zustandsmodell (`grafiker.md:256`).
- [advocatus] A1-Teilaspekt: asymmetrische Leckage bei 9–10-Zeichen-Keys (40–44 % sichtbar, `advocatus.md:14`) — kein Teil von A1 ist Umfang von #24; Over-Masking ist als [kosmetisch]-Risiko (Abschnitt 8), die Leckage hier als Notiz dokumentiert.

## 9. Aufwandsschätzung (KI vs. menschlicher Engpass)

| Arbeitsschritt | KI-Implementierung | Menschlicher Engpass |
|---|---|---|
| Schritt 0: ROADMAP-Item „Auth-Härtung" anlegen (A4 + B8) | — (reine Dokumentation) | Alex-Go; Anlage durch Alex/repo-operator vor der Umsetzung |
| Frontend (Clear-on-Edit, Dirty-Tracking, Gate, Trim, Anzeige, Feedback) | schnell (~1–2 h) | Manuelles Testen der 6 Felder × Zustände durch Alex |
| Backend (400 statt still, Per-Feld-Feedback, Trim) | schnell (~1 h) | Code-Review durch Alex |
| Tests (pytest + node:test) | schnell (~1–2 h) | Abnahme der Testfälle |
| **Gesamt** | **~3–5 h KI-Durchsatz** | **Alex: Review, manuelle UI-Kontrolle, Freigabe (dominierender Anteil)** |

## 10. Quellen, Referenzen & Lizenzen
- **Quellen dieses Briefings:** die Session-Rohoutputs `produktberater.md`, `advocatus.md`, `grafiker.md` (alle im selben Ordner, ungekürzt archiviert) sowie der verifizierte Ist-Zustand im Code (Datei-/Zeilenreferenzen in den Abschnitten).
- **Referenzen (nur Inspiration, keine Kopiervorlagen):** 1Password/Bitwarden, GitHub Personal Access Tokens, Stripe Dashboard — von [grafiker] als Verhaltens-Patterns für Maskierungs-UX benannt (`grafiker.md`, Abschnitt 0). Es wird kein Code, Asset oder Design dieser Produkte übernommen.
- **Lizenzen:** Es werden KEINE lizenzpflichtigen Third-Party-Elemente (Code, Assets, Icons, Fonts, Screenshots) übernommen; Icons sind als Inline-SVG ohne externe Dependencies geplant ([grafiker]). Damit besteht kein blockierendes Lizenz-Risiko. Künftige Ergänzungen (z. B. Icon-Bibliotheken) sind hier mit Quelle, Lizenz und erlaubter Nutzung zu dokumentieren.
