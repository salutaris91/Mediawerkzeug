# Produktberater-Einschätzung: API-Key Maskierung UX

**[produktberater]** Dieser Beitrag bewertet das Roadmap-Item #24 aus Produktsicht. Ziel: den kleinsten sinnvollen Schnitt finden, der den echten Nutzer-Schmerz beseitigt, ohne sich in theoretischen Edge-Cases zu verlieren.

---

## 1. Echter Nutzer-Nutzen

**Zielnutzer:** Alex (oder Admin-Nutzer), der API-Keys für Metadaten-Services (TMDB, TVDB) oder Notification-Services (Telegram, WhatsApp) konfiguriert.

**Kritischer Workflow:**
1. Nutzer öffnet Einstellungen
2. Sieht maskierten Key: `****abcd`
3. Will Key ändern (z.B. weil der alte nicht mehr funktioniert)
4. Klickt ins Feld, löscht nur `abcd`, tippt `efgh`
5. Feld zeigt jetzt: `****efgh`
6. Klickt "Speichern"
7. Erfolgsmeldung: "Einstellungen erfolgreich gespeichert!"
8. **Realität:** Key wurde NICHT geändert, alter Key `****abcd` ist noch aktiv
9. Nutzer wundert sich, warum der neue Key nicht funktioniert, debuggt stundenlang

**Schmerz:** Stilles Scheitern + irreführende Erfolgsmeldung = Misstrauen in die gesamte UI. Nutzer kann sich nicht darauf verlassen, dass seine Aktionen das tun, was die UI behauptet.

**Häufigkeit:** API-Keys werden selten geändert (vielleicht 1-2x pro Jahr), aber wenn es passiert, ist der Schmerz maximal.

---

## 2. Scope-Druck: Variante (b) ist over-scoped

**[produktberater] Dringende Empfehlung: Variante (b) ablehnen, auf MVP zurückgehen.**

### Warum E1 und E2 nicht ins MVP gehören:

**E1 (Legitimer Key beginnt mit `****`):**
- TMDB API Keys: 32 Zeichen hex (z.B. `a1b2c3d4e5f6...`)
- TVDB API Keys: ähnlich, hex oder base64
- Telegram Bot Tokens: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`
- WhatsApp API Keys: längere Strings
- **Wahrscheinlichkeit, dass ein legitimer Key mit `****` beginnt:** < 0.01%
- Das ist ein theoretisches Problem aus der Code-Perspektive, nicht aus der Nutzer-Perspektive

**E2 (Kurz-Keys ≤ 8 Zeichen → nacktes `****`):**
- Alle genannten API-Keys sind > 8 Zeichen (typisch 30-50 Zeichen)
- **Wahrscheinlichkeit, dass ein Nutzer einen Key ≤ 8 Zeichen hat:** ~0%
- Selbst wenn: Placeholder "Hinterlegt" zeigt an, dass etwas gespeichert ist

**[produktberater] Urteil:** E1 und E2 sind "nice-to-have" Edge-Cases, die den Scope um 30-40% aufblähen, aber keinen echten Nutzer-Schmerz adressieren. Sie gehören in ein separates Item "API-Key-Validierung robust machen" (niedrige Priorität).

### MVP (Minimum Viable Product):

**Nur das Hauptproblem lösen:** Stilles Scheitern bei Teil-Editierung verhindern + klare Fehlermeldung, wenn Nutzer versucht, einen maskierten Wert zu speichern.

**Scope für MVP:**
- Frontend: Feld leeren bei Fokus (oder klare Validierung)
- Backend: Fehlermeldung statt stillem Verwerfen
- Alle 6 Felder (tmdb, tvdb, telegram-token, telegram-chat-id, whatsapp-apikey, whatsapp-phone)

---

## 3. Empfehlung des UX-Verhaltens

**[produktberater] Empfehlung: Option A — "Feld leeren bei Fokus" (einfachste Lösung)**

### Drei Optionen im Vergleich:

**Option A: Feld leeren bei Fokus**
- Nutzer klickt ins maskierte Feld → Feld wird sofort geleert
- Nutzer muss Key komplett neu eingeben (aus Password-Manager kopieren)
- Bei Save: wenn Feld leer → Key löschen; wenn neuer Key → speichern
- **Vorteil:** Kein Risiko von `****`-Kollision, einfachste Implementierung, kein stilles Scheitern möglich
- **Nachteil:** Nutzer muss Key komplett neu tippen (aber: Copy-Paste aus Password-Manager ist Standard)

**Option B: Validierung mit Hinweis**
- Nutzer kann Feld teilweise editieren
- Bei Save: Backend prüft, ob Wert mit `****` beginnt → Fehlermeldung "Bitte Feld komplett leeren oder Key komplett ersetzen"
- **Vorteil:** Nutzer behält Kontrolle, kann teilweise editieren
- **Nachteil:** Komplexere Logik (Frontend + Backend), Nutzer muss Fehler verstehen, zwei Ebenen der Validierung nötig

**Option C: Kombination (A + B)**
- Bei Fokus: visueller Hinweis "Feld leeren zum Ändern"
- Bei Save mit `****`: klare Fehlermeldung
- **Vorteil:** Maximale Klarheit
- **Nachteil:** Over-engineered für ein Problem, das mit Option A allein gelöst wird

### **[produktberater] Entscheidung: Option A**

**Begründung:**
1. **Einfachste Lösung:** Nur ein `focus`-Event-Handler im Frontend, der `input.value = ''` setzt. Keine Backend-Änderung nötig (außer: Fehlermeldung statt stilles Verwerfen).
2. **Kein stilles Scheitern:** Wenn Feld leer ist, kann kein `****`-Wert gespeichert werden.
3. **Akzeptabler Trade-off:** API-Keys werden selten geändert. Copy-Paste aus Password-Manager ist Standard-Workflow. Der Aufwand, einen Key komplett neu einzugeben, ist minimal im Vergleich zum Schmerz des stillen Scheiterns.
4. **Klarere Mental Model:** Nutzer versteht: "Wenn ich den Key ändern will, muss ich das Feld leeren und neu eingeben." Das ist intuitiver als "Ich kann teilweise editieren, aber dann muss ich aufpassen, dass nicht `****` übrig bleibt."

**Fallback:** Wenn Nutzer sich beschwert, dass Copy-Paste umständlich ist, kann Option B nachgerüstet werden. Aber: erst wenn es ein echtes Problem gibt, nicht prophylaktisch.

---

## 4. Priorisierung der 6 Felder

**[produktberater] Empfehlung: Alle 6 Felder auf einmal, aber Schwerpunkt auf tmdb/tvdb.**

### Begründung:

**Gleicher Code-Pattern:**
- Alle 6 Felder haben identisches Verhalten (maskiert, gespeichert via `/api/keys` oder `/api/settings`)
- Der Fix ist für alle identisch: `focus`-Handler + Fehlermeldung
- Es wäre inkonsistent, nur 2 oder 4 Felder zu fixen und die anderen nicht

**Kritikalität:**
- **tmdb/tvdb (hoch):** Ohne diese Keys funktioniert das Medienwerkzeug nicht (keine Poster, keine Beschreibungen, keine Metadaten). Das ist der Kern des Tools.
- **telegram/whatsapp (mittel):** Notifications sind Nice-to-have, aber nicht kritisch für die Kernfunktionalität.

**Praktische Umsetzung:**
- Fix wird einmal implementiert (Frontend-Handler + Backend-Fehlermeldung)
- Gilt automatisch für alle 6 Felder
- Testing-Schwerpunkt auf tmdb/tvdb, weil sie kritischer sind
- telegram/whatsapp werden mitgetestet, aber sind nicht der Fokus

**[produktberater] Warnung:** Nicht nur tmdb/tvdb fixen und telegram/whatsapp "später". Das erzeugt technische Schulden und inkonsistentes Verhalten. Der Fix ist billig genug, um ihn für alle 6 Felder auf einmal zu machen.

---

## 5. Akzeptanzkriterien (aus Nutzersicht, überprüfbar)

**[produktberater] Diese Kriterien müssen erfüllt sein, damit das Item als "erledigt" gilt:**

### AC1: Feld leeren bei Fokus
**Wenn** ein Nutzer in ein maskiertes API-Key-Feld klickt (Fokus erhält), **dann** wird das Feld sofort geleert.
- **Test:** `settings-tmdb-key` hat Wert `****abcd`. Nutzer klickt ins Feld. Feld zeigt `""` (leer).

### AC2: Neuer Key wird gespeichert
**Wenn** ein Nutzer das Feld geleert hat und einen neuen Key eingibt, **dann** wird der neue Key beim Speichern erfolgreich gespeichert.
- **Test:** Nutzer klickt ins Feld (wird geleert), tippt `newkey123`, klickt "Speichern". Backend speichert `newkey123`. Beim nächsten Laden zeigt Feld `****1234` (maskiert).

### AC3: Leeres Feld löscht Key
**Wenn** ein Nutzer das Feld leer lässt und speichert, **dann** wird der Key gelöscht (aus `.env` entfernt).
- **Test:** Nutzer klickt ins Feld (wird geleert), lässt es leer, klickt "Speichern". Key wird aus `.env` entfernt. Beim nächsten Laden zeigt Feld Placeholder "Nicht konfiguriert".

### AC4: Keine irreführende Erfolgsmeldung
**Wenn** ein Nutzer versucht, einen maskierten Wert zu speichern (z.B. durch Manipulation des Frontends), **dann** wird eine klare Fehlermeldung angezeigt, NICHT "Einstellungen erfolgreich gespeichert".
- **Test:** Frontend manipulieren, um `****abcd` zu senden. Backend antwortet mit HTTP 400 und Meldung "API-Key scheint maskiert zu sein. Bitte Feld leeren und Key komplett neu eingeben."

### AC5: Erfolgsmeldung nur bei echtem Erfolg
**Wenn** ein Nutzer "Speichern" klickt, **dann** erscheint "Einstellungen erfolgreich gespeichert" **nur**, wenn tatsächlich alle Keys erfolgreich gespeichert wurden.
- **Test:** Ein Key schlägt fehl (z.B. Backend-Fehler). Erfolgsmeldung erscheint NICHT. Stattdessen: Fehlermeldung mit Details.

### AC6: Konsistenz über alle 6 Felder
**Wenn** einer der 6 API-Key-Felder (tmdb, tvdb, telegram-token, telegram-chat-id, whatsapp-apikey, whatsapp-phone) bearbeitet wird, **dann** gilt das gleiche Verhalten (Feld leeren bei Fokus, klare Fehlermeldung bei `****`).
- **Test:** Alle 6 Felder durchgehen, Verhalten prüfen.

---

## 6. Scope-Eingrenzung: Was ist bewusst NICHT Teil dieses Items?

**[produktberater] Um das Item klein und fokussiert zu halten, sind folgende Punkte explizit OUT OF SCOPE:**

### Nicht im MVP:

1. **E1 (Legitimer Key beginnt mit `****`):**
   - Extrem unwahrscheinlich (< 0.01%)
   - Gehört in ein separates Item "API-Key-Validierung robust machen"
   - Kann später nachgerüstet werden, wenn es ein echtes Problem gibt

2. **E2 (Kurz-Keys ≤ 8 Zeichen → nacktes `****`):**
   - API-Keys sind typischerweise > 8 Zeichen
   - Placeholder "Hinterlegt" zeigt an, dass etwas gespeichert ist
   - Gehört in das gleiche separate Item wie E1

3. **Andere Maskierungs-Logik (z.B. `mask_credential()` ändern):**
   - Backend-Maskierung bleibt wie sie ist
   - Nur Frontend-Verhalten wird geändert (Feld leeren bei Fokus)
   - Backend-Fehlermeldung wird hinzugefügt (statt stilles Verwerfen)

4. **Passwort-Felder (`type="password"`):**
   - Nur `type="text"` Felder sind betroffen
   - Passwort-Felder haben eigenes Maskierungs-Verhalten

5. **Andere Settings-Felder (nicht API-Keys):**
   - Nur die 6 API-Key-Felder sind betroffen
   - Andere Settings (z.B. Intervalle, Pfade) haben kein Maskierungs-Problem

6. **UI-Verbesserungen (z.B. "Key anzeigen"-Button):**
   - Kein "Show/Hide"-Toggle für maskierte Keys
   - Kein "Copy-Key"-Button
   - Nur das minimale Verhalten: Feld leeren bei Fokus

7. **Backend-Refactoring:**
   - Keine Änderung an `save_env_keys()` oder `mutate()`
   - Nur Fehlermeldung hinzufügen (statt stilles Verwerfen)

### **[produktberater] Warnung:**
Wenn während der Implementierung zusätzliche Ideen auftauchen (z.B. "Wir könnten auch einen 'Key testen'-Button hinzufügen"), gehören sie in ein separates Item. Dieses Item muss klein bleiben und nur das eine Problem lösen: **stilles Scheitern bei Teil-Editierung verhindern**.

---

## Zusammenfassung der Empfehlungen

| Aspekt | Empfehlung | Begründung |
|--------|------------|------------|
| **Scope** | MVP (ohne E1/E2) | E1/E2 sind theoretische Edge-Cases, kein echter Nutzer-Schmerz |
| **UX-Verhalten** | Option A: Feld leeren bei Fokus | Einfachste Lösung, kein stilles Scheitern möglich |
| **Felder** | Alle 6 auf einmal | Gleicher Code-Pattern, inkonsistentes Verhalten vermeiden |
| **Priorität** | Schwerpunkt tmdb/tvdb | Kritischer für Kernfunktionalität |
| **Akzeptanzkriterien** | AC1-AC6 | Klar überprüfbar, aus Nutzersicht formuliert |
| **Out of Scope** | E1, E2, Passwort-Felder, UI-Verbesserungen | Item klein und fokussiert halten |

**[produktberater] Finale Empfehlung:** Alex sollte Variante (b) ablehnen und stattdessen das MVP umsetzen: Feld leeren bei Fokus + klare Fehlermeldung. Das beseitigt den echten Nutzer-Schmerz mit minimalem Aufwand. E1 und E2 können später in einem separaten Item behandelt werden, wenn sie tatsächlich relevant werden (was unwahrscheinlich ist).
