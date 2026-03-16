export type TaskStatus = 'pending' | 'running' | 'done' | 'failed'

export type TaskAction =
  | 'create_vpn_user'
  | 'revoke_vpn_user'
  | 'reload_openvpn'
  | 'generate_client_config'
  | 'generate_client_cert'
  | 'add_firewall_rule'
  | 'remove_firewall_rule'
  | 'apply_network_policy'

export interface Task {
  id: string
  nodeId: string
  action: TaskAction
  payload: Record<string, unknown>
  status: TaskStatus
  result: Record<string, unknown> | null
  errorMessage: string | null
  createdAt: string
  completedAt: string | null
}

export type CreateTaskInput = {
  nodeId: string
  action: TaskAction
  payload: Record<string, unknown>
}
