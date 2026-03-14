#!/bin/bash

set -e

# ==========================================
# OVPN Platform - VPN Node Auto Installer
# ==========================================

# Make sure only root can run our script
if [ "$(id -u)" != "0" ]; then
   echo "This script must be run as root" 1>&2
   exit 1
fi

ACTION=$1

if [ -z "$ACTION" ]; then
    echo "Usage: $0 [install|uninstall]"
    exit 1
fi

VPN_PORT=1194
VPN_NET="10.8.0.0"
VPN_MASK="255.255.255.0"

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
        echo "OpenVPN is already installed. Use '$0 uninstall' first if you want to reinstall."
        exit 1
    fi

    echo "================================="
    echo "Installing OpenVPN Server"
    echo "================================="

    # Install packages
    if [[ "$OS" == "ubuntu" || "$OS" == "debian" ]]; then
        apt-get update -y
        apt-get install -y openvpn easy-rsa iptables curl wget tar
    elif [[ "$OS" == "centos" || "$OS" == "rhel" || "$OS" == "fedora" || "$OS" == "rocky" || "$OS" == "almalinux" ]]; then
        yum install -y epel-release || true
        yum install -y openvpn easy-rsa iptables curl wget tar
    else
        echo "Unsupported OS: $OS. Please use Ubuntu, Debian, CentOS, RHEL, Fedora, Rocky, or AlmaLinux."
        exit 1
    fi

    echo "================================="
    echo "Configuring PKI (EasyRSA)"
    echo "================================="
    
    # Initialize EasyRSA
    mkdir -p /etc/openvpn/easy-rsa
    if [ -d "/usr/share/easy-rsa" ]; then
        cp -r /usr/share/easy-rsa/* /etc/openvpn/easy-rsa/
    else
        echo "EasyRSA not found in /usr/share/easy-rsa. Exiting."
        exit 1
    fi
    
    cd /etc/openvpn/easy-rsa

    # Generate PKI and Certificates
    ./easyrsa init-pki
    EASYRSA_BATCH=1 ./easyrsa build-ca nopass
    EASYRSA_BATCH=1 ./easyrsa build-server-full server nopass
    EASYRSA_BATCH=1 ./easyrsa gen-dh
    
    # Generate TLS Key
    openvpn --genkey secret /etc/openvpn/server/ta.key

    # Move files to openvpn server directory
    cp pki/ca.crt /etc/openvpn/server/
    cp pki/private/server.key /etc/openvpn/server/
    cp pki/issued/server.crt /etc/openvpn/server/
    cp pki/dh.pem /etc/openvpn/server/

    echo "================================="
    echo "Creating OpenVPN Config"
    echo "================================="

    cat <<EOF > /etc/openvpn/server/server.conf
port $VPN_PORT
proto udp
dev tun

ca /etc/openvpn/server/ca.crt
cert /etc/openvpn/server/server.crt
key /etc/openvpn/server/server.key
dh /etc/openvpn/server/dh.pem
tls-auth /etc/openvpn/server/ta.key 0

server $VPN_NET $VPN_MASK
topology subnet

# Default route push (Can be overridden by Manager Agent)
push "dhcp-option DNS 8.8.8.8"
push "dhcp-option DNS 1.1.1.1"

keepalive 10 120
cipher AES-256-GCM
persist-key
persist-tun

# Authentication via Manager Agent (No client certs needed)
verify-client-cert none
username-as-common-name
script-security 3

# TODO: Agent will inject auth-user-pass-verify scripts here

user nobody
group nogroup

status /var/log/openvpn-status.log
log /var/log/openvpn.log
verb 3
EOF

    echo "================================="
    echo "Configuring Networking (NAT & Forwarding)"
    echo "================================="

    # Enable IP forwarding
    sed -i '/net.ipv4.ip_forward/d' /etc/sysctl.conf
    echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
    sysctl -p

    # Setup NAT using iptables service
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
    systemctl enable --now openvpn-iptables.service

    # Start OpenVPN Service
    systemctl enable openvpn-server@server.service || systemctl enable openvpn@server.service
    systemctl restart openvpn-server@server.service || systemctl restart openvpn@server.service

    echo "================================="
    echo "INSTALLATION COMPLETE"
    echo "================================="
    echo "OpenVPN is running on UDP port $VPN_PORT (Public IP: $PUBLIC_IP)"
    echo ""
    echo "To connect this node to the OVPN Platform Manager:"
    echo "1. Run the Node Agent and pass the Web Dashboard AGENT Credentials."
    echo ""
    echo "Certificates generated. The CA and TA paths are:"
    echo " - CA Cert: /etc/openvpn/server/ca.crt"
    echo " - TA Key : /etc/openvpn/server/ta.key"
    echo "These values are required to generate .ovpn files out of your Dashboard."
}

uninstall_vpn() {
    if [ ! -d "/etc/openvpn/server" ] && [ ! -f "/etc/openvpn/server/server.conf" ]; then
        echo "OpenVPN is not installed or already removed."
        exit 1
    fi

    echo "WARNING: This will completely remove OpenVPN and all certificates on this node!"
    read -p "Are you sure you want to proceed? [y/N]: " confirm
    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
        echo "Aborted."
        exit 1
    fi

    echo "Stopping services..."
    systemctl stop openvpn-server@server.service || true
    systemctl disable openvpn-server@server.service || true
    systemctl stop openvpn@server.service || true
    systemctl disable openvpn@server.service || true
    
    systemctl stop openvpn-iptables.service || true
    systemctl disable openvpn-iptables.service || true
    rm -f /etc/systemd/system/openvpn-iptables.service
    systemctl daemon-reload

    echo "Removing packages..."
    if [[ "$OS" == "ubuntu" || "$OS" == "debian" ]]; then
        apt-get purge -y openvpn easy-rsa || true
        apt-get autoremove -y || true
    elif [[ "$OS" == "centos" || "$OS" == "rhel" || "$OS" == "fedora" || "$OS" == "rocky" || "$OS" == "almalinux" ]]; then
        yum remove -y openvpn easy-rsa || true
        yum autoremove -y || true
    fi

    echo "Cleaning up directories..."
    rm -rf /etc/openvpn
    rm -rf /var/log/openvpn*

    # Remove sysctl modifications
    sed -i '/net.ipv4.ip_forward=1/d' /etc/sysctl.conf
    sysctl -p

    echo "================================="
    echo "UNINSTALL COMPLETE."
    echo "================================="
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