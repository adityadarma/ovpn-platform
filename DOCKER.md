# Docker Deployment Guide

This guide explains how to run OpenVPN Manager using Docker Compose for both development and production environments.

## 📋 Table of Contents

- [Quick Start](#quick-start)
- [Development Setup](#development-setup)
- [Production Setup](#production-setup)
- [Database Options](#database-options)
- [VPN Agent Setup](#vpn-agent-setup)

---

## 🚀 Quick Start

### Development (Local)
```bash
# Start with SQLite (fastest for development)
docker compose -f docker-compose.dev.yml up

# Access:
# - Web UI: http://localhost:3000
# - API: http://localhost:3001
```

### Production
```bash
# 1. Copy and configure environment variables
cp .env.production .env
nano .env  # Edit with your secure values

# 2. Build images
docker compose build

# 3. Start services
docker compose up -d

# Access:
# - Web UI: http://localhost:3000
# - API: http://localhost:3001
```

---

## 🔧 Development Setup

**File:** `docker-compose.dev.yml`

### Features
- ✅ Hot-reload for API and Web UI
- ✅ Source code mounted as volumes
- ✅ Fast iteration and debugging
- ✅ Separate dev databases
- ✅ No image building required
- ✅ Verbose logging

### Usage

```bash
# Start all services (SQLite)
docker compose -f docker-compose.dev.yml up

# Start with PostgreSQL
docker compose -f docker-compose.dev.yml --profile postgres up

# Start with MySQL/MariaDB
docker compose -f docker-compose.dev.yml --profile mysql up

# Stop services
docker compose -f docker-compose.dev.yml down

# Clean up (remove volumes)
docker compose -f docker-compose.dev.yml down -v
```

### Development Environment Variables

Create a `.env` file or use defaults:

```env
NODE_ENV=development
DATABASE_TYPE=sqlite
JWT_SECRET=dev-secret-please-change-in-production-32chars
```

### Key Differences from Production

| Feature | Development | Production |
|---------|-------------|------------|
| **Hot Reload** | ✅ Yes | ❌ No |
| **Source Mounting** | ✅ Yes | ❌ No |
| **Image Building** | ❌ Not needed | ✅ Required |
| **Restart Policy** | ❌ No auto-restart | ✅ unless-stopped |
| **Logging** | Verbose | Limited (10MB, 3 files) |
| **Container Names** | `*-dev` suffix | Production names |
| **Network** | `ovpn-dev-network` | `ovpn-network` |
| **Volumes** | `*_dev_data` | Production volumes |
| **Performance** | Slower (dev mode) | Optimized |

---

## 🏭 Production Setup

**File:** `docker-compose.yml`

### Features
- ✅ Optimized production builds
- ✅ Auto-restart on failure
- ✅ Health checks
- ✅ Log rotation
- ✅ Named volumes for data persistence
- ✅ Secure by default

### Prerequisites

1. **Build Docker images:**
   ```bash
   # Build all images
   docker compose build
   
   # Or build individually
   docker build -t ovpn-manager:api -f apps/api/Dockerfile .
   docker build -t ovpn-manager:web -f apps/web/Dockerfile .
   docker build -t ovpn-manager:agent -f apps/agent/Dockerfile .
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.production .env
   nano .env
   ```

   **Required variables:**
   - `JWT_SECRET` - Generate with: `openssl rand -base64 32`
   - `DATABASE_TYPE` - Choose: `sqlite`, `postgres`, or `mysql`
   - Database credentials (if using postgres/mysql)

### Usage

```bash
# Start with SQLite (default)
docker compose up -d

# Start with PostgreSQL
docker compose --profile postgres up -d

# Start with MySQL/MariaDB
docker compose --profile mysql up -d

# Include VPN Agent
docker compose --profile agent up -d

# View logs
docker compose logs -f

# Stop services
docker compose down

# Update and restart
docker compose pull
docker compose up -d
```

### Production Checklist

- [ ] Change `JWT_SECRET` to a secure random string
- [ ] Update database passwords (if using postgres/mysql)
- [ ] Set `NEXT_PUBLIC_API_URL` to your actual domain/IP
- [ ] Configure firewall rules (ports 3000, 3001)
- [ ] Set up SSL/TLS reverse proxy (nginx/traefik)
- [ ] Configure backup strategy for volumes
- [ ] Review and adjust resource limits if needed

---

## 💾 Database Options

### SQLite (Default)

**Best for:** Small deployments, testing, single-node setups

```bash
# Development
docker compose -f docker-compose.dev.yml up

# Production
docker compose up -d
```

**Configuration:**
```env
DATABASE_TYPE=sqlite
# Data stored in Docker volume automatically
```

**Pros:**
- ✅ Zero configuration
- ✅ No separate database container
- ✅ Fast for small datasets
- ✅ Easy backups (single file)

**Cons:**
- ❌ Not suitable for high concurrency
- ❌ Limited scalability

---

### PostgreSQL

**Best for:** Production deployments, high concurrency, scalability

```bash
# Development
docker compose -f docker-compose.dev.yml --profile postgres up

# Production
docker compose --profile postgres up -d
```

**Configuration (.env):**
```env
DATABASE_TYPE=postgres
DATABASE_URL=postgresql://ovpn:YOUR_PASSWORD@postgres:5432/ovpn
POSTGRES_USER=ovpn
POSTGRES_PASSWORD=YOUR_SECURE_PASSWORD
POSTGRES_DB=ovpn
```

**Pros:**
- ✅ Excellent for production
- ✅ High concurrency support
- ✅ Advanced features (JSON, full-text search)
- ✅ Battle-tested reliability

---

### MySQL / MariaDB

**Best for:** Teams familiar with MySQL, existing MySQL infrastructure

```bash
# Development
docker compose -f docker-compose.dev.yml --profile mysql up

# Production
docker compose --profile mysql up -d
```

**Configuration (.env):**
```env
DATABASE_TYPE=mysql
DATABASE_URL=mysql://ovpn:YOUR_PASSWORD@mariadb:3306/ovpn
MYSQL_USER=ovpn
MYSQL_PASSWORD=YOUR_SECURE_PASSWORD
MYSQL_DATABASE=ovpn
MYSQL_ROOT_PASSWORD=YOUR_ROOT_PASSWORD
```

---

## 🔐 VPN Agent Setup

The VPN Agent runs on your VPN server node and communicates with the Manager API.

### Quick Install (Recommended) ⭐

Use our automated installer that handles everything:

```bash
curl -fsSL https://raw.githubusercontent.com/adityadarma/ovpn-manager/main/scripts/install-agent.sh | sudo bash
```

This will:
1. Install Docker (if not present)
2. Install OpenVPN server (if not present)
3. **Auto-register node** (optional) or use manual registration
4. Configure and start the agent
5. Set up systemd service for auto-start

#### Auto-Registration Options

During installation, you can choose to auto-register the node:

**Option 1: Using Registration Key** (Recommended)
- Set `NODE_REGISTRATION_KEY` in Manager's `.env` file
- Generate with: `openssl rand -hex 32`
- Provide this key during agent installation
- More secure than sharing admin credentials

**Option 2: Using Admin JWT Token**
- Login to Manager Web UI as admin
- Open browser DevTools (F12) → Application → Local Storage
- Copy the `token` value
- Provide this token during agent installation
- Token expires based on `JWT_EXPIRES_IN` setting

**Option 3: Manual Registration**
- Register node via Web UI first
- Get Node ID and Secret Token
- Provide these during agent installation

**Management Commands:**
```bash
# Start agent
systemctl start ovpn-agent
# or
/opt/ovpn-agent/start.sh

# Stop agent
systemctl stop ovpn-agent
# or
/opt/ovpn-agent/stop.sh

# View logs
/opt/ovpn-agent/logs.sh

# Check status
/opt/ovpn-agent/status.sh
```

---

### Manual Installation

#### Step 1: Install OpenVPN Server

First, install OpenVPN on your VPN server using our automated script:

**Option A: One-Line Install**

```bash
# Download and run the VPN server installer
curl -fsSL https://raw.githubusercontent.com/adityadarma/ovpn-manager/main/scripts/vpn-server.sh -o vpn-server.sh
chmod +x vpn-server.sh
sudo ./vpn-server.sh install
```

During installation, you'll be prompted to configure:
- **Port**: Default 1194 (or custom)
- **Protocol**: UDP (faster) or TCP (more reliable)
- **Tunnel Mode**: Full tunnel (all traffic) or Split tunnel (specific routes)
- **VPN Network**: Internal subnet (default: 10.8.0.0/24)

**Option B: Manual Install (With Repository)**

```bash
# Clone repository
git clone https://github.com/adityadarma/ovpn-manager.git
cd ovpn-manager

# Run installer
chmod +x scripts/vpn-server.sh
sudo ./scripts/vpn-server.sh install
```

The script will:
- ✅ Install OpenVPN and dependencies
- ✅ Generate PKI certificates (CA, server cert, DH params, TLS-auth key)
- ✅ Configure server settings (customizable)
- ✅ Set up NAT and IP forwarding
- ✅ Create systemd services
- ✅ Configure firewall rules

**Supported OS:** Ubuntu, Debian, CentOS, RHEL, Fedora, Rocky Linux, AlmaLinux

**Uninstall VPN Server:**

```bash
sudo ./vpn-server.sh uninstall
```

---

#### Step 2: Deploy Agent Container

### Production Agent

1. **Register a node via Web UI:**
   - Go to http://localhost:3000/dashboard/nodes
   - Click "Add Node"
   - Save the `AGENT_NODE_ID` and `AGENT_SECRET_TOKEN`

2. **Configure `.env`:**
   ```env
   AGENT_MANAGER_URL=http://your-api-server:3001
   AGENT_NODE_ID=your-node-id
   AGENT_SECRET_TOKEN=your-secret-token
   ```

3. **Start agent:**
   ```bash
   docker compose --profile agent up -d
   ```

### Development Agent

```bash
# Set environment variables
export AGENT_NODE_ID=dev-node-1
export AGENT_SECRET_TOKEN=dev-token

# Start agent
docker compose -f docker-compose.dev.yml --profile agent up
```

### Standalone Agent

For deploying the agent on a separate server:

```bash
# Use the dedicated agent compose file
docker compose -f docker-compose.agent.yml up -d
```

---

## 📊 Monitoring & Logs

### View Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f api
docker compose logs -f web

# Last 100 lines
docker compose logs --tail=100 api
```

### Health Checks

```bash
# Check service status
docker compose ps

# API health endpoint
curl http://localhost:3001/api/v1/health

# Check container health
docker inspect ovpn-api | grep -A 10 Health
```

### Resource Usage

```bash
# Real-time stats
docker stats

# Disk usage
docker system df
```

---

## 🎯 Feature Configuration

### Certificate Management

The system includes advanced certificate management features:

**Generate Client Certificates:**
1. Navigate to Users page
2. Click "Generate Certificate" for a user
3. Select VPN node
4. Choose validity period:
   - Unlimited (never expires)
   - 1 Day, 1 Week, 2 Weeks
   - 1 Month, 3 Months, 6 Months, 1 Year
5. Optionally enable password protection
6. Download .ovpn file

**Auto-Renewal:**
- Enable auto-renewal for users
- Set renewal threshold (e.g., 30 days before expiry)
- System automatically renews certificates
- Users must download new .ovpn file after renewal

**Certificate Features:**
- Download history tracking
- Certificate revocation list (CRL)
- Bulk certificate generation
- Expiration warnings

### Node Configuration

Customize VPN settings per node via Web UI:

**Available Settings:**
- **Port & Protocol**: UDP (1194) or TCP (443)
- **Tunnel Mode**: 
  - Full tunnel: All traffic through VPN
  - Split tunnel: Only specific routes
- **Network Settings**:
  - VPN subnet (e.g., 10.8.0.0/24)
  - DNS servers (e.g., 8.8.8.8, 1.1.1.1)
  - Custom routes for split tunnel
- **Security**:
  - Cipher: AES-256-GCM, AES-128-GCM, AES-256-CBC
  - Auth digest: SHA256, SHA384, SHA512
  - Compression: LZ4-v2, LZ4, LZO, None
- **Connection**:
  - Keepalive ping interval
  - Keepalive timeout
  - Maximum concurrent clients

**How to Configure:**
1. Go to Nodes page
2. Click Configure (⚙️) button on node card
3. Adjust settings
4. Click "Update Configuration"
5. Changes are applied automatically to the VPN server

---

## 🔄 Backup & Restore

### Backup Volumes

```bash
# Backup SQLite database
docker run --rm -v ovpn_api_data:/data -v $(pwd):/backup alpine tar czf /backup/ovpn-backup.tar.gz /data

# Backup PostgreSQL
docker compose exec postgres pg_dump -U ovpn ovpn > backup.sql

# Backup MySQL
docker compose exec mariadb mysqldump -u ovpn -p ovpn > backup.sql
```

### Restore Volumes

```bash
# Restore SQLite
docker run --rm -v ovpn_api_data:/data -v $(pwd):/backup alpine tar xzf /backup/ovpn-backup.tar.gz -C /

# Restore PostgreSQL
docker compose exec -T postgres psql -U ovpn ovpn < backup.sql

# Restore MySQL
docker compose exec -T mariadb mysql -u ovpn -p ovpn < backup.sql
```

---

## 🐛 Troubleshooting

### Services won't start

```bash
# Check logs
docker compose logs

# Verify environment variables
docker compose config

# Check port conflicts
netstat -tulpn | grep -E '3000|3001'
```

### Database connection issues

```bash
# Check database health
docker compose ps

# Test database connection
docker compose exec api sh -c 'wget -qO- http://localhost:3001/api/v1/health'
```

### Agent not connecting

```bash
# Verify agent logs
docker compose logs agent

# Check network connectivity
docker compose exec agent ping api

# Verify credentials
docker compose exec agent env | grep AGENT_
```

---

## 🔒 Security Best Practices

1. **Never use default secrets in production**
2. **Use strong, randomly generated passwords**
3. **Keep Docker images updated:** `docker compose pull`
4. **Use SSL/TLS for external access** (nginx, traefik, caddy)
5. **Restrict database ports** (don't expose to public)
6. **Regular backups** of volumes and databases
7. **Monitor logs** for suspicious activity
8. **Use Docker secrets** for sensitive data (Swarm mode)

---

## 📚 Additional Resources

- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [PostgreSQL Docker Hub](https://hub.docker.com/_/postgres)
- [MariaDB Docker Hub](https://hub.docker.com/_/mariadb)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
