import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.string('static_vpn_ip', 15).nullable()
    table.timestamp('valid_from').nullable()
    table.timestamp('valid_to').nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('static_vpn_ip')
    table.dropColumn('valid_from')
    table.dropColumn('valid_to')
  })
}
