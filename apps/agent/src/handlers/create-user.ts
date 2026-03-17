import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'

const execAsync = promisify(exec)

export async function handleCreateUser(
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const username = payload['username'] as string
  if (!username) throw new Error('Missing username in payload')

  const EASYRSA_DIR = '/etc/openvpn/easy-rsa'
  const EASYRSA_BIN = `${EASYRSA_DIR}/easyrsa`

  if (!existsSync(EASYRSA_BIN)) {
    throw new Error(`EasyRSA script not found at ${EASYRSA_BIN}`)
  }

  // Run easy-rsa to generate client certificate
  const { stdout } = await execAsync(
    `${EASYRSA_BIN} --batch build-client-full ${username} nopass`,
    { cwd: EASYRSA_DIR }
  )

  console.log(`[create-user] Certificate generated for: ${username}`)
  return { username, stdout: stdout.trim() }
}
