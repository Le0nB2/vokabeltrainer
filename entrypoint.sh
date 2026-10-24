#!/bin/sh
set -e

echo "Syncing prisma schema and migrations..."
if [ -d "/app/prisma_static" ]; then
  cp -r /app/prisma_static/schema.prisma /app/prisma/ 2>/dev/null || true
  if [ -d "/app/prisma_static/migrations" ]; then
    mkdir -p /app/prisma/migrations
    cp -r /app/prisma_static/migrations/* /app/prisma/migrations/ 2>/dev/null || true
  fi
fi

# Fallback: Falls DIRECT_URL nicht gesetzt ist oder dem Build-Default entspricht,
# leite DIRECT_URL von DATABASE_URL ab (entfernt -pooler. für direkte Verbindung bei Neon/PgBouncer)
DEFAULT_BUILD_DIRECT_URL="postgresql://postgres:postgres@localhost:5432/vokabeltrainer?schema=public"
if [ -z "$DIRECT_URL" ] || [ "$DIRECT_URL" = "$DEFAULT_BUILD_DIRECT_URL" ]; then
  if [ -n "$DATABASE_URL" ]; then
    export DIRECT_URL=$(echo "$DATABASE_URL" | sed 's/-pooler\././')
  fi
fi

# Falls PostgreSQL verwendet wird: Wecke schlafende Serverless-Instanzen (z. B. Neon) auf
# und beende verwaiste, blockierende Advisory Locks (72707369) von abgestürzten Sessions
TARGET_MIGRATE_URL="${DIRECT_URL:-$DATABASE_URL}"
clear_advisory_locks() {
  if echo "$TARGET_MIGRATE_URL" | grep -q "^postgres"; then
    echo "Clearing stale migration advisory locks..."
    echo "SELECT pg_terminate_backend(pid) FROM pg_locks WHERE (objid = 72707369 OR classid = 72707369) AND pid != pg_backend_pid();" | \
      timeout -k 5 30 npx prisma db execute --stdin --url="$TARGET_MIGRATE_URL" 2>/dev/null || true
  fi
}

if echo "$TARGET_MIGRATE_URL" | grep -q "^postgres"; then
  echo "Warming up PostgreSQL database and checking for stale locks..."
  clear_advisory_locks
fi

echo "Running prisma migrations..."
MAX_RETRIES=5
RETRY_DELAY=5
COUNT=1
MIGRATE_TIMEOUT=45

while [ $COUNT -le $MAX_RETRIES ]; do
  echo "Prisma migration attempt $COUNT of $MAX_RETRIES (Timeout: ${MIGRATE_TIMEOUT}s)..."
  if timeout -k 5 $MIGRATE_TIMEOUT npx prisma migrate deploy; then
    echo "Prisma migrations applied successfully."
    break
  else
    EXIT_CODE=$?
    if [ $EXIT_CODE -eq 124 ] || [ $EXIT_CODE -eq 137 ] || [ $EXIT_CODE -eq 143 ]; then
      echo "Prisma migration timed out after ${MIGRATE_TIMEOUT}s on attempt $COUNT."
    else
      echo "Prisma migration failed with exit code $EXIT_CODE on attempt $COUNT."
    fi
    if [ $COUNT -eq $MAX_RETRIES ]; then
      echo "Prisma migrations failed after $MAX_RETRIES attempts. Exiting."
      exit 1
    fi
    echo "Waiting ${RETRY_DELAY}s before retrying (waiting for database wake-up / lock release)..."
    clear_advisory_locks
    sleep $RETRY_DELAY
    COUNT=$((COUNT + 1))
  fi
done

echo "Starting Next.js..."
exec node server.js
