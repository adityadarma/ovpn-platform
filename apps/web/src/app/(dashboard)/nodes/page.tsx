'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Server, MapPin, Clock, Wifi, WifiOff } from 'lucide-react'
import type { VpnNode } from '@ovpn/shared'

export default function NodesPage() {
  const { data: nodes = [], isLoading } = useQuery<VpnNode[]>({
    queryKey: ['nodes'],
    queryFn: () => api.get('/api/v1/nodes'),
    refetchInterval: 30_000, // auto-refresh every 30s
  })

  const onlineCount = nodes.filter((n) => n.status === 'online').length

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">VPN Nodes</h1>
          <p className="text-gray-500 mt-0.5 text-sm">
            {onlineCount}/{nodes.length} nodes online
          </p>
        </div>
        <div className="text-xs text-gray-400 bg-gray-100 px-3 py-1.5 rounded-lg">
          Auto-refresh 30s
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Loading nodes...</div>
      ) : nodes.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Server size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No nodes registered</p>
          <p className="text-gray-400 text-sm mt-1">
            Install the OVPN agent on a VPN server to register it here.
          </p>
          <div className="mt-4 bg-gray-50 rounded-lg p-4 text-left max-w-md mx-auto">
            <p className="text-xs font-mono text-gray-600 mb-1"># On your VPN server:</p>
            <p className="text-xs font-mono text-gray-800">
              AGENT_MANAGER_URL=http://your-manager:3001 \<br />
              AGENT_NODE_ID=&lt;from-registration&gt; \<br />
              AGENT_SECRET_TOKEN=&lt;your-token&gt; \<br />
              node dist/index.js
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {nodes.map((node) => (
            <NodeCard key={node.id} node={node} />
          ))}
        </div>
      )}
    </div>
  )
}

function NodeCard({ node }: { node: VpnNode }) {
  const isOnline = node.status === 'online'

  return (
    <div className={`bg-white rounded-xl border p-5 ${isOnline ? 'border-emerald-200' : 'border-gray-200'}`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isOnline ? 'bg-emerald-100' : 'bg-gray-100'}`}>
            {isOnline ? <Wifi size={18} className="text-emerald-600" /> : <WifiOff size={18} className="text-gray-400" />}
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">{node.hostname}</p>
            <p className="text-xs text-gray-400">{node.ipAddress}:{node.port}</p>
          </div>
        </div>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${isOnline ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
          {node.status}
        </span>
      </div>

      <div className="space-y-2 text-xs text-gray-500">
        {node.region && (
          <div className="flex items-center gap-1.5">
            <MapPin size={12} /> {node.region}
          </div>
        )}
        {node.version && (
          <div className="flex items-center gap-1.5">
            <Server size={12} /> v{node.version}
          </div>
        )}
        {node.lastSeen && (
          <div className="flex items-center gap-1.5">
            <Clock size={12} /> {new Date(node.lastSeen).toLocaleString()}
          </div>
        )}
      </div>
    </div>
  )
}
