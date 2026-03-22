import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import type { VpnDriver } from '../drivers'

const execAsync = promisify(exec)

export async function handleRevokeUser(
  payload: Record<string, unknown>,
  driver: VpnDriver,
): Promise<Record<string, unknown>> {
  const username = payload['username'] as string
  if (!username) throw new Error('Missing username in payload')

  const EASYRSA_DIR = '/etc/openvpn/easy-rsa'
  const EASYRSA_BIN = `${EASYRSA_DIR}/easyrsa`

  if (!existsSync(EASYRSA_BIN)) {
    throw new Error(`EasyRSA script not found at ${EASYRSA_BIN}`)
  }

  // Revoke certificate and regenerate CRL
  const { stdout } = await execAsync(
    `${EASYRSA_BIN} --batch revoke ${username} && ${EASYRSA_BIN} gen-crl`,
    { cwd: EASYRSA_DIR }
  )

  // Copy CRL to server directory
  await execAsync(`cp ${EASYRSA_DIR}/pki/crl.pem /etc/openvpn/server/crl.pem || true`)

  // Disconnect client if currently connected
  try {
    await driver.disconnectClient(username)
    console.log(`[revoke-user] Disconnected active client: ${username}`)
  } catch (err) {
    // Client might not be connected, that's ok
  }

  // Reload VPN via management interface to pick up the new CRL
  await driver.sendCommand('signal SIGHUP')

  console.log(`[revoke-user] Certificate revoked for: ${username}`)
  return { username, stdout: stdout.trim() }
}
