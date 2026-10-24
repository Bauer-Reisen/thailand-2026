# Taugt das als echtes Produkt?

Stand 23.10.2026. Preise und Funktionen fremder Apps stammen aus Testberichten und App-Store-Einträgen, nicht von den Herstellerseiten – vor einer Entscheidung dort prüfen.

## Was es schon gibt
| App | Stärke | Preis (laut Quellen) |
|---|---|---|
| **TripIt** | Buchungsmails weiterleiten → automatischer Reiseplan (kostenlos); Pro: Flugalarme, Sitz-/Preistracker | Pro ca. 49 $/Jahr |
| **Wanderlog** | Gemeinsames Planen auf der Karte, Routen, begrenzte KI; Budget eher manuell; Offline laut einer Quelle nur Pro | Pro ca. 40 $/Jahr |
| **Mindtrip, Layla, Gemini** | KI-Planer mit Chat; Layla schwach bei Gruppen (kein gemeinsames Bearbeiten) | meist kostenlos/Abo |
| Splitwise, Tricount | Ausgaben teilen | kostenlos/Abo |

Quellen: pilotplans.com, localsinsider.com, apps.apple.com (Wanderlog, TripIt), stippl.io, lindy.ai, guruwalk.com.

## Was unsere Idee anders macht
- **Plan B pro Tag, automatisch nach Wetter** – in keiner der Quellen als Funktion der genannten Apps gefunden. Das ist der eigentliche Unterschied.
- **„Auf den sonnigsten Tag legen“** – Tage tauschen anhand der Vorhersage.
- **Neu generieren in zwei Stufen** – offline aus kuratiertem Pool, online per KI mit Ort, Wetter, Uhrzeit, Kindern.
- **Familienfokus** – Ideen nach Kindertauglichkeit, Dauer, Hitze getaggt.
- **Ausgaben in Landeswährung** im selben Werkzeug.

Einschränkung: Jede einzelne Funktion ist leicht nachzubauen. Wanderlog oder TripIt könnten „Plan B bei Regen“ in einem Quartal ergänzen.

## Was für eine echte App fehlt
| Baustein | Heute | Nötig |
|---|---|---|
| Nutzerkonten | keine | Login (z. B. Apple/Google), Familien-Gruppen |
| Sync | Datei per WhatsApp | Echtzeit-Sync mit Server, Konfliktlösung |
| Reisedaten | trip.json von Hand | Import aus Buchungsmails (Weiterleitung oder Postfach-Zugriff), PDF-Erkennung |
| Ideen-Pool | 51 Ideen, von Hand recherchiert | Pool für viele Ziele: Lizenzdaten (z. B. Places-APIs, kostenpflichtig) + Redaktion/KI mit Prüfung |
| App Stores | PWA | native Hülle (iOS/Android), Store-Konten (Apple 99 $/Jahr, Google einmalig 25 $ – Vermutung, nicht geprüft) |
| Datenschutz/DSGVO | alles lokal, kein Problem | Datenschutzerklärung, Auftragsverarbeitung mit Server-/KI-Anbieter, Löschkonzept, Serverstandort EU; Buchungsmails enthalten Namen und Buchungsnummern → besonders heikel |
| Haftung | – | KI-Vorschläge können falsch sein (Öffnungszeiten, Sicherheit) → Kennzeichnung, Meldeweg |

## Laufende Kosten (Schätzung, nicht geprüft)
- **KI:** Eine „Neu generieren“-Anfrage ≈ 1.500 Token rein, ≈ 1.500 raus. Mit Claude Opus 5.5 (4 $/20 $ pro Mio. Token) ≈ 0,04 $; mit Claude Haiku 5.5 (0,10 $/0,50 $) ≈ 0,001 $. Bei 10 Anfragen pro Reise: **0,01–0,40 $ pro Reise**. KI ist nicht der Kostentreiber.
- **Server/Sync/Speicher:** bei wenigen tausend Nutzern im niedrigen zweistelligen Euro-Bereich pro Monat.
- **Ortsdaten (Places-APIs) und Mail-Import:** der eigentliche Kostenblock, hängt stark vom Anbieter ab.
- **Größter Posten ist Zeit:** Support, Pflege des Ideen-Pools, Store-Updates.

## Fahrplan
| Schritt | Inhalt | Aufwand grob |
|---|---|---|
| 0 | Eigener Urlaub mit dieser Version, Notizen was fehlt | erledigt + 10 Tage |
| 1 | 5–10 befreundete Familien mit trip.json-Vorlage, messen: wird Plan B wirklich genutzt? | 2–4 Wochen |
| 2 | Editor statt trip.json, KI erzeugt Ideen-Pool für beliebiges Ziel | 4–6 Wochen |
| 3 | Konten + Sync (z. B. Supabase/Firebase), Teilen in der Familie | 4–6 Wochen |
| 4 | Import aus Buchungsmails | 6–10 Wochen |
| 5 | Store-Versionen, DSGVO-Paket, Bezahlmodell | 4–8 Wochen |
Gesamt bis zum öffentlichen Start: grob 5–8 Monate Teilzeit für eine Person, oder Dienstleister.

## Empfehlung
**Nicht als Produkt starten – erst Schritt 1 machen.** Der Markt ist voll, und der einzige echte Unterschied (Plan B nach Wetter für Familien) ist leicht kopierbar.

Ausschlaggebendes Kriterium: **Nutzen andere Familien Plan B / „Neu generieren“ unterwegs tatsächlich mehrmals pro Reise?** Wenn in Schritt 1 die Mehrheit das nicht tut, ist es eine nette Funktion, kein Produkt. Wenn doch, lohnt Schritt 2.
