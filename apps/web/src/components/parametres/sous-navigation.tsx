'use client';

import { cn } from '@scolaly/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { fr } from '@/i18n/fr';
import type { SectionParametres } from './sections';

/** Onglets des paramètres : défilement horizontal sur mobile. */
export function SousNavigation({ sections }: { sections: readonly SectionParametres[] }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label={fr.parametres.navigation}
      className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0"
    >
      <ul className="flex min-w-max gap-1 border-b border-line">
        {sections.map((section) => {
          const active = pathname.startsWith(section.href);
          return (
            <li key={section.href}>
              <Link
                href={section.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  '-mb-px flex h-11 items-center border-b-2 px-3 text-sm font-medium',
                  active
                    ? 'border-accent text-accent'
                    : 'border-transparent text-muted hover:text-fg',
                )}
              >
                {section.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
