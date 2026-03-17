import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'

const execAsync = promisify(exec)

export async function handleRevokeUser(
  payload: Record<string, unknown>,
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

  // Reload OpenVPN to pick up the new CRL
  await execAsync('systemctl reload openvpn-server@server || systemctl reload openvpn@server || true')

  console.log(`[revoke-user] Certificate revoked for: ${username}`)
  return { username, stdout: stdout.trim() }
}
