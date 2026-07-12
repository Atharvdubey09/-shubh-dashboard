'use client'

import { createContext, useContext, useMemo, useState } from 'react'
import { CheckCircle2, CircleAlert, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ToastTone = 'success' | 'error' | 'info'

export interface ToastInput {
  title: string
  description?: string
  tone?: ToastTone
}

interface ToastItem extends Required<ToastInput> {
  id: string
}

interface ToastContextValue {
  toast: (input: ToastInput) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const value = useMemo<ToastContextValue>(
    () => ({
      toast: (input) => {
        const item: ToastItem = {
          id: crypto.randomUUID(),
          title: input.title,
          description: input.description ?? '',
          tone: input.tone ?? 'info',
        }
        setToasts((current) => [item, ...current].slice(0, 4))
        window.setTimeout(() => {
          setToasts((current) => current.filter((toast) => toast.id !== item.id))
        }, 3200)
      },
    }),
    [],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-6 right-6 z-[60] flex w-[min(100vw-2rem,22rem)] flex-col gap-2">
        {toasts.map((toast) => {
          const icon =
            toast.tone === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-success" />
            ) : toast.tone === 'error' ? (
              <CircleAlert className="h-4 w-4 text-destructive" />
            ) : (
              <Info className="h-4 w-4 text-primary" />
            )

          return (
            <div
              key={toast.id}
              className={cn(
                'pointer-events-auto rounded-2xl border bg-card px-4 py-3 shadow-[0_16px_40px_rgb(0,0,0,0.12)] animate-fade-up',
                toast.tone === 'success'
                  ? 'border-success/30'
                  : toast.tone === 'error'
                    ? 'border-destructive/30'
                    : 'border-border',
              )}
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5">{icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{toast.title}</p>
                  {toast.description && (
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      {toast.description}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return context
}

