import type { AgentEnv } from '../config/env'
import type { VpnDriver } from '../drivers'

/**
 * Event Monitor Service
 * 
 * Listens to realtime VPN events (connect/disconnect) and reports to API server.
 * This replaces the old bash script hooks (client-connect/client-disconnect).
 */

interface ClientConnectEvent {
  clientId: string
  keyId: string
  timestamp: Date
}

interface ClientDisconnectEvent {
  clientId: string
  timestamp: Date
}

interface ClientReauthEvent {
  clientId: string
  keyId: string
  timestamp: Date
}

/**
 * Get client details from VPN driver by client ID
 */
async function getClientDetails(driver: VpnDriver, clientId: string) {
  try {
    const clients = await driver.getClients()
    
    // Try to find client by matching client ID in common name or other fields
    // Note: OpenVPN management interface doesn't directly expose CID in status
    // We'll need to use the status command to get more details
    
    const statusOutput = await driver.sendCommand('status 3')
    const lines = statusOutput.split('\n')
    
    for (const line of lines) {
      if (line.startsWith('CLIENT_LIST')) {
        const parts = line.split('\t')
        
        // CLIENT_LIST format includes Client ID at position 10
        if (parts.length >= 11 && parts[10] === clientId) {
          return {
            username: parts[1], // Common Name
            realIp: parts[2].split(':')[0], // Real Address (remove port)
            vpnIp: parts[3], // Virtual Address
            bytesSent: parseInt(parts[6], 10) || 0,
            bytesReceived: parseInt(parts[5], 10) || 0,
          }
        }
      }
    }
    
    return null
  } catch (err) {
    console.error('[event-monitor] Failed to get client details:', (err as Error).message)
    return null
  }
}

/**
 * Handle client connect event
 */
async function handleConnect(
  env: AgentEnv,
  event: ClientConnectEvent,
  driver: VpnDriver,
): Promise<void> {
  console.log(`[event-monitor] Processing connect event: CID=${event.clientId}`)
  
  // Wait a bit for client to fully establish connection
  await new Promise(resolve => setTimeout(resolve, 1000))
  
  const details = await getClientDetails(driver, event.clientId)
  
  if (!details) {
    console.warn(`[event-monitor] Could not get details for client ${event.clientId}`)
    return
  }
  
  try {
    const response = await fetch(`${env.AGENT_MANAGER_URL}/api/v1/vpn/connect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-VPN-Token': env.VPN_TOKEN,
      },
      body: JSON.stringify({
        username: details.username,
        vpn_ip: details.vpnIp,
        real_ip: details.realIp,
        node_id: env.AGENT_NODE_ID,
      }),
      signal: AbortSignal.timeout(5000),
    })
    
    if (!response.ok) {
      const text = await response.text()
      console.error(`[event-monitor] Connect API failed: ${response.status} ${text}`)
      return
    }
    
    const data = await response.json() as { session_id: string }
    console.log(`[event-monitor] ✓ Connect recorded: ${details.username} → session ${data.session_id}`)
  } catch (err) {
    console.error('[event-monitor] Connect API error:', (err as Error).message)
  }
}

/**
 * Handle client disconnect event
 */
async function handleDisconnect(
  env: AgentEnv,
  event: ClientDisconnectEvent,
  driver: VpnDriver,
): Promise<void> {
  console.log(`[event-monitor] Processing disconnect event: CID=${event.clientId}`)
  
  // Try to get client details before they're gone
  // Note: Client might already be disconnected, so we may not get details
  const details = await getClientDetails(driver, event.clientId)
  
  if (!details) {
    console.warn(`[event-monitor] Could not get details for disconnected client ${event.clientId}`)
    // We still need to try to close the session, but we don't have username
    // This is a limitation - we might need to maintain a local cache of CID -> username
    return
  }
  
  try {
    const response = await fetch(`${env.AGENT_MANAGER_URL}/api/v1/vpn/disconnect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-VPN-Token': env.VPN_TOKEN,
      },
      body: JSON.stringify({
        username: details.username,
        node_id: env.AGENT_NODE_ID,
        bytes_sent: details.bytesSent,
        bytes_received: details.bytesReceived,
        disconnect_reason: 'normal',
      }),
      signal: AbortSignal.timeout(5000),
    })
    
    if (!response.ok) {
      const text = await response.text()
      console.error(`[event-monitor] Disconnect API failed: ${response.status} ${text}`)
      return
    }
    
    console.log(`[event-monitor] ✓ Disconnect recorded: ${details.username}`)
  } catch (err) {
    console.error('[event-monitor] Disconnect API error:', (err as Error).message)
  }
}

/**
 * Handle client reauth event
 */
async function handleReauth(
  env: AgentEnv,
  event: ClientReauthEvent,
  driver: VpnDriver,
): Promise<void> {
  console.log(`[event-monitor] Client reauthentication: CID=${event.clientId}`)
  // Reauth doesn't need API call, just log it
}

/**
 * Start event monitoring for VPN driver
 */
export function startEventMonitor(env: AgentEnv, driver: VpnDriver): void {
  console.log('📡 Event monitor started (realtime VPN events)')
  console.log(`   VPN Token: ${env.VPN_TOKEN.substring(0, 10)}...`)
  console.log(`   API URL: ${env.AGENT_MANAGER_URL}/api/v1/vpn/connect`)
  
  // Listen to client connect events
  driver.on('client-connect', (event: ClientConnectEvent) => {
    console.log('[event-monitor] 🔔 Received client-connect event:', event)
    void handleConnect(env, event, driver)
  })
  
  // Listen to client disconnect events
  driver.on('client-disconnect', (event: ClientDisconnectEvent) => {
    console.log('[event-monitor] 🔔 Received client-disconnect event:', event)
    void handleDisconnect(env, event, driver)
  })
  
  // Listen to client reauth events
  driver.on('client-reauth', (event: ClientReauthEvent) => {
    console.log('[event-monitor] 🔔 Received client-reauth event:', event)
    void handleReauth(env, event, driver)
  })
  
  // Debug: Log when driver emits any event
  driver.on('connected', () => {
    console.log('[event-monitor] Driver connected')
  })
  
  driver.on('disconnected', () => {
    console.log('[event-monitor] Driver disconnected')
  })
}
