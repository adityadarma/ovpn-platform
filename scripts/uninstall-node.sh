#!/bin/bash
# ============================================================
# VPN Manager - Uninstaller
# ============================================================
# Removes OpenVPN + Agent completely
#
# Usage:
#   sudo bash uninstall.sh
# ============================================================

set -e

R='\033[0;31m'; G='\033[0;32m'; Y='\033[1;33m'; NC='\033[0m'
err() { echo -e "${R}✗ $1${NC}"; }
ok() { echo -e "${G}✓ $1${NC}"; }
warn() { echo -e "${Y}⚠ $1${NC}"; }

[ "$EUID" -ne 0 ] && { err "Must run as root"; exit 1; }

echo -e "${Y}============================================================"
echo "  VPN Manager - Uninstaller"
echo "============================================================${NC}"
echo ""
warn "This will remove OpenVPN, Agent, and all certificates!"
echo ""
read -p "Continue? [y/N]: " confirm
[[ "$confirm" != "y" && "$confirm" != "Y" ]] && { echo "Aborted."; exit 0; }

# Detect OS
[ -f /etc/os-release ] && . /etc/os-release || OS="unknown"

echo ""
echo "Stopping services..."

# Stop agent
if [ -d "/opt/vpn-agent" ]; then
    cd /opt/vpn-agent
    docker compose down 2>/dev/null || true
    ok "Agent stopped"
fi

# Stop OpenVPN
systemctl stop openvpn-server@server.service 2>/dev/null || true
systemctl stop openvpn@server.service 2>/dev/null || true
systemctl disable openvpn-server@server.service 2>/dev/null || true
systemctl disable openvpn@server.service 2>/dev/null || true
ok "OpenVPN stopped"

# Stop iptables service
systemctl stop openvpn-iptables.service 2>/dev/null || true
systemctl disable openvpn-iptables.service 2>/dev/null || true
rm -f /etc/systemd/system/openvpn-iptables.service
systemctl daemon-reload
ok "NAT rules removed"

echo ""
echo "Removing packages..."

if [[ "$OS" =~ ^(ubuntu|debian)$ ]]; then
    apt-get purge -y openvpn easy-rsa 2>/dev/null || true
    apt-get autoremove -y 2>/dev/null || true
elif [[ "$OS" =~ ^(centos|rhel|fedora|rocky|almalinux)$ ]]; then
    yum remove -y openvpn easy-rsa 2>/dev/null || true
fi

ok "Packages removed"

echo ""
echo "Cleaning up files..."

rm -rf /etc/openvpn
rm -rf /var/log/openvpn*
rm -rf /opt/vpn-agent
rm -f /usr/local/bin/vpn-connect
rm -f /usr/local/bin/vpn-disconnect

ok "Files removed"

echo ""
echo "Reverting network config..."

sed -i '/net.ipv4.ip_forward=1/d' /etc/sysctl.conf 2>/dev/null || true
sysctl -p >/dev/null 2>&1 || true

ok "Network config reverted"

echo ""
echo -e "${G}============================================================"
echo "  Uninstall Complete"
echo "============================================================${NC}"
echo ""
echo "VPN Manager has been completely removed."
echo ""
