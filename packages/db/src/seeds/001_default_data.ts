import type { Knex } from 'knex'
import bcrypt from 'bcryptjs'

export async function seed(knex: Knex): Promise<void> {
  console.log('🌱 Running database seeder...')

  // Check if admin user already exists
  const existingAdmin = await knex('users')
    .where({ username: 'admin' })
    .first()

  if (existingAdmin) {
    console.log('ℹ️  Admin user already exists, skipping user creation')
  } else {
    // Create default admin user
    const passwordHash = await bcrypt.hash('Admin@1234!', 12)
    await knex('users').insert({
      username: 'admin',
      email: 'admin@ovpn.local',
      password_hash: passwordHash,
      role: 'admin',
      is_active: true,
    })
    console.log('✅ Admin user created (username: admin, password: Admin@1234!)')
    console.log('⚠️  Change the admin password immediately after first login!')
  }

  // Default settings - insert only if not exists
  const defaultSettings = [
    { key: 'platform_name', value: 'OVPN VPN Manager', description: 'Platform display name' },
    { key: 'vpn_network', value: '10.8.0.0/24', description: 'Default VPN network CIDR' },
    { key: 'vpn_dns', value: '1.1.1.1,8.8.8.8', description: 'VPN DNS servers' },
    { key: 'max_sessions_per_user', value: '3', description: 'Max concurrent sessions per user' },
  ]

  for (const setting of defaultSettings) {
    const exists = await knex('settings')
      .where({ key: setting.key })
      .first()

    if (!exists) {
      await knex('settings').insert(setting)
      console.log(`✅ Setting created: ${setting.key}`)
    } else {
      console.log(`ℹ️  Setting already exists: ${setting.key}, skipping`)
    }
  }

  console.log('✅ Seed complete')
}
