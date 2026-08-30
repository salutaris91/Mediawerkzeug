# Kreativteam-Session: Standortbestimmung — produktberater

> Session: 2026-08-30 · Rolle: `produktberater` (Subagent) · Ausgelöst über `ceo-planner`
> (headless via OpenCode-Bridge, `opencode run --agent ceo-planner --dir <Medienwerkzeug>`).
> Ungekürzter Rohoutput, wie von der Rolle geliefert.

# Produktbewertung Medienwerkzeug — August 2026

## 1. Empfehlung: Kandidat B (#53 Health-Check-Schweregrade entfernen)

**Begründung aus Nutzerwert-Sicht:**

Alex hat am 16.07.2026 nach dem ersten Voll-Scan der echten Bibliothek selbst festgestellt: Bei 288 kritischen + 1.225 Warnungen + 382 Hinweisen verliert die Dreiteilung jede Orientierungswirkung. Das ist ein **täglich sichtbares UX-Problem** — Alex sieht diese Zahlen jedes Mal, wenn er den Health-Scan startet.

**Warum B und nicht A oder D?**

- **A (#52 Wizard):** Der aktuelle NFO-Agent funktioniert. Ein Wizard wäre schöner, aber Alex kommt damit zurecht. Es ist ein Refactoring, kein Bugfix.
- **D (#51 NFO-Agent vervollständigen):** Artwork/Studios/Darsteller fehlen — aber wie oft braucht Alex das wirklich? Die Kernfelder (Titel, Plot, Jahr, FSK, Genres) sind abgedeckt. Das ist kein Engpass im täglichen Workflow.
- **B (#53 Schweregrade entfernen):** Löst ein echtes, von Alex selbst identifiziertes Problem. Ist klein (Frontend-only in Schritt 1). Verbessert die tägliche Nutzung sofort. Ist bereits beschlossen — keine neue Entscheidung nötig.

**Warum nicht C (#54 Retry-Helfer)?**

Robustheit ist wichtig, aber Alex merkt transiente Timeouts kaum, wenn sie im Hintergrund passieren und der Retry-Helfer sie abfängt. Es ist "unsichtbare" Arbeit — gut, aber nicht prioritär.

**Warum nicht E (Quick-Wins)?**

Die Quick-Wins sind verlockend, weil sie schnell erledigt sind. Aber sie sind auch beliebig und lösen kein kohärentes Problem. Besser: einen klaren, kleinen Schritt machen, der ein echtes Problem löst.

---

## 2. Kurzbewertung aller Kandidaten

| Kandidat | Nutzen | Aufwand | Dringlichkeit |
|----------|--------|---------|---------------|
| **A: #52 Wizard** | Mittel — klarerer Workflow, aber aktueller Zustand funktioniert | Mittel (Frontend-Umstrukturierung + Tests) | Niedrig — kein akutes Problem |
| **B: #53 Schweregrade entfernen** | **Hoch** — löst täglich sichtbares UX-Problem | **Klein** (Frontend-only, Schritt 1) | **Hoch** — von Alex selbst identifiziert |
| **C: #54 Retry-Helfer** | Mittel —Robustheit, aber unsichtbar für Alex | Mittel (viele Stellen, sorgfältige Prüfung) | Niedrig — Alex merkt die Verbesserung kaum |
| **D: #51 NFO-Agent vervollständigen** | Niedrig — Artwork/Studios/Darsteller sind nett, aber nicht kritisch | Klein–mittel | Niedrig — Kernfelder sind abgedeckt |
| **E: Quick-Win-Sammel** | Mittel — viele kleine UX-Verbesserungen, aber beliebig | Klein pro Item, aber Summe mittel | Niedrig — kein kohärentes Problem |
| **F: #1 Multi-Cloud** | Niedrig — Alex hat nur eine Cloud (pCloud) | Mittel–groß | **Keine** — kein echter Bedarf |
| **G: #18 Docker-Image veröffentlichen** | Strategisch — nur relevant, wenn Alex verteilen will | Mittel | **Keine** — kein Verteilungsplan |
| **H: Hausarbeit** | Niedrig — Meta-Arbeit ohne direkten Nutzerwert | Klein | Niedrig — kann nebenher passieren |

---

## 3. Explizite "Jetzt NICHT"-Liste

**F (#1 Multi-Cloud):**
Alex hat nur eine Cloud (pCloud). Multi-Cloud ist ein "nice to have" ohne echten Bedarf. Scope-Creep-Gefahr: hoch, weil es das Job- und Settings-Modell grundlegend umbaut. **Begründung:** Kein Nutzerwert, wenn Alex nur ein Ziel verwendet.

**G (#18 Docker-Image veröffentlichen):**
Nur relevant, wenn Alex das Tool an andere verteilen will. Aktuell tut er das nicht. **Begründung:** Strategische Arbeit ohne akuten Anlass. Sollte warten, bis Alex explizit sagt: "Ich will das Tool verteilen."

**D (#51 NFO-Agent vervollständigen — Artwork/Studios/Darsteller):**
Die Kernfelder sind abgedeckt. Artwork/Studios/Darsteller sind nett, aber wie oft braucht Alex das? **Begründung:** Kein Engpass im täglichen Workflow. Kann warten, bis Alex explizit sagt: "Ich brauche Artwork-Verwaltung."

**A (#52 Wizard):**
Der aktuelle NFO-Agent funktioniert. Ein Wizard wäre schöner, aber es ist ein Refactoring, kein Bugfix. **Begründung:** Kann warten, bis Alex explizit sagt: "Der NFO-Agent ist unübersichtlich." (Hat er nicht — im Gegenteil, er hat ihn aktiv genutzt.)

**H (Hausarbeit — .mcp.json, Capability-Check, .venv):**
Meta-Arbeit ohne direkten Nutzerwert. Ein dauerhaftes .venv wäre praktisch, aber nicht kritisch. **Begründung:** Kann nebenher passieren, sollte aber nicht den Anfang machen. Alex' Zeit ist wertvoll — sie sollte für Dinge mit direktem Nutzerwert verwendet werden.

---

## 4. MVP-Schnitt für B (#53 Schweregrade entfernen)

**Schritt 1 ist bereits minimal** (wie in der Roadmap beschrieben):

1. **Frontend:** Schweregrad-Ansicht entfernen (Anzeigemodus "Schweregrad" aus dem Dropdown)
2. **Frontend:** Severity-Chips (kritisch/Warnung/Hinweis) durch eine Gesamtzahl plus Gruppenzähler ersetzen
3. **Frontend:** Severity-Färbung entfernen
4. **Backend:** Unverändert lassen (API-Kompatibilität, Alt-Caches)
5. **Tests:** Frontend-Tests anpassen

**Was NICHT getan wird:**
- Backend-Bereinigung (severity aus _add_issue, Summary, Cache-Schema entfernen) — das ist Schritt 2 und kann warten
- Cache-Version erhöhen — nicht nötig, wenn Backend unverändert bleibt
- "Defektes zuerst"-Sortierung — kann später geprüft werden, wenn Alex Feedback gibt

**Akzeptanzkriterium:**
- Alex sieht im Health-Dashboard nur noch eine Gesamtzahl + Gruppenzähler (Metadaten/Artwork/Dateien/Struktur)
- Die Anzeigemodi "Fehlertyp" und "Medienorientiert" funktionieren unverändert
- Alle bestehenden Frontend-Tests sind angepasst und grün

**Geschätzter Aufwand:** 0,5–1 Tag (Frontend-Änderungen + Testanpassungen)

---

## 5. Wichtigste offene Frage an Alex

**"Willst du das Medienwerkzeug an andere verteilen?"**

- **Wenn ja:** Dann wäre G (#18 Docker-Image veröffentlichen) prioritär — das ist die Grundlage für alles andere (Update-Hinweise, Lizenzhinweise, Distribution).
- **Wenn nein (aktuelle Situation):** Dann ist B (#53 Schweregrade entfernen) der sinnvollste Schritt, weil es ein echtes, täglich sichtbares Problem löst.

**Begründung:** Die strategischen Kandidaten (F, G) haben nur Wert, wenn Alex das Tool verteilen will. Wenn Alex es nur selbst nutzt (aktuelle Situation), haben sie keinen Nutzerwert. Diese Frage ändert die Reihenfolge fundamental.

---

## Zusammenfassung

**Empfehlung:** B (#53 Health-Check-Schweregrade entfernen) zuerst.

**Warum:**
1. Löst ein echtes, von Alex selbst identifiziertes Problem
2. Ist klein und schnell erledigt (0,5–1 Tag)
3. Verbessert die tägliche Nutzung sofort
4. Ist bereits beschlossen — keine neue Entscheidung nötig
5. Blockiert Alex' Review-Kapazität minimal

**Was danach kommt:**
- C (#54 Retry-Helfer) — wenn Alex Robustheit wichtig ist
- A (#52 Wizard) — wenn Alex den NFO-Agent übersichtlicher haben will
- E (Quick-Wins) — wenn Alex kleine UX-Verbesserungen sammeln will

**Was nicht kommt (bis Alex explizit sagt, dass er verteilen will):**
- F (Multi-Cloud)
- G (Docker-Image veröffentlichen)
