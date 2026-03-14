'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Activity } from 'lucide-react'

interface Session {
  id: string
  username: string
  node_hostname: string
  vpn_ip: string
  bytes_sent: number
  bytes_received: number
  connected_at: string
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDuration(since: string) {
  const ms = Date.now() - new Date(since).getTime()
  const m = Math.floor(ms / 60000)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}h ${m % 60}m`
  return `${m}m`
}

export default function SessionsPage() {
  const { data: sessions = [], isLoading } = useQuery<Session[]>({
    queryKey: ['sessions'],
    queryFn: () => api.get('/api/v1/sessions'),
    refetchInterval: 15_000,
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Active Sessions</h1>
          <p className="text-gray-500 mt-0.5 text-sm">{sessions.length} connected</p>
        </div>
        <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1.5 rounded-lg">Auto-refresh 15s</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : sessions.length === 0 ? (
          <div className="p-12 text-center">
            <Activity size={40} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No active sessions</p>
            <p className="text-gray-400 text-sm mt-1">Sessions will appear here when users connect to VPN</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Node</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">VPN IP</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Duration</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Traffic</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sessions.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{s.username}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{s.node_hostname}</td>
                  <td className="px-6 py-4 text-sm font-mono text-gray-600">{s.vpn_ip}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{formatDuration(s.connected_at)}</td>
                  <td className="px-6 py-4 text-xs text-gray-500">
                    ↑ {formatBytes(s.bytes_sent)} / ↓ {formatBytes(s.bytes_received)}
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Connected
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
