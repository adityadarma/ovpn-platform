import type { AgentEnv } from '../config/env'
import type { VpnDriver } from '../drivers'
import { executeTask } from './executor'

export function startPoller(env: AgentEnv, driver: VpnDriver): void {
  console.log(`🔄 Task poller started (interval: ${env.AGENT_POLL_INTERVAL_MS}ms)`)

  const poll = async () => {
    try {
      const res = await fetch(`${env.AGENT_MANAGER_URL}/api/v1/nodes/${env.AGENT_NODE_ID}/tasks`, {
        headers: {
          Authorization: `Bearer ${env.AGENT_SECRET_TOKEN}`,
          'Content-Type': 'application/json',
        },
      })

      if (!res.ok) {
        console.error(`[poller] HTTP ${res.status}: ${await res.text()}`)
        return
      }

      const data = (await res.json()) as { tasks: Array<{ id: string; action: string; payload: Record<string, unknown> }> }

      for (const task of data.tasks) {
        console.log(`[poller] Executing task: ${task.action} (${task.id})`)
        await executeTask(env, task, driver)
      }
    } catch (err) {
      console.error('[poller] Error:', (err as Error).message)
    }
  }

  // Run immediately then on interval
  void poll()
  setInterval(() => void poll(), env.AGENT_POLL_INTERVAL_MS)
}
