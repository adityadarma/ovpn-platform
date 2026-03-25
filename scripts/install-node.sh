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
#   Interactive mode:
#     sudo bash scripts/install-node.sh
#
#   Non-interactive mode (pass as arguments):
#     curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/scripts/install-node.sh | \
#     sudo bash -s -- \
#       MANAGER_URL=https://api-vpn.example.com \
#       VPN_TOKEN=your-vpn-token \
#       REG_KEY=your-registration-key
#
#   Or download first:
#     curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/scripts/install-node.sh -o install-node.sh
#     sudo bash install-node.sh \
#       MANAGER_URL=https://api-vpn.example.com \
#       VPN_TOKEN=your-vpn-token \
#       REG_KEY=your-registration-key
#
#   Or use sudo -E:
#     export MANAGER_URL=https://api-vpn.example.com
#     export VPN_TOKEN=your-vpn-token
#     export REG_KEY=your-registration-key
#     sudo -E bash install-node.sh
#
# Environment Variables (Auto-registration):
#   MANAGER_URL or AGENT_API_MANAGER_URL - Manager API URL
#   VPN_TOKEN - VPN authentication token
#   REG_KEY or NODE_REGISTRATION_KEY - Registration key
#
# Environment Variables (Manual registration):
#   MANAGER_URL or AGENT_API_MANAGER_URL - Manager API URL
#   VPN_TOKEN - VPN authentication token
#   AGENT_NODE_ID - Node ID
#   AGENT_SECRET_TOKEN - Secret token
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

# Preserve environment variables from command line arguments
# This allows: sudo bash install-node.sh MANAGER_URL=... VPN_TOKEN=... REG_KEY=...
for arg in "$@"; do
    if [[ "$arg" == *"="* ]]; then
        export "$arg"
    fi
done

echo -e "${B}============================================================"
echo "  VPN Manager - Node Installation/Update"
echo "============================================================${NC}"
echo ""

# Show environment variable support
if [ -n "$MANAGER_URL" ] || [ -n "$AGENT_API_MANAGER_URL" ] || [ -n "$VPN_TOKEN" ]; then
    info "Environment variables detected - using non-interactive mode"
    echo ""
fi

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


status /var/log/openvpn/status.log
status-version 3
log /var/log/openvpn/openvpn.log
verb 3

script-security 2

# Management Interface
management /run/openvpn/server.sock unix
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
    
    # Check for environment variables (support both naming conventions)
    ENV_MANAGER_URL="${MANAGER_URL:-${AGENT_API_MANAGER_URL}}"
    ENV_REG_KEY="${REG_KEY:-${NODE_REGISTRATION_KEY}}"
    ENV_VPN_TOKEN="${VPN_TOKEN}"
    ENV_NODE_ID="${AGENT_NODE_ID}"
    ENV_SECRET_TOKEN="${AGENT_SECRET_TOKEN}"
    
    # Determine registration mode
    AUTO_REGISTER=false
    MANUAL_REGISTER=false
    
    if [ -n "$ENV_MANAGER_URL" ] && [ -n "$ENV_REG_KEY" ] && [ -n "$ENV_VPN_TOKEN" ]; then
        AUTO_REGISTER=true
        info "Auto-registration mode detected (using environment variables)"
    elif [ -n "$ENV_MANAGER_URL" ] && [ -n "$ENV_VPN_TOKEN" ] && [ -n "$ENV_NODE_ID" ] && [ -n "$ENV_SECRET_TOKEN" ]; then
        MANUAL_REGISTER=true
        info "Manual registration mode detected (using environment variables)"
    fi
    
    # Get configuration interactively if not provided via environment
    echo ""
    if [ "$AUTO_REGISTER" = false ] && [ "$MANUAL_REGISTER" = false ]; then
        # Interactive mode
        read -p "Manager API URL (e.g., https://api-vpn.example.com): " MANAGER_URL </dev/tty
        ENV_MANAGER_URL="$MANAGER_URL"
        
        read -p "VPN Token: " VPN_TOKEN </dev/tty
        ENV_VPN_TOKEN="$VPN_TOKEN"
        
        echo ""
        echo "Registration mode:"
        echo "1) Auto-register (using registration key)"
        echo "2) Manual (using existing Node ID and Secret Token)"
        read -p "Choice [1-2]: " reg_mode </dev/tty
        
        if [ "$reg_mode" = "1" ]; then
            read -p "Node registration key: " REG_KEY </dev/tty
            ENV_REG_KEY="$REG_KEY"
            AUTO_REGISTER=true
        else
            read -p "Node ID: " NODE_ID </dev/tty
            ENV_NODE_ID="$NODE_ID"
            read -p "Secret Token: " SECRET_TOKEN </dev/tty
            ENV_SECRET_TOKEN="$SECRET_TOKEN"
            MANUAL_REGISTER=true
        fi
    fi
    
    # Get server info
    SERVER_IP=$(curl -s ifconfig.me || hostname -I | awk '{print $1}')
    HOSTNAME=$(hostname)
    
    # Create .env file
    if [ "$AUTO_REGISTER" = true ]; then
        # Auto-registration: create .env with empty credentials (will be filled after registration)
        cat > .env <<EOF
AGENT_MANAGER_URL=${ENV_MANAGER_URL}
VPN_TOKEN=${ENV_VPN_TOKEN}
AGENT_NODE_ID=
AGENT_SECRET_TOKEN=
AGENT_POLL_INTERVAL_MS=5000
AGENT_HEARTBEAT_INTERVAL_MS=30000
OPENVPN_SOCKET_PATH=/run/openvpn/server.sock
EOF
        
        # Register node
        info "Registering node with Manager..."
        RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${ENV_MANAGER_URL}/api/v1/nodes/register" \
            -H "Content-Type: application/json" \
            -H "X-VPN-Token: ${ENV_VPN_TOKEN}" \
            -d "{\"hostname\":\"$HOSTNAME\",\"ip\":\"$SERVER_IP\",\"port\":1194,\"version\":\"auto\",\"registrationKey\":\"$ENV_REG_KEY\"}")
        
        HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
        BODY=$(echo "$RESPONSE" | sed '$d')
        
        if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "200" ]; then
            NODE_ID=$(echo "$BODY" | grep -o '"id":"[^"]*' | cut -d'"' -f4)
            SECRET_TOKEN=$(echo "$BODY" | grep -o '"token":"[^"]*' | cut -d'"' -f4)
            
            if [ -n "$NODE_ID" ] && [ -n "$SECRET_TOKEN" ]; then
                # Update .env with credentials
                sed -i "s|AGENT_NODE_ID=.*|AGENT_NODE_ID=$NODE_ID|" .env
                sed -i "s|AGENT_SECRET_TOKEN=.*|AGENT_SECRET_TOKEN=$SECRET_TOKEN|" .env
                ok "Node registered successfully: $NODE_ID"
            else
                error "Failed to parse registration response"
                warn "Please register manually and update .env file"
            fi
        else
            error "Node registration failed (HTTP $HTTP_CODE)"
            warn "Response: $BODY"
            warn "Please register manually and update .env file"
        fi
    else
        # Manual registration: use provided credentials
        cat > .env <<EOF
AGENT_MANAGER_URL=${ENV_MANAGER_URL}
VPN_TOKEN=${ENV_VPN_TOKEN}
AGENT_NODE_ID=${ENV_NODE_ID}
AGENT_SECRET_TOKEN=${ENV_SECRET_TOKEN}
AGENT_POLL_INTERVAL_MS=5000
AGENT_HEARTBEAT_INTERVAL_MS=30000
OPENVPN_SOCKET_PATH=/run/openvpn/server.sock
EOF
        ok "Configuration saved with provided credentials"
    fi
    
    # Start agent
    info "Starting agent..."
    docker compose pull
    docker compose up -d
    
    sleep 3
    
    if docker ps --filter name=vpn-agent --format '{{.Status}}' | grep -q "Up"; then
        ok "Agent started successfully"
    else
        warn "Agent may not be running properly"
        info "Check logs: docker logs vpn-agent"
    fi
    
    # Install VPN hooks
    install_vpn_hooks
    
    ok "Agent installation complete"
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
    -H "X-VPN-Token: ${VPN_TOKEN}" \
    -d "{\"username\":\"${common_name}\",\"vpn_ip\":\"${ifconfig_pool_remote_ip}\",\"real_ip\":\"${trusted_ip}\",\"node_id\":\"${AGENT_NODE_ID}\"}" > /dev/null 2>&1
exit 0
EOF
    
    # vpn-disconnect hook
    cat > /usr/local/bin/vpn-disconnect <<'EOF'
#!/bin/bash
[ -f "/opt/vpn-agent/.env" ] && source /opt/vpn-agent/.env
curl -s -X POST "${AGENT_MANAGER_URL}/api/v1/vpn/disconnect" \
    -H "Content-Type: application/json" \
    -H "X-VPN-Token: ${VPN_TOKEN}" \
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
