# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-03-22

### 🎉 Major Architecture Refactor

This release introduces a completely new architecture based on OpenVPN Management Interface, eliminating systemd dependencies and improving security, reliability, and extensibility.

### Added
- **VPN Driver Layer**: New abstraction for VPN communication
  - `VpnDriver` interface for extensibility
  - `OpenVpnManagementDriver` using TCP management interface
  - Support for future VPN providers (WireGuard, IPSec)
- **Real-time Monitoring**: Live client data via management interface
- **Enhanced Heartbeat**: Agent sends real-time VPN data
- **Simplified Installation**
  - `install.sh` - All-in-one installer (200 lines)
  - `update.sh` - Quick update (30 lines)
  - `uninstall.sh` - Clean removal (60 lines)
  - One command installation
  - Auto-registration support
- **Minimal Documentation**
  - `docs/ARCHITECTURE.md` - System design
  - `docs/INSTALLATION.md` - Installation guide

### Changed
- **Agent Communication**: Switched from systemctl to management interface
  - `handleReloadOpenvpn`: Now uses `signal SIGHUP` via management interface
  - `handleRevokeUser`: Uses `disconnectClient()` instead of systemctl
  - `handleUpdateServerConfig`: Uses management interface for reload
- **Security Improvements**
  - Removed `NET_ADMIN` capability requirement from agent
  - Removed `/dev/net/tun` device requirement from agent
  - Agent now runs with minimal privileges
- **Docker Compose**: Updated `docker-compose.agent.yml`
  - Removed `cap_add: NET_ADMIN`
  - Removed `devices: /dev/net/tun`
  - Added management interface environment variables
- **Handler Signatures**: All handlers now receive `VpnDriver` parameter
  - Enables driver-based operations
  - Better testability and modularity

### Removed
- **Deprecated Scripts** (replaced by `install.sh`)
  - `install-agent.sh` (1032 lines)
  - `vpn-server.sh` (500+ lines)
  - `install-hooks.sh` (200+ lines)
  - `enable-management-interface.sh` (200+ lines)
- **Excessive Documentation** (kept only essentials)
  - Removed detailed comparison docs
  - Removed migration guides (fresh install recommended)
  - Removed developer-specific guides
  - Kept: Architecture, Installation, API Reference

### Breaking Changes
- **OpenVPN Configuration Required**: Must enable management interface
  ```conf
  management 127.0.0.1 7505
  management-client-auth
  status /var/log/openvpn/status.log
  status-version 3
  ```
- **Environment Variables**: New required variables for agent
  - `VPN_MANAGEMENT_HOST` (default: 127.0.0.1)
  - `VPN_MANAGEMENT_PORT` (default: 7505)
  - `VPN_MANAGEMENT_PASSWORD` (optional)
- **API Schema**: Heartbeat endpoint now accepts additional fields
  - `clients` - Array of connected clients
  - `metrics` - VPN metrics object
  - `serverInfo` - Server information object

### Migration
See [docs/MIGRATION-V2.md](docs/MIGRATION-V2.md) for detailed migration instructions.

### Benefits
- ✅ **Better Security**: No special privileges required
- ✅ **Real-time Data**: Live monitoring without polling delays
- ✅ **Better Reliability**: Direct communication, no log parsing
- ✅ **Portable**: No systemd or OS-specific dependencies
- ✅ **Extensible**: Easy to add new VPN providers
- ✅ **Easier Debugging**: Clear error messages and better logging

---

## [Unreleased]

### Fixed
- **Agent Hook Installation**: Improved container readiness check during hook installation
  - Wait up to 60 seconds for container to be fully ready (increased from 30s)
  - Verify container can serve files before attempting hook installation
  - Better error messages with troubleshooting steps
  - Manual hook installation script (`install-hooks.sh`) with same improved wait logic
  - Prevents "Agent container not ready, skipping hook installation" warning

### Changed
- Enhanced `install-agent.sh` hook installation logic
  - Test file access instead of just checking "running" status
  - Show progress indicators during wait
  - Clearer instructions for manual installation if automatic fails
- Enhanced `install-hooks.sh` with better container readiness detection
- Updated `docs/AGENT-INSTALLATION.md` with hook installation troubleshooting guide

### Added
- **VPN Hooks Authentication**: Added `VPN_TOKEN` environment variable for secure VPN hook authentication
  - Token used by OpenVPN hooks (vpn-login, vpn-connect, vpn-disconnect) to authenticate with Manager API
  - Sent as `X-VPN-Token` header in all `/api/v1/vpn/*` requests
  - Must be the same on Manager API and Agent/Hooks for authentication to work
  - Generate with: `openssl rand -hex 32`
  - Added to `.env.example`, `.env.production`, and all `docker-compose*.yml` files
  - Install script (`install-agent.sh`) now prompts for VPN_TOKEN during installation
- **Enhanced Session Logging**: Comprehensive session tracking and monitoring
  - Added `last_activity_at`, `disconnect_reason`, `client_version`, `device_name`, `geo_country`, `geo_city`, `connection_duration_seconds` to `vpn_sessions`
  - New `session_activities` table for periodic bandwidth and connection quality metrics
  - New `connection_attempts` table for tracking failed login attempts
  - Enhanced `audit_logs` with `session_id` and `metadata` fields
  - New API endpoints:
    - `GET /api/v1/sessions` - Active sessions with enhanced details
    - `GET /api/v1/sessions/:id` - Session details with activity history
    - `GET /api/v1/sessions/stats` - Session statistics
    - `POST /api/v1/sessions/:id/kick` - Admin kick user
    - `POST /api/v1/vpn/activity` - Update session activity metrics
    - `GET /api/v1/audit/connection-attempts` - Failed connection attempts
    - `GET /api/v1/audit/connection-attempts/stats` - Failed attempts statistics
  - Enhanced VPN hooks to send client_version, device_name, disconnect_reason
  - Auto-install VPN hooks during agent installation
  - Auto-update OpenVPN config to use hooks

### Changed
- **Security Enhancement**: Upgraded from `tls-auth` to `tls-crypt` for better security
  - `tls-crypt` provides both authentication and encryption of TLS handshake packets
  - More resistant to traffic analysis and port scanning
  - No `key-direction` parameter needed (simpler configuration)
  - Backward compatible: `ta_key` database field supports both methods
- **Docker Build Optimization**: Improved build speed and caching
  - Added BuildKit cache mounts for pnpm store
  - Reordered Dockerfile layers for better caching
  - Added `.dockerignore` to exclude unnecessary files
  - 60-70% faster rebuilds with proper cache hits
  - See `docs/DOCKER-BUILD-OPTIMIZATION.md`

### Added
- **Security Documentation**: Added comprehensive security hardening guide
  - User/group privilege dropping options
  - Firewall and rate limiting configurations
  - CRL (Certificate Revocation List) setup
  - SELinux/AppArmor policies
  - Security checklist and best practices
  - See `docs/SECURITY-HARDENING.md`
- **Certificate Sync Feature**: Auto-sync CA cert and TLS key from nodes to dashboard
  - Manual sync script: `scripts/sync-node-certs.sh`
  - Agent handler: `sync_certificates` task action
  - API endpoint: `POST /api/v1/nodes/sync-certs`
  - UI: "Sync Certificates" button on each node card
  - Prevents "tls-crypt unwrap error" after server setup/changes
  - See `docs/CERTIFICATE-SYNC.md`

### Fixed
- **GitHub Actions**: Updated workflow to use Node.js 24
  - Added `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true` environment variable
  - Future-proofs workflow ahead of June 2nd, 2026 deadline
  - Resolves deprecation warning for Node.js 20 actions
- **Agent Certificate Generation**: Fixed "easyrsa: not found" error
  - Changed from relative path `./easyrsa` to absolute path with `cwd` option
  - Added validation to check if easyrsa script exists before execution
  - Removed `process.chdir()` which caused working directory issues
  - Affects: generate-client-cert, create-user, revoke-user handlers
- **Tasks API**: Added missing POST endpoint for creating tasks
  - Route: `POST /api/v1/tasks`
  - Required for UI to trigger sync certificates and other tasks
  - Returns task ID and status

## [1.1.0] - 2024-03-16

### Fixed
- **Certificate Generation Timeout**: Fixed validation error in TaskResultSchema that prevented agent from reporting task results
  - Changed `errorMessage` field to accept `null` values (`.nullable()`)
  - Agent was sending `errorMessage: null` but schema only accepted `string | undefined`
  - This was causing HTTP 500 errors and preventing certificate generation from completing
- Added detailed logging for agent task result reporting to diagnose issues
- Added logging in API task result endpoint to track incoming agent requests
- Added version identifier in API startup logs for debugging
- **VPN Server Installation**: Fixed multiple issues on Debian 13
  - Missing directory creation for TLS key
  - Removed problematic `verify-client-cert none` directive
  - Changed `group nogroup` to `group nobody` for cross-distro compatibility
- **Certificate Generation**: Fixed "Username is required" error
  - Proper JSON payload parsing in agent task polling
- **Database Compatibility**: Fixed SQLite date calculation in certificate renewal
- **Type Errors**: Fixed TypeScript errors related to field naming inconsistencies
- **IP Address Display**: Fixed missing IP addresses in node selection dropdowns

### Added

#### VPN Configuration Sync System
- **Install Script Config Persistence**: VPN server installation now saves configuration to JSON file
  - Config saved to `/etc/openvpn/server/install-config.json`
  - Includes all settings: port, protocol, tunnel mode, network, DNS, cipher, etc.
  - Also saved in text format for easy reading
- **Auto-Sync on Registration**: Configuration automatically synced to database when node registers
  - Install script reads saved config and sends to API
  - Database stores actual VPN server configuration
  - Web UI displays real configuration from server
- **Default Tunnel Mode Changed**: Split tunnel is now the default (was full tunnel)
  - Better performance for most use cases
  - Only routes specific networks through VPN
  - Full tunnel still available as option
- **Configuration Consistency**: Ensures database matches actual VPN server settings
  - No more mismatch between install config and database
  - Admin can see actual server configuration in Web UI
  - Updates from Web UI still work as before

#### Node Auto-Registration System
- **Secure Auto-Registration**: VPN nodes can now auto-register with the Manager API
  - Two authentication methods: Registration Key or Admin JWT Token
  - Registration Key method (recommended): Set `NODE_REGISTRATION_KEY` in `.env`
  - Admin JWT Token method: Use admin token from browser
  - Prevents unauthorized node registration
- **Enhanced Install Script**: `install-agent.sh` now supports auto-registration
  - Interactive prompts for hostname, IP, and region
  - Automatic API call to register node
  - Falls back to manual registration if auto-registration fails
- **API Security**: Updated `/api/v1/nodes/register` endpoint
  - Requires either admin JWT token or valid registration key
  - Validates hostname and IP uniqueness
  - Returns error if authentication fails
- **Environment Configuration**: Added `NODE_REGISTRATION_KEY` to `.env.example` and `.env.production`

#### Certificate Management System
- **Client Certificate Generation**: Generate certificates for VPN users with customizable validity periods
  - Validity options: 1 day, 1 week, 2 weeks, 1 month, 3 months, 6 months, 1 year, or unlimited
  - Optional password protection for private keys
  - Certificates stored in database for easy management
- **Auto-Renewal System**: Automatic certificate renewal before expiration
  - Configurable renewal threshold (days before expiry)
  - Cron job runs hourly to check and renew certificates
  - Users must download new .ovpn file after renewal
- **Certificate Revocation List (CRL)**: Track and manage revoked certificates
  - Automatic revocation when regenerating certificates
  - Revocation reason tracking
  - Admin audit trail
- **Download History**: Track certificate downloads
  - IP address and user agent logging
  - Timestamp tracking
  - Per-user and per-node statistics
- **Bulk Operations**: Generate certificates for multiple users simultaneously
- **Expiration Warnings**: Dashboard banner showing certificates expiring within 30 days

#### Node Configuration Management
- **Customizable VPN Settings per Node**:
  - Port and protocol (UDP/TCP)
  - Tunnel mode (full/split)
  - VPN network and netmask
  - DNS servers (comma-separated)
  - Custom routes for split tunnel
  - Encryption cipher (AES-256-GCM, AES-128-GCM, AES-256-CBC)
  - Auth digest (SHA256, SHA384, SHA512)
  - Compression (LZ4-v2, LZ4, LZO, None)
  - Keepalive settings
  - Maximum concurrent clients
- **Web-Based Configuration**: Update node settings via UI
- **Configuration History**: Track configuration changes (table created, not yet implemented in UI)
- **Automatic Application**: Changes applied to VPN server via agent tasks

#### Installation & Deployment
- **Standalone Agent Installer**: One-line installation script for VPN nodes
  - Auto-installs Docker if not present
  - Auto-installs VPN server if not present
  - Interactive setup for credentials
  - Systemd service for auto-start
  - Management scripts (start, stop, logs, status)
- **VPN Server Installer Improvements**:
  - Interactive configuration (port, protocol, tunnel mode, network)
  - Better error handling and status checks
  - Cross-distribution compatibility improvements
  - Fixed Debian 13 compatibility issues

#### Database & Migrations
- **Reorganized Migrations**: Each migration now contains only one operation
  - 18 migrations total (previously had duplicate numbers)
  - Clear naming convention (create_table or add_fields)
  - Better rollback support
  - Migration documentation (README.md)
- **New Tables**:
  - `cert_download_history`: Track certificate downloads
  - `cert_revocations`: Certificate revocation list
  - `node_config_history`: Node configuration change history
- **New Fields**:
  - Users: Certificate fields, auto-renewal settings
  - VPN Nodes: Configuration fields (protocol, cipher, DNS, etc.)

#### API Improvements
- **Multi-Database Support**: Query compatibility for SQLite, MySQL/MariaDB, and PostgreSQL
  - Database-agnostic date calculations in certificate renewal
  - Proper type casting for different database engines
- **Task Payload Parsing**: Fixed JSON payload parsing for agent tasks
- **Node Configuration Endpoints**:
  - `GET /api/v1/nodes/:id/config`: Get node configuration
  - `PUT /api/v1/nodes/:id/config`: Update node configuration
- **Certificate Endpoints**:
  - `POST /api/v1/users/:id/generate-cert`: Generate client certificate
  - `POST /api/v1/users/bulk-generate-cert`: Bulk certificate generation
  - `GET /api/v1/users/:id/vpn`: Download .ovpn file with node-specific settings

#### Agent Improvements
- **New Handlers**:
  - `generate-client-cert`: Generate client certificates using EasyRSA
  - `update-server-config`: Update VPN server configuration
- **Certificate Generation**: Support for password-protected keys and custom validity
- **Configuration Management**: Apply configuration changes to VPN server

#### UI/UX Improvements
- **Certificate Management UI**:
  - Generate certificate modal with validity options
  - Password protection toggle
  - Certificate status badges
  - Bulk selection and generation
  - Expiration warning banner
- **Node Configuration UI**:
  - Configuration modal with all settings
  - Real-time validation
  - Settings organized by category
  - Configure button on node cards
- **Consistent Field Naming**: All types now use snake_case (matching database)

#### Documentation
- **Updated README.md**: Added certificate management and node configuration features
- **Updated PRODUCTION-INSTALL.md**: Added initial configuration steps
- **Updated DOCKER.md**: Added feature configuration section
- **New CHANGELOG.md**: Track all changes
- **Migration Documentation**: README.md in migrations folder

### Changed

- **Node Registration**: Default status changed from `online` to `offline`
  - Nodes become online after first heartbeat
- **Type Definitions**: All types now use snake_case for consistency
  - `VpnNode`: `ipAddress` → `ip_address`, `lastSeen` → `last_seen`, etc.
  - `User`: `isActive` → `is_active`, `lastLogin` → `last_login`, etc.
  - `Task`: `nodeId` → `node_id`, `errorMessage` → `error_message`, etc.
  - All other types updated for consistency
- **Certificate Validity**: Default changed from 365 days to unlimited (null in database)
- **.ovpn Generation**: Now uses node-specific settings (protocol, cipher, compression, etc.)
- **GitHub Actions**: Changed to manual trigger by default with service selection options

### Security

- **Password-Protected Keys**: Support for encrypting client private keys
- **Certificate Revocation**: Proper CRL management for compromised certificates
- **Download Tracking**: Audit trail for certificate downloads
- **Configuration Audit**: Track who changed node configurations (table ready)

## [1.0.0] - Initial Release

### Added
- Multi-database support (SQLite, PostgreSQL, MySQL/MariaDB)
- Node clustering and management
- Role-based access control (Admin/User)
- Network policies (CIDR-based routing)
- Active session tracking
- User and group management
- VPN node agent
- Web dashboard (Next.js + Tailwind CSS)
- REST API (Fastify + Knex)
- Docker deployment support
- Development and production environments

---

## Migration Guide

### From Previous Version

If you're upgrading from a previous version:

1. **Backup your database** before running migrations
2. **Run migrations**: `pnpm db:migrate` or restart Docker containers
3. **Update environment variables** if needed (check `.env.example`)
4. **Regenerate certificates** for users (old certificates may not have all features)
5. **Update agent** on VPN nodes to support new configuration features

### Breaking Changes

- **Type Definitions**: If you have custom code using the types, update field names from camelCase to snake_case
- **Node Status**: Newly registered nodes will be offline by default (update your monitoring if needed)

---

## Roadmap

### Planned Features

- [ ] Two-factor authentication (2FA)
- [ ] LDAP/Active Directory integration
- [ ] Advanced network policies (time-based, bandwidth limits)
- [ ] Real-time connection monitoring dashboard
- [ ] Email notifications for certificate expiration
- [ ] Webhook support for events
- [ ] Multi-tenancy support
- [ ] API rate limiting per user
- [ ] Audit log viewer in UI
- [ ] Configuration templates for nodes
- [ ] Automated testing suite
- [ ] Performance metrics and analytics
- [ ] Mobile app for certificate management

### Under Consideration

- [ ] WireGuard support (in addition to OpenVPN)
- [ ] Let's Encrypt integration for certificates
- [ ] Geo-IP based node selection
- [ ] Load balancing across nodes
- [ ] Failover and high availability
- [ ] Kubernetes deployment support
- [ ] Terraform modules
- [ ] Ansible playbooks

---

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Support

- **Issues**: [GitHub Issues](https://github.com/adityadarma/vpn-manager/issues)
- **Discussions**: [GitHub Discussions](https://github.com/adityadarma/vpn-manager/discussions)
- **Email**: adhit.boys1@gmail.com
