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
  const protocol = (payload['protocol'] as string) ?? 'udp'
  const cipher = (payload['cipher'] as string) ?? 'AES-256-GCM'
  const authDigest = (payload['authDigest'] as string) ?? 'SHA256'
  const compression = (payload['compression'] as string) ?? 'lz4-v2'

  if (!username) throw new Error('Missing username in payload')
  if (!serverIp) throw new Error('Missing serverIp in payload')

  // Read TLS key
  const tlsKeyPath = '/etc/openvpn/server/ta.key'
  let tlsKey = ''
  try {
    tlsKey = await readFile(tlsKeyPath, 'utf-8')
  } catch (err) {
    console.warn('TLS key not found, config will not include tls-crypt')
  }

  const [ca, cert, key] = await Promise.all([
    readFile(OPENVPN_CA, 'utf-8'),
    readFile(path.join(EASY_RSA_PKI, 'issued', `${username}.crt`), 'utf-8'),
    readFile(path.join(EASY_RSA_PKI, 'private', `${username}.key`), 'utf-8'),
  ])

  // Use tcp-client for TCP protocol
  const protoClient = protocol === 'tcp' ? 'tcp-client' : protocol

  const config = `client
dev tun
proto ${protoClient}
remote ${serverIp} ${serverPort}
resolv-retry infinite
nobind
persist-key
persist-tun
remote-cert-tls server
cipher ${cipher}
data-ciphers ${cipher}:AES-256-GCM:AES-128-GCM:AES-256-CBC
auth ${authDigest}
tls-version-min 1.2
tls-client
${compression !== 'none' ? `compress ${compression}` : ''}
ignore-unknown-option block-outside-dns data-ciphers
setenv opt block-outside-dns
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
${tlsKey ? `
<tls-crypt>
${tlsKey.trim()}
</tls-crypt>` : ''}
`.trim()

  return { config, filename: `${username}.ovpn` }
}
