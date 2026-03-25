/**
 * VPN Driver Interface
 * 
 * Abstraction layer for VPN server communication.
 * Implementations should use the VPN's native management interface
 * (e.g., OpenVPN Management Interface, WireGuard API).
 * 
 * Drivers should extend EventEmitter to emit realtime events:
 * - 'client-connect': When a client connects
 * - 'client-disconnect': When a client disconnects
 * - 'client-reauth': When a client reauthenticates
 */

import type { EventEmitter } from 'node:events'

export interface VpnClient {
  commonName: string
  realAddress: string
  virtualAddress: string
  bytesReceived: number
  bytesSent: number
  connectedSince: Date
  lastActivity?: Date
}

export interface VpnServerInfo {
  version: string
  uptime: number
  mode: string
}

export interface VpnStatus {
  state: 'connected' | 'disconnected' | 'reconnecting'
  clients: VpnClient[]
  serverInfo: VpnServerInfo
}

export interface VpnMetrics {
  totalClients: number
  totalBytesReceived: number
  totalBytesSent: number
  uptime: number
}

export interface VpnDriver extends EventEmitter {
  /**
   * Connect to VPN management interface
   */
  connect(): Promise<void>

  /**
   * Disconnect from VPN management interface
   */
  disconnect(): Promise<void>

  /**
   * Check if connected to management interface
   */
  isConnected(): boolean

  /**
   * Get VPN server information
   */
  getServerInfo(): Promise<VpnServerInfo>

  /**
   * Get list of connected clients
   */
  getClients(): Promise<VpnClient[]>

  /**
   * Disconnect a specific client by common name
   */
  disconnectClient(commonName: string): Promise<void>

  /**
   * Get current VPN status (server + clients)
   */
  getStatus(): Promise<VpnStatus>

  /**
   * Get VPN metrics (aggregated stats)
   */
  getMetrics(): Promise<VpnMetrics>

  /**
   * Send raw command to VPN management interface
   */
  sendCommand(command: string): Promise<string>
}
