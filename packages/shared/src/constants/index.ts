export const APP_VERSION = '1.0.0'

export const DEFAULT_PORT = {
  API: 3001,
  WEB: 3000,
  AGENT: 3002,
} as const

export const AGENT = {
  POLL_INTERVAL_MS: 5_000,
  HEARTBEAT_INTERVAL_MS: 30_000,
  NODE_OFFLINE_THRESHOLD_MS: 60_000,
} as const

export const JWT = {
  ALGORITHM: 'HS256' as const,
  DEFAULT_EXPIRES_IN: '7d',
} as const

export const VPN = {
  DEFAULT_NETWORK: '10.8.0.0',
  DEFAULT_SUBNET: '255.255.255.0',
  DEFAULT_PORT: 1194,
  DEFAULT_PROTOCOL: 'udp' as const,
} as const

export const TASK_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  DONE: 'done',
  FAILED: 'failed',
} as const
