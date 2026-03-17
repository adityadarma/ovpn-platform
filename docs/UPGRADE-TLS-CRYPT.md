# Upgrade Guide: tls-auth to tls-crypt

This guide explains how to upgrade existing OpenVPN nodes from `tls-auth` to `tls-crypt` for enhanced security.

## Why Upgrade?

`tls-crypt` provides several advantages over `tls-auth`:

- **Encryption + Authentication**: Encrypts TLS handshake packets (tls-auth only authenticates)
- **Better Security**: More resistant to traffic analysis and port scanning
- **Simpler Config**: No `key-direction` parameter needed
- **Modern Standard**: Recommended for OpenVPN 2.4+ deployments

## Compatibility

- **OpenVPN Version**: Requires OpenVPN 2.4.0 or later (both server and client)
- **Backward Compatibility**: Old clients with `tls-auth` will NOT work with `tls-crypt` servers
- **Database**: No schema changes needed - `ta_key` field supports both methods

## Upgrade Steps

### For New Installations

New installations automatically use `tls-crypt`. No action needed.

### For Existing Nodes

#### Option 1: Fresh Installation (Recommended)

1. **Backup existing configuration**:
   ```bash
   sudo cp -r /etc/openvpn/server /etc/openvpn/server.backup
   ```

2. **Uninstall old OpenVPN**:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/yourusername/ovpn-manager/main/scripts/vpn-server.sh | sudo bash -s uninstall
   ```

3. **Install with new script**:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/yourusername/ovpn-manager/main/scripts/vpn-server.sh | sudo bash -s install
   ```

4. **Update node certificates in dashboard**:
   - Go to Nodes → Select Node → Upload Certificates
   - Upload new `/etc/openvpn/server/ca.crt`
   - Upload new `/etc/openvpn/server/tls-crypt.key`

5. **Regenerate all client certificates**:
   - All users need new `.ovpn` files
   - Old configs will not work

#### Option 2: Manual Upgrade (Advanced)

1. **Generate tls-crypt key**:
   ```bash
   sudo openvpn --genkey secret /etc/openvpn/server/tls-crypt.key
   ```

2. **Update server config** (`/etc/openvpn/server/server.conf`):
   ```diff
   - tls-auth /etc/openvpn/server/ta.key 0
   + tls-crypt /etc/openvpn/server/tls-crypt.key
   ```

3. **Restart OpenVPN**:
   ```bash
   sudo systemctl restart openvpn-server@server.service
   ```

4. **Update node in dashboard**:
   - Upload new `tls-crypt.key` content to the node's `ta_key` field

5. **Regenerate client configs**:
   - Download new `.ovpn` files for all users
   - Distribute to clients

## Migration Strategy

### Zero-Downtime Migration

For production environments, consider running both servers temporarily:

1. **Setup new node** with `tls-crypt`
2. **Migrate users gradually**:
   - Generate new certs on new node
   - Test with pilot users
   - Roll out to all users
3. **Decommission old node** after all users migrated

### Testing

After upgrade, verify:

```bash
# Check server is running
sudo systemctl status openvpn-server@server.service

# Check config syntax
sudo openvpn --config /etc/openvpn/server/server.conf --test-crypto

# Test client connection
# Download .ovpn from dashboard and test connection
```

## Troubleshooting

### Error: "cannot locate HMAC in incoming packet"

This means client is using `tls-auth` but server expects `tls-crypt` (or vice versa).

**Solution**: Regenerate and download new `.ovpn` config from dashboard.

### Error: "Unsupported option: tls-crypt"

Your OpenVPN version is too old (< 2.4.0).

**Solution**: 
```bash
# Check version
openvpn --version

# Upgrade OpenVPN (Ubuntu/Debian)
sudo apt update
sudo apt install openvpn

# Upgrade OpenVPN (CentOS/RHEL)
sudo yum update openvpn
```

### Clients can't connect after upgrade

1. Verify server is running: `sudo systemctl status openvpn-server@server.service`
2. Check server logs: `sudo tail -f /var/log/openvpn.log`
3. Ensure client has NEW `.ovpn` file (not old one)
4. Verify node certificates uploaded correctly in dashboard

## Rollback

If you need to rollback:

1. **Restore backup**:
   ```bash
   sudo systemctl stop openvpn-server@server.service
   sudo rm -rf /etc/openvpn/server
   sudo cp -r /etc/openvpn/server.backup /etc/openvpn/server
   sudo systemctl start openvpn-server@server.service
   ```

2. **Revert node certificates** in dashboard to old `ta.key`

3. **Clients use old `.ovpn` files**

## Support

For issues or questions:
- GitHub Issues: https://github.com/yourusername/ovpn-manager/issues
- Documentation: https://github.com/yourusername/ovpn-manager/docs
