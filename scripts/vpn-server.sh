#!/bin/bash

# Disable exit on error for better error handling
# set -e

# ==========================================
# VPN Manager - VPN Node Auto Installer
# ==========================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_error() {
    echo -e "${RED}✗ $1${NC}" >&2
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Make sure only root can run our script
if [ "$(id -u)" != "0" ]; then
   print_error "This script must be run as root"
   exit 1
fi

ACTION=$1

if [ -z "$ACTION" ]; then
    echo "Usage: $0 [install|uninstall]"
    exit 1
fi

# Default values
VPN_PORT=1194
VPN_PROTOCOL="udp"
VPN_NET="10.8.0.0"
VPN_MASK="255.255.255.0"
TUNNEL_MODE="full"  # full or split

# Interactive configuration for install
if [ "$ACTION" == "install" ]; then
    echo "================================="
    echo "VPN Server Configuration"
    echo "================================="
    echo ""
    
    # Port configuration
    read -p "Enter VPN port (default: 1194): " INPUT_PORT
    VPN_PORT=${INPUT_PORT:-1194}
    
    # Protocol configuration
    echo ""
    echo "Select protocol:"
    echo "1) UDP (recommended - faster, better for streaming)"
    echo "2) TCP (more reliable, works through restrictive firewalls)"
    read -p "Enter choice [1-2] (default: 1): " PROTO_CHOICE
    PROTO_CHOICE=${PROTO_CHOICE:-1}
    
    if [ "$PROTO_CHOICE" == "2" ]; then
        VPN_PROTOCOL="tcp"
    else
        VPN_PROTOCOL="udp"
    fi
    
    # Tunnel mode configuration
    echo ""
    echo "Select tunnel mode:"
    echo "1) Split Tunnel - Only route specific networks through VPN (recommended - better performance)"
    echo "2) Full Tunnel - Route all traffic through VPN (maximum security)"
    read -p "Enter choice [1-2] (default: 1): " TUNNEL_CHOICE
    TUNNEL_CHOICE=${TUNNEL_CHOICE:-1}
    
    if [ "$TUNNEL_CHOICE" == "2" ]; then
        TUNNEL_MODE="full"
    else
        TUNNEL_MODE="split"
    fi
    
    # VPN network configuration
    echo ""
    read -p "Enter VPN network (default: 10.8.0.0): " INPUT_NET
    VPN_NET=${INPUT_NET:-10.8.0.0}
    
    echo ""
    echo "Configuration Summary:"
    echo "  Port: $VPN_PORT"
    echo "  Protocol: $VPN_PROTOCOL"
    echo "  Tunnel Mode: $TUNNEL_MODE"
    echo "  VPN Network: $VPN_NET/24"
    echo ""
    read -p "Continue with this configuration? [Y/n]: " CONFIRM
    if [[ "$CONFIRM" == "n" || "$CONFIRM" == "N" ]]; then
        echo "Installation cancelled."
        exit 0
    fi
fi

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    echo "Cannot detect OS. Exiting."
    exit 1
fi

# Detect primary interface
PRIMARY_IF=$(ip -4 route ls | grep default | grep -Po '(?<=dev )(\S+)' | head -1)
if [ -z "$PRIMARY_IF" ]; then
    PRIMARY_IF="eth0"
fi
PUBLIC_IP=$(curl -s ifconfig.me || curl -s icanhazip.com || echo "YOUR_SERVER_IP")

install_vpn() {
    if [ -d "/etc/openvpn/server" ] && [ -f "/etc/openvpn/server/server.conf" ]; then
        print_warning "OpenVPN is already installed. Use '$0 uninstall' first if you want to reinstall."
        exit 1
    fi

    echo "================================="
    echo "Installing OpenVPN Server"
    echo "================================="

    # Install packages
    print_success "Installing packages..."
    if [[ "$OS" == "ubuntu" || "$OS" == "debian" ]]; then
        if ! apt-get update -y; then
            print_error "Failed to update package list"
            print_error "Check your internet connection and try: apt-get update"
            exit 1
        fi
        
        if ! apt-get install -y openvpn easy-rsa iptables curl wget tar; then
            print_error "Failed to install required packages"
            print_error "Try manually: apt-get install -y openvpn easy-rsa iptables curl wget tar"
            exit 1
        fi
    elif [[ "$OS" == "centos" || "$OS" == "rhel" || "$OS" == "fedora" || "$OS" == "rocky" || "$OS" == "almalinux" ]]; then
        yum install -y epel-release || true
        
        if ! yum install -y openvpn easy-rsa iptables curl wget tar; then
            print_error "Failed to install required packages"
            print_error "Try manually: yum install -y openvpn easy-rsa iptables curl wget tar"
            exit 1
        fi
    else
        print_error "Unsupported OS: $OS. Please use Ubuntu, Debian, CentOS, RHEL, Fedora, Rocky, or AlmaLinux."
        exit 1
    fi
    
    print_success "Packages installed"

    echo "================================="
    echo "Configuring PKI (EasyRSA)"
    echo "================================="
    
    # Initialize EasyRSA
    mkdir -p /etc/openvpn/easy-rsa
    if [ -d "/usr/share/easy-rsa" ]; then
        cp -r /usr/share/easy-rsa/* /etc/openvpn/easy-rsa/
        print_success "EasyRSA copied"
    else
        print_error "EasyRSA not found in /usr/share/easy-rsa"
        print_error "Package installation may have failed"
        exit 1
    fi
    
    cd /etc/openvpn/easy-rsa

    # Generate PKI and Certificates
    print_success "Initializing PKI..."
    if ! ./easyrsa init-pki; then
        print_error "Failed to initialize PKI"
        exit 1
    fi
    
    print_success "Building CA..."
    if ! EASYRSA_BATCH=1 ./easyrsa build-ca nopass; then
        print_error "Failed to build CA"
        exit 1
    fi
    
    print_success "Building server certificate..."
    if ! EASYRSA_BATCH=1 ./easyrsa build-server-full server nopass; then
        print_error "Failed to build server certificate"
        exit 1
    fi
    
    print_success "Generating DH parameters (this may take a while)..."
    if ! EASYRSA_BATCH=1 ./easyrsa gen-dh; then
        print_error "Failed to generate DH parameters"
        exit 1
    fi
    
    # Create server directory before generating keys
    mkdir -p /etc/openvpn/server
    mkdir -p /var/log/openvpn
    
    # Fix permissions based on OS
    if [[ "$OS" == "ubuntu" || "$OS" == "debian" ]]; then
        chown nobody:nogroup /var/log/openvpn || true
    else
        chown nobody:nobody /var/log/openvpn || true
    fi
    
    # Generate TLS-Crypt Key (more secure than tls-auth)
    print_success "Generating TLS-Crypt key..."
    if ! openvpn --genkey secret /etc/openvpn/server/tls-crypt.key; then
        print_error "Failed to generate TLS-Crypt key"
        exit 1
    fi

    # Move files to openvpn server directory
    print_success "Copying certificates..."
    cp pki/ca.crt /etc/openvpn/server/
    cp pki/private/server.key /etc/openvpn/server/
    cp pki/issued/server.crt /etc/openvpn/server/
    cp pki/dh.pem /etc/openvpn/server/

    echo "================================="
    echo "Creating OpenVPN Config"
    echo "================================="

    cat <<EOF > /etc/openvpn/server/server.conf
port $VPN_PORT
proto $VPN_PROTOCOL
dev tun

ca /etc/openvpn/server/ca.crt
cert /etc/openvpn/server/server.crt
key /etc/openvpn/server/server.key
dh /etc/openvpn/server/dh.pem
tls-crypt /etc/openvpn/server/tls-crypt.key

server $VPN_NET $VPN_MASK
topology subnet

# DNS servers
push "dhcp-option DNS 8.8.8.8"
push "dhcp-option DNS 1.1.1.1"

# Tunnel mode configuration
EOF

    if [ "$TUNNEL_MODE" == "full" ]; then
        cat <<EOF >> /etc/openvpn/server/server.conf
# Full Tunnel - Route all traffic through VPN
push "redirect-gateway def1 bypass-dhcp"
EOF
    else
        cat <<EOF >> /etc/openvpn/server/server.conf
# Split Tunnel - Only route VPN network
# Additional routes can be pushed by Manager Agent
# Example: push "route 192.168.1.0 255.255.255.0"
EOF
    fi

    cat <<EOF >> /etc/openvpn/server/server.conf

keepalive 10 120
cipher AES-256-GCM
persist-key
persist-tun

# Client certificate authentication (default)
# For username/password auth, the Manager Agent will configure this later

# Drop privileges (comment out if you have permission issues)
user nobody
group nogroup

status /var/log/openvpn/status.log
log /var/log/openvpn/openvpn.log
verb 3
EOF

    # Save configuration for reference and agent sync
    cat <<EOF > /etc/openvpn/server/install-config.json
{
  "port": $VPN_PORT,
  "protocol": "$VPN_PROTOCOL",
  "tunnel_mode": "$TUNNEL_MODE",
  "vpn_network": "$VPN_NET",
  "vpn_netmask": "$VPN_MASK",
  "dns_servers": "8.8.8.8,1.1.1.1",
  "push_routes": "",
  "cipher": "AES-256-GCM",
  "auth_digest": "SHA256",
  "compression": "lz4-v2",
  "keepalive_ping": 10,
  "keepalive_timeout": 120,
  "max_clients": 100,
  "primary_interface": "$PRIMARY_IF",
  "public_ip": "$PUBLIC_IP",
  "installed_at": "$(date -Iseconds)"
}
EOF

    # Also save in text format for easy reading
    cat <<EOF > /etc/openvpn/server/install-config.txt
VPN_PORT=$VPN_PORT
VPN_PROTOCOL=$VPN_PROTOCOL
VPN_NET=$VPN_NET
VPN_MASK=$VPN_MASK
TUNNEL_MODE=$TUNNEL_MODE
PRIMARY_IF=$PRIMARY_IF
PUBLIC_IP=$PUBLIC_IP
INSTALLED_AT=$(date)
EOF

    chmod 644 /etc/openvpn/server/install-config.json
    chmod 644 /etc/openvpn/server/install-config.txt
    
    print_success "Configuration files created"

    echo "================================="
    echo "Configuring Networking (NAT & Forwarding)"
    echo "================================="

    # Enable IP forwarding
    print_success "Enabling IP forwarding..."
    sed -i '/net.ipv4.ip_forward/d' /etc/sysctl.conf
    echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
    if ! sysctl -p > /dev/null 2>&1; then
        print_warning "Failed to apply sysctl settings (non-fatal)"
    fi

    # Setup NAT using iptables service
    print_success "Setting up NAT rules..."
    cat <<EOF > /etc/systemd/system/openvpn-iptables.service
[Unit]
Before=network.target
[Service]
Type=oneshot
ExecStart=/sbin/iptables -t nat -A POSTROUTING -s $VPN_NET/24 -o $PRIMARY_IF -j MASQUERADE
ExecStop=/sbin/iptables -t nat -D POSTROUTING -s $VPN_NET/24 -o $PRIMARY_IF -j MASQUERADE
RemainAfterExit=yes
[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    if ! systemctl enable --now openvpn-iptables.service; then
        print_warning "Failed to enable iptables service (non-fatal)"
    fi

    # Start OpenVPN Service
    echo "================================="
    echo "Starting OpenVPN Service"
    echo "================================="
    
    print_success "Enabling OpenVPN service..."
    if ! systemctl enable openvpn-server@server.service 2>/dev/null && ! systemctl enable openvpn@server.service 2>/dev/null; then
        print_error "Failed to enable OpenVPN service"
        print_error "Try manually: systemctl enable openvpn-server@server"
        exit 1
    fi
    
    print_success "Starting OpenVPN service..."
    if ! systemctl restart openvpn-server@server.service 2>/dev/null && ! systemctl restart openvpn@server.service 2>/dev/null; then
        print_error "Failed to start OpenVPN service"
        print_error "Check logs: journalctl -u openvpn-server@server -n 50"
        exit 1
    fi
    
    # Wait a bit and check if service is running
    sleep 2
    if systemctl is-active --quiet openvpn-server@server.service 2>/dev/null || systemctl is-active --quiet openvpn@server.service 2>/dev/null; then
        print_success "OpenVPN service is running"
    else
        print_error "OpenVPN service failed to start"
        print_error "Check logs: journalctl -u openvpn-server@server -n 50"
        exit 1
    fi
    
    # Wait a moment for service to start
    sleep 2
    
    # Check if service is running
    if systemctl is-active --quiet openvpn-server@server.service 2>/dev/null || systemctl is-active --quiet openvpn@server.service 2>/dev/null; then
        echo "✓ OpenVPN service started successfully"
    else
        echo "⚠ Warning: OpenVPN service may not have started properly"
        echo "Check status with: systemctl status openvpn-server@server.service"
        echo "Check logs with: journalctl -xeu openvpn-server@server.service"
    fi

    echo "================================="
    echo "INSTALLATION COMPLETE"
    echo "================================="
    echo "OpenVPN is running on UDP port $VPN_PORT (Public IP: $PUBLIC_IP)"
    echo ""
    echo "To connect this node to OpenVPN Manager:"
    echo "1. Register this node in the Web UI (Nodes → Add Node)"
    echo "2. Install the agent: curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/scripts/install-agent.sh | sudo bash"
    echo ""
    echo "Certificates generated. The CA and TLS-Crypt paths are:"
    echo " - CA Cert: /etc/openvpn/server/ca.crt"
    echo " - TLS-Crypt Key: /etc/openvpn/server/tls-crypt.key"
    echo "These values are required to generate .ovpn files in your Dashboard."
    echo ""
    echo "Useful commands:"
    echo " - Check status: systemctl status openvpn-server@server.service"
    echo " - View logs: tail -f /var/log/openvpn/openvpn.log"
    echo " - Check connections: cat /var/log/openvpn/status.log"
}

uninstall_vpn() {
    if [ ! -d "/etc/openvpn/server" ] && [ ! -f "/etc/openvpn/server/server.conf" ]; then
        echo "OpenVPN is not installed or already removed."
        exit 0
    fi

    echo "================================="
    echo "OpenVPN Uninstallation"
    echo "================================="
    echo "WARNING: This will completely remove OpenVPN and all certificates on this node!"
    echo ""
    read -p "Are you sure you want to proceed? [y/N]: " confirm
    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
        echo "Aborted."
        exit 0
    fi

    echo ""
    echo "Stopping services..."
    
    # Try both service name variants (different distros use different names)
    if systemctl is-active --quiet openvpn-server@server.service 2>/dev/null; then
        systemctl stop openvpn-server@server.service
        systemctl disable openvpn-server@server.service 2>/dev/null || true
        echo "✓ Stopped openvpn-server@server.service"
    fi
    
    if systemctl is-active --quiet openvpn@server.service 2>/dev/null; then
        systemctl stop openvpn@server.service
        systemctl disable openvpn@server.service 2>/dev/null || true
        echo "✓ Stopped openvpn@server.service"
    fi
    
    if systemctl is-active --quiet openvpn-iptables.service 2>/dev/null; then
        systemctl stop openvpn-iptables.service
        systemctl disable openvpn-iptables.service 2>/dev/null || true
        echo "✓ Stopped openvpn-iptables.service"
    fi
    
    if [ -f /etc/systemd/system/openvpn-iptables.service ]; then
        rm -f /etc/systemd/system/openvpn-iptables.service
        systemctl daemon-reload
        echo "✓ Removed custom iptables service"
    fi

    echo ""
    echo "Removing packages..."
    if [[ "$OS" == "ubuntu" || "$OS" == "debian" ]]; then
        DEBIAN_FRONTEND=noninteractive apt-get purge -y openvpn easy-rsa 2>/dev/null || true
        DEBIAN_FRONTEND=noninteractive apt-get autoremove -y 2>/dev/null || true
        echo "✓ Packages removed (Debian/Ubuntu)"
    elif [[ "$OS" == "centos" || "$OS" == "rhel" || "$OS" == "fedora" || "$OS" == "rocky" || "$OS" == "almalinux" ]]; then
        yum remove -y openvpn easy-rsa 2>/dev/null || true
        yum autoremove -y 2>/dev/null || true
        echo "✓ Packages removed (RHEL/CentOS)"
    else
        echo "⚠ Unknown OS, skipping package removal"
    fi

    echo ""
    echo "Cleaning up directories..."
    if [ -d /etc/openvpn ]; then
        rm -rf /etc/openvpn
        echo "✓ Removed /etc/openvpn"
    fi
    
    if ls /var/log/openvpn* 1> /dev/null 2>&1; then
        rm -rf /var/log/openvpn*
        echo "✓ Removed OpenVPN logs"
    fi

    echo ""
    echo "Reverting network configuration..."
    # Remove sysctl modifications (only if exists)
    if grep -q "net.ipv4.ip_forward=1" /etc/sysctl.conf 2>/dev/null; then
        sed -i '/net.ipv4.ip_forward=1/d' /etc/sysctl.conf
        sysctl -p > /dev/null 2>&1
        echo "✓ Reverted IP forwarding"
    fi
    
    # Clean up iptables rules (best effort)
    iptables -t nat -D POSTROUTING -s $VPN_NET/24 -o $PRIMARY_IF -j MASQUERADE 2>/dev/null || true

    echo ""
    echo "================================="
    echo "UNINSTALL COMPLETE"
    echo "================================="
    echo "OpenVPN has been completely removed from this system."
    echo ""
}

if [ "$ACTION" == "install" ]; then
    install_vpn
elif [ "$ACTION" == "uninstall" ]; then
    uninstall_vpn
else
    echo "Unknown action: $ACTION"
    echo "Usage: $0 [install|uninstall]"
    exit 1
fi