#!/bin/bash

# Exit on error
set -e

echo "=========================================="
echo "    Building OVPN Platform Docker Images  "
echo "=========================================="

# Build Manager API
echo "→ Building API Image (ovpn-platform:api)..."
docker build -t ovpn-platform:api -f apps/api/Dockerfile .

# Build Web Dashboard
echo "→ Building Web Image (ovpn-platform:web)..."
docker build -t ovpn-platform:web -f apps/web/Dockerfile .

# Build Node Agent
echo "→ Building Agent Image (ovpn-platform:agent)..."
docker build -t ovpn-platform:agent -f apps/agent/Dockerfile .

echo "=========================================="
echo "✅ All images built successfully!"
echo "You can now run 'docker compose up -d' without the --build flag."
echo "=========================================="
