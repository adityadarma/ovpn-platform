# Installation Guide

## ⚠️ Important: Installation Order

**ALWAYS install in this order:**

1. **First:** Install VPN Manager (API + Web UI) on one server
2. **Second:** Install VPN Node (OpenVPN + Agent) on another server

The VPN Node needs to connect to the Manager, so Manager must be running first!

---

## Part 1: Install VPN Manager

VPN Manager consists of API and Web UI. Install this first.

### Quick Install

```bash
curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/scripts/install-manager.sh | sudo bash
```

### Access Manager

After installation:
- **Web UI:** http://YOUR_SERVER_IP:3000
- **Login:** admin / Admin@1234!

### Configure for Node Registration

Choose one method:

**Option A: Auto-Register (Recommended)**

```bash
cd /opt/vpn-manager
echo "NODE_REGISTRATION_KEY=$(openssl rand -hex 32)" >> .env
docker compose restart api

# Note these values for node installation:
grep NODE_REGISTRATION_KEY .env
grep VPN_TOKEN .env
```

**Option B: Manual Register**

1. Login to Web UI
2. Go to **Nodes** → **Add Node**
3. Fill hostname, IP, region
4. Click **Save**
5. Copy **Node ID** and **Secret Token**

---

## Part 2: Install VPN Node

Now install VPN Node on a separate server.

### Prerequisites

- Ubuntu 20.04+, Debian 11+, CentOS 8+, or RHEL 8+
- Root access
- Public IP address
- Port 1194/UDP open

### Install VPN Node

**Auto-registration mode:**

```bash
curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/scripts/install-node.sh | \
sudo bash -s -- \
  MANAGER_URL=https://api-vpn.example.com \
  VPN_TOKEN=your-vpn-token \
  REG_KEY=your-registration-key
```

**Manual registration mode:**

```bash
curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/scripts/install-node.sh | \
sudo bash -s -- \
  MANAGER_URL=https://api-vpn.example.com \
  VPN_TOKEN=your-vpn-token \
  AGENT_NODE_ID=your-node-id \
  AGENT_SECRET_TOKEN=your-secret-token
```

### Interactive Install

```bash
curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/scripts/install-node.sh -o install-node.sh
chmod +x install-node.sh
sudo ./install-node.sh
```

Prompts for:
- Manager API URL
- VPN Token
- Node credentials

---

## Getting Credentials

### VPN Token

From Manager server:
```bash
grep VPN_TOKEN /opt/vpn-manager/.env
```

Or generate:
```bash
openssl rand -hex 32
```

### Registration Key

On Manager server:
```bash
cd /opt/vpn-manager
echo "NODE_REGISTRATION_KEY=$(openssl rand -hex 32)" >> .env
docker compose restart api
grep NODE_REGISTRATION_KEY .env
```

### Node ID & Secret Token

1. Login to Web UI
2. Go to Nodes → Add Node
3. Copy credentials

---

## Verification

```bash
# Check agent
docker logs vpn-agent

# Check OpenVPN
systemctl status openvpn-server@server

# Test management interface
telnet 127.0.0.1 7505

# Check node status in Web UI (should show "Online")
```

---

## Update

```bash
curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/scripts/update-node.sh | sudo bash
```

---

## Uninstall

### Uninstall VPN Node

```bash
curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/scripts/uninstall-node.sh | sudo bash
```

### Uninstall Manager

**Interactive mode (recommended):**
```bash
curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/scripts/uninstall-manager.sh -o uninstall.sh
chmod +x uninstall.sh
sudo ./uninstall.sh
```

**Auto mode - Full uninstall:**
```bash
curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/scripts/uninstall-manager.sh | sudo bash -s -- --full
```

**Auto mode - Keep data:**
```bash
curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/scripts/uninstall-manager.sh | sudo bash -s -- --keep-data
```

---

## Troubleshooting

### Manager not accessible

```bash
docker compose -f /opt/vpn-manager/docker-compose.yml ps
docker compose -f /opt/vpn-manager/docker-compose.yml logs
```

### Agent won't start

```bash
docker logs vpn-agent
cd /opt/vpn-agent && docker compose restart
```

### OpenVPN won't start

```bash
systemctl status openvpn-server@server
tail -f /var/log/openvpn/openvpn.log
```

### Management interface not accessible

```bash
netstat -tlnp | grep 7505
grep management /etc/openvpn/server/server.conf
```

### Node not showing "Online" in Web UI

1. Check agent logs: `docker logs vpn-agent`
2. Verify credentials are correct
3. Check network connectivity from node to manager
4. Ensure Manager API is accessible from node

---

## Next Steps

1. Login to Web UI
2. Create users
3. Generate certificates
4. Download configs
5. Test VPN connection