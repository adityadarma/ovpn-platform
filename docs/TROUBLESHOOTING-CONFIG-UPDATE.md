# Troubleshooting: Config Update Issues

## Problem: "VPN disconnected after config update"

### Symptoms:
```
Failed to update server config: VPN disconnected after config update. Restored previous config.
```

High CPU usage after config update attempt.

### Root Cause:

1. **SIGHUP reload** causes OpenVPN to restart
2. **Management socket disconnects** during restart
3. Agent checks `isConnected()` too early → returns `false`
4. Agent restores backup config (thinking update failed)
5. **Infinite reconnect loop** → CPU spike

### Solution (Fixed):

Handler sekarang **tidak check connection** setelah reload karena:
- OpenVPN akan disconnect socket saat reload
- Driver akan auto-reconnect setelah reload selesai
- Check terlalu cepat akan false negative

### Changes Made:

#### 1. Update Server Config Handler

**Before:**
```typescript
await driver.sendCommand('signal SIGHUP')
await new Promise(resolve => setTimeout(resolve, 2000))

if (!driver.isConnected()) {  // ❌ Too early!
  writeFileSync(CONFIG_PATH, currentConfig)
  throw new Error('VPN disconnected')
}
```

**After:**
```typescript
await driver.sendCommand('signal SIGHUP')
await new Promise(resolve => setTimeout(resolve, 5000))

// ✅ Don't check connection - let auto-reconnect handle it
return { success: true, message: 'OpenVPN is reloading...' }
```

#### 2. Exponential Backoff for Reconnect

**Before:**
```typescript
// Fixed 5s interval - can cause CPU spike
setTimeout(() => this.connect(), 5000)
```

**After:**
```typescript
// Exponential backoff: 5s, 7.5s, 11.25s, ... max 30s
const backoffDelay = Math.min(
  this.reconnectInterval * Math.pow(1.5, this.reconnectAttempts),
  30000
)
```

#### 3. Max Reconnect Attempts

```typescript
private reconnectAttempts = 0
private maxReconnectAttempts = 10

// Stop after 10 attempts to prevent infinite loop
if (this.reconnectAttempts < this.maxReconnectAttempts) {
  // Reconnect with backoff
} else {
  console.error('Max reconnect attempts reached. Giving up.')
}
```

## Expected Behavior After Fix:

### Normal Config Update Flow:

1. Agent writes new config
2. Agent sends `SIGHUP` to OpenVPN
3. OpenVPN reloads config (socket disconnects)
4. Agent waits 5 seconds
5. Agent returns success (doesn't check connection)
6. Driver auto-reconnects in background
7. Connection restored automatically

### Logs:

```
[update-config] Backed up current config
[update-config] Wrote new config
[update-config] Sent SIGHUP signal to OpenVPN
[update-config] Waiting for OpenVPN to reload...
[openvpn-driver] Connection closed (/run/openvpn/server.sock)
[openvpn-driver] Reconnect attempt 1/10 in 5s...
[openvpn-driver] Connecting to Unix socket: /run/openvpn/server.sock
[openvpn-driver] Connected to Unix socket: /run/openvpn/server.sock
[openvpn-driver] Realtime events enabled
```

## Monitoring:

### Check Reconnect Status

```bash
# Watch agent logs
docker logs -f vpn-agent | grep reconnect

# Should see:
# Reconnect attempt 1/10 in 5s...
# Connected to Unix socket
```

### Check CPU Usage

```bash
# Before fix: CPU spike to 100%
# After fix: Normal CPU usage

docker stats vpn-agent
```

### Check OpenVPN Status

```bash
# Verify OpenVPN is running
systemctl status openvpn-server@server

# Check socket exists
ls -la /run/openvpn/server.sock
```

## Prevention:

### 1. Don't Check Connection Too Early

```typescript
// ❌ Bad - checks before reconnect completes
await driver.sendCommand('signal SIGHUP')
if (!driver.isConnected()) { /* ... */ }

// ✅ Good - let auto-reconnect handle it
await driver.sendCommand('signal SIGHUP')
await new Promise(resolve => setTimeout(resolve, 5000))
return { success: true }
```

### 2. Use Exponential Backoff

```typescript
// ✅ Prevents CPU spike from rapid reconnects
const backoffDelay = Math.min(
  baseInterval * Math.pow(1.5, attempts),
  maxDelay
)
```

### 3. Limit Reconnect Attempts

```typescript
// ✅ Prevents infinite loop
if (attempts < maxAttempts) {
  reconnect()
} else {
  giveUp()
}
```

## Related Issues:

### High CPU After Config Update

**Cause:** Infinite reconnect loop  
**Fix:** Exponential backoff + max attempts

### Config Update Always Fails

**Cause:** Checking connection too early  
**Fix:** Don't check connection after SIGHUP

### Socket Permission Denied

**Cause:** Wrong permissions on `/run/openvpn/server.sock`  
**Fix:** `sudo chmod 666 /run/openvpn/server.sock`

## Testing:

### Test Config Update

```bash
# 1. Update config via API
curl -X PUT http://localhost:3001/api/v1/nodes/{node_id}/config \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"vpn_network":"10.8.0.0","vpn_netmask":"255.255.255.0"}'

# 2. Watch logs
docker logs -f vpn-agent

# 3. Should see:
# - SIGHUP sent
# - Connection closed
# - Reconnect attempt
# - Connected successfully

# 4. Verify CPU normal
docker stats vpn-agent
```

## References:

- [OpenVPN SIGHUP](https://openvpn.net/community-resources/reference-manual-for-openvpn-2-4/)
- [Exponential Backoff](https://en.wikipedia.org/wiki/Exponential_backoff)
- [Unix Socket Reconnection](https://man7.org/linux/man-pages/man7/unix.7.html)
