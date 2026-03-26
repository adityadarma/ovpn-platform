#!/bin/sh
set -e

echo "=========================================="
echo "    Running Database Migrations...        "
echo "=========================================="
tsx node_modules/@vpn/db/src/migrate.ts

echo "=========================================="
echo "    Running Database Seeders...           "
echo "=========================================="
tsx node_modules/@vpn/db/src/seed.ts

echo "=========================================="
echo "    Starting API Backend...               "
echo "=========================================="
exec node dist/index.js
