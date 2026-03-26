'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'

/**
 * Client-side auth guard hook.
 * Use in dashboard layout to protect all dashboard routes.
 * Redirects to /login if user is not authenticated.
 */
export function useAuthGuard() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/login')
    }
  }, [router, isAuthenticated])

  return isAuthenticated()
}
