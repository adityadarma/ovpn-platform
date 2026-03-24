import type { Knex } from 'knex'

/**
 * Remove old certificate columns from users table
 * Certificates are now stored in user_node_certificates table
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('client_cert')
    table.dropColumn('client_key')
    table.dropColumn('cert_password_protected')
    table.dropColumn('cert_generated_at')
    table.dropColumn('cert_expires_at')
    table.dropColumn('cert_last_renewed_at')
    table.dropColumn('cert_renewal_count')
    table.dropColumn('cert_auto_renew')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.text('client_cert').nullable()
    table.text('client_key').nullable()
    table.boolean('cert_password_protected').defaultTo(false)
    table.timestamp('cert_generated_at').nullable()
    table.timestamp('cert_expires_at').nullable()
    table.timestamp('cert_last_renewed_at').nullable()
    table.integer('cert_renewal_count').defaultTo(0)
    table.boolean('cert_auto_renew').defaultTo(false)
  })
}
