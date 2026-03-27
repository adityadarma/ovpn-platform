import { createRootRoute, Outlet } from '@tanstack/react-router'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'

export const Route = createRootRoute({
  component: () => (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <Outlet />
      <Toaster />
    </ThemeProvider>
  ),
})
