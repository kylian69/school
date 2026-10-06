/** Date du jour (AAAA-MM-JJ) dans le fuseau donné, Europe/Paris par défaut. */
export function aujourdhui(timeZone = 'Europe/Paris', maintenant = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(maintenant);
}
