'use client'

import { useState } from 'react'
import { ShieldCheck, Sparkles } from 'lucide-react'
import { Card } from '@/components/ui-bits'

export function LoginScreen({
  onLogin,
  error,
}: {
  onLogin: () => Promise<void>
  error: string | null
}) {
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  async function handleSubmit() {
    setBusy(true)
    setLocalError(null)
    try {
      await onLogin()
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Login failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <Card className="overflow-hidden p-6 md:p-8">
          <div className="mb-6 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="micro-label mb-1">Shubh Classes</p>
              <h1 className="text-xl font-semibold tracking-tight">
                Welcome back
              </h1>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={busy}
            className="group flex h-11 w-full items-center justify-center gap-3 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground transition-all hover:border-primary hover:bg-accent disabled:cursor-not-allowed disabled:opacity-70"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-background shadow-sm ring-1 ring-border">
              <span className="grid h-4 w-4 grid-cols-2 grid-rows-2 gap-[1px]">
                <span className="rounded-[3px] bg-[#4285F4]" />
                <span className="rounded-[3px] bg-[#34A853]" />
                <span className="rounded-[3px] bg-[#FBBC05]" />
                <span className="rounded-[3px] bg-[#EA4335]" />
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              {busy ? 'Opening Google...' : 'Continue with Google'}
              <Sparkles className="h-3.5 w-3.5 opacity-70 transition-transform group-hover:translate-x-0.5" />
            </span>
          </button>

          {(error || localError) && (
            <p className="mt-4 text-sm text-destructive">
              {error || localError}
            </p>
          )}
        </Card>
      </div>
    </div>
  )
}
