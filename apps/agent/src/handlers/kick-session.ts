import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { execSync, execFileSync } from 'node:child_process'
import path from 'node:path'
import net from 'node:net'
import type { VpnDriver } from '../drivers'

/**
 * kick_vpn_session handler
 *
 * Payload: { common_name: string }
 *
 * Three-step approach:
 *  1. Write CCD `disable` file → blocks reconnect attempts at TLS handshake.
 *  2. Send `kill <cn>` to management socket via raw TCP/Unix socket write
 *     (bypasses the driver's async command queue which can misbehave under
 *     concurrent realtime events like >CLIENT:DISCONNECT).
 *  3. Fall back to driver.disconnectClient() if raw write fails.
 *
 * CCD note: the /etc/openvpn/ccd directory MUST be:
 *  - Listed in server.conf as `client-config-dir /etc/openvpn/ccd`
 *  - Mounted into the agent container in docker-compose.agent.yml
 */

const CCD_DIR = process.env['OPENVPN_CCD_DIR'] ?? '/etc/openvpn/ccd'
const MGMT_SOCKET = process.env['OPENVPN_SOCKET_PATH'] ?? '/run/openvpn/server.sock'

// ── Raw management socket kill ────────────────────────────────────────────────
// Sends `kill <cn>` directly over the Unix socket without going through the
// driver's shared command queue. This is more reliable when the queue is busy
// or when concurrent realtime events (>CLIENT:DISCONNECT) are interleaved.
function killViaRawSocket(commonName: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket()
    let response = ''

    const timeout = setTimeout(() => {
      socket.destroy()
      reject(new Error('Raw socket kill timed out after 8s'))
    }, 8000)

    socket.connect(MGMT_SOCKET, () => {
      socket.write(`kill ${commonName}\n`)
    })

    socket.on('data', (chunk) => {
      response += chunk.toString()
      // OpenVPN responds with SUCCESS: or ERROR: on the same line
      if (response.includes('SUCCESS:') || response.includes('ERROR:')) {
        clearTimeout(timeout)
        socket.destroy()
        if (response.includes('ERROR:')) {
          reject(new Error(`Management kill error: ${response.trim()}`))
        } else {
          resolve(response.trim())
        }
      }
    })

    socket.on('error', (err) => {
      clearTimeout(timeout)
      reject(new Error(`Raw socket error: ${err.message}`))
    })

    socket.on('close', () => {
      clearTimeout(timeout)
      if (!response.includes('SUCCESS:') && !response.includes('ERROR:')) {
        // Socket closed before we got a response — treat as unknown
        resolve(response.trim() || 'socket closed without response')
      }
    })
  })
}

export async function handleKickSession(
  payload: Record<string, unknown>,
  driver: VpnDriver,
): Promise<Record<string, unknown>> {
  const { common_name } = payload

  if (!common_name || typeof common_name !== 'string') {
    throw new Error('kick_vpn_session: common_name is required in payload')
  }

  const result: Record<string, unknown> = {
    kicked: false,
    common_name,
    ccd_disabled: false,
    kill_method: null,
    kill_response: null,
  }

  // ── Step 1: Write CCD disable file ──────────────────────────────────────
  // Prevents the client reconnecting after the kill. Requires:
  //   - server.conf: client-config-dir /etc/openvpn/ccd
  //   - docker-compose: /etc/openvpn/ccd:/etc/openvpn/ccd
  try {
    if (!existsSync(CCD_DIR)) {
      mkdirSync(CCD_DIR, { recursive: true })
      console.log(`[kick-session] Created CCD directory: ${CCD_DIR}`)
    }

    const ccdFile = path.join(CCD_DIR, common_name)
    let existing = ''

    try {
      existing = readFileSync(ccdFile, 'utf-8')
    } catch {
      // File doesn't exist yet — that's fine
    }

    if (!existing.includes('disable')) {
      const content = existing ? `${existing.trimEnd()}\ndisable\n` : 'disable\n'
      writeFileSync(ccdFile, content, { encoding: 'utf-8' })
      console.log(`[kick-session] ✓ CCD disable written: ${ccdFile}`)
    } else {
      console.log(`[kick-session] CCD disable already present for: ${common_name}`)
    }
    result.ccd_disabled = true
  } catch (ccdErr) {
    console.error(`[kick-session] ✗ CCD write failed: ${(ccdErr as Error).message}`)
    console.error('[kick-session] Client may reconnect after kill — check mount and server.conf')
  }

  // ── Step 2: Kill tunnel via raw management socket ────────────────────────
  // Preferred: bypasses driver's async queue entirely.
  try {
    console.log(`[kick-session] Sending raw kill to management socket: ${MGMT_SOCKET}`)
    const response = await killViaRawSocket(common_name)
    console.log(`[kick-session] ✓ Raw socket kill response: ${response}`)
    result.kicked = true
    result.kill_method = 'raw_socket'
    result.kill_response = response
    return result
  } catch (rawErr) {
    console.warn(`[kick-session] Raw socket kill failed: ${(rawErr as Error).message}`)
    console.warn('[kick-session] Falling back to driver.disconnectClient()...')
  }

  // ── Step 3: Fallback — use driver's sendCommand ──────────────────────────
  if (driver.isConnected()) {
    try {
      await driver.disconnectClient(common_name)
      console.log(`[kick-session] ✓ Driver kill succeeded for: ${common_name}`)
      result.kicked = true
      result.kill_method = 'driver'
      return result
    } catch (driverErr) {
      console.error(`[kick-session] Driver kill failed: ${(driverErr as Error).message}`)
    }
  }

  // ── Step 4: Last resort — socat shell command ────────────────────────────
  try {
    console.warn('[kick-session] Trying socat shell fallback...')
    const socat = execFileSync('which', ['socat'], { encoding: 'utf-8' }).trim()
    if (socat) {
      const output = execSync(
        `printf 'kill ${common_name}\\r\\n' | socat - UNIX-CONNECT:${MGMT_SOCKET}`,
        { encoding: 'utf-8', timeout: 5000 },
      )
      console.log(`[kick-session] ✓ socat kill output: ${output.trim()}`)
      result.kicked = true
      result.kill_method = 'socat'
      result.kill_response = output.trim()
      return result
    }
  } catch (socatErr) {
    console.error(`[kick-session] socat fallback failed: ${(socatErr as Error).message}`)
  }

  // If we reach here, CCD disable is written (blocking reconnect) but kill
  // of the current tunnel failed. Log clearly for debugging.
  console.error(`[kick-session] ✗ All kill methods failed for: ${common_name}`)
  console.error(`[kick-session]   Management socket path: ${MGMT_SOCKET}`)
  console.error(`[kick-session]   Driver connected: ${driver.isConnected()}`)
  console.error('[kick-session]   Check agent logs and socket permissions')

  // Return partial success — CCD is written, reconnect is blocked
  result.kicked = false
  return result
}
