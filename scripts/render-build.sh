#!/usr/bin/env bash
# Exit on error
set -o errexit

echo "Running Render build script..."

if [ "$RENDER" = "true" ]; then
  echo "Render deployment detected. Swapping to PostgreSQL schema..."
  rm -rf prisma/migrations prisma/schema.prisma
  cp prisma/postgres/schema.prisma prisma/schema.prisma
  cp -r prisma/postgres/migrations prisma/migrations
fi

echo "Installing dependencies..."
npm ci

echo "Generating Prisma client..."
npx prisma generate

echo "Building the application..."
npm run build

echo "Running Prisma migrations..."
npx prisma migrate deploy
