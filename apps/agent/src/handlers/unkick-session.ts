import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import type { VpnDriver } from '../drivers'

/**
 * unkick_vpn_session handler
 *
 * Payload: { common_name: string }
 *
 * Removes the CCD `disable` file written by a permanent kick, restoring
 * the user's ability to reconnect to the VPN.
 */

const CCD_DIR = process.env['OPENVPN_CCD_DIR'] ?? '/etc/openvpn/ccd'

export async function handleUnkickSession(
  payload: Record<string, unknown>,
  _driver: VpnDriver,
): Promise<Record<string, unknown>> {
  const { common_name } = payload

  if (!common_name || typeof common_name !== 'string') {
    throw new Error('unkick_vpn_session: common_name is required in payload')
  }

  const ccdFile = path.join(CCD_DIR, common_name)

  if (!existsSync(ccdFile)) {
    console.log(`[unkick-session] No CCD file found for ${common_name} — nothing to remove`)
    return { unkicked: true, common_name, note: 'no_ccd_file' }
  }

  try {
    const content = readFileSync(ccdFile, 'utf-8')

    if (content.trim() === 'disable') {
      // File only contains disable — remove it entirely
      unlinkSync(ccdFile)
      console.log(`[unkick-session] ✓ Removed CCD disable file: ${ccdFile}`)
      return { unkicked: true, common_name, ccd_file_removed: true }
    } else if (content.includes('disable')) {
      // File has other rules — only strip the disable line
      const cleaned = content
        .split('\n')
        .filter(l => l.trim() !== 'disable')
        .join('\n')
        .trimEnd() + '\n'
      writeFileSync(ccdFile, cleaned, 'utf-8')
      console.log(`[unkick-session] ✓ Removed disable line from: ${ccdFile}`)
      return { unkicked: true, common_name, ccd_file_updated: true }
    } else {
      console.log(`[unkick-session] CCD file exists but has no disable line: ${ccdFile}`)
      return { unkicked: true, common_name, note: 'no_disable_line' }
    }
  } catch (err) {
    throw new Error(`unkick_vpn_session: Failed to update CCD file: ${(err as Error).message}`)
  }
}
