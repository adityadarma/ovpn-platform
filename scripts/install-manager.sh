#!/bin/bash
# ============================================================
# VPN Manager - Manager Installation (API + Web + DB Only)
# ============================================================
# Installs only the management components without OpenVPN
# For OpenVPN node installation, use install-node.sh
#
# Usage:
#   sudo bash scripts/install-manager.sh
# ============================================================

set -e

# Colors
G='\033[0;32m'; Y='\033[1;33m'; B='\033[0;34m'; R='\033[0;31m'; NC='\033[0m'
ok() { echo -e "${G}✓ $1${NC}"; }
info() { echo -e "${B}ℹ $1${NC}"; }
warn() { echo -e "${Y}⚠ $1${NC}"; }
error() { echo -e "${R}✗ $1${NC}"; }

INSTALL_DIR="/opt/vpn-manager"

# Check root
[ "$EUID" -ne 0 ] && { error "Must run as root"; exit 1; }

echo -e "${B}============================================================"
echo "  VPN Manager - Manager Installation"
echo "============================================================${NC}"
echo ""

# Check Docker
if ! command -v docker &> /dev/null; then
    error "Docker not installed"
    info "Install: https://docs.docker.com/engine/install/"
    exit 1
fi
ok "Docker installed"

if ! docker compose version &> /dev/null; then
    error "Docker Compose v2 not installed"
    exit 1
fi
ok "Docker Compose installed"
echo ""

# Create install directory
info "Creating installation directory..."
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"
ok "Directory created: $INSTALL_DIR"
echo ""

# Download required files if not exists
if [ ! -f "docker-compose.yml" ]; then
    info "Downloading docker-compose.yml..."
    if command -v git &> /dev/null && [ -d ".git" ]; then
        # If in git repo, use local file
        warn "Please ensure docker-compose.yml is in $INSTALL_DIR"
        exit 1
    else
        # Download from GitHub
        REPO_URL="https://raw.githubusercontent.com/adityadarma/vpn-manager/main"
        if curl -fsSL "$REPO_URL/docker-compose.yml" -o docker-compose.yml; then
            ok "Downloaded docker-compose.yml"
        else
            error "Failed to download docker-compose.yml"
            exit 1
        fi
    fi
fi
echo ""

# Generate secrets
info "Generating secrets..."
JWT_SECRET=$(openssl rand -base64 32)
ok "Secrets generated"
echo ""

# Database selection
echo "Select database:"
echo "1) SQLite (default, simple)"
echo "2) PostgreSQL (production)"
echo "3) MySQL/MariaDB"
read -p "Choice [1-3] (default: 1): " db_choice </dev/tty
db_choice=${db_choice:-1}

case $db_choice in
    1)
        DATABASE_TYPE="sqlite"
        DATABASE_PROFILE=""
        ok "Using SQLite"
        ;;
    2)
        DATABASE_TYPE="postgres"
        DATABASE_PROFILE="--profile postgres"
        read -p "PostgreSQL password (auto-generate if empty): " POSTGRES_PASSWORD </dev/tty
        POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-$(openssl rand -base64 32 | tr -d '/')}
        ok "Using PostgreSQL"
        ;;
    3)
        DATABASE_TYPE="mysql"
        DATABASE_PROFILE="--profile mysql"
        read -p "MySQL password (auto-generate if empty): " MYSQL_PASSWORD </dev/tty
        MYSQL_PASSWORD=${MYSQL_PASSWORD:-$(openssl rand -base64 32 | tr -d '/')}
        read -p "MySQL root password (auto-generate if empty): " MYSQL_ROOT_PASSWORD </dev/tty
        MYSQL_ROOT_PASSWORD=${MYSQL_ROOT_PASSWORD:-$(openssl rand -base64 32 | tr -d '/')}
        ok "Using MySQL"
        ;;
esac
echo ""

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
    
    WEB_URL="$PROTOCOL://$SERVER_DOMAIN:$WEB_PORT"
    API_URL="$PROTOCOL://$SERVER_DOMAIN:$API_PORT"
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
    
    WEB_URL="$PROTOCOL://$SERVER_DOMAIN"
    API_URL="$PROTOCOL://$API_DOMAIN"
fi

# Node registration key
read -p "Node registration key (auto-generate if empty): " NODE_REG_KEY </dev/tty
NODE_REG_KEY=${NODE_REG_KEY:-$(openssl rand -hex 16)}

echo ""
ok "Configuration complete"
echo ""

# Create .env file
info "Creating .env file..."
cat > .env <<EOF
# Database
DATABASE_TYPE=${DATABASE_TYPE}
${DATABASE_TYPE:+DATABASE_URL=}

# PostgreSQL (if selected)
${POSTGRES_PASSWORD:+POSTGRES_PASSWORD=${POSTGRES_PASSWORD}}

# MySQL (if selected)
${MYSQL_PASSWORD:+MYSQL_PASSWORD=${MYSQL_PASSWORD}}
${MYSQL_ROOT_PASSWORD:+MYSQL_ROOT_PASSWORD=${MYSQL_ROOT_PASSWORD}}

# API
JWT_SECRET=${JWT_SECRET}
API_URL=${API_URL}
CORS_ORIGIN=${WEB_URL}
API_PORT=${API_PORT}

# Web
NEXT_PUBLIC_API_URL=${API_URL}
WEB_PORT=${WEB_PORT}

# Node Registration
NODE_REGISTRATION_KEY=${NODE_REG_KEY}
EOF

ok ".env file created"
echo ""

# Start services
info "Starting services..."
docker compose $DATABASE_PROFILE pull
docker compose $DATABASE_PROFILE up -d

sleep 5

# Wait for API to be healthy
info "Waiting for API to be ready..."
MAX_WAIT=60
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
    if curl -sf "${API_URL}/health" > /dev/null 2>&1; then
        ok "API is ready"
        break
    fi
    sleep 2
    ((WAITED+=2))
    echo -n "."
done
echo ""

if [ $WAITED -ge $MAX_WAIT ]; then
    warn "API health check timeout"
    info "Check logs: docker logs vpn-api"
fi

# Show summary
echo ""
echo -e "${B}============================================================"
echo "  Installation Complete!"
echo "============================================================${NC}"
echo ""
echo "Access URLs:"
echo "  Web UI: $WEB_URL"
echo "  API: $API_URL"
echo ""
echo "Default Credentials:"
echo "  Username: admin"
echo "  Password: Admin@1234!"
echo ""
echo "Node Registration Key:"
echo "  $NODE_REG_KEY"
echo ""
echo "Next Steps:"
echo "  1. Login to Web UI and change admin password"
echo "  2. Install OpenVPN nodes using:"
echo "     bash scripts/install-node.sh"
echo ""
echo "Useful Commands:"
echo "  View logs: docker compose logs -f"
echo "  Restart: docker compose restart"
echo "  Stop: docker compose down"
echo "  Update: docker compose pull && docker compose up -d"
echo ""
echo "Installation directory: $INSTALL_DIR"
echo "============================================================"
echo ""
