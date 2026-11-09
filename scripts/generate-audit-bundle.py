import os

prompt_header = """# Umfassendes Sicherheits- und Architektur-Audit: Vokabeltrainer WebApp
**Zielmodell:** Google Gemini 4 Argon
**Rolle:** Du agierst als Principal Application Security Architect und Lead Penetration Tester.

---

## 1. Systemübersicht & Kontext
Du prüfst den vollständigen sicherheitsrelevanten Quellcode einer modernen Bildungs-WebApp (Vokabeltrainer für Kinder und Familien).

### Technologie-Stack:
- **Framework:** Next.js 16 (App Router, Server Actions, Standalone-Build, Turbopack)
- **Frontend:** React 19, Tailwind CSS v4, Lucide Icons, Framer Motion
- **Datenbank & ORM:** Prisma ORM 6.x mit Dual-Backend:
  - Lokal / Self-Hosted: SQLite (Docker Volume mit Datei vokabel.db)
  - Cloud (Render): PostgreSQL (Neon Serverless Postgres via DIRECT_URL / DATABASE_URL)
- **Authentifizierung & Rollen:**
  - Rollenbasiert: Eltern (Admin) vs. Kinder (eingeschränkt, Lernmodus)
  - PIN-/Passwort-Schutz für Einstellungen und Account-Umschaltung
  - Session-Tokens via HttpOnly-Cookies
- **KI-Services:** Google Gemini (Standard), OpenAI / ChatGPT, OpenRouter für Vokabel-Anreicherung, automatisches Erstellen von Arbeitsblättern und Foto-Texterkennung (OCR).
- **Infrastruktur:** Docker Multi-Stage Container (node:22-alpine, Non-Root User nextjs:nodejs, entrypoint.sh).

---

## 2. Dein Prüfungsauftrag (Sicherheitsanalyse)

Analysiere die unten beigefügten 33 Quellcode-Dateien gründlich auf folgende Schwerpunkte:

1. **Autorisierung & IDOR (Insecure Direct Object Reference):**
   - Sind alle Next.js Server Actions (`src/actions/*`) und API-Routen (`src/app/api/*`) lückenlos durch `authGuard` geschützt?
   - Können Kind-Konten durch Manipulation der Parameter (z. B. `deckId`, `userId`, `cardId`) auf fremde Daten zugreifen oder Eltern-Einstellungen verändern?
   - Gibt es unautorisierte Pfade zur Rechteausweitung (Privilege Escalation)?

2. **Authentifizierung, Sessions & Cookie-Sicherheit:**
   - Sind die Session-Cookies mit `HttpOnly`, `SameSite=Lax/Strict` und dynamischem `Secure`-Flag (abhängig von HTTPS / lokaler IP) geschützt?
   - Ist der PIN- und Passwort-Schutz gegen Brute-Force-Angriffe (Rate-Limiting) gesichert?
   - Gibt es Timing-Attacks beim Passwort-/Token-Vergleich (`timingSafeEqual`)?

3. **Input-Validierung, Injection & Parsing:**
   - Gibt es Risiken für SSRF bei externen Fetch-Aufrufen (z. B. OCR-Bilder, KI-APIs)?
   - Ist der CSV- und JSON-Import (`src/lib/validations/import.ts`, `src/app/api/enrich-csv`) gegen DoS (Billion Laughs / ReDoS / Memory Exhaustion) geschützt?
   - Gibt es Prisma-/SQL-Injection-Schwachstellen (z. B. in dynamischen Filtern oder Raw Queries)?

4. **Kryptographie & Secrets-Handling:**
   - Werden sensible Daten (Passwörter, externe API-Keys für Gemini/OpenAI/OpenRouter) sicher verschlüsselt in der Datenbank gespeichert (`src/lib/security/crypto.ts`)?
   - Werden Secrets jemals unbeabsichtigt an Client-Komponenten geleakt?

5. **Concurrency, Race Conditions & State Invalidation:**
   - Gibt es Time-of-Check to Time-of-Use (TOCTOU) Lücken bei Datenbanktransaktionen?
   - Werden Session-Tokens bei Passwortänderungen oder Abmeldung zuverlässig invalidiert?

6. **Container & Deployment-Sicherheit:**
   - Läuft der Container strikt als unprivilegierter Non-Root-User (`nextjs`)?
   - Gibt es Risiken in `entrypoint.sh`, `Dockerfile` oder `docker-compose.yml`?

---

## 3. Gewünschte Struktur des Audit-Berichts

1. **Executive Summary:** Gesamtbewertung des Sicherheitsniveaus (A+ bis F) und Kern-Erkenntnisse.
2. **Schwachstellen-Katalog (priorisiert nach CVSS / Schweregrad):**
   - **Kritisch (Critical)** / **Hoch (High)** / **Mittel (Medium)** / **Niedrig (Low)** / **Empfehlungen (Informational)**
   - Jede Schwachstelle muss enthalten:
     - Dateiname und Zeilenbereich
     - Detaillierte Problembeschreibung & Angriffsvektor (wie könnte ein Angreifer das ausnutzen?)
     - Konkreter, sofort anwendbarer Code-Patch (Lösung)
3. **Architektonische Best Practices & Härtungsempfehlungen:**
   - 3–5 strategische Verbesserungen für zukünftige Releases.

---

# BUNDLE-QUELLCODE (33 Dateien)
"""

target_files = [
    'package.json',
    'Dockerfile',
    'docker-compose.yml',
    'entrypoint.sh',
    'next.config.ts',
    'prisma/schema.prisma',
    'prisma/postgres/schema.prisma',
    'src/proxy.ts',
    'src/lib/auth-guard.ts',
    'src/lib/auth-utils.ts',
    'src/lib/rate-limit.ts',
    'src/lib/prisma.ts',
    'src/lib/security/crypto.ts',
    'src/lib/validations/import.ts',
    'src/lib/ai/ai-router.ts',
    'src/actions/auth.ts',
    'src/actions/users.ts',
    'src/actions/settings.ts',
    'src/actions/decks.ts',
    'src/actions/cards.ts',
    'src/actions/setup.ts',
    'src/actions/setup-database.ts',
    'src/actions/ai-credentials.ts',
    'src/actions/api-stats.ts',
    'src/app/api/export/route.ts',
    'src/app/api/worksheet/route.ts',
    'src/app/api/scan-image/route.ts',
    'src/app/api/enrich-csv/route.ts',
    'src/components/LoginForm.tsx',
    'src/components/PasswordPrompt.tsx',
    'src/components/SetupWizard.tsx',
    'src/components/UserManagementSettings.tsx',
    'src/components/ImportExport.tsx'
]

output_path = '/home/bbuch/vokabel-trainer-docker/vokabeltrainer/gemini-argon-audit-bundle.md'

with open(output_path, 'w', encoding='utf-8') as out:
    out.write(prompt_header)
    for fpath in target_files:
        ext = os.path.splitext(fpath)[1].replace('.', '')
        if ext in ['ts', 'tsx']:
            lang = 'typescript'
        elif ext in ['prisma']:
            lang = 'prisma'
        elif ext in ['json']:
            lang = 'json'
        elif ext in ['sh']:
            lang = 'bash'
        elif ext in ['yml', 'yaml']:
            lang = 'yaml'
        else:
            lang = 'text'
        
        out.write(f'\n\n## DATEI: `{fpath}`\n\n```{lang}\n')
        with open(fpath, 'r', encoding='utf-8', errors='ignore') as src:
            out.write(src.read().strip())
        out.write('\n```\n')

print(f'Successfully generated {output_path} ({os.path.getsize(output_path)} bytes)')
