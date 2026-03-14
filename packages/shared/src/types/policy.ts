export type PolicyAction = 'allow' | 'deny'

export interface VpnPolicy {
  id: string
  userId: string
  allowedNetwork: string
  action: PolicyAction
  priority: number
  description: string | null
  createdAt: string
}
