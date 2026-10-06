import type { ComponentProps } from 'react';
import { cn } from '../lib/cn.js';

/** Carte : coins de 18 px, bordure d'un pixel, sans ombre (signature visuelle des maquettes). */
export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('rounded-card border border-line bg-surface p-5 text-fg', className)}
      {...props}
    />
  );
}
