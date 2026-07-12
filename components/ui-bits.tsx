import { cn } from '@/lib/utils'

export function Card({
  className,
  children,
  ...props
}: {
  className?: string
  children: React.ReactNode
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-3xl border border-border bg-card shadow-[0_1px_2px_rgb(0,0,0,0.03),0_8px_24px_rgb(0,0,0,0.03)] transition-shadow duration-300 hover:shadow-[0_1px_2px_rgb(0,0,0,0.04),0_12px_32px_rgb(0,0,0,0.06)]',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function PageHeader({
  eyebrow,
  title,
  sub,
  action,
}: {
  eyebrow: string
  title: string
  sub?: string
  action?: React.ReactNode
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4 animate-fade-up">
      <div>
        <p className="micro-label mb-2">{eyebrow}</p>
        <h1 className="text-2xl font-semibold tracking-tight text-balance md:text-3xl">
          {title}
        </h1>
        {sub && (
          <p className="mt-1.5 text-sm text-muted-foreground text-pretty">
            {sub}
          </p>
        )}
      </div>
      {action}
    </div>
  )
}

export function StatusPill({
  status,
}: {
  status: 'paid' | 'upcoming' | 'overdue' | 'active' | 'inactive' | 'due-today' | 'critical' | 'partial'
}) {
  const map = {
    paid: 'bg-success/10 text-success',
    active: 'bg-success/10 text-success',
    upcoming: 'bg-warning/15 text-warning-foreground',
    overdue: 'bg-destructive/10 text-destructive',
    inactive: 'bg-muted text-muted-foreground',
    'due-today': 'bg-primary/10 text-primary',
    critical: 'bg-destructive/10 text-destructive font-semibold',
    partial: 'bg-warning/10 text-warning-foreground',
  }
  const labelMap = {
    paid: 'paid',
    active: 'active',
    upcoming: 'upcoming',
    overdue: 'overdue',
    inactive: 'inactive',
    'due-today': 'due today',
    critical: 'critical pending',
    partial: 'partial',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium capitalize',
        map[status],
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {labelMap[status]}
    </span>
  )
}

export function Avatar({
  name,
  size = 'md',
  className,
  src,
}: {
  name: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
  src?: string
}) {
  const inits = name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
  const sizes = {
    sm: 'h-8 w-8 text-[11px]',
    md: 'h-10 w-10 text-xs',
    lg: 'h-16 w-16 text-lg',
  }
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-accent font-semibold text-accent-foreground',
        sizes[size],
        className,
      )}
      style={
        src
          ? {
              backgroundImage: `url(${src})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              color: 'transparent',
            }
          : undefined
      }
    >
      {!src && inits}
    </span>
  )
}
