#!/bin/sh
set -e

# Change to the directory where this script lives (/app/api)
# This ensures node_modules/@vpn/db is resolved correctly
# regardless of the Docker WORKDIR setting.
cd "$(dirname "$0")"

echo "=========================================="
echo "    Running Database Migrations...        "
echo "=========================================="
tsx node_modules/@vpn/db/src/migrate.ts

echo "=========================================="
echo "    Running Database Seeders...           "
echo "=========================================="
tsx node_modules/@vpn/db/src/seed.ts

echo "=========================================="
echo "    Starting API + Web Server...          "
echo "=========================================="
exec node dist/index.js
