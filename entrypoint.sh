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

echo "Running prisma migrations..."
npx prisma migrate deploy

echo "Starting Next.js..."
exec node server.js
