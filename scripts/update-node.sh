#!/bin/bash
# ============================================================
# VPN Manager - Update Script
# ============================================================
# Updates agent to latest version
#
# Usage:
#   sudo bash update.sh
# ============================================================

set -e

G='\033[0;32m'; Y='\033[1;33m'; B='\033[0;34m'; NC='\033[0m'
ok() { echo -e "${G}✓ $1${NC}"; }
info() { echo -e "${B}ℹ $1${NC}"; }

[ "$EUID" -ne 0 ] && { echo "Must run as root"; exit 1; }

INSTALL_DIR="/opt/vpn-agent"

[ ! -d "$INSTALL_DIR" ] && { echo "Agent not installed"; exit 1; }

cd "$INSTALL_DIR"

echo -e "${B}============================================================"
echo "  VPN Manager - Update"
echo "============================================================${NC}"
echo ""

info "Pulling latest image..."
docker compose pull

info "Restarting agent..."
docker compose up -d

sleep 3

info "Checking status..."
docker compose ps

echo ""
ok "Update complete!"
echo ""
echo "Check logs: docker logs vpn-agent"
echo ""
