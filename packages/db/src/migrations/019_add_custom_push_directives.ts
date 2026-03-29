import type { Knex } from 'knex'

/**
 * Add custom_push_directives column to vpn_nodes.
 *
 * Stores raw OpenVPN push directives (one per line, without the outer push "..." wrapper).
 * These are appended in server.conf after the standard dns_servers block.
 *
 * Example value:
 *   dhcp-option DOMAIN corp.internal
 *   dhcp-option DOMAIN internal.example.com
 *   route 172.31.0.0 255.255.0.0
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('vpn_nodes', (table) => {
    table
      .text('custom_push_directives')
      .nullable()
      .defaultTo(null)
      .comment('Custom push directives (one per line, auto-wrapped in push "...")')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('vpn_nodes', (table) => {
    table.dropColumn('custom_push_directives')
  })
}
