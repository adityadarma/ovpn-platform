# Security Hardening Guide

This guide covers optional security enhancements for production OpenVPN deployments.

## User/Group Privilege Dropping

By default, OpenVPN Manager runs OpenVPN as `root` to avoid permission issues. For enhanced security, you can configure OpenVPN to drop privileges after initialization.

### Default Configuration (Current)

```conf
# Drop privileges after initialization
# Uncomment if you want enhanced security (may cause permission issues with some features)
# user nobody
# group nogroup
```

**Pros:**
- ✅ No permission issues
- ✅ Agent can manage config dynamically
- ✅ Scripts work without issues

**Cons:**
- ⚠️ OpenVPN runs as root (higher risk if compromised)

### Hardened Configuration (Recommended for Production)

#### Option 1: Use `nobody` user (Maximum Security)

1. **Set proper permissions**:
   ```bash
   # Make log directory writable
   sudo mkdir -p /var/log/openvpn
   sudo chown -R nobody:nogroup /var/log/openvpn
   
   # Make CRL readable
   sudo chown nobody:nogroup /etc/openvpn/server/crl.pem 2>/dev/null || true
   ```

2. **Enable in config** (`/etc/openvpn/server/server.conf`):
   ```conf
   user nobody
   group nogroup
   ```

3. **Restart OpenVPN**:
   ```bash
   sudo systemctl restart openvpn-server@server.service
   ```

**Limitations:**
- Agent cannot dynamically reload config (requires manual restart)
- Client-connect/disconnect scripts may fail
- CRL updates need special handling

#### Option 2: Dedicated `openvpn` user (Balanced)

1. **Create dedicated user**:
   ```bash
   sudo useradd -r -s /usr/sbin/nologin openvpn
   ```

2. **Set permissions**:
   ```bash
   # Logs
   sudo mkdir -p /var/log/openvpn
   sudo chown -R openvpn:openvpn /var/log/openvpn
   
   # Config directory (read-only)
   sudo chown -R root:openvpn /etc/openvpn/server
   sudo chmod -R 750 /etc/openvpn/server
   
   # Private keys (strict permissions)
   sudo chmod 600 /etc/openvpn/server/*.key
   sudo chown root:openvpn /etc/openvpn/server/*.key
   ```

3. **Enable in config**:
   ```conf
   user openvpn
   group openvpn
   ```

4. **Allow agent to manage** (optional):
   ```bash
   # Add agent user to openvpn group
   sudo usermod -aG openvpn root
   ```

**Benefits:**
- ✅ Better security than running as root
- ✅ More flexible than `nobody`
- ✅ Can set granular permissions

## Additional Security Measures

### 1. Firewall Rules

Restrict OpenVPN port to specific IPs:

```bash
# Allow only from specific IPs
sudo iptables -A INPUT -p udp --dport 1194 -s 203.0.113.0/24 -j ACCEPT
sudo iptables -A INPUT -p udp --dport 1194 -j DROP

# Save rules
sudo iptables-save > /etc/iptables/rules.v4
```

### 2. Rate Limiting

Prevent DoS attacks:

```bash
# Limit new connections
sudo iptables -A INPUT -p udp --dport 1194 -m state --state NEW -m recent --set
sudo iptables -A INPUT -p udp --dport 1194 -m state --state NEW -m recent --update --seconds 60 --hitcount 10 -j DROP
```

### 3. TLS Version Enforcement

Already configured in default setup:

```conf
tls-version-min 1.2
tls-cipher TLS-ECDHE-ECDSA-WITH-AES-128-GCM-SHA256
```

### 4. Certificate Revocation List (CRL)

Enable CRL checking:

```bash
# Generate CRL
cd /etc/openvpn/easy-rsa
./easyrsa gen-crl

# Copy to server directory
sudo cp pki/crl.pem /etc/openvpn/server/
```

Add to server config:

```conf
crl-verify /etc/openvpn/server/crl.pem
```

### 5. Disable Compression (Optional)

Compression can leak information via VORACLE attack:

```conf
# In server.conf, remove or comment:
# compress lz4-v2
# push "compress lz4-v2"
```

### 6. Client Certificate Validation

Enforce client certificates:

```conf
# Already in default config
remote-cert-tls client
```

### 7. Logging & Monitoring

Enhanced logging:

```conf
# Increase verbosity for security events
verb 4

# Log to syslog for centralized monitoring
syslog openvpn-server
```

Monitor logs:

```bash
# Watch for failed auth attempts
sudo tail -f /var/log/openvpn/openvpn.log | grep -i "auth\|fail\|error"

# Check active connections
sudo cat /var/log/openvpn/status.log
```

### 8. SELinux/AppArmor

If using SELinux or AppArmor, create policies:

**SELinux (CentOS/RHEL)**:
```bash
# Check if SELinux is enforcing
getenforce

# Allow OpenVPN
sudo setsebool -P openvpn_enable_homedirs 1
sudo setsebool -P openvpn_can_network_connect 1
```

**AppArmor (Ubuntu/Debian)**:
```bash
# Check AppArmor status
sudo aa-status

# OpenVPN profile usually included by default
# If issues, set to complain mode:
sudo aa-complain /usr/sbin/openvpn
```

## Security Checklist

- [ ] Drop privileges to `nobody` or dedicated `openvpn` user
- [ ] Firewall rules restrict VPN port access
- [ ] Rate limiting enabled
- [ ] TLS 1.2+ enforced
- [ ] CRL checking enabled
- [ ] Strong ciphers configured (AES-256-GCM)
- [ ] Client certificate validation enabled
- [ ] Logging configured and monitored
- [ ] Regular certificate rotation
- [ ] Keep OpenVPN updated
- [ ] Disable unused features (compression if not needed)

## Testing Security Configuration

After hardening:

1. **Test connection**:
   ```bash
   # From client
   openvpn --config client.ovpn --verb 4
   ```

2. **Verify privileges**:
   ```bash
   # Check OpenVPN process user
   ps aux | grep openvpn
   ```

3. **Check permissions**:
   ```bash
   # Verify file permissions
   ls -la /etc/openvpn/server/
   ```

4. **Test CRL**:
   ```bash
   # Revoke a test cert and verify it's blocked
   cd /etc/openvpn/easy-rsa
   ./easyrsa revoke test-user
   ./easyrsa gen-crl
   sudo cp pki/crl.pem /etc/openvpn/server/
   sudo systemctl reload openvpn-server@server.service
   ```

## Troubleshooting

### Permission Denied Errors

If you see permission errors after enabling privilege dropping:

```bash
# Check log ownership
sudo chown -R nobody:nogroup /var/log/openvpn

# Check config directory
sudo chmod 755 /etc/openvpn/server
```

### Agent Cannot Reload Config

If agent fails to reload after privilege dropping:

```bash
# Option 1: Keep OpenVPN as root (less secure)
# Comment out user/group in config

# Option 2: Use systemd reload (more secure)
# Agent should use: systemctl reload openvpn-server@server.service
```

### Scripts Not Working

Client-connect/disconnect scripts need proper permissions:

```bash
# Make scripts executable
sudo chmod +x /etc/openvpn/server/scripts/*

# Set ownership
sudo chown nobody:nogroup /etc/openvpn/server/scripts/*
```

## References

- [OpenVPN Security Overview](https://openvpn.net/community-resources/how-to/#security)
- [Hardening OpenVPN](https://community.openvpn.net/openvpn/wiki/Hardening)
- [VORACLE Attack](https://openvpn.net/security-advisory/the-voracle-attack-vulnerability/)
