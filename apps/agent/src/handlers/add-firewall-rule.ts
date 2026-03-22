import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import type { VpnDriver } from '../drivers'

const execAsync = promisify(exec)

export async function handleAddFirewallRule(
  payload: Record<string, unknown>,
  _driver: VpnDriver,
): Promise<Record<string, unknown>> {
  const sourceIp = payload['sourceIp'] as string
  const destNetwork = payload['destNetwork'] as string

  if (!sourceIp || !destNetwork) throw new Error('Missing sourceIp or destNetwork')

  const rule = `iptables -A FORWARD -s ${sourceIp} -d ${destNetwork} -j ACCEPT`
  await execAsync(rule)
  console.log(`[firewall] Added rule: ${rule}`)
  return { rule }
}

export async function handleRemoveFirewallRule(
  payload: Record<string, unknown>,
  _driver: VpnDriver,
): Promise<Record<string, unknown>> {
  const sourceIp = payload['sourceIp'] as string
  const destNetwork = payload['destNetwork'] as string

  if (!sourceIp || !destNetwork) throw new Error('Missing sourceIp or destNetwork')

  const rule = `iptables -D FORWARD -s ${sourceIp} -d ${destNetwork} -j ACCEPT`
  await execAsync(rule)
  console.log(`[firewall] Removed rule: ${rule}`)
  return { rule }
}
