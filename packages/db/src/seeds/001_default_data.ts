import type { Knex } from 'knex'
import bcrypt from 'bcryptjs'

export async function seed(knex: Knex): Promise<void> {
  // Clear existing data
  await knex('audit_logs').delete()
  await knex('tasks').delete()
  await knex('certificates').delete()
  await knex('vpn_policies').delete()
  await knex('vpn_sessions').delete()
  await knex('vpn_nodes').delete()
  await knex('users').delete()

  // Create default admin user
  const passwordHash = await bcrypt.hash('Admin@1234!', 12)
  await knex('users').insert({
    username: 'admin',
    email: 'admin@ovpn.local',
    password_hash: passwordHash,
    role: 'admin',
    is_active: true,
  })

  // Default settings
  await knex('settings').insert([
    { key: 'platform_name', value: 'OVPN VPN Manager', description: 'Platform display name' },
    { key: 'vpn_network', value: '10.8.0.0/24', description: 'Default VPN network CIDR' },
    { key: 'vpn_dns', value: '1.1.1.1,8.8.8.8', description: 'VPN DNS servers' },
    { key: 'max_sessions_per_user', value: '3', description: 'Max concurrent sessions per user' },
  ])

  console.log('✅ Seed complete — admin user created (admin / Admin@1234!)')
  console.log('⚠️  Change the admin password immediately after first login!')
}
