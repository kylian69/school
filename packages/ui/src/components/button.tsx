import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn.js';

/** Bouton (maquettes) : cible tactile de 44 px sur mobile, 40 px à partir de la tablette. */
export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-control text-sm font-semibold transition disabled:pointer-events-none disabled:opacity-60',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-fg hover:brightness-110',
        secondary: 'border border-line bg-surface text-fg hover:bg-surface-2',
        ghost: 'text-muted hover:bg-surface-2 hover:text-fg',
        danger: 'bg-bad text-white hover:brightness-110 dark:text-bg',
      },
      size: {
        default: 'h-11 px-4 md:h-10',
        icon: 'size-11 md:size-10',
      },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  },
);

export interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  /** Rend l'enfant (par exemple un lien) avec l'apparence du bouton. */
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, type, ...props }: ButtonProps) {
  const Component = asChild ? Slot.Root : 'button';
  return (
    <Component
      className={cn(buttonVariants({ variant, size }), className)}
      {...(asChild ? {} : { type: type ?? 'button' })}
      {...props}
    />
  );
}
