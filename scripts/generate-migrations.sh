#!/bin/bash
set -e

MIGRATION_NAME=$1

if [ -z "$MIGRATION_NAME" ]; then
  echo "Bitte gib einen Namen für die Migration ein (z. B. 'add_user_table'):"
  read MIGRATION_NAME
fi

if [ -z "$MIGRATION_NAME" ]; then
  echo "Fehler: Migrationsname darf nicht leer sein."
  return 1 2>/dev/null || true
fi

echo "======================================"
echo "1. Generiere SQLite Migration..."
echo "======================================"
npx prisma migrate dev --name "$MIGRATION_NAME"

echo "======================================"
echo "2. Generiere PostgreSQL Migration..."
echo "======================================"
# We use the migrate diff command to avoid needing a running postgres database
# during schema modifications since Docker in Docker might fail on some hosts
MIGRATION_DIR="prisma/postgres/migrations/$(date +'%Y%m%d%H%M%S')_${MIGRATION_NAME}"
mkdir -p "$MIGRATION_DIR"
npx prisma migrate diff \
  --from-schema-datamodel prisma/schema.prisma \
  --to-schema-datamodel prisma/postgres/schema.prisma \
  --script > "$MIGRATION_DIR/migration.sql"

if [ ! -s "$MIGRATION_DIR/migration.sql" ]; then
  echo "-- No changes detected" > "$MIGRATION_DIR/migration.sql"
fi

echo "Migration für PostgreSQL generiert in $MIGRATION_DIR"

echo "======================================"
echo "Migrationen für beide Datenbanken abgeschlossen!"
echo "======================================"
