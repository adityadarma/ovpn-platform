# Docker Deployment Guide

This guide explains how to run the OVPN Platform using Docker Compose for both development and production environments.

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
   docker build -t ovpn-platform:api -f apps/api/Dockerfile .
   docker build -t ovpn-platform:web -f apps/web/Dockerfile .
   docker build -t ovpn-platform:agent -f apps/agent/Dockerfile .
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
