import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('vpn_nodes', (table) => {
    // Protocol settings
    table.string('protocol', 10).defaultTo('udp').comment('OpenVPN protocol (udp/tcp)')
    table.string('tunnel_mode', 10).defaultTo('full').comment('Tunnel mode (full/split)')
    
    // Network settings
    table.string('vpn_network', 18).defaultTo('10.8.0.0').comment('VPN network address')
    table.string('vpn_netmask', 15).defaultTo('255.255.255.0').comment('VPN network mask')
    table.string('dns_servers', 500).defaultTo('8.8.8.8,1.1.1.1').comment('DNS servers (comma-separated)')
    table.text('push_routes').nullable().comment('Custom routes for split tunnel (comma-separated)')
    
    // Security settings
    table.string('cipher', 50).defaultTo('AES-256-GCM').comment('Encryption cipher')
    table.string('auth_digest', 20).defaultTo('SHA256').comment('Auth digest algorithm')
    table.string('compression', 20).defaultTo('lz4-v2').comment('Compression algorithm')
    
    // Connection settings
    table.integer('keepalive_ping').defaultTo(10).comment('Keepalive ping interval (seconds)')
    table.integer('keepalive_timeout').defaultTo(120).comment('Keepalive timeout (seconds)')
    table.integer('max_clients').defaultTo(100).comment('Maximum concurrent clients')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('vpn_nodes', (table) => {
    table.dropColumn('protocol')
    table.dropColumn('tunnel_mode')
    table.dropColumn('vpn_network')
    table.dropColumn('vpn_netmask')
    table.dropColumn('dns_servers')
    table.dropColumn('push_routes')
    table.dropColumn('cipher')
    table.dropColumn('auth_digest')
    table.dropColumn('compression')
    table.dropColumn('keepalive_ping')
    table.dropColumn('keepalive_timeout')
    table.dropColumn('max_clients')
  })
}
