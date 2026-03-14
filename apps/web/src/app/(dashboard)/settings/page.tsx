'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import { RefreshCw, Save } from 'lucide-react'
import { useState } from 'react'

interface Setting {
  key: string
  value: string | null
  description: string | null
}

export default function SettingsPage() {
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)

  const { data: settings = [], isLoading } = useQuery<Setting[]>({
    queryKey: ['settings'],
    queryFn: () => api.get('/api/v1/settings'),
  })

  const [values, setValues] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)

  const settingValues = settings.reduce<Record<string, string>>((acc, s) => {
    acc[s.key] = values[s.key] ?? s.value ?? ''
    return acc
  }, {})

  const saveMutation = useMutation({
    mutationFn: () =>
      api.post('/api/v1/settings', settingValues),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 mt-0.5 text-sm">Platform configuration</p>
      </div>

      {/* Account Info */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="font-semibold text-gray-900 mb-4 text-sm uppercase tracking-wide text-gray-500">Account</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-500 text-xs mb-1">Username</p>
            <p className="font-medium text-gray-900">{user?.username}</p>
          </div>
          <div>
            <p className="text-gray-500 text-xs mb-1">Role</p>
            <p className="font-medium text-gray-900 capitalize">{user?.role}</p>
          </div>
          <div>
            <p className="text-gray-500 text-xs mb-1">Email</p>
            <p className="font-medium text-gray-900">{user?.email ?? 'Not set'}</p>
          </div>
        </div>
      </div>

      {/* Platform Settings */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-5 text-sm uppercase tracking-wide text-gray-500">Platform</h2>
        {isLoading ? (
          <p className="text-gray-400 text-sm">Loading settings...</p>
        ) : (
          <div className="space-y-4">
            {settings.map((s) => (
              <div key={s.key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {s.key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                </label>
                {s.description && <p className="text-xs text-gray-400 mb-1.5">{s.description}</p>}
                <input
                  className="input-field"
                  value={settingValues[s.key] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [s.key]: e.target.value }))}
                />
              </div>
            ))}

            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || user?.role !== 'admin'}
              className="flex items-center gap-2 bg-emerald-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-emerald-500 disabled:opacity-50 transition-colors mt-2"
            >
              {saveMutation.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
              {saved ? 'Saved!' : 'Save Settings'}
            </button>
            {user?.role !== 'admin' && (
              <p className="text-xs text-gray-400">Admin access required to change settings.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
