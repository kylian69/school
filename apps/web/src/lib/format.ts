/** Date légale AAAA-MM-JJ affichée au format JJ/MM/AAAA (conventions). */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [annee, mois, jour] = iso.slice(0, 10).split('-');
  return `${jour}/${mois}/${annee}`;
}

/** Horodatage UTC affiché dans le fuseau de l'établissement (Europe/Paris par défaut). */
export function formatDateHeure(iso: string, timeZone = 'Europe/Paris'): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso));
}

export const formatNombre = (n: number) => new Intl.NumberFormat('fr-FR').format(n);

/** Heure au format HH:MM, dans le fuseau de l'établissement. */
export const formatHeure = (iso: string, timeZone = 'Europe/Paris') =>
  new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone }).format(
    new Date(iso),
  );
