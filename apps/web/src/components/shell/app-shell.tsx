'use client';

import { Button, Dialog, DialogContent, Logo } from '@scolaly/ui';
import { Menu } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { fr } from '@/i18n/fr';
import type { SessionUser } from '@/lib/session';
import type { ContexteSession } from '@scolaly/contracts';
import { CommandPalette } from './command-palette';
import { EcoleSelector } from './ecole-selector';
import { NavLinks } from './nav-links';
import { UserMenu } from './user-menu';

/**
 * Coquille de l'application (maquette « Tableau de bord ») : colonne de 248 px sur ordinateur,
 * barre supérieure et menu en tiroir sur mobile (360 px et plus).
 */
export function AppShell({
  user,
  consoleAccessible = false,
  contexte = null,
  children,
}: {
  user: SessionUser;
  /** École active, écoles du compte et modules (null si indisponible). */
  contexte?: ContexteSession | null;
  /** Membre de l'équipe Scolaly : lien vers la console de la plateforme. */
  consoleAccessible?: boolean;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const sidebar = (onNavigate?: () => void) => (
    <div className="flex h-full flex-col gap-[18px] px-3.5 py-5">
      <Logo className="px-2 pt-1" />
      <CommandPalette />
      {contexte ? <EcoleSelector contexte={contexte} /> : null}
      <NavLinks
        consoleAccessible={consoleAccessible}
        modules={contexte?.modules ?? []}
        permissions={contexte?.permissions ?? []}
        {...(onNavigate ? { onNavigate } : {})}
      />
      <div className="grow" />
      <UserMenu user={user} ecole={contexte?.ecoleActive?.nom} />
    </div>
  );

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh border-r border-line bg-surface md:block">
        {sidebar()}
      </aside>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-surface px-4 md:hidden">
        <Logo />
        <Button
          variant="ghost"
          size="icon"
          aria-label={fr.coquille.menu}
          onClick={() => {
            setMenuOpen(true);
          }}
        >
          <Menu className="size-5" aria-hidden="true" />
        </Button>
      </header>
      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent
          title={fr.coquille.navigation}
          hideTitle
          className="top-0 left-0 h-dvh w-[288px] max-w-none translate-x-0 rounded-none border-y-0 border-l-0"
        >
          {sidebar(() => {
            setMenuOpen(false);
          })}
        </DialogContent>
      </Dialog>
      <main className="bg-grid flex min-w-0 flex-col gap-[22px] px-4 py-6 md:px-9 md:pt-7 md:pb-10">
        {children}
      </main>
    </div>
  );
}
