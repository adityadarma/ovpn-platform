import net from 'node:net'
import { EventEmitter } from 'node:events'
import type {
  VpnDriver,
  VpnClient,
  VpnServerInfo,
  VpnStatus,
  VpnMetrics,
} from './vpn-driver.interface'

/**
 * OpenVPN Management Interface Driver
 * 
 * Communicates with OpenVPN via TCP management interface (default: 127.0.0.1:7505)
 * 
 * Protocol Reference:
 * - https://openvpn.net/community-resources/management-interface/
 */
export class OpenVpnManagementDriver extends EventEmitter implements VpnDriver {
  private socket: net.Socket | null = null
  private connected = false
  private buffer = ''
  private pendingCommands: Map<string, { resolve: (value: string) => void; reject: (error: Error) => void }> = new Map()
  private commandQueue: Array<{ command: string; resolve: (value: string) => void; reject: (error: Error) => void }> = []
  private isProcessing = false

  constructor(
    private host: string = '127.0.0.1',
    private port: number = 7505,
    private password?: string,
    private reconnectInterval: number = 5000,
  ) {
    super()
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return
    }

    return new Promise((resolve, reject) => {
      this.socket = new net.Socket()

      this.socket.on('connect', async () => {
        console.log(`[openvpn-driver] Connected to ${this.host}:${this.port}`)
        
        // Authenticate if password is provided
        if (this.password) {
          try {
            await this.sendCommand(`password ${this.password}`)
          } catch (err) {
            console.error('[openvpn-driver] Authentication failed:', err)
            this.socket?.destroy()
            reject(err)
            return
          }
        }

        this.connected = true
        this.emit('connected')
        resolve()
      })

      this.socket.on('data', (data) => {
        this.handleData(data.toString())
      })

      this.socket.on('error', (err) => {
        console.error('[openvpn-driver] Socket error:', err.message)
        this.connected = false
        this.emit('error', err)
        
        if (!this.connected) {
          reject(err)
        }
      })

      this.socket.on('close', () => {
        console.log('[openvpn-driver] Connection closed')
        this.connected = false
        this.emit('disconnected')
        
        // Auto-reconnect
        setTimeout(() => {
          if (!this.connected) {
            console.log('[openvpn-driver] Attempting to reconnect...')
            this.connect().catch((err) => {
              console.error('[openvpn-driver] Reconnect failed:', err.message)
            })
          }
        }, this.reconnectInterval)
      })

      this.socket.connect(this.port, this.host)
    })
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      this.socket.destroy()
      this.socket = null
      this.connected = false
    }
  }

  isConnected(): boolean {
    return this.connected
  }

  private handleData(data: string): void {
    this.buffer += data

    // Process complete lines
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() || ''

    for (const line of lines) {
      this.processLine(line.trim())
    }
  }

  private processLine(line: string): void {
    // Skip empty lines and prompts
    if (!line || line === '>' || line.startsWith('>INFO:')) {
      return
    }

    // Process command responses
    if (this.commandQueue.length > 0) {
      const current = this.commandQueue[0]
      
      // Check for command completion markers
      if (line === 'END' || line.startsWith('SUCCESS:') || line.startsWith('ERROR:')) {
        this.commandQueue.shift()
        
        if (line.startsWith('ERROR:')) {
          current.reject(new Error(line.substring(6)))
        } else {
          current.resolve(line)
        }
        
        this.isProcessing = false
        this.processNextCommand()
      }
    }
  }

  private processNextCommand(): void {
    if (this.isProcessing || this.commandQueue.length === 0) {
      return
    }

    this.isProcessing = true
    const { command } = this.commandQueue[0]
    
    if (this.socket && this.connected) {
      this.socket.write(command + '\n')
    }
  }

  async sendCommand(command: string): Promise<string> {
    if (!this.connected || !this.socket) {
      throw new Error('Not connected to OpenVPN management interface')
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Command timeout: ${command}`))
      }, 10000)

      this.commandQueue.push({
        command,
        resolve: (value) => {
          clearTimeout(timeout)
          resolve(value)
        },
        reject: (error) => {
          clearTimeout(timeout)
          reject(error)
        },
      })

      if (!this.isProcessing) {
        this.processNextCommand()
      }
    })
  }

  async getServerInfo(): Promise<VpnServerInfo> {
    const versionOutput = await this.sendCommand('version')
    const stateOutput = await this.sendCommand('state')

    // Parse version
    const versionMatch = versionOutput.match(/OpenVPN Version: (.+)/)
    const version = versionMatch ? versionMatch[1] : 'unknown'

    // Parse uptime from state
    const uptimeMatch = stateOutput.match(/(\d+),/)
    const uptime = uptimeMatch ? parseInt(uptimeMatch[1], 10) : 0

    return {
      version,
      uptime,
      mode: 'server',
    }
  }

  async getClients(): Promise<VpnClient[]> {
    const statusOutput = await this.sendCommand('status 3')
    return this.parseStatus(statusOutput)
  }

  private parseStatus(statusOutput: string): VpnClient[] {
    const clients: VpnClient[] = []
    const lines = statusOutput.split('\n')

    let inClientSection = false

    for (const line of lines) {
      if (line.startsWith('CLIENT_LIST')) {
        inClientSection = true
        const parts = line.split('\t')
        
        if (parts.length >= 8) {
          // CLIENT_LIST format:
          // 0: CLIENT_LIST
          // 1: Common Name
          // 2: Real Address
          // 3: Virtual Address
          // 4: Virtual IPv6 Address
          // 5: Bytes Received
          // 6: Bytes Sent
          // 7: Connected Since (epoch)
          // 8: Connected Since (human readable)
          // 9: Username
          // 10: Client ID
          // 11: Peer ID

          clients.push({
            commonName: parts[1],
            realAddress: parts[2],
            virtualAddress: parts[3],
            bytesReceived: parseInt(parts[5], 10) || 0,
            bytesSent: parseInt(parts[6], 10) || 0,
            connectedSince: new Date(parseInt(parts[7], 10) * 1000),
          })
        }
      } else if (line.startsWith('ROUTING_TABLE') || line.startsWith('GLOBAL_STATS')) {
        inClientSection = false
      }
    }

    return clients
  }

  async disconnectClient(commonName: string): Promise<void> {
    try {
      await this.sendCommand(`kill ${commonName}`)
      console.log(`[openvpn-driver] Disconnected client: ${commonName}`)
    } catch (err) {
      throw new Error(`Failed to disconnect client ${commonName}: ${(err as Error).message}`)
    }
  }

  async getStatus(): Promise<VpnStatus> {
    const [serverInfo, clients] = await Promise.all([
      this.getServerInfo(),
      this.getClients(),
    ])

    return {
      state: this.connected ? 'connected' : 'disconnected',
      clients,
      serverInfo,
    }
  }

  async getMetrics(): Promise<VpnMetrics> {
    const clients = await this.getClients()
    const serverInfo = await this.getServerInfo()

    const totalBytesReceived = clients.reduce((sum, client) => sum + client.bytesReceived, 0)
    const totalBytesSent = clients.reduce((sum, client) => sum + client.bytesSent, 0)

    return {
      totalClients: clients.length,
      totalBytesReceived,
      totalBytesSent,
      uptime: serverInfo.uptime,
    }
  }
}
