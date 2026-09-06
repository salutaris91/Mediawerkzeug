# [produktberater] Nutzen-Check Abnahme #24 — Urteil zuerst

> Rohoutput der Rückkanal-Konsultation vom 05.09.2026, ungekürzt archiviert. Gegenstand: Umsetzung von Roadmap-Item #24 (Branch `a2/20260905T133902Z`), Prüfgrundlage Briefing `docs/sessions/2026-09-03-api-key-maskierung-ux/briefing.md`.

---

## Urteil: **Nur mit Nachbesserung**

Die Kernlösung (drei Verteidigungslinien gegen stilles Verwerfen) trifft den ursprünglichen Schmerz zuverlässig — **aber** ein neuer Bug im Theme-Auto-Save-Pfad und unverständliche Fehlermeldungen blockieren die Abnahme. Nach Beseitigung dieser zwei Punkte ist das Item mergefähig.

---

## Befund 1: Hat der ursprüngliche Fehlerfall ein Ende?

**Ja — für den Hauptpfad. Nein — für einen realen Nebenpfad.**

### Die drei Verteidigungslinien funktionieren:

1. **Clear-on-Edit** (`masked_input.js:152-181`): Bei erster Tastatureingabe wird der maskierte Wert komplett geleert. Teil-Editierung ist unmöglich.
2. **Frontend Validation Gate** (`masked_input.js:217-262`, `app.js:9764-9772`): Vor Submit wird `****` erkannt und blockiert.
3. **Backend-Validierung** (`system_api.py:93-105`, `onboarding_api.py:255-267`): HTTP 400 statt stillem Verwerfen.

**Getestete Umgehungswege:**
- **Enter-Taste**: Kein `<form>`-Wrapper um Settings-Inputs → Enter triggert keinen Submit. `ignoredKeys` enthält "Enter" (`masked_input.js:142`) → kein Clear-on-Edit, aber auch kein unbeabsichtigter Save. ✓
- **Onboarding-Weg**: Nutzt normale Textinputs ohne Maskierung (`index.html:146,159`) → kein Konflikt. ✓
- **Browser-Autofill**: Würde `input`-Event triggern → Clear-on-Edit greift. ✓

### KRITISCH: Neuer Bug im Theme-Auto-Save-Pfad

**`app.js:486-504`** speichert bei Theme-Wechsel das gesamte `currentSettings`-Objekt an `/api/settings`. `currentSettings` enthält die maskierten Keys aus `loadSettings()` (`app.js:8342`):

```javascript
const payload = {
    ...currentSettings,  // Enthält tmdb_api_key: "****1234" etc.
    app_theme: newTheme,
    // ...
};
await fetch("/api/settings", { method: "POST", body: JSON.stringify(payload) });
```

**Folge**: Backend gibt HTTP 400 zurück (`system_api.py:102-103`) → Theme-Change scheitert still (`app.js:501-503` fängt nur `console.error`). Der Nutzer sieht keine Fehlermeldung, aber das Theme wird nicht gespeichert.

**Das ist ein regressiver Bug**: Vor dieser Änderung funktionierte Theme-Change, jetzt schlägt er fehl.

**Lösung**: Maskierte Keys aus `currentSettings` vor dem Senden entfernen:
```javascript
const { tmdb_api_key, tvdb_api_key, telegram_token, telegram_chat_id, whatsapp_apikey, whatsapp_phone, ...cleanSettings } = currentSettings;
const payload = { ...cleanSettings, app_theme: newTheme, /* ... */ };
```

---

## Befund 2: Verständlichkeit aus Nutzersicht

### Sichtbarkeit des Key-Status: **Gelöst**

Badge-Anzeige (`✓`/`○`/`⚠`) ist entkoppelt vom Input-Wert (`masked_input.js:22-98`). Auch Kurz-Keys (`****` ohne Suffix) werden korrekt als "hinterlegt" erkannt (`masked_input.js:110`, AC6-Test `masked_input.test.js:266-288`).

### Fehlermeldungen: **Fachjargon-Falle**

**Problem**: "Maskierungszeichen" ist kein Begriff, den ein Nicht-Entwickler kennt.

- `masked_input.js:238`: *"Der Wert enthält Maskierungszeichen (****) und wurde nicht gespeichert."*
- `system_api.py:103`: *"Maskierter Wert für 'telegram_token' erkannt."*

**Vorschlag für nutzerfreundliche Formulierungen:**
- Frontend: *"Das Feld enthält noch den geschützten Wert (****). Bitte lösche den Inhalt komplett und gib den neuen Key ein."*
- Backend: *"Das Feld 'telegram_token' enthält noch den alten, geschützten Wert. Bitte das Feld leeren und den neuen Key eingeben."*

**Whitespace-Fehler** (`masked_input.js:248`): *"Ungültiger Wert: Enthält nur Leerzeichen."* — klar, keine Änderung nötig.

---

## Befund 3: Scope-Treue

### Angemessen für den Schmerz

- **290 Zeilen Modul + 304 Zeilen Tests** für 6 Felder × 4 Zustände (pristine/editing/valid/invalid) = 24 Kombinationen. Die Komplexität ist gerechtfertigt.
- **Drei Verteidigungslinien** (Frontend-Clear, Frontend-Validation, Backend-Validation) sind notwendig, weil der Nutzer nicht nur über das Frontend kommt (API-Direktaufrufe, zukünftige UI-Änderungen).

### Scope-Lücke: Per-Feld-Feedback nicht konsumiert

**AC14 (Per-Feld-Feedback)** wurde im Backend umgesetzt (`system_api.py:105,126`, `onboarding_api.py:267,277`), aber das Frontend wertet `response.fields` nicht aus:

```javascript
// app.js:9842-9872
if (response.ok) {
    // ...
    alert("Einstellungen erfolgreich gespeichert!");  // Global, nicht pro Feld
}
```

**Konsequenz**: Wenn ein Key-Feld vom Backend abgelehnt wird (z.B. wegen Race-Condition), sieht der Nutzer nur "Fehler beim Speichern der Einstellungen: [error]", aber nicht, welches Feld betroffen ist.

**Bewertung**: Für den MVP-Scope vertretbar, aber AC14 ist nur halb umgesetzt. Entweder:
- **Option A**: Frontend wertet `response.fields` aus und zeigt differenzierte Meldung (z.B. "5 von 6 Einstellungen gespeichert. Fehler bei: TMDB Key").
- **Option B**: AC14 wird aus dem Scope dieses Items genommen und auf die Roadmap gesetzt (mit Verweis auf diese Abnahme).

### Was hätte weggekonnt

`updateMaskedInputState()` (`masked_input.js:22-98`) behandelt viele Edge-Cases (Whitespace-only, Empty-after-Clear, Valid-Change). Für den MVP hätte eine einfachere Variante gereicht (nur "pristine" vs. "invalid" vs. "valid"). **Aber**: Die 6 Felder × 4 Zustände rechtfertigen die Detaillierung. Keine Überdimensionierung.

---

## Befund 4: Was fehlt für die Abnahme

### Zwingend vor Merge (Blocker)

1. **Theme-Auto-Save-Bug beheben** (`app.js:486-504`): Maskierte Keys aus `currentSettings` vor dem Senden entfernen.
2. **Fehlermeldungen verständlich formulieren**: "Maskierungszeichen" → "geschützter Wert" oder ähnlich.

### Bewusst NICHT in #24 (Roadmap)

- **Auth-Härtung (A4, D4)**: Offener Default-Endpoint ohne Passwort/CSRF/Rate-Limit. Eigenes Roadmap-Item erforderlich (siehe Briefing Abschnitt 6, Schritt 0). **Status**: Item existiert noch nicht in ROADMAP.md → muss vor Merge von #24 durch Alex angelegt werden.
- **Mass Assignment (B8)**: `/api/settings` übernimmt beliebige Keys ohne Server-Whitelist (`system_api.py:122-123`). Gehört ins Auth-Härtung-Item.
- **Per-Feld-Feedback im Frontend (AC14)**: Siehe Befund 3. Entweder nachrüsten oder auf Roadmap.
- **Over-Masking nicht-geheimer Felder** (`telegram_chat_id`, `whatsapp_phone`): Kosmetisch, nicht Teil von #24.
- **Mindestlängen-Validierung für Keys**: Offene Frage, nicht entschieden → nicht Teil von #24.
- **Key-in-URL bei TMDB/Telegram**: Egress-Logging-Falle, nur als Notiz dokumentiert.

---

## Verworfene/überflüssige Komplexität

**Keine.** Das Modul ist gut strukturiert, testbar und wiederverwendbar. Die drei Verteidigungslinien sind notwendig für die geforderte Zuverlässigkeit. Die Badge-Anzeige (✓/○/⚠) ist minimal und verständlich.

---

## Offene Punkte für die Roadmap

1. **Auth-Härtung (A4 + B8)**: Eigenes Item anlegen (siehe Briefing Abschnitt 6, Schritt 0). **Priorität: hoch** — Sicherheitsrisiko.
2. **Per-Feld-Feedback im Frontend (AC14)**: Entweder nachrüsten oder als "nice-to-have" auf Roadmap.
3. **Mindestlängen-Validierung für Keys**: Entscheidung nachholen, dann umsetzen.
4. **Over-Masking nicht-geheimer Felder**: Kosmetisch, niedrig priorisiert.
5. **Key-in-URL bei TMDB/Telegram**: Bei künftigem egress-seitigem Proxy-Logging relevant, aktuell kein Blocker.

---

## Zusammenfassung

| Kriterium | Status |
|-----------|--------|
| Ursprünglicher Fehlerfall gestoppt | ✓ (Hauptpfad) / ✗ (Theme-Auto-Save) |
| Verhalten aus Nutzersicht verständlich | ✓ (Badge-Anzeige) / ✗ (Fehlermeldungen) |
| Scope-Treue | ✓ (angemessen) / △ (AC14 halb umgesetzt) |
| Bereit für Merge | ✗ (2 Blocker) |

**Nächste Schritte:**
1. Theme-Auto-Save-Bug beheben (15 min).
2. Fehlermeldungen formulieren (10 min).
3. Alex entscheidet: AC14 nachrüsten oder auf Roadmap?
4. ROADMAP.md: Auth-Härtung-Item anlegen (Alex-Go erforderlich).

---

## Nachtrag / Korrekturnotiz des Orchestrators (05.09.2026, klar getrennt vom Rohoutput)

Die Aussage in Befund 4 und „Nächste Schritte" Punkt 4 („Auth-Härtung-Item existiert noch nicht in ROADMAP.md") ist **faktisch nicht korrekt**: [advocatus] und der Orchestrator haben unabhängig gegengeprüft — `ROADMAP.md:1677-1691` enthält Item **#58 „Auth-Härtung: offener Default-Endpoint + fehlende Server-Whitelist"** (A4 + B8, mit Verweis auf die 03.09.-Session). Schritt 0 des Briefings ist damit **erfüllt**; es muss kein Item mehr angelegt werden. Der Rohoutput bleibt der Unversehrtheit wegen ungeändert.
