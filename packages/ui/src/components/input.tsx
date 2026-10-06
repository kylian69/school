import type { ComponentProps } from 'react';
import { cn } from '../lib/cn.js';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'h-11 w-full rounded-control border border-line bg-surface px-3 text-base text-fg placeholder:text-subtle md:h-10 md:text-sm',
        'aria-invalid:border-bad',
        className,
      )}
      {...props}
    />
  );
}
