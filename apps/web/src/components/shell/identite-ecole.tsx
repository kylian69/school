import type { ApparenceEcole } from '@scolaly/contracts';

/** Logo et nom affiché de l'école active (US-01-14), en tête de la navigation. */
export function IdentiteEcole({
  apparence,
  nom,
}: {
  apparence: ApparenceEcole | null | undefined;
  nom: string | undefined;
}) {
  if (!apparence) return null;
  return (
    <div className="flex items-center gap-2.5 rounded-control border border-line px-2.5 py-2">
      {apparence.logoUrl ? (
        // Logo servi par l'API sur la même origine ; ses dimensions varient d'une école à l'autre.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={apparence.logoUrl} alt="" className="h-8 w-8 shrink-0 object-contain" />
      ) : (
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent-soft text-xs font-bold text-accent"
        >
          {apparence.nomAffichage.slice(0, 2).toUpperCase()}
        </span>
      )}
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-semibold">{apparence.nomAffichage}</span>
        {nom && nom !== apparence.nomAffichage ? (
          <span className="truncate text-xs text-muted">{nom}</span>
        ) : null}
      </span>
    </div>
  );
}
