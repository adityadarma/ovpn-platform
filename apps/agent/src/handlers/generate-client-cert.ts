import { execSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import type { VpnDriver } from '../drivers'

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

export async function handleGenerateClientCert(params: Record<string, unknown>, _driver: VpnDriver): Promise<Record<string, unknown>> {
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
    throw new Error('EasyRSA directory not found. Please install VPN server first.')
  }

  if (!existsSync(EASYRSA_BIN)) {
    throw new Error(`EasyRSA script not found at ${EASYRSA_BIN}. Please check VPN installation.`)
  }

  try {
    // Check if client certificate already exists
    const certPath = `${EASYRSA_DIR}/pki/issued/${username}.crt`
    const keyPath = `${EASYRSA_DIR}/pki/private/${username}.key`
    const reqPath = `${EASYRSA_DIR}/pki/reqs/${username}.req`
    
    // If any certificate files exist, clean them up completely
    const filesExist = existsSync(certPath) || existsSync(keyPath) || existsSync(reqPath)
    
    if (filesExist) {
      console.log(`Certificate files for ${username} already exist, cleaning up...`)
      
      // Try to revoke if certificate exists
      if (existsSync(certPath)) {
        try {
          execSync(`${EASYRSA_BIN} revoke ${username}`, {
            cwd: EASYRSA_DIR,
            env: { ...process.env, EASYRSA_BATCH: '1' },
            stdio: 'pipe'
          })
          console.log(`✓ Certificate revoked in PKI`)
          
          // Generate updated CRL after revocation
          try {
            execSync(`${EASYRSA_BIN} gen-crl`, {
              cwd: EASYRSA_DIR,
              env: { ...process.env, EASYRSA_BATCH: '1' },
              stdio: 'pipe'
            })
            console.log(`✓ CRL updated`)
          } catch (crlErr) {
            console.warn(`Warning: Could not update CRL: ${crlErr}`)
          }
        } catch (err) {
          console.warn(`Warning: Could not revoke certificate (might not be in CRL yet)`)
        }
      }
      
      // Force remove all certificate-related files
      try {
        execSync(`rm -f "${certPath}" "${keyPath}" "${reqPath}"`, {
          stdio: 'pipe'
        })
        console.log(`✓ Old certificate files removed`)
      } catch (err) {
        console.warn(`Warning: Could not remove old certificate files: ${err}`)
      }
      
      // Also remove from index if exists
      const indexPath = `${EASYRSA_DIR}/pki/index.txt`
      if (existsSync(indexPath)) {
        try {
          // Remove lines containing this username from index
          execSync(`sed -i.bak '/CN=${username}$/d' "${indexPath}"`, {
            stdio: 'pipe'
          })
          console.log(`✓ Removed from PKI index`)
        } catch (err) {
          console.warn(`Warning: Could not update PKI index: ${err}`)
        }
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
          EASYRSA_CERT_EXPIRE: certValidDays.toString(),
          EASYRSA_PASSOUT: `pass:${password}`
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
    
    // Provide more detailed error message
    let errorMsg = error.message
    if (error.stderr) {
      errorMsg += `\nStderr: ${error.stderr.toString()}`
    }
    if (error.stdout) {
      errorMsg += `\nStdout: ${error.stdout.toString()}`
    }
    
    throw new Error(`Failed to generate client certificate: ${errorMsg}`)
  }
}
