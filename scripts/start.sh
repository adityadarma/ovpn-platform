#!/usr/bin/env bash
# OVPN Platform — Quick Start Script
# Usage: ./scripts/start.sh [dev|prod|docker]
set -e

MODE=${1:-dev}
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "🔷 OVPN VPN Management Platform"
echo "================================"

check_env() {
  if [ ! -f ".env" ]; then
    echo "📋 Creating .env from .env.example..."
    cp .env.example .env
    echo "⚠️  Please review .env and set your JWT_SECRET before production use."
  fi
}

run_migrations() {
  echo "🗄️  Running database migrations..."
  pnpm db:migrate
  echo "🌱 Seeding default data..."
  pnpm db:seed
}

case "$MODE" in
  dev)
    echo "🚀 Starting development servers..."
    check_env
    pnpm install
    run_migrations
    echo ""
    echo "   Web UI:   http://localhost:3000"
    echo "   API:      http://localhost:3001"
    echo "   API Docs: http://localhost:3001/docs"
    echo "   Login:    admin / Admin@1234!"
    echo ""
    pnpm dev
    ;;

  prod)
    echo "🏗️  Building for production..."
    check_env
    pnpm install
    pnpm build
    run_migrations
    echo "✅ Build complete. Start with: pnpm start"
    ;;

  docker)
    echo "🐳 Starting with Docker Compose..."
    check_env
    docker compose up -d
    echo "⏳ Waiting for services to be ready..."
    sleep 5
    docker compose exec api sh -c "pnpm db:migrate && pnpm db:seed" 2>/dev/null || true
    echo ""
    echo "   Web UI:   http://localhost:3000"
    echo "   API:      http://localhost:3001"
    echo "   Login:    admin / Admin@1234!"
    echo ""
    ;;

  docker-dev)
    echo "🐳 Starting Docker development environment..."
    docker compose -f docker-compose.dev.yml up
    ;;

  *)
    echo "Usage: $0 [dev|prod|docker|docker-dev]"
    exit 1
    ;;
esac
