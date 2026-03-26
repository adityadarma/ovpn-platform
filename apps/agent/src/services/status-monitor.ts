import { readFileSync, existsSync } from 'node:fs'
import type { AgentEnv } from '../config/env'

/**
 * Status File Monitor Service
 * 
 * Monitors OpenVPN status file for client connect/disconnect events.
 * This is a fallback when management interface events are not available.
 */

interface StatusClient {
  commonName: string
  realAddress: string
  virtualAddress: string
  bytesReceived: number
  bytesSent: number
  connectedSince: Date
}

let previousClients = new Map<string, StatusClient>()
let isMonitoring = false

/**
 * Parse OpenVPN status file (version 3)
 */
function parseStatusFile(filePath: string): StatusClient[] {
  if (!existsSync(filePath)) {
    return []
  }

  try {
    const content = readFileSync(filePath, 'utf-8')
    const lines = content.split('\n')
    const clients: StatusClient[] = []

    for (const line of lines) {
      if (line.startsWith('CLIENT_LIST\t')) {
        const parts = line.split('\t')
        
        if (parts.length >= 8) {
          // CLIENT_LIST format (tab-separated):
          // 0: CLIENT_LIST
          // 1: Common Name
          // 2: Real Address
          // 3: Virtual Address
          // 4: Virtual IPv6 Address
          // 5: Bytes Received
          // 6: Bytes Sent
          // 7: Connected Since (epoch)
          // 8: Connected Since (human readable)

          clients.push({
            commonName: parts[1],
            realAddress: parts[2],
            virtualAddress: parts[3],
            bytesReceived: parseInt(parts[5], 10) || 0,
            bytesSent: parseInt(parts[6], 10) || 0,
            connectedSince: new Date(parseInt(parts[7], 10) * 1000),
          })
        }
      }
    }

    return clients
  } catch (err) {
    console.error('[status-monitor] Failed to parse status file:', (err as Error).message)
    return []
  }
}

/**
 * Handle client connect event
 */
async function handleConnect(env: AgentEnv, client: StatusClient): Promise<void> {
  console.log(`[status-monitor] Client connected: ${client.commonName} (${client.virtualAddress})`)
  
  try {
    const response = await fetch(`${env.AGENT_MANAGER_URL}/api/v1/vpn/connect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-VPN-Token': env.VPN_TOKEN,
      },
      body: JSON.stringify({
        username: client.commonName,
        vpn_ip: client.virtualAddress,
        real_ip: client.realAddress.split(':')[0], // Remove port
        node_id: env.AGENT_NODE_ID,
      }),
      signal: AbortSignal.timeout(5000),
    })
    
    if (!response.ok) {
      const text = await response.text()
      console.error(`[status-monitor] Connect API failed: ${response.status} ${text}`)
      return
    }
    
    const data = await response.json() as { session_id: string }
    console.log(`[status-monitor] ✓ Connect recorded: ${client.commonName} → session ${data.session_id}`)
  } catch (err) {
    console.error('[status-monitor] Connect API error:', (err as Error).message)
  }
}

/**
 * Handle client disconnect event
 */
async function handleDisconnect(env: AgentEnv, client: StatusClient): Promise<void> {
  console.log(`[status-monitor] Client disconnected: ${client.commonName}`)
  
  try {
    const response = await fetch(`${env.AGENT_MANAGER_URL}/api/v1/vpn/disconnect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-VPN-Token': env.VPN_TOKEN,
      },
      body: JSON.stringify({
        username: client.commonName,
        node_id: env.AGENT_NODE_ID,
        bytes_sent: client.bytesSent,
        bytes_received: client.bytesReceived,
        disconnect_reason: 'normal',
      }),
      signal: AbortSignal.timeout(5000),
    })
    
    if (!response.ok) {
      const text = await response.text()
      console.error(`[status-monitor] Disconnect API failed: ${response.status} ${text}`)
      return
    }
    
    console.log(`[status-monitor] ✓ Disconnect recorded: ${client.commonName}`)
  } catch (err) {
    console.error('[status-monitor] Disconnect API error:', (err as Error).message)
  }
}

/**
 * Check for client changes
 */
async function checkClientChanges(env: AgentEnv, statusFilePath: string): Promise<void> {
  console.log('[status-monitor] Checking for client changes...')
  
  const currentClients = parseStatusFile(statusFilePath)
  const currentMap = new Map<string, StatusClient>()
  
  console.log(`[status-monitor] Found ${currentClients.length} clients in status file`)
  
  // Build current clients map
  for (const client of currentClients) {
    currentMap.set(client.commonName, client)
    console.log(`[status-monitor]   - ${client.commonName} (${client.virtualAddress})`)
  }
  
  // Detect new connections
  for (const [commonName, client] of currentMap) {
    if (!previousClients.has(commonName)) {
      console.log(`[status-monitor] 🆕 New client detected: ${commonName}`)
      await handleConnect(env, client)
    }
  }
  
  // Detect disconnections
  for (const [commonName, client] of previousClients) {
    if (!currentMap.has(commonName)) {
      console.log(`[status-monitor] 👋 Client disconnected: ${commonName}`)
      await handleDisconnect(env, client)
    }
  }
  
  // Update previous clients
  previousClients = currentMap
}

/**
 * Start monitoring OpenVPN status file
 */
export function startStatusMonitor(env: AgentEnv, statusFilePath: string = '/var/log/openvpn/status.log'): void {
  if (isMonitoring) {
    console.warn('[status-monitor] Already monitoring')
    return
  }
  
  console.log('📊 Status file monitor started')
  console.log(`   Status file: ${statusFilePath}`)
  console.log(`   VPN Token: ${env.VPN_TOKEN.substring(0, 10)}...`)
  console.log(`   API URL: ${env.AGENT_MANAGER_URL}/api/v1/vpn/connect`)
  
  // Check if file exists
  if (!existsSync(statusFilePath)) {
    console.error(`[status-monitor] ✗ Status file not found: ${statusFilePath}`)
    console.error('[status-monitor] Make sure:')
    console.error('  1. OpenVPN is running')
    console.error('  2. Status file is configured in OpenVPN config')
    console.error('  3. Volume is mounted in Docker (if using Docker)')
    console.error('  4. Agent has read permission to the file')
    return
  }
  
  console.log(`[status-monitor] ✓ Status file found`)
  
  // Initial load
  const initialClients = parseStatusFile(statusFilePath)
  for (const client of initialClients) {
    previousClients.set(client.commonName, client)
  }
  console.log(`[status-monitor] Loaded ${initialClients.length} existing clients`)
  
  if (initialClients.length > 0) {
    console.log('[status-monitor] Current clients:')
    for (const client of initialClients) {
      console.log(`  - ${client.commonName} (${client.virtualAddress})`)
    }
    
    // Sync existing clients to database (in case agent restarted while clients connected)
    console.log('[status-monitor] Syncing existing clients to database...')
    for (const client of initialClients) {
      // Don't await - fire and forget
      void handleConnect(env, client).catch(err => {
        console.error(`[status-monitor] Failed to sync ${client.commonName}:`, err)
      })
    }
  }
  
  // Watch for file changes using interval polling (more reliable than watchFile in Docker)
  const intervalId = setInterval(() => {
    void checkClientChanges(env, statusFilePath)
  }, 2000)
  
  // Store interval ID for cleanup
  ;(global as any).__statusMonitorInterval = intervalId
  
  isMonitoring = true
  console.log('[status-monitor] ✓ Monitoring active (checking every 2s)')
}

/**
 * Stop monitoring
 */
export function stopStatusMonitor(): void {
  if ((global as any).__statusMonitorInterval) {
    clearInterval((global as any).__statusMonitorInterval)
    delete (global as any).__statusMonitorInterval
  }
  isMonitoring = false
  previousClients.clear()
}
