# VPN Manager Documentation

## ⚠️ Installation Order

**IMPORTANT:** Always install in this order:

1. **First:** Install VPN Manager (API + Web UI)
2. **Second:** Install VPN Node (OpenVPN + Agent)

See [Installation Guide](./INSTALLATION.md) for complete steps.

---

## 📚 Essential Documentation

- **[Installation Guide](./INSTALLATION.md)** - Complete installation (Manager → Node)
- **[Architecture](./ARCHITECTURE.md)** - System design and principles
- **[Multi-VPN Support](./MULTI-VPN-SUPPORT.md)** - OpenVPN, WireGuard, and more
- **[Security Hardening](./SECURITY-HARDENING.md)** - Security best practices
- **[API Reference](./API-ENDPOINTS.md)** - Complete API documentation

## Quick Start

### Step 1: Install Manager (First)

```bash
curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/scripts/install-manager.sh | sudo bash
```

Access: http://YOUR_SERVER_IP:3000 (admin / Admin@1234!)

### Step 2: Install VPN Node (Second)

```bash
curl -fsSL https://raw.githubusercontent.com/adityadarma/vpn-manager/main/scripts/install-node.sh | sudo bash
```

## What's New in v2.0

- ✅ OpenVPN Management Interface (no systemd dependency)
- ✅ No NET_ADMIN privileges required
- ✅ Real-time monitoring via TCP interface
- ✅ One-command installation
- ✅ Simplified architecture
- ✅ Multi-VPN support (OpenVPN, WireGuard)

See [Architecture](./ARCHITECTURE.md) for details.
