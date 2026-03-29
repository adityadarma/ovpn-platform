import type { Knex } from 'knex'

/**
 * Add vpn_subnet to groups table.
 * Each group can have its own VPN IP pool (e.g. "10.8.1.0/24").
 * Users in the group are auto-assigned an IP from this pool.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('groups', (table) => {
    table
      .string('vpn_subnet', 18)
      .nullable()
      .defaultTo(null)
      .comment('VPN subnet for this group, e.g. 10.8.1.0/24. Null = no dedicated subnet.')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('groups', (table) => {
    table.dropColumn('vpn_subnet')
  })
}
