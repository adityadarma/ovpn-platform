'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '@/lib/api'
import { ShieldPlus, Trash2, RefreshCw } from 'lucide-react'
import type { VpnPolicy, User } from '@ovpn/shared'

interface CreatePolicyForm {
  userId: string
  allowedNetwork: string
  action: 'allow' | 'deny'
  priority: string
  description: string
}

export default function PoliciesPage() {
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState<CreatePolicyForm>({
    userId: '', allowedNetwork: '', action: 'allow', priority: '100', description: '',
  })

  const { data: policies = [], isLoading } = useQuery<VpnPolicy[]>({
    queryKey: ['policies'],
    queryFn: () => api.get('/api/v1/policies'),
  })
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => api.get('/api/v1/users'),
  })

  const createMutation = useMutation({
    mutationFn: () => api.post('/api/v1/policies', {
      userId: form.userId,
      allowedNetwork: form.allowedNetwork,
      action: form.action,
      priority: parseInt(form.priority) || 100,
      description: form.description || undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['policies'] }); setShowModal(false); setError('') },
    onError: (e: Error) => setError(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/policies/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['policies'] }),
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Network Policies</h1>
          <p className="text-gray-500 mt-0.5 text-sm">{policies.length} rules defined</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <ShieldPlus size={16} /> Add Policy
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : policies.length === 0 ? (
          <div className="p-12 text-center text-gray-400">No network policies defined.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Network</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Priority</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Description</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {policies.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-mono text-sm text-gray-800">{p.allowedNetwork}</td>
                  <td className="px-6 py-4">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${p.action === 'allow' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      {p.action}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{p.priority}</td>
                  <td className="px-6 py-4 text-sm text-gray-400">{p.description ?? '—'}</td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => deleteMutation.mutate(p.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-lg font-bold text-gray-900 mb-5">Add Network Policy</h2>
            <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate() }} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">User</label>
                <select className="input-field" value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} required>
                  <option value="">Select user...</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.username}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Network (CIDR)</label>
                <input className="input-field font-mono" value={form.allowedNetwork} onChange={(e) => setForm({ ...form, allowedNetwork: e.target.value })} placeholder="10.0.0.0/24" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Action</label>
                  <select className="input-field" value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value as 'allow' | 'deny' })}>
                    <option value="allow">Allow</option>
                    <option value="deny">Deny</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Priority</label>
                  <input type="number" className="input-field" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} min={0} max={1000} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
                <input className="input-field" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional" />
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowModal(false); setError('') }} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">Cancel</button>
                <button type="submit" disabled={createMutation.isPending} className="flex-1 bg-emerald-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-emerald-500 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                  {createMutation.isPending && <RefreshCw size={14} className="animate-spin" />} Add Policy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
