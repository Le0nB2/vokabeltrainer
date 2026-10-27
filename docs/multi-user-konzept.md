# Multi-User-Konzept & Umsetzungsplan (Möglichkeit 1)

Dieses Dokument beschreibt das Architektur- und Umsetzungskonzept für den Umbau des Vokabeltrainers auf ein hybrides Mehrbenutzersystem (Möglichkeit 1: Eigene Decks und individueller Lernfortschritt pro Benutzer).

---

## 1. Zielsetzung & Architekturansatz

* **Hybrider Modus:**
  * Der 1. Nutzer (Super-Admin) wird weiterhin primär über die Render-Umgebungsvariablen (`AUTH_USER` und `AUTH_PASSWORD`) gesteuert.
  * In den Einstellungen (`/settings`, geschützt durch `SETTINGS_PASSWORD`) kann der Admin zusätzliche Benutzer anlegen, verwalten und löschen.
* **Datenisolation (Private Multi-Tenancy):**
  * Jeder Benutzer besitzt seine eigenen Decks und Karten.
  * Jeder Benutzer hat seinen eigenen individuellen Lernfortschritt (Spaced Repetition / Boxen / Fälligkeiten).
  * Bereits vorhandene Decks und Karten verbleiben beim Hauptnutzer (vollständige Abwärtskompatibilität ohne Datenverlust).
* **Sicherheit & Eltern-Administration:**
  * Das Einstellungspasswort (`SETTINGS_PASSWORD`) bleibt ein **globales Master-Passwort**. Eltern können sich damit auf jedem beliebigen Endgerät (z. B. Tablet des Kindes) direkt in den Administrationsbereich einloggen.
  * **Automatischer Logout beim Verlassen:** Sobald das Einstellungsmenü verlassen wird (Navigation zurück zur Übersicht, Klick auf Links, Seitenwechsel), wird die Settings-Session automatisch beendet (`logoutSettings`), sodass ein Kind nicht unbeaufsichtigt in den Einstellungen verbleiben kann.
  * Zusätzliche Benutzer werden mit gehashten Passwörtern (NIST-konformes `scrypt` via nativem `node:crypto`) in der Datenbank gespeichert.
  * Rate-Limiting gegen Brute-Force (bereits vorhanden) schützt alle Benutzer-Accounts.
  * IDOR-Schutz: Server Actions prüfen serverseitig die Besitzer-ID (`userId`) bei allen Lese- und Schreibzugriffen.

---

## 2. Geplante Meilensteine / Schritte

### Schritt 1: Datenbank-Schema & Migrationssicherheit
- Erweiterung von `prisma/schema.prisma` und `prisma/postgres/schema.prisma`:
  - Neues Model `User` (`id`, `username`, `passwordHash`, `role`, `createdAt`, `updatedAt`, `isActive`)
  - Optionales `userId` in `Deck` (mit Datenmigrationsschritt zur Zuweisung vorhandener Decks an den Admin)
  - Optionales `userId` in `Settings`
- Ausführung von `./scripts/generate-migrations.sh`
- Durchführung des Datenverlust-Sicherheitstests `./scripts/test-migration-safety.sh`

### Schritt 2: Passwort-Hashing & Hybride Authentifizierung
- Implementierung nativer Hashing- und Verifizierungsfunktionen (`scrypt`) in `src/lib/auth-utils.ts`
- Anpassung von `loginApp` in `src/actions/auth.ts`:
  1. Prüfung gegen Render-Env (`AUTH_USER` / `AUTH_PASSWORD`)
  2. Fallback: Prüfung gegen Datenbank (`prisma.user.findUnique({ where: { username } })`)
- Aktualisierung der Session-Logik zur Speicherung der `userId` und `role`

### Schritt 3: Mandantentrennung der Server Actions & API-Routen
- `src/actions/decks.ts`: Filterung nach `userId`, Berechtigungsprüfung bei Bearbeitung/Löschung
- `src/actions/cards.ts`: Autorisierungsprüfung über Deck-Zugehörigkeit
- `src/app/api/export`: Exportiert nur die Decks des jeweiligen angemeldeten Benutzers
- `src/app/api/notifications/due-count`: Nutzerbezogene Zählung fälliger Karten

### Schritt 4: Benutzerverwaltung in den Einstellungen (`/settings`)
- Neue React-Komponente `src/components/UserManagementSettings.tsx`:
  - Anzeige des Render-Hauptnutzers (gekennzeichnet als System-Admin)
  - Liste der in der Datenbank hinterlegten Benutzer
  - Formular zum Anlegen neuer Benutzer (Benutzername & Passwort)
  - Aktionen: Passwort zurücksetzen, Benutzer sperren/löschen
- Neue Server Actions für User-CRUD (`src/actions/users.ts`) mit strikter Admin-Prüfung

### Schritt 5: Testabdeckung & Docker-Verifikation
- Unit- und Integrationstests für Mehrbenutzer-Logins, Rechteprüfungen und Datenisolation
- Testlauf von `./test-docker.sh` und Wiederinbetriebnahme des Docker-Containers
