import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { VpnDriver } from '../drivers'

const EASY_RSA_PKI = '/etc/openvpn/easy-rsa/pki'
const OPENVPN_CA = `${EASY_RSA_PKI}/ca.crt`

export async function handleGenerateConfig(
  payload: Record<string, unknown>,
  _driver: VpnDriver,
): Promise<Record<string, unknown>> {
  const username = payload['username'] as string
  const serverIp = payload['serverIp'] as string
  const serverPort = (payload['serverPort'] as number) ?? 1194

  if (!username) throw new Error('Missing username in payload')
  if (!serverIp) throw new Error('Missing serverIp in payload')

  const [ca, cert, key] = await Promise.all([
    readFile(OPENVPN_CA, 'utf-8'),
    readFile(path.join(EASY_RSA_PKI, 'issued', `${username}.crt`), 'utf-8'),
    readFile(path.join(EASY_RSA_PKI, 'private', `${username}.key`), 'utf-8'),
  ])

  const config = `
client
dev tun
proto udp
remote ${serverIp} ${serverPort}
resolv-retry infinite
nobind
persist-key
persist-tun
remote-cert-tls server
cipher AES-256-GCM
verb 3

<ca>
${ca.trim()}
</ca>

<cert>
${cert.trim()}
</cert>

<key>
${key.trim()}
</key>
`.trim()

  return { config, filename: `${username}.ovpn` }
}
