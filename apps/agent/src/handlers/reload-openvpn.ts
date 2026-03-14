import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

export async function handleReloadOpenvpn(
  _payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { stdout } = await execAsync(
    'systemctl reload openvpn || systemctl reload openvpn@server',
  )
  console.log('[reload-openvpn] OpenVPN reloaded')
  return { stdout: stdout.trim() }
}
