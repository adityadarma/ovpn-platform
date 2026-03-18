#!/usr/bin/env node
/**
 * vpn-connect — Client connect hook
 *
 * Called by VPN: client-connect /path/to/this/script
 *
 * VPN sets these env vars automatically:
 *   $common_name   — username (because username-as-common-name is set)
 *   $ifconfig_pool_remote_ip — VPN IP assigned to the client
 *   $trusted_ip    — real public IP of the client
 *
 * This script POSTs to /api/v1/vpn/connect, receives push_routes back,
 * and writes them to the config file ($1) that VPN reads to push routes.
 *
 * VPN server config:
 *   client-connect /usr/local/bin/vpn-connect
 */

import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'

const envPath = process.env['VPN_ENV_PATH'] ?? path.resolve('/etc/vpn-agent/.env')
dotenv.config({ path: envPath })

const MANAGER_URL = process.env['AGENT_MANAGER_URL']
const VPN_TOKEN = process.env['VPN_TOKEN']
const NODE_ID = process.env['AGENT_NODE_ID']

if (!MANAGER_URL || !VPN_TOKEN || !NODE_ID) {
  console.error('[vpn-connect] AGENT_MANAGER_URL, VPN_TOKEN and AGENT_NODE_ID must be set')
  process.exit(1)
}

// The config file to write route-push directives to (provided by VPN as $1)
const configFile = process.argv[2] ?? process.env['config']

// VPN env vars
const username = process.env['common_name'] ?? ''
const vpnIp = process.env['ifconfig_pool_remote_ip'] ?? ''
const realIp = process.env['trusted_ip'] ?? ''
const clientVersion = process.env['IV_VER'] ?? '' // OpenVPN client version
const deviceName = process.env['IV_HWADDR'] ?? process.env['untrusted_ip'] ?? '' // Device identifier

async function main() {
  if (!username || !vpnIp) {
    console.error('[vpn-connect] Missing common_name or ifconfig_pool_remote_ip env vars')
    process.exit(1)
  }

  try {
    const res = await fetch(`${MANAGER_URL}/api/v1/vpn/connect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-VPN-Token': VPN_TOKEN!,
      },
      body: JSON.stringify({
        username,
        vpn_ip: vpnIp,
        node_id: NODE_ID,
        real_ip: realIp,
        common_name: username,
        client_version: clientVersion || undefined,
        device_name: deviceName || undefined,
      }),
    })

    if (!res.ok) {
      const err = await res.json() as { error: string }
      console.error(`[vpn-connect] ❌ Manager error: ${err.error}`)
      process.exit(1)
    }

    const data = await res.json() as {
      session_id: number
      push_routes: string[]
      static_ip: string | null
    }

    console.log(`[vpn-connect] ✅ Session ${data.session_id} opened for ${username} (${vpnIp})`)
    console.log(`[vpn-connect] Push routes: ${data.push_routes.join(', ') || 'none'}`)

    // Write "push route" directives to the config file VPN reads
    if (configFile && data.push_routes.length > 0) {
      const lines = data.push_routes.map((cidr) => {
        // Convert CIDR to "network mask" format for VPN
        const [ip, prefix] = cidr.split('/')
        const mask = prefixToMask(parseInt(prefix ?? '24'))
        return `push "route ${ip} ${mask}"`
      })
      fs.writeFileSync(configFile, lines.join('\n') + '\n', 'utf8')
      console.log(`[vpn-connect] Wrote ${lines.length} route(s) to ${configFile}`)
    }

    // Apply iptables FORWARD rules for the user's allowed networks
    for (const cidr of data.push_routes) {
      await applyFirewallRule(vpnIp, cidr)
    }

    process.exit(0)
  } catch (err) {
    console.error('[vpn-connect] ❌ Uncaught error:', (err as Error).message)
    process.exit(1)
  }
}

async function applyFirewallRule(sourceIp: string, destCidr: string) {
  const { exec } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const execAsync = promisify(exec)

  // Try nftables first, fall back to iptables
  const useNft = process.env['USE_NFTABLES'] === 'true'
  if (useNft) {
    const cmd = `nft add rule ip filter FORWARD ip saddr ${sourceIp} ip daddr ${destCidr} accept`
    await execAsync(cmd).catch((e: Error) => console.warn('[firewall] nft:', e.message))
  } else {
    const cmd = `iptables -A FORWARD -s ${sourceIp} -d ${destCidr} -j ACCEPT`
    await execAsync(cmd).catch((e: Error) => console.warn('[firewall] iptables:', e.message))
  }
  console.log(`[firewall] ✅ Allowed ${sourceIp} → ${destCidr}`)
}

function prefixToMask(prefix: number): string {
  const mask = (0xffffffff << (32 - prefix)) >>> 0
  return [
    (mask >>> 24) & 0xff,
    (mask >>> 16) & 0xff,
    (mask >>> 8) & 0xff,
    mask & 0xff,
  ].join('.')
}

main()
