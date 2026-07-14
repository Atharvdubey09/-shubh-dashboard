'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutGrid,
  GraduationCap,
  CreditCard,
  Wallet,
  BarChart3,
  CalendarDays,
  Settings,
  Users,
  BookOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const items = [
  { href: '/', label: 'Dashboard', icon: LayoutGrid },
  { href: '/students', label: 'Students', icon: GraduationCap },
  { href: '/families', label: 'Families', icon: Users },
  { href: '/fees', label: 'Fees', icon: CreditCard },
  { href: '/expenses', label: 'Expenses', icon: Wallet },
  { href: '/academics', label: 'Academics', icon: BookOpen },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/settings', label: 'Settings', icon: Settings },
]

import { useAuth } from '@/components/state/auth-provider'

export function Dock() {
  const pathname = usePathname()
  const { userRole } = useAuth()

  const visibleItems = items.filter((item) => {
    if (!userRole) return false // Hide all tabs while loading role to avoid flash
    if (userRole === 'Owner') return true
    if (userRole === 'Admin') return true

    if (userRole === 'Accountant') {
      if (item.href === '/settings') return false
      return true
    }

    if (userRole === 'Receptionist') {
      if (item.href === '/expenses' || item.href === '/reports') return false
      return true
    }

    if (userRole === 'Teacher') {
      if (['/fees', '/expenses', '/reports', '/families', '/settings'].includes(item.href)) return false
      return true
    }

    return true
  })

  return (
    <nav
      aria-label="Main navigation"
      className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2"
    >
      <div className="flex items-center gap-1 rounded-full border border-border bg-card/85 px-2 py-2 shadow-[0_8px_30px_rgb(0,0,0,0.08)] backdrop-blur-xl">
        {visibleItems.map(({ href, label, icon: Icon }) => {
          const active =
            href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'group relative flex h-11 w-11 items-center justify-center rounded-full transition-all duration-300 md:h-10 md:w-auto md:px-4',
                active
                  ? 'bg-primary text-primary-foreground shadow-[0_4px_14px_oklch(0.55_0.16_255/0.35)]'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
              <span
                className={cn(
                  'hidden text-[13px] font-medium md:inline',
                  active ? 'md:ml-2' : 'md:ml-0 md:max-w-0 md:overflow-hidden md:opacity-0 md:transition-all md:duration-300 md:group-hover:ml-2 md:group-hover:max-w-24 md:group-hover:opacity-100',
                )}
              >
                {label}
              </span>
              <span className="sr-only">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
