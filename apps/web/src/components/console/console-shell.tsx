'use client';

import { cn, LogoMark } from '@scolaly/ui';
import { ArrowLeft, Building2 } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { fr } from '@/i18n/fr';

const t = fr.console;
const ENTREES = [
  { href: '/plateforme/clients', label: t.entrees.clients, Icon: Building2 },
] as const;

/**
 * Coquille de la console (maquette « Console plateforme ») : colonne toujours sombre, étiquette
 * CONSOLE. Seules les entrées dont l'écran existe sont affichées (facturation, licences,
 * démonstrations et maintenances suivront).
 */
export function ConsoleShell({
  role,
  children,
}: {
  role: keyof typeof t.roles;
  children: ReactNode;
}) {
  const pathname = usePathname();
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="dark flex flex-col gap-[18px] bg-bg px-3.5 py-5 text-fg md:sticky md:top-0 md:h-dvh">
        <div className="flex items-center gap-2.5 px-2 pt-1">
          <LogoMark />
          <span className="text-[19px] font-[650] tracking-[-0.04em]">scolaly</span>
          <span className="rounded-md border border-line px-1.5 py-0.5 font-mono text-[10.5px] text-muted">
            {t.nom.toUpperCase()}
          </span>
        </div>
        <nav aria-label={t.navigation} className="flex flex-col gap-0.5">
          {ENTREES.map(({ href, label, Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-11 items-center gap-2.5 rounded-control px-2.5 text-sm font-medium md:h-[38px]',
                  active ? 'bg-surface-2 text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg',
                )}
              >
                <Icon className="size-[18px]" aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="grow" />
        <div className="flex flex-col gap-2 rounded-[14px] border border-line p-3 text-sm">
          <span className="font-semibold">{t.roles[role]}</span>
          <Link href="/" className="flex items-center gap-1.5 text-muted hover:text-fg">
            <ArrowLeft className="size-4" aria-hidden="true" />
            {t.retourEcole}
          </Link>
        </div>
      </aside>
      <main className="bg-grid flex min-w-0 flex-col gap-[22px] px-4 py-6 md:px-9 md:pt-7 md:pb-10">
        {children}
      </main>
    </div>
  );
}
