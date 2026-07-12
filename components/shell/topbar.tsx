'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bell, LogOut, Search, UserCircle2, X } from 'lucide-react'
import { useAppData } from '@/components/state/app-data-provider'
import { useAuth } from '@/components/state/auth-provider'
import { initials } from '@/lib/domain'
import { cn } from '@/lib/utils'

export function Topbar({
  onLogout,
  adminEmail,
}: {
  onLogout: () => Promise<void>
  adminEmail: string
}) {
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const router = useRouter()
  const wrapRef = useRef<HTMLDivElement>(null)
  const { searchIndex, notifications, settings, error } = useAppData()
  const { user } = useAuth()
  const userName = user?.displayName || user?.email || 'Authorized User'
  const userEmail = user?.email || adminEmail

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setSearchOpen(false)
        setNotifOpen(false)
        setProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const results = query.trim()
    ? searchIndex.filter((entry) =>
        [entry.title, entry.subtitle, entry.meta ?? '', entry.type]
          .join(' ')
          .toLowerCase()
          .includes(query.toLowerCase()),
      )
    : []

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-xl">
      <div
        ref={wrapRef}
        className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 md:px-8"
      >
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground">
            S
          </span>
          <span className="hidden text-[15px] font-semibold tracking-tight sm:inline">
            {settings.coachingName}
          </span>
        </Link>

        <div className="relative mx-auto w-full max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSearchOpen(true)
            }}
            onFocus={() => setSearchOpen(true)}
            placeholder="Search student, phone, receipt…"
            className="h-10 w-full rounded-full border border-border bg-muted/60 pl-10 pr-4 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-ring focus:bg-card focus:shadow-[0_0_0_4px_oklch(0.55_0.16_255/0.08)]"
          />
          {searchOpen && query.trim() && (
            <div className="absolute left-0 right-0 top-12 overflow-hidden rounded-2xl border border-border bg-popover shadow-[0_16px_50px_rgb(0,0,0,0.12)] animate-fade-up">
              {results.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No results found for &ldquo;{query}&rdquo;
                </p>
              ) : (
                <ul>
                  {results.slice(0, 5).map((entry) => (
                    <li key={`${entry.type}-${entry.id}`}>
                      <button
                        type="button"
                        onClick={() => {
                          router.push(entry.href)
                          setSearchOpen(false)
                          setQuery('')
                        }}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent"
                      >
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                          {entry.type === 'payment'
                            ? 'Rc'
                            : entry.type === 'expense'
                              ? 'Ex'
                              : initials(entry.title)}
                        </span>
                        <span className="flex-1">
                          <span className="block text-sm font-medium">
                            {entry.title}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {entry.subtitle}
                          </span>
                        </span>
                        {entry.meta && (
                          <span className="tabular text-xs font-medium text-warning-foreground">
                            {entry.meta}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setNotifOpen((v) => !v)}
            aria-label="Notifications"
            className="relative flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Bell className="h-[18px] w-[18px]" strokeWidth={1.75} />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
          </button>
          {notifOpen && (
            <div className="absolute right-0 top-12 w-80 overflow-hidden rounded-2xl border border-border bg-popover shadow-[0_16px_50px_rgb(0,0,0,0.12)] animate-fade-up">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <span className="text-sm font-semibold">Notifications</span>
                <button
                  type="button"
                  onClick={() => setNotifOpen(false)}
                  aria-label="Close notifications"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <ul>
                {notifications.map((n) => (
                  <li
                    key={n.id}
                    className="flex items-start gap-3 border-b border-border/60 px-4 py-3 last:border-0"
                  >
                    <span
                      className={cn(
                        'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                        n.tone === 'danger'
                          ? 'bg-destructive'
                          : n.tone === 'warning'
                            ? 'bg-warning'
                            : 'bg-primary',
                      )}
                    />
                    <span className="flex-1 text-sm leading-snug">
                      {n.label}
                    </span>
                    <span className="micro-label mt-0.5">{n.time}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setProfileOpen((v) => !v)}
            aria-label="Profile"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background transition-transform hover:scale-105"
          >
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt={userName}
                className="h-9 w-9 rounded-full object-cover"
              />
            ) : (
              initials(userName)
            )}
          </button>
          {profileOpen && (
            <div className="absolute right-0 top-12 w-64 overflow-hidden rounded-2xl border border-border bg-popover shadow-[0_16px_50px_rgb(0,0,0,0.12)] animate-fade-up">
              <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                {user?.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={userName}
                    className="h-9 w-9 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-accent-foreground">
                    <UserCircle2 className="h-4 w-4" />
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">
                    {userName}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {userEmail}
                  </span>
                </span>
              </div>
              <button
                type="button"
                onClick={() => void onLogout()}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-accent"
              >
                <LogOut className="h-4 w-4 text-muted-foreground" />
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
