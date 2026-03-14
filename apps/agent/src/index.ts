import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

// Load .env from monorepo root (walk up from apps/agent/src/)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })

import { loadAgentEnv } from './config/env'
import { startPoller } from './core/poller'
import { startHeartbeat } from './core/heartbeat'

async function main() {
  const env = loadAgentEnv()

  console.log(`🚀 OVPN Agent starting...`)
  console.log(`   Manager:  ${env.AGENT_MANAGER_URL}`)
  console.log(`   Node ID:  ${env.AGENT_NODE_ID}`)
  console.log(`   Poll:     every ${env.AGENT_POLL_INTERVAL_MS}ms`)
  console.log(`   Heartbeat: every ${env.AGENT_HEARTBEAT_INTERVAL_MS}ms`)

  startHeartbeat(env)
  startPoller(env)

  process.on('SIGINT', () => {
    console.log('\n🛑 OVPN Agent shutting down...')
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    console.log('\n🛑 OVPN Agent shutting down...')
    process.exit(0)
  })
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
