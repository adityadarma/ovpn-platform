# Quick Start Guide

Get started with VPN Manager in 5 minutes.

## ⚠️ Installation Order

**IMPORTANT:** Always install in this order:

1. **First:** Install VPN Manager (API + Web UI)
2. **Second:** Install VPN Node (OpenVPN + Agent)

The VPN Node needs to connect to the Manager, so Manager must be running first!

---

## 🎯 Choose Your Scenario

### 1️⃣ Production: Install Manager First

Install VPN Manager (API + Web UI) on a server:

```bash
curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/scripts/install-manager.sh | sudo bash
```

**Access:**
- Web UI: http://YOUR_SERVER_IP:3000
- Login: `admin` / `Admin@1234!`

**After Manager is running, proceed to step 2**

---

### 2️⃣ Production: Install VPN Node

After Manager is running, install VPN Node on another server:

**Option A: Auto-register (Recommended)**

```bash
# On Manager server, enable auto-register:
cd /opt/vpn-manager
echo "NODE_REGISTRATION_KEY=$(openssl rand -hex 32)" >> .env
docker compose restart api

# Note the registration key and VPN token:
grep NODE_REGISTRATION_KEY .env
grep VPN_TOKEN .env

# On VPN Node server, install:
MANAGER_URL=http://YOUR_MANAGER_IP:3001 \
VPN_TOKEN=your-vpn-token \
REG_KEY=your-registration-key \
curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/scripts/install-node.sh | sudo bash
```

**Option B: Manual register**

```bash
# 1. In Web UI, go to Nodes → Add Node
# 2. Save Node ID and Secret Token
# 3. On VPN Node server:

MANAGER_URL=http://YOUR_MANAGER_IP:3001 \
VPN_TOKEN=your-vpn-token \
NODE_ID=your-node-id \
SECRET_TOKEN=your-secret-token \
curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/scripts/install-node.sh | sudo bash
```

---

### 3️⃣ Development (Local Testing)

```bash
# Clone repository
git clone https://github.com/adityadarma/vpn-manager.git
cd vpn-manager

# Install dependencies
pnpm install

# Setup database
cp .env.example .env
pnpm db:migrate
pnpm db:seed

# Build
pnpm build

# Start development server
pnpm dev
```

**Access:**
- Web UI: http://localhost:3000
- API: http://localhost:3001
- Login: `admin` / `Admin@1234!`

---

## 📝 Next Steps

### 1. Create User

```
Web UI → Users → Add User
```

### 2. Generate Certificate

```
Users → Select User → Generate Certificate → Download .ovpn
```

### 3. Connect VPN

Import `.ovpn` file to VPN client:
- **Windows:** OpenVPN GUI
- **macOS:** Tunnelblick
- **Linux:** OpenVPN CLI
- **Android/iOS:** OpenVPN Connect

---

## 🔧 Commands Cheat Sheet

### Manager

```bash
# Start
docker compose -f /opt/vpn-manager/docker-compose.yml up -d

# Stop
docker compose -f /opt/vpn-manager/docker-compose.yml down

# Logs
docker compose -f /opt/vpn-manager/docker-compose.yml logs -f

# Update
cd /opt/vpn-manager
docker compose pull
docker compose up -d
```

### VPN Node

```bash
# Agent logs
docker logs vpn-agent -f

# OpenVPN status
systemctl status openvpn-server@server

# OpenVPN logs
tail -f /var/log/openvpn/openvpn.log

# Update agent
curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/scripts/update-node.sh | sudo bash

# Uninstall
curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/scripts/uninstall-node.sh | sudo bash
```

### Development

```bash
# Start all
pnpm dev

# Start API only
pnpm dev:api

# Start Web only
pnpm dev:web

# Build
pnpm build

# Type check
pnpm typecheck

# Database migrations
pnpm db:migrate

# Seed database
pnpm db:seed
```

---

## 🆘 Troubleshooting

### Manager not accessible

```bash
docker compose -f /opt/vpn-manager/docker-compose.yml ps
docker compose -f /opt/vpn-manager/docker-compose.yml logs
```

### Agent not connecting

```bash
docker logs vpn-agent
docker exec vpn-agent env | grep AGENT_
```

### OpenVPN not starting

```bash
systemctl status openvpn-server@server
tail -f /var/log/openvpn/openvpn.log
```

---

## 📚 Full Documentation

- **[GETTING-STARTED.md](GETTING-STARTED.md)** - Complete installation guide
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** - System architecture
- **[docs/MULTI-VPN-SUPPORT.md](docs/MULTI-VPN-SUPPORT.md)** - OpenVPN & WireGuard
- **[docs/INSTALLATION.md](docs/INSTALLATION.md)** - Detailed installation
- **[docs/SECURITY-HARDENING.md](docs/SECURITY-HARDENING.md)** - Security guide

---

**Version:** 2.0.0  
**Last Updated:** 2026-03-22
