import { cn } from '../../lib/utils.js';

function Skeleton({ className, ...props }) {
  return <div className={cn('animate-pulse rounded-[var(--radius-md)] bg-muted', className)} {...props} />;
}

export { Skeleton };
