'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  Server,
  Activity,
  Shield,
  Settings,
  LogOut,
  Network,
  UsersRound,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/users', label: 'Users', icon: Users },
  { href: '/groups', label: 'Groups', icon: UsersRound },
  { href: '/networks', label: 'Networks', icon: Network },
  { href: '/nodes', label: 'Nodes', icon: Server },
  { href: '/sessions', label: 'Sessions', icon: Activity },
  { href: '/policies', label: 'Policies', icon: Shield },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function AppSidebar() {
  const pathname = usePathname()

  return (
    <Sidebar collapsible="icon">
      {/* Brand */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="pointer-events-none">
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
                <Shield className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">OVPN Admin</span>
                <span className="truncate text-xs text-muted-foreground">VPN Management</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* Nav */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
                const active = pathname.startsWith(href) && (href !== '/dashboard' || pathname === '/dashboard')
                return (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton
                      id={`nav-link-${href.replace(/[^a-z0-9]/g, '-')}`}
                      isActive={active}
                      tooltip={label}
                      render={<Link href={href} />}
                    >
                      <Icon />
                      <span>{label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer / Logout */}
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              id="nav-link-logout"
              tooltip="Logout"
              className="text-red-500 hover:bg-red-50 hover:text-red-600 data-active:bg-red-50 data-active:text-red-600"
              onClick={() => {
                document.cookie = 'ovpn_token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT'
                localStorage.removeItem('ovpn-auth')
                window.location.href = '/login'
              }}
            >
              <LogOut />
              <span>Logout</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
