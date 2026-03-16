# OpenVPN Manager — Modern VPN Management

![Build Status](https://github.com/adityadarma/ovpn-manager/actions/workflows/docker-publish.yml/badge.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Docker](https://img.shields.io/badge/docker-ready-brightgreen.svg)

A centralized, open-source VPN management inspired by enterprise solutions (like Pritunl and Tailscale Admin). Built around OpenVPN with a modern TypeScript monorepo architecture, it provides a seamless Web UI for provisioning users, managing network access (CIDRs), clustering VPN nodes, and pushing real-time connection policies.

## Key Features

- **Multi-Database Support:** Run securely on SQLite (default/development), PostgreSQL, or MySQL/MariaDB.
- **Node Clustering:** Deploy multiple OpenVPN server agents globally. The central manager orchestrates them all.
- **Role-Based Access Control (RBAC):** Admin and User roles.
- **Network Policies:** Define which VPN users can access which internal IP segments via CIDR-based Allow/Deny routing rules.
- **Active Session Tracking:** Real-time visibility into who is connected, their virtual IPs, data transferred, and session history via the agent's heartbeat.
- **Client Certificate Management:** 
  - Generate client certificates with customizable validity periods (1 day to unlimited)
  - Password-protected private keys (optional)
  - Auto-renewal before expiration
  - Certificate revocation list (CRL)
  - Download history tracking
- **Node Configuration:** 
  - Customize VPN settings per node (port, protocol, tunnel mode)
  - Full/Split tunnel support
  - Custom DNS servers and routes
  - Configurable encryption (cipher, auth digest, compression)
  - Web-based configuration management

## Architecture

```text
┌─────────────────────────────────────────┐
│           OVPN Manager (Core)           │
│  ┌──────────┐  ┌──────────────────────┐ │
│  │  Web UI  │  │    API (Fastify)     │ │
│  │ Next.js  │◄─│  TypeScript + Knex   │ │
│  └──────────┘  └──────────────────────┘ │
│                         │               │
│              ┌──────────┴──────────┐    │
│              │  Database           │    │
│              │  Postgres/MySQL/    │    │
│              │  SQLite             │    │
│              └─────────────────────┘    │
└────────────────────────┬────────────────┘
                         │ HTTPS API (JWT / Token Auth)
              ┌──────────┴──────────┐
              │  VPN Node (Agent)   │
              │  ┌────────────────┐ │
              │  │  Node Agent    │ │
              │  │  (Node.js)     │ │
              │  └────────┬───────┘ │
              │           │         │
              │  ┌────────▼───────┐ │
              │  │   OpenVPN      │ │
              │  └────────────────┘ │
              └─────────────────────┘
```

## Monorepo Structure

```text
ovpn-manager/
├── apps/
│   ├── api/        ← Fastify REST API (port 3001)
│   ├── web/        ← Next.js + ShadCN Dashboard (port 3000)
│   └── agent/      ← VPN node agent (standalone worker)
├── packages/
│   ├── db/         ← Knex multi-database layer 
│   ├── shared/     ← Types, Zod schemas, endpoints constants
│   └── ui/         ← Shared React components (Tailwind CSS)
├── docker-compose.yml
└── .env.example
```

---

## 🚀 Quick Start (Development)

### Prerequisites
- **Node.js**: >= 24.x
- **Package Manager**: pnpm >= 9.x
- (Optional) Docker for running Postgres/MySQL locally.

### 1. Installation

Clone the repository and install all monorepo dependencies:
```bash
git clone https://github.com/adityadarma/ovpn-manager.git
cd ovpn-manager
pnpm install
```

### 2. Configuration

Copy the example environment variables:
```bash
cp .env.example .env
```
By default, the system will use **SQLite** (a local file stored in `data/ovpn.sqlite`) making it incredibly easy to start.

### 3. Database Setup

Run the migrations to create tables, and seed the database with the default admin account:
```bash
pnpm db:migrate
pnpm db:seed
```

### 4. Running the Manager

Start both the API server and Web Dashboard in development mode:
```bash
pnpm dev
```

**Access Points:**
- **Web UI:** http://localhost:3000
- **REST API:** http://localhost:3001
- **Default Credentials:**
  - Username: `admin`
  - Password: `Admin@1234!` *(Force-update recommended immediately after login).*

---

## 📖 How to Use (Usage Guide)

### Step 1: Login & Dashboard Overview
1. Open your browser and navigate to `http://localhost:3000`.
2. Login using the default admin credentials.
3. The dashboard provides an instant overview of active VPN connections, total users, and online Node Agents.

### Step 2: Create a Network Segment
Networks define the internal subnets your VPN will route traffic to.
1. Navigate to **Networks** in the sidebar.
2. Click **New Network**.
3. Input a recognizable name (e.g., `Office LAN`) and its CIDR (e.g., `10.0.1.0/24`). 
4. Click **Add Network**.

### Step 3: Register a VPN Node (Agent)
A Node is the actual server running OpenVPN.
1. Navigate to **Nodes** in the sidebar.
2. Click **Add Node**. Fill in the host details (e.g., `us-east-vpn.company.com`, IP: `198.51.100.2`).
3. After creation, the system will generate an **Agent Token**. *Save this secret token!* You will use it to configure the Agent application on your actual VPN server.

### Step 4: Manage Users & Groups
1. Go to **Users**, click **Add User** to generate credentials for your employees/clients. You can optionally assign a static VPN IP address.
2. Go to **Groups** to create logical collections of users (e.g., `Engineering Team`, `Marketing`). Add the users you created to these groups.

### Step 5: Assign Policies
Policies define Access Control Lists (ACL).
1. Navigate to **Policies**.
2. Create an **Allow** rule for a specific user (or group) tying them to the Network CIDR you created in Step 2.
3. When the user connects via OpenVPN, the agent automatically pushes these explicit IP routing rules to their client.

---

## 💻 VPN Server Installation (Node Agent)

The "Agent" acts as the middleman between your central Manager API and the local OpenVPN daemon holding the client connections. We provide automated installation scripts for different deployment scenarios.

### Option 1: Standalone Agent (Docker) - Recommended ⭐

This is the easiest way to deploy an agent on a VPN node. It will:
- Install Docker (if not present)
- Install OpenVPN server (if not present)
- Auto-register node (optional) or use manual registration
- Configure and start the agent in a Docker container
- Set up systemd service for auto-start

```bash
# One-line install
curl -fsSL https://raw.githubusercontent.com/adityadarma/ovpn-manager/main/scripts/install-agent.sh | sudo bash
```

**Registration Options:**

During installation, choose one of these methods:

1. **Auto-register with Registration Key** (Recommended)
   - Set `NODE_REGISTRATION_KEY` in Manager's `.env` (generate with `openssl rand -hex 32`)
   - Provide the key during installation
   - Most secure method for production

2. **Auto-register with Admin JWT Token**
   - Login to Manager Web UI as admin
   - Copy JWT token from browser (DevTools → Local Storage)
   - Provide token during installation
   - Token expires based on `JWT_EXPIRES_IN` setting

3. **Manual Registration**
   - Register node in Manager Web UI first (Nodes → Add Node)
   - Copy Node ID and Secret Token
   - Provide credentials during installation

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

### Option 2: Manual Docker Deployment

If you prefer manual control:

```bash
# 1. Install OpenVPN server
curl -fsSL https://raw.githubusercontent.com/adityadarma/ovpn-manager/main/scripts/vpn-server.sh -o vpn-server.sh
chmod +x vpn-server.sh
sudo ./vpn-server.sh install

# 2. Download agent compose file
mkdir -p /opt/ovpn-agent
cd /opt/ovpn-agent
wget https://raw.githubusercontent.com/adityadarma/ovpn-manager/main/docker-compose.agent.yml -O docker-compose.yml
wget https://raw.githubusercontent.com/adityadarma/ovpn-manager/main/.env.agent -O .env

# 3. Configure .env with your credentials
nano .env

# 4. Start agent
docker compose up -d
```

### Option 3: Native Installation (With Repository)

For development or custom deployments:

1. SSH into your VPN Server as root
2. Clone and build:
   ```bash
   git clone https://github.com/adityadarma/ovpn-manager.git
   cd ovpn-manager
   
   # Install OpenVPN
   chmod +x scripts/vpn-server.sh
   sudo ./scripts/vpn-server.sh install
   
   # Build agent
   pnpm install
   pnpm --filter @ovpn/agent build
   ```

3. Configure environment:
   ```bash
   export AGENT_MANAGER_URL=https://manager.yourdomain.com
   export AGENT_NODE_ID=<uuid-from-web-ui>
   export AGENT_SECRET_TOKEN=<secret-from-web-ui>
   ```

4. Run agent:
   ```bash
   node apps/agent/dist/index.js
   ```

*(For production, use `systemd` or `PM2` to ensure auto-restart)*

### Uninstall

**Standalone Agent:**
```bash
systemctl stop ovpn-agent
systemctl disable ovpn-agent
rm -rf /opt/ovpn-agent
rm -f /etc/systemd/system/ovpn-agent.service
systemctl daemon-reload
```

**OpenVPN Server:**
```bash
sudo ./vpn-server.sh uninstall
```

---

## 🐳 Docker Deployment

### Development (Local)
```bash
docker compose -f docker-compose.dev.yml up
```

### Production

**Option 1: With Repository (Local Build)**
```bash
# Clone and build
git clone https://github.com/adityadarma/ovpn-manager.git
cd ovpn-manager
cp .env.example .env
nano .env  # Configure

# Build and start
docker compose build
docker compose up -d
```

**Option 2: Without Repository (Pre-built Images)** ⭐ Recommended
```bash
# One-line install
curl -fsSL https://raw.githubusercontent.com/adityadarma/ovpn-manager/main/scripts/install-prod.sh | sudo bash

# Or manual
wget https://raw.githubusercontent.com/adityadarma/ovpn-manager/main/docker-compose.yml
wget https://raw.githubusercontent.com/adityadarma/ovpn-manager/main/.env.production -O .env
nano .env  # Configure JWT_SECRET, etc.

# Pull and start
docker compose pull
docker compose up -d
```

**📚 See [DOCKER.md](DOCKER.md) for complete guide**

## Available Scripts

From the root directory, you can utilize Turborepo and pnpm to manage the workspace:
- `pnpm dev` — Start all apps in watch mode.
- `pnpm build` — Build all packages and apps for production.
- `pnpm typecheck` — Run TypeScript compilation checks across the monorepo.
- `pnpm check` — Run Vitest integration and unit tests.
- `pnpm db:migrate` — Apply Knex schema migrations.
- `pnpm db:seed` — Populate database with default starting values.
- `pnpm db:rollback` — Revert the latest migration batch.

---

## 📚 Documentation

- **[README.md](README.md)** - Project overview and quick start
- **[DOCKER.md](DOCKER.md)** - Docker deployment guide (dev & production)
- **[PRODUCTION-INSTALL.md](PRODUCTION-INSTALL.md)** - Production installation guide

---

## 📜 License

[MIT License](LICENSE) 

Copyright (c) 2026 Aditya Darma (adhit.boys1@gmail.com)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software.
