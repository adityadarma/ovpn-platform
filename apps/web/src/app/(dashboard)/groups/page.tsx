'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Plus, Trash2, Users, Network, Pencil, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

interface Group {
  id: string
  name: string
  description: string | null
  member_count: number
  network_count: number
  created_at: string
}

interface GroupDetail extends Group {
  members: Array<{ id: string; username: string; email: string | null; role: string; is_active: boolean }>
  networks: Array<{ id: string; name: string; cidr: string }>
}

interface FormState { name: string; description: string }

export default function GroupsPage() {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [editGroup, setEditGroup] = useState<Group | null>(null)
  const [detailGroup, setDetailGroup] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>({ name: '', description: '' })

  const { data: groups = [], isLoading } = useQuery<Group[]>({
    queryKey: ['groups'],
    queryFn: () => api.get('/api/v1/groups'),
  })

  const { data: groupDetail } = useQuery<GroupDetail>({
    queryKey: ['groups', detailGroup],
    queryFn: () => api.get(`/api/v1/groups/${detailGroup}`),
    enabled: !!detailGroup,
  })

  const createMutation = useMutation({
    mutationFn: (data: FormState) => api.post<Group>('/api/v1/groups', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] })
      setShowCreate(false)
      setForm({ name: '', description: '' })
      toast.success('Group created successfully')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: FormState }) =>
      api.patch<Group>(`/api/v1/groups/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] })
      setEditGroup(null)
      toast.success('Group updated')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/groups/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] })
      if (detailGroup) setDetailGroup(null)
      toast.success('Group deleted')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const openEdit = (g: Group) => {
    setEditGroup(g)
    setForm({ name: g.name, description: g.description ?? '' })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Groups</h1>
          <p className="text-sm text-gray-500 mt-1">Organize VPN users into access groups</p>
        </div>
        <Button id="btn-create-group" onClick={() => { setShowCreate(true); setForm({ name: '', description: '' }) }}>
          <Plus className="mr-2 h-4 w-4" />
          New Group
        </Button>
      </div>

      {/* Detail panel + table side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Groups table */}
        <div className={detailGroup ? 'lg:col-span-2' : 'lg:col-span-3'}>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">All Groups</CardTitle>
              <CardDescription>{groups.length} group{groups.length !== 1 ? 's' : ''}</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>
              ) : groups.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No groups yet. Create one to start organizing your VPN users.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-center">Members</TableHead>
                      <TableHead className="text-center">Networks</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groups.map((g) => (
                      <TableRow
                        key={g.id}
                        className={`cursor-pointer hover:bg-muted/50 ${detailGroup === g.id ? 'bg-muted' : ''}`}
                        onClick={() => setDetailGroup(detailGroup === g.id ? null : g.id)}
                      >
                        <TableCell className="font-medium">{g.name}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{g.description ?? '—'}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary">{g.member_count}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline">{g.network_count}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" id={`btn-edit-group-${g.id}`} onClick={() => openEdit(g)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              id={`btn-delete-group-${g.id}`}
                              className="text-red-500 hover:text-red-600 hover:bg-red-50"
                              onClick={() => deleteMutation.mutate(g.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Detail panel */}
        {detailGroup && groupDetail && (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Members
                  <Badge className="ml-auto">{groupDetail.members.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {groupDetail.members.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">No members yet.</p>
                ) : (
                  <div className="divide-y">
                    {groupDetail.members.map(m => (
                      <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                        <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
                          {m.username[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{m.username}</p>
                          <p className="text-xs text-muted-foreground truncate">{m.email ?? '—'}</p>
                        </div>
                        <Badge variant={m.is_active ? 'default' : 'secondary'} className="text-xs">
                          {m.is_active ? 'active' : 'inactive'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Network className="h-4 w-4" />
                  Networks
                  <Badge className="ml-auto">{groupDetail.networks.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {groupDetail.networks.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">No networks assigned.</p>
                ) : (
                  <div className="divide-y">
                    {groupDetail.networks.map(n => (
                      <div key={n.id} className="px-4 py-2.5">
                        <p className="text-sm font-medium">{n.name}</p>
                        <code className="text-xs text-muted-foreground">{n.cidr}</code>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Group</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="group-name">Name</Label>
              <Input
                id="group-name"
                placeholder="e.g. IT Department"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="group-desc">Description</Label>
              <Textarea
                id="group-desc"
                placeholder="Optional description"
                rows={3}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              id="btn-create-group-submit"
              disabled={!form.name.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate(form)}
            >
              {createMutation.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editGroup} onOpenChange={() => setEditGroup(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Group</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-group-name">Name</Label>
              <Input
                id="edit-group-name"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-group-desc">Description</Label>
              <Textarea
                id="edit-group-desc"
                rows={3}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditGroup(null)}>Cancel</Button>
            <Button
              id="btn-edit-group-submit"
              disabled={!form.name.trim() || updateMutation.isPending}
              onClick={() => editGroup && updateMutation.mutate({ id: editGroup.id, data: form })}
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
