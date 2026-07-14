'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, PageHeader } from '@/components/ui-bits'
import { useAppData } from '@/components/state/app-data-provider'
import { useAuth } from '@/components/state/auth-provider'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

function Toggle({
  label,
  desc,
  defaultOn = true,
  onChange,
}: {
  label: string
  desc: string
  defaultOn?: boolean
  onChange: (value: boolean) => void
}) {
  const [on, setOn] = useState(defaultOn)
  useEffect(() => setOn(defaultOn), [defaultOn])
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => {
        setOn((value) => {
          const next = !value
          onChange(next)
          return next
        })
      }}
      className="flex w-full items-center gap-4 rounded-2xl px-3 py-3.5 text-left transition-colors hover:bg-muted/70"
    >
      <span className="flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs leading-relaxed text-muted-foreground">
          {desc}
        </span>
      </span>
      <span
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors duration-300',
          on ? 'bg-primary' : 'bg-muted',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-card shadow transition-all duration-300',
            on ? 'left-[22px]' : 'left-0.5',
          )}
        />
      </span>
    </button>
  )
}

const inputCls =
  'h-11 w-full rounded-xl border border-border bg-muted/50 px-3.5 text-sm outline-none transition-all focus:border-ring focus:bg-card focus:shadow-[0_0_0_4px_oklch(0.55_0.16_255/0.08)]'

export default function SettingsPage() {
  const { settings, persistSettings } = useAppData()
  const { userRole } = useAuth()
  const { toast } = useToast()
  const [form, setForm] = useState(settings)

  const [gateway, setGateway] = useState<{
    isConnected: boolean
    isWebhookConfigured: boolean
    mode: string
    keyId: string
    lastSyncStatus: string
  } | null>(null)

  useEffect(() => {
    setForm(settings)
  }, [settings])

  useEffect(() => {
    async function fetchGatewayDetails() {
      try {
        const res = await fetch('/api/payments/status')
        if (res.ok) {
          const data = await res.json()
          setGateway(data)
        }
      } catch (err) {
        console.error('Failed to fetch gateway details:', err)
      }
    }
    void fetchGatewayDetails()
  }, [])

  async function handleSave() {
    try {
      await persistSettings(form)
      toast({
        title: 'Settings saved',
        description: 'Firebase has been updated with the latest coaching details.',
        tone: 'success',
      })
    } catch (err) {
      toast({
        title: 'Save failed',
        description: err instanceof Error ? err.message : 'Please try again.',
        tone: 'error',
      })
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Settings"
        title="Keep it simple"
        sub="Only the settings you actually need."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-6 animate-fade-up [animation-delay:60ms]">
          <p className="micro-label mb-1">Institute</p>
          <h2 className="mb-6 text-base font-semibold tracking-tight">
            Coaching details
          </h2>
          <div className="flex flex-col gap-4">
            <label className="block">
              <span className="micro-label mb-1.5 block">Coaching name</span>
              <input
                className={inputCls}
                value={form.coachingName}
                onChange={(e) => setForm((current) => ({ ...current, coachingName: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="micro-label mb-1.5 block">Owner name</span>
              <input
                className={inputCls}
                value={form.ownerName}
                onChange={(e) => setForm((current) => ({ ...current, ownerName: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="micro-label mb-1.5 block">Phone</span>
              <input
                className={inputCls}
                value={form.phone}
                onChange={(e) => setForm((current) => ({ ...current, phone: e.target.value }))}
                inputMode="tel"
              />
            </label>
            <label className="block">
              <span className="micro-label mb-1.5 block">Address</span>
              <input
                className={inputCls}
                value={form.address}
                onChange={(e) => setForm((current) => ({ ...current, address: e.target.value }))}
              />
            </label>
            <button
              type="button"
              onClick={() => void handleSave()}
              className="mt-2 h-11 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Save changes
            </button>
          </div>
        </Card>

        <Card className="p-6 animate-fade-up [animation-delay:120ms]">
          <p className="micro-label mb-1">Reminders</p>
          <h2 className="mb-4 text-base font-semibold tracking-tight">
            Notifications
          </h2>
          <div className="flex flex-col gap-1">
            <Toggle
              label="Today's due fees"
              desc="Show a reminder on the dashboard every morning."
              defaultOn={form.reminders.todaysDueFees}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  reminders: { ...current.reminders, todaysDueFees: value },
                }))
              }
            />
            <Toggle
              label="Tomorrow's dues"
              desc="A gentle heads-up one day before a fee is due."
              defaultOn={form.reminders.tomorrowsDueFees}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  reminders: { ...current.reminders, tomorrowsDueFees: value },
                }))
              }
            />
            <Toggle
              label="Rent and salary reminders"
              desc="Never miss rent day or teacher salary day."
              defaultOn={form.reminders.rentAndSalary}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  reminders: { ...current.reminders, rentAndSalary: value },
                }))
              }
            />
            <Toggle
              label="Electricity and internet bills"
              desc="Reminder when utility bills are usually due."
              defaultOn={form.reminders.utilities}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  reminders: { ...current.reminders, utilities: value },
                }))
              }
            />
          </div>
          <div className="mt-6 rounded-2xl bg-accent p-4">
            <p className="text-xs leading-relaxed text-accent-foreground text-pretty">
              No spam, ever. You&apos;ll only see reminders about money, dues,
              rent, salary and bills.
            </p>
          </div>
        </Card>
      </div>

      {/* Admin Actions */}
      {(userRole === 'Owner' || userRole === 'Admin') && (
        <div className="mt-5 grid gap-5 lg:grid-cols-3 animate-fade-up [animation-delay:180ms]">
          {userRole === 'Owner' && (
            <Card className="p-6 flex flex-col justify-between">
              <div>
                <p className="micro-label mb-1">Security</p>
                <h2 className="text-base font-semibold tracking-tight mb-2">User Access Control</h2>
                <p className="text-xs text-muted-foreground leading-relaxed text-pretty">
                  Control who has access to the Coaching ERP. Invite new staff, update roles, or suspend access.
                </p>
              </div>
              <Link
                href="/settings/users"
                className="mt-6 h-10 inline-flex items-center justify-center rounded-xl bg-primary text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
              >
                Manage Staff Users
              </Link>
            </Card>
          )}

          <Card className="p-6 flex flex-col justify-between">
            <div>
              <p className="micro-label mb-1">Archived</p>
              <h2 className="text-base font-semibold tracking-tight mb-2">Deleted Students Directory</h2>
              <p className="text-xs text-muted-foreground leading-relaxed text-pretty">
                Browse student profiles that have been deleted. You can restore them and all their linkages at any time.
              </p>
            </div>
            <Link
              href="/settings/deleted-students"
              className="mt-6 h-10 inline-flex items-center justify-center rounded-xl border border-border bg-card text-xs font-semibold hover:bg-muted transition-colors"
            >
              View Deleted Registry
            </Link>
          </Card>

          <Card className="p-6 flex flex-col justify-between border-l-4 border-l-indigo-600 bg-card">
            <div>
              <p className="micro-label mb-1">Payment Integration</p>
              <h2 className="text-base font-semibold tracking-tight mb-4">Payment Gateway</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block">
                    <span className="micro-label mb-1.5 block">Razorpay Key ID</span>
                    <input
                      className={cn(inputCls, "bg-muted/30 cursor-not-allowed text-xs font-mono")}
                      value={gateway?.keyId || 'Not Configured'}
                      readOnly
                      disabled
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl border border-border p-3">
                    <span className="text-muted-foreground block text-[10px] uppercase font-semibold mb-1">Connection</span>
                    {gateway?.isConnected ? (
                      <span className="font-bold text-success">Connected</span>
                    ) : (
                      <span className="font-bold text-destructive">Disconnected</span>
                    )}
                  </div>

                  <div className="rounded-xl border border-border p-3">
                    <span className="text-muted-foreground block text-[10px] uppercase font-semibold mb-1">Webhook</span>
                    {gateway?.isWebhookConfigured ? (
                      <span className="font-bold text-success">Active</span>
                    ) : (
                      <span className="font-bold text-destructive">Inactive</span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl border border-border p-3">
                    <span className="text-muted-foreground block text-[10px] uppercase font-semibold mb-1">Environment</span>
                    <span className={cn(
                      'font-bold',
                      gateway?.mode === 'Live Mode' ? 'text-emerald-500' : gateway?.mode === 'Test Mode' ? 'text-amber-500' : 'text-muted-foreground'
                    )}>
                      {gateway?.mode || 'None'}
                    </span>
                  </div>

                  <div className="rounded-xl border border-border p-3">
                    <span className="text-muted-foreground block text-[10px] uppercase font-semibold mb-1">Web Health</span>
                    <span className="font-bold text-foreground">{gateway?.lastSyncStatus || '—'}</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="mt-4 rounded-xl bg-accent p-3 text-[10px] leading-relaxed text-accent-foreground">
              👉 Configure <code className="font-mono bg-card/60 px-1 py-0.5 rounded">RAZORPAY_KEY_ID</code> and <code className="font-mono bg-card/60 px-1 py-0.5 rounded">RAZORPAY_KEY_SECRET</code> in environment to connect.
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

