'use client'

import { useEffect, useMemo } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { LoaderCircle } from 'lucide-react'
import Link from 'next/link'
import { Topbar } from './topbar'
import { Dock } from './dock'
import { QuickAdd } from './quick-add'
import { AppDataProvider } from '@/components/state/app-data-provider'
import { AuthProvider, useAuth } from '@/components/state/auth-provider'
import { LoginScreen } from '@/components/auth/login-screen'
import { QuickAddProvider } from './quick-add-context'
import { ToastProvider } from '@/components/ui/toast'

function AccessDenied({ onLogout }: { onLogout: () => Promise<void> }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center py-12 animate-fade-up">
      <div className="rounded-full bg-destructive/10 p-3 text-destructive">
        <span className="text-2xl">⚠️</span>
      </div>
      <h2 className="text-xl font-bold tracking-tight">Access Denied</h2>
      <p className="text-sm text-muted-foreground max-w-sm">
        You do not have permission to access this page. Please contact the administrator or switch accounts.
      </p>
      <div className="flex gap-3">
        <Link href="/" className="h-9 inline-flex items-center justify-center rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90">
          Go to Dashboard
        </Link>
        <button
          type="button"
          onClick={() => void onLogout()}
          className="h-9 inline-flex items-center justify-center rounded-xl border border-border px-4 text-xs font-semibold hover:bg-muted"
        >
          Sign Out
        </button>
      </div>
    </div>
  )
}

function ShellGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, loading, loginWithGoogle, logout, error, adminEmail, isAuthorized, userRole } = useAuth()

  useEffect(() => {
    if (loading) return
    if (!user && pathname !== '/login') {
      router.replace('/login')
      return
    }
    if (user && pathname === '/login') {
      router.replace('/')
    }
  }, [loading, pathname, router, user])

  const isAllowed = useMemo(() => {
    if (!user) return true
    if (pathname === '/login') return true
    if (!userRole) return true

    if (userRole === 'Owner') return true

    if (userRole === 'Admin') {
      if (pathname.startsWith('/settings/users')) return false
      return true
    }

    if (userRole === 'Accountant') {
      if (pathname.startsWith('/settings')) return false
      return true
    }

    if (userRole === 'Receptionist') {
      if (pathname.startsWith('/expenses')) return false
      if (pathname.startsWith('/reports')) return false
      if (pathname.startsWith('/settings/users')) return false
      return true
    }

    if (userRole === 'Teacher') {
      if (pathname.startsWith('/fees')) return false
      if (pathname.startsWith('/expenses')) return false
      if (pathname.startsWith('/reports')) return false
      if (pathname.startsWith('/families')) return false
      if (pathname.startsWith('/settings')) return false
      if (pathname.startsWith('/transactions')) return false
      return true
    }

    return false
  }, [user, userRole, pathname])

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background text-muted-foreground">
        <div className="flex items-center gap-3 rounded-full border border-border bg-card px-4 py-2 text-sm">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Checking access permissions...
        </div>
      </div>
    )
  }

  if (!user) {
    if (pathname === '/login') {
      return <LoginScreen onLogin={loginWithGoogle} error={error} />
    }
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background text-muted-foreground">
        <div className="flex items-center gap-3 rounded-full border border-border bg-card px-4 py-2 text-sm">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Redirecting to login...
        </div>
      </div>
    )
  }

  if (pathname === '/login') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background text-muted-foreground">
        <div className="flex items-center gap-3 rounded-full border border-border bg-card px-4 py-2 text-sm">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Redirecting to dashboard...
        </div>
      </div>
    )
  }

  if (!isAuthorized) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background text-muted-foreground">
        <div className="flex items-center gap-3 rounded-full border border-border bg-card px-4 py-2 text-sm">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Verifying access permissions...
        </div>
      </div>
    )
  }

  return (
    <AppDataProvider>
      <QuickAddProvider>
        <div className="min-h-dvh">
          <Topbar onLogout={logout} adminEmail={adminEmail} />
          <main className="mx-auto max-w-6xl px-4 pb-32 pt-8 md:px-8">
            {isAllowed ? children : <AccessDenied onLogout={logout} />}
          </main>
          <Dock />
          <QuickAdd />
        </div>
      </QuickAddProvider>
    </AppDataProvider>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ToastProvider>
        <ShellGate>{children}</ShellGate>
      </ToastProvider>
    </AuthProvider>
  )
}
