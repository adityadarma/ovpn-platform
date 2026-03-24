# VPN Manager — Modern VPN Management

![Build Status](https://github.com/adityadarma/vpn-manager/actions/workflows/docker-publish.yml/badge.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Docker](https://img.shields.io/badge/docker-ready-brightgreen.svg)

A centralized, open-source VPN management inspired by enterprise solutions (like Pritunl and Tailscale Admin). Built around OpenVPN with a modern TypeScript monorepo architecture, it provides a seamless Web UI for provisioning users, managing network access (CIDRs), clustering VPN nodes, and pushing real-time connection policies.

## Key Features

- **Multi-Database Support:** Run securely on SQLite (default/development), PostgreSQL, or MySQL/MariaDB.
- **Multi-VPN Support:** OpenVPN (production ready) and WireGuard (experimental) with easy extensibility for other VPN types.
- **Node Clustering:** Deploy multiple VPN server agents globally. The central manager orchestrates them all.
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
  - Configurable encryption (AES-256-GCM cipher, SHA256 auth, LZ4 compression)
  - TLS-Crypt for enhanced security (encrypts + authenticates TLS handshake)
  - Web-based configuration management

## Architecture

```text
┌─────────────────────────────────────────┐
│           VPN Manager (Core)           │
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
              │           │ TCP     │
              │  ┌────────▼───────┐ │
              │  │   OpenVPN      │ │
              │  │   Management   │ │
              │  │   Interface    │ │
              │  │   (port 7505)  │ │
              │  └────────┬───────┘ │
              │           │         │
              │  ┌────────▼───────┐ │
              │  │   OpenVPN      │ │
              │  │   Server       │ │
              │  └────────────────┘ │
              └─────────────────────┘
```

**Key Features:**
- **Loose Coupling:** Agent communicates via VPN driver abstraction (no systemd dependency)
- **Security First:** Agent runs without NET_ADMIN privileges
- **Real-time Monitoring:** Live client data via management interface
- **Hybrid Deployment:** Supports both host-based and containerized VPN
- **Multi-VPN Support:** OpenVPN (production), WireGuard (experimental), easy to add more
- **Extensible:** Driver pattern for easy addition of new VPN providers (IPSec, SoftEther, etc)

For detailed architecture documentation, see [ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Monorepo Structure

```text
vpn-manager/
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

## 🚀 Quick Start

**⚠️ IMPORTANT: Install Manager first, then VPN Node!**

**📖 Complete Guide:** [GETTING-STARTED.md](GETTING-STARTED.md)

### Step 1: Install Manager (First)

```bash
curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/scripts/install-manager.sh | sudo bash
```

Access: http://YOUR_SERVER_IP:3000 (admin / Admin@1234!)

### Step 2: Install VPN Node (Second)

```bash
curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/scripts/install-node.sh | sudo bash
```

### Development (Local)

```bash
git clone https://github.com/adityadarma/vpn-manager.git
cd vpn-manager
pnpm install
cp .env.example .env
pnpm db:migrate && pnpm db:seed
pnpm build
pnpm dev
```

Access: http://localhost:3000 (admin / Admin@1234!)

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
A Node is the actual server running VPN.
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
3. When the user connects via VPN, the agent automatically pushes these explicit IP routing rules to their client.

---

## 💻 VPN Server Installation (Node Agent)

### Quick Install (Recommended) ⭐

Install OpenVPN + Agent in one command:

```bash
curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/scripts/install-node.sh | sudo bash
```

This will:
- Install Docker (if needed)
- Install and configure OpenVPN with management interface
- Install and start the Agent
- Configure VPN hooks automatically

**Time**: ~5 minutes

### Non-Interactive Installation (CI/CD, Automation) 🤖

For automated deployments, pass environment variables as arguments:

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

Perfect for:
- Terraform / Ansible / CloudFormation
- CI/CD pipelines
- Bulk node provisioning
- Infrastructure as Code

**📖 Complete Guide:** [NON-INTERACTIVE-INSTALLATION.md](docs/NON-INTERACTIVE-INSTALLATION.md)

### Registration Options

**Option 1: Auto-register (Recommended)**

Set registration key on Manager:
```bash
# On Manager server
echo "NODE_REGISTRATION_KEY=$(openssl rand -hex 32)" >> .env
docker compose restart api
```

Then install with key:
```bash
curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/scripts/install-node.sh | \
sudo bash -s -- \
  MANAGER_URL=https://manager.example.com \
  VPN_TOKEN=your-vpn-token \
  REG_KEY=your-registration-key
```

**Option 2: Manual register**

1. Register node in Web UI first (Nodes → Add Node)
2. Copy Node ID and Secret Token
3. Install with credentials:

```bash
MANAGER_URL=https://manager.example.com \
VPN_TOKEN=your-vpn-token \
NODE_ID=your-node-id \
SECRET_TOKEN=your-secret-token \
curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/scripts/install-node.sh | sudo bash
```

### Management Commands

```bash
# Check agent
docker logs vpn-agent

# Check OpenVPN
systemctl status openvpn-server@server

# View VPN logs
tail -f /var/log/openvpn/openvpn.log

# Update agent
curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/scripts/update-node.sh | sudo bash

# Uninstall node
curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/scripts/uninstall-node.sh | sudo bash

# Uninstall manager (full)
curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/scripts/uninstall-manager.sh | sudo bash -s -- --full
```

### Manual Installation

For advanced users who want more control:

```bash
# 1. Download script
curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/scripts/install-node.sh -o install-node.sh
chmod +x install-node.sh

# 2. Run interactively
sudo ./install-node.sh
```

The script will prompt for configuration.

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
git clone https://github.com/adityadarma/vpn-manager.git
cd vpn-manager
cp .env.example .env
nano .env  # Configure

# Build and start
docker compose build
docker compose up -d
```

**Option 2: Without Repository (Pre-built Images)** ⭐ Recommended
```bash
# One-line install
curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/scripts/install-manager.sh | sudo bash

# Or manual
wget https://raw.githubusercontent.com/adityadarma/vpn-manager/main/docker-compose.yml
wget https://raw.githubusercontent.com/adityadarma/vpn-manager/main/.env.production -O .env
nano .env  # Configure JWT_SECRET, etc.

# Pull and start
docker compose pull
docker compose up -d
```

**📚 See [DOCKER.md](docs/DOCKER.md) for complete guide**

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

- **[Installation Guide](docs/INSTALLATION.md)** - Install VPN node
- **[Architecture](docs/ARCHITECTURE.md)** - System design
- **[Multi-VPN Support](docs/MULTI-VPN-SUPPORT.md)** - OpenVPN, WireGuard, and more
- **[Security Hardening](docs/SECURITY-HARDENING.md)** - Security guide
- **[API Reference](docs/API-ENDPOINTS.md)** - API documentation
- **[Scripts](scripts/README.md)** - Available scripts

---

## 📜 License

[MIT License](LICENSE) 

Copyright (c) 2026 Aditya Darma (adhit.boys1@gmail.com)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software.
