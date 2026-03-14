# OVPN — VPN Management Platform

A centralized VPN management platform inspired by Pritunl, Tailscale Admin, and Netmaker — built on top of OpenVPN with a modern tech stack.

## Architecture

```
┌─────────────────────────────────────────┐
│           Manager Server                │
│  ┌──────────┐  ┌──────────────────────┐ │
│  │  Web UI  │  │    API (Fastify)      │ │
│  │ Next.js  │◄─│  TypeScript + Knex   │ │
│  └──────────┘  └──────────────────────┘ │
│                         │               │
│              ┌──────────┴──────────┐    │
│              │  Database           │    │
│              │  postgres/mysql/    │    │
│              │  sqlite             │    │
│              └─────────────────────┘    │
└────────────────────────┬────────────────┘
                         │ HTTPS API
              ┌──────────┴──────────┐
              │  VPN Node (agent)   │
              │  ┌────────────────┐ │
              │  │  OVPN Agent     │ │
              │  │  Node.js       │ │
              │  └────────┬───────┘ │
              │           │         │
              │  ┌────────▼───────┐ │
              │  │   OpenVPN      │ │
              │  └────────────────┘ │
              └─────────────────────┘
```

## Monorepo Structure

```
ovpn-platform/
├── apps/
│   ├── api/        ← Fastify REST API (port 3001)
│   ├── web/        ← Next.js + ShadCN dashboard (port 3000)
│   └── agent/      ← VPN node agent (standalone installable)
├── packages/
│   ├── db/         ← Knex multi-database layer
│   ├── shared/     ← Types, Zod schemas, constants
│   └── ui/         ← Shared React components
├── docker-compose.yml
└── .env.example
```

## Quick Start

### Prerequisites
- Node.js >= 20
- pnpm >= 9

### Development

```bash
# 1. Install dependencies
pnpm install

# 2. Copy and configure environment
cp .env.example .env

# 3. Run database migrations
pnpm db:migrate

# 4. Seed default admin user
pnpm db:seed

# 5. Start all services
pnpm dev
```

Services available at:
- **Web UI**: http://localhost:3000
- **API**: http://localhost:3001
- **API Docs**: http://localhost:3001/docs

Default credentials: `admin` / `Admin@1234!` *(change immediately!)*

### Production with Docker

```bash
# SQLite (simplest, all-in-one)
docker compose up api web -d

# With PostgreSQL
docker compose --profile postgres up -d

# With MariaDB/MySQL
docker compose --profile mysql up -d
```

### Agent Installation (on VPN node server)

```bash
# Clone the repo and build
git clone https://github.com/your-org/ovpn-platform.git
cd ovpn-platform && pnpm install && pnpm --filter @ovpn/agent build

# Set environment variables
export AGENT_MANAGER_URL=https://your-manager.com
export AGENT_NODE_ID=<uuid-from-registration>
export AGENT_SECRET_TOKEN=<token-from-registration>

# Start the agent
node apps/agent/dist/index.js
```

## Database Support

| Database | Status | Use Case |
|---|---|---|
| SQLite | ✅ Default | Development, small deployments |
| PostgreSQL | ✅ Supported | Production, multi-node |
| MariaDB/MySQL | ✅ Supported | Production, existing MySQL infra |

Set `DATABASE_TYPE` in `.env` to switch databases.

## Development Commands

```bash
pnpm dev             # Start all apps in watch mode
pnpm build           # Build all packages and apps
pnpm typecheck       # TypeScript check across monorepo
pnpm db:migrate      # Run database migrations
pnpm db:seed         # Seed default data
pnpm db:rollback     # Rollback last migration
```

## Tech Stack

| Layer | Technology |
|---|---|
| API | Node.js, TypeScript, Fastify 5, Knex.js |
| Web UI | Next.js 15, React 19, TanStack Query, Zustand |
| Database | Knex.js + PostgreSQL / MariaDB / SQLite |
| Agent | Node.js, TypeScript, node-cron |
| Monorepo | pnpm workspaces, Turborepo |
| Containers | Docker, docker-compose |
