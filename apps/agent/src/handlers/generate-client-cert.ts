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
  const validDays = params.validDays as number | null | undefined

  if (!username || typeof username !== 'string') {
    throw new Error('Username is required')
  }

  // If validDays is null or 0, set to 36500 days (100 years ~ unlimited)
  const certValidDays = (validDays === null || validDays === 0) ? 36500 : (validDays ?? 3650)

  const EASYRSA_DIR = '/etc/openvpn/easy-rsa'
  const EASYRSA_BIN = `${EASYRSA_DIR}/easyrsa`
  
  if (!existsSync(EASYRSA_DIR)) {
    throw new Error('EasyRSA directory not found. Please install OpenVPN server first.')
  }

  if (!existsSync(EASYRSA_BIN)) {
    throw new Error(`EasyRSA script not found at ${EASYRSA_BIN}. Please check OpenVPN installation.`)
  }

  try {
    // Check if client certificate already exists
    const certPath = `${EASYRSA_DIR}/pki/issued/${username}.crt`
    const keyPath = `${EASYRSA_DIR}/pki/private/${username}.key`
    
    // If certificate exists, revoke it first
    if (existsSync(certPath)) {
      console.log(`Certificate for ${username} already exists, revoking...`)
      try {
        execSync(`${EASYRSA_BIN} revoke ${username}`, {
          cwd: EASYRSA_DIR,
          env: { ...process.env, EASYRSA_BATCH: '1' },
          stdio: 'pipe'
        })
      } catch (err) {
        // Ignore revoke errors (might not be in CRL yet)
        console.warn(`Warning: Could not revoke existing certificate: ${err}`)
      }
    }

    // Generate client certificate
    console.log(`Generating client certificate for ${username} (valid for ${certValidDays === 36500 ? 'unlimited' : certValidDays + ' days'})...`)
    
    if (password) {
      // Generate with password-protected key
      execSync(`${EASYRSA_BIN} build-client-full ${username}`, {
        cwd: EASYRSA_DIR,
        env: { 
          ...process.env, 
          EASYRSA_BATCH: '1',
          EASYRSA_PASSOUT: `pass:${password}`,
          EASYRSA_CERT_EXPIRE: certValidDays.toString()
        },
        stdio: 'pipe'
      })
    } else {
      // Generate without password (nopass)
      execSync(`${EASYRSA_BIN} build-client-full ${username} nopass`, {
        cwd: EASYRSA_DIR,
        env: { 
          ...process.env, 
          EASYRSA_BATCH: '1',
          EASYRSA_CERT_EXPIRE: certValidDays.toString()
        },
        stdio: 'pipe'
      })
    }

    // Read generated certificate and key
    const clientCert = readFileSync(certPath, 'utf-8')
    const clientKey = readFileSync(keyPath, 'utf-8')

    // Calculate expiration date (null if unlimited)
    const expiresAt = certValidDays === 36500 ? null : (() => {
      const date = new Date()
      date.setDate(date.getDate() + certValidDays)
      return date.toISOString()
    })()

    console.log(`✓ Client certificate generated for ${username}`)

    return {
      clientCert,
      clientKey,
      passwordProtected: !!password,
      expiresAt: expiresAt
    }
  } catch (error: any) {
    console.error(`Failed to generate client certificate for ${username}:`, error.message)
    throw new Error(`Failed to generate client certificate: ${error.message}`)
  }
}
