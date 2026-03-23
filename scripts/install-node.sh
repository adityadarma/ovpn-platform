#!/bin/bash
# ============================================================
# VPN Manager - All-in-One Installer
# ============================================================
# Installs OpenVPN + Agent in one go
#
# Usage:
#   Method 1 (Recommended - Download first):
#     curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/scripts/install-node.sh -o install-node.sh
#     chmod +x install-node.sh
#     sudo AGENT_MANAGER_URL=https://api.example.com VPN_TOKEN=xxx REG_KEY=yyy ./install-node.sh
#
#   Method 2 (Direct pipe - requires sudo -E):
#     AGENT_MANAGER_URL=https://api.example.com VPN_TOKEN=xxx REG_KEY=yyy \
#       curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/scripts/install-node.sh | sudo -E bash
#
# Environment Variables (for automation):
#   AGENT_MANAGER_URL or MANAGER_URL - Manager API URL (required)
#   VPN_TOKEN      - VPN authentication token (required)
#   REG_KEY        - Registration key (optional, for auto-register)
#   NODE_ID        - Node ID (optional, for manual register)
#   SECRET_TOKEN   - Secret token (optional, for manual register)
# ============================================================

set -e

# Colors
R='\033[0;31m'; G='\033[0;32m'; Y='\033[1;33m'; B='\033[0;34m'; NC='\033[0m'

err() { echo -e "${R}✗ $1${NC}" >&2; }
ok() { echo -e "${G}✓ $1${NC}"; }
warn() { echo -e "${Y}⚠ $1${NC}"; }
info() { echo -e "${B}ℹ $1${NC}"; }

# Check root
[ "$EUID" -ne 0 ] && { err "Must run as root"; exit 1; }

# Detect OS
[ -f /etc/os-release ] && . /etc/os-release || { err "Cannot detect OS"; exit 1; }
OS=$ID

# Detect network interface
IF=$(ip -4 route ls | grep default | grep -Po '(?<=dev )(\S+)' | head -1)
IF=${IF:-eth0}
IP=$(curl -s ifconfig.me 2>/dev/null || echo "YOUR_IP")

echo -e "${B}============================================================"
echo "  VPN Manager - All-in-One Installer"
echo "============================================================${NC}"
echo ""

# ============================================================
# STEP 1: Install Docker
# ============================================================
if ! command -v docker &>/dev/null; then
    info "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    ok "Docker installed"
else
    ok "Docker already installed"
fi

docker compose version &>/dev/null || { err "Docker Compose v2 required"; exit 1; }

# ============================================================
# STEP 2: Install OpenVPN
# ============================================================
if [ ! -d "/etc/openvpn/server" ]; then
    info "Installing OpenVPN..."
    
    # Install packages
    if [[ "$OS" =~ ^(ubuntu|debian)$ ]]; then
        apt-get update -qq && apt-get install -y -qq openvpn easy-rsa iptables curl >/dev/null 2>&1
    elif [[ "$OS" =~ ^(centos|rhel|fedora|rocky|almalinux)$ ]]; then
        yum install -y -q epel-release && yum install -y -q openvpn easy-rsa iptables curl >/dev/null 2>&1
    else
        err "Unsupported OS: $OS"; exit 1
    fi
    
    # Setup EasyRSA
    mkdir -p /etc/openvpn/easy-rsa
    cp -r /usr/share/easy-rsa/* /etc/openvpn/easy-rsa/ 2>/dev/null || { err "EasyRSA not found"; exit 1; }
    cd /etc/openvpn/easy-rsa
    
    # Generate certificates (silent)
    ./easyrsa init-pki >/dev/null 2>&1
    EASYRSA_BATCH=1 ./easyrsa build-ca nopass >/dev/null 2>&1
    EASYRSA_BATCH=1 ./easyrsa build-server-full server nopass >/dev/null 2>&1
    
    # Setup server directory
    mkdir -p /etc/openvpn/server /var/log/openvpn
    openvpn --genkey secret /etc/openvpn/server/tls-crypt.key
    cp pki/ca.crt pki/private/server.key pki/issued/server.crt /etc/openvpn/server/
    
    # Create config
    cat > /etc/openvpn/server/server.conf <<'EOF'
port 1194
proto udp
dev tun

ca /etc/openvpn/server/ca.crt
cert /etc/openvpn/server/server.crt
key /etc/openvpn/server/server.key
dh none
tls-crypt /etc/openvpn/server/tls-crypt.key

server 10.8.0.0 255.255.255.0
topology subnet

push "dhcp-option DNS 8.8.8.8"
push "dhcp-option DNS 1.1.1.1"
push "redirect-gateway def1 bypass-dhcp"

keepalive 10 120
cipher AES-256-GCM
data-ciphers AES-256-GCM:AES-128-GCM:AES-256-CBC
auth SHA256
tls-version-min 1.2
tls-cipher TLS-ECDHE-ECDSA-WITH-AES-256-GCM-SHA384:TLS-ECDHE-RSA-WITH-AES-256-GCM-SHA384
persist-key
persist-tun

user nobody
group nogroup

# Management Interface (bind to 0.0.0.0 for Docker access)
management 0.0.0.0 7505
management-client-auth

status /var/log/openvpn/status.log
status-version 3
log /var/log/openvpn/openvpn.log
verb 3

script-security 2
EOF
    
    # Enable IP forwarding
    echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
    sysctl -p >/dev/null 2>&1
    
    # Setup NAT
    cat > /etc/systemd/system/openvpn-iptables.service <<EOF
[Unit]
Before=network.target
[Service]
Type=oneshot
ExecStart=/sbin/iptables -t nat -A POSTROUTING -s 10.8.0.0/24 -o $IF -j MASQUERADE
ExecStop=/sbin/iptables -t nat -D POSTROUTING -s 10.8.0.0/24 -o $IF -j MASQUERADE
RemainAfterExit=yes
[Install]
WantedBy=multi-user.target
EOF
    
    systemctl daemon-reload
    systemctl enable --now openvpn-iptables.service >/dev/null 2>&1
    
    # Start OpenVPN
    systemctl enable --now openvpn-server@server.service 2>/dev/null || \
    systemctl enable --now openvpn@server.service 2>/dev/null
    
    sleep 2
    systemctl is-active --quiet openvpn-server@server.service 2>/dev/null || \
    systemctl is-active --quiet openvpn@server.service 2>/dev/null || \
    { err "OpenVPN failed to start"; exit 1; }
    
    ok "OpenVPN installed and running"
else
    ok "OpenVPN already installed"
fi

# ============================================================
# STEP 3: Install Agent
# ============================================================
INSTALL_DIR="/opt/vpn-agent"
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# Check if agent already running
if docker ps | grep -q vpn-agent; then
    warn "Agent already running. Stopping..."
    docker compose down 2>/dev/null || true
fi

info "Downloading agent files..."
curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/docker-compose.agent.yml -o docker-compose.yml
ok "Files downloaded"

# Support both AGENT_MANAGER_URL and MANAGER_URL
MANAGER_URL=${AGENT_MANAGER_URL:-$MANAGER_URL}

# Debug: Show what we received
if [ -n "$MANAGER_URL" ]; then
    info "Detected MANAGER_URL: $MANAGER_URL"
fi
if [ -n "$VPN_TOKEN" ]; then
    info "Detected VPN_TOKEN: ${VPN_TOKEN:0:10}..."
fi
if [ -n "$REG_KEY" ]; then
    info "Detected REG_KEY: ${REG_KEY:0:10}..."
fi

# Check if .env already exists
if [ -f ".env" ]; then
    warn "Existing .env found. Backing up..."
    cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
    
    # Load existing values if no new values provided
    if [ -z "$MANAGER_URL" ]; then
        source .env
        MANAGER_URL=$AGENT_MANAGER_URL
        NODE_ID=$AGENT_NODE_ID
        SECRET_TOKEN=$AGENT_SECRET_TOKEN
        VPN_TOKEN=$VPN_TOKEN
        info "Using existing configuration"
    fi
fi

# Configure environment
if [ -n "$MANAGER_URL" ] && [ -n "$VPN_TOKEN" ]; then
    info "Configuring agent (automated mode)..."
    
    # Auto-register if REG_KEY provided
    if [ -n "$REG_KEY" ] && [ -z "$NODE_ID" ]; then
        info "Auto-registering node..."
        HOSTNAME=${HOSTNAME:-$(hostname)}
        IP_ADDRESS=${IP_ADDRESS:-$IP}
        
        RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$MANAGER_URL/api/v1/nodes/register" \
            -H "Content-Type: application/json" \
            -d "{\"hostname\":\"$HOSTNAME\",\"ip\":\"$IP_ADDRESS\",\"port\":1194,\"version\":\"auto\",\"registrationKey\":\"$REG_KEY\"}")
        
        HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
        BODY=$(echo "$RESPONSE" | sed '$d')
        
        if [ "$HTTP_CODE" == "201" ]; then
            NODE_ID=$(echo "$BODY" | grep -o '"id":"[^"]*' | cut -d'"' -f4)
            SECRET_TOKEN=$(echo "$BODY" | grep -o '"token":"[^"]*' | cut -d'"' -f4)
            ok "Node registered: $NODE_ID"
        else
            err "Registration failed (HTTP $HTTP_CODE)"
            echo "$BODY"
            exit 1
        fi
    fi
    
    [ -z "$NODE_ID" ] && { err "NODE_ID required"; exit 1; }
    [ -z "$SECRET_TOKEN" ] && { err "SECRET_TOKEN required"; exit 1; }
    
    # Create .env with proper values
    cat > .env <<EOF
# ============================================================
# VPN Manager — Agent Configuration (Standalone Deployment)
# ============================================================
# Generated on $(date)
# ============================================================

# Node Environment
NODE_ENV=production

# Manager API Connection
AGENT_MANAGER_URL=$MANAGER_URL
AGENT_NODE_ID=$NODE_ID
AGENT_SECRET_TOKEN=$SECRET_TOKEN

# VPN Token (for authentication)
VPN_TOKEN=$VPN_TOKEN

# Polling & Heartbeat Intervals (milliseconds)
AGENT_POLL_INTERVAL_MS=5000
AGENT_HEARTBEAT_INTERVAL_MS=30000

# VPN Type Selection (openvpn | wireguard)
VPN_TYPE=openvpn

# OpenVPN Management Interface (for VPN_TYPE=openvpn)
VPN_MANAGEMENT_HOST=127.0.0.1
VPN_MANAGEMENT_PORT=7505
VPN_MANAGEMENT_PASSWORD=

# WireGuard Settings (for VPN_TYPE=wireguard)
WIREGUARD_INTERFACE=wg0
EOF
    
    ok "Agent configured"
else
    # Interactive mode
    echo ""
    read -p "Manager API URL: " MANAGER_URL
    read -p "VPN Token: " VPN_TOKEN
    read -p "Node ID: " NODE_ID
    read -p "Secret Token: " SECRET_TOKEN
    
    # Create .env with proper values
    cat > .env <<EOF
# ============================================================
# VPN Manager — Agent Configuration (Standalone Deployment)
# ============================================================
# Generated on $(date)
# ============================================================

# Node Environment
NODE_ENV=production

# Manager API Connection
AGENT_MANAGER_URL=$MANAGER_URL
AGENT_NODE_ID=$NODE_ID
AGENT_SECRET_TOKEN=$SECRET_TOKEN

# VPN Token (for authentication)
VPN_TOKEN=$VPN_TOKEN

# Polling & Heartbeat Intervals (milliseconds)
AGENT_POLL_INTERVAL_MS=5000
AGENT_HEARTBEAT_INTERVAL_MS=30000

# VPN Type Selection (openvpn | wireguard)
VPN_TYPE=openvpn

# OpenVPN Management Interface (for VPN_TYPE=openvpn)
VPN_MANAGEMENT_HOST=127.0.0.1
VPN_MANAGEMENT_PORT=7505
VPN_MANAGEMENT_PASSWORD=

# WireGuard Settings (for VPN_TYPE=wireguard)
WIREGUARD_INTERFACE=wg0
EOF
fi

# Start agent
info "Starting agent..."
docker compose pull -q
docker compose up -d
ok "Agent started"

# Wait for agent to be ready
sleep 5

# Install hooks
info "Installing VPN hooks..."

# Load environment variables
cd "$INSTALL_DIR"
source .env

# Create symlink for consistent path (safe to run multiple times)
ln -sf "$INSTALL_DIR/.env" /opt/vpn-manager/.env

# Download bash hooks from GitHub (agent scripts)
REPO_URL="https://raw.githubusercontent.com/adityadarma/vpn-manager/main/apps/agent/scripts"

for hook in vpn-connect vpn-disconnect; do
    # Backup existing hook if different
    if [ -f "/usr/local/bin/${hook}" ]; then
        TEMP_HOOK=$(mktemp)
        curl -fsSL "$REPO_URL/${hook}.sh" -o "$TEMP_HOOK"
        
        if ! cmp -s "$TEMP_HOOK" "/usr/local/bin/${hook}"; then
            warn "Updating ${hook} (backing up old version)"
            cp "/usr/local/bin/${hook}" "/usr/local/bin/${hook}.backup.$(date +%Y%m%d_%H%M%S)"
            mv "$TEMP_HOOK" "/usr/local/bin/${hook}"
            chmod +x "/usr/local/bin/${hook}"
        else
            rm "$TEMP_HOOK"
        fi
    else
        curl -fsSL "$REPO_URL/${hook}.sh" -o "/usr/local/bin/${hook}"
        chmod +x "/usr/local/bin/${hook}"
    fi
done

# Update OpenVPN config for hooks (certificate-only authentication)
if ! grep -q "client-connect" /etc/openvpn/server/server.conf; then
    info "Adding VPN hooks to OpenVPN config..."
    cat >> /etc/openvpn/server/server.conf <<'EOF'

# VPN Manager Hooks (Certificate-only authentication)
username-as-common-name
client-connect /usr/local/bin/vpn-connect
client-disconnect /usr/local/bin/vpn-disconnect
EOF
    systemctl restart openvpn-server@server.service 2>/dev/null || \
    systemctl restart openvpn@server.service 2>/dev/null
    ok "OpenVPN config updated"
else
    ok "VPN hooks already configured in OpenVPN"
fi

ok "Hooks installed"

# ============================================================
# DONE
# ============================================================
echo ""
echo -e "${G}============================================================"
echo "  Installation Complete!"
echo "============================================================${NC}"
echo ""
echo "OpenVPN: Running on UDP port 1194"
echo "Agent: Running in Docker"
echo "Node ID: $NODE_ID"
echo "Environment: /opt/vpn-manager/.env"
echo ""
echo "Useful commands:"
echo "  Check agent: docker logs vpn-agent"
echo "  Check VPN: systemctl status openvpn-server@server"
echo "  View logs: tail -f /var/log/openvpn/openvpn.log"
echo ""
echo "Next steps:"
echo "  1. Login to Web UI"
echo "  2. Check node status (should be Online)"
echo "  3. Create users and download configs"
echo ""
echo "Note: Safe to run this script again for updates/reinstall"
echo ""
