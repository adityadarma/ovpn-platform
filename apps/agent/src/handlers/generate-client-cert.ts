import { execSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'

interface GenerateClientCertParams {
  username: string
  password?: string // Optional password for encrypting private key
  validDays?: number // Certificate validity in days (default: 365)
}

interface GenerateClientCertResult {
  clientCert: string
  clientKey: string
  passwordProtected: boolean
  expiresAt: string
}

export async function handleGenerateClientCert(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const username = params.username as string | undefined
  const password = params.password as string | undefined
  const validDays = (params.validDays as number | undefined) ?? 3650 // Default 10 years

  if (!username || typeof username !== 'string') {
    throw new Error('Username is required')
  }

  const EASYRSA_DIR = '/etc/openvpn/easy-rsa'
  
  if (!existsSync(EASYRSA_DIR)) {
    throw new Error('EasyRSA directory not found. Please install OpenVPN server first.')
  }

  try {
    // Change to EasyRSA directory
    process.chdir(EASYRSA_DIR)

    // Check if client certificate already exists
    const certPath = `${EASYRSA_DIR}/pki/issued/${username}.crt`
    const keyPath = `${EASYRSA_DIR}/pki/private/${username}.key`
    
    // If certificate exists, revoke it first
    if (existsSync(certPath)) {
      console.log(`Certificate for ${username} already exists, revoking...`)
      try {
        execSync(`./easyrsa revoke ${username}`, {
          env: { ...process.env, EASYRSA_BATCH: '1' },
          stdio: 'pipe'
        })
      } catch (err) {
        // Ignore revoke errors (might not be in CRL yet)
        console.warn(`Warning: Could not revoke existing certificate: ${err}`)
      }
    }

    // Generate client certificate
    console.log(`Generating client certificate for ${username} (valid for ${validDays} days)...`)
    
    if (password) {
      // Generate with password-protected key
      execSync(`./easyrsa build-client-full ${username}`, {
        env: { 
          ...process.env, 
          EASYRSA_BATCH: '1',
          EASYRSA_PASSOUT: `pass:${password}`,
          EASYRSA_CERT_EXPIRE: validDays.toString()
        },
        stdio: 'pipe'
      })
    } else {
      // Generate without password (nopass)
      execSync(`./easyrsa build-client-full ${username} nopass`, {
        env: { 
          ...process.env, 
          EASYRSA_BATCH: '1',
          EASYRSA_CERT_EXPIRE: validDays.toString()
        },
        stdio: 'pipe'
      })
    }

    // Read generated certificate and key
    const clientCert = readFileSync(certPath, 'utf-8')
    const clientKey = readFileSync(keyPath, 'utf-8')

    // Calculate expiration date
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + validDays)

    console.log(`✓ Client certificate generated for ${username}`)

    return {
      clientCert,
      clientKey,
      passwordProtected: !!password,
      expiresAt: expiresAt.toISOString()
    }
  } catch (error: any) {
    console.error(`Failed to generate client certificate for ${username}:`, error.message)
    throw new Error(`Failed to generate client certificate: ${error.message}`)
  }
}
