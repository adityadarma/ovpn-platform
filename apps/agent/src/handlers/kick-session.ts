import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import path from 'node:path'
import type { VpnDriver } from '../drivers'

/**
 * kick_vpn_session handler
 *
 * Payload: { common_name: string }
 *
 * Two-step approach to truly disconnect and block reconnect:
 *
 *  1. Write a CCD `disable` file for the user — OpenVPN reads this when a
 *     client handshakes and will reject reconnection attempts.
 *
 *  2. Send `kill <common_name>` via management interface to drop the
 *     current tunnel immediately.
 *
 * Without step 1, OpenVPN clients configured with --keepalive / --ping-restart
 * will automatically reconnect within seconds, making the kick appear to have
 * no effect.
 *
 * The CCD file must be removed manually (or via an "unkick" endpoint) if
 * the admin wants to allow the user to reconnect later.
 */

const CCD_DIR = process.env['OPENVPN_CCD_DIR'] ?? '/etc/openvpn/ccd'

export async function handleKickSession(
  payload: Record<string, unknown>,
  driver: VpnDriver,
): Promise<Record<string, unknown>> {
  const { common_name } = payload

  if (!common_name || typeof common_name !== 'string') {
    throw new Error('kick_vpn_session: common_name is required in payload')
  }

  // ── Step 1: Write CCD disable file ──────────────────────────────────────
  // This prevents the client from reconnecting after being killed.
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

    // Only write if not already disabled (avoid stomping custom CCD config)
    if (!existing.includes('disable')) {
      const content = existing ? `${existing.trimEnd()}\ndisable\n` : 'disable\n'
      writeFileSync(ccdFile, content, { encoding: 'utf-8' })
      console.log(`[kick-session] ✓ CCD disable written for: ${common_name} (${ccdFile})`)
    } else {
      console.log(`[kick-session] CCD disable already present for: ${common_name}`)
    }
  } catch (ccdErr) {
    // Non-fatal — log it and proceed with the kill anyway
    console.error(`[kick-session] Warning: Could not write CCD disable file: ${(ccdErr as Error).message}`)
    console.error('[kick-session] The client tunnel will be dropped but may reconnect automatically')
  }

  // ── Step 2: Kill the active tunnel ───────────────────────────────────────
  if (!driver.isConnected()) {
    // Management interface not available — fall back to `pkill` on openvpn processes
    // filtered by client common name. This is a best-effort fallback.
    console.warn('[kick-session] VPN driver not connected — attempting pkill fallback')
    try {
      execSync(`kill $(cat /run/openvpn/*/client-${common_name}.pid 2>/dev/null) 2>/dev/null || true`, { shell: '/bin/sh' })
    } catch {
      // Ignore — CCD disable will block reconnect anyway
    }
  } else {
    await driver.disconnectClient(common_name)
    console.log(`[kick-session] ✓ Management kill sent for: ${common_name}`)
  }

  return { kicked: true, common_name, ccd_disabled: true }
}

