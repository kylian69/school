import type { Contrat, ConventionStage } from '@scolaly/contracts';
import { fr } from '@/i18n/fr';
import { formatDate } from '@/lib/format';

const t = fr.contrats;

export const euros = (centimes: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(centimes / 100);
const heures = (n: number) =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n);

/** Alertes d'un contrat : avertissements (section 7, RG-03-04) et fin de période d'essai. */
export function alertesContrat(c: Omit<Contrat, 'tuteurs'> & { tuteurs?: Contrat['tuteurs'] }) {
  const alertes = c.avertissements.map((a) => {
    if (a.type !== 'capacite-maitre') return t.avertissements[a.type];
    const tuteur = c.tuteurs?.find((x) => x.personne.id === a.tuteurId)?.personne;
    return t.avertissements['capacite-maitre'](
      tuteur ? `${tuteur.prenom} ${tuteur.nom}` : t.fiche.tuteur,
    );
  });
  if (c.finPeriodeEssai && (c.statut === 'signe' || c.statut === 'en_cours')) {
    alertes.push(t.finEssai(formatDate(c.finPeriodeEssai)));
  }
  return alertes;
}

/** RG-03-23 : contrôles légaux d'une convention. */
export const alertesConvention = (c: ConventionStage) =>
  c.controles.map((k) =>
    k.type === 'gratification-obligatoire'
      ? t.controles[k.type](heures(k.heures), heures(k.seuil))
      : k.type === 'gratification-insuffisante'
        ? t.controles[k.type](euros(k.montant), euros(k.minimum))
        : t.controles[k.type](heures(k.heures), heures(k.maximum)),
  );

export const TONS_CONTRAT = {
  brouillon: 'neutral',
  signe: 'accent',
  en_cours: 'ok',
  termine: 'neutral',
  rompu: 'bad',
} as const;
export const TONS_CONVENTION = {
  brouillon: 'neutral',
  signee: 'accent',
  en_cours: 'ok',
  terminee: 'neutral',
  annulee: 'bad',
} as const;
