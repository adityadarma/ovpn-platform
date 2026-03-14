'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Users, Server, Activity, Clock } from 'lucide-react'
import type { User, VpnNode, VpnSession, Task } from '@ovpn/shared'

interface Stats {
  users: number
  nodes: number
  activeSessions: number
  pendingTasks: number
}

export default function DashboardPage() {
  const { data: users = [] } = useQuery<User[]>({ queryKey: ['users'], queryFn: () => api.get('/api/v1/users') })
  const { data: nodes = [] } = useQuery<VpnNode[]>({ queryKey: ['nodes'], queryFn: () => api.get('/api/v1/nodes') })
  const { data: sessions = [] } = useQuery<VpnSession[]>({ queryKey: ['sessions'], queryFn: () => api.get('/api/v1/sessions') })
  const { data: tasks = [] } = useQuery<Task[]>({ queryKey: ['tasks'], queryFn: () => api.get('/api/v1/tasks?status=pending') })

  const stats: Stats = {
    users: users.length,
    nodes: nodes.length,
    activeSessions: sessions.length,
    pendingTasks: tasks.length,
  }

  const onlineNodes = nodes.filter((n) => n.status === 'online').length

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Overview of your VPN infrastructure</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard icon={Users} label="Total Users" value={stats.users} color="emerald" />
        <StatCard icon={Activity} label="Active Sessions" value={stats.activeSessions} color="blue" />
        <StatCard icon={Server} label="VPN Nodes" value={`${onlineNodes}/${stats.nodes}`} color="violet" subtitle={`${onlineNodes} online`} />
        <StatCard icon={Clock} label="Pending Tasks" value={stats.pendingTasks} color="amber" />
      </div>

      {/* Recent Nodes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">VPN Nodes</h2>
          {nodes.length === 0 ? (
            <p className="text-gray-400 text-sm">No nodes registered yet.</p>
          ) : (
            <div className="space-y-3">
              {nodes.slice(0, 5).map((node) => (
                <div key={node.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div>
                    <p className="font-medium text-sm text-gray-800">{node.hostname}</p>
                    <p className="text-xs text-gray-400">{node.ipAddress}</p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${node.status === 'online' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                    {node.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Active Sessions</h2>
          {sessions.length === 0 ? (
            <p className="text-gray-400 text-sm">No active sessions.</p>
          ) : (
            <div className="space-y-3">
              {sessions.slice(0, 5).map((s) => (
                <div key={s.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div>
                    <p className="font-medium text-sm text-gray-800">{s.vpnIp}</p>
                    <p className="text-xs text-gray-400">Connected {new Date(s.connectedAt).toLocaleTimeString()}</p>
                  </div>
                  <span className="text-xs bg-emerald-100 text-emerald-700 font-medium px-2 py-0.5 rounded-full">active</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({
  icon: Icon, label, value, color, subtitle,
}: {
  icon: typeof Users
  label: string
  value: number | string
  color: 'emerald' | 'blue' | 'violet' | 'amber'
  subtitle?: string
}) {
  const COLORS = {
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    violet: 'bg-violet-50 text-violet-600 border-violet-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
  }
  const ICON_COLORS = {
    emerald: 'bg-emerald-100 text-emerald-600',
    blue: 'bg-blue-100 text-blue-600',
    violet: 'bg-violet-100 text-violet-600',
    amber: 'bg-amber-100 text-amber-600',
  }

  return (
    <div className={`rounded-xl border p-6 ${COLORS[color]}`}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-medium opacity-70">{label}</p>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${ICON_COLORS[color]}`}>
          <Icon size={18} />
        </div>
      </div>
      <p className="text-3xl font-bold">{value}</p>
      {subtitle && <p className="text-xs opacity-60 mt-1">{subtitle}</p>}
    </div>
  )
}
