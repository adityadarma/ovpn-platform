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

configure_env() {
    print_info "Configuring environment variables..."
    
    # Generate JWT secret
    JWT_SECRET=$(generate_secret)
    
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
    
    # Ask for protocol
    read -p "Use HTTPS? [y/N]: " USE_HTTPS </dev/tty
    if [[ "$USE_HTTPS" == "y" || "$USE_HTTPS" == "Y" ]]; then
        PROTOCOL="https"
    else
        PROTOCOL="http"
    fi
    
    # Create .env file
    cat > .env << EOF
# ============================================================
# VPN Manager — Production Environment
# Generated on $(date)
# ============================================================

# ---- API ----
API_PORT=3001
NODE_ENV=production

# ---- CORS ----
# IMPORTANT: Set this to the URL where users access the Web UI
# Example: https://vpn.yourdomain.com or http://your-server-ip:3000
WEB_URL=$PROTOCOL://$SERVER_DOMAIN:3000

# ---- JWT ----
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=7d

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
WEB_PORT=3000
# IMPORTANT: This should be the full URL where API is accessible from user's browser
# Example: https://api.yourdomain.com or http://your-server-ip:3001
NEXT_PUBLIC_API_URL=$PROTOCOL://$SERVER_DOMAIN:3001

# ---- Agent (Optional - only needed when running agent) ----
AGENT_MANAGER_URL=http://$SERVER_DOMAIN:3001
AGENT_NODE_ID=change-me
AGENT_SECRET_TOKEN=change-me
AGENT_POLL_INTERVAL_MS=5000
AGENT_HEARTBEAT_INTERVAL_MS=30000
EOF

    print_success "Environment configured"
    
    # Save credentials to a secure file
    cat > credentials.txt << EOF
============================================================
VPN Manager - Installation Credentials
Generated on $(date)
============================================================

JWT Secret: $JWT_SECRET

Database Type: $DATABASE_TYPE
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

Web UI: $PROTOCOL://$SERVER_DOMAIN:3000
API: $PROTOCOL://$SERVER_DOMAIN:3001

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
    echo -e "${BLUE}Access Points:${NC}"
    echo "  Web UI: $PROTOCOL://$SERVER_DOMAIN:3000"
    echo "  API: $PROTOCOL://$SERVER_DOMAIN:3001"
    echo ""
    echo -e "${BLUE}Default Credentials:${NC}"
    echo "  Username: admin"
    echo "  Password: Admin@1234!"
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
    pull_images
    start_services
    wait_for_health
    create_backup_script
    print_summary
}

# Run main function
main
