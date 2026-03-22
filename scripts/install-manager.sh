#!/bin/bash
# ============================================================
# VPN Manager - Production Installation Script
# ============================================================
# This script installs VPN Manager without cloning the repo
# Usage: curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/scripts/install-prod.sh | sudo bash
# ============================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
INSTALL_DIR="/opt/vpn-manager"
REPO_URL="https://raw.githubusercontent.com/adityadarma/vpn-manager/main"

# Functions
print_header() {
    echo -e "${BLUE}"
    echo "============================================================"
    echo "  VPN Manager - Production Installation"
    echo "============================================================"
    echo -e "${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

check_root() {
    if [ "$EUID" -ne 0 ]; then
        print_error "This script must be run as root"
        exit 1
    fi
}

check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed"
        print_info "Install Docker first: https://docs.docker.com/engine/install/"
        exit 1
    fi
    print_success "Docker is installed"
}

check_docker_compose() {
    if ! docker compose version &> /dev/null; then
        print_error "Docker Compose v2 is not installed"
        print_info "Install Docker Compose: https://docs.docker.com/compose/install/"
        exit 1
    fi
    print_success "Docker Compose is installed"
}

generate_secret() {
    openssl rand -base64 32
}

create_install_dir() {
    print_info "Creating installation directory: $INSTALL_DIR"
    mkdir -p "$INSTALL_DIR"
    cd "$INSTALL_DIR"
    print_success "Installation directory created"
}

download_files() {
    print_info "Downloading configuration files..."
    
    # Download docker-compose file
    if curl -fsSL "$REPO_URL/docker-compose.yml" -o docker-compose.yml; then
        print_success "Downloaded docker-compose.yml"
    else
        print_error "Failed to download docker-compose.yml"
        exit 1
    fi
    
    # Download .env template
    if curl -fsSL "$REPO_URL/.env.production" -o .env.template; then
        print_success "Downloaded .env template"
    else
        print_error "Failed to download .env template"
        exit 1
    fi
}

install_openvpn() {
    print_info "Installing OpenVPN..."
    
    # Detect OS
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
    else
        print_error "Cannot detect OS"
        exit 1
    fi
    
    # Detect network interface
    IF=$(ip -4 route ls | grep default | grep -Po '(?<=dev )(\S+)' | head -1)
    IF=${IF:-eth0}
    
    # Install packages
    if [[ "$OS" =~ ^(ubuntu|debian)$ ]]; then
        apt-get update -qq && apt-get install -y -qq openvpn easy-rsa iptables curl >/dev/null 2>&1
    elif [[ "$OS" =~ ^(centos|rhel|fedora|rocky|almalinux)$ ]]; then
        yum install -y -q epel-release && yum install -y -q openvpn easy-rsa iptables curl >/dev/null 2>&1
    else
        print_error "Unsupported OS: $OS"
        exit 1
    fi
    
    # Setup EasyRSA
    mkdir -p /etc/openvpn/easy-rsa
    cp -r /usr/share/easy-rsa/* /etc/openvpn/easy-rsa/ 2>/dev/null || { print_error "EasyRSA not found"; exit 1; }
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

# Management Interface
management 127.0.0.1 7505
management-client-auth

status /var/log/openvpn/status.log
status-version 3
log /var/log/openvpn/openvpn.log
verb 3

# VPN Hooks
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
    { print_error "OpenVPN failed to start"; exit 1; }
    
    cd "$INSTALL_DIR"
    print_success "OpenVPN installed and running"
}

configure_env() {
    print_info "Configuring environment variables..."
    
    # Generate JWT secret
    JWT_SECRET=$(generate_secret)
    
    # Ask for installation mode
    echo ""
    echo "Select installation mode:"
    echo "1) Manager Only (API + Web UI)"
    echo "2) All-in-One (Manager + VPN Node on same server)"
    read -p "Enter choice [1-2] (default: 1): " install_mode </dev/tty
    install_mode=${install_mode:-1}
    
    INSTALL_AGENT=false
    if [ "$install_mode" == "2" ]; then
        INSTALL_AGENT=true
        print_info "All-in-One mode selected - will install OpenVPN + Agent"
    fi
    
    # Ask for database type
    echo ""
    echo "Select database type:"
    echo "1) SQLite (default, simplest)"
    echo "2) PostgreSQL (recommended for production)"
    echo "3) MySQL/MariaDB"
    read -p "Enter choice [1-3] (default: 1): " db_choice </dev/tty
    db_choice=${db_choice:-1}
    
    case $db_choice in
        1)
            DATABASE_TYPE="sqlite"
            DATABASE_PROFILE=""
            print_success "Using SQLite"
            ;;
        2)
            DATABASE_TYPE="postgres"
            DATABASE_PROFILE="--profile postgres"
            read -p "PostgreSQL password (will be generated if empty): " POSTGRES_PASSWORD </dev/tty
            POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-$(generate_secret | tr -d '/')}
            print_success "Using PostgreSQL"
            ;;
        3)
            DATABASE_TYPE="mysql"
            DATABASE_PROFILE="--profile mysql"
            read -p "MySQL password (will be generated if empty): " MYSQL_PASSWORD </dev/tty
            MYSQL_PASSWORD=${MYSQL_PASSWORD:-$(generate_secret | tr -d '/')}
            read -p "MySQL root password (will be generated if empty): " MYSQL_ROOT_PASSWORD </dev/tty
            MYSQL_ROOT_PASSWORD=${MYSQL_ROOT_PASSWORD:-$(generate_secret | tr -d '/')}
            print_success "Using MySQL/MariaDB"
            ;;
        *)
            print_error "Invalid choice"
            exit 1
            ;;
    esac
    
    # Get server IP or domain
    SERVER_IP=$(curl -s ifconfig.me || hostname -I | awk '{print $1}')
    echo ""
    echo "Enter your server domain or IP address."
    echo "This will be used for:"
    echo "  - Web UI access URL"
    echo "  - API CORS configuration"
    echo "  - Client configuration"
    read -p "Server domain/IP (default: $SERVER_IP): " SERVER_DOMAIN </dev/tty
    SERVER_DOMAIN=${SERVER_DOMAIN:-$SERVER_IP}
    
    # Ask for protocol first
    echo ""
    read -p "Use HTTPS? [y/N]: " USE_HTTPS </dev/tty
    if [[ "$USE_HTTPS" == "y" || "$USE_HTTPS" == "Y" ]]; then
        PROTOCOL="https"
    else
        PROTOCOL="http"
    fi
    
    # Check if input is IP address or domain
    if [[ "$SERVER_DOMAIN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        # It's an IP address - ask for ports and include in URL
        echo ""
        echo "Configure ports (will be included in URLs for IP address):"
        read -p "Web UI port (default: 3000): " WEB_PORT </dev/tty
        WEB_PORT=${WEB_PORT:-3000}
        read -p "API port (default: 3001): " API_PORT </dev/tty
        API_PORT=${API_PORT:-3001}
        
        WEB_URL_VALUE="$PROTOCOL://$SERVER_DOMAIN:$WEB_PORT"
        API_URL_VALUE="$PROTOCOL://$SERVER_DOMAIN:$API_PORT"
    else
        # It's a domain - ask for separate domains for Web and API
        echo ""
        echo "Configure domains:"
        echo "Example: Web UI = vpn.example.com, API = api.vpn.example.com"
        read -p "API domain (default: api.$SERVER_DOMAIN): " API_DOMAIN </dev/tty
        API_DOMAIN=${API_DOMAIN:-api.$SERVER_DOMAIN}
        
        echo ""
        echo "Configure ports (for internal Docker configuration):"
        read -p "Web UI port (default: 3000): " WEB_PORT </dev/tty
        WEB_PORT=${WEB_PORT:-3000}
        read -p "API port (default: 3001): " API_PORT </dev/tty
        API_PORT=${API_PORT:-3001}
        
        WEB_URL_VALUE="$PROTOCOL://$SERVER_DOMAIN"
        API_URL_VALUE="$PROTOCOL://$API_DOMAIN"
    fi
    
    # Generate VPN token and registration key
    VPN_TOKEN=$(openssl rand -hex 32)
    NODE_REGISTRATION_KEY=$(openssl rand -hex 32)
    
    # Create .env file
    cat > .env << EOF
# ============================================================
# VPN Manager — Production Environment
# Generated on $(date)
# ============================================================

# ---- API ----
API_PORT=${API_PORT:-3001}
NODE_ENV=production

# ---- CORS ----
# IMPORTANT: Set this to the URL where users access the Web UI
# Example: https://vpn.yourdomain.com or http://your-server-ip:3000
WEB_URL=$WEB_URL_VALUE

# ---- JWT ----
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=7d

# ---- Node Registration Security ----
# Key for auto-registering VPN nodes (needed for node installation)
NODE_REGISTRATION_KEY=$NODE_REGISTRATION_KEY

# ---- VPN Hooks Authentication ----
# Token for authenticating VPN hooks (vpn-login, vpn-connect, vpn-disconnect)
VPN_TOKEN=$VPN_TOKEN

# ---- Database ----
DATABASE_TYPE=$DATABASE_TYPE
EOF

    if [ "$DATABASE_TYPE" = "postgres" ]; then
        cat >> .env << EOF

# PostgreSQL
POSTGRES_USER=vpn
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
POSTGRES_DB=vpn
POSTGRES_PORT=5432
DATABASE_URL=postgresql://vpn:$POSTGRES_PASSWORD@postgres:5432/vpn
EOF
    elif [ "$DATABASE_TYPE" = "mysql" ]; then
        cat >> .env << EOF

# MySQL/MariaDB
MYSQL_USER=vpn
MYSQL_PASSWORD=$MYSQL_PASSWORD
MYSQL_DATABASE=vpn
MYSQL_ROOT_PASSWORD=$MYSQL_ROOT_PASSWORD
MYSQL_PORT=3306
DATABASE_URL=mysql://vpn:$MYSQL_PASSWORD@mariadb:3306/vpn
EOF
    fi

    cat >> .env << EOF

# ---- Web UI ----
WEB_PORT=${WEB_PORT:-3000}
# IMPORTANT: This should be the full URL where API is accessible from user's browser
# Example: https://api.yourdomain.com or http://your-server-ip:3001
NEXT_PUBLIC_API_URL=$API_URL_VALUE
EOF

    # Add agent configuration if all-in-one mode
    if [ "$INSTALL_AGENT" = true ]; then
        cat >> .env << EOF

# ---- Agent (All-in-One Mode) ----
AGENT_MANAGER_URL=$API_URL_VALUE
AGENT_NODE_ID=$NODE_ID
AGENT_SECRET_TOKEN=$SECRET_TOKEN
AGENT_POLL_INTERVAL_MS=5000
AGENT_HEARTBEAT_INTERVAL_MS=30000
VPN_MANAGEMENT_HOST=host.docker.internal
VPN_MANAGEMENT_PORT=7505
VPN_MANAGEMENT_PASSWORD=
VPN_TYPE=openvpn
WIREGUARD_INTERFACE=wg0
EOF
    else
        cat >> .env << EOF

# ---- Agent (Optional - only needed when running agent) ----
AGENT_MANAGER_URL=$API_URL_VALUE
AGENT_NODE_ID=change-me
AGENT_SECRET_TOKEN=change-me
AGENT_POLL_INTERVAL_MS=5000
AGENT_HEARTBEAT_INTERVAL_MS=30000
EOF
    fi

    print_success "Environment configured"
    
    # Auto-register node if all-in-one mode
    if [ "$INSTALL_AGENT" = true ]; then
        print_info "Auto-registering VPN node..."
        
        # Wait a bit for variables to be set
        sleep 1
        
        # Get server info
        SERVER_IP=$(curl -s ifconfig.me || hostname -I | awk '{print $1}')
        HOSTNAME=${HOSTNAME:-$(hostname)}
        
        # We'll register after services are up
        NODE_ID=""
        SECRET_TOKEN=""
    fi
    
    # Save credentials to a secure file
    cat > credentials.txt << EOF
============================================================
VPN Manager - Installation Credentials
Generated on $(date)
============================================================

JWT Secret: $JWT_SECRET

Database Type: $DATABASE_TYPE

============================================================
VPN Node Installation Credentials
============================================================
These values are needed when installing VPN Node:

VPN_TOKEN: $VPN_TOKEN
NODE_REGISTRATION_KEY: $NODE_REGISTRATION_KEY

Installation command:
  MANAGER_URL=$API_URL_VALUE \\
  VPN_TOKEN=$VPN_TOKEN \\
  REG_KEY=$NODE_REGISTRATION_KEY \\
  curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/scripts/install-node.sh | sudo bash
EOF

    if [ "$DATABASE_TYPE" = "postgres" ]; then
        cat >> credentials.txt << EOF
PostgreSQL User: vpn
PostgreSQL Password: $POSTGRES_PASSWORD
PostgreSQL Database: vpn
EOF
    elif [ "$DATABASE_TYPE" = "mysql" ]; then
        cat >> credentials.txt << EOF
MySQL User: vpn
MySQL Password: $MYSQL_PASSWORD
MySQL Root Password: $MYSQL_ROOT_PASSWORD
MySQL Database: vpn
EOF
    fi

    cat >> credentials.txt << EOF

Web UI: $WEB_URL_VALUE
API: $API_URL_VALUE

Default Admin Credentials:
Username: admin
Password: Admin@1234!

⚠️  IMPORTANT: Change the default admin password immediately!
⚠️  Keep this file secure and delete it after saving the credentials!

============================================================
EOF

    chmod 600 credentials.txt
    print_success "Credentials saved to: $INSTALL_DIR/credentials.txt"
}

pull_images() {
    print_info "Pulling Docker images..."
    
    if docker compose pull; then
        print_success "Docker images pulled successfully"
    else
        print_warning "Failed to pull some images. They will be pulled on first start."
    fi
}

add_agent_to_compose() {
    print_info "Adding agent service to docker-compose..."
    
    # Add agent service to docker-compose.yml
    cat >> docker-compose.yml << 'EOF'

  # ── VPN Agent (All-in-One Mode) ──
  agent:
    image: ghcr.io/adityadarma/vpn-manager:agent
    container_name: vpn-agent
    restart: unless-stopped
    environment:
      NODE_ENV: production
      AGENT_MANAGER_URL: ${AGENT_MANAGER_URL:?AGENT_MANAGER_URL is required}
      AGENT_NODE_ID: ${AGENT_NODE_ID:?AGENT_NODE_ID is required}
      AGENT_SECRET_TOKEN: ${AGENT_SECRET_TOKEN:?AGENT_SECRET_TOKEN is required}
      VPN_TOKEN: ${VPN_TOKEN:?VPN_TOKEN is required}
      AGENT_POLL_INTERVAL_MS: ${AGENT_POLL_INTERVAL_MS:-5000}
      AGENT_HEARTBEAT_INTERVAL_MS: ${AGENT_HEARTBEAT_INTERVAL_MS:-30000}
      VPN_MANAGEMENT_HOST: ${VPN_MANAGEMENT_HOST:-host.docker.internal}
      VPN_MANAGEMENT_PORT: ${VPN_MANAGEMENT_PORT:-7505}
      VPN_MANAGEMENT_PASSWORD: ${VPN_MANAGEMENT_PASSWORD:-}
      VPN_TYPE: ${VPN_TYPE:-openvpn}
      WIREGUARD_INTERFACE: ${WIREGUARD_INTERFACE:-wg0}
    extra_hosts:
      - "host.docker.internal:host-gateway"
    volumes:
      - /etc/openvpn/server:/etc/openvpn/server:ro
      - /etc/openvpn/easy-rsa:/etc/openvpn/easy-rsa
    depends_on:
      api:
        condition: service_healthy
    networks:
      - vpn-network
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
EOF
    
    print_success "Agent service added to docker-compose"
}

start_services() {
    print_info "Starting services..."
    
    if docker compose $DATABASE_PROFILE up -d; then
        print_success "Services started successfully"
    else
        print_error "Failed to start services"
        print_info "Check logs with: docker compose logs"
        exit 1
    fi
}

wait_for_health() {
    print_info "Waiting for services to be healthy..."
    
    local max_attempts=30
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if curl -sf http://localhost:3001/api/v1/health > /dev/null 2>&1; then
            print_success "Services are healthy"
            return 0
        fi
        
        attempt=$((attempt + 1))
        echo -n "."
        sleep 2
    done
    
    echo ""
    print_warning "Services may not be fully healthy yet. Check logs if needed."
}

register_node() {
    print_info "Registering VPN node..."
    
    local SERVER_IP=$(curl -s ifconfig.me || hostname -I | awk '{print $1}')
    local HOSTNAME=${HOSTNAME:-$(hostname)}
    local API_URL="http://localhost:${API_PORT:-3001}"
    
    # Register node
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/v1/nodes/register" \
        -H "Content-Type: application/json" \
        -d "{\"hostname\":\"$HOSTNAME\",\"ip\":\"$SERVER_IP\",\"port\":1194,\"version\":\"auto\",\"registrationKey\":\"$NODE_REGISTRATION_KEY\"}")
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    
    if [ "$HTTP_CODE" == "201" ]; then
        NODE_ID=$(echo "$BODY" | grep -o '"id":"[^"]*' | cut -d'"' -f4)
        SECRET_TOKEN=$(echo "$BODY" | grep -o '"token":"[^"]*' | cut -d'"' -f4)
        
        # Update .env with node credentials
        sed -i "s|AGENT_NODE_ID=.*|AGENT_NODE_ID=$NODE_ID|" .env
        sed -i "s|AGENT_SECRET_TOKEN=.*|AGENT_SECRET_TOKEN=$SECRET_TOKEN|" .env
        
        print_success "Node registered: $NODE_ID"
        
        # Export for use in other functions
        export NODE_ID
        export SECRET_TOKEN
    else
        print_error "Node registration failed (HTTP $HTTP_CODE)"
        echo "$BODY"
        return 1
    fi
}

install_vpn_hooks() {
    print_info "Installing VPN hooks..."
    
    # Wait for agent container to be ready
    sleep 5
    
    HOOKS=(vpn-login vpn-connect vpn-disconnect)
    for hook in "${HOOKS[@]}"; do
        if docker compose exec -T agent cat "/app/dist/bin/${hook}.js" > "/tmp/${hook}.js" 2>/dev/null; then
            cat > "/usr/local/bin/${hook}" <<'WRAPPER'
#!/bin/bash
[ -f "/opt/vpn-manager/.env" ] && export $(grep -v '^#' /opt/vpn-manager/.env | xargs)
exec node /opt/vpn-manager/hooks/HOOK.js "$@"
WRAPPER
            sed -i "s/HOOK/${hook}/g" "/usr/local/bin/${hook}"
            chmod +x "/usr/local/bin/${hook}"
            mkdir -p /opt/vpn-manager/hooks
            mv "/tmp/${hook}.js" "/opt/vpn-manager/hooks/${hook}.js"
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
    
    print_success "VPN hooks installed"
}

create_backup_script() {
    print_info "Creating backup script..."
    
    cat > backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/opt/vpn-backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Load environment
source /opt/vpn-manager/.env

# Backup based on database type
if [ "$DATABASE_TYPE" = "sqlite" ]; then
    docker run --rm \
        -v vpn_api_data:/data \
        -v $BACKUP_DIR:/backup \
        alpine tar czf /backup/vpn-sqlite-$DATE.tar.gz /data
elif [ "$DATABASE_TYPE" = "postgres" ]; then
    docker compose -f /opt/vpn-manager/docker-compose.yml \
        exec -T postgres pg_dump -U vpn vpn > $BACKUP_DIR/vpn-postgres-$DATE.sql
elif [ "$DATABASE_TYPE" = "mysql" ]; then
    docker compose -f /opt/vpn-manager/docker-compose.yml \
        exec -T mariadb mysqldump -u vpn -p$MYSQL_PASSWORD vpn > $BACKUP_DIR/vpn-mysql-$DATE.sql
fi

# Keep only last 7 days
find $BACKUP_DIR -name "vpn-*" -mtime +7 -delete

echo "Backup completed: $DATE"
EOF

    chmod +x backup.sh
    print_success "Backup script created: $INSTALL_DIR/backup.sh"
}

print_summary() {
    echo ""
    echo -e "${GREEN}"
    echo "============================================================"
    echo "  Installation Complete!"
    echo "============================================================"
    echo -e "${NC}"
    echo ""
    
    if [ "$INSTALL_AGENT" = true ]; then
        echo -e "${GREEN}✓ All-in-One Mode: Manager + VPN Node installed${NC}"
        echo ""
        echo -e "${BLUE}Access Points:${NC}"
        echo "  Web UI: $WEB_URL_VALUE"
        echo "  API: $API_URL_VALUE"
        echo "  OpenVPN: UDP port 1194"
        echo ""
        echo -e "${BLUE}Default Credentials:${NC}"
        echo "  Username: admin"
        echo "  Password: Admin@1234!"
        echo ""
        echo -e "${BLUE}VPN Node Info:${NC}"
        echo "  Node ID: $NODE_ID"
        echo "  Status: Should be Online in Web UI"
        echo ""
        echo -e "${YELLOW}⚠️  IMPORTANT:${NC}"
        echo "  1. Change the default admin password immediately!"
        echo "  2. Review credentials in: $INSTALL_DIR/credentials.txt"
        echo "  3. Delete credentials.txt after saving them securely"
        if [ "$PROTOCOL" = "http" ]; then
            echo "  4. Consider setting up SSL/TLS with reverse proxy (nginx/caddy)"
        fi
        echo ""
        echo -e "${BLUE}Useful Commands:${NC}"
        echo "  View logs:       docker compose -f $INSTALL_DIR/docker-compose.yml logs -f"
        echo "  View agent logs: docker logs vpn-agent -f"
        echo "  View VPN logs:   tail -f /var/log/openvpn/openvpn.log"
        echo "  Stop:            docker compose -f $INSTALL_DIR/docker-compose.yml down"
        echo "  Restart:         docker compose -f $INSTALL_DIR/docker-compose.yml restart"
        echo "  Backup:          $INSTALL_DIR/backup.sh"
        echo ""
        echo -e "${BLUE}Next Steps:${NC}"
        echo "  1. Login to Web UI"
        echo "  2. Check node status (should be Online)"
        echo "  3. Create users and download VPN configs"
    else
        echo -e "${BLUE}Access Points:${NC}"
        echo "  Web UI: $WEB_URL_VALUE"
        echo "  API: $API_URL_VALUE"
        echo ""
        echo -e "${BLUE}Default Credentials:${NC}"
        echo "  Username: admin"
        echo "  Password: Admin@1234!"
        echo ""
        echo -e "${BLUE}VPN Node Installation Credentials:${NC}"
        echo "  VPN_TOKEN: $VPN_TOKEN"
        echo "  NODE_REGISTRATION_KEY: $NODE_REGISTRATION_KEY"
        echo ""
        echo "  To install VPN Node on another server, run:"
        echo "  curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/scripts/install-node.sh -o install-node.sh"
        echo "  chmod +x install-node.sh"
        echo "  sudo MANAGER_URL=$API_URL_VALUE \\"
        echo "  VPN_TOKEN=$VPN_TOKEN \\"
        echo "  REG_KEY=$NODE_REGISTRATION_KEY \\"
        echo "  ./install-node.sh"
        echo ""
        echo -e "${YELLOW}⚠️  IMPORTANT:${NC}"
        echo "  1. Change the default admin password immediately!"
        echo "  2. Review credentials in: $INSTALL_DIR/credentials.txt"
        echo "  3. Delete credentials.txt after saving them securely"
        if [ "$PROTOCOL" = "http" ]; then
            echo "  4. Consider setting up SSL/TLS with reverse proxy (nginx/caddy)"
        fi
        echo ""
        echo -e "${BLUE}Useful Commands:${NC}"
        echo "  View logs:    docker compose -f $INSTALL_DIR/docker-compose.yml logs -f"
        echo "  Stop:         docker compose -f $INSTALL_DIR/docker-compose.yml down"
        echo "  Restart:      docker compose -f $INSTALL_DIR/docker-compose.yml restart"
        echo "  Backup:       $INSTALL_DIR/backup.sh"
    fi
    
    echo ""
    echo -e "${BLUE}Documentation:${NC}"
    echo "  Full guide: https://github.com/adityadarma/vpn-manager/blob/main/docs/PRODUCTION-INSTALL.md"
    echo ""
}

# Main installation flow
main() {
    print_header
    
    check_root
    check_docker
    check_docker_compose
    create_install_dir
    download_files
    configure_env
    
    # Install OpenVPN if all-in-one mode
    if [ "$INSTALL_AGENT" = true ]; then
        install_openvpn
        add_agent_to_compose
    fi
    
    pull_images
    start_services
    wait_for_health
    
    # Register node and install hooks if all-in-one mode
    if [ "$INSTALL_AGENT" = true ]; then
        register_node
        
        # Restart agent with new credentials
        docker compose restart agent
        sleep 5
        
        install_vpn_hooks
    fi
    
    create_backup_script
    print_summary
}

# Run main function
main
