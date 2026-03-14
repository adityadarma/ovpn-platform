export type UserRole = 'admin' | 'user'

export interface User {
  id: string
  username: string
  email: string | null
  role: UserRole
  isActive: boolean
  lastLogin: string | null
  createdAt: string
  updatedAt: string
}

export interface UserWithPassword extends User {
  passwordHash: string
}
