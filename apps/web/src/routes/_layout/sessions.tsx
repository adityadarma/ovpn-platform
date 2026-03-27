import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/_layout/sessions')({
  component: SessionsPage,
})

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Activity, ArrowUp, ArrowDown, History, ChevronLeft, ChevronRight, Monitor, MapPin, UserX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface Session {
  id: string
  user_id: string
  username: string
  email?: string
  node_id: string
  node_hostname: string
  node_region?: string
  vpn_ip: string
  real_ip?: string
  client_version?: string
  device_name?: string
  geo_country?: string
  geo_city?: string
  bytes_sent: number
  bytes_received: number
  connected_at: string
  disconnected_at?: string | null
  last_activity_at?: string
  disconnect_reason?: string
  connection_duration_seconds?: number
  duration_seconds?: number
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDuration(since: string, until?: string | null, durationSeconds?: number) {
  // If we have pre-calculated duration, use it
  if (durationSeconds !== undefined && durationSeconds !== null) {
    const m = Math.floor(durationSeconds / 60)
    const h = Math.floor(m / 60)
    const d = Math.floor(h / 24)
    if (d > 0) return `${d}d ${h % 24}h`
    if (h > 0) return `${h}h ${m % 60}m`
    if (m === 0) return '< 1m'
    return `${m}m`
  }
  
  // Otherwise calculate from timestamps
  const start = new Date(since).getTime()
  const end = until ? new Date(until).getTime() : Date.now()
  const ms = end - start
  const m = Math.floor(ms / 60000)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  if (d > 0) return `${d}d ${h % 24}h`
  if (h > 0) return `${h}h ${m % 60}m`
  if (m === 0) return '< 1m'
  return `${m}m`
}

function formatDateTime(date: string) {
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function SessionsPage() {
  const [page, setPage] = useState(1)
  const limit = 20
  const queryClient = useQueryClient()

  const { data: sessions = [], isLoading } = useQuery<Session[]>({
    queryKey: ['sessions'],
    queryFn: () => api.get('/api/v1/sessions'),
    refetchInterval: 15_000,
  })

  const { data: historyData, isLoading: isLoadingHistory } = useQuery<{ sessions: Session[]; pagination: any }>({
    queryKey: ['sessions', 'history', page],
    queryFn: () => api.get(`/api/v1/sessions/history?page=${page}&limit=${limit}`),
  })

  const kickMutation = useMutation({
    mutationFn: (sessionId: string) => api.post(`/api/v1/sessions/${sessionId}/kick`, {}),
    onSuccess: () => {
      toast.success('Session kicked successfully')
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
    },
    onError: (e: Error) => {
      toast.error(e.message || 'Failed to kick session')
    },
  })

  const history = historyData?.sessions || []
  const pagination = historyData?.pagination

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">VPN Sessions</h1>
        <p className="text-sm text-gray-500 mt-1">Monitor active connections and view history</p>
      </div>

      <Tabs defaultValue="active" className="space-y-4">
        <TabsList>
          <TabsTrigger value="active" className="gap-2">
            <Activity className="h-4 w-4" />
            Active ({sessions.length})
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History className="h-4 w-4" />
            History
          </TabsTrigger>
        </TabsList>

        {/* Active Sessions Tab */}
        <TabsContent value="active" className="space-y-4">
          <div className="flex items-center justify-end">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-500 text-xs font-medium rounded-full">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
              Auto-refresh 15s
            </span>
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-gray-400">Loading sessions...</div>
          ) : sessions.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-gray-200 p-16 text-center">
              <Activity className="h-10 w-10 text-gray-200 mx-auto mb-3" />
              <p className="font-medium text-gray-700">No active sessions</p>
              <p className="text-sm text-gray-400 mt-1">Sessions will appear here when users connect</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Device</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Location</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Node</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">VPN IP</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Duration</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Traffic</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sessions.map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-4">
                        <div>
                          <div className="font-medium text-gray-900">{s.username}</div>
                          {s.real_ip && (
                            <div className="text-xs text-gray-400 font-mono">{s.real_ip}</div>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-start gap-2">
                          <Monitor className="h-4 w-4 text-gray-400 mt-0.5" />
                          <div>
                            <div className="text-gray-700 text-xs">{s.device_name || 'Unknown'}</div>
                            {s.client_version && (
                              <div className="text-xs text-gray-400">{s.client_version}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        {s.geo_city || s.geo_country ? (
                          <div className="flex items-center gap-1.5 text-gray-600">
                            <MapPin className="h-3.5 w-3.5 text-gray-400" />
                            <span className="text-xs">
                              {s.geo_city && s.geo_country ? `${s.geo_city}, ${s.geo_country}` : s.geo_country || s.geo_city}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <div>
                          <div className="text-gray-700">{s.node_hostname}</div>
                          {s.node_region && (
                            <div className="text-xs text-gray-400">{s.node_region}</div>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4 font-mono text-gray-600 text-xs">{s.vpn_ip}</td>
                      <td className="px-5 py-4 text-gray-500" >
                        {formatDuration(s.connected_at, null, s.duration_seconds)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="flex items-center gap-1 text-blue-500">
                            <ArrowUp className="h-3 w-3" /> {formatBytes(s.bytes_sent)}
                          </span>
                          <span className="text-gray-300">/</span>
                          <span className="flex items-center gap-1 text-emerald-500">
                            <ArrowDown className="h-3 w-3" /> {formatBytes(s.bytes_received)}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                            Connected
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (confirm(`Disconnect ${s.username}?`)) {
                                kickMutation.mutate(s.id)
                              }
                            }}
                            disabled={kickMutation.isPending}
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <UserX className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-4">
          {isLoadingHistory ? (
            <div className="text-center py-12 text-gray-400">Loading history...</div>
          ) : history.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-gray-200 p-16 text-center">
              <History className="h-10 w-10 text-gray-200 mx-auto mb-3" />
              <p className="font-medium text-gray-700">No session history</p>
              <p className="text-sm text-gray-400 mt-1">Past connections will appear here</p>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Device</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Node</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">VPN IP</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Connected</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Duration</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Traffic</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {history.map((s) => (
                      <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-4">
                          <div>
                            <div className="font-medium text-gray-900">{s.username}</div>
                            {s.real_ip && (
                              <div className="text-xs text-gray-400 font-mono">{s.real_ip}</div>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-start gap-2">
                            <Monitor className="h-4 w-4 text-gray-400 mt-0.5" />
                            <div>
                              <div className="text-gray-700 text-xs">{s.device_name || 'Unknown'}</div>
                              {s.client_version && (
                                <div className="text-xs text-gray-400">{s.client_version}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-gray-500">{s.node_hostname}</td>
                        <td className="px-5 py-4 font-mono text-gray-600 text-xs">{s.vpn_ip}</td>
                        <td className="px-5 py-4 text-gray-500 text-xs" >
                          {formatDateTime(s.connected_at)}
                        </td>
                        <td className="px-5 py-4 text-gray-500" >
                          {formatDuration(s.connected_at, s.disconnected_at, s.connection_duration_seconds)}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="flex items-center gap-1 text-blue-500">
                              <ArrowUp className="h-3 w-3" /> {formatBytes(s.bytes_sent)}
                            </span>
                            <span className="text-gray-300">/</span>
                            <span className="flex items-center gap-1 text-emerald-500">
                              <ArrowDown className="h-3 w-3" /> {formatBytes(s.bytes_received)}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-right">
                          {s.disconnect_reason ? (
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                              s.disconnect_reason === 'normal' ? 'bg-gray-100 text-gray-600' :
                              s.disconnect_reason === 'admin_kick' ? 'bg-red-100 text-red-700' :
                              s.disconnect_reason === 'timeout' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {s.disconnect_reason === 'admin_kick' ? 'Kicked' :
                               s.disconnect_reason === 'timeout' ? 'Timeout' :
                               s.disconnect_reason === 'reconnect' ? 'Reconnected' :
                               'Disconnected'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                              {s.disconnected_at ? 'Disconnected' : 'Active'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  {pagination ? (
                    <>Page {pagination.page} of {pagination.pages} • {pagination.total} total sessions</>
                  ) : (
                    <>Page {page} • Showing {history.length} sessions</>
                  )}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => p + 1)}
                    disabled={pagination ? page >= pagination.pages : history.length < limit}
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
