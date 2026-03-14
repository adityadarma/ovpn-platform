import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

export async function handleCreateUser(
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const username = payload['username'] as string
  if (!username) throw new Error('Missing username in payload')

  // Run easy-rsa to generate client certificate
  // Assumes easy-rsa is installed at /etc/openvpn/easy-rsa
  const { stdout } = await execAsync(
    `cd /etc/openvpn/easy-rsa && ./easyrsa --batch build-client-full ${username} nopass`,
  )

  console.log(`[create-user] Certificate generated for: ${username}`)
  return { username, stdout: stdout.trim() }
}
