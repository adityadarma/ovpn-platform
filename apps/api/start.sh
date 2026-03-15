#!/bin/sh
set -e

# Run database migrations before starting the API
echo "=========================================="
echo "    Running Database Migrations...        "
echo "=========================================="
cd /app/packages/db
npx tsx src/migrate.ts

echo "=========================================="
echo "    Starting API Backend...               "
echo "=========================================="
cd /app
exec tsx apps/api/src/index.ts
