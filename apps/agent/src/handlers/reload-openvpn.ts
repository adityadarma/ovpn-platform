import type { VpnDriver } from '../drivers'

export async function handleReloadOpenvpn(
  _payload: Record<string, unknown>,
  driver: VpnDriver,
): Promise<Record<string, unknown>> {
  // Send signal command via management interface
  await driver.sendCommand('signal SIGHUP')
  console.log('[reload-openvpn] OpenVPN reloaded via management interface')
  return { success: true, message: 'OpenVPN reloaded successfully' }
}
