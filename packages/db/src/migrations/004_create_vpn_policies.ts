import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('vpn_policies', (table) => {
    table.string('id', 36).primary().notNullable()
    table.string('user_id', 36).nullable()
    table.string('group_id', 36).nullable()
    
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE')
    table.foreign('group_id').references('id').inTable('groups').onDelete('CASCADE')
    table.string('allowed_network', 50).notNullable()
    table.enu('action', ['allow', 'deny']).notNullable().defaultTo('allow')
    table.integer('priority').notNullable().defaultTo(100)
    table.text('description').nullable()
    table.timestamps(true, true)
    
    // Check constraint: either user_id or group_id must be set, but not both
    table.check('(user_id IS NOT NULL AND group_id IS NULL) OR (user_id IS NULL AND group_id IS NOT NULL)', [], 'chk_policy_target')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('vpn_policies')
}
