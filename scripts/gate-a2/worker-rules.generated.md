<!-- AUTOMATISCH GENERIERT aus rules/*.md durch scripts/gate-a2/build-worker-rules.sh.
     NICHT direkt bearbeiten — WORKER-SAFE-Marker in rules/*.md ändern und neu bauen. -->

# Regeln (Auszug für den headless Worker)

## Aus rules/02-arbeitsweise.md

- Einfachste Lösung zuerst — keine Abstraktionen oder Flexibilität, die nicht explizit gefragt wurden.
- Nur anfassen, was explizit zur Aufgabe gehört — keine ungebetenen Verbesserungen, Refactorings oder Umbenennungen.
- Wenn anderswo etwas auffällt: als Notiz am Ende erwähnen, nicht anfassen.

## Aus rules/05-sicherheit.md

- API-Keys, Passwörter und Tokens gehören in `.env`-Dateien, niemals direkt in den Code.
- `.env` immer in `.gitignore` eintragen — aktiv darauf hinweisen, wenn vergessen.
- `.env.example` mit Platzhaltern anlegen.
- Datenbankzugriffsregeln (z. B. Supabase RLS) für jede Tabelle explizit setzen — Prinzip: minimale Berechtigungen.
- Bei öffentlich erreichbaren API-Endpunkten: Rate Limiting implementieren und darauf hinweisen.

## Aus rules/06-codequalitaet.md

- Alle externen Aufrufe (APIs, Dateisystem, Datenbank) mit `try/catch` absichern.
- Fehler müssen sichtbar sein — kein stilles Scheitern.
- Fehlermeldungen müssen beschreiben, was passiert ist, nicht nur "Error".
- Logging an wichtigen Stellen einbauen.
- Variablen- und Funktionsnamen beschreiben, was sie tun: `fetchUserData()` statt `getData()`.
- Keine Einbuchstaben-Variablen außer in kurzen Schleifen (`i`, `j`).

## Aus rules/07-git-commits.md

- Nach jedem abgeschlossenen Plan-Schritt nur die eigenen Dateien gezielt stagen und lokal committen: `git add <eigene-dateien> && git commit -m "<kurze Beschreibung>"` — das ist ohne Rückfrage erlaubt.
- Pushen nur auf ausdrückliche Nachfrage.
- Commit-Messages auf Englisch, knapp und im Imperativ (`add folder-size monitor`, nicht `added ...`).

## Aus rules/12-abschluss.md

- [ ] Keine Secrets im Code oder in der Versionskontrolle
- [ ] `.env.example` vorhanden (falls Secrets genutzt werden)
- [ ] Fehlerbehandlung für alle externen Aufrufe
- [ ] Berechtigungen geprüft
- [ ] Rate Limiting bedacht (falls öffentlich erreichbar)
- [ ] Code ist lesbar und kommentiert
- [ ] Testfälle formuliert und umgesetzt
- [ ] Doku aktualisiert, falls sich Verhalten geändert hat
- [ ] Der Fehler ist konkret beschrieben (Symptom, betroffene Stelle, Log/Screenshot).
- [ ] Der Repro-Fall ist benannt: Welche Schritte führen zum Fehler?
- [ ] Die Ursache ist eingegrenzt und im Abschluss kurz erklärt.
- [ ] Der Fix ist eng begrenzt und verändert keine unrelated Funktionen.
- [ ] Bestehende Nutzer-Daten, Einstellungen und Dateien bleiben kompatibel.
- [ ] Keine hardcodierten lokalen/maschinenspezifischen Pfade.
- [ ] Falls UI betroffen: Texte, Platzhalter, Buttons, Fehlermeldungen passen zum Verhalten.
- [ ] Falls Secrets/API-Keys betroffen: Speicherung nur über `.env`/persistente Config.
- [ ] Automatisierte Tests ergänzt — oder begründet, warum ein manueller Test reicht.
- [ ] Manuelle Verifikation mit konkreten Befehlen/Schritten dokumentiert.
