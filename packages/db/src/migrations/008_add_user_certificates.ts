import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.text('client_cert').nullable().comment('Client certificate (PEM format)')
    table.text('client_key').nullable().comment('Client private key (PEM format, may be encrypted)')
    table.boolean('cert_password_protected').defaultTo(false).comment('Whether client key is password-protected')
    table.timestamp('cert_generated_at').nullable().comment('When certificate was generated')
    table.timestamp('cert_expires_at').nullable().comment('Certificate expiration date')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('client_cert')
    table.dropColumn('client_key')
    table.dropColumn('cert_password_protected')
    table.dropColumn('cert_generated_at')
    table.dropColumn('cert_expires_at')
  })
}
