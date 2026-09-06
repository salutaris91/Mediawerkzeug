# API-Key Maskierung UX — Konzeptionelle Ausarbeitung [grafiker]

> **Hinweis zur Bezugsgrundlage:** Die `docs/designsprache.md` existiert im Repository nicht (Stand 03.09.2026). Diese Konzeption bezieht sich daher auf die tatsächlich gepflegten Theme-Variablen in `gui/static/style.css` (Deep-Space-Default: `--bg-base #09090b`, `--bg-surface #18181b`, `--accent #2563eb`, `--bg-input #27272a`, `--border-glass`) und die bestehende Input-Struktur in `gui/static/index.html` (Klasse `inline-style-40` für Inputs, `inline-style-134` für Labels). Abweichungen von einer künftig zu definierenden Designsprache sind explizit markiert.

---

## 0. Ausgangslage & Präzedenzfälle

**Empfehlung (bevorzugte Option):** Kombination **A + B** mit einem **3-Zustands-Modell** (pristine → editing → valid/invalid) und einem **vom Input-Wert entkoppelten Statusindikator** neben dem Feld.

**Kurzbegründung:** Lösung A allein verhindert den Bug, gibt aber kein visuelles Feedback, dass der alte Wert verworfen wird. Lösung B allein lässt den Nutzer im Unklaren, warum sein Wert nicht akzeptiert wird. Die Kombination beider Ansätze ist Standard in Credential-UIs.

**Trade-off/Risiko:** Höherer Implementierungsaufwand als Einzellösung (~2–3 Stunden Vanilla-JS/CSS). Das 3-Zustands-Modell erfordert Disziplin bei der Zustandsverwaltung in `app.js`.

### Präzedenzfälle

| App/Pattern | Übernommen | Bewusst ignoriert |
|---|---|---|
| **1Password / Bitwarden** (Passwort-Manager) | Maskierter Wert bleibt bis zur ersten Interaktion sichtbar; "Reveal"-Toggle als optionales Pattern. | Kein Reveal-Toggle für API-Keys — zu exponiert für ein Settings-Panel; das "teilweise Editieren" ist das Kernproblem, nicht das Ablesen. |
| **GitHub Personal Access Tokens** (`ghp_****…****ABCD`) | Suffix-Anzeige (`****1234`) als Best Practice für "etwas ist hinterlegt, aber ich zeige nicht alles". | Kein "Regenerate"-Button — unsere Keys werden vom Nutzer extern verwaltet, nicht bei uns generiert. |
| **Stripe Dashboard API-Keys** (`sk_live_****…****`) | Frontend-Validierung, die das Absenden maskierter Werte blockiert + klare Fehlermeldung. | Kein "Roll"-Mechanismus; kein 2-Faktor-Reveal vor Edit. |

**Kern-Erkenntnis aus den Präzedenzfällen:** Alle drei trennen die Frage *"Ist etwas hinterlegt?"* (Statusindikator außerhalb des Inputs) von der Frage *"Was ist der Wert?"* (Input-Feld). Genau diese Trennung löst das Kurz-Key-Problem (`****` ohne Suffix ist mehrdeutig) elegant: Der Statusindikator zeigt verlässlich "hinterlegt" an, unabhängig davon, was im Input steht.

---

## 1. Empfohlenes Interaktionsmodell [grafiker]

### Empfehlung: 3-Zustands-Modell mit "Clear-on-Edit" + Frontend-Gate

Ich empfehle **Kombination A + B**, umgesetzt als sequenzieller Zustandsautomat pro Feld:

```
┌─────────────────┐      Fokus       ┌─────────────────┐     erste Eingabe    ┌─────────────────┐
│   PRISTINE      │ ───────────────► │   FOCUSED       │ ──────────────────► │   EDITING       │
│                 │                  │                 │                     │                 │
│ value: ****1234 │                  │ value: ****1234 │                     │ value: ""       │
│ border: default │                  │ border: accent  │                     │ border: accent  │
│ badge: ✓        │                  │ badge: ✓        │                     │ badge: ✎ (edit) │
└─────────────────┘                  └─────────────────┘                     └─────────────────┘
                                                                                       │
                                                                              Submit-Validierung
                                                                                       │
                                                                    ┌──────────────────┴──────────────────┐
                                                                    ▼                                      ▼
                                                          ┌─────────────────┐                    ┌─────────────────┐
                                                          │   VALID         │                    │   INVALID       │
                                                          │                 │                    │                 │
                                                          │ value: neuerKey │                    │ value: ****xyz  │
                                                          │ border: accent  │                    │ border: danger  │
                                                          │ badge: ✓ neu    │                    │ badge: ⚠ Fehler │
                                                          └─────────────────┘                    └─────────────────┘
```

### Zustandsbeschreibung im Detail

| Phase | Input-Wert | Border | Placeholder | Badge/Icon | Verhalten |
|---|---|---|---|---|---|
| **Pristine** (geladen) | `****1234` (maskiert vom Backend) | `--border-glass` (neutral) | "Hinterlegt" bzw. "Nicht konfiguriert" | ✓ (grün, "Hinterlegt") | Feld ist fokussierbar, aber Wert ist unverändert. `dataset.original` gesetzt. |
| **Focused** (Klick ins Feld, noch keine Eingabe) | `****1234` (unverändert) | `--accent` (blau, 1px) | "Hinterlegt" | ✓ (grün) + dezenter Hint: "Tippen zum Ersetzen" | Cursor blinkt am Ende. Wert noch nicht geleert — Nutzer kann sich erstmal orientieren. |
| **Editing** (erste Taste gedrückt) | `""` (geleert, "Clear-on-Edit") | `--accent` | "Neuen API-Key eingeben" | ✎ (blau, "Wird ersetzt") | **Hier passiert das Leeren (A).** Der maskierte Wert wird komplett entfernt, der Nutzer tippt sauber neu. |
| **Blur ohne Änderung** (Fokus weg, nichts eingegeben) | `****1234` (wiederhergestellt) | `--border-glass` | "Hinterlegt" | ✓ (grün) | Feld fällt in Pristine zurück. Kein "halber" Zustand. |
| **Valid** (neuer Wert eingegeben, ≥ Mindestlänge) | `neuerWert` (Klartext) | `--accent` | — | ✓ (grün, "Neuer Wert") | Bereit zum Speichern. |
| **Invalid** (Submit-Versuch mit `****`-Resten) | `****xyz` | `--color-danger` (rot) | — | ⚠ (rot, Fehlermeldung sichtbar) | **Frontend-Gate (B)** blockiert Submit. Fehlermeldung erscheint. |

### Warum "Clear-on-Edit" statt "Clear-on-Focus"?

- **Clear-on-Focus** (Leeren schon beim Klick) ist aggressiver — der Nutzer sieht den maskierten Wert nie, wenn er nur kurz reinschaut. Das erzeugt Unsicherheit ("War da was?").
- **Clear-on-Edit** (Leeren bei erster Eingabe) ist **progressiv**: Der Nutzer kann das Feld fokussieren, den maskierten Wert sehen, und *entscheidet dann*, ob er tippt. Das ist das Pattern, das 1Password und Browser-Passwort-Manager verwenden.
- **Blur-Restore** ist essenziell: Wenn der Nutzer ins Feld klickt, aber nichts tippt und woanders hingeht, muss der maskierte Wert wieder erscheinen. Sonst entsteht der Eindruck, der Key sei gelöscht.

### Warum Frontend-Gate (B) trotzdem nötig ist?

Clear-on-Edit verhindert den Normalfall. Aber: Ein Nutzer könnte den maskierten Wert markieren, *einzelne Zeichen* überschreiben (z.B. `****1234` → `****1235`), und auf Speichern klicken. Das Frontend muss diesen Fall abfangen, bevor das Backend den Wert still verwirft. Die Validierungsregel:

> **Wenn der Feldwert mit `****` beginnt (oder `****` enthält), ist er ungültig.** Das Backend maskiert mit `****`-Präfix — jeder Wert, der dieses Muster enthält, ist entweder der originale Maskierungswert oder ein teiledierter Rest. Beides ist nicht speicherbar.

---

## 2. Sichtbarkeit des Zustands [grafiker]

### Entkopplung: Statusindikator ≠ Input-Wert

Das Kurz-Key-Problem (`****` ohne Suffix bei Keys ≤ 8 Zeichen) zeigt: **Der Input-Wert allein ist kein verlässlicher Indikator für "hinterlegt".** Die Lösung: Ein **Status-Badge rechts neben dem Input** (inside the input container, als Suffix-Icon), das den Zustand unabhängig vom Input-Wert anzeigt.

### Visuelle Hierarchie der Zustände

```
┌──────────────────────────────────────────────────────────────────────────┐
│  TMDb API-Key:                                                           │
│  ┌─────────────────────────────────────────┬──────┐                      │
│  │ ****1234                                │  ✓   │  ← Status-Badge     │
│  └─────────────────────────────────────────┴──────┘                      │
│  Hinterlegt                                                               │
│                                                                          │
│  Telegram Bot Token:                                                     │
│  ┌─────────────────────────────────────────┬──────┐                      │
│  │                                         │  ○   │  ← "Nicht hinterlegt"│
│  └─────────────────────────────────────────┴──────┘                      │
│  Nicht konfiguriert                                                       │
│                                                                          │
│  WhatsApp API Key:                                                       │
│  ┌─────────────────────────────────────────┬──────┐                      │
│  │ meinNeuerKey123                         │  ✓   │  ← "Neu eingegeben" │
│  └─────────────────────────────────────────┴──────┘                      │
│  Wird gespeichert                                                         │
│                                                                          │
│  WhatsApp Handynummer:                                                   │
│  ┌─────────────────────────────────────────┬──────┐                      │
│  │ ****xy                                  │  ⚠   │  ← "Ungültig"       │
│  └─────────────────────────────────────────┴──────┘                      │
│  ⚠ Wert enthält Maskierungszeichen. Bitte vollständig neu eingeben.      │
└──────────────────────────────────────────────────────────────────────────┘
```

### Badge-Zustände (SVG-Inline, keine Dependencies)

| Zustand | Icon | Farbe | Hintergrund |
|---|---|---|---|
| **Hinterlegt** (pristine, Key vorhanden) | ✓ (Check) | `--accent` (#2563eb) | `rgba(37, 99, 235, 0.1)` |
| **Nicht hinterlegt** (leer, nie konfiguriert) | ○ (Kreis, offen) | `--text-muted` | transparent |
| **Wird gespeichert** (neuer Wert eingegeben, valid) | ✓ (Check) | `#10b981` (Erfolgsgrün) | `rgba(16, 185, 129, 0.1)` |
| **Ungültig** (Maskierung erkannt) | ⚠ (Ausruf) | `#ef4444` (Fehlerrot) | `rgba(239, 68, 68, 0.1)` |
| **In Bearbeitung** (focused, noch keine Eingabe) | ✎ (Stift) | `--accent` | transparent |

### Farb-/Rahmenzustände des Inputs

| Zustand | Border | Background | Box-Shadow |
|---|---|---|---|
| Pristine | `1px solid --border-glass` | `--bg-input` | none |
| Focused | `1px solid --accent` | `--bg-input-focus` | `0 0 0 3px rgba(37, 99, 235, 0.15)` (Focus-Ring) |
| Editing | `1px solid --accent` | `--bg-input-focus` | `0 0 0 3px rgba(37, 99, 235, 0.15)` |
| Invalid | `1px solid #ef4444` | `rgba(239, 68, 68, 0.05)` | `0 0 0 3px rgba(239, 68, 68, 0.15)` |

### Das Kurz-Key-Problem: Lösung

Bei Keys ≤ 8 Zeichen zeigt das Backend `****` (ohne Suffix). **Trotzdem** zeigt das Status-Badge ✓ "Hinterlegt" an — denn der Zustand "hinterlegt" kommt aus `dataset.original` (bzw. einem `data-has-key="true"`-Attribut), nicht aus dem Input-Wert. Der Input zeigt `****`, das Badge sagt "ist da". Mehrdeutigkeit aufgelöst.

**Konkret:** Das Backend liefert beim Laden nicht nur den maskierten Wert, sondern auch ein Flag `has_key: true/false` pro Feld. Alternativ (wenn Backend-Änderung zu aufwendig): Das Frontend leitet `has_key` aus dem Vorhandensein eines nicht-leeren maskierten Werts ab — auch `****` ohne Suffix ist ein nicht-leerer Wert und damit "hinterlegt".

---

## 3. Mikrotexte [grafiker]

Alle Texte auf Deutsch, korrekte Umlaute, beschreibend (Hausregel: Fehlermeldungen beschreiben das Geschehene).

### Placeholder (im Input-Feld)

| Feld | Pristine (Key vorhanden) | Pristine (kein Key) | Editing (nach Clear) |
|---|---|---|---|
| TMDb API-Key | `Hinterlegt` | `Nicht konfiguriert (Metadaten eingeschränkt)` | `Neuen TMDb-API-Key eingeben` |
| TVDb API-Key | `Hinterlegt` | `Nicht konfiguriert (optional)` | `Neuen TVDb-API-Key eingeben` |
| Telegram Bot Token | *(kein Placeholder im Pristine — Wert steht im Feld)* | `z.B. 123456:ABC-DEF…` | `Neuen Bot-Token eingeben` |
| Telegram Chat ID | *(kein Placeholder im Pristine)* | `z.B. -100123456789` | `Neue Chat-ID eingeben` |
| WhatsApp API Key | `apikey von CallMeBot` | `apikey von CallMeBot` | `Neuen API-Key eingeben` |
| WhatsApp Handynummer | `+49123456789` | `+49123456789` | `Neue Handynummer eingeben` |

**Anmerkung:** Telegram-Felder haben aktuell keine Placeholder. Ich empfehle, im "nicht konfiguriert"-Zustand Beispiel-Placeholder zu setzen, damit der Nutzer eine Vorstellung vom erwarteten Format hat. Das ist besonders wichtig, weil die Chat-ID ein ungewohntes Format hat (negative Zahl für Gruppen).

### Helper-Text (unter dem Feld, statisch)

| Feld | Helper-Text |
|---|---|
| TMDb API-Key | `Kostenlos registrieren unter themoviedb.org` |
| TVDb API-Key | `Optional. Kostenlos registrieren unter thetvdb.com` |
| Telegram Bot Token | `Erstellen über @BotFather auf Telegram` |
| Telegram Chat ID | `Für Gruppen: ID beginnt mit -100. Nutze @userinfobot.` |
| WhatsApp API Key | `API-Key aus der CallMeBot-App` |
| WhatsApp Handynummer | `Internationales Format, z.B. +49 für Deutschland` |

### Validierungs-Fehlermeldung (dynamisch, unter dem Feld, rot)

**Hauptfall (Maskierung erkannt):**
> `Der Wert enthält Maskierungszeichen (****) und wurde nicht gespeichert. Bitte das Feld vollständig leeren und den Key neu eingeben.`

**Alternativ, kürzer:**
> `Maskierter Wert erkannt. Bitte vollständig neu eingeben — der bisherige Key bleibt erhalten.`

**Für den Fall "Feld leer, aber Key war hinterlegt" (Nutzer hat gelöscht, will aber nicht speichern):**
> *(Keine Fehlermeldung — leeres Feld ist valide, bedeutet "Key entfernen".)*

**Für den Fall "neuer Wert zu kurz" (optional, falls Mindestlänge gewünscht):**
> `Der Key ist zu kurz (mindestens 8 Zeichen). Bitte prüfen.`

### Erfolgsmeldung (nach Speichern)

| Szenario | Meldung | Stil |
|---|---|---|
| Alle Felder erfolgreich gespeichert | `Einstellungen gespeichert.` | Grün, Toast |
| Einige Felder gespeichert, maskierte Felder übersprungen | `Einstellungen teilweise gespeichert. Maskierte Key-Felder wurden übersprochen — bitte vollständig neu eingeben.` | Gelb/Amber, Toast |
| Fehler beim Speichern | `Fehler beim Speichern: {Fehlermeldung}` | Rot, Toast |

---

## 4. Konsistenz: Einheitliches Muster über alle 6 Felder + Onboarding [grafiker]

### Empfehlung: Ein gemeinsamer `<div class="masked-key-field">`-Wrapper

Alle 6 Felder + die 2 Onboarding-Felder (`onboarding-tmdb-key`, `onboarding-tvdb-key`) werden in dieselbe Wrapper-Struktur eingebettet. Das garantiert visuelles und verhaltensmäßiges Mapping.

```
<div class="masked-key-field" data-field-id="settings-tmdb-key" data-has-key="true">
    <label for="settings-tmdb-key" class="inline-style-134">TMDb API-Key:</label>
    <div class="masked-key-input-wrapper">
        <input type="text" id="settings-tmdb-key" class="masked-key-input"
               data-original="****1234" data-masked="true"
               placeholder="Hinterlegt"
               aria-describedby="settings-tmdb-key-helper settings-tmdb-key-error">
        <span class="masked-key-badge" aria-hidden="true">✓</span>
    </div>
    <span class="masked-key-helper" id="settings-tmdb-key-helper">
        Kostenlos registrieren unter themoviedb.org
    </span>
    <span class="masked-key-error" id="settings-tmdb-key-error"
          role="alert" aria-live="polite"></span>
</div>
```

### Warum diese Struktur?

- **`data-has-key`** am Wrapper: Steuert den Badge-Zustand unabhängig vom Input-Wert. Löst das Kurz-Key-Problem.
- **`data-original`** am Input: Speichert den beim Laden erhaltenen maskierten Wert. Wird für die "unverändert"-Erkennung beim Speichern verwendet (bereits vorhanden für TMDb/TVDb, muss auf Telegram/WhatsApp ausgeweitet werden).
- **`data-masked`** am Input: Flag, ob der aktuelle Wert eine Maskierung ist. Wird beim Clear-on-Edit auf `false` gesetzt.
- **`aria-describedby`** verknüpft Input mit Helper-Text und Fehlermeldung (Screenreader liest beides vor).
- **`role="alert" + aria-live="polite"`** an der Fehlermeldung: Screenreader kündigt Fehler an, ohne den Nutzer zu unterbrechen.

### Onboarding-Flow

Die Onboarding-Felder (`onboarding-tmdb-key`, `onboarding-tvdb-key`) übernehmen **dasselbe Pattern**, aber ohne `data-original` (im Onboarding gibt es keine vorherigen Werte). Der Clear-on-Edit-Mechanismus greift hier nicht — die Felder sind immer "frisch". Die Badge-Logik entfällt im Onboarding (es gibt nichts zu "verbergen"). Stattdessen: Einfaches `placeholder="z.B. a1b2c3d4..."` (bereits vorhanden).

**Abweichung vom Pattern begründet:** Im Onboarding sind die Felder per Definition leer oder enthalten einen Klartext-Wert. Maskierung ist irrelevant. Das Pattern wird nur strukturell (Wrapper, Helper-Text) übernommen, nicht verhaltensmäßig.

---

## 5. Zugänglichkeit (Accessibility) [grafiker]

### Screenreader-Kommunikation

| Element | ARIA-Attribut | Wert | Effekt |
|---|---|---|---|
| Input (pristine) | `aria-describedby` | ID des Helper-Textes | Screenreader liest Helper-Text vor, wenn Input fokussiert |
| Input (invalid) | `aria-invalid` | `"true"` | Screenreader kündigt "ungültig" an |
| Input (invalid) | `aria-describedby` | ID des Helper-Textes + ID der Fehlermeldung | Screenreader liest Helper + Fehler vor |
| Fehlermeldung | `role="alert"` | — | Screenreader liest Fehler sofort vor, wenn er erscheint |
| Fehlermeldung | `aria-live="polite"` | — | Screenreader liest Fehler vor, wenn sich der Inhalt ändert |
| Badge | `aria-hidden="true"` | — | Badge ist rein visuell; der Zustand wird über `aria-invalid` und `aria-describedby` kommuniziert |

### Label-Assoziation

Jedes Input hat ein `<label for="...">`, das auf die Input-ID zeigt. Das ist bereits vorhanden und korrekt. **Nicht ändern.**

### Tastatur-Navigation

- **Tab** fokussiert das Input-Feld. Der maskierte Wert wird angezeigt.
- **Erste Taste** (Zeichen, Backspace, Delete) triggert Clear-on-Edit.
- **Escape** stellt den pristine Zustand wieder her (Wert = `data-original`, Badge zurück auf ✓).
- **Enter** im Input triggert den "Speichern"-Button (form-Standard).

### Farbkontrast

Alle Badge-Farben erfüllen WCAG 2.1 AA (4.5:1 Mindestkontrast) auf dem `--bg-surface` (#18181b):
- ✓ Grün (#10b981) auf #18181b → ~5.2:1 ✓
- ⚠ Rot (#ef4444) auf #18181b → ~4.6:1 ✓
- ○ Muted (variiert, aber `--text-muted` ist typischerweise #71717a) auf #18181b → ~4.1:1 — **knapp unter AA**. Empfehlung: `--text-muted` von #71717a auf #a1a1aa anpassen (ergibt ~6.5:1). [grafiker: nicht Teil dieses Roadmap-Items, aber als Notiz.]

### Fokus-Indikator

Der Focus-Ring (`0 0 0 3px rgba(37, 99, 235, 0.15)`) ist sichtbar, aber schwach. Empfehlung: Mindestens `0 0 0 2px --accent` für WCAG-2.4.7-Konformität (focus visible). Auch das ist ein übergreifendes Theme-Thema, nicht spezifisch für dieses Item.

---

## 6. Rückmeldung beim Speichern [grafiker]

### Das Problem

Aktuell: "Einstellungen erfolgreich gespeichert!" — auch wenn maskierte Key-Felder still verworfen wurden. Der Nutzer glaubt, alles sei gespeichert, dabei sind die Key-Änderungen verloren.

### Empfehlung: Differenziertes Save-Feedback

Das Backend muss pro Feld zurückmelden, ob es gespeichert oder übersprungen wurde. **Alternativ (einfacher, ohne Backend-Änderung):** Das Frontend zählt vor dem Submit, wie viele Felder valide sind vs. wie viele als "maskiert/invalid" markiert wurden, und passt die Meldung entsprechend an.

### Drei Feedback-Stufen

```
┌──────────────────────────────────────────────────────────────────────────┐
│  STUFE 1: Alles gespeichert                                              │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ ✓  Einstellungen gespeichert.                                     │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│  Farbe: --accent (#2563eb) oder Erfolgsgrün (#10b981)                    │
│  Dauer: 3 Sekunden, dann ausblenden                                      │
│                                                                          │
│  STUFE 2: Teilweise gespeichert (mind. 1 Key-Feld übersprungen)         │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ ⚠  Einstellungen teilweise gespeichert.                           │  │
│  │    1 Key-Feld wurde übersprungen (maskierter Wert). Bitte          │  │
│  │    vollständig neu eingeben.                                       │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│  Farbe: Amber (#f59e0b)                                                  │
│  Dauer: Bleibt stehen, bis Nutzer schließt oder erneut speichert         │
│  Zusätzlich: Die betroffenen Felder werden kurz pulsierend hervorgehoben │
│                                                                          │
│  STUFE 3: Fehler beim Speichern                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ ✗  Fehler beim Speichern: {Backend-Fehlermeldung}                  │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│  Farbe: Rot (#ef4444)                                                    │
│  Dauer: Bleibt stehen, bis Nutzer schließt                               │
└──────────────────────────────────────────────────────────────────────────┘
```

### Frontend-seitige Implementierung (ohne Backend-Änderung)

Vor dem Submit:
1. Zähle alle `masked-key-field`-Wrapper mit `data-has-key="true"`.
2. Prüfe jedes Input: Wenn `value` noch `****` enthält → als "invalid" markieren, Badge auf ⚠, Fehlermeldung anzeigen.
3. Wenn mind. 1 Feld invalid → **Submit abbrechen**, Stufe-2-Meldung anzeigen.
4. Wenn alle valide → Submit ausführen.

Nach dem Submit (Erfolg):
5. Wenn alle Key-Felder entweder unverändert (pristine) oder neu eingegeben (valid) waren → Stufe 1.
6. Wenn Key-Felder übersprungen wurden (sollte durch Frontend-Gate nicht mehr vorkommen) → Stufe 2 als Sicherheitsnetz.

### Visuelle Hervorhebung betroffener Felder (Stufe 2)

Die betroffenen Felder bekommen für 2 Sekunden einen **pulsierenden Border** (CSS `@keyframes`):

```css
@keyframes masked-field-pulse {
    0%, 100% { border-color: #f59e0b; box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
    50% { border-color: #f59e0b; box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.3); }
}
.masked-key-field[data-save-skipped="true"] .masked-key-input {
    animation: masked-field-pulse 0.6s ease-in-out 3;
}
```

Das lenkt den Blick gezielt auf die Felder, die Aufmerksamkeit brauchen.

---

## Zusammenfassung der Empfehlungen [grafiker]

| Aspekt | Empfehlung |
|---|---|
| **Interaktionsmodell** | Kombination A + B: Clear-on-Edit (nicht Clear-on-Focus) + Frontend-Validierungsgate |
| **Zustandsmodell** | 3 Zustände: Pristine → Editing → Valid/Invalid, mit Blur-Restore |
| **Statusanzeige** | Badge rechts im Input (✓/○/✎/⚠), entkoppelt vom Input-Wert via `data-has-key` |
| **Kurz-Key-Problem** | Gelöst durch `data-has-key`-Attribut — Badge zeigt "hinterlegt" auch bei `****` ohne Suffix |
| **Mikrotexte** | Beschreibende Fehlermeldung: "Der Wert enthält Maskierungszeichen (****) und wurde nicht gespeichert." |
| **Konsistenz** | Gemeinsamer `.masked-key-field`-Wrapper für alle 8 Felder (6 Settings + 2 Onboarding) |
| **Accessibility** | `aria-invalid`, `aria-describedby`, `role="alert"`, `aria-live="polite"` |
| **Save-Feedback** | 3 Stufen: Erfolg (grün), Teil-Erfolg (amber, mit Feld-Pulse), Fehler (rot) |
| **Backend-Änderung** | Optional: `has_key`-Flag pro Feld. Alternativ: Frontend leitet aus nicht-leerem maskierten Wert ab. |

---

## Offene Fragen an Alex

1. **Backend-Änderung gewünscht?** Soll das Backend ein explizites `has_key: true/false` pro Feld liefern, oder reicht die Frontend-Heuristik (nicht-leerer maskierter Wert = "hinterlegt")? Ersteres ist sauberer, letzteres spart Backend-Änderung.
2. **Mindestlänge für Keys?** Soll das Frontend eine Mindestlänge prüfen (z.B. 8 Zeichen), oder reicht die `****`-Erkennung als Validierung?
3. **Clear-on-Edit vs. Clear-on-Focus?** Meine Empfehlung ist Clear-on-Edit (progressiv). Wenn Alex Clear-on-Focus (aggressiv) bevorzugt, ist das auch umsetzbar — die Begründung steht in Abschnitt 1.
4. **Onboarding-Felder: Sollen die auch das Badge-Pattern bekommen?** Empfehlung: Nein (siehe Abschnitt 4), aber Alex' Entscheidung.

---

*Konzeption erstellt am 03.09.2026. Alle Aussagen sind als [grafiker] gekennzeichnet und beziehen sich auf das bestehende Deep-Space-Theme (style.css) sowie die HTML-Struktur (index.html). Eine spätere `docs/designsprache.md` kann diese Konzeption ergänzen, aber die hier getroffenen UX-Entscheidungen (Zustandsmodell, Clear-on-Edit, Badge-Logik) sind unabhängig von der visuellen Ausgestaltung.*
