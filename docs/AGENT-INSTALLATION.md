# VPN Agent Installation Guide

## Overview

The VPN Agent runs on your VPN server nodes and communicates with the Manager API to:
- Execute tasks (create users, generate certificates, etc.)
- Send heartbeats to show node status
- Sync certificates to the database
- Apply firewall rules and network policies

## Installation Methods

### Method 1: One-Line Install (Recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/scripts/install-agent.sh | sudo bash
```

This script will:
1. ✅ Check and install Docker if needed
2. ✅ Check and install Docker Compose if needed
3. ✅ Check OpenVPN installation (offer to install if missing)
4. ✅ Download agent configuration files
5. ✅ Auto-register node with Manager API (optional)
6. ✅ Configure environment variables
7. ✅ Start agent container
8. ✅ Create management scripts
9. ✅ Setup systemd service

### Method 2: Manual Installation

See [Manual Installation](#manual-installation) section below.

## Auto-Registration

The install script supports automatic node registration with two authentication methods:

### Option 1: Admin JWT Token

**Steps**:
1. Login to Manager Web UI as admin
2. Open browser DevTools (F12)
3. Go to Application/Storage → Local Storage
4. Copy the `token` value
5. Use this token during installation

**Advantages**:
- No need to pre-configure registration key
- Works immediately after Manager setup

**Example**:
```bash
# During installation, choose:
# Registration method: 1 (Auto-register)
# Auth method: 1 (Admin JWT Token)
# Then paste your JWT token
```

### Option 2: Registration Key

**Steps**:
1. Set `NODE_REGISTRATION_KEY` in Manager's `.env` file
2. Restart Manager API
3. Use this key during agent installation

**Advantages**:
- More secure (can be rotated)
- Can be shared with team members
- No need to extract JWT from browser

**Example**:
```bash
# In Manager .env:
NODE_REGISTRATION_KEY=your-secure-random-key-here

# During installation, choose:
# Registration method: 1 (Auto-register)
# Auth method: 2 (Registration Key)
# Then enter your registration key
```

### Option 3: Manual Registration

If auto-registration fails or you prefer manual setup:

1. Go to Manager Web UI → Nodes → Add Node
2. Fill in node details
3. Click "Register"
4. Copy Node ID and Secret Token
5. Enter them during agent installation

## Installation Flow

### Interactive Prompts

The installation script will ask you:

1. **Install OpenVPN?** (if not detected)
   ```
   Do you want to install OpenVPN server now? [y/N]:
   ```

2. **Manager API URL**
   ```
   Enter Manager API URL (e.g., http://manager-server:3001):
   ```

3. **Registration Method**
   ```
   1. Auto-register (requires Admin JWT token or Registration Key)
   2. Manual registration (use existing Node ID and Secret Token)
   Choose registration method [1/2] (default: 2):
   ```

4. **If Auto-register**:
   - Hostname (default: current hostname)
   - Public IP address (default: detected IP)
   - Region/location (optional)
   - Auth method (JWT or Registration Key)
   - Auth credentials

5. **If Manual register**:
   - Node ID
   - Secret Token

6. **Optional Settings**:
   - Poll interval (default: 5000ms)
   - Heartbeat interval (default: 30000ms)

### VPN Configuration Sync

If OpenVPN is installed via the `vpn-server.sh` script, the agent will automatically:
- Detect VPN server configuration
- Sync configuration to Manager database during registration
- Include settings like port, protocol, cipher, etc.

This eliminates manual configuration in the Web UI!

## Post-Installation

### Files Created

```
/opt/vpn-agent/
├── docker-compose.yml    # Agent container configuration
├── .env                  # Environment variables
├── credentials.txt       # Node credentials (delete after saving!)
├── start.sh             # Start agent
├── stop.sh              # Stop agent
├── restart.sh           # Restart agent
├── logs.sh              # View logs
└── status.sh            # Check status
```

### Management Commands

**Using scripts**:
```bash
# Start agent
/opt/vpn-agent/start.sh

# Stop agent
/opt/vpn-agent/stop.sh

# Restart agent
/opt/vpn-agent/restart.sh

# View logs
/opt/vpn-agent/logs.sh

# Check status
/opt/vpn-agent/status.sh
```

**Using systemd**:
```bash
# Start agent
sudo systemctl start vpn-agent

# Stop agent
sudo systemctl stop vpn-agent

# Restart agent
sudo systemctl restart vpn-agent

# Check status
sudo systemctl status vpn-agent

# View logs
sudo journalctl -u vpn-agent -f
```

**Using docker compose**:
```bash
cd /opt/vpn-agent

# Start
docker compose up -d

# Stop
docker compose down

# Restart
docker compose restart

# Logs
docker compose logs -f

# Status
docker compose ps
```

### Verify Installation

1. **Check agent container**:
   ```bash
   docker ps | grep vpn-agent
   ```

2. **Check agent logs**:
   ```bash
   docker compose -f /opt/vpn-agent/docker-compose.yml logs -f
   ```
   
   Look for:
   - `✓ Connected to manager`
   - `✓ Heartbeat sent`
   - `[poller] Checking for tasks...`

3. **Check node status in Web UI**:
   - Go to Manager Web UI → Nodes
   - Your node should show as "online" (green)
   - Last seen timestamp should be recent

4. **Test certificate sync**:
   - In Web UI, click "Sync Certificates" button on your node
   - Check agent logs for sync progress
   - Verify certificates appear in database

## Troubleshooting

### Agent Won't Start

**Check Docker**:
```bash
docker --version
docker compose version
```

**Check logs**:
```bash
docker compose -f /opt/vpn-agent/docker-compose.yml logs
```

**Common issues**:
- Missing environment variables
- Invalid Node ID or Secret Token
- Manager API not reachable
- OpenVPN directories not found

### Agent Not Connecting

**Test Manager API**:
```bash
curl -v http://your-manager-url:3001/api/v1/health
```

**Check network**:
```bash
# From agent server
ping manager-server-ip
telnet manager-server-ip 3001
```

**Check credentials**:
```bash
cat /opt/vpn-agent/.env
```

Verify:
- `AGENT_MANAGER_URL` is correct
- `AGENT_NODE_ID` matches Web UI
- `AGENT_SECRET_TOKEN` is correct

### Auto-Registration Failed

**Check Manager API logs**:
```bash
docker compose logs api
```

**Common causes**:
- Invalid JWT token (expired or wrong)
- Invalid registration key
- Node already registered with same hostname/IP
- Manager API not reachable

**Solution**: Use manual registration instead:
```bash
# Stop agent
systemctl stop vpn-agent

# Edit .env with correct credentials
nano /opt/vpn-agent/.env

# Start agent
systemctl start vpn-agent
```

### OpenVPN Not Found

**Install OpenVPN manually**:
```bash
# Download and run VPN server installer
curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/scripts/vpn-server.sh | sudo bash
```

**Or install OpenVPN from package manager**:
```bash
# Ubuntu/Debian
apt-get install openvpn easy-rsa

# CentOS/RHEL
yum install openvpn easy-rsa
```

### Certificates Not Syncing

**Check file permissions**:
```bash
ls -la /etc/openvpn/server/
ls -la /etc/openvpn/easy-rsa/
```

**Check if files exist**:
```bash
# CA certificate
cat /etc/openvpn/server/ca.crt

# TLS key (tls-crypt or tls-auth)
cat /etc/openvpn/server/tls-crypt.key
# OR
cat /etc/openvpn/server/ta.key
```

**Manually trigger sync**:
- Go to Web UI → Nodes
- Click "Sync Certificates" button
- Check agent logs

## Manual Installation

If you prefer to install manually without the script:

### 1. Install Prerequisites

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Docker Compose (if not included)
# See: https://docs.docker.com/compose/install/

# Install OpenVPN
curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/scripts/vpn-server.sh | sudo bash
```

### 2. Create Installation Directory

```bash
mkdir -p /opt/vpn-agent
cd /opt/vpn-agent
```

### 3. Download Configuration Files

```bash
# Download docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/docker-compose.agent.yml -o docker-compose.yml

# Download .env template
curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/apps/agent/.env.example -o .env
```

### 4. Register Node

**Option A: Via Web UI**:
1. Go to Manager Web UI → Nodes → Add Node
2. Fill in details and register
3. Copy Node ID and Secret Token

**Option B: Via API**:
```bash
# Using registration key
curl -X POST http://your-manager:3001/api/v1/nodes/register \
  -H "Content-Type: application/json" \
  -d '{
    "hostname": "vpn-node-1",
    "ip": "1.2.3.4",
    "region": "Singapore",
    "registrationKey": "your-registration-key"
  }'

# Using admin JWT token
curl -X POST http://your-manager:3001/api/v1/nodes/register \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-admin-jwt-token" \
  -d '{
    "hostname": "vpn-node-1",
    "ip": "1.2.3.4",
    "region": "Singapore"
  }'
```

### 5. Configure Environment

Edit `.env` file:
```bash
nano .env
```

Set these values:
```env
NODE_ENV=production
AGENT_MANAGER_URL=http://your-manager:3001
AGENT_NODE_ID=your-node-id-from-registration
AGENT_SECRET_TOKEN=your-secret-token-from-registration
AGENT_POLL_INTERVAL_MS=5000
AGENT_HEARTBEAT_INTERVAL_MS=30000
```

### 6. Start Agent

```bash
docker compose up -d
```

### 7. Verify

```bash
# Check status
docker compose ps

# Check logs
docker compose logs -f
```

## Security Considerations

1. **Credentials File**: Delete `/opt/vpn-agent/credentials.txt` after saving credentials securely

2. **Secret Token**: Keep the secret token secure. It's like a password for your node.

3. **Network Access**: Ensure agent can reach Manager API but Manager doesn't need to reach agent

4. **File Permissions**: 
   ```bash
   chmod 600 /opt/vpn-agent/.env
   chmod 600 /opt/vpn-agent/credentials.txt
   ```

5. **Firewall**: Agent needs outbound access to Manager API port (default 3001)

## Updating Agent

```bash
cd /opt/vpn-agent

# Pull latest image
docker compose pull

# Restart with new image
docker compose up -d

# Check logs
docker compose logs -f
```

## Uninstalling Agent

```bash
# Stop and remove container
cd /opt/vpn-agent
docker compose down

# Remove systemd service
sudo systemctl stop vpn-agent
sudo systemctl disable vpn-agent
sudo rm /etc/systemd/system/vpn-agent.service
sudo systemctl daemon-reload

# Remove installation directory
sudo rm -rf /opt/vpn-agent

# Remove node from Manager Web UI
# Go to Nodes → Select node → Delete
```

## Advanced Configuration

### Custom Poll Interval

Adjust how often agent checks for tasks:
```env
AGENT_POLL_INTERVAL_MS=3000  # Check every 3 seconds
```

### Custom Heartbeat Interval

Adjust how often agent sends heartbeat:
```env
AGENT_HEARTBEAT_INTERVAL_MS=60000  # Send every 60 seconds
```

### Custom OpenVPN Paths

If your OpenVPN is installed in non-standard location, edit `docker-compose.yml`:
```yaml
volumes:
  - /custom/path/to/openvpn:/etc/openvpn/server:ro
  - /custom/path/to/easy-rsa:/etc/openvpn/easy-rsa
```

## Summary

✅ **One-line installation** with auto-registration
✅ **Multiple auth methods** (JWT, Registration Key, Manual)
✅ **Automatic VPN config sync** to database
✅ **Systemd service** for auto-start on boot
✅ **Management scripts** for easy control
✅ **Docker-based** for easy updates
✅ **Comprehensive logging** for troubleshooting

The agent installation is designed to be as simple as possible while remaining flexible for different deployment scenarios.
