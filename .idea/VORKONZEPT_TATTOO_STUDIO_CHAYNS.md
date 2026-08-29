# Vorkonzept: Digitale chayns-Plattform für ein Tattoo-Studio in Ahaus

> Arbeitsstand: 28. August 2026  
> Dokumenttyp: Fachliches und technisches Vorkonzept  
> Zielplattform: chayns Custom Page mit React und TypeScript  
> Status: Architekturentscheidung aktualisiert, noch kein Pflichtenheft  
> Backendentscheidung: eigener transaktionaler Buchungskern; chayns.Codes als Shop- und Plattform-Adapter  
> Technische Ausarbeitung: [Architektur- und Umsetzungskonzept](./ARCHITEKTUR_UND_UMSETZUNG.md)

## 1. Ausgangslage und Annahmen

Das Studio benötigt eine moderne Website, die nicht nur Arbeiten präsentiert, sondern den vollständigen Weg von der ersten Tattoo-Idee bis zur Nachsorge digital unterstützt. Im Mittelpunkt stehen Terminreservierungen mit unterschiedlichen Zeitbedarfen, verbindliche Anzahlungen, Restzahlungen und eine für Tattoo-Projekte geeignete Kommunikation.

Für dieses Vorkonzept gelten folgende Arbeitsannahmen:

- Mit „in a house“ ist der Standort **Ahaus** gemeint.
- Der endgültige Studio- und Markenname, das bestehende Corporate Design und die Zahl der Artists sind noch zu bestätigen.
- Die doppelte Anforderung „zahlen“ wird in zwei Bedeutungen berücksichtigt:
  - Zahlungen: Anzahlung, Restzahlung, Rückzahlung, Gutschein und Kassenstatus.
  - Zahlen: betriebliche Kennzahlen wie Auslastung, Umsatz, No-Show-Quote und offene Beträge.
- Das Studio arbeitet überwiegend nach Termin und bietet individuelle Tattoo-Projekte, Flash-Motive, Beratungen und Nachstechtermine an.
- Eine Online-Anfrage ist nicht automatisch eine Annahme des Tattoo-Auftrags. Das Studio beziehungsweise der Artist prüft zunächst Motiv, Machbarkeit, Zeitbedarf und Preisrahmen.
- Rechtstexte, Einwilligungen, Minderjährigenregeln und konkrete Storno-/Anzahlungsbedingungen werden vor dem Produktivbetrieb rechtlich geprüft.

## 2. Kurzfassung der Produktidee

Die Anwendung wird zur digitalen Rezeption des Studios:

1. Interessierte entdecken Artists, Stilrichtungen und Arbeiten.
2. Sie übermitteln eine strukturierte Tattoo-Anfrage mit Größe, Körperstelle, Motivbeschreibung und Referenzbildern.
3. Das Studio prüft die Anfrage und entscheidet zwischen Ablehnung, Rückfrage, Beratung oder direktem Angebot.
4. Passende Zeitfenster werden vorgeschlagen und für einen begrenzten Zeitraum reserviert.
5. Erst nach Annahme der Bedingungen und erfolgreicher Anzahlung wird der Termin verbindlich.
6. Erinnerungen, Vorbereitungshinweise und gegebenenfalls Einwilligungsunterlagen folgen automatisch.
7. Am Termin werden Anzahlung und Restbetrag korrekt verrechnet.
8. Mehrteilige Projekte bleiben über alle Sitzungen hinweg zusammenhängend dokumentiert.
9. Nach dem Termin erhalten Kundinnen und Kunden Pflegehinweise und optional einen kontrollierten Nachsorge-/Nachstechprozess.

Das zentrale Produktversprechen lautet:

> Von der Idee zum bestätigten Tattoo-Termin – transparent, persönlich und ohne verlorene Instagram-, WhatsApp- oder E-Mail-Verläufe.

## 3. Erkenntnisse aus Markt und Recherche

### 3.1 Branchenmuster

Tattoo-spezifische Buchungssysteme bilden regelmäßig folgende Funktionen ab:

- Anfrage vor der eigentlichen Terminbuchung
- Beratung als eigener Termintyp
- Artist-spezifische Kalender und Stilrichtungen
- variable Sitzungsdauer statt einheitlicher 30-Minuten-Slots
- mehrteilige Projekte, etwa Sleeves oder Rückenarbeiten
- Referenzbilder, Cover-up-Angaben, Körperstelle und Größenangabe
- Anzahlung als Voraussetzung für die verbindliche Buchung
- digitale Einwilligung und Altersprüfung
- Erinnerungen, Storno- und No-Show-Regeln
- Restzahlung unter Anrechnung der Anzahlung
- Nachsorge, Nachstechen und verheilte Fotos

Beispiele wie [Tattivo](https://tattivo.app/), [Tattoo Booking](https://tattoobooking.co/) und [Adapt](https://www.adapt-pos.com/tattoo.html) bestätigen diesen durchgängigen Projektprozess. Die einzelnen Produkte sind Wettbewerbs-/Inspirationsquellen, aber keine technische Grundlage des Projekts.

### 3.2 Lokaler Markt Ahaus

Die öffentlich sichtbaren Abläufe lokaler Studios sind häufig noch kontaktorientiert:

- DARLINK vergibt Termine persönlich, über Instagram oder WhatsApp.
- LA Tattoo Studio führt von der Ideennachricht über Beratung zur manuellen Terminvereinbarung.
- BOTTEL nutzt unter anderem WhatsApp und ein Kontaktformular.
- Hekate Tattoo nennt einen strukturierten Online-/WhatsApp-Ablauf und ein Deposit von 50 Euro.

Quellen: [DARLINK](https://www.darlink.de/), [LA Tattoo Studio](https://www.laartanimation.de/), [BOTTEL](https://www.tattoo-piercing-profi.de/), [Hekate Tattoo](https://hekate-tattoo.art/).

### 3.3 Chance für das Studio

Die Plattform soll persönliche Beratung nicht ersetzen. Sie soll wiederkehrende Verwaltungsarbeit reduzieren und Interessierte besser vorbereiten. Der Differenzierungsvorteil entsteht durch:

- eine hochwertige visuelle Präsentation,
- eine klare Anfrage statt unstrukturierter Direktnachrichten,
- nachvollziehbare Bearbeitungsstände,
- verbindliche Termine erst nach Zahlung,
- automatische, aber persönlich formulierte Kommunikation,
- einen einzigen Projektverlauf für alle Sitzungen.

## 4. Ziele und Nicht-Ziele

### 4.1 Geschäftsziele

- Weniger Verwaltungsaufwand durch strukturierte Anfragen
- Weniger Rückfragen zu Preis, Ablauf, Vorbereitung und Pflege
- Reduzierung von No-Shows und kurzfristigen Absagen
- Höhere Auslastung frei gewordener Termine
- Transparente Zuordnung aller Zahlungen zu Kunde, Projekt und Termin
- Professioneller Markenauftritt für Studio und Artists
- Messbare Anfrage-, Buchungs- und Auslastungszahlen
- Aufbau einer langfristigen Kundenbeziehung über die chayns ID

### 4.2 Nutzerziele

- Schnell erkennen, ob Stil, Budget und Artist passen
- Eine Tattoo-Idee vollständig und mobil übermitteln
- Den Bearbeitungsstand ohne Nachfragen sehen
- Geeignete Termine auswählen, anzahlen und verwalten
- Alle wichtigen Informationen an einer Stelle finden
- Mehrere Sitzungen und Zahlungen nachvollziehen
- Pflegehinweise auch nach dem Termin erneut abrufen

### 4.3 Nicht-Ziele des MVP

- Vollständige Finanzbuchhaltung oder Steuerberatung
- Medizinische Beratung oder automatische medizinische Freigabe
- Automatische Preisberechnung individueller Tattoo-Kunstwerke ohne Artist-Prüfung
- Öffentliche Einsicht in Kundendaten oder Entwürfe
- Unkontrollierter KI-Entwurf urheberrechtlich problematischer Motive
- Vollständiger Ersatz einer vorhandenen rechtskonformen Kasse

## 5. Zielgruppen und Rollen

### 5.1 Kundenseitige Zielgruppen

1. **Erstkundschaft**  
   Benötigt Orientierung, Vertrauen, Preistransparenz und eine einfache Anfrage.

2. **Bestandskundschaft**  
   Möchte Folgeprojekte, weitere Sitzungen, Nachstechen oder Pflegeinformationen verwalten.

3. **Flash-Kundschaft**  
   Möchte ein verfügbares Motiv schnell auswählen und einen passenden Termin sichern.

4. **Großprojekt-Kundschaft**  
   Benötigt Beratung, mehrere Sitzungen, Projektfortschritt und transparente Teilzahlungen.

### 5.2 Interne Rollen

| Rolle | Rechte und Aufgaben |
|---|---|
| Studio-Inhaber/Admin | Vollzugriff, Stammdaten, Artists, Finanzen, Regeln und Auswertungen |
| Studio-Management | Anfragen, Kalender, Zahlungen, Kommunikation und Warteliste |
| Artist | Eigene Anfragen, Projekte, Kalender, Notizen, Preis-/Zeitfreigabe |
| Empfang/Kasse | Check-in, Zahlungsstatus, Restzahlung und Belege |
| Gast-Artist | Zeitlich und fachlich begrenzter Zugriff auf eigene Termine |
| Kunde | Eigene Anfragen, Termine, Zahlungen, Dokumente und Pflegehinweise |

Rechte müssen serverseitig geprüft werden. Eine ausgeblendete Schaltfläche allein ist keine Autorisierung.

## 6. Leistungs- und Terminkatalog

Die Dauer wird nicht nur als Startzeit, sondern als belegter Ressourcenblock modelliert. Jeder Termintyp besitzt eigene Vorlaufzeiten, Puffer, Zahlungs- und Freigaberegeln.

| Termintyp | Typische Dauer | Buchungsart | Zahlung | Besonderheiten |
|---|---:|---|---|---|
| Kurze Erstberatung | 15–30 Min. | direkt oder nach Anfrage | kostenlos oder Beratungsgebühr | keine Tattoo-Sitzung |
| Ausführliche Projektberatung | 30–60 Min. | nach Prüfung | optional anrechenbare Gebühr | Großprojekt/Cover-up |
| Small/Fineline Session | 60–120 Min. | nach Freigabe, teilweise direkt | feste Anzahlung | Mindestpreis möglich |
| Standardsitzung | 2–4 Std. | nach Angebot | feste oder prozentuale Anzahlung | Pausen/Puffer berücksichtigen |
| Halbtagessitzung | 4–5 Std. | manuell freigegeben | erhöhte Anzahlung | keine Parallelbuchung |
| Tagessitzung | 6–8 Std. | manuell freigegeben | erhöhte Anzahlung | kompletter Arbeitstag blockiert |
| Folgesitzung | projektspezifisch | durch Artist/Admin | nach Projektregel | mit bestehendem Projekt verknüpft |
| Nachstechen/Kontrolle | 15–60 Min. | nach Prüfung von Foto/Frist | kostenlos oder fest | Regelwerk erforderlich |
| Flash-Termin | motivabhängig | direkt oder kurz freigegeben | feste Anzahlung/Vollzahlung | Motiv nach Reservierung sperren |
| Walk-in/Spontantermin | variabel | nur freie Restzeiten | vor Ort | optional Warteschlange |

Die Werte sind konfigurierbare Startwerte und werden mit dem Studio abgestimmt.

## 7. Kernprozess: Individuelles Tattoo-Projekt

### 7.1 Prozessübersicht

```text
Entdecken
  → Anfrage erfassen
  → Studio prüft
  → Rückfrage / Beratung / Angebot
  → Zeitfenster reservieren
  → Bedingungen akzeptieren
  → Anzahlung bezahlen
  → Termin bestätigt
  → Vorbereitung und Erinnerung
  → Check-in und Einwilligung
  → Tattoo-Sitzung
  → Restzahlung
  → Nachsorge
  → optional Folgesitzung / Nachstechen
```

### 7.2 Statusmodell der Anfrage

| Status | Bedeutung |
|---|---|
| Entwurf | Kunde hat noch nicht abgesendet |
| Eingegangen | Anfrage wartet auf Studio-Prüfung |
| Rückfrage | Angaben oder Referenzen fehlen |
| Beratung erforderlich | Beratungstermin wird angeboten |
| Kalkulation | Artist schätzt Dauer und Preisrahmen |
| Angebot gesendet | Leistung, Artist, Dauer, Preisrahmen und Deposit vorgeschlagen |
| Terminoptionen gesendet | Kunde kann aus freigegebenen Slots wählen |
| Slot gehalten | Zeitfenster ist vorübergehend blockiert |
| Zahlung ausstehend | Deposit muss innerhalb der Frist eingehen |
| Bestätigt | Zahlung erfolgreich, Termin verbindlich |
| Abgelehnt | Anfrage passt nicht zum Studio/Artist |
| Abgelaufen | Kunde hat Angebot oder Reservierung nicht rechtzeitig bestätigt |
| Storniert | Projekt/Termin wurde beendet |

Jede Statusänderung erhält Zeitstempel, ausführende Rolle und optional einen internen Grund.

### 7.3 Anfrageformular

Pflichtangaben sollten auf das wirklich Notwendige begrenzt werden:

- gewünschter Artist oder „passenden Artist empfehlen“
- Tattoo-Art: neues Motiv, Erweiterung, Cover-up, Nachstechen
- Stilrichtung
- Motivbeschreibung und gewünschte Wirkung
- Körperstelle
- ungefähre Größe in Zentimetern
- schwarz/grau oder Farbe
- Referenzbilder und bei Cover-ups aktuelle Fotos
- Budgetrahmen als Orientierung
- zeitliche Verfügbarkeit beziehungsweise bevorzugte Wochentage
- Bestätigung des Mindestalters gemäß Studio-Policy
- Kontaktweg und Login
- Akzeptanz von Datenschutz und Anfragebedingungen

Optional:

- Barrierefreiheits- oder Kommunikationsbedarf
- Anlass beziehungsweise gewünschtes Fertigstellungsdatum
- freie Anmerkungen

Gesundheitsfragen gehören nicht unnötig in die frühe Marketing-/Anfragephase. Sie werden erst dann erhoben, wenn sie für die sichere Leistungserbringung erforderlich sind und eine passende Rechtsgrundlage beziehungsweise ausdrückliche Einwilligung vorliegt.

## 8. Termin- und Ressourcenlogik

### 8.1 Ressourcen

Ein Termin belegt mindestens:

- einen Artist,
- einen Arbeitsplatz/Stuhl,
- einen Zeitraum,
- gegebenenfalls einen Beratungsbereich,
- optional besondere Ausstattung.

### 8.2 Kalenderregeln

- Verfügbarkeiten pro Artist und Wochentag
- Urlaub, Krankheit, Fortbildung und Guest Spots
- abweichende Öffnungszeiten und Feiertage
- minimale und maximale Vorlaufzeit
- Puffer vor und nach Sitzungen, beispielsweise Aufbau/Reinigung
- definierte Pausenzeiten
- keine Überschneidung von Artist oder Arbeitsplatz
- konfigurierbare Zeitraster, zum Beispiel 15 Minuten intern
- lange Sitzungen dürfen kurze Restlücken nicht unbrauchbar machen
- zusammenhängende Mindestblöcke für Halb-/Tagessitzungen
- Option „nur Anfrage“ statt Direktbuchung pro Leistung
- optional kontrolliertes Überbuchen nur durch Admin

### 8.3 Slot-Hold

Ein angebotener Slot wird nicht unbegrenzt blockiert:

- Kunde wählt einen Slot.
- System hält ihn beispielsweise 20 Minuten für den Checkout.
- Nach Checkout kann eine längere Zahlungsfrist gelten, beispielsweise 24 Stunden bei Überweisung.
- Erfolgt keine erfolgreiche Zahlung, wird der Slot automatisch freigegeben.
- Parallelversuche müssen atomar aufgelöst werden; nur eine Buchung darf gewinnen.

### 8.4 Mehrteilige Projekte

Ein Projekt kann beliebig viele Sitzungen enthalten. Erforderlich sind:

- Projektziel und verantwortlicher Artist
- geschätzte Gesamtanzahl Sitzungen
- Reihenfolge und Mindestabstand zwischen Sitzungen
- Status je Sitzung
- projektweite und sitzungsbezogene Notizen
- Referenzen, Entwürfe und Fortschrittsbilder mit getrennten Sichtbarkeiten
- Anzahlung je Sitzung oder einmalige Projektkaution
- offene und bereits bezahlte Beträge
- Abschluss und optionaler Nachsorgetermin

### 8.5 Technische Konsistenzregel

Artist, Arbeitsplatz und Zeitraum bilden gemeinsam einen exklusiven Buchungsblock. Die Prüfung „Slot ist frei“ und das Anlegen des Holds müssen in **einer Datenbanktransaktion** stattfinden. Ein Ablauf nach dem Muster `lesen → im Anwendungscode prüfen → schreiben` genügt nicht, weil zwei parallele Anfragen sonst denselben freien Zustand sehen können.

Für jeden Schreibvorgang gelten daher:

- Zeitangaben werden serverseitig in UTC gespeichert und für das Studio in `Europe/Berlin` dargestellt.
- `HELD`, `PAYMENT_PENDING` und `CONFIRMED` blockieren Artist und Ressource.
- Abgelaufene Holds werden vor einer neuen Reservierung bereinigt beziehungsweise nicht mehr als belegend gewertet.
- Eine Datenbankregel verhindert Überschneidungen unabhängig vom Frontend.
- Wiederholte Requests verwenden einen Idempotency-Key und erzeugen weder einen zweiten Hold noch eine zweite Shop-Bestellung.
- Admin-Umbuchungen durchlaufen dieselbe Konfliktprüfung wie Kundenbuchungen.

## 9. Zahlungs- und Anzahlungsmodell

### 9.1 Grundprinzip

Ein Termin ist erst **bestätigt**, wenn die geforderte Anzahlung erfolgreich verbucht wurde. Ein Zahlungsversuch allein reicht nicht.

### 9.2 Konfigurierbare Deposit-Regeln

- feste Shop-Artikel, beispielsweise „Anzahlung 50 €“, „Anzahlung 100 €“ und „Anzahlung 150 €“
- Staffel nach Sitzungsdauer, Artist oder Termintyp durch Zuordnung zum passenden Anzahlungsartikel
- eigene Regeln pro Artist oder Termintyp
- Vollzahlung bei ausgewählten Flash-Motiven
- keine Anzahlung bei ausdrücklich freigegebenen kostenlosen Terminen

`shop.admin.order.create` übernimmt Artikel-ID, Menge und Artikeloptionen, aber keinen frei gesetzten Preis. Prozentuale oder vollkommen individuelle Anzahlungen müssen daher auf einen vorhandenen Shop-Artikel abgebildet oder durch einen gesonderten, technisch und kaufmännisch geprüften Artikelprozess erzeugt werden. Für das MVP werden feste Anzahlungsstufen empfohlen. Die endgültigen Werte werden vom Studio festgelegt und rechtlich geprüft.

### 9.3 Zahlungsstatus

| Status | Bedeutung |
|---|---|
| Nicht erforderlich | Termin benötigt keine Zahlung |
| Offen | Forderung wurde erstellt |
| In Bearbeitung | Zahlungsanbieter meldet noch kein Endergebnis |
| Bezahlt | Betrag ist verbindlich bestätigt |
| Teilbezahlt | Ein Teilbetrag wurde verbucht |
| Fehlgeschlagen | Zahlung wurde abgelehnt/abgebrochen |
| Erstattet | Betrag vollständig zurückgezahlt |
| Teilweise erstattet | Teilrückzahlung erfolgt |
| Verrechnet | Anzahlung wurde auf Endrechnung angerechnet |
| Einbehalten | nach freigegebener Storno-/No-Show-Regel verbucht |

### 9.4 Zahlungsfälle

1. **Anzahlung**  
   Sichert einen Termin und wird transparent auf die spätere Forderung angerechnet.

2. **Restzahlung**  
   Endpreis minus bereits anrechenbarer Zahlungen, ergänzt um zulässige Zusatzpositionen.

3. **Teilzahlung bei mehreren Sitzungen**  
   Jede Sitzung kann einen eigenen Preis und Zahlungsstatus erhalten.

4. **Rückzahlung**  
   Immer mit Grund, Betrag, Zeitpunkt, Bearbeiter und Provider-Referenz.

5. **Gutschein/Guthaben**  
   Optional in einer späteren Ausbaustufe; Restguthaben muss nachvollziehbar bleiben.

6. **Trinkgeld**  
   Optional getrennt vom Leistungsentgelt und erst beim Checkout.

### 9.5 Dokumentierter chayns-Shop-Checkout

1. Das Buchungsbackend legt einen zeitlich begrenzten Slot-Hold an.
2. Die chayns-Integration ermittelt die gültige `personId` und ruft `shop.admin.order.create(shopId, order)` auf.
3. `order.articles` enthält ausschließlich serverseitig freigegebene Shop-Artikel-IDs, Mengen und gegebenenfalls Optionen.
4. Die zurückgegebene `id` wird als `orderUid` am Hold und am Payment-Datensatz gespeichert.
5. Der Nutzer wird auf die Shop-Page mit `?initialOrderUid=<orderUid>&show=cart` geleitet.
6. Die erzeugte Bestellung ist zu diesem Zeitpunkt noch nicht bezahlt oder bestätigt; der Termin bleibt `PAYMENT_PENDING`.
7. Ein Shop-Bestellereignis erreicht ein chayns.Codes-MQTT-Projekt. Dieses validiert die Zuordnung und meldet das Ergebnis idempotent an das Buchungsbackend.
8. Erst das bestätigte Shop-Ereignis setzt Zahlung auf `PAID` und Termin auf `CONFIRMED`.
9. Abbruch oder Zeitablauf setzt den Hold auf `EXPIRED` und gibt den Zeitraum wieder frei.

Die öffentlich dokumentierte Funktion `shop.admin.order.cancel` ist nicht automatisch mit einer finanziellen Erstattung gleichzusetzen. Rückzahlung, Teilrückzahlung, Gebühren und Belegfluss bleiben Bestandteil des Payment-Spikes.

### 9.6 Storno und No-Show

Die Software bildet Regeln ab, entscheidet sie aber nicht eigenständig juristisch. Erforderlich sind:

- klar sichtbare Frist vor Abschluss der Buchung,
- ausdrückliche Bestätigung der Termin-/Stornobedingungen,
- dokumentierter Zeitpunkt von Buchung und Absage,
- Möglichkeit für Admin, Kulanz, Krankheit oder Artist-Ausfall abzubilden,
- keine automatische Einbehaltung ohne nachvollziehbare Regel und Prüfung,
- vollständige Historie über Umbuchung, Freigabe und Nachbesetzung.

Ausfallhonorare und pauschale Einbehaltung können von Einzelfall, Exklusivreservierung, tatsächlichem Schaden und wirksamer Vereinbarung abhängen. Das Konzept ersetzt keine Rechtsberatung.

## 10. Kundenoberfläche und Informationsarchitektur

### 10.1 Öffentlicher Bereich

1. **Startseite**
   - starke Bildwelt und Positionierung
   - primäre CTA „Tattoo anfragen“
   - Artists und Stilrichtungen
   - Ablauf in wenigen Schritten
   - Vertrauen: Hygiene, Beratung, Bewertungen

2. **Artists**
   - Profil, Spezialisierung und persönliche Arbeitsweise
   - Portfolio
   - aktuelle Buchungslage
   - Anfrage beim Artist starten

3. **Portfolio**
   - Filter nach Artist, Stil, Körperstelle, Farbe
   - nur freigegebene Arbeiten
   - keine unrechtmäßig kopierbaren hochauflösenden Entwürfe

4. **Flash-Motive**
   - verfügbar, reserviert oder vergeben
   - Preis-/Größenrahmen und Artist
   - direkte Anfrage beziehungsweise Buchung

5. **Ablauf und Preise**
   - verständlicher Prozess
   - Mindestpreise, Stunden-/Tagessätze oder Preisfaktoren
   - Hinweis, dass individuelle Angebote geprüft werden

6. **Tattoo anfragen**
   - mehrstufiger Wizard
   - Zwischenspeichern
   - Upload-Vorschau und Zusammenfassung

7. **Nachsorge und FAQ**
   - Vorbereitung
   - Pflege
   - Verhalten bei Auffälligkeiten mit Verweis auf medizinische Hilfe

8. **Studio, Kontakt und Anfahrt**
   - Adresse Ahaus, Öffnungszeiten, Parken, Barrierehinweise
   - seriöse Kontaktkanäle

9. **Rechtliches**
   - Impressum, Datenschutz, AGB/Terminbedingungen
   - Einwilligungen und Widerrufsmöglichkeiten

### 10.2 Persönlicher Bereich „Meine Tattoos“

- Übersicht aller Anfragen und Projekte
- Status und nächste Aktion
- angebotene Termine auswählen
- Deposit und offene Zahlungen
- Termine absagen oder Umbuchung anfragen
- Vorbereitungshinweise und Anfahrt
- freigegebene Dokumente und Pflegehinweise
- sichere Nachrichten zum Projekt
- Referenzen nachreichen
- Nachsorge-/Nachstechanfrage

## 11. Interner Studio-Bereich

### 11.1 Dashboard

- heutige Termine mit Check-in- und Zahlungsstatus
- neue und überfällige Anfragen
- auslaufende Slot-Holds und Angebote
- offene Deposits und Restbeträge
- kurzfristig frei gewordene Slots
- Nachsorgeaufgaben

### 11.2 Anfrage-Pipeline

Kanban- oder Listenansicht mit Filtern nach:

- Status
- Artist
- Eingangsalter
- Stil
- Termindauer
- Budgetrahmen
- Beratung erforderlich
- unvollständige Angaben

Schnellaktionen:

- übernehmen/zuweisen
- Rückfrage senden
- Beratung anbieten
- ablehnen mit Antwortvorlage
- Dauer und Preisrahmen festlegen
- Terminoptionen senden

### 11.3 Kalender

- Tages-, Wochen- und Artistansicht
- Ressourcen- und Konfliktanzeige
- Drag-and-drop nur mit erneuter Regelprüfung
- interne Sperrzeiten und private Notiz ohne Kundeneinsicht
- frei gewordenen Slot an Warteliste anbieten
- Mehrfachtermine eines Projekts gemeinsam anzeigen

### 11.4 Kasse und Zahlungen

- Forderungen pro Termin/Projekt
- Anzahlung und Restbetrag
- Zahlungsart und Provider-Referenz
- Rückzahlung/Teilrückzahlung
- manuell erfasste Vor-Ort-Zahlung mit Berechtigung
- Tagesübersicht und Export für Buchhaltung/Kasse
- unveränderbares Änderungsprotokoll für finanzielle Statusänderungen

### 11.5 Stammdaten

- Artists, Rollen und Stilrichtungen
- Leistungen, Dauer und Puffer
- Öffnungszeiten und Ressourcen
- Deposit-, Storno- und Erinnerungsregeln
- Textvorlagen
- Pflegehinweise und Dokumentversionen

## 12. Benachrichtigungen und Kommunikation

### 12.1 Ereignisse

- Anfrage eingegangen
- Rückfrage des Studios
- Angebot/Terminoptionen verfügbar
- Slot läuft bald ab
- Zahlung erfolgreich/fehlgeschlagen
- Termin verbindlich bestätigt
- Erinnerung zum Beispiel sieben Tage, 48 Stunden und am Vortag
- Umbuchung, Absage oder Artist-Ausfall
- Pflegehinweise nach dem Termin
- Nachfrage nach verheilter Aufnahme nur mit passender Einwilligung

### 12.2 Kanäle

- In-App/chayns
- E-Mail
- Push, sofern verfügbar und eingewilligt
- SMS oder WhatsApp erst als späterer, vertraglich geprüfter Kanal

Transaktionale Terminnachrichten und Werbung müssen fachlich und einwilligungsseitig getrennt werden. Jede Nachricht wird am Projekt protokolliert, ohne sensible Inhalte unnötig in Betreff oder Push-Vorschau zu schreiben.

## 13. Fachliches Datenmodell

### 13.1 Kernobjekte

| Objekt | Wesentliche Inhalte |
|---|---|
| UserAccount | chayns Person-ID, Kontaktdatenreferenz, Status |
| CustomerProfile | Studio-Kundennummer, Präferenzen, Einwilligungen |
| Artist | Profil, Stile, Verfügbarkeit, Rollen |
| TattooProject | Kunde, Artist, Motivtyp, Status, Preisrahmen |
| Inquiry | strukturierte Anfrage und Antworten |
| MediaAsset | Referenz, Entwurf, Fortschritt, Sichtbarkeit, Einwilligung |
| ServiceType | Beratung, Session, Nachstechen, Flash usw. |
| Appointment | Start, Ende, Status, Artist, Ressource, Projekt |
| SlotHold | Slot, Ablaufzeit, Besitzer, Checkout-Referenz |
| Resource | Arbeitsplatz, Beratungsplatz, Ausstattung |
| Quote | Preisrahmen, Dauer, Deposit, Gültigkeit |
| Payment | Betrag, Typ, Status, Provider, Referenz |
| ShopOrder | chayns-Bestell-ID, Person-ID, Artikel, Terminbezug, Verarbeitungsstatus |
| PaymentEvent | Ereignis-ID, Bestell-ID, Typ, Payload-Hash, Empfangs- und Verarbeitungszeit |
| InvoiceReference | externe Beleg-/Kassenreferenz, kein Buchhaltungsersatz |
| Consent | Typ, Version, Zeitpunkt, Widerruf, Nachweis |
| HealthIntake | getrennt geschützte, nur erforderliche Angaben |
| Message | Kanal, Vorlage, Versandstatus, Projektbezug |
| AuditEvent | Akteur, Aktion, Zeitpunkt, Vorher/Nachher-Metadaten |

### 13.2 Wichtige Beziehungen

```text
Customer 1 ── n TattooProject 1 ── n Appointment
                         │              │
                         │              └── n Payment
                         ├── n Inquiry/Message
                         ├── n MediaAsset
                         └── n Consent

Artist 1 ── n TattooProject
Artist 1 ── n Appointment n ── 1 Resource
```

## 14. Technisches Zielbild auf chayns

### 14.1 Frontend

- React und TypeScript
- Projektanlage mit `create-chayns-app` als „A complete page“
- vollständige chayns Custom Page, API v5
- `ChaynsProvider` für chayns Kontext
- `PageProvider` aus `@chayns-components/core` für Theme und Layout
- mobile-first, responsive und als Bestandteil der chayns Site
- chayns History API für Wizard, Projekte und Detailansichten
- Produktions-Build mit `chayns-toolkit build`, Hosting im chayns Space oder auf einem externen HTTPS-Host
- Einbindung in der chayns-Administration als „External website“
- Vitest und Testing Library

### 14.2 Relevante chayns-Funktionen

- `useUser` und `login` für den persönlichen Bereich
- `useAccessToken` für authentifizierte Backend-Aufrufe
- `useSite` für Site-Farbe, Schrift und Identität
- `useEnvironment` und Geräteinformationen für eingebettete Nutzung
- Dialoge für bestätigungspflichtige Kurzinteraktionen
- Datei-/Galerie-Komponenten für Referenzen
- Floating Button optional für die primäre Aktion
- sichere serverseitige Buchungsfunktionen über die eigene Booking API; chayns.Codes für Shop- und Plattformintegration

Offizielle Grundlagen: [chayns für Entwickler](https://chayns.site/api), [chayns-api](https://tobitsoftware.github.io/chayns-api/api/), [chayns-components](https://github.com/TobitSoftware/chayns-components).

### 14.3 Verifizierte Möglichkeiten und Grenzen von chayns.Codes

Die offizielle chayns.Codes-API stellt für einen Backend-Workflow wesentliche Bausteine bereit:

- HTTPS-Trigger als Schnittstelle für Frontend oder Fremdsysteme
- MQTT-Trigger, unter anderem für Shop-Bestellereignisse
- zeitgesteuerte Trigger sowie `codes.executeFunction` mit einem zukünftigen Ausführungszeitpunkt
- persistenter Key-Value-Speicher mit `storage.get`, `storage.set`, `storage.remove` und `storage.query`
- Lese-, Schreib- und Löschzugriff auf Dateien im chayns Space
- serverseitige Shop-Funktionen wie `shop.admin.order.create`
- Nachrichten- und weitere chayns-Plattformfunktionen

Damit ließen sich Verfügbarkeiten, Holds, Erinnerungen und Statuswechsel grundsätzlich in Codes programmieren. Im API-Schema existiert jedoch keine eigene Termin-, Kalender- oder Ressourcenfunktion.

Für eine verbindliche Direktbuchung reicht der dokumentierte Key-Value-Speicher allein nicht als belastbare Datenbankgrundlage. Öffentlich dokumentiert sind insbesondere keine:

- Transaktionen über mehrere Datensätze,
- atomaren „nur setzen, wenn noch frei“-Operationen,
- Compare-and-Swap- oder Lock-Funktionen,
- Unique-/Exclusion-Constraints gegen Zeitüberschneidungen,
- relationalen Fremdschlüssel und Schema-Migrationen,
- zugesicherten Index-, Backup- und Wiederherstellungsmechanismen für diesen Anwendungsfall.

Ein Codes-only-Backend ist deshalb für einen Prototyp, für interne Terminpflege oder für ausschließlich manuell und nacheinander freigegebene Angebote vertretbar. Für produktive Slot-Holds und Direktbuchungen wäre es erst dann ausreichend, wenn Tobit eine atomare Reservierungsoperation beziehungsweise ein garantiert serielles Ausführungsmodell schriftlich bestätigt.

### 14.4 Backendentscheidung

Für das produktive System wird eine **Hybridarchitektur mit eigenem Buchungskern** festgelegt:

| Kriterium | Nur chayns.Codes | Eigener Buchungskern + Codes |
|---|---|---|
| HTTP-, MQTT- und Zeit-Trigger | geeignet | Codes übernimmt diese Plattformintegration |
| Persistente einfache Zustände | über Key-Value-Speicher möglich | PostgreSQL übernimmt den Geschäftszustand |
| Eigene Kalenderlogik | muss selbst programmiert werden | muss ebenfalls selbst programmiert werden |
| Atomarer Schutz gegen Doppelbuchung | öffentlich nicht dokumentiert | durch Transaktionen und Datenbank-Constraints gewährleistet |
| Relationen, Historie und komplexe Abfragen | nur mit eigener Konvention | nativ im relationalen Modell |
| Empfehlung | Prototyp/manuelle Freigabe | produktives MVP und Ausbau |

```text
React-Custom-Page in chayns
        │
        ├── chayns React API: Login, Person-, Site- und Designkontext
        │
        ├── eigene Booking API
        │       ├── PostgreSQL als verbindliche Datenquelle
        │       ├── Kalender- und Konfliktlogik
        │       ├── Slot-Holds und Ablaufzeiten
        │       ├── Projekte, Termine und Berechtigungen
        │       ├── Payment-Zuordnung und Audit-Log
        │       └── Worker/Outbox für zuverlässige Folgeaktionen
        │
        └── chayns.Codes als Plattform-Adapter
                ├── shop.admin.order.create
                ├── Weiterleitung zum chayns-Warenkorb
                ├── MQTT-Ereignis nach Shop-Bestellung
                ├── chayns-Nachrichten
                └── optionale Zeit- und Ausgleichsjobs
```

Die Booking API ist die einzige verbindliche Quelle für Rechte, Verfügbarkeit, Holds, Projekte, Termine, Zahlungszuordnung und Audit-Ereignisse. chayns.Codes enthält möglichst wenig eigenen Geschäftszustand und verarbeitet alle Shop-Ereignisse idempotent.

### 14.5 Umsetzung des eigenen Buchungskerns

Empfohlener technologieoffener Referenzaufbau:

- TypeScript-Backend als eigenständige HTTP-API
- PostgreSQL für transaktionale und relationale Daten
- versionierte Datenbankmigrationen
- privater Objektspeicher für Referenz- und Verlaufsbilder; keine sensiblen Uploads in öffentlich erreichbaren Build-Verzeichnissen
- Hintergrundprozess beziehungsweise Job-Queue für abgelaufene Holds, Erinnerungen und Wiederholungen
- Outbox-Muster für zuverlässige Übergänge zwischen Datenbank, Codes und Shop
- strukturierte Logs, Monitoring, verschlüsselte Backups und getestete Wiederherstellung
- getrennte Entwicklungs-, Test- und Produktionsumgebungen

Zentrale Tabellen beziehungsweise Aggregate:

| Bereich | Tabellen/Objekte |
|---|---|
| Identität | `customers`, `artists`, `roles`, `user_role_assignments` |
| Studio | `resources`, `service_types`, `availability_rules`, `blocked_periods` |
| Tattoo-Prozess | `inquiries`, `tattoo_projects`, `quotes`, `media_assets`, `consents` |
| Kalender | `appointment_blocks`, `appointments`, `slot_holds` |
| Zahlung | `payments`, `shop_orders`, `payment_events` |
| Betrieb | `outbox_events`, `notification_jobs`, `audit_events` |

Die Datenbank schützt die wichtigste Invariante selbst. Für Artist und Arbeitsplatz werden Überschneidungen der blockierenden Status durch PostgreSQL-Range- und Exclusion-Constraints verhindert. Die API behandelt einen Konflikt als HTTP `409 Conflict` und schlägt neue Slots vor. Ein Idempotency-Key schützt `POST /slot-holds`, `POST /checkout` und eingehende Shop-Ereignisse vor Doppelverarbeitung.

Benötigte API-Oberfläche für das MVP:

| Methode | Route | Zweck |
|---|---|---|
| `GET` | `/availability` | freie Zeiten aus Regeln, Sperren, Holds und Terminen berechnen |
| `POST` | `/slot-holds` | Slot atomar für einen Nutzer halten |
| `DELETE` | `/slot-holds/{id}` | Hold freigeben |
| `POST` | `/checkout` | erlaubten Deposit-Artikel bestimmen und Shop-Checkout anstoßen |
| `POST` | `/integrations/chayns/shop-events` | Shop-Ereignis idempotent übernehmen |
| `POST` | `/appointments/{id}/reschedule` | Umbuchung mit erneuter Konfliktprüfung |
| `POST` | `/appointments/{id}/cancel` | Termin stornieren; Zahlungsfolge getrennt ausführen |
| `GET` | `/me/projects` | berechtigte Kundenprojekte anzeigen |
| `GET/POST` | `/admin/...` | interne Pipeline, Kalender und Stammdaten verwalten |

### 14.6 Zahlungsintegration über den chayns Shop

Der chayns Shop ist für das MVP der primäre Zahlungsweg:

- Shop und feste Anzahlungsartikel werden vorab eingerichtet.
- Codes ruft `shop.admin.order.create` nur mit serverseitig ermitteltem `shopId`, `personId`, Artikel und Menge auf.
- Die zurückgegebene Bestell-ID wird im Buchungskern eindeutig gespeichert.
- Die Shop-Page wird mit `initialOrderUid=<id>&show=cart` geöffnet.
- Die Bestellerzeugung bestätigt weder Zahlung noch Termin.
- Erst das Shop-Bestellereignis setzt den Payment-Datensatz nach Validierung auf `PAID`.
- Frontend-Rückkehr, URL-Parameter oder ein erfolgreicher Button-Klick gelten niemals als Zahlungsnachweis.
- Kartendaten werden zu keinem Zeitpunkt im eigenen System gespeichert.

Der technische Spike muss zusätzlich klären: Ereignis-Payload und Authentizitätsprüfung, Verhalten bei doppelten/verspäteten Ereignissen, Bestellabbruch, vollständige und teilweise Stornierung, Rückzahlung, Belegfluss sowie die Abbildung von Restzahlungen. `shop.statistics.orders.getById` kann Order, Person und Artikel zur Zuordnung abgleichen; das aktuell dokumentierte Rückgabeobjekt enthält jedoch keinen eindeutigen finalen Zahlungsstatus und ersetzt deshalb kein qualifiziertes Shop-Ereignis.

## 15. Datenschutz, Sicherheit und Compliance

### 15.1 Datenschutzprinzipien

- Datensparsamkeit und klare Zweckbindung
- getrennte Einwilligungen für Leistung, Gesundheitsangaben, Marketing und Veröffentlichung von Fotos
- keine vorangekreuzten Einwilligungen
- versionierte Datenschutz- und Einwilligungstexte
- Lösch- und Aufbewahrungskonzept pro Datenklasse
- verschlüsselte Übertragung und geschützter Speicher
- rollenbasierter Zugriff und Protokollierung
- Export-, Berichtigungs- und Löschprozesse
- Auftragsverarbeitungsverträge mit eingebundenen Dienstleistern

Gesundheitsangaben können besondere Kategorien personenbezogener Daten nach Artikel 9 DSGVO sein. Die BfDI weist für solche Daten auf die regelmäßig erforderliche ausdrückliche Einwilligung hin. Quellen: [DSGVO bei EUR-Lex](https://eur-lex.europa.eu/eli/reg/2016/679/oj/?locale=de), [BfDI: DSGVO/BDSG](https://www.bfdi.bund.de/SharedDocs/Downloads/DE/Broschueren/INFO1.pdf?__blob=publicationFile&v=61).

### 15.2 Schutzmaßnahmen

- kurzlebige Zugriffstokens
- serverseitige Autorisierung je Objekt
- Upload-Validierung, Größenlimits und Malware-Prüfung
- nicht öffentliche, zeitlich begrenzte Datei-URLs
- Rate Limits gegen Spam und automatisierte Buchungen
- idempotente Payment- und Booking-Endpunkte
- Audit-Log für Status, Termine, Rechte und Zahlungen
- Backups und dokumentierte Wiederherstellung
- getrennte Produktions-/Testdaten
- keine echten Gesundheits- oder Kundendaten in Testsystemen

### 15.3 Alters- und Einwilligungsprozess

Das Studio muss eine verbindliche Altersrichtlinie festlegen. Für ein risikoarmes MVP wird empfohlen, Online-Tattoo-Buchungen zunächst nur für Volljährige anzubieten. Falls Minderjährige akzeptiert werden, sind Vertretungs-, Identitäts- und Einwilligungsprozess rechtlich gesondert zu konzipieren. Minderjährige sind nach §§ 106–107 BGB grundsätzlich beschränkt geschäftsfähig und benötigen für nicht lediglich rechtlich vorteilhafte Erklärungen regelmäßig die Einwilligung der gesetzlichen Vertretung. Quelle: [§ 106 BGB](https://www.gesetze-im-internet.de/bgb/__106.html), [§ 107 BGB](https://www.gesetze-im-internet.de/bgb/__107.html).

### 15.4 Gesundheits- und Pflegeinformationen

Das BfR weist unter anderem auf Infektions- und Allergierisiken sowie besondere Risiken während Schwangerschaft und Stillzeit hin und empfiehlt Orientierung an DIN EN 17169. Die Anwendung darf keine Diagnose stellen. Sie soll informieren, bei Risikohinweisen eine manuelle Studioentscheidung erzwingen und bei Beschwerden zur medizinischen Abklärung auffordern. Quelle: [BfR: Fragen und Antworten zu Tätowiermitteln](https://www.bfr.bund.de/fragen-und-antworten/thema/fragen-und-antworten-zu-taetowiermitteln/).

## 16. UX-, Design- und Content-Leitbild

### 16.1 Charakter

- künstlerisch und hochwertig statt generischer Beauty-Salon
- dunkel oder kontrastreich, aber gut lesbar
- große authentische Arbeiten, keine beliebigen Stockfotos
- persönliche Sprache und sichtbare Handschrift der Artists
- klare, ruhige Formulare ohne unnötige Effekte
- transparente Status- und Zahlungsanzeigen

### 16.2 Mobile-first

Die primäre Nutzung wird auf dem Smartphone erwartet, häufig aus Instagram, WhatsApp oder einem QR-Code heraus. Daher:

- zentrale Aktionen im Daumenbereich
- Upload direkt aus Kamera/Fotomediathek
- große Touch-Ziele
- Wizard mit Fortschritt und Zwischenspeichern
- keine komplexen Tabellen im Kundenbereich
- Kalender mit gut verständlichen Zeitoptionen

### 16.3 Barrierefreiheit

- semantische Überschriften und Formularbeschriftungen
- vollständige Tastaturbedienung
- sichtbare Fokuszustände
- ausreichende Kontraste
- verständliche Fehlertexte mit Korrekturhinweis
- Alternativtexte für relevante Bilder
- Status nicht ausschließlich über Farbe
- Dialoge und Uploads mit Screenreader-Rückmeldung

## 17. Kennzahlen und Reporting

### 17.1 Operative Kennzahlen

- neue Anfragen pro Woche/Monat
- durchschnittliche Reaktionszeit
- Quote Anfrage → Angebot
- Quote Angebot → bezahlte Buchung
- durchschnittliche Zeit bis zur Anzahlung
- Auslastung je Artist und Termintyp
- freie Stunden und kurzfristige Lücken
- Umbuchungs-, Storno- und No-Show-Quote
- offene und überfällige Zahlungen
- Anteil mehrteiliger Projekte
- durchschnittlicher Umsatz je Sitzung und Artist

### 17.2 Datenschutzfreundliche Analyse

- Kennzahlen möglichst aggregiert
- kein Tracking sensibler Formularinhalte
- Marketing-Tracking nur nach erforderlicher Einwilligung
- betriebliche Transaktionsmessung von Werbeprofiling trennen
- definierte Aufbewahrung für Rohdaten und Berichte

## 18. MVP und Ausbaustufen

### Phase 0: Fachliche Klärung und Prototyp

- Workshop mit Studio und Artists
- finale Termintypen, Zeitmodelle und Preise
- Deposit-/Storno-Policy
- Alters- und Gesundheitsprozess
- Codes-/Shop-Spike mit `shop.admin.order.create`, Warenkorbweiterleitung und echtem Shop-Bestellereignis
- Test von Bestellabbruch, Doppelereignis, verspätetem Ereignis und Rückerstattung
- Paralleltest: Zwei gleichzeitige Requests auf denselben Slot; exakt einer muss erfolgreich sein
- technischer Grundaufbau der Booking API und PostgreSQL-Migrationen
- klickbarer mobiler Buchungsprototyp

### Phase 1: MVP

- Startseite, Artists, Portfolio, Ablauf, FAQ und Kontakt
- chayns Login
- strukturierte Tattoo-Anfrage mit Referenzuploads
- interne Anfrage-Pipeline
- Artist-/Ressourcenkalender aus der eigenen Booking API
- transaktionale Terminoptionen und Slot-Holds in PostgreSQL
- feste chayns-Shop-Anzahlungsartikel, Warenkorbweiterleitung und ereignisbasierte Bestätigung
- Kundenbereich mit Status, Termin und Zahlung
- Bestätigungen und Terminerinnerungen
- Restzahlungsstatus und einfache Finanzübersicht
- Rollen, Datenschutz, Audit-Log und Basisexport

### Phase 2: Studio-Komfort

- Mehrsitzungs-Projekte
- Warteliste und automatische Lückenangebote
- digitale Einwilligungs-/Aufklärungsunterlagen
- Nachsorge und Nachstechanfrage
- Flash-Katalog mit Reservierungsstatus
- Gutscheine
- erweiterte Kennzahlen

### Phase 3: Wachstum

- Guest-Artist-Management
- Walk-in-Queue
- POS-/Kassenintegration
- SMS/WhatsApp-Integration
- automatisierte Bewertungsanfrage
- mehrsprachige Inhalte
- Kampagnen mit sauberer Einwilligungstrennung

## 19. MVP-Abnahmekriterien

Das MVP ist fachlich erfolgreich, wenn:

1. Eine neue Kundin eine vollständige Anfrage mobil absenden kann.
2. Ein Artist die Anfrage prüfen, kalkulieren und terminieren kann.
3. Keine Doppelbuchung von Artist oder Arbeitsplatz möglich ist.
4. Ein Slot nach Ablauf eines Holds automatisch freigegeben wird.
5. Ein Termin erst nach bestätigter Anzahlung den Status „Bestätigt“ erhält.
6. Deposit und Restzahlung jederzeit nachvollziehbar verrechnet werden.
7. Kundinnen nur ihre eigenen Projekte und Dateien sehen.
8. Artists nur berechtigte Projekte bearbeiten können.
9. Storno, Umbuchung, Erstattung und Kulanz vollständig protokolliert sind.
10. Erinnerungen keine unnötigen sensiblen Daten enthalten.
11. Die Anwendung auf aktuellen Mobilgeräten, Desktop und in chayns funktioniert.
12. Kernabläufe per automatisiertem Test und Ende-zu-Ende-Test abgesichert sind.

## 20. Risiken und Gegenmaßnahmen

| Risiko | Auswirkung | Gegenmaßnahme |
|---|---|---|
| Unklare Deposit-/Stornoregel | Streit und Rückzahlungen | juristische Prüfung, klare Anzeige, Versionierung |
| Payment bestätigt, Termin nicht gebucht | Geld ohne Leistung/Slot | transaktionaler Workflow, Idempotenz, Ausgleichsjob |
| Doppelbuchung | Vertrauens- und Umsatzausfall | serverseitige Sperre und atomare Buchung |
| Codes-Key-Value-Speicher liefert keine dokumentierte Atomarität | parallele Requests können denselben Slot erhalten | PostgreSQL als verbindlicher Buchungskern; Codes nur als Adapter |
| Shop-Bestellung erzeugt, Checkout aber nicht abgeschlossen | Slot bleibt unnötig blockiert | befristeter Hold, Ablaufjob und Status `PAYMENT_PENDING` |
| Shop-Ereignis doppelt oder verspätet | doppelte Bestätigung oder inkonsistenter Status | eindeutige Event-/Order-ID, idempotenter Consumer und Ausgleichsjob |
| Zu starre Zeitslots | unbrauchbarer Kalender | Artist-Freigabe und variable Dauer |
| Zu viele Pflichtfelder | Abbruch der Anfrage | progressive Erfassung und Zwischenspeichern |
| Gesundheitsdaten im falschen Bereich | Datenschutzrisiko | getrennte Erhebung und Zugriffsklasse |
| Referenzbilder öffentlich/geleakt | Persönlichkeits-/Urheberrechtsrisiko | private Speicherung und kurzlebige URLs |
| Automatisierung wirkt unpersönlich | Markenverlust | persönliche Texte und manuelle Entscheidungspunkte |
| Shop-Artikel decken individuellen Deposit nicht ab | falscher oder unflexibler Anzahlungsbetrag | feste Deposit-Stufen im MVP; dynamische Artikel gesondert prüfen |
| Storno einer Bestellung erstattet Zahlung nicht automatisch | finanzieller und rechtlicher Fehler | Refund-Prozess vor Produktivbetrieb Ende-zu-Ende prüfen |
| Studio pflegt Verfügbarkeiten nicht | falsche Termine | einfache Sperrzeiten, Kalenderverantwortung, Warnungen |

## 21. Offene Entscheidungen für den nächsten Workshop

### Studio und Marke

- Wie lautet der endgültige Studio-/Markenname?
- Handelt es sich um ein bestehendes Studio oder eine Neugründung?
- Wie viele feste und Gast-Artists gibt es?
- Welche Stilrichtungen und Zielgruppen stehen im Mittelpunkt?
- Existieren Logo, Schriften, Farben und professionelle Bilder?

### Leistungen und Termine

- Welche Termintypen werden tatsächlich angeboten?
- Welche Mindestpreise, Stunden- und Tagessätze dürfen öffentlich erscheinen?
- Welche Zeitraster, Puffer und Vorlaufzeiten gelten je Artist?
- Welche Leistungen dürfen direkt gebucht werden?
- Muss jede individuelle Anfrage manuell freigegeben werden?
- Wie werden mehrteilige Projekte heute geplant?

### Zahlungen

- Fester oder prozentualer Deposit?
- Pro Termin oder pro Gesamtprojekt?
- Wann wird die Anzahlung verrechnet: nächste oder letzte Sitzung?
- Welche Zahlungsarten werden benötigt?
- Welche Kasse/Buchhaltung wird aktuell verwendet?
- Wie laufen Rückerstattungen, Kulanz und Gutscheine?

### Regeln und Datenschutz

- Werden ausschließlich Volljährige tätowiert?
- Welche Gesundheitsangaben werden wann wirklich benötigt?
- Welche Dokumente müssen digital unterschrieben werden?
- Wie lange sollen Entwürfe, Referenzen und Verlaufsfotos gespeichert werden?
- Dürfen Arbeitsfotos separat für Portfolio/Social Media freigegeben werden?
- Wer darf intern welche Informationen sehen?

### Betrieb

- Ist eine bestehende chayns Site vorhanden?
- Wo werden Booking API, PostgreSQL und privater Dateispeicher betrieben?
- Welche Anforderungen gelten für Verfügbarkeit, Backup, Wiederherstellungszeit und Datenstandort?
- Wer administriert Inhalte, Artists, Kalender und Zahlungen?
- Welche externen Kalender oder Kommunikationskanäle müssen integriert werden?

## 22. Empfohlene nächste Schritte

1. Offene Fragen in einem 90-minütigen Studio-Workshop entscheiden.
2. Zahlungs-, Storno- und Minderjährigenpolicy rechtlich prüfen lassen.
3. Drei reale Tattoo-Fälle als Testfälle aufnehmen:
   - kleines direktes Tattoo,
   - individuelles Projekt mit Beratung,
   - mehrteiliges Großprojekt.
4. Mobilen Klickprototyp für Anfrage, Slot-Auswahl und Deposit erstellen.
5. Shop mit festen Deposit-Artikeln einrichten und den vollständigen Checkout über `shop.admin.order.create` testen.
6. Codes-MQTT-Trigger für Shop-Bestellungen mit einem idempotenten Testempfänger verbinden.
7. Booking-API-Grundgerüst, PostgreSQL-Schema und atomaren Slot-Hold implementieren.
8. Parallel-, Ablauf- und Wiederholungstests automatisieren.
9. Rückerstattung, Restzahlung und Belegfluss mit realen Testbestellungen validieren.
10. Danach Fachkonzept, Datenmodell und MVP-Backlog verbindlich freigeben.

## 23. Quellen und Referenzen

### chayns

- [Tobit.Software auf GitHub](https://github.com/tobitsoftware)
- [create-chayns-app](https://github.com/TobitSoftware/create-chayns-app)
- [chayns-api Dokumentation](https://tobitsoftware.github.io/chayns-api/docs/)
- [chayns-api Referenz](https://tobitsoftware.github.io/chayns-api/api/)
- [chayns-components](https://github.com/TobitSoftware/chayns-components)
- [chayns für Entwickler](https://chayns.site/api)
- [Dokumentationsübersicht](https://chayns.site/dokumentationen)
- [chayns.codes API](https://chayns.site/chaynscodes-api-dokumentation)
- [chayns.Codes Backend, Trigger und HTTP-API](https://chayns.site/chayns-codes-backend)
- [chayns-js Wiki: Pagemaker-Iframes](https://github.com/TobitSoftware/chayns-js/wiki/Pagemaker-Iframes)

### Branchen- und Prozessbeispiele

- [Tattivo](https://tattivo.app/)
- [Tattoo Booking](https://tattoobooking.co/)
- [Adapt Tattoo Studio Software](https://www.adapt-pos.com/tattoo.html)
- [Xclusive Ink Anfrageformular](https://xclusive-ink.de/termin-buchen/)
- [Nadel & Kunst AGB/Ablauf](https://nadelkunst.art/documents/agb_nadelkunst_tattoo.pdf)

### Recht, Datenschutz und Gesundheit

- [DSGVO – EUR-Lex](https://eur-lex.europa.eu/eli/reg/2016/679/oj/?locale=de)
- [BfDI: DSGVO/BDSG](https://www.bfdi.bund.de/SharedDocs/Downloads/DE/Broschueren/INFO1.pdf?__blob=publicationFile&v=61)
- [§ 106 BGB](https://www.gesetze-im-internet.de/bgb/__106.html)
- [§ 107 BGB](https://www.gesetze-im-internet.de/bgb/__107.html)
- [BfR: Tätowiermittel und Gesundheitsrisiken](https://www.bfr.bund.de/fragen-und-antworten/thema/fragen-und-antworten-zu-taetowiermitteln/)
- [Verbraucherzentrale: Voraussetzungen von Ausfallhonoraren](https://www.verbraucherzentrale.de/wissen/gesundheit-pflege/aerztinnen-und-kliniken/gebuehr-fuer-verpassten-arzttermin-ist-das-zulaessig-13939)

---

Dieses Dokument beschreibt eine Produkt- und Architekturhypothese. Geldbeträge, Fristen, Gesundheitsfragen, Einwilligungen und Rechtsfolgen sind erst nach Freigabe durch das Studio und geeignete fachliche beziehungsweise rechtliche Prüfung verbindlich.
