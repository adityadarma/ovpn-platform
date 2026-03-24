import type { Knex } from 'knex'

/**
 * Migrate existing certificates from users table to user_node_certificates table
 * This is a data migration to support per-node certificates
 */
export async function up(knex: Knex): Promise<void> {
  // Get all users with certificates
  const usersWithCerts = await knex('users')
    .whereNotNull('client_cert')
    .whereNotNull('client_key')
    .select('id', 'client_cert', 'client_key', 'cert_password_protected', 'cert_generated_at', 'cert_expires_at')
  
  if (usersWithCerts.length === 0) {
    console.log('No existing certificates to migrate')
    return
  }
  
  // Get first online node (or any node if none online)
  const node = await knex('vpn_nodes')
    .where('status', 'online')
    .orWhere('status', 'offline')
    .first()
  
  if (!node) {
    console.log('No nodes found, skipping certificate migration')
    return
  }
  
  console.log(`Migrating ${usersWithCerts.length} certificates to node ${node.id}`)
  
  // Migrate each certificate
  for (const user of usersWithCerts) {
    await knex('user_node_certificates').insert({
      user_id: user.id,
      node_id: node.id,
      client_cert: user.client_cert,
      client_key: user.client_key,
      password_protected: user.cert_password_protected || false,
      generated_at: user.cert_generated_at,
      expires_at: user.cert_expires_at,
      is_revoked: false,
      created_at: new Date(),
      updated_at: new Date()
    })
  }
  
  console.log('Certificate migration completed')
}

export async function down(knex: Knex): Promise<void> {
  // No need to migrate back - old columns will be removed in next migration
  console.log('Rollback: Certificates remain in user_node_certificates table')
}
