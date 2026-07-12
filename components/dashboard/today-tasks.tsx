'use client'

import { Check } from 'lucide-react'
import { useAppData } from '@/components/state/app-data-provider'
import { cn } from '@/lib/utils'

export function TodayTasks() {
  const { tasks, toggleTask } = useAppData()
  const doneCount = tasks.filter((t) => t.done).length
  const progress = tasks.length > 0 ? (doneCount / tasks.length) * 100 : 0

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="micro-label">Today&apos;s Tasks</p>
        <span className="tabular text-xs font-medium text-muted-foreground">
          {doneCount}/{tasks.length} done
        </span>
      </div>
      <div className="mb-5 h-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
      <ul className="flex flex-col gap-1">
        {tasks.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => void toggleTask(t.id, !t.done)}
              className="group flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-muted/70"
            >
              <span
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all duration-300',
                  t.done
                    ? 'border-success bg-success text-success-foreground'
                    : 'border-border bg-card group-hover:border-primary',
                )}
              >
                {t.done && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
              <span className="flex-1">
                <span
                  className={cn(
                    'block text-sm font-medium transition-all',
                    t.done && 'text-muted-foreground line-through',
                  )}
                >
                  {t.label}
                </span>
                <span className="tabular block text-xs text-muted-foreground">
                  {t.meta}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
