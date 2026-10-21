import { cn } from '@/lib/utils'

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2 font-semibold tracking-tight', className)}>
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden="true">
        <rect width="32" height="32" rx="8" className="fill-primary" />
        <path
          d="M9 20.5c1.6 1.7 4 2.5 6.6 2.5 3.4 0 5.9-1.6 5.9-4.3 0-2.4-1.8-3.4-5.1-4.1l-1.6-.3c-1.8-.4-2.5-.9-2.5-1.8 0-1.1 1.1-1.8 2.9-1.8 1.7 0 3 .6 4.2 1.7"
          fill="none"
          strokeWidth="2.4"
          strokeLinecap="round"
          className="stroke-primary-foreground"
        />
      </svg>
      <span className="text-base">SpendWise</span>
    </span>
  )
}
