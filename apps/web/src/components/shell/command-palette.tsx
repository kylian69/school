'use client';

import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandList,
  Dialog,
  DialogContent,
} from '@scolaly/ui';
import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { fr } from '@/i18n/fr';

const t = fr.coquille;

/** Recherche globale ⌘K (maquettes). Vide au MVP initial : les sources arrivent avec les modules. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
        aria-label={t.rechercherRaccourci}
        className="flex h-11 w-full items-center gap-2 rounded-control border border-line bg-bg px-2.5 text-sm text-muted hover:bg-surface-2 md:h-10"
      >
        <Search className="size-4" aria-hidden="true" />
        <span className="grow text-left">{t.rechercher}</span>
        <kbd className="rounded-md border border-line px-1.5 py-0.5 font-mono text-[11.5px]">
          ⌘K
        </kbd>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={t.palette.titre} hideTitle className="overflow-hidden p-0">
          <Command label={t.palette.titre}>
            <CommandInput placeholder={t.palette.placeholder} />
            <CommandList>
              <CommandEmpty>{t.palette.vide}</CommandEmpty>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
