# Node Registration Guide

This guide explains how to register VPN nodes with the OpenVPN Manager.

## Table of Contents

- [Overview](#overview)
- [Security Methods](#security-methods)
- [Auto-Registration](#auto-registration)
- [Manual Registration](#manual-registration)
- [Troubleshooting](#troubleshooting)

---

## Overview

VPN nodes must be registered with the Manager before they can accept connections. There are two main approaches:

1. **Auto-Registration**: Node registers itself during installation
2. **Manual Registration**: Admin registers node via Web UI first

---

## Security Methods

### Method 1: Registration Key (Recommended)

The most secure method for production environments.

**Setup:**

1. Generate a secure registration key:
   ```bash
   openssl rand -hex 32
   ```

2. Add to Manager's `.env` file:
   ```env
   NODE_REGISTRATION_KEY=your_generated_key_here
   ```

3. Restart Manager:
   ```bash
   docker compose restart
   ```

4. Share the key only with authorized node administrators

**Advantages:**
- ✅ No need to share admin credentials
- ✅ Key can be rotated regularly
- ✅ Single key for all node registrations
- ✅ Easy to revoke (just change the key)

**Usage:**
```bash
# During agent installation
curl -fsSL https://raw.githubusercontent.com/adityadarma/ovpn-manager/main/scripts/install-agent.sh | sudo bash

# Choose: Auto-register → Registration Key
# Enter the NODE_REGISTRATION_KEY value
```

---

### Method 2: Admin JWT Token

Use admin credentials to register nodes.

**How to Get JWT Token:**

1. Login to Manager Web UI as admin
2. Open browser Developer Tools:
   - Chrome/Edge: Press `F12` or `Ctrl+Shift+I`
   - Firefox: Press `F12` or `Ctrl+Shift+K`
   - Safari: Enable Developer Menu, then press `Cmd+Option+I`

3. Navigate to:
   - **Chrome/Edge**: Application → Storage → Local Storage → Select your domain
   - **Firefox**: Storage → Local Storage → Select your domain
   - **Safari**: Storage → Local Storage → Select your domain

4. Find the `token` key and copy its value

**Advantages:**
- ✅ No additional configuration needed
- ✅ Uses existing admin authentication
- ✅ Token expires automatically

**Disadvantages:**
- ❌ Requires sharing admin token
- ❌ Token expires (default: 7 days)
- ❌ Must re-authenticate after expiry

**Usage:**
```bash
# During agent installation
curl -fsSL https://raw.githubusercontent.com/adityadarma/ovpn-manager/main/scripts/install-agent.sh | sudo bash

# Choose: Auto-register → Admin JWT Token
# Paste the token from browser
```

---

### Method 3: Manual Registration

Traditional method where admin registers node first.

**Steps:**

1. Login to Manager Web UI as admin
2. Navigate to **Nodes** → **Add Node**
3. Fill in node details:
   - Hostname (e.g., `vpn-us-east-1`)
   - IP Address (public IP of VPN server)
   - Port (default: 1194)
   - Region (optional, e.g., `US East`)
4. Click **Register**
5. Copy the **Node ID** and **Secret Token** (shown only once!)
6. Save credentials securely

**Usage:**
```bash
# During agent installation
curl -fsSL https://raw.githubusercontent.com/adityadarma/ovpn-manager/main/scripts/install-agent.sh | sudo bash

# Choose: Manual registration
# Enter Node ID and Secret Token
```

---

## Auto-Registration

### Using Registration Key

**On Manager Server:**

```bash
# 1. Generate key
openssl rand -hex 32

# 2. Add to .env
echo "NODE_REGISTRATION_KEY=your_key_here" >> .env

# 3. Restart
docker compose restart
```

**On VPN Node:**

```bash
# Run installer
curl -fsSL https://raw.githubusercontent.com/adityadarma/ovpn-manager/main/scripts/install-agent.sh | sudo bash
```

Follow the prompts:
```
Enter Manager API URL: http://manager-server:3001
Choose registration method [1/2]: 1
Enter hostname: vpn-singapore-1
Enter public IP address: 203.0.113.10
Enter region: Singapore
Choose auth method [1/2]: 2
Enter Registration Key: [paste your key]
```

### Using Admin JWT Token

**Get Token:**
1. Login to Web UI
2. Open DevTools → Application → Local Storage
3. Copy `token` value

**On VPN Node:**

```bash
curl -fsSL https://raw.githubusercontent.com/adityadarma/ovpn-manager/main/scripts/install-agent.sh | sudo bash
```

Follow the prompts:
```
Enter Manager API URL: http://manager-server:3001
Choose registration method [1/2]: 1
Enter hostname: vpn-singapore-1
Enter public IP address: 203.0.113.10
Enter region: Singapore
Choose auth method [1/2]: 1
Enter Admin JWT Token: [paste token]
```

---

## Manual Registration

### Via Web UI

1. Login to Manager Web UI
2. Go to **Nodes** → **Add Node**
3. Fill in details and click **Register**
4. Copy Node ID and Secret Token

### Via API (cURL)

```bash
# Login first to get JWT token
TOKEN=$(curl -s -X POST http://manager-server:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@1234!"}' \
  | jq -r '.token')

# Register node
curl -X POST http://manager-server:3001/api/v1/nodes/register \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "hostname": "vpn-singapore-1",
    "ip": "203.0.113.10",
    "port": 1194,
    "region": "Singapore"
  }'
```

---

## Troubleshooting

### Registration Failed: Invalid Registration Key

**Problem:** The registration key doesn't match.

**Solution:**
1. Check `NODE_REGISTRATION_KEY` in Manager's `.env`
2. Ensure no extra spaces or newlines
3. Restart Manager after changing `.env`
4. Verify key is exactly 64 characters (hex)

### Registration Failed: Unauthorized

**Problem:** JWT token is invalid or expired.

**Solution:**
1. Get a fresh token from browser
2. Check token hasn't expired (default: 7 days)
3. Ensure you're logged in as admin
4. Try logging out and back in

### Registration Failed: Node Already Exists

**Problem:** A node with the same hostname or IP already exists.

**Solution:**
1. Check existing nodes in Web UI
2. Delete the old node if it's no longer needed
3. Use a different hostname or IP
4. Contact admin to remove duplicate

### Cannot Connect to Manager API

**Problem:** Network connectivity issues.

**Solution:**
1. Check Manager API is running:
   ```bash
   curl http://manager-server:3001/api/v1/health
   ```
2. Verify firewall allows port 3001
3. Check DNS resolution:
   ```bash
   ping manager-server
   ```
4. Try using IP address instead of hostname

### Registration Key Not Set

**Problem:** `NODE_REGISTRATION_KEY` is empty in Manager's `.env`.

**Solution:**
1. Generate a key: `openssl rand -hex 32`
2. Add to `.env`: `NODE_REGISTRATION_KEY=your_key`
3. Restart Manager: `docker compose restart`
4. Or use Admin JWT Token method instead

---

## Security Best Practices

1. **Use Registration Key in Production**
   - More secure than sharing admin tokens
   - Easier to rotate and revoke

2. **Rotate Keys Regularly**
   - Change `NODE_REGISTRATION_KEY` every 90 days
   - Update all node administrators

3. **Limit Key Distribution**
   - Share only with authorized personnel
   - Use secure channels (encrypted email, password manager)

4. **Monitor Node Registrations**
   - Check audit logs regularly
   - Verify all registered nodes are legitimate

5. **Use Strong Passwords**
   - Admin accounts should have strong passwords
   - Enable 2FA when available (future feature)

6. **Network Security**
   - Use HTTPS for Manager API in production
   - Restrict API access with firewall rules
   - Consider VPN or private network for management

---

## API Reference

### POST /api/v1/nodes/register

Register a new VPN node.

**Authentication:** Admin JWT Token OR Registration Key

**Request:**
```json
{
  "hostname": "vpn-singapore-1",
  "ip": "203.0.113.10",
  "port": 1194,
  "region": "Singapore",
  "version": "auto-registered",
  "registrationKey": "your_key_here"
}
```

**Headers:**
```
Content-Type: application/json
Authorization: Bearer <admin_jwt_token>  (if using JWT)
```

**Response (201 Created):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "token": "abc123...xyz789",
  "message": "Node registered successfully"
}
```

**Error Responses:**

- `400 Bad Request`: Missing required fields
- `401 Unauthorized`: No authentication provided
- `403 Forbidden`: Invalid registration key or not admin
- `409 Conflict`: Node with hostname/IP already exists

---

## FAQ

**Q: Can I use both Registration Key and JWT Token?**

A: Yes, the system accepts either method. Use whichever is more convenient.

**Q: How long does the JWT token last?**

A: Default is 7 days (`JWT_EXPIRES_IN=7d` in `.env`). You can change this value.

**Q: Can I register multiple nodes with the same key?**

A: Yes, the registration key can be used for multiple nodes.

**Q: What happens if I change the registration key?**

A: Existing nodes are not affected. Only new registrations will require the new key.

**Q: Can I disable auto-registration?**

A: Yes, leave `NODE_REGISTRATION_KEY` empty and don't share admin tokens. Only manual registration via Web UI will work.

**Q: Is the registration key stored in the database?**

A: No, it's only in the `.env` file and checked at runtime.

---

## Support

If you encounter issues:

1. Check the [Troubleshooting](#troubleshooting) section
2. Review Manager API logs: `docker compose logs api`
3. Review Agent logs: `docker compose logs agent`
4. Open an issue on GitHub
5. Contact: adhit.boys1@gmail.com
