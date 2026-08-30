# Kreativteam-Session: Standortbestimmung — advocatus

> Session: 2026-08-30 · Rolle: `advocatus` (Subagent) · Ausgelöst über `ceo-planner`
> (headless via OpenCode-Bridge, `opencode run --agent ceo-planner --dir <Medienwerkzeug>`).
> Ungekürzter Rohoutput, wie von der Rolle geliefert.

Ich habe die zentralen Dokumente (ROADMAP.md komplett, STAND.md, VERLAUF.md-Kopf) und die fragilen Codebereiche (`auth_middleware.py`, `main.py`, `system_api.py` (Auth-Teil), `persistence.py`, `health_cache.py`, `app.js` (Kopf + Auth), `mw_metadata.py` (Retry/Mediathek), `resilience.py`, `index.html`, `.gitignore`) gelesen. Hier die systematische Risikoprüfung.

---

# 1. Top-Risiken nach Schwere

### [kritisch] K1 — Cache-Busting-Versionen laufen auseinander (Frontend-Verteilung)
- **Beleg:** `index.html:2686` lädt `<script type="module" src="app.js?v=90">`, `index.html:9` `style.css?v=44`. Aber `app.js:1–8` importiert alle 8 ES-Module (`theme.js`, `utils.js`, `format.js`, `parse.js`, `fsk_batch.js`, `welcome.js`, `intelligence.js`, `nfo_ui.js`) mit `?v=73`. Die Roadmap selbst referenziert in #49 noch `app.js?v=78` (`ROADMAP.md:1499`).
- **Warum kritisch:** Drei konkurrierende Versionsstände (90 / 73 / 78). Die Haupteinstiegsdatei wurde gebumpt, die internen Modul-Imports blieben auf 73 stehen. Ändert man bei einem reinen Frontend-Schritt (#52 Wizard, #53 Severity-UI) ein Modul, aber nicht den `?v=73`-Query, liefert der Browser des Endnutzers (NAS/Docker) die **gecachte alte Modulversion** aus. Das Fehlverhalten tritt lokal nicht auf und ist nur beim Nutzer sichtbar — genau die Klasse Bug, die in der FSK-Linie schon einmal über einen „Health-Cache aus einem Zwischenstand" aufgetreten ist (`VERLAUF.md:39`). Das ist der größte unadressierte Risikotreiber für alle Frontend-Kandidaten.

### [wichtig] S1 — Session-Cookie ohne `Secure`-Flag, CSRF-Cookie hart auf `secure=False`
- **Beleg:** `main.py:32–41` setzt `SECRET_KEY`, `SESSION_COOKIE_HTTPONLY=True`, `SESSION_COOKIE_SAMESITE='Lax'`, `SESSION_COOKIE_NAME='mw_session'` — aber **kein** `SESSION_COOKIE_SECURE`. `system_api.py:923` setzt das CSRF-Token-Cookie mit hartkodiertem `secure=False`.
- **Warum wichtig:** Solange reines LAN/HTTP, akzeptabel. Aber #18 (Docker-Image öffentlich veröffentlichen) bringt in der Doku/Anleitung explizit Reverse-Proxy/Publikumszugriff ins Spiel. Dann wird das Session-Cookie ohne `Secure`-Flag ausgeliefert (über HTTP mitlesbar) und das CSRF-Token ebenfalls. Härtung fehlt; sollte vor/bei #18 erzwungen oder zumindest env-gesteuert werden.

### [wichtig] S2 — API-Key-Lagerung inkonsistent, Telegram/WhatsApp im Klartext in `settings.json`
- **Beleg:** TMDB/TVDB liegen in `.env` (`persistence.py:466`, `mw_metadata.py:53–54`). `telegram_token`, `telegram_chat_id`, `whatsapp_apikey`, `whatsapp_phone` liegen dagegen im Klartext in `settings.json` (`persistence.py:161–165`, DEFAULT_SETTINGS) und werden nur in der UI maskiert (`system_api.py:125–128`).
- **Warum wichtig:** `settings.json` wird von `migrate_legacy_data()` (`persistence.py:31–34`) und vom Backup-Mechanismus (`backup_if_valid`, `.bak`) vervielfältigt; jede Kopie trägt die Klartext-Credentials. #24 (API-Key-Maskierung) adressiert nur UX, nicht die inkonsistente Lagerung. Empfehlung: Telegram/WhatsApp ebenfalls nach `.env` ziehen.

### [wichtig] S3 — `/api/keys` in der Auth-Allowlist, obwohl die Route selbst schützt (verletztes Defense-in-depth)
- **Beleg:** `auth_middleware.py:17` setzt `request.path == '/api/keys'` auf die Allowlist. Die Route selbst (`onboarding_api.py:236–276`) prüft bei `onboarded`+`password_hash` auf Auth und maskiert die Keys (GET `mask_credential`, POST nur unmaskiert).
- **Warum wichtig:** Aktuell **kein akutes Leck** (maskiert), aber ein wartungsanfälliger Widerspruch: Entfernt/vergisst jemand die Maskierung oder Auth-Prüfung in der Route, ist der Endpunkt über die Middleware-Allowlist ungeschützt offen. Die Allowlist-Eintragung ist redundant und gehört entfernt.

### [wichtig] S4 — Login-Brute-Force-Schutz nur in-memory, kein globales Rate-Limiting
- **Beleg:** `system_api.py:892–936` — `failed_attempts`-Dict (in-memory), 5 Fehlversuche/60 s, progressives Delay max 2 s. Kein persistentes Lockout; Neustart setzt zurück, bei mehreren Prozessen umgehbar.
- **Warum wichtig:** Für LAN-Tool vertretbar. Wird #18 (öffentliches Image) umgesetzt, greifen Hausregeln „Rate Limiting für öffentlich erreichbare Endpunkte" — aktuell gibt es außer Login kein Ratenlimit auf den übrigen API-Endpunkten.

### [kosmetisch] K2–K5
- **K2:** Kein `PERMANENT_SESSION_LIFETIME` — Session-Cookie ohne Server-seitigen Ablauf; gestohlenes Cookie bleibt bis Passwortwechsel gültig (Invalidierung nur über `auth_version`, `auth_middleware.py:50–58`).
- **K3:** Keine Session-ID-Rotation beim Login (`system_api.py:911` setzt nur `authenticated=True`). Wegen signierter Session praktisch kaum ausnutzbar, aber Fixation-Schutz fehlt formal.
- **K4:** `auth_before_request` ruft bei jedem Request `load_settings()` inkl. `copy.deepcopy` des Gesamt-Settings auf (`auth_middleware.py:7` → `persistence.py:515–517`). Bei `waitress threads=16` ein Per-Request-Deepcopy des wachsenden Settings-Dicts.
- **K5:** Dokumentations-Sync (siehe Abschnitt 3).

---

# 2. Risiken je Kandidat (Rangfolge)

**Am riskantesten → am sichersten:**

| Rang | Kandidat | Kernrisiko |
|---|---|---|
| 1 | **#1 Multi-Cloud** | Settings-Migration auf echten Nutzerdaten (`settings.json`, `persistence.py`), Regression im gut getesteten Einzel-Cloud-Pfad, Eingriffe in `processor.py`/`transfers.py`/`queue_api.py`/`youtube_api.py`. Höchstes Datenverlust-/Migrationsrisiko. |
| 2 | **#18 Docker-Image veröffentlichen** | Externer, irreversibler Effekt (öffentlich). Ungeklärte Sicherheitsfrage: Was wird ins Image eingebacken (`rclone.conf`, `.env`, `data/settings.json`)? Kollidiert mit S1/S3/S4 (Secure-Flag, Rate-Limiting, Allowlist) sobald öffentlich. |
| 3 | **#53 Severity entfernen** | API-Vertragsänderung (`summary`-Schema, `health.py:62/1017/1162/1207/1270`), Cache-Schema (`SCAN_VERSION=5`, `health_cache.py:10`), sehr viele Tests (`test_health_ignores.py:120`, `test_health_scan_cache.py:34`, `test_fsk_health.py:483ff`). Frontend+Backend koordiniert. |
| 4 | **#52 NFO-Agent-Wizard** | Reines Frontend, aber Regression im FSK-Workflow möglich (dasselbe Modal), plus **K1** (Cache-Busting `?v=73`). |
| 5 | **#51 NFO-Vervollständigung (Artwork)** | Backend+Frontend; Artwork-Download ist Binär+Netzwerk (`mw_metadata.py:13`/`925` sind Ein-Schuss-urlopen) — benötigt die Binär-Retry-Variante aus #54 vorab. |
| 6 | **#54 Retry-Helfer flächendeckend** | Mechanisch, viele Stellen (~25 urlopen, `mw_metadata.py`), geringes Fachrisiko, aber Gefahr stillen Scheiterns bei falsch umgestellten Fehlerpfaden. |
| 7 | **Quick-Win-Sammel** | Klein; nur #39 sticht heraus (Login-/401-Flow, s. u.). |

**Fazit:** Am riskantesten ist **#1** (Datenmigration im Kernpfad), dicht gefolgt von **#18** (externer, irreversibler Effekt + offene Security-Fragen). Am sichersten ist der **Quick-Win-Sammel** — mit Ausnahme von **#39**, das kein harmloser „Quick Win" ist, sondern den globalen Auth-Interceptor (`app.js:14–34`) und den Login-Flow anfasst.

---

# 3. Verifizierte / entkräftete bekannte Auffälligkeiten

1. **„ROADMAP-Tabelle endet bei 51, Abschnitte 52–55 existieren" — bestätigt.**
   Tabelle endet bei `ROADMAP.md:60` (`| 51 | … teilweise |`); die Abschnitte `## 52` (Wizard, Z. 1556), `## 53` (Severity, Z. 1579), `## 54` (Retry, Z. 1603), `## 55` (Multi-Provider, Z. 1623) sind vorhanden, aber **nicht in der Tabelle**. Items 52–55 fehlen also in der Statusübersicht. Zusätzlich fehlt `## 48`/`## 49`-Konsistenz nicht, aber Item 50/51 sind in der Tabelle, 52–55 nicht.

2. **„Item #39 verweist auf #58 behoben — Item 58 existiert nicht" — bestätigt, dangling reference.**
   `ROADMAP.md:1153` verweist auf „Diese Ursache ist mit #58 behoben". Es gibt **kein** Item 58 (Tabelle endet bei 51, Abschnitte bei 55). Der Fix existiert aber **real im Code**: `auth_middleware.py:54–58` enthält genau den Kommentar „Only clear the session if there was actually data in it, to prevent sending a Set-Cookie deletion header". Die Referenznummer ist schlicht nie angelegt/umbenannt worden; der eigentliche Fix ist in `auth_middleware.py`, nicht unter einem Item 58. Das Frontend-Teil von #39 ist **noch offen**: `app.js:29–31` ruft bei jedem 401 weiterhin hart `showLoginScreen()`.

3. **„#53 kollidiert mit Caches?" — teilweise bestätigt, aber in der Roadmap adressiert.**
   `severity` ist Teil jedes roh gecachten Issues (`health_cache.py:65–87` speichert `issues`), und `SCAN_VERSION=5` (`health_cache.py:10`) ist der einzige Invalidierungsmechanismus (`get_cache_key`, Z. 12–14). Die Roadmap #53 beschreibt korrekt: Schritt 1 (Frontend) lässt das Datenmodell unverändert, Schritt 2 entfernt `severity` aus `_add_issue`/Summary/Cache mit **Cache-Bump** (`ROADMAP.md:1591,1596`). **Nicht explizit benannt ist der konkrete Absturzpfad:** `summary[it["severity"]]` und `i.get("severity", …)` (`health.py:1019/1164/1272/1337`) sowie `refresh_issues_after_nfo_write` lesen `severity` aus Issues, die aus einem **Alt-Cache ohne Bump** stammen könnten → `KeyError`/falsche Zählung, wenn Schritt 2 ohne SCAN_VERSION-Bump erfolgt. Das ist der eigentliche Kollisionspunkt.

4. **„Auth-Session-/Cookie-Härte" — geprüft, Ergebnis gemischt.**
   Positiv: `SECRET_KEY` aus `.env`/generiert (`main.py:26–30`), `HttpOnly=True`, `SameSite=Lax`, eindeutiger Cookie-Name, CSRF als Double-Submit mit Session-Hash (`auth_middleware.py:64–76`), Passwort-Hash `pbkdf2:sha256` (`persistence.py:632`), Login-Lockout. **Lücken:** kein `SESSION_COOKIE_SECURE`, CSRF-Cookie `secure=False` hartkodiert (`system_api.py:923`), kein Session-Ablauf, Lockout in-memory (siehe S1/S4).

5. **„API-Key-Lagerung in settings.json" — bestätigt, inkonsistent.**
   TMDB/TVDB in `.env`; Telegram/WhatsApp im Klartext in `settings.json` (siehe S2). `.gitignore` deckt beides ab (`/.env` Z. 8, `/data/` Z. 9, `.env` Z. 64) — **kein** Secret in der Versionskontrolle (entkräftet das Worst-Case-Risiko, aber die Klartext-Lagerung auf Platte bleibt).

6. **Quick-Win #40 (Mediathek-Episoden-Sync) — Bug real, noch offen.**
   `mw_metadata.py:2713–2717`: `resolved = resolve_mediathek_url_topic(topic); if resolved: …`. Bei `resolved is None` läuft der Code mit der rohen URL als `topic` weiter und sendet sie an MediathekViewWeb (Z. 2719ff) → überflüssige Anfrage, `{}` zurück. Genau das in #40 beschriebene Verhalten. **Fix noch nicht umgesetzt.**

---

# 4. Was VOR der Umsetzung geklärt sein muss (Blocker-Kandidaten)

- **[sicherheits-frage] für #18 (Docker veröffentlichen):** Was landet im Image? `rclone.conf` (OAuth-Tokens), `.env`, `data/settings.json` dürfen **nicht** eingebacken werden — Dockerfile/.dockerignore müssen das nachweislich ausschließen. Zudem: `SESSION_COOKIE_SECURE`/CSRF-`secure` (S1) und Rate-Limiting (S4) vor Publikumszugriff entscheiden. Erst klären, dann veröffentlichen.
- **[design-frage] für #1 (Multi-Cloud):** Geht #29 vollständig in #1 auf oder bleibt Rest? (steht als offener Punkt in `ROADMAP.md:134–140`). Zusätzlich: konkrete Migrations-/Backup-Strategie für `settings.json` (`copy_to_nas`/`copy_to_pcloud` → `copy_targets`), idempotente Migration mit Backup — echte Nutzerdaten.
- **[design-frage] für #53 (Severity):** Reihenfolge Schritt 1 vs. Schritt 2 und wer den `summary`-API-Vertrag konsumiert (Frontend `renderHealthStatus`, Tests, Health-Cache). Vorher festlegen, dass Schritt 2 zwingend mit `SCAN_VERSION`-Bump und Koordination aller `summary[it["severity"]]`-Stellen (`health.py:1019/1164/1272/1337`) erfolgt.
- **[design-frage] für #52 (Wizard) und alle Frontend-Schritte:** Die Cache-Busting-Disziplin (K1, `?v=73` vs `?v=90`) muss VOR dem Umbau geklärt sein, sonst liefert der Browser veraltete Module. Einheitliche, mitgebumpte Versionsnummer für `index.html` + alle Modul-Imports festlegen.
- **[design-frage] für #39:** Der in der Roadmap selbst offene Grenzfall (`ROADMAP.md:1166`: „Session läuft zwischen `/api/auth/status` und Originalrequest ab") plus: Retry eines POST nach 401 braucht einen **frischen CSRF-Token** (der alte ist nach Session-Verlust ungültig) — sonst scheitert der Retry mit 400.

---

# 5. Edge-Cases, die in der Roadmap-Beschreibung des empfohlenen Kandidaten fehlen

**Empfehlung als sicherster nächster Schritt: der Quick-Win-Sammel (#24/#26/#33/#34/#40/#46/#47), mit #39 bewusst als letzter/separater Schritt.** Fehlende Edge-Cases je Item:

- **#24 (API-Key-Maskierung UX):** `is_masked()` (`persistence.py:496`) matcht nur `startswith("****")`. Ein Key, der **legitim** mit `****` beginnt, wird stillschweigend verworfen. Und `mask_credential()` (`persistence.py:489–494`) gibt bei Keys ≤ 8 Zeichen nur `****` **ohne** Suffix zurück — der Nutzer kann dann nicht unterscheiden „gesetzt" vs. „leer". Nicht in der Roadmap benannt.
- **#33 (TVDB-Fallback):** TMDB kann eine **leere** `external_ids`/`tvdb_id` liefern (nicht nur leeren Plot) → Fallback muss ohne TVDB-ID sauber abbrechen. Zusätzlich: `tvdb_token`/`tvdb_token_time` (`mw_metadata.py:59`) — ein abgelaufener TVDB-Token lässt den Fallback fehlschlagen; Token-Erneuerung im Fallback-Pfad fehlt in der Beschreibung.
- **#40 (Mediathek-Abbruch):** Der Fix muss **beide** Einstiegspfade abdecken: `http/https`-URLs (Z. 2713) **und** das `url_mediathek:`-Präfix (Z. 2709–2711). Die Roadmap nennt nur den URL-Fall.
- **#46 (Profile-Dropdown):** Kein stilles Neuladen bei **fehlgeschlagenem** POST (Dropdown darf nicht mit leerer Liste überschrieben werden); Race-Condition bei zwei offenen Tabs wird nicht erwähnt.
- **#47 (URL-Auflösung/Titel):** Suffixe wie ` - ARD Mediathek`/` | Sendung verpasst?` müssen weiter entfernt werden (ist als Risiko genannt), aber der konkrete Fall **Episodentitel mit eigenem Bindestrich** („–", „-") als Bestandteil des Titels ist nicht explizit abgedeckt.
- **#39 (401-Double-Check):** Fehlende Edge-Cases: (a) Single-Flight muss `fetch`-Retry eines **POST** mit frischem CSRF-Token ausstatten; (b) der Interceptor darf den Retry nicht für `/api/auth/login` selbst anstoßen (Endlosschleife); (c) `showLoginScreen()` darf nicht bei einem legitimen 401 des **Logout**-Endpunkts greifen.
- **Quer über alle Frontend-Wins:** Alle laufen unter dem ungelösten Cache-Busting-Problem (K1) — ohne koordinierten `?v=`-Bump ist jeder dieser „kleinen" Frontend-Fixes beim Nutzer potenziell unsichtbar/stale.

---

## Kernaussage des Advocatus
Die gefühlte „Quick-Win"-Sicherheit trügt an zwei Stellen: (1) Die Frontend-Verteilung hat ein offenes Cache-Busting-Problem (drei konkurrierende Versionsstände `?v=90/73/78`), das jeden reinen Frontend-Schritt unterminiert; (2) #39 ist entgegen seiner Einordnung kein harmloser Quick-Win, sondern greift den globalen Auth-Interceptor an. Die beiden großen Kandidaten #1 und #18 sind nicht „mittel/groß, aber machbar", sondern tragen irreversiblen bzw. externen Effekt (Datenmigration, öffentliches Image) und erfordern je eine **sicherheits-frage** bzw. **design-frage**, die vor dem ersten Commit beantwortet sein muss. Meine Prüfempfehlung: Quick-Wins (ohne #39) zuerst, #39 zuletzt, und vor jedem Frontend-Schritt K1 (Cache-Busting) auflösen.

*Hinweis (nicht angefasst, nur notiert):* Die ROADMAP-Tabelle (Items 52–55 fehlen) und die dangling Referenz „#58" sind reine Doku-Hygiene, gehören aber bereinigt, weil die Roadmap als zentrale Planungsquelle dient und der Verweis auf ein nicht existierendes Item künftige Entscheidungen fehlleitet.
