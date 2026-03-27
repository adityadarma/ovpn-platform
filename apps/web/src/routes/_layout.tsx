import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/sidebar'
import { Separator } from '@/components/ui/separator'
import { ThemeToggle } from '@/components/theme-toggle'
import { useAuthStore } from '@/store/auth.store'

export const Route = createFileRoute('/_layout')({
  beforeLoad: () => {
    const isAuthenticated = useAuthStore.getState().isAuthenticated()
    if (!isAuthenticated) {
      throw redirect({ to: '/login' })
    }
  },
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        {/* Header */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <span className="text-sm text-muted-foreground">VPN Manager</span>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
          </div>
        </header>

        {/* Page content */}
        <div className="flex flex-1 flex-col gap-4 p-6">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
