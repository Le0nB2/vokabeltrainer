# Englisch-Vokabeltrainer mit adaptivem Spaced Repetition (SRS) & Gemini AI

Eine moderne, lokal lauffähige Vokabeltrainer-Webanwendung, gebaut mit Next.js (App Router), TypeScript, Tailwind CSS, und Prisma (SQLite).


<div align="center">
  <img src="public/assets/screenshots/screenshot_1.webp" width="16%" />
  <img src="public/assets/screenshots/screenshot_2.webp" width="16%" />
  <img src="public/assets/screenshots/screenshot_3.webp" width="16%" />
  <img src="public/assets/screenshots/screenshot_4.webp" width="16%" />
  <img src="public/assets/screenshots/screenshot_5.webp" width="16%" />
  <img src="public/assets/screenshots/screenshot_6.webp" width="16%" />
</div>

## Features
- **Smarteres Spaced Repetition System (SRS):** Adaptives Lernsystem ähnlich zu SuperMemo. Dynamische Berechnung der Intervalle basierend auf dem 'Ease-Factor' der Karte und deiner Bewertung.
  - **Feine SRS-Abstufung**: Anstelle von nur "Gewusst" oder "Nicht gewusst" ermöglicht das System (wie bei FSRS) eine granularere Rückmeldung ("Erneut", "Schwer", "Gut", "Einfach"). So können Intervalle noch besser auf den individuellen Lernfortschritt abgestimmt werden. Das "Leech-Management" erkennt Problemkarten und zeigt gezielt hinterlegte Eselsbrücken an.
- **Globales Mischen (Interleaving)**: Ein spezieller "Tägliches Training" Modus (auf dem Dashboard verfügbar) erlaubt es, fällige Karten aus allen Decks gemischt abzufragen. Dies erfordert ein tieferes Abrufen der Vokabeln, da der Kontext (z.B. das Thema des Decks) nicht vorab bekannt ist.
- **Aktives Erinnern (Typing-Mode)**: In höheren Lernstufen (ab Stufe 3) wird nicht nur die Selbsteinschätzung abgefragt, sondern das Wort muss aktiv eingetippt werden. Ein integrierter Fuzzy-Matching-Algorithmus (Damerau-Levenshtein-Distanz) erkennt dabei leichte Tippfehler und gibt gezieltes Feedback (z.B. "Tippfehler beachtet").
- **Study Mode:** Ablenkungsfreier Lernmodus mit 3D-Karten-Flip und Tastatursteuerung.
- **Foto-Scan Import:** Lade ein Foto einer Vokabelliste hoch. Die Gemini Vision KI extrahiert die Vokabeln automatisch.
- **Manuelle Eingabe:** Direkt in der Web-Oberfläche.
- **CSV Import:** Schneller Massen-Import von Vokabeln via CSV-Datei.
  - **Pflichtfelder:** Die Spalten `front` (Vorderseite) und `back` (Rückseite) müssen zwingend ausgefüllt sein.
  - **Optionale Felder:** `notes`, `gapText` (oder `lückentext`), `mnemonic` (oder `eselsbrücke`) und `contextSentence` (oder `beispielsatz`).
  - **KI-Generierung:** Falls die Felder Lückentext (`gapText`), Eselsbrücke (`mnemonic`) und Beispielsatz (`contextSentence`) in der CSV nicht ausgefüllt sind, werden diese automatisch über die integrierte Google Gemini KI generiert!
  - [Hier findest du eine Beispiel-CSV](./public/assets/example.csv) zum Herunterladen oder Ansehen.
  - Beispiel Struktur:
    ```csv
    front,back,notes,gapText,mnemonic,contextSentence
    apple,Apfel,ein Obst,The ___ is red.,A for Apple,I ate an apple today.
    house,Haus,,,,
    car,Auto,,,,
    ```
- **Contextual Learning**: Beim Scannen oder Hinzufügen neuer Vokabeln generiert die integrierte KI-Anbindung nun vollautomatisch in einem Schritt sinnvolle Beispielsätze und einprägsame Eselsbrücken, um das Lernen im Kontext zu erleichtern.
- **Minigame-Pausensystem**: Im Lernmodus (Study-Mode) ist nun ein konfigurierbares Pausensystem integriert, das die Motivation aufrechterhält und Ermüdung entgegenwirkt. Nach einer bestimmten Anzahl gelernter Karten (Standard: 50-75) wird automatisch eines von vier Minispielen zur Auflockerung eingeblendet.

  Die Minispiele können in den **Einstellungen** konfiguriert werden:
  - **Speed-Match (Paare verbinden)**: Finde die passenden englischen und deutschen Vokabelpaare auf Zeit.
  - **Balloon Pop (Motorischer Reset)**: Zerplatze aufsteigende Ballons für eine kurze kognitive Pause.
  - **Reaktions-Tester (Reflex-Check)**: Klicke blitzschnell, sobald der Bildschirm grün wird.
  - **Wort-Regen (Word Drop)**: Fange die richtige fallende englische Vokabel passend zum deutschen Wort.

  Alle Minispiele sind responsiv und lassen sich nach Belieben in den Einstellungen aktivieren oder deaktivieren. Auch das Intervall (wie viele Karten zwischen Pausen gelernt werden sollen) ist dort frei wählbar. Ein "Überspringen"-Button erlaubt es zudem, Minispiele im Lernfluss jederzeit zu überspringen.

## Hosting in der Cloud (Render & Neon)

Du möchtest deinen Vokabeltrainer nicht lokal auf deinem eigenen PC laufen lassen, sondern ihn rund um die Uhr aus dem Internet erreichbar machen? Dank der automatischen **Render-Blueprint**-Konfiguration geht das mit minimalem Aufwand und völlig **kostenlos**.

Du benötigst dafür kostenlose Konten und nur wenige Minuten:
1. **Neon:** Kostenlose Cloud-Datenbank (PostgreSQL) für deine Vokabeln.
2. **Google Gemini:** Kostenloser KI-Schlüssel für Eselsbrücken, Beispielsätze und Korrekturen.
3. **Render:** Führt die App in der Cloud aus.

---

### Schritt 1: Datenbank bei Neon erstellen (1 Minute)
1. Gehe auf [neon.tech](https://neon.tech/) und registriere dich kostenlos (z. B. mit deinem GitHub-Konto).
2. Klicke auf **"New Project"**, gib dem Projekt einen Namen (z. B. `vokabeltrainer-db`, Region am besten `Frankfurt`) und klicke auf **"Create Project"**.
3. Klicke im Dashboard auf **"Connect"** und kopiere den angezeigten **Connection String** (fängt mit `postgresql://...` an).
   > **Tipp für Einsteiger:** Du musst bei Neon nichts weiter einstellen – die App erkennt den Connection String vollautomatisch und kümmert sich um alles Weitere!

---

### Schritt 2: Google Gemini API Key holen (1 Minute)
1. Besuche das [Google AI Studio](https://aistudio.google.com/) und melde dich mit deinem Google-Konto an.
2. Klicke im Menü links auf **"Get API key"** und dann auf **"Create API key"**.
3. Kopiere den erstellten Schlüssel.

*(Hinweis: Die Nutzung der Gemini API im Free Tier ist kostenlos und für den Vokabeltrainer völlig ausreichend).*

---

### Schritt 3: Mit 1-Klick auf Render deployen (Render Blueprint)

Klicke einfach auf den folgenden Button, um das automatische Deployment auf Render zu starten:

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Le0nB2/vokabeltrainer)

*(Alternativ auf [render.com](https://render.com/) einloggen, oben rechts auf **"New +"** $\rightarrow$ **"Blueprint"** klicken und das Repository `https://github.com/Le0nB2/vokabeltrainer` auswählen).*

Render liest automatisch die Projektkonfiguration (`render.yaml`) ein und fragt dich nach den folgenden Zugangsdaten, damit deine App direkt von Beginn an geschützt und voll einsatzbereit ist:

| Feld | Was du eintragen musst |
| :--- | :--- |
| **`DATABASE_URL`** | Der kopierte Connection String von Neon aus Schritt 1 |
| **`GEMINI_API_KEY`** | Dein Google Gemini API Key aus Schritt 2 |
| **`AUTH_USER`** | Dein gewünschter Benutzername für den Website-Login (Schutz vor Fremdzugriff) |
| **`AUTH_PASSWORD`** | Dein gewünschtes Passwort für den Website-Login |
| **`SETTINGS_PASSWORD`** | Ein Passwort zum Schutz des Einstellungsbereichs (z. B. für Eltern/Lehrkräfte) |

Klicke anschließend ganz unten auf **"Apply"** (bzw. **"Deploy"**).

Render richtet den Service, Docker und alle Sicherheitsschlüssel vollautomatisch ein. Nach ca. 5 Minuten siehst du den grünen Status **"Live"** und deine persönliche Web-Adresse (z. B. `https://vokabeltrainer-xxxx.onrender.com`). **Fertig!** Wenn du die Seite aufrufst, wirst du direkt durch die Login-Maske geschützt.

> **Hinweis zum Free-Tier bei Render:** Die kostenlose Instanz geht nach 15 Minuten Inaktivität in einen Ruhezustand („Scale-to-Zero“). Beim ersten Aufruf nach einer Pause dauert das Laden ca. 30–50 Sekunden, da Render den Container wieder hochfährt. Danach reagiert die App sofort.

## Lokales Setup (Docker)

Die App ist vollständig containerisiert und kann ohne lokale Node.js Installation ausgeführt werden.

### 1. Umgebungsvariablen konfigurieren
Erstelle eine `.env` Datei im Hauptverzeichnis (falls nicht vorhanden) und füge deinen Gemini API Key und den Passwortschutz (falls benötigt) ein:

```env
# Optional: Mehrere Schlüssel kommasepariert, falls das Limit oft erreicht wird
GEMINI_API_KEY="DEIN_GEMINI_API_KEY_HIER"
# Optional: Passwortschutz für die Einstellungen
SETTINGS_PASSWORD="DEIN_PASSWORT_HIER"
# Optional: Globaler Zugriffsschutz (Login-Seite mit Session-Cookie)
AUTH_USER="benutzername"
AUTH_PASSWORD="dein_sicheres_passwort"
# (Alternativ werden auch BASIC_AUTH_USER und BASIC_AUTH_PASSWORD weiterhin unterstützt)
```

Den **kostenlosen** API Key erhältst du im [Google AI Studio](https://aistudio.google.com/).
Gehe dazu wie folgt vor:
1. Besuche das [Google AI Studio](https://aistudio.google.com/) und melde dich mit deinem Google-Konto an.
2. Klicke im Menü links auf **"Get API key"**.
3. Klicke auf den Button **"Create API key"**.
4. Wähle ein bestehendes Google Cloud Projekt aus oder klicke auf **"Create API key in new project"**.
5. Kopiere den generierten Schlüssel und füge ihn in deine `.env` Datei bei `GEMINI_API_KEY` ein.

*Hinweis: Die Nutzung der Gemini API im Free Tier ist kostenlos und für den Vokabeltrainer völlig ausreichend.*

### 2. Starten
Starte die Container mit Docker Compose:
```bash
docker-compose up --build
```

Beim Start:
1. Baut das Next.js Standalone-Image.
2. Führt automatisch `prisma migrate deploy` aus, um das SQLite-Schema sicher zu migrieren.
3. Startet den Webserver auf Port 3000 (intern).

Die App ist nun unter [http://localhost:3001](http://localhost:3001) erreichbar.

## Tech-Stack
- Frontend & Backend: Next.js 16 (App Router, Server Actions)
- Styling: Tailwind CSS, Lucide Icons
- Datenbank: SQLite via Prisma ORM
- KI-Analyse: `@google/genai` (Gemini 3.5 Flash Lite Structured Output)

## Dienste und Versionen

Hier sind die zentralen Dienste, Container-Eigenschaften und Abhängigkeiten des Vokabeltrainer-Projekts aufgeführt.

### Docker Container

| Dienst | Image / Basis | Port (Host:Container) |
| :--- | :--- | :--- |
| **app** | `node:22-alpine` | `3001:3000` |

### Kerntechnologien & Frameworks

| Technologie | Version | Quelle |
| :--- | :--- | :--- |
| **Node.js** | 22-alpine | `Dockerfile` |
| **Next.js** | 16.4.2 | `package.json` |
| **React** | 19.3.1 | `package.json` |
| **React DOM** | 19.3.1 | `package.json` |

### Datenbank & ORM

| Technologie | Version | Beschreibung |
| :--- | :--- | :--- |
| **Prisma (CLI & Client)** | 6.19.3 | ORM für die Datenbankanbindung |
| **SQLite** | 3.x | Lokale, dateibasierte Datenbank (via Prisma `dev.db`) |

### Weitere wichtige Abhängigkeiten

| Paket | Version | Funktion / Bereich |
| :--- | :--- | :--- |
| **@google/genai** | 2.25.0 | KI-Services (z. B. Bildanalyse) |
| **Tailwind CSS** | 4.3.3 | Styling |
| **Lucide React** | 1.49.0 | UI-Icons |
| **Chart.js** | 4.5.1 | Diagramme und Visualisierungen |
| **react-chartjs-2** | 5.3.1 | React-Wrapper für Chart.js |
| **Zod** | 4.6.7 | Schema-Validierung |
| **Framer Motion** | 14.0.0 | Animationen |
| **@react-pdf/renderer** | 4.9.0 | PDF-Generierung für Arbeitsblätter |
| **pdf-lib** | 1.17.1 | PDF-Modifikationen |
| **PapaParse** | 5.7.0 | CSV-Import/Parsing |
| **date-fns** | 4.4.0 | Datumsberechnungen für SRS |

## Home Assistant Integration (Benachrichtigungen)

Die App verfügt über einen API-Endpunkt, um die Anzahl der aktuell fälligen Vokabeln abzufragen. Dies ermöglicht es, externe Systeme wie Home Assistant zu nutzen, um z.B. täglich um 16:00 Uhr eine Push-Benachrichtigung an dein Smartphone zu senden, falls Vokabeln fällig sind.

Damit der Endpunkt echte Daten liefert, muss in der Web-App unter **Einstellungen -> Benachrichtigungen** der Schalter **Tägliche Erinnerung aktivieren** eingeschaltet sein. Ist er aus, liefert die API immer `0` zurück.

### 1. REST Sensor (in `configuration.yaml`)
Erstellt einen Sensor, der die fälligen Vokabeln von der App abfragt. (Ersetze die IP mit der deines Docker-Hosts).

**Ohne App-Authentifizierung (Standard):**
```yaml
sensor:
  - platform: rest
    name: "Vokabeln faellig"
    resource: "http://192.168.1.xxx:3001/api/notifications/due-count"
    method: GET
    value_template: "{{ value_json.dueCount }}"
    unit_of_measurement: "Vokabeln"
```

**Mit geschütztem App-Login (`AUTH_USER` / `AUTH_PASSWORD`):**
Vergib in deiner `.env` oder `docker-compose.yml` das Token `NOTIFICATION_API_TOKEN=mein-geheimer-ha-token` und konfiguriere Home Assistant mit Authentifizierungs-Header:
```yaml
sensor:
  - platform: rest
    name: "Vokabeln faellig"
    resource: "http://192.168.1.xxx:3001/api/notifications/due-count"
    method: GET
    headers:
      Authorization: "Bearer mein-geheimer-ha-token"
    value_template: "{{ value_json.dueCount }}"
    unit_of_measurement: "Vokabeln"
```
*Alternativ als URL-Parameter:*
```yaml
    resource: "http://192.168.1.xxx:3001/api/notifications/due-count?token=mein-geheimer-ha-token"
```

### 2. Automatisierung (in `automations.yaml` oder via UI)
Sendet täglich um 16:00 Uhr eine Benachrichtigung, wenn mehr als 0 Vokabeln fällig sind.

```yaml
alias: Vokabeln Erinnerung 16 Uhr
triggers:
  - trigger: time
    at: '16:00:00'
conditions:
  - condition: not
    conditions:
      - condition: state
        entity_id: sensor.vokabeln_faellig
        state:
          - unavailable
          - unknown
  - condition: numeric_state
    entity_id: sensor.vokabeln_faellig
    above: 0
actions:
  - action: notify.mobile_app_dein_smartphone # Handynamen anpassen
    data:
      title: Vokabeltrainer
      message: >-
        Denk an Deine Vokabeln! Heute sind noch {{
        states('sensor.vokabeln_faellig') }} Vokabeln zu üben.
      data:
        url: http://192.168.1.xxx:3001/
  ```
