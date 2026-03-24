import type { Knex } from 'knex'

/**
 * Update default cipher from AES-256-GCM to AES-128-GCM to match server config
 * This fixes TLS handshake errors caused by cipher mismatch
 */
export async function up(knex: Knex): Promise<void> {
  // Update existing nodes that have AES-256-GCM to AES-128-GCM
  await knex('vpn_nodes')
    .where('cipher', 'AES-256-GCM')
    .update({ cipher: 'AES-128-GCM' })
  
  // Update default value for future nodes
  await knex.schema.alterTable('vpn_nodes', (table) => {
    table.string('cipher', 50).defaultTo('AES-128-GCM').alter()
  })
}

export async function down(knex: Knex): Promise<void> {
  // Revert to AES-256-GCM
  await knex('vpn_nodes')
    .where('cipher', 'AES-128-GCM')
    .update({ cipher: 'AES-256-GCM' })
  
  await knex.schema.alterTable('vpn_nodes', (table) => {
    table.string('cipher', 50).defaultTo('AES-256-GCM').alter()
  })
}
