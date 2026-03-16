import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  // Certificate download history
  await knex.schema.createTable('cert_download_history', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid())
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.uuid('node_id').notNullable().references('id').inTable('vpn_nodes').onDelete('CASCADE')
    table.string('ip_address', 45).nullable().comment('IP address of downloader')
    table.string('user_agent', 500).nullable().comment('Browser user agent')
    table.timestamp('downloaded_at').notNullable().defaultTo(knex.fn.now())
    
    table.index(['user_id', 'downloaded_at'])
  })

  // Certificate revocation list
  await knex.schema.createTable('cert_revocations', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid())
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.uuid('node_id').notNullable().references('id').inTable('vpn_nodes').onDelete('CASCADE')
    table.text('revoked_cert').notNullable().comment('Revoked certificate (PEM format)')
    table.string('serial_number', 100).nullable().comment('Certificate serial number')
    table.string('reason', 100).nullable().comment('Revocation reason')
    table.uuid('revoked_by').nullable().references('id').inTable('users').comment('Admin who revoked')
    table.timestamp('revoked_at').notNullable().defaultTo(knex.fn.now())
    
    table.index(['user_id', 'revoked_at'])
    table.index(['node_id', 'revoked_at'])
  })

  // Add auto-renewal settings to users
  await knex.schema.alterTable('users', (table) => {
    table.boolean('cert_auto_renew').defaultTo(false).comment('Enable auto-renewal before expiry')
    table.integer('cert_renew_days_before').defaultTo(30).comment('Renew certificate X days before expiry')
    table.timestamp('cert_last_renewed_at').nullable().comment('Last renewal timestamp')
    table.integer('cert_renewal_count').defaultTo(0).comment('Number of times certificate was renewed')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('cert_download_history')
  await knex.schema.dropTableIfExists('cert_revocations')
  
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('cert_auto_renew')
    table.dropColumn('cert_renew_days_before')
    table.dropColumn('cert_last_renewed_at')
    table.dropColumn('cert_renewal_count')
  })
}
