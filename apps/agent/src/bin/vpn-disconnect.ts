#!/usr/bin/env node
/**
 * vpn-disconnect — Client disconnect hook
 *
 * Called by VPN: client-disconnect /path/to/this/script
 *
 * VPN env vars:
 *   $common_name         — username
 *   $ifconfig_pool_remote_ip — VPN IP
 *   $bytes_sent          — bytes sent by client
 *   $bytes_received      — bytes received by client
 *   $time_duration       — session duration in seconds
 *
 * VPN server config:
 *   client-disconnect /usr/local/bin/vpn-disconnect
 */

import path from 'node:path'
import dotenv from 'dotenv'

const envPath = process.env['VPN_ENV_PATH'] ?? path.resolve('/etc/vpn-agent/.env')
dotenv.config({ path: envPath })

const MANAGER_URL = process.env['AGENT_MANAGER_URL']
const VPN_TOKEN = process.env['VPN_TOKEN']
const NODE_ID = process.env['AGENT_NODE_ID']

if (!MANAGER_URL || !VPN_TOKEN || !NODE_ID) {
  console.error('[vpn-disconnect] AGENT_MANAGER_URL, VPN_TOKEN and AGENT_NODE_ID must be set')
  process.exit(1)
}

// Read VPN-provided env vars
const username = process.env['common_name'] ?? ''
const vpnIp = process.env['ifconfig_pool_remote_ip'] ?? ''
const bytesSent = parseInt(process.env['bytes_sent'] ?? '0', 10)
const bytesReceived = parseInt(process.env['bytes_received'] ?? '0', 10)
const duration = parseInt(process.env['time_duration'] ?? '0', 10)

async function main() {
  if (!username) {
    console.error('[vpn-disconnect] Missing common_name env var')
    process.exit(1)
  }

  console.log(`[vpn-disconnect] ${username} disconnected — duration: ${duration}s, ↑${bytesSent}B ↓${bytesReceived}B`)

  // 1. Report disconnect to manager API
  try {
    const res = await fetch(`${MANAGER_URL}/api/v1/vpn/disconnect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-VPN-Token': VPN_TOKEN!,
      },
      body: JSON.stringify({
        username,
        node_id: NODE_ID,
        bytes_sent: bytesSent,
        bytes_received: bytesReceived,
        disconnect_reason: 'normal',
      }),
    })

    if (res.ok) {
      const data = await res.json() as { sessions_closed: number }
      console.log(`[vpn-disconnect] ✅ ${data.sessions_closed} session(s) closed in manager`)
    } else {
      const err = await res.json() as { error: string }
      console.warn(`[vpn-disconnect] ⚠️  Manager responded: ${err.error}`)
    }
  } catch (err) {
    // Non-fatal — manager might be temporarily down; session cleanup will happen on next heartbeat
    console.warn('[vpn-disconnect] ⚠️  Manager unreachable:', (err as Error).message)
  }

  // 2. Remove iptables/nftables rules for this client
  if (vpnIp) {
    await cleanFirewallRules(vpnIp)
  }

  // Always exit 0 — disconnect must not fail VPN tear-down
  process.exit(0)
}

async function cleanFirewallRules(sourceIp: string) {
  const { exec } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const execAsync = promisify(exec)

  const useNft = process.env['USE_NFTABLES'] === 'true'

  if (useNft) {
    // For nftables: flush all rules matching this source IP
    const cmd = `nft list ruleset | grep "ip saddr ${sourceIp}" | wc -l`
    const { stdout } = await execAsync(cmd).catch(() => ({ stdout: '0' }))
    const count = parseInt(stdout.trim(), 10)
    if (count > 0) {
      // Reload nftables with a script that excludes this IP (simple approach)
      console.log(`[firewall] nft: found ${count} rule(s) for ${sourceIp} — manual cleanup may be needed`)
    }
  } else {
    // For iptables: delete all FORWARD rules for this source IP
    const listCmd = `iptables -L FORWARD -n --line-numbers | grep "${sourceIp}" | awk '{print $1}' | sort -rn`
    const { stdout } = await execAsync(listCmd).catch(() => ({ stdout: '' }))
    const lineNumbers = stdout.trim().split('\n').filter(Boolean)

    for (const line of lineNumbers) {
      await execAsync(`iptables -D FORWARD ${line}`)
        .then(() => console.log(`[firewall] ✅ Removed FORWARD rule #${line} for ${sourceIp}`))
        .catch((e: Error) => console.warn(`[firewall] Failed to remove rule #${line}:`, e.message))
    }
  }
}

main()
