'use client';

import { cn } from '@scolaly/ui';
import { Building2 } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { fr } from '@/i18n/fr';
import { entreeVisible, NAVIGATION } from './navigation';

export function NavLinks({
  onNavigate,
  consoleAccessible = false,
  modules = [],
  permissions = [],
  parcours,
}: {
  onNavigate?: () => void;
  consoleAccessible?: boolean;
  /** Modules actifs de l'école (RG-19-04) : seules leurs entrées apparaissent. */
  modules?: readonly string[];
  /** Permissions dans l'école active : les entrées réservées n'apparaissent qu'avec elles. */
  permissions?: readonly string[];
  /** Formation suivie ou enseignements dans l'école active. */
  parcours?: { apprenant: boolean; intervenant: boolean };
}) {
  const pathname = usePathname();
  return (
    <nav aria-label={fr.coquille.navigation} className="flex flex-col gap-0.5">
      {NAVIGATION.filter((entry) => entreeVisible(entry, modules, permissions, parcours)).map(
        (entry) => {
          const active = entry.href === '/' ? pathname === '/' : pathname.startsWith(entry.href);
          return (
            <Link
              key={entry.href}
              href={entry.href}
              {...(onNavigate ? { onClick: onNavigate } : {})}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-11 items-center gap-2.5 rounded-control px-2.5 text-sm font-medium md:h-[38px]',
                active
                  ? 'bg-accent-soft text-accent'
                  : 'text-muted hover:bg-surface-2 hover:text-fg',
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
        },
      )}
      {consoleAccessible ? (
        <Link
          href="/plateforme"
          {...(onNavigate ? { onClick: onNavigate } : {})}
          className="mt-2 flex h-11 items-center gap-2.5 rounded-control border border-line px-2.5 text-sm font-medium text-muted hover:bg-surface-2 hover:text-fg md:h-[38px]"
        >
          <Building2 className="size-[18px]" aria-hidden="true" />
          {fr.console.acces}
        </Link>
      ) : null}
    </nav>
  );
}
