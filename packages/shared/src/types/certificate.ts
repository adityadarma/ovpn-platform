export interface Certificate {
  id: string
  userId: string
  certPath: string
  serialNumber: string | null
  revoked: boolean
  expiresAt: string | null
  createdAt: string
}
