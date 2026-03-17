# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **Security Enhancement**: Upgraded from `tls-auth` to `tls-crypt` for better security
  - `tls-crypt` provides both authentication and encryption of TLS handshake packets
  - More resistant to traffic analysis and port scanning
  - No `key-direction` parameter needed (simpler configuration)
  - Backward compatible: `ta_key` database field supports both methods

### Added
- **Security Documentation**: Added comprehensive security hardening guide
  - User/group privilege dropping options
  - Firewall and rate limiting configurations
  - CRL (Certificate Revocation List) setup
  - SELinux/AppArmor policies
  - Security checklist and best practices
  - See `docs/SECURITY-HARDENING.md`

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
  - Auto-installs OpenVPN server if not present
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
  - `GET /api/v1/users/:id/ovpn`: Download .ovpn file with node-specific settings

#### Agent Improvements
- **New Handlers**:
  - `generate-client-cert`: Generate client certificates using EasyRSA
  - `update-server-config`: Update OpenVPN server configuration
- **Certificate Generation**: Support for password-protected keys and custom validity
- **Configuration Management**: Apply configuration changes to OpenVPN server

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

- **Issues**: [GitHub Issues](https://github.com/adityadarma/ovpn-manager/issues)
- **Discussions**: [GitHub Discussions](https://github.com/adityadarma/ovpn-manager/discussions)
- **Email**: adhit.boys1@gmail.com
