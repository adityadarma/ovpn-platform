import type { Knex } from 'knex'

interface RenewalResult {
  userId: string
  username: string
  success: boolean
  error?: string
}

export async function checkAndRenewCertificates(db: Knex): Promise<RenewalResult[]> {
  const results: RenewalResult[] = []

  try {
    // Find users with auto-renewal enabled and certificates expiring soon
    const usersToRenew = await db('users')
      .where('cert_auto_renew', true)
      .whereNotNull('cert_expires_at')
      .whereRaw('cert_expires_at <= DATE_ADD(NOW(), INTERVAL cert_renew_days_before DAY)')
      .where('cert_expires_at', '>', new Date())
      .select('id', 'username', 'cert_expires_at', 'cert_renew_days_before', 'cert_password_protected')

    console.log(`[cert-renewal] Found ${usersToRenew.length} users needing certificate renewal`)

    for (const user of usersToRenew) {
      try {
        // Find the node where user's certificate was generated
        // We'll use the most recent download history to determine the node
        const lastDownload = await db('cert_download_history')
          .where('user_id', user.id)
          .orderBy('downloaded_at', 'desc')
          .first()

        let nodeId = lastDownload?.node_id

        // If no download history, find any online node
        if (!nodeId) {
          const onlineNode = await db('vpn_nodes')
            .where('status', 'online')
            .first()
          
          if (!onlineNode) {
            results.push({
              userId: user.id,
              username: user.username,
              success: false,
              error: 'No online nodes available'
            })
            continue
          }
          
          nodeId = onlineNode.id
        }

        // Revoke old certificate
        const oldCert = await db('users')
          .where('id', user.id)
          .select('client_cert')
          .first()

        if (oldCert?.client_cert) {
          await db('cert_revocations').insert({
            id: crypto.randomUUID(),
            user_id: user.id,
            node_id: nodeId,
            revoked_cert: oldCert.client_cert,
            reason: 'Auto-renewal',
            revoked_by: null, // System renewal
            revoked_at: new Date()
          })
        }

        // Create renewal task
        const taskId = crypto.randomUUID()
        await db('tasks').insert({
          id: taskId,
          node_id: nodeId,
          action: 'generate_client_cert',
          payload: JSON.stringify({
            username: user.username,
            password: undefined, // Don't change password on renewal
            validDays: 3650 // Default 10 years
          }),
          status: 'pending',
          created_at: new Date(),
        })

        // Wait for task completion (with timeout)
        const maxWait = 30000
        const startTime = Date.now()
        let renewed = false

        while (Date.now() - startTime < maxWait) {
          const task = await db('tasks').where({ id: taskId }).first()
          
          if (task.status === 'success') {
            const result = JSON.parse(task.result || '{}')
            
            await db('users').where({ id: user.id }).update({
              client_cert: result.clientCert,
              client_key: result.clientKey,
              cert_generated_at: new Date(),
              cert_expires_at: new Date(result.expiresAt),
              cert_last_renewed_at: new Date(),
              cert_renewal_count: db.raw('cert_renewal_count + 1')
            })

            renewed = true
            results.push({
              userId: user.id,
              username: user.username,
              success: true
            })
            
            console.log(`[cert-renewal] Successfully renewed certificate for ${user.username}`)
            break
          }
          
          if (task.status === 'failed') {
            results.push({
              userId: user.id,
              username: user.username,
              success: false,
              error: task.error_message || 'Task failed'
            })
            break
          }
          
          await new Promise(resolve => setTimeout(resolve, 1000))
        }

        if (!renewed && !results.find(r => r.userId === user.id)) {
          results.push({
            userId: user.id,
            username: user.username,
            success: false,
            error: 'Renewal timeout'
          })
        }
      } catch (error: any) {
        results.push({
          userId: user.id,
          username: user.username,
          success: false,
          error: error.message
        })
        console.error(`[cert-renewal] Failed to renew certificate for ${user.username}:`, error)
      }
    }
  } catch (error) {
    console.error('[cert-renewal] Error checking certificates:', error)
  }

  return results
}

// Run renewal check every hour
export function startCertRenewalScheduler(db: Knex) {
  console.log('[cert-renewal] Starting certificate renewal scheduler')
  
  // Run immediately on start
  checkAndRenewCertificates(db).catch(console.error)
  
  // Then run every hour
  setInterval(() => {
    checkAndRenewCertificates(db).catch(console.error)
  }, 60 * 60 * 1000) // 1 hour
}
