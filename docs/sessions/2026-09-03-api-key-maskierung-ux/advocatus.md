# [advocatus] Security-Vertiefung — Roadmap-Item #24 "API-Key Maskierung UX"

**Rolle:** Risikoprüfer (advocatus diaboli), reine Analyse, keine Code-Änderungen.
**Methode:** Alle Aussagen wurden gegen den aktuellen Code verifiziert (Zeilennummern = Ist-Stand zum Prüfzeitpunkt). Wo ich eine Aussage nicht abschließend verifizieren konnte, ist das explizit markiert. Ich widerspreche bequemen Annahmen der Aufgabenbeschreibung, wo der Code etwas anderes zeigt.

---

## A) Security-Vertiefung

### A1 — Informationsleck durch Maskierung (`****` + letzte 4)

**Befund [advocatus]:** Die Maskierung zeigt `****` + die letzten 4 Zeichen (`persistence.py:489-494`). Für die konkret betroffenen 6 Felder ist das **nicht** das eigentliche Risiko — das eigentliche Risiko ist die **asymmetrische Leckage bei kurzen Keys**:

- Bei Key-Länge 9 sind 4 von 9 Zeichen (≈44 %) sichtbar, bei Länge 10 sind es 40 %. Bei einem kurzen CallMeBot-Key ist "letzte 4" damit ein erheblicher Anteil des Gesamt-Secrets, nicht nur ein harmloses Suffix.
- **Over-Masking nicht-geheimer Felder:** `telegram_chat_id` (öffentliche ID, oft `@username` oder `-100…`) und `whatsapp_phone` (Telefonnummer) sind **keine Secrets**, werden aber trotzdem maskiert (`system_api.py:125-128`). Das verschlechtert die UX ohne jeden Sicherheitsgewinn — und vergrößert den E2-Schaden (s. B2), weil der Nutzer nun auch für Nicht-Secrets die Unterscheidbarkeit verliert.

**Bewertung:** Das reine „letzte 4"-Leck ist branchenüblich und für lange API-Keys akzeptabel (Gering). Als [advocatus] würde ich das Item aber nicht mit „Maskierung ist ok" abhaken, sondern die Frage umdrehen: **Warum wird überhaupt `telegram_chat_id`/`whatsapp_phone` maskiert?** Die Maskierungs-Heuristik wird auf Felder angewandt, die sie gar nicht brauchen, und schafft dort nur den E2-Fehlzustand.

### A2 — Werden Keys geloggt / in Responses / ins Frontend geleakt?

**Verifizierte GET-Pfade (sauber):**
- `GET /api/settings` maskiert telegram/whatsapp **und** die env-Keys (`system_api.py:125-133`). ✓
- `GET /api/keys` maskiert TMDB/TVDB (`onboarding_api.py:271-276`). ✓
- Frontend befüllt nur die maskierten Werte (`app.js:8436-8477`, `8384-8388`). ✓

**Befund [advocatus] — Logging:** Ich habe **keine** Stelle gefunden, die die POST-Payloads (`telegram_token`, `whatsapp_apikey`, `TMDB/TVDB_API_KEY`) loggt. Die gefundenen `print`/`log_message`-Aufrufe betreffen Metadaten-/NFO-Fehler und geben nur `{e}` (Exception-Text) aus, nicht die Credentials.

**Restrisiko, nicht abschließend verifiziert:**
1. **TMDB-URLs tragen den Key im Query-String:** `api_key={TMDB_API_KEY}` (z. B. `mw_metadata.py:415,558,601`). Telegram analog `api.telegram.org/bot{token}` (`core/notifications.py:18`). Diese Requests verlassen den Prozess Richtung Internet. Falls **irgendwann** ein egress-seitiger Proxy/ein Logging auf dem NAS eingerichtet wird, landen die Query-Strings im Access-Log. Aktuell sehe ich kein solches Logging — aber es ist eine **strukturelle Falle**, die der Code nicht absichert (Key im URL-Parameter statt im Header). Für das Item selbst: nicht im Scope, aber als Notiz relevant.
2. `urllib`-Exceptions können die URL (inkl. Key) in `exc.url` tragen. Die gefundenen Fehler-Prints geben nur `{e}` aus — das ist sicher. Sollte aber bei künftigen Logging-Erweiterungen bedacht werden.

**Fazit A2:** Kein akutes Leck in den GET-Pfaden. Das Restrisiko liegt in der **Zukunft** (Key-in-URL bei egress-Logging) und ist als Notiz zu führen, nicht als Blocker.

### A3 — `.env`-Handhabung: persistiert ein teil-editierter `****`-Wert versehentlich?

**Verifizierte Mechanik (teils sauber, teils gefährlich):**
- `save_env_keys()` ist **atomar** (temp-Datei + `fsync` + `os.replace`, `persistence.py:429-437`). ✓
- `ensure_env_gitignore()` hängt `.env` an `.gitignore`, falls fehlend (`persistence.py:441-462`). ✓
- `ensure_env_example()` legt `.env.example` mit Platzhaltern an — **aber nur für `TMDB_API_KEY`/`TVDB_API_KEY`** (`persistence.py:464-487`). Telegram/WhatsApp liegen ohnehin in `settings.json`, nicht in `.env` — konsistent, aber es gibt kein `.env.example`-Äquivalent für die settings-basierten Secrets (Dokumentationslücke, kosmetisch).

**Der eigentliche Persistenz-Befund [advocatus] — und hier widerspreche ich der impliziten Annahme der Aufgabenbeschreibung:**

Das Item fokussiert den Fall „teil-editiert **beginnt weiter mit** `****` → wird verworfen". Der **gefährlichere** Fall ist der umgekehrte, den `is_masked()` **nicht** abfängt:

> Ein Nutzer markiert das maskierte `****ABCD` und tippt `12345`. Der neue Wert beginnt **nicht** mit `****` → `is_masked("12345") == False` → der Wert wird **als echter Key in `.env` persistiert** und der alte, gültige Key wird unwiderruflich überschrieben (`system_api.py:95-102` + `persistence.py:409-416`). Frontend meldet „Einstellungen erfolgreich gespeichert!".

Konsequenz: Die Heuristik schützt genau die **harmlose** Richtung („beginnt mit `****`") und lässt die **zerstörerische** Richtung („Präfix wurde beim Teil-Editieren entfernt") ungehindert persistieren. Der Nutzer kann nicht zwischen „neuer legitimer Key" und „kaputter Rest eines maskierten Werts" unterscheiden — und das System auch nicht. **Das ist stilles Scheitern plus stiller Datenverlust.**

**Fazit A3:** Atomarität und gitignore sind sauber. Das Persistenz-Risiko eines teil-editieren Werts ist **real und asymmetrisch** — es liegt genau dort, wo die Aufgabenbeschreibung es nicht vermutet (Präfix entfernt, nicht Präfix behalten).

### A4 — Auth: Sind `/api/settings` und `/api/keys` geschützt?

**Verifizierte Fakten (wichtigste Korrektur gegenüber der Aufgabenbeschreibung):**

Es gibt eine **globale** Middleware `auth_before_request` (`main.py:44-45`, Implementierung `auth_middleware.py:6-80`). Die Aufgabenbeschreibung suggeriert, `/api/keys` sei (via `onboarding_api.py:241-245`) geschützt, `/api/settings` womöglich nicht. Die Wahrheit ist differenzierter:

1. **`/api/keys` hat eine *redundante* Inline-Prüfung** (`onboarding_api.py:241-245`), die die Middleware nur dupliziert. Das ist keine zusätzliche Sicherheit, sondern Indiz für zwei konkurrierende Auth-Mechanismen (kosmetisch).
2. **`/api/settings` hat keine Inline-Prüfung**, sondern verlässt sich vollständig auf die Middleware. Das ist **nicht** automatisch unsicher — aber:

**Der kritische Befund [advocatus]: Beide Endpoints sind nur dann geschützt, wenn ein Passwort gesetzt ist. Der Default-Zustand (kein Passwort) ist komplett offen — und der Server bindet an `0.0.0.0`.**

- `auth_middleware.py:30-76`: Der Auth-Block (Session + CSRF) läuft **nur**, wenn `password_hash` gesetzt ist. Ist kein Passwort konfiguriert, greift der `else`-Zweig (`:77-79`): `/api/settings` ist nicht in der Allowlist, es gibt **keinen** `abort` → Request läuft ungehindert durch. Gleiches gilt für `/api/keys`.
- **Kein CSRF ohne Passwort:** Die CSRF-Prüfung (`auth_middleware.py:64-76`) ist ebenfalls an `password_hash` gekoppelt.
- **Kein Rate-Limiting** auf `/api/settings`/`/api/keys` — Rate-Limiting existiert nur am `/api/auth/login` (`system_api.py:892-897`).
- **Bind an `0.0.0.0`:** `main.py:297` (`app.run(host='0.0.0.0', …)`) und `main.py:302` (`serve(…, host='0.0.0.0', …)`). Das Tool ist damit **im LAN erreichbar**, nicht nur auf `localhost`.

**Gewichtung:** Ein Heim-NAS ohne Passwort ist der realistische Default. Dann kann **jedes Gerät im WLAN** (oder bei Port-Forwarding: jeder im Internet) ohne jede Authentifizierung:
- `telegram_token` auf einen eigenen Bot setzen → **alle Notifications kapern** (Leak von Mediathek-/Datei-Aktivität an Dritte),
- TMDB/TVDB-Keys überschreiben (DoS der Metadaten),
- beliebige Pfade/Settings ändern.

Das ist **kein** Problem des Items #24 allein, aber es verschärft dessen Bewertung: Die stille Verwerfung eines Credentials ist deshalb nicht nur ein UX-Ärgernis, sondern findet an einem Endpoint statt, der im Default-Zustand **ungeschützt** ist. CSRF über `application/json` ist wegen fehlender CORS-Header praktisch erschwert (Preflight schlägt fehl, `request.get_json()` liefert bei form-POST leer) — aber der direkte, nicht-CSRF-basierte Zugriff aus dem LAN bleibt real.

---

## B) Edge-Cases (aktive Suche über E1/E2 hinaus)

### B1 — E1: Legitimer Key mit echtem `****`-Präfix

**Befund [advocatus]:** Für die **konkreten** 6 Felder praktisch unmöglich, weil `*` in keinem der Schlüssel-Alphabete vorkommt:
- TMDB v3 = 32 Hex-Zeichen, TMDB v4 = JWT (`ey…`) → kein `*`.
- TVDB = alphanumerisch → kein `*`.
- Telegram Bot-Token = `[0-9]+:[A-Za-z0-9_-]+` → beginnt mit Ziffern.
- CallMeBot-Key = alphanumerisch → kein `*`.
- chat_id = Zahl (ggf. negativ) oder `@username` → kein `*`.
- phone = `+…` → kein `*`.

**Aber [advocatus]:** Das ist Zufall des heutigen Feldsatzes, kein belastbares Argument. Die Heuristik ist generisch und kollabiert still, sobald (a) ein Feld mit freiem Alphabet hinzukommt oder (b) ein Nutzer bewusst einen Wert mit `****` eingibt. Das **stille** Verwerfen (statt 400) ist der eigentliche Defekt — die Kollision ist nur der Auslöser, der ihn unsichtbar macht. Gewichtung: **wichtig** (Design-Defekt), nicht „kritisch" (weil aktuell nicht auslösbar).

### B2 — E2: Kurz-Keys ≤ 8 → nacktes `****`, ununterscheidbar

**Wo es genau bricht:**
1. `mask_credential` liefert für `len ≤ 8` nur `****` ohne Suffix (`persistence.py:492-493`). Jeder Kurz-Key sieht identisch aus — der Nutzer kann nicht erkennen, **welcher** Wert hinterlegt ist.
2. tmdb/tvdb haben den Placeholder „Hinterlegt"/„Nicht konfiguriert" (`app.js:8446-8460`). **telegram/whatsapp haben das nicht** — deren Placeholder sind statisch („Bot Token", „apikey von CallMeBot", `index.html:1580,1605`) und zeigen **nicht** an, ob ein Wert hinterlegt ist. Bei `****` kann der Nutzer dort also nicht einmal zwischen „konfiguriert" und „leer" unterscheiden.
3. Bei mehreren kurzen Secrets (z. B. kurzer CallMeBot-Key **und** kurze chat_id) zeigen beide `****` → Verwechslungsgefahr beim Editieren, und da `is_masked("****")` wahr ist, werden beide beim Save still übersprungen.

### B3 — NEU: Teil-editierter Wert mit **entferntem** `****`-Präfix (kritischster Zusatz)

Wie in A3 ausgeführt: Der Fall „Präfix entfernt, Rest bleibt" wird **nicht** erkannt und **als echter Key persistiert**. Das ist der destruktivste Edge-Case des gesamten Items: stilles Überschreiben eines gültigen Credentials + kaputte Integration + Erfolgsmeldung.

### B4 — NEU: Whitespace-only / ungetrimmte telegram/whatsapp-Werte

- tmdb/tvdb werden im Frontend getrimmt (`app.js:9787,9794`), telegram/whatsapp **nicht** (`app.js:9741-9745`, nur `?.value || ""`).
- Backend `mutate()` (`system_api.py:111-115`) überspringt nur Werte mit `is_masked(v)`. Ein `"   "` ist nicht maskiert → wird **als echter Wert in `settings.json` geschrieben** und **überschreibt** den bisherigen `telegram_token`/`whatsapp_apikey`. Folge: Credential-Verfall (Datenverlust) + stille Fehlkonfiguration + Erfolgsmeldung.

### B5 — NEU: Führendes/nachfolgendes Leerzeichen um den echten Wert

`" ****1234"` (führendes Space) beginnt nicht mit `****` → `is_masked` = False → wird mit führendem Leerzeichen persistiert → Key funktioniert nicht. tmdb/tvdb werden getrimmt (ok), telegram/whatsapp nicht (kaputt). Asymmetrie zwischen den Feldern.

### B6 — Copy-Paste eines maskierten Werts

Nutzer kopiert `****1234` (z. B. aus einer Doku/einem anderen Feld) → `is_masked` true → still verworfen + Erfolgsmeldung. Harmlos, aber wieder: stilles Scheitern statt klarer Meldung.

### B7 — „Bewusst löschen" vs. „unverändert lassen"

- tmdb/tvdb: leeres Feld → `val !== orig` → `keyPayload.TMDB_API_KEY = ""` → Backend löscht (`save_env_keys` mit `""`, `persistence.py:410-413`). Funktioniert, aber nur über den **Vergleich** `value !== dataset.original` — eine implizite, fragil wirkende Semantik.
- telegram/whatsapp: leeres Feld → `""` → `is_masked("")=False` → `data[k]=""` → überschrieben mit leer. Funktioniert ebenfalls, aber es gibt **kein** explizites Lösch-Signal; „leer" und „unverändert" werden über dieselbe fragile Heuristik unterschieden.
- `dataset.original` existiert **nur** für tmdb/tvdb (`app.js:8445,8455`), **nicht** für telegram/whatsapp → dort ist Dirty-Tracking im Frontend unmöglich; sie werden **immer** mitgeschickt (`app.js:9741-9745`) und die „unverändert"-Entscheidung liegt allein beim Backend.

### B8 — NEU: Kein Server-seitiges Whitelisting der Settings-Felder (Mass Assignment)

`update_settings(mutate)` übernimmt **alle** übergebenen Keys in `params` nach `data` (`system_api.py:111-115`), ohne Schema-Whitelist. Ein böswilliger/fehlerhafter Client kann beliebige `settings.json`-Felder setzen (z. B. Verarbeitungsflags), die die UI nicht vorsieht. Außerhalb des Scope, aber im Kontext „ungeschützter Default-Endpoint" relevant.

### B9 — Kein Längen-/Format-Limit

Keine Validierung der Key-Länge oder des Formats vor dem Schreiben. Sehr lange Werte werden ungeprüft persistiert; ungültige Formate fallen erst zur Laufzeit auf. Kosmetisch bis wichtig (DoS über `.env`-Größe theoretisch möglich).

---

## C) Konsequenz & Anforderungen

### C1 — Abgeleitete Anforderungen (damit stilles Scheitern ausgeschlossen ist)

Als [advocatus] leite ich diese **hart** ab:

1. **Backend darf einen maskierten Wert niemals still verwerfen.** Jeder Wert, der mit dem Maskierungs-Präfix `****` beginnt, muss mit einem **expliziten Fehlerstatus** (z. B. 400 + Feldname + Meldung) beantwortet werden — nicht still übersprungen (`system_api.py:97,101,113`).
2. **Frontend darf maskierte Werte niemals unverändert mitschicken.** Es braucht ein explizites Dirty-Tracking (nur geänderte Felder senden) oder ein explizites `unchanged`-Signal; die implizite `is_masked`-Heuristik im Backend ist als alleiniges Unterscheidungsmerkmal unzulässig.
3. **Drei-Zustands-Semantik pro Feld muss eindeutig sein:** `unverändert` / `gelöscht` / `neuer Wert` — jede Zustandsübergabe muss explizit kodiert sein, nicht über `****`-Präfix geraten.
4. **Die Antwort muss per-Feld-Feedback liefern**, nicht nur ein globales `{"status":"success"}` (`system_api.py:118`, `onboarding_api.py:269`) — sonst kann das Frontend nicht ehrlich melden (und es meldet aktuell falsch „erfolgreich").
5. **Frontend muss die Erfolgsmeldung an das tatsächliche Backend-Ergebnis koppeln** (`app.js:9818-9821` zeigt heute „Erfolg", auch wenn der Save im Backend nichts getan hat).

### C2 — Lösungsoptionen

| Option | Kernidee | Sicherheits-/Robustheitsbewertung [advocatus] |
|---|---|---|
| **1. Sentinel-Wert** | Frontend sendet `__UNCHANGED__` für unveränderte Felder; Backend ignoriert den Sentinel explizit | Eindeutig, kein Zeichen-Kollisionsrisiko. Aber: neues magisches Token, muss gegen echte Werte abgesichert werden. Solide, etwas invasiv. |
| **2. Dirty-Tracking + Server-Verbot** | Nur geänderte Felder senden; Backend weist `****`-präfixierte Werte mit 400 zurück statt still zu verwerfen | **Bevorzugt.** Minimal, erfüllt die Hausregel „Fehler sichtbar", kein neues Kollisions-Token. Die einzige verbleibende Heuristik (`****` als „verbotenes Präfix") wird *verboten* statt *interpretiert* — das schließt E1 und B3 zugleich. |
| **3. Explizites `changed`-Flag pro Feld** | Payload `{value, changed}`; Backend verarbeitet nur `changed=true` | Vollständig explizit, aber mehr Komplexität und größerer Payload-/API-Umbau. |
| **4. REST-puristisch (PUT/DELETE)** | Setzen/Löschen über getrennte Verben, fehlend = unverändert | Sauberste Semantik, aber größter Umbau; für das Item überdimensioniert. |

**Empfehlung [advocatus]: Option 2.** Dirty-Tracking im Frontend (nur geänderte Felder senden, für **alle** 6 Felder — aktuell fehlt es bei telegram/whatsapp) kombiniert mit einem **Server-seitigen harten Verbot**, Werte mit `****`-Präfix zu speichern (400 statt still überspringen). Damit wird aus der Interpretations-Heuristik eine eindeutige Fehlerbedingung, und das stille Scheitern ist ausgeschlossen — ohne ein neues kollisionsfähiges Token einzuführen. Option 3 ist die „saubere" Alternative, falls Alex explizite Vollständigkeit der Payload-Semantik bevorzugt.

### C3 — Konkrete Testfälle (Akzeptanzkriterien, menschenlesbar)

1. **Es prüft, dass** ein POST an `/api/settings` mit einem `****`-präfixierten `telegram_token` **nicht** still übersprungen wird, sondern eine 400 mit Feldnamen und klarer Meldung zurückgibt.
2. **Es prüft, dass** ein teil-editierter Wert **ohne** `****`-Präfix (z. B. `"12345"`, entstanden aus `****ABCD`) **nicht** als neuer Key in `.env` persistiert wird und der bisherige Key unverändert bleibt.
3. **Es prüft, dass** ein Whitespace-only-Input den bestehenden Key weder überschreibt noch löscht.
4. **Es prüft, dass** ein legitimer neuer Key (gültiges Format) korrekt gespeichert wird und der Response das Feld als geändert meldet.
5. **Es prüft, dass** ein bewusst leeres Feld den Key nur dann löscht, wenn das explizit als Löschen kodiert ist — und nicht durch einen Leerzeichen-Rest.
6. **Es prüft, dass** ein unverändert gelassenes (maskiertes) Feld den bestehenden Wert unangetastet lässt — für **alle** 6 Felder, nicht nur tmdb/tvdb.
7. **Es prüft, dass** `GET /api/settings` und `GET /api/keys` niemals unmaschierte echte Keys ausliefern.
8. **Es prüft, dass** ein Key ≤ 8 und ein Key > 8 Zeichen im UI unterscheidbar sind (oder der Nutzer zumindest „hinterlegt/nicht hinterlegt" für telegram/whatsapp erkennt).
9. **Es prüft, dass** ein Wert, der legitimerweise mit `****` beginnt (E1-Szenario, falls je ein solches Alphabet erlaubt wird), **nicht** still verworfen wird.
10. **Es prüft, dass** `/api/settings` und `/api/keys` bei gesetztem Passwort ohne gültige Session `401` liefern; und dass der Zustand „ohne Passwort = offen" dokumentiert/bewusst akzeptiert oder per CSRF-/Bind-Maßnahme gehärtet ist.

---

## Priorisierte Risiko-Liste

**[kritisch]**
1. **B3 / A3:** Teil-editierter Wert mit entferntem `****`-Präfix wird als echter Key persistiert → stilles Überschreiben eines gültigen Credentials + kaputte Integration + Erfolgsmeldung.
2. **B4 / B5:** Ungetrimmte telegram/whatsapp-Werte (inkl. Whitespace-only) überschreiben echte Credentials in `settings.json` → stiller Datenverlust.
3. **A4:** Ohne Passwort (Default) sind `/api/settings` und `/api/keys` offen und ohne CSRF/Rate-Limit, bei Bind an `0.0.0.0` → LAN-weite, unauthentifizierte Manipulation von Credentials und Notifications-Kaapung.

**[wichtig]**
4. **C1-1/2:** Stilles Verwerfen maskierter Werte ohne Status (Kern des Items) — verletzt die Hausregel „kein stilles Scheitern".
5. **B2 (E2):** Kurz-Keys ununterscheidbar; telegram/whatsapp ohne „hinterlegt/nicht hinterlegt"-Hinweis.
6. **B8:** Kein Server-Whitelisting der Settings-Felder (Mass Assignment) an einem im Default ungeschützten Endpoint.
7. **A1:** Asymmetrische Leckage bei kurzen Keys (4/9 Zeichen sichtbar) + Over-Masking nicht-geheimer Felder (chat_id, phone).

**[kosmetisch]**
8. **A4-Redundanz:** Doppelte Auth-Prüfung in `onboarding_api.py:241-245` vs. Middleware — Inkonsistenz, kein Bug.
9. **A3-Lücke:** `ensure_env_example()` kennt nur TMDB/TVDB; kein Äquivalent für settings-basierte Secrets.
10. **B9:** Kein Längen-/Format-Limit beim Persistieren von Keys.

---

**Nicht ausgeführte Prüfungen / Restrisiken:** (1) Egress-Logging des NAS wurde nicht inspiziert — Key-in-URL bei TMDB/Telegram wäre bei künftigem Proxy-Logging ein Leck (Notiz, kein aktueller Blocker). (2) Keine Laufzeit-Verifikation der Auth-Flows — die Aussagen beruhen auf statischer Code-Analyse. (3) Die Robustheit des `settings.json`-Schreibpfads (`update_settings`) wurde nicht im Detail auf Atomarität geprüft, da außerhalb des Scope.
