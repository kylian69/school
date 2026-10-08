import type { EmailJob } from './jobs.js';

const formatDate = (date: Date) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short' }).format(date);

/** Couleur de Scolaly, quand l'école n'en a pas choisi (jeton --accent du thème clair). */
const COULEUR_SCOLALY = '#4F46E5';
const HEX = /^#[0-9A-Fa-f]{6}$/;

/** Adresse du logo public d'une école, versionnée par son empreinte (US-01-14). */
export const cheminLogo = (organisationId: string, empreinte: string) =>
  `/api/ecoles/${organisationId}/logo?v=${empreinte.slice(0, 16)}`;

/** Apparence de l'école reprise dans ses emails (US-01-14, RG-01-24). */
export interface MarqueEcole {
  nom: string;
  /** Couleur principale #RRGGBB, déjà contrôlée ; null : couleur de Scolaly. */
  couleur: string | null;
  /** Adresse absolue du logo ; null sans logo. */
  logoUrl: string | null;
}

const echapper = (texte: string) =>
  texte
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

/**
 * Mise en page HTML d'un email : en-tête aux couleurs de l'école, paragraphes, bouton d'action.
 * Tableaux et styles en ligne, seuls compris par tous les clients de messagerie. Toute valeur
 * est échappée ; la couleur n'est reprise que si elle a la forme #RRGGBB.
 */
export function miseEnPageEmail(options: {
  marque: MarqueEcole | null;
  paragraphes: readonly string[];
  bouton: { libelle: string; lien: string };
  mention: string;
}): string {
  const couleur =
    options.marque?.couleur && HEX.test(options.marque.couleur)
      ? options.marque.couleur
      : COULEUR_SCOLALY;
  const nom = echapper(options.marque?.nom ?? 'Scolaly');
  const logo = options.marque?.logoUrl
    ? `<img src="${echapper(options.marque.logoUrl)}" alt="" width="32" height="32" style="vertical-align:middle;margin-right:10px;background:#ffffff;border-radius:6px">`
    : '';
  return [
    '<!doctype html><html lang="fr"><body style="margin:0;padding:24px;background:#F6F7F9;font-family:Arial,Helvetica,sans-serif;color:#0E1022">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #E3E5EC;border-radius:12px;overflow:hidden">',
    `<tr><td style="background:${couleur};color:#ffffff;padding:16px 24px;font-size:16px;font-weight:bold">${logo}${nom}</td></tr>`,
    '<tr><td style="padding:24px;font-size:15px;line-height:1.5">',
    ...options.paragraphes.map((p) => `<p style="margin:0 0 16px">${echapper(p)}</p>`),
    `<p style="margin:24px 0"><a href="${echapper(options.bouton.lien)}" style="display:inline-block;background:${couleur};color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px">${echapper(options.bouton.libelle)}</a></p>`,
    `<p style="margin:0;font-size:13px;color:#545870">${echapper(options.mention)}</p>`,
    '</td></tr></table></body></html>',
  ].join('');
}

/** Email d'invitation (RG-01-08), partagé par l'API (envoi) et le worker (relances). */
export function emailInvitation(options: {
  to: string;
  prenom: string;
  ecole: string;
  lien: string;
  expireLe: Date;
  relance?: number;
  /** Apparence de l'école (US-01-14) ; à défaut, celle de Scolaly. */
  marque?: MarqueEcole | null;
}): EmailJob {
  const rappel = options.relance ? 'Rappel : ' : '';
  const salutation = `Bonjour ${options.prenom},`;
  const presentation = `${options.ecole} vous invite à utiliser Scolaly : emploi du temps, émargement, notes et documents.`;
  const echeance = `Activez votre compte avant le ${formatDate(options.expireLe)} :`;
  const mention =
    'Ce lien est personnel et ne sert qu’une fois. Si vous n’attendiez pas cet email, ignorez-le.';
  return {
    to: options.to,
    subject: `${rappel}Activez votre compte Scolaly · ${options.ecole}`,
    text: [salutation, '', presentation, '', echeance, options.lien, '', mention].join('\n'),
    html: miseEnPageEmail({
      marque: options.marque ?? null,
      paragraphes: [salutation, presentation, echeance],
      bouton: { libelle: 'Activer mon compte', lien: options.lien },
      mention,
    }),
  };
}

/** Email de connexion par lien magique (US-01-08, RG-01-10 : 15 minutes, usage unique). */
export function emailLienMagique(options: { to: string; lien: string }): EmailJob {
  const presentation =
    'Voici votre lien de connexion à Scolaly. Il est valable 15 minutes et ne sert qu’une fois :';
  const mention =
    'Si vous n’avez pas demandé ce lien, ignorez cet email : votre compte reste protégé.';
  return {
    to: options.to,
    subject: 'Votre lien de connexion à Scolaly',
    text: ['Bonjour,', '', presentation, options.lien, '', mention].join('\n'),
    // Compte commun aux écoles d'un groupe (RG-00-26) : l'email porte l'apparence de Scolaly.
    html: miseEnPageEmail({
      marque: null,
      paragraphes: ['Bonjour,', presentation],
      bouton: { libelle: 'Me connecter', lien: options.lien },
      mention,
    }),
  };
}

/** Lien vers un export de personnes préparé (RG-01-21 : valable 24 h). */
export function emailExportPret(options: {
  to: string;
  ecole: string;
  lien: string;
  total: number;
}): EmailJob {
  const presentation = `Votre export de ${String(options.total)} personnes de ${options.ecole} est prêt. Le lien est valable 24 heures :`;
  const mention =
    'Ce fichier contient des données personnelles : ne le transférez qu’aux personnes habilitées.';
  return {
    to: options.to,
    subject: `Votre export est prêt · ${options.ecole}`,
    text: ['Bonjour,', '', presentation, options.lien, '', mention].join('\n'),
    html: miseEnPageEmail({
      marque: null,
      paragraphes: ['Bonjour,', presentation],
      bouton: { libelle: 'Télécharger l’export', lien: options.lien },
      mention,
    }),
  };
}

/** Photo refusée par la scolarité (RG-01-26), avec le motif, pour en déposer une autre. */
export function emailPhotoRefusee(options: {
  to: string;
  prenom: string;
  ecole: string;
  motif: string;
  lien: string;
}): EmailJob {
  const presentation = `${options.ecole} n’a pas retenu la photo que vous avez déposée. Motif : ${options.motif}`;
  const suite = 'Vous pouvez en déposer une autre depuis votre compte.';
  const mention = 'Votre photo n’est visible que par l’équipe pédagogique et administrative.';
  return {
    to: options.to,
    subject: `Votre photo n’a pas été retenue · ${options.ecole}`,
    text: [
      `Bonjour ${options.prenom},`,
      '',
      presentation,
      '',
      suite,
      options.lien,
      '',
      mention,
    ].join('\n'),
    html: miseEnPageEmail({
      marque: null,
      paragraphes: [`Bonjour ${options.prenom},`, presentation, suite],
      bouton: { libelle: 'Déposer une autre photo', lien: options.lien },
      mention,
    }),
  };
}

/** Changement d'une séance annoncé à une personne (RG-04-14). */
export interface ChangementEdtAnnonce {
  nature: 'publication' | 'modification' | 'annulation' | 'report' | 'retrait';
  libelle: string;
  debut: Date;
  fin: Date;
  /** Fuseau de l'établissement, pour l'affichage. */
  fuseau: string;
  salle: string | null;
  /** Nouveau créneau d'une séance reportée. */
  reporteeVers: { debut: Date; fin: Date } | null;
}

const NATURES_EDT: Record<ChangementEdtAnnonce['nature'], string> = {
  publication: 'Nouvelle séance',
  modification: 'Séance modifiée',
  annulation: 'Séance annulée',
  report: 'Séance reportée',
  retrait: 'Vous n’intervenez plus sur cette séance',
};

/** « mardi 03/11/2026, 08:00 – 10:00 », dans le fuseau de l'établissement. */
export function creneauEnClair(debut: Date, fin: Date, fuseau: string): string {
  const jour = new Intl.DateTimeFormat('fr-FR', {
    timeZone: fuseau,
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(debut);
  const heure = new Intl.DateTimeFormat('fr-FR', {
    timeZone: fuseau,
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${jour}, ${heure.format(debut)} – ${heure.format(fin)}`;
}

/**
 * RG-04-14 : changements de l'emploi du temps d'une personne, regroupés en un seul email
 * (immédiat dans les 48 h, sinon récapitulatif quotidien). Le motif d'une annulation et les noms
 * des personnes n'y figurent pas (minimisation) : le détail est dans Scolaly.
 */
export function emailChangementsEdt(options: {
  to: string;
  prenom: string;
  ecole: string;
  lien: string;
  recapitulatif: boolean;
  changements: readonly ChangementEdtAnnonce[];
  marque?: MarqueEcole | null;
}): EmailJob {
  const lignes = options.changements.map((c) => {
    const morceaux = [NATURES_EDT[c.nature], c.libelle, creneauEnClair(c.debut, c.fin, c.fuseau)];
    if (c.reporteeVers)
      morceaux.push(
        `reportée au ${creneauEnClair(c.reporteeVers.debut, c.reporteeVers.fin, c.fuseau)}`,
      );
    else if (c.salle && c.nature !== 'annulation' && c.nature !== 'retrait')
      morceaux.push(`salle ${c.salle}`);
    return morceaux.join(' · ');
  });
  const salutation = `Bonjour ${options.prenom},`;
  const presentation = options.recapitulatif
    ? `Voici les changements de votre emploi du temps à ${options.ecole} depuis le dernier récapitulatif :`
    : `Votre emploi du temps à ${options.ecole} change dans les 48 prochaines heures :`;
  const mention =
    'Vous recevez cet email parce que ces séances vous concernent. Le détail est dans Scolaly.';
  return {
    to: options.to,
    subject: options.recapitulatif
      ? `Récapitulatif des changements de votre emploi du temps · ${options.ecole}`
      : `Changement de votre emploi du temps · ${options.ecole}`,
    text: [
      salutation,
      '',
      presentation,
      ...lignes.map((l) => `- ${l}`),
      '',
      options.lien,
      '',
      mention,
    ].join('\n'),
    html: miseEnPageEmail({
      marque: options.marque ?? null,
      paragraphes: [salutation, presentation, ...lignes],
      bouton: { libelle: 'Ouvrir Scolaly', lien: options.lien },
      mention,
    }),
  };
}
