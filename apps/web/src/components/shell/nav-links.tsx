'use client';

import { cn } from '@scolaly/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { fr } from '@/i18n/fr';
import { NAVIGATION } from './navigation';

export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label={fr.coquille.navigation} className="flex flex-col gap-0.5">
      {NAVIGATION.map((entry) => {
        const active = entry.href === '/' ? pathname === '/' : pathname.startsWith(entry.href);
        return (
          <Link
            key={entry.href}
            href={entry.href}
            {...(onNavigate ? { onClick: onNavigate } : {})}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex h-11 items-center gap-2.5 rounded-control px-2.5 text-sm font-medium md:h-[38px]',
              active ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg',
            )}
          >
            <svg
              viewBox="0 0 24 24"
              className="size-[18px]"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.7}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d={entry.icon} />
            </svg>
            {entry.label}
          </Link>
        );
      })}
    </nav>
  );
}
