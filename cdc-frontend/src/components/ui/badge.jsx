import * as React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils.js';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-label font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground shadow-sm hover:bg-primary/90',
        secondary: 'border-transparent bg-primary/10 text-primary hover:bg-primary/15',
        destructive: 'border-transparent bg-destructive/10 text-destructive hover:bg-destructive/15',
        outline: 'text-foreground border-border',
        success: 'border-transparent bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))] hover:bg-[hsl(var(--success)/0.18)]',
        warning: 'border-transparent bg-[hsl(var(--warning)/0.12)] text-[hsl(var(--warning))] hover:bg-[hsl(var(--warning)/0.18)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

function Badge({ className, variant, ...props }) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
