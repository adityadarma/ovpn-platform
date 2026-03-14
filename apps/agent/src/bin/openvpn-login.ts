#!/usr/bin/env node
/**
 * openvpn-login — VPN user authentication script
 *
 * Called by OpenVPN: auth-user-pass-verify /path/to/this/script via-file
 *
 * OpenVPN writes username/password to a temp file specified by $auth_user_pass_file.
 * We read that file, POST to /api/v1/vpn/auth, exit 0 = allow, exit 1 = deny.
 *
 * OpenVPN server config:
 *   auth-user-pass-verify /usr/local/bin/openvpn-login via-file
 *   script-security 2
 *   username-as-common-name
 */

import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'

// Load .env
const envPath = process.env['OVPN_ENV_PATH'] ?? path.resolve('/etc/openvpn-agent/.env')
dotenv.config({ path: envPath })

const MANAGER_URL = process.env['AGENT_MANAGER_URL']
const VPN_TOKEN = process.env['VPN_TOKEN']
const NODE_ID = process.env['AGENT_NODE_ID']

if (!MANAGER_URL || !VPN_TOKEN) {
  console.error('[openvpn-login] AGENT_MANAGER_URL and VPN_TOKEN must be set')
  process.exit(1)
}

// OpenVPN provides the credential file path as the first argument
const credFile = process.argv[2] ?? process.env['auth_user_pass_file']

if (!credFile) {
  console.error('[openvpn-login] No credential file provided (expected $1 or $auth_user_pass_file)')
  process.exit(1)
}

async function main() {
  let username: string
  let password: string

  try {
    const contents = fs.readFileSync(credFile!, 'utf8').trim().split('\n')
    username = contents[0]?.trim() ?? ''
    password = contents[1]?.trim() ?? ''
  } catch (err) {
    console.error('[openvpn-login] Failed to read credential file:', (err as Error).message)
    process.exit(1)
  }

  if (!username || !password) {
    console.error('[openvpn-login] Empty username or password')
    process.exit(1)
  }

  try {
    const res = await fetch(`${MANAGER_URL}/api/v1/vpn/auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-VPN-Token': VPN_TOKEN!,
      },
      body: JSON.stringify({ username, password, node_id: NODE_ID }),
    })

    if (res.ok) {
      const data = await res.json() as { username: string; role: string }
      console.log(`[openvpn-login] ✅ Auth OK: ${data.username} (${data.role})`)
      process.exit(0)
    } else {
      const err = await res.json() as { error: string }
      console.error(`[openvpn-login] ❌ Auth denied: ${err.error}`)
      process.exit(1)
    }
  } catch (err) {
    console.error('[openvpn-login] ❌ Manager unreachable:', (err as Error).message)
    process.exit(1)
  }
}

main()
