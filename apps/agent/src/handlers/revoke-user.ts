import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

export async function handleRevokeUser(
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const username = payload['username'] as string
  if (!username) throw new Error('Missing username in payload')

  const { stdout } = await execAsync(
    `cd /etc/openvpn/easy-rsa && ./easyrsa --batch revoke ${username} && ./easyrsa gen-crl`,
  )

  // Reload OpenVPN to pick up the new CRL
  await execAsync('systemctl reload openvpn || systemctl reload openvpn@server')

  console.log(`[revoke-user] Certificate revoked for: ${username}`)
  return { username, stdout: stdout.trim() }
}
