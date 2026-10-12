#!/usr/bin/env bash
# exit on error
set -o errexit

echo "Render deployment detected. Swapping to PostgreSQL schema..."
rm -rf prisma/migrations prisma/schema.prisma
cp prisma/postgres/schema.prisma prisma/schema.prisma
cp -r prisma/postgres/migrations prisma/migrations

echo "Installing dependencies..."
npm install --legacy-peer-deps

echo "Generating Prisma client..."
npx prisma generate

echo "Building the app..."
npm run build

echo "Applying database migrations..."
npx prisma migrate deploy
