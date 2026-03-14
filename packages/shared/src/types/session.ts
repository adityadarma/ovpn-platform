export interface VpnSession {
  id: string
  userId: string
  nodeId: string
  vpnIp: string
  bytesSent: number
  bytesReceived: number
  connectedAt: string
  disconnectedAt: string | null
}
