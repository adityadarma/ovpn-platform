#!/bin/bash
# ============================================================
# VPN Manager - All-in-One Installer
# ============================================================
# Installs OpenVPN + Agent in one go
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/scripts/install.sh | sudo bash
#
# Environment Variables (for automation):
#   MANAGER_URL    - Manager API URL (required)
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
    EASYRSA_BATCH=1 ./easyrsa gen-dh >/dev/null 2>&1
    
    # Setup server directory
    mkdir -p /etc/openvpn/server /var/log/openvpn
    openvpn --genkey secret /etc/openvpn/server/tls-crypt.key
    cp pki/ca.crt pki/private/server.key pki/issued/server.crt pki/dh.pem /etc/openvpn/server/
    
    # Create config
    cat > /etc/openvpn/server/server.conf <<'EOF'
port 1194
proto udp
dev tun

ca /etc/openvpn/server/ca.crt
cert /etc/openvpn/server/server.crt
key /etc/openvpn/server/server.key
dh /etc/openvpn/server/dh.pem
tls-crypt /etc/openvpn/server/tls-crypt.key

server 10.8.0.0 255.255.255.0
topology subnet

push "dhcp-option DNS 8.8.8.8"
push "dhcp-option DNS 1.1.1.1"

keepalive 10 120
cipher AES-256-GCM
persist-key
persist-tun

user nobody
group nogroup

# Management Interface (v2.0)
management 127.0.0.1 7505
management-client-auth

status /var/log/openvpn/status.log
status-version 3
log /var/log/openvpn/openvpn.log
verb 3

# VPN Hooks (will be configured by agent)
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

info "Downloading agent files..."
curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/docker-compose.agent.yml -o docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/.env.agent -o .env
ok "Files downloaded"

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
            exit 1
        fi
    fi
    
    [ -z "$NODE_ID" ] && { err "NODE_ID required"; exit 1; }
    [ -z "$SECRET_TOKEN" ] && { err "SECRET_TOKEN required"; exit 1; }
    
    # Update .env
    sed -i "s|AGENT_MANAGER_URL=.*|AGENT_MANAGER_URL=$MANAGER_URL|" .env
    sed -i "s|AGENT_NODE_ID=.*|AGENT_NODE_ID=$NODE_ID|" .env
    sed -i "s|AGENT_SECRET_TOKEN=.*|AGENT_SECRET_TOKEN=$SECRET_TOKEN|" .env
    sed -i "s|VPN_TOKEN=.*|VPN_TOKEN=$VPN_TOKEN|" .env
    sed -i "s|NODE_ENV=.*|NODE_ENV=production|" .env
    
    ok "Agent configured"
else
    # Interactive mode
    echo ""
    read -p "Manager API URL: " MANAGER_URL
    read -p "VPN Token: " VPN_TOKEN
    read -p "Node ID: " NODE_ID
    read -p "Secret Token: " SECRET_TOKEN
    
    sed -i "s|AGENT_MANAGER_URL=.*|AGENT_MANAGER_URL=$MANAGER_URL|" .env
    sed -i "s|AGENT_NODE_ID=.*|AGENT_NODE_ID=$NODE_ID|" .env
    sed -i "s|AGENT_SECRET_TOKEN=.*|AGENT_SECRET_TOKEN=$SECRET_TOKEN|" .env
    sed -i "s|VPN_TOKEN=.*|VPN_TOKEN=$VPN_TOKEN|" .env
    sed -i "s|NODE_ENV=.*|NODE_ENV=production|" .env
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
HOOKS=(vpn-login vpn-connect vpn-disconnect)
for hook in "${HOOKS[@]}"; do
    if docker compose exec -T agent cat "/app/dist/bin/${hook}.js" > "/tmp/${hook}.js" 2>/dev/null; then
        cat > "/usr/local/bin/${hook}" <<'WRAPPER'
#!/bin/bash
[ -f "/opt/vpn-agent/.env" ] && export $(grep -v '^#' /opt/vpn-agent/.env | xargs)
exec node /opt/vpn-agent/hooks/HOOK.js "$@"
WRAPPER
        sed -i "s/HOOK/${hook}/g" "/usr/local/bin/${hook}"
        chmod +x "/usr/local/bin/${hook}"
        mkdir -p /opt/vpn-agent/hooks
        mv "/tmp/${hook}.js" "/opt/vpn-agent/hooks/${hook}.js"
    fi
done

# Update OpenVPN config for hooks
if ! grep -q "auth-user-pass-verify" /etc/openvpn/server/server.conf; then
    cat >> /etc/openvpn/server/server.conf <<'EOF'

# VPN Hooks
auth-user-pass-verify /usr/local/bin/vpn-login via-file
client-connect /usr/local/bin/vpn-connect
client-disconnect /usr/local/bin/vpn-disconnect
username-as-common-name
EOF
    systemctl restart openvpn-server@server.service 2>/dev/null || \
    systemctl restart openvpn@server.service 2>/dev/null
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
