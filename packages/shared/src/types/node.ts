export type NodeStatus = 'online' | 'offline' | 'unknown'

export interface VpnNode {
  id: string
  hostname: string
  ipAddress: string
  port: number
  region: string | null
  status: NodeStatus
  version: string | null
  lastSeen: string | null
  createdAt: string
  activeSessions?: number
}
