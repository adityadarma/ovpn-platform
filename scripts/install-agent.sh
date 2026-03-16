#!/bin/bash
# ============================================================
# OpenVPN Manager - Standalone Agent Installation Script
# ============================================================
# This script installs only the Agent on a VPN node server
# Usage: curl -fsSL https://raw.githubusercontent.com/adityadarma/ovpn-manager/main/scripts/install-agent.sh | sudo bash
# ============================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
INSTALL_DIR="/opt/ovpn-agent"
REPO_URL="https://raw.githubusercontent.com/adityadarma/ovpn-manager/main"

# Functions
print_header() {
    echo -e "${BLUE}"
    echo "============================================================"
    echo "  OpenVPN Manager - Standalone Agent Installation"
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
        print_info "Installing Docker..."
        curl -fsSL https://get.docker.com | sh
        print_success "Docker installed"
    else
        print_success "Docker is installed"
    fi
}

check_docker_compose() {
    if ! docker compose version &> /dev/null; then
        print_error "Docker Compose v2 is not installed"
        print_info "Install Docker Compose: https://docs.docker.com/compose/install/"
        exit 1
    fi
    print_success "Docker Compose is installed"
}

check_openvpn() {
    if [ ! -d "/etc/openvpn/server" ]; then
        print_warning "OpenVPN server directory not found at /etc/openvpn/server"
        print_info "Make sure OpenVPN is installed first"
        read -p "Do you want to install OpenVPN server now? [y/N]: " install_vpn </dev/tty
        if [[ "$install_vpn" == "y" || "$install_vpn" == "Y" ]]; then
            install_openvpn_server
        else
            print_error "OpenVPN is required. Exiting."
            exit 1
        fi
    else
        print_success "OpenVPN server directory found"
    fi
}

install_openvpn_server() {
    print_info "Installing OpenVPN server..."
    
    # Download and run vpn-server.sh
    curl -fsSL "$REPO_URL/scripts/vpn-server.sh" -o /tmp/vpn-server.sh
    chmod +x /tmp/vpn-server.sh
    /tmp/vpn-server.sh install
    rm -f /tmp/vpn-server.sh
    
    print_success "OpenVPN server installed"
}

create_install_dir() {
    print_info "Creating installation directory: $INSTALL_DIR"
    mkdir -p "$INSTALL_DIR"
    cd "$INSTALL_DIR"
    print_success "Installation directory created"
}

download_files() {
    print_info "Downloading configuration files..."
    
    # Download docker-compose for agent
    if curl -fsSL "$REPO_URL/docker-compose.agent.yml" -o docker-compose.yml; then
        print_success "Downloaded docker-compose.yml"
    else
        print_error "Failed to download docker-compose.yml"
        exit 1
    fi
    
    # Download .env template from apps/agent
    if curl -fsSL "$REPO_URL/apps/agent/.env.example" -o .env.template; then
        print_success "Downloaded .env template"
    else
        print_error "Failed to download .env template"
        exit 1
    fi
}

auto_register_node() {
    local manager_url=$1
    local hostname=$2
    local ip_address=$3
    local region=$4
    local auth_method=$5
    local auth_value=$6
    
    print_info "Attempting auto-registration..."
    
    # Read VPN server config if exists
    local vpn_config=""
    if [ -f "/etc/openvpn/server/install-config.json" ]; then
        print_info "Found VPN server configuration, will sync to database..."
        vpn_config=$(cat /etc/openvpn/server/install-config.json)
    fi
    
    local response
    local http_code
    
    # Prepare JSON payload
    local json_payload
    if [ -n "$vpn_config" ]; then
        # Merge node info with VPN config
        json_payload=$(cat <<EOF
{
  "hostname": "$hostname",
  "ip": "$ip_address",
  "region": "$region",
  "version": "auto-registered",
  "registrationKey": "$auth_value",
  "config": $vpn_config
}
EOF
)
    else
        # No VPN config, use defaults
        json_payload=$(cat <<EOF
{
  "hostname": "$hostname",
  "ip": "$ip_address",
  "port": 1194,
  "region": "$region",
  "version": "auto-registered",
  "registrationKey": "$auth_value"
}
EOF
)
    fi
    
    # Make API call
    if [ "$auth_method" == "jwt" ]; then
        response=$(curl -s -w "\n%{http_code}" -X POST "$manager_url/api/v1/nodes/register" \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer $auth_value" \
            -d "$json_payload" 2>&1)
    else
        response=$(curl -s -w "\n%{http_code}" -X POST "$manager_url/api/v1/nodes/register" \
            -H "Content-Type: application/json" \
            -d "$json_payload" 2>&1)
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" == "201" ]; then
        # Parse response
        NODE_ID=$(echo "$body" | grep -o '"id":"[^"]*' | cut -d'"' -f4)
        SECRET_TOKEN=$(echo "$body" | grep -o '"token":"[^"]*' | cut -d'"' -f4)
        
        if [ -n "$NODE_ID" ] && [ -n "$SECRET_TOKEN" ]; then
            print_success "Node registered successfully!"
            print_success "Node ID: $NODE_ID"
            if [ -n "$vpn_config" ]; then
                print_success "VPN configuration synced to database"
            fi
            return 0
        else
            print_error "Failed to parse registration response"
            return 1
        fi
    else
        print_error "Registration failed (HTTP $http_code)"
        echo "$body" | grep -o '"message":"[^"]*' | cut -d'"' -f4
        return 1
    fi
}

configure_env() {
    print_info "Configuring environment variables..."
    
    echo ""
    echo "============================================================"
    echo "  Agent Configuration"
    echo "============================================================"
    echo ""
    
    # Get Manager URL
    read -p "Enter Manager API URL (e.g., http://manager-server:3001): " MANAGER_URL </dev/tty
    while [ -z "$MANAGER_URL" ]; do
        print_error "Manager URL is required"
        read -p "Enter Manager API URL: " MANAGER_URL </dev/tty
    done
    
    # Check if auto-registration is available
    echo ""
    print_info "Registration Options:"
    echo "  1. Auto-register (requires Admin JWT token or Registration Key)"
    echo "  2. Manual registration (use existing Node ID and Secret Token)"
    echo ""
    read -p "Choose registration method [1/2] (default: 2): " REG_METHOD </dev/tty
    REG_METHOD=${REG_METHOD:-2}
    
    if [ "$REG_METHOD" == "1" ]; then
        # Auto-registration
        echo ""
        print_info "Auto-Registration Setup"
        echo ""
        
        # Get hostname
        DEFAULT_HOSTNAME=$(hostname)
        read -p "Enter hostname (default: $DEFAULT_HOSTNAME): " HOSTNAME </dev/tty
        HOSTNAME=${HOSTNAME:-$DEFAULT_HOSTNAME}
        
        # Get IP address
        DEFAULT_IP=$(hostname -I | awk '{print $1}')
        read -p "Enter public IP address (default: $DEFAULT_IP): " IP_ADDRESS </dev/tty
        IP_ADDRESS=${IP_ADDRESS:-$DEFAULT_IP}
        
        # Get region (optional)
        read -p "Enter region/location (optional, e.g., Singapore, US-East): " REGION </dev/tty
        
        # Choose auth method
        echo ""
        print_info "Authentication Method:"
        echo "  1. Admin JWT Token (login to Web UI first, copy token from browser)"
        echo "  2. Registration Key (from NODE_REGISTRATION_KEY in .env)"
        echo ""
        read -p "Choose auth method [1/2]: " AUTH_METHOD </dev/tty
        
        if [ "$AUTH_METHOD" == "1" ]; then
            echo ""
            print_info "To get Admin JWT Token:"
            print_info "1. Login to Manager Web UI as admin"
            print_info "2. Open browser DevTools (F12) → Application/Storage → Local Storage"
            print_info "3. Copy the 'token' value"
            echo ""
            read -p "Enter Admin JWT Token: " JWT_TOKEN </dev/tty
            while [ -z "$JWT_TOKEN" ]; do
                print_error "JWT Token is required"
                read -p "Enter Admin JWT Token: " JWT_TOKEN </dev/tty
            done
            
            if auto_register_node "$MANAGER_URL" "$HOSTNAME" "$IP_ADDRESS" "$REGION" "jwt" "$JWT_TOKEN"; then
                print_success "Auto-registration successful!"
            else
                print_error "Auto-registration failed. Falling back to manual registration."
                REG_METHOD=2
            fi
        else
            echo ""
            read -p "Enter Registration Key (from NODE_REGISTRATION_KEY): " REG_KEY </dev/tty
            while [ -z "$REG_KEY" ]; do
                print_error "Registration Key is required"
                read -p "Enter Registration Key: " REG_KEY </dev/tty
            done
            
            if auto_register_node "$MANAGER_URL" "$HOSTNAME" "$IP_ADDRESS" "$REGION" "key" "$REG_KEY"; then
                print_success "Auto-registration successful!"
            else
                print_error "Auto-registration failed. Falling back to manual registration."
                REG_METHOD=2
            fi
        fi
    fi
    
    # Manual registration (or fallback from failed auto-registration)
    if [ "$REG_METHOD" == "2" ] || [ -z "$NODE_ID" ] || [ -z "$SECRET_TOKEN" ]; then
        echo ""
        print_info "Manual Registration"
        print_info "To get Node ID and Secret Token:"
        print_info "1. Go to Manager Web UI → Nodes → Add Node"
        print_info "2. Fill in node details and click 'Register'"
        print_info "3. Copy the Node ID and Secret Token"
        echo ""
        
        read -p "Enter Node ID: " NODE_ID </dev/tty
        while [ -z "$NODE_ID" ]; do
            print_error "Node ID is required"
            read -p "Enter Node ID: " NODE_ID </dev/tty
        done
        
        read -p "Enter Secret Token: " SECRET_TOKEN </dev/tty
        while [ -z "$SECRET_TOKEN" ]; do
            print_error "Secret Token is required"
            read -p "Enter Secret Token: " SECRET_TOKEN </dev/tty
        done
    fi
    
    # Optional: Poll and Heartbeat intervals
    read -p "Poll interval in milliseconds (default: 5000): " POLL_INTERVAL </dev/tty
    POLL_INTERVAL=${POLL_INTERVAL:-5000}
    
    read -p "Heartbeat interval in milliseconds (default: 30000): " HEARTBEAT_INTERVAL </dev/tty
    HEARTBEAT_INTERVAL=${HEARTBEAT_INTERVAL:-30000}
    
    # Create .env file from template
    cp .env.template .env
    
    # Update values in .env
    sed -i "s|AGENT_MANAGER_URL=.*|AGENT_MANAGER_URL=$MANAGER_URL|g" .env
    sed -i "s|AGENT_NODE_ID=.*|AGENT_NODE_ID=$NODE_ID|g" .env
    sed -i "s|AGENT_SECRET_TOKEN=.*|AGENT_SECRET_TOKEN=$SECRET_TOKEN|g" .env
    sed -i "s|AGENT_POLL_INTERVAL_MS=.*|AGENT_POLL_INTERVAL_MS=$POLL_INTERVAL|g" .env
    sed -i "s|AGENT_HEARTBEAT_INTERVAL_MS=.*|AGENT_HEARTBEAT_INTERVAL_MS=$HEARTBEAT_INTERVAL|g" .env
    sed -i "s|NODE_ENV=.*|NODE_ENV=production|g" .env

    print_success "Environment configured"
    
    # Save credentials to a secure file
    cat > credentials.txt << EOF
============================================================
OpenVPN Manager - Agent Credentials
Generated on $(date)
============================================================

Manager URL: $MANAGER_URL
Node ID: $NODE_ID
Secret Token: $SECRET_TOKEN

Poll Interval: $POLL_INTERVAL ms
Heartbeat Interval: $HEARTBEAT_INTERVAL ms

⚠️  IMPORTANT: Keep this file secure and delete it after saving the credentials!

============================================================
EOF

    chmod 600 credentials.txt
    print_success "Credentials saved to: $INSTALL_DIR/credentials.txt"
}

pull_image() {
    print_info "Pulling Docker image..."
    
    if docker compose pull; then
        print_success "Docker image pulled successfully"
    else
        print_warning "Failed to pull image. It will be pulled on first start."
    fi
}

start_agent() {
    print_info "Starting agent..."
    
    if docker compose up -d; then
        print_success "Agent started successfully"
    else
        print_error "Failed to start agent"
        print_info "Check logs with: docker compose logs"
        exit 1
    fi
}

wait_for_agent() {
    print_info "Waiting for agent to connect..."
    
    local max_attempts=10
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if docker compose logs agent 2>&1 | grep -q "Connected to manager\|Heartbeat sent"; then
            print_success "Agent connected to manager"
            return 0
        fi
        
        attempt=$((attempt + 1))
        echo -n "."
        sleep 2
    done
    
    echo ""
    print_warning "Could not verify agent connection. Check logs if needed."
}

create_management_scripts() {
    print_info "Creating management scripts..."
    
    # Start script
    cat > start.sh << 'EOF'
#!/bin/bash
cd /opt/ovpn-agent
docker compose up -d
echo "Agent started"
EOF
    chmod +x start.sh
    
    # Stop script
    cat > stop.sh << 'EOF'
#!/bin/bash
cd /opt/ovpn-agent
docker compose down
echo "Agent stopped"
EOF
    chmod +x stop.sh
    
    # Restart script
    cat > restart.sh << 'EOF'
#!/bin/bash
cd /opt/ovpn-agent
docker compose restart
echo "Agent restarted"
EOF
    chmod +x restart.sh
    
    # Logs script
    cat > logs.sh << 'EOF'
#!/bin/bash
cd /opt/ovpn-agent
docker compose logs -f
EOF
    chmod +x logs.sh
    
    # Status script
    cat > status.sh << 'EOF'
#!/bin/bash
cd /opt/ovpn-agent
docker compose ps
echo ""
echo "Recent logs:"
docker compose logs --tail=20
EOF
    chmod +x status.sh
    
    print_success "Management scripts created"
}

setup_systemd_service() {
    print_info "Setting up systemd service..."
    
    cat > /etc/systemd/system/ovpn-agent.service << EOF
[Unit]
Description=OpenVPN Manager Agent
Requires=docker.service
After=docker.service openvpn-server@server.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable ovpn-agent.service
    
    print_success "Systemd service created and enabled"
}

print_summary() {
    echo ""
    echo -e "${GREEN}"
    echo "============================================================"
    echo "  Installation Complete!"
    echo "============================================================"
    echo -e "${NC}"
    echo ""
    echo -e "${BLUE}Installation Directory:${NC}"
    echo "  $INSTALL_DIR"
    echo ""
    echo -e "${BLUE}Agent Status:${NC}"
    docker compose ps
    echo ""
    echo -e "${BLUE}Management Commands:${NC}"
    echo "  Start:    $INSTALL_DIR/start.sh   or   systemctl start ovpn-agent"
    echo "  Stop:     $INSTALL_DIR/stop.sh    or   systemctl stop ovpn-agent"
    echo "  Restart:  $INSTALL_DIR/restart.sh or   systemctl restart ovpn-agent"
    echo "  Logs:     $INSTALL_DIR/logs.sh"
    echo "  Status:   $INSTALL_DIR/status.sh"
    echo ""
    echo -e "${BLUE}Configuration:${NC}"
    echo "  Config file: $INSTALL_DIR/.env"
    echo "  Credentials: $INSTALL_DIR/credentials.txt"
    echo ""
    echo -e "${YELLOW}⚠️  IMPORTANT:${NC}"
    echo "  1. Delete credentials.txt after saving them securely"
    echo "  2. Check agent logs to verify connection: $INSTALL_DIR/logs.sh"
    echo "  3. Verify node status in Manager Web UI"
    echo ""
    echo -e "${BLUE}Troubleshooting:${NC}"
    echo "  View logs:        docker compose -f $INSTALL_DIR/docker-compose.yml logs -f"
    echo "  Check connection: curl -v $MANAGER_URL/api/v1/health"
    echo "  Restart agent:    systemctl restart ovpn-agent"
    echo ""
}

# Main installation flow
main() {
    print_header
    
    check_root
    check_docker
    check_docker_compose
    check_openvpn
    create_install_dir
    download_files
    configure_env
    pull_image
    start_agent
    wait_for_agent
    create_management_scripts
    setup_systemd_service
    print_summary
}

# Run main function
main
