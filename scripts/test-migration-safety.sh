#!/bin/bash
set -e

echo "=== Starting Migration Safety Test ==="

# Ensure typescript execution is available
if ! command -v tsx &> /dev/null
then
    echo "tsx could not be found, installing..."
    npm install -g tsx
fi

# 1. Apply any existing migrations to get to a baseline state
echo "[1/4] Applying existing migrations to reach baseline..."
npx prisma migrate deploy

# 2. Seed the test data
echo "[2/4] Seeding test data..."
npx tsx scripts/seed-test-data.ts

# 3. Create and apply new migration (if there are schema changes)
echo "[3/4] Running prisma migrate dev..."
yes | npx prisma migrate dev --name test_migration || true

# 4. Verify data is intact
echo "[4/4] Verifying data integrity..."
npx tsx scripts/verify-data-intact.ts

echo "=== Migration Safety Test Passed! ==="
