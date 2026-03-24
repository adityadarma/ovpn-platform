#!/bin/bash
# ============================================================
# VPN Manager - Node Installation/Update
# ============================================================
# Installs or updates OpenVPN server + Agent
# Can be used for:
#   - Fresh OpenVPN installation
#   - Update existing OpenVPN configuration
#   - Install/update Agent only
#
# Usage:
#   sudo bash scripts/install-node.sh
# ============================================================

set -e

# Colors
G='\033[0;32m'; Y='\033[1;33m'; B='\033[0;34m'; R='\033[0;31m'; NC='\033[0m'
ok() { echo -e "${G}✓ $1${NC}"; }
info() { echo -e "${B}ℹ $1${NC}"; }
warn() { echo -e "${Y}⚠ $1${NC}"; }
error() { echo -e "${R}✗ $1${NC}"; }

INSTALL_DIR="/opt/vpn-agent"

# Check root
[ "$EUID" -ne 0 ] && { error "Must run as root"; exit 1; }

echo -e "${B}============================================================"
echo "  VPN Manager - Node Installation/Update"
echo "============================================================${NC}"
echo ""

# Detect existing installation
OPENVPN_INSTALLED=false
AGENT_INSTALLED=false

if systemctl is-active --quiet openvpn-server@server 2>/dev/null || \
   systemctl is-active --quiet openvpn@server 2>/dev/null; then
    OPENVPN_INSTALLED=true
    ok "OpenVPN is already installed"
fi

if [ -d "$INSTALL_DIR" ] && [ -f "$INSTALL_DIR/docker-compose.yml" ]; then
    AGENT_INSTALLED=true
    ok "Agent is already installed"
fi

echo ""

# Installation mode
if [ "$OPENVPN_INSTALLED" = true ]; then
    echo "OpenVPN is already installed. What do you want to do?"
    echo "1) Update OpenVPN configuration only"
    echo "2) Install/Update Agent only"
    echo "3) Update both OpenVPN and Agent"
    echo "4) Exit"
    read -p "Choice [1-4]: " mode </dev/tty
else
    echo "OpenVPN is not installed. What do you want to do?"
    echo "1) Install OpenVPN + Agent (full node)"
    echo "2) Install OpenVPN only"
    echo "3) Exit"
    read -p "Choice [1-3]: " mode </dev/tty
fi

echo ""

# Functions
install_openvpn() {
    info "Installing OpenVPN..."
    
    # Check if already installed
    if command -v openvpn &> /dev/null; then
        ok "OpenVPN already installed"
    else
        info "Installing OpenVPN package..."
        apt-get update -qq
        apt-get install -y openvpn easy-rsa iptables curl
        ok "OpenVPN package installed"
    fi
    
    # Setup directories
    mkdir -p /etc/openvpn/server
    mkdir -p /var/log/openvpn
    
    # Setup Easy-RSA if not exists
    if [ ! -d "/etc/openvpn/easy-rsa" ]; then
        info "Setting up Easy-RSA..."
        make-cadir /etc/openvpn/easy-rsa
        cd /etc/openvpn/easy-rsa
        
        # Initialize PKI
        ./easyrsa init-pki
        ./easyrsa --batch build-ca nopass
        ./easyrsa --batch build-server-full server nopass
        ./easyrsa gen-dh
        openvpn --genkey secret /etc/openvpn/server/tls-crypt.key
        
        # Copy certificates
        cp pki/ca.crt /etc/openvpn/server/
        cp pki/issued/server.crt /etc/openvpn/server/
        cp pki/private/server.key /etc/openvpn/server/
        
        ok "Easy-RSA configured"
    else
        ok "Easy-RSA already configured"
    fi
    
    # Create/update server config
    update_openvpn_config
    
    # Enable IP forwarding
    if ! grep -q "net.ipv4.ip_forward=1" /etc/sysctl.conf; then
        echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
        sysctl -p >/dev/null 2>&1
    fi
    
    # Setup NAT
    IF=$(ip route | grep default | awk '{print $5}' | head -n1)
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
    systemctl enable --now openvpn-iptables.service
    
    # Start OpenVPN
    systemctl enable --now openvpn-server@server.service 2>/dev/null || \
    systemctl enable --now openvpn@server.service 2>/dev/null
    
    sleep 2
    
    if systemctl is-active --quiet openvpn-server@server.service 2>/dev/null || \
       systemctl is-active --quiet openvpn@server.service 2>/dev/null; then
        ok "OpenVPN installed and running"
    else
        error "OpenVPN failed to start"
        exit 1
    fi
}

update_openvpn_config() {
    info "Creating/updating OpenVPN server configuration..."
    
    # Backup existing config
    if [ -f "/etc/openvpn/server/server.conf" ]; then
        cp /etc/openvpn/server/server.conf /etc/openvpn/server/server.conf.backup-$(date +%Y%m%d-%H%M%S)
        info "Backed up existing config"
    fi
    
    # Create new config based on working reference
    cat > /etc/openvpn/server/server.conf <<'EOF'
port 1194
proto udp
dev tun

ca /etc/openvpn/server/ca.crt
cert /etc/openvpn/server/server.crt
key /etc/openvpn/server/server.key
dh none
ecdh-curve prime256v1
tls-crypt /etc/openvpn/server/tls-crypt.key

server 10.8.0.0 255.255.255.0
topology subnet

push "dhcp-option DNS 8.8.8.8"
push "dhcp-option DNS 1.1.1.1"
push "redirect-gateway def1 bypass-dhcp"

keepalive 10 120
cipher AES-128-GCM
ncp-ciphers AES-128-GCM
auth SHA256
tls-server
tls-version-min 1.2
tls-cipher TLS-ECDHE-ECDSA-WITH-AES-128-GCM-SHA256
persist-key
persist-tun

user nobody
group nogroup

# Management Interface
management 0.0.0.0 7505
management-client-auth

status /var/log/openvpn/status.log
status-version 3
log /var/log/openvpn/openvpn.log
verb 3

script-security 2
EOF
    
    ok "OpenVPN configuration updated"
    
    # Restart if already running
    if systemctl is-active --quiet openvpn-server@server.service 2>/dev/null; then
        systemctl restart openvpn-server@server.service
        ok "OpenVPN restarted"
    elif systemctl is-active --quiet openvpn@server.service 2>/dev/null; then
        systemctl restart openvpn@server.service
        ok "OpenVPN restarted"
    fi
}

install_agent() {
    info "Installing Agent..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        error "Docker not installed"
        info "Install: https://docs.docker.com/engine/install/"
        exit 1
    fi
    
    # Create install directory
    mkdir -p "$INSTALL_DIR"
    cd "$INSTALL_DIR"
    
    # Download docker-compose.yml if not exists
    if [ ! -f "docker-compose.yml" ]; then
        info "Downloading docker-compose.yml for agent..."
        REPO_URL="https://raw.githubusercontent.com/adityadarma/vpn-manager/main"
        if curl -fsSL "$REPO_URL/docker-compose.agent.yml" -o docker-compose.yml; then
            ok "Downloaded docker-compose.yml"
        else
            error "Failed to download docker-compose.agent.yml"
            info "Please ensure docker-compose.yml is in $INSTALL_DIR"
            exit 1
        fi
    fi
    
    # Get manager URL
    echo ""
    read -p "Manager API URL (e.g., http://manager-ip:3000): " MANAGER_URL </dev/tty
    read -p "Node registration key: " REG_KEY </dev/tty
    
    # Get server info
    SERVER_IP=$(curl -s ifconfig.me || hostname -I | awk '{print $1}')
    HOSTNAME=$(hostname)
    
    # Create .env
    cat > .env <<EOF
AGENT_MANAGER_URL=${MANAGER_URL}
AGENT_NODE_ID=
AGENT_SECRET_TOKEN=
AGENT_POLL_INTERVAL=10000
AGENT_HEARTBEAT_INTERVAL=30000
EOF
    
    # Start agent
    docker compose pull
    docker compose up -d
    
    sleep 3
    
    # Register node
    info "Registering node..."
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${MANAGER_URL}/api/v1/nodes/register" \
        -H "Content-Type: application/json" \
        -d "{\"hostname\":\"$HOSTNAME\",\"ip\":\"$SERVER_IP\",\"port\":1194,\"version\":\"auto\",\"registrationKey\":\"$REG_KEY\"}")
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    
    if [ "$HTTP_CODE" == "201" ]; then
        NODE_ID=$(echo "$BODY" | grep -o '"id":"[^"]*' | cut -d'"' -f4)
        SECRET_TOKEN=$(echo "$BODY" | grep -o '"token":"[^"]*' | cut -d'"' -f4)
        
        # Update .env
        sed -i "s|AGENT_NODE_ID=.*|AGENT_NODE_ID=$NODE_ID|" .env
        sed -i "s|AGENT_SECRET_TOKEN=.*|AGENT_SECRET_TOKEN=$SECRET_TOKEN|" .env
        
        # Restart agent
        docker compose restart
        
        ok "Node registered: $NODE_ID"
    else
        warn "Node registration failed (HTTP $HTTP_CODE)"
        info "You can register manually later"
    fi
    
    # Install VPN hooks
    install_vpn_hooks
    
    ok "Agent installed"
}

install_vpn_hooks() {
    info "Installing VPN hooks..."
    
    # Load env
    [ -f "$INSTALL_DIR/.env" ] && source "$INSTALL_DIR/.env"
    
    # vpn-connect hook
    cat > /usr/local/bin/vpn-connect <<'EOF'
#!/bin/bash
[ -f "/opt/vpn-agent/.env" ] && source /opt/vpn-agent/.env
curl -s -X POST "${AGENT_MANAGER_URL}/api/v1/vpn/connect" \
    -H "Content-Type: application/json" \
    -H "X-VPN-Token: ${AGENT_SECRET_TOKEN}" \
    -d "{\"username\":\"${common_name}\",\"vpn_ip\":\"${ifconfig_pool_remote_ip}\",\"real_ip\":\"${trusted_ip}\",\"node_id\":\"${AGENT_NODE_ID}\"}" > /dev/null 2>&1
exit 0
EOF
    
    # vpn-disconnect hook
    cat > /usr/local/bin/vpn-disconnect <<'EOF'
#!/bin/bash
[ -f "/opt/vpn-agent/.env" ] && source /opt/vpn-agent/.env
curl -s -X POST "${AGENT_MANAGER_URL}/api/v1/vpn/disconnect" \
    -H "Content-Type: application/json" \
    -H "X-VPN-Token: ${AGENT_SECRET_TOKEN}" \
    -d "{\"username\":\"${common_name}\",\"vpn_ip\":\"${ifconfig_pool_remote_ip}\",\"bytes_sent\":\"${bytes_sent}\",\"bytes_received\":\"${bytes_received}\",\"duration\":\"${time_duration}\"}" > /dev/null 2>&1
exit 0
EOF
    
    chmod +x /usr/local/bin/vpn-connect
    chmod +x /usr/local/bin/vpn-disconnect
    
    # Add hooks to OpenVPN config if not present
    if ! grep -q "client-connect" /etc/openvpn/server/server.conf; then
        cat >> /etc/openvpn/server/server.conf <<'EOF'

# VPN Hooks
client-connect /usr/local/bin/vpn-connect
client-disconnect /usr/local/bin/vpn-disconnect
EOF
        systemctl restart openvpn-server@server.service 2>/dev/null || \
        systemctl restart openvpn@server.service 2>/dev/null
    fi
    
    ok "VPN hooks installed"
}

# Execute based on mode
case $mode in
    1)
        if [ "$OPENVPN_INSTALLED" = true ]; then
            update_openvpn_config
        else
            install_openvpn
            install_agent
        fi
        ;;
    2)
        if [ "$OPENVPN_INSTALLED" = true ]; then
            install_agent
        else
            install_openvpn
        fi
        ;;
    3)
        if [ "$OPENVPN_INSTALLED" = true ]; then
            update_openvpn_config
            install_agent
        else
            exit 0
        fi
        ;;
    4|*)
        exit 0
        ;;
esac

# Summary
echo ""
echo -e "${B}============================================================"
echo "  Installation Complete!"
echo "============================================================${NC}"
echo ""
echo "OpenVPN: $(systemctl is-active openvpn-server@server 2>/dev/null || systemctl is-active openvpn@server 2>/dev/null || echo 'not running')"
echo "Agent: $(docker ps --filter name=vpn-agent --format '{{.Status}}' 2>/dev/null || echo 'not running')"
echo ""
echo "Useful Commands:"
echo "  OpenVPN logs: tail -f /var/log/openvpn/openvpn.log"
echo "  Agent logs: docker logs -f vpn-agent"
echo "  Restart OpenVPN: systemctl restart openvpn-server@server"
echo "  Restart Agent: cd $INSTALL_DIR && docker compose restart"
echo ""
echo "============================================================"
echo ""
