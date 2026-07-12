'use client'

import { createContext, useContext, useMemo, useState } from 'react'

export type QuickAddTab = 'student' | 'fee' | 'expense'

export interface QuickAddTarget {
  tab: QuickAddTab
  studentId?: string
  paymentId?: string
  expenseId?: string
}

interface QuickAddContextValue {
  open: boolean
  target: QuickAddTarget
  openQuickAdd: (target?: Partial<QuickAddTarget> & { tab?: QuickAddTab }) => void
  closeQuickAdd: () => void
}

const defaultTarget: QuickAddTarget = { tab: 'fee' }

const QuickAddContext = createContext<QuickAddContextValue | null>(null)

export function QuickAddProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState<QuickAddTarget>(defaultTarget)

  const value = useMemo<QuickAddContextValue>(
    () => ({
      open,
      target,
      openQuickAdd: (next = {}) => {
        setTarget({
          tab: next.tab ?? target.tab,
          studentId: next.studentId,
          paymentId: next.paymentId,
          expenseId: next.expenseId,
        })
        setOpen(true)
      },
      closeQuickAdd: () => setOpen(false),
    }),
    [open, target],
  )

  return <QuickAddContext.Provider value={value}>{children}</QuickAddContext.Provider>
}

export function useQuickAdd() {
  const context = useContext(QuickAddContext)
  if (!context) {
    throw new Error('useQuickAdd must be used within QuickAddProvider')
  }
  return context
}

