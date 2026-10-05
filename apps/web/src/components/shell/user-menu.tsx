'use client';

import { Button, cn } from '@scolaly/ui';
import { LogOut, Monitor, Moon, ShieldCheck, Sun } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { fr } from '@/i18n/fr';
import type { SessionUser } from '@/lib/session';

const t = fr.coquille;
const THEMES = [
  { value: 'light', label: t.theme.clair, Icon: Sun },
  { value: 'dark', label: t.theme.sombre, Icon: Moon },
  { value: 'system', label: t.theme.systeme, Icon: Monitor },
] as const;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

/** Carte de la personne connectée : thème, sécurité du compte et déconnexion. */
export function UserMenu({ user, ecole }: { user: SessionUser; ecole?: string | undefined }) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  async function signOut() {
    await fetch('/api/auth/sign-out', { method: 'POST' }).catch(() => undefined);
    router.replace('/connexion');
    router.refresh();
  }

  return (
    <section
      aria-label={t.compte}
      className="flex flex-col gap-3 rounded-[14px] border border-line p-3"
    >
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="flex size-[34px] shrink-0 items-center justify-center rounded-control bg-surface-2 text-xs font-semibold"
        >
          {initials(user.name)}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[13px] font-semibold">{user.name}</span>
          <span className="truncate text-xs text-muted">{user.email}</span>
          {ecole ? <span className="truncate text-xs text-muted">{ecole}</span> : null}
        </span>
      </div>
      <div role="radiogroup" aria-label={t.theme.titre} className="grid grid-cols-3 gap-1">
        {THEMES.map(({ value, label, Icon }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={theme === value}
            aria-label={label}
            title={label}
            onClick={() => {
              setTheme(value);
            }}
            className={cn(
              'flex h-11 items-center justify-center rounded-control md:h-9',
              theme === value ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2',
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
          </button>
        ))}
      </div>
      <Button asChild variant="ghost">
        <Link href="/securite">
          <ShieldCheck className="size-4" aria-hidden="true" />
          {fr.securite.lien}
        </Link>
      </Button>
      <Button variant="secondary" onClick={() => void signOut()}>
        <LogOut className="size-4" aria-hidden="true" />
        {t.deconnexion}
      </Button>
    </section>
  );
}
