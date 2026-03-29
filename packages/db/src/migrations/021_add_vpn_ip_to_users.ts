import type { Knex } from 'knex'

/**
 * Add vpn_ip and vpn_group_id to users table.
 * - vpn_ip: auto-assigned from the group's subnet (e.g. "10.8.1.10")
 * - vpn_group_id: the group whose subnet this IP was assigned from
 *   (a user may belong to many groups but only one "primary" group for VPN IP)
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table
      .string('vpn_ip', 15)
      .nullable()
      .defaultTo(null)
      .comment('Auto-assigned VPN IP from the user\'s primary group subnet')

    table
      .string('vpn_group_id', 36)
      .nullable()
      .defaultTo(null)
      .comment('Primary group used for VPN IP assignment')

    table
      .foreign('vpn_group_id')
      .references('id')
      .inTable('groups')
      .onDelete('SET NULL')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.dropForeign(['vpn_group_id'])
    table.dropColumn('vpn_ip')
    table.dropColumn('vpn_group_id')
  })
}
