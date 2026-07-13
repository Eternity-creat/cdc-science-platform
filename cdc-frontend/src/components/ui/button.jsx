import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils.js';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap text-sm font-semibold ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'rounded-full bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80 shadow-sm',
        destructive: 'rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm',
        outline: 'rounded-[var(--radius-md)] border border-input bg-background hover:bg-accent hover:text-accent-foreground font-medium',
        secondary: 'rounded-[var(--radius-md)] bg-secondary text-secondary-foreground hover:bg-secondary/80 font-medium',
        ghost: 'rounded-[var(--radius-md)] text-foreground hover:bg-accent hover:text-accent-foreground font-medium',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-5 py-2',
        sm: 'h-9 rounded-[var(--radius-md)] px-3',
        lg: 'h-11 px-8',
        icon: 'h-10 w-10 rounded-[var(--radius-md)]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});
Button.displayName = 'Button';

export { Button, buttonVariants };
