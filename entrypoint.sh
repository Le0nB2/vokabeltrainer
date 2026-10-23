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

echo "Running prisma migrations..."
MAX_RETRIES=5
RETRY_DELAY=5
COUNT=1

while [ $COUNT -le $MAX_RETRIES ]; do
  echo "Prisma migration attempt $COUNT of $MAX_RETRIES..."
  if npx prisma migrate deploy; then
    echo "Prisma migrations applied successfully."
    break
  else
    echo "Prisma migration failed on attempt $COUNT."
    if [ $COUNT -eq $MAX_RETRIES ]; then
      echo "Prisma migrations failed after $MAX_RETRIES attempts. Exiting."
      exit 1
    fi
    echo "Waiting ${RETRY_DELAY}s before retrying (waiting for database wake-up / lock release)..."
    sleep $RETRY_DELAY
    COUNT=$((COUNT + 1))
  fi
done

echo "Starting Next.js..."
exec node server.js
