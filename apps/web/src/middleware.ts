import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Pages that require auth
const PROTECTED = ['/dashboard', '/users', '/nodes', '/sessions', '/policies', '/settings']
const PUBLIC = ['/login']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Get token from cookie (we'll also set it there on login)
  const token = request.cookies.get('ovpn_token')?.value

  const isProtected = PROTECTED.some((p) => pathname.startsWith(p))
  const isPublic = PUBLIC.some((p) => pathname.startsWith(p))

  if (isProtected && !token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (isPublic && token) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
}
