<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Docker Tests & Container-Betrieb
Whenever you make any modifications to the codebase (especially related to dependencies, build processes, or the Dockerfile), you **MUST** run the `test-docker.sh` script to verify that the Docker container builds successfully and the application starts up correctly without any errors.

Run the test with:
`./test-docker.sh`

### WICHTIG: Docker-Container nach jeder Anpassung wieder starten
Da das Testskript `test-docker.sh` den Container am Ende automatisch herunterfährt (`docker compose down`), **MUSS der Docker-Container am Ende JEDER Anpassung und jedes Durchlaufs zwingend wieder im Hintergrund gestartet werden**, damit die Anwendung für den Benutzer immer direkt verfügbar bleibt:
```bash
docker compose up -d --build
```
Verifiziere anschließend kurz per `docker ps` und `curl -I http://localhost:3001`, dass der Container läuft und HTTP 200 liefert.

## Database Migrations and Data Preservation
The project uses Prisma ORM with SQLite. When modifying the database schema (`prisma/schema.prisma`), you MUST adhere to the following rules to prevent accidental data loss:
1. **Never use `npx prisma db push`** for schema changes. Always use `npx prisma migrate dev --name <migration_name>` instead.
2. **Review Migration Warnings:** When running `prisma migrate dev`, pay close attention to the output. If Prisma warns about data loss (e.g., dropping a column, making an optional field required without a default, or dropping a table), you **MUST HALT**.
3. **User Escalation:** If a schema extension or change cannot be performed without losing the current learning progress (Decks, Cards, ReviewLogs) or other data, you must **inform the user immediately** before executing any commands that alter the database. Wait for the user's explicit confirmation or instructions on how to proceed (e.g., writing a custom data migration script or backing up data).
4. **Mandatory Data Loss Test:** Before confirming that a schema change is safe, you must run the data loss prevention test script: `./scripts/test-migration-safety.sh`. This script seeds the database with test data, applies pending migrations, and verifies that the data remains intact. If the test fails, you must abort the change and inform the user.

## Git-Branch-Konvention
Für neue Git-Branches sind vorzugsweise **deutsche Bezeichnungen** zu verwenden (z. B. `optimierung-ballon-pop`, `feature/foto-analyse-verfeinerung`, `fix/kleinere-bugfixe`).
