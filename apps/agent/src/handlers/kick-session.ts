import type { VpnDriver } from '../drivers'

/**
 * kick_vpn_session handler
 *
 * Payload: { common_name: string }
 *
 * Calls the VPN driver to forcefully disconnect the client by its
 * certificate common name (username). For OpenVPN this sends
 * `kill <common_name>` to the management socket.
 */
export async function handleKickSession(
  payload: Record<string, unknown>,
  driver: VpnDriver,
): Promise<Record<string, unknown>> {
  const { common_name } = payload

  if (!common_name || typeof common_name !== 'string') {
    throw new Error('kick_vpn_session: common_name is required in payload')
  }

  if (!driver.isConnected()) {
    throw new Error('kick_vpn_session: VPN driver is not connected to management interface')
  }

  await driver.disconnectClient(common_name)

  console.log(`[kick-session] Forcibly disconnected VPN client: ${common_name}`)

  return { kicked: true, common_name }
}
