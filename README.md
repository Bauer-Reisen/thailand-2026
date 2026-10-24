# Thailand 2026 – Familien-Reise-App

Mobile Web-App (PWA) für Bangkok & Koh Samet, 30.10.–8.11.2026. Läuft nach einmaligem Laden offline.

## Aufs Handy bringen (GitHub Pages)
1. Auf github.com ein neues **öffentliches** Repository anlegen, z. B. `thailand-2026`.
2. Alle Dateien dieses Ordners hochladen („Add file → Upload files“), committen.
3. Settings → Pages → Source „Deploy from a branch“, Branch `main`, Ordner `/ (root)` → Save.
4. Nach 1–2 Minuten ist die App unter `https://DEINNAME.github.io/thailand-2026/` erreichbar. Link an deine Frau schicken.
5. Am Handy öffnen: iPhone Safari → Teilen → „Zum Home-Bildschirm“; Android Chrome → ⋮ → „App installieren“.
6. Einmal mit Internet alle Bereiche öffnen – danach geht alles offline (Wetter zeigt dann den letzten Stand mit Zeitstempel).

Das Repository ist öffentlich, die Reisedaten aber nicht: Sie liegen verschlüsselt in `data/`. Ohne Passwort sieht man nur den Anmeldebildschirm.

## Passwörter: Familie und Gäste
- **Familien-Passwort** (drei Wörter): alles außer euren lokalen Daten.
- **Gäste-Passwort** (drei Wörter): Tagesplan, Orte, Wetter, Flugzeiten. Keine Unterkünfte, Adressen, Gastgeber, Ausgaben, Listen, Dokumente oder Codes.
- Groß-/Kleinschreibung und Bindestriche statt Leerzeichen sind egal.
- Link und Gäste-Passwort zum Weiterschicken: Mehr → Gäste-Zugang → „Nachricht kopieren“.
- Die Passwörter stehen nirgends im Repository.

## Reisedaten ändern
In der App: Mehr → **Reisedaten bearbeiten**. Dort steht alles als Text (JSON).
- Mit GitHub-Schlüssel unter „Meine Codes“: „Veröffentlichen“ verschlüsselt beide Fassungen und lädt sie hoch. Nach 1–2 Minuten sehen alle die neue Fassung.
- Ohne Schlüssel: „Als Dateien teilen“, dann auf GitHub im Ordner `data` beide Dateien ersetzen.
- Gäste-Passwort ändern: `meta.viewerPass`. Familien-Passwort ändern: Feld unter dem Text.

Wichtige Felder:
- `stays` – Unterkünfte (Koh Samet und letzte Nacht Bangkok hier eintragen, `"check": true` / `"open": true` entfernen, wenn bestätigt)
- `days` – Tagespläne: `planA` und `planB` (Typ `regen`, `muede` oder `hitze`), Punkte mit `time`, `title`, `place`, `maps` (Suchbegriff für Google Maps), `note`, `check` (= „zu prüfen“)
- `transfers`, `flights`, `checkins`, `ideas` (Ideen-Pool), `packing`, `emergency`
- `meta.dailyBudgetEUR` – Tagesbudget (`null` = aus; lässt sich auch in der App einstellen)

Komma, Anführungszeichen und Klammern müssen stimmen; die App prüft das vor dem Veröffentlichen.

## Private Daten
„Meine Codes“, Ausgaben, Haken und Dokumente liegen nur im Browser des jeweiligen Handys (localStorage/IndexedDB). Achtung: Wer im Browser „Websitedaten löschen“ macht, löscht sie mit.

## Geld abheben
Ausgaben → „🏧 Geld abheben“: abgehobene Baht und ATM-Gebühr eintragen, später den abgebuchten €-Betrag aus der Bank-App nachtragen. Die App rechnet daraus den effektiven Kurs und die Gebühren (Kategorie „Gebühren“) und zeigt, wie viel Bargeld rechnerisch übrig ist. Die Baht-Ausgaben selbst erfasst ihr wie immer als „bar“. Der Auslandseinsatz der Karte (Prozent) lässt sich unten bei den Einstellungen eintragen.

## Tagebuch für Familie & Gäste
Mehr → Tagebuch (Gäste: eigener Tab). Text schreiben, Fotos wählen, „veröffentlichen“. Fotos werden auf 1600 px verkleinert, Ortsdaten entfernt und mit dem Gäste-Passwort verschlüsselt in `data/` hochgeladen. Braucht auf dem Handy GitHub-Repository und -Schlüssel unter „Meine Codes“. Gäste sehen neue Einträge nach 1–2 Minuten.

## Lernen
Mehr → Lernen: Karteikarten je Kind und Reisetag (Vokabel, Lückentext, Satz bauen, Verstehen, Rechnen), danach Sachaufgabe, Nachdenk-Frage und Sprech-Aufgabe. Neue Inhalte im selben Markdown-Format: in der App „Datei laden“ (nur dieses Handy) oder dauerhaft mit `node tools/import-learn.js trip.json lerninhalte.md` und danach `tools/encrypt.js`.

## Länder-Atlas
Lernen → 🗺️ Länder-Atlas: Europa- und Thailand-Karte, Steckbriefe für Deutschland, alle 9 Nachbarn, Italien, Spanien, Griechenland, Großbritannien und Thailand (Lage, Merkhilfe, Fakten, „Hallo“), dazu „Finde das Land“. Verknüpft mit dem Lernstoff (Wissen-Seiten) und dem Pilotenspiel.

## Für die Kinder
Mehr → Für die Kinder: Pilotenspiel mit Weltkarte (10 Flüge: Land und Stadt finden, dann fliegen), Flug-Fortschritt (während des Flugs), drei Gute-Nacht-Geschichten mit Vorlesen, Thailand-Quiz, Memory, Spiele ohne Material. Alles offline.

## Design
Oben das Urlaubsbild (`bg.svg`, eigenes Foto unter Abgleich & Offline → Hintergrundbild) mit großer Überschrift, darunter ein durchgehender sandfarbener Bogen statt einzelner Kacheln. Im Dunkelmodus des Handys automatisch „Bangkok bei Nacht“ (dunkel, Leuchtfarben). Schrift: Prompt (Google Fonts, von einem thailändischen Schriftbüro), wird offline gespeichert.

## Wetter
Open-Meteo, bis 16 Tage, verlässlich etwa eine Woche. Ausgewertet wird stündlich von 8 bis 20 Uhr: ein kurzes Gewitter am Nachmittag erscheint als „kurz Gewitter (15–16 Uhr)“, nicht als Regentag. Rot gewarnt wird ab etwa 4 Regenstunden tagsüber oder 12 mm.

## Bilder & Thai-Wörter
„📷 Bilder“ zeigt bis zu 6 freie Fotos von Wikimedia Commons, die Kurzinfo aus Wikipedia (Feld `wiki` in den Ideen) und einen Link zur Google-Bildersuche. „Karte & Fotos“ öffnet den Ort in Google Maps mit den Fotos dort. Einmal angesehene Bilder bleiben offline verfügbar. Mehr → Thai-Sprachführer: rund 50 Sätze nach Situationen (Restaurant, Kinderessen, Unterwegs, Unterkunft, Notfall), Zahlen, Tischreservierung als fertiger Thai/Englisch-Text; Antippen zeigt den Satz groß zum Vorzeigen.

## Kalender & offline
Abgleich, Offline & Kalender → „Termine in den Kalender“ erzeugt eine Kalenderdatei mit allen Terminen und Erinnerungen (Feld `calendar` in den Reisedaten). „Jetzt alles laden“ vor dem Abflug im WLAN antippen.

## Abgleich zwischen zwei Handys
Ohne eigenen Server geht es per Datei: Ausgaben → „Mit 2. Handy abgleichen“ → „Daten senden“ (WhatsApp/AirDrop), auf dem anderen Handy „Daten empfangen“. Doppelte Einträge entstehen nicht. Codes und Dokumente werden nicht mitgeschickt.
Echte Live-Synchronisierung bräuchte einen Server (z. B. Cloudflare Worker + KV) – für 10 Tage lohnt sich das nicht.

## KI-Vorschläge (optional)
Zwei Wege, beide unter „Meine Codes“ einzutragen:

| | Schlüssel direkt im Handy | Eigener Proxy (Cloudflare Worker) |
|---|---|---|
| Einrichtung | 1 Minute | ca. 15 Minuten, kostenloses Cloudflare-Konto |
| Schlüssel | liegt im Browser beider Handys | liegt nur bei Cloudflare |
| Risiko | Handy weg → Schlüssel weg; jeder mit Zugriff kann auf eure Kosten Anfragen stellen | nur wer URL **und** Passwort kennt |
| Empfehlung | ok, wenn ihr in der Anthropic-Konsole ein niedriges Ausgabenlimit setzt | sauberer, wenn die App mehr Leute nutzen |

Proxy einrichten:
```
npm i -g wrangler
cd worker
wrangler login
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put APP_TOKEN      # frei gewähltes Passwort
# in wrangler.toml ALLOWED_ORIGIN auf eure github.io-Adresse setzen
wrangler deploy
```
Die ausgegebene `…workers.dev`-Adresse und das Passwort unter „Meine Codes“ eintragen.

Verwendetes Modell: `claude-opus-5-5`, mit `fallbacks: "default"` (falls eine Anfrage abgelehnt wird, beantwortet sie automatisch ein anderes Modell).

## Dateien
`index.html`, `styles.css`, `app.js` (App), `shared.js` (Verschlüsselung, Gäste-Fassung), `data/` (verschlüsselte Reisedaten), `tools/encrypt.js` (Verschlüsseln am Rechner), `sw.js` (Offline), `manifest.webmanifest` + `icons/` (Home-Bildschirm), `worker/` (optionaler KI-Proxy).
Nach Änderungen an `app.js`/`styles.css` in `sw.js` die `VERSION` erhöhen, damit die Handys die neue Fassung laden.

Testen am Rechner: `python3 -m http.server` im Ordner, dann http://localhost:8000. Mit `?jetzt=2026-11-03T10:00:00%2B07:00` lässt sich ein Reisetag simulieren.
