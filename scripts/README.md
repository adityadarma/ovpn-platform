# Scripts Documentation

## VPN Node Scripts

### install-node.sh
Install OpenVPN + Agent on a VPN node server.

**Usage:**

**Option 1: One-line install**
```bash
curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/scripts/install-node.sh | sudo bash
```

**Option 2: Automated with auto-register**
```bash
MANAGER_URL=https://manager.com \
VPN_TOKEN=your-token \
REG_KEY=your-key \
curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/scripts/install-node.sh | sudo bash
```

**Option 3: Automated with manual register**
```bash
MANAGER_URL=https://manager.com \
VPN_TOKEN=your-token \
NODE_ID=your-node-id \
SECRET_TOKEN=your-secret \
curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/scripts/install-node.sh | sudo bash
```

**What it does:**
- Installs Docker (if needed)
- Installs OpenVPN with management interface
- Installs and starts Agent
- Configures VPN hooks

**Time:** ~5 minutes

---

### update-node.sh
Update agent to latest version.

**Usage:**
```bash
curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/scripts/update-node.sh | sudo bash
```

**What it does:**
- Pulls latest agent image
- Restarts agent container

**Time:** ~30 seconds

---

### uninstall-node.sh
Remove OpenVPN + Agent completely.

**Usage:**
```bash
curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/scripts/uninstall-node.sh | sudo bash
```

**What it does:**
- Stops all services
- Removes packages
- Cleans up files
- Reverts network config

**Time:** ~1 minute

---

## Manager Scripts

### install-manager.sh
Install VPN Manager (API + Web UI) on production server.

**Usage:**
```bash
curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/scripts/install-manager.sh | sudo bash
```

**What it does:**
- Installs Docker
- Downloads docker-compose files
- Configures environment
- Starts Manager services

---

### uninstall-manager.sh
Remove VPN Manager completely.

**Usage:**
```bash
curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/scripts/uninstall-manager.sh | sudo bash
```

**What it does:**
- Stops Manager services
- Removes containers and volumes
- Cleans up files

---

## Development Scripts

### dev-start.sh
Start VPN Manager in development mode.

**Usage:**
```bash
# Development mode (with hot reload)
./scripts/dev-start.sh dev

# Production build
./scripts/dev-start.sh prod

# Docker mode
./scripts/dev-start.sh docker

# Docker development
./scripts/dev-start.sh docker-dev
```

**What it does:**
- Checks/creates .env file
- Runs migrations
- Starts development servers

---

### build-images.sh
Build Docker images for VPN Manager.

**Usage:**
```bash
./scripts/build-images.sh
```

**What it does:**
- Builds API image
- Builds Web UI image
- Builds Agent image
- Tags images

---

## Script Naming Convention

- `*-node.sh` - Scripts for VPN node (OpenVPN + Agent)
- `*-manager.sh` - Scripts for Manager (API + Web UI)
- `dev-*.sh` - Scripts for development
- `build-*.sh` - Scripts for building

## Quick Reference

| Task | Script |
|------|--------|
| Install VPN Node | `install-node.sh` |
| Update VPN Node | `update-node.sh` |
| Remove VPN Node | `uninstall-node.sh` |
| Install Manager | `install-manager.sh` |
| Remove Manager | `uninstall-manager.sh` |
| Start Development | `dev-start.sh dev` |
| Build Images | `build-images.sh` |
