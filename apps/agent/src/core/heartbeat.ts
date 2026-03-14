import type { AgentEnv } from '../config/env'

export function startHeartbeat(env: AgentEnv): void {
  console.log(`💓 Heartbeat started (interval: ${env.AGENT_HEARTBEAT_INTERVAL_MS}ms)`)

  const beat = async () => {
    try {
      const res = await fetch(`${env.AGENT_MANAGER_URL}/api/v1/nodes/heartbeat`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.AGENT_SECRET_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ nodeId: env.AGENT_NODE_ID }),
      })

      if (!res.ok) {
        console.warn(`[heartbeat] HTTP ${res.status}`)
      }
    } catch (err) {
      console.error('[heartbeat] Error:', (err as Error).message)
    }
  }

  // Send immediately on start
  void beat()
  setInterval(() => void beat(), env.AGENT_HEARTBEAT_INTERVAL_MS)
}
