export interface AuditLog {
  id: string
  userId: string | null
  action: string
  resource: string
  resourceId: string | null
  ip: string | null
  userAgent: string | null
  createdAt: string
}
