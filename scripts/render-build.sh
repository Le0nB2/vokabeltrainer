#!/usr/bin/env bash
# Exit on error
set -o errexit

echo "Building for Render environment..."

# Switch Prisma schema to PostgreSQL
echo "Configuring Prisma for PostgreSQL..."
sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma
sed -i 's/url      = "file:.\/dev.db"/url      = env("DATABASE_URL")/' prisma/schema.prisma

# Install dependencies
echo "Installing dependencies..."
npm ci

# Generate Prisma client
echo "Generating Prisma client..."
npx prisma generate

# Apply database schema changes (db push is used because we don't have Postgres migrations setup)
echo "Applying database schema..."
npx prisma db push --accept-data-loss

# Build the Next.js application
echo "Building Next.js application..."
npm run build

echo "Build completed successfully!"
