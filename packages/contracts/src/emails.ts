import type { EmailJob } from './jobs.js';

const formatDate = (date: Date) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short' }).format(date);

/** Email d'invitation (RG-01-08), partagé par l'API (envoi) et le worker (relances). */
export function emailInvitation(options: {
  to: string;
  prenom: string;
  ecole: string;
  lien: string;
  expireLe: Date;
  relance?: number;
}): EmailJob {
  const rappel = options.relance ? 'Rappel : ' : '';
  return {
    to: options.to,
    subject: `${rappel}Activez votre compte Scolaly · ${options.ecole}`,
    text: [
      `Bonjour ${options.prenom},`,
      '',
      `${options.ecole} vous invite à utiliser Scolaly : emploi du temps, émargement, notes et documents.`,
      '',
      `Activez votre compte avant le ${formatDate(options.expireLe)} :`,
      options.lien,
      '',
      'Ce lien est personnel et ne sert qu’une fois. Si vous n’attendiez pas cet email, ignorez-le.',
    ].join('\n'),
  };
}

/** Email de connexion par lien magique (US-01-08, RG-01-10 : 15 minutes, usage unique). */
export function emailLienMagique(options: { to: string; lien: string }): EmailJob {
  return {
    to: options.to,
    subject: 'Votre lien de connexion à Scolaly',
    text: [
      'Bonjour,',
      '',
      'Voici votre lien de connexion à Scolaly. Il est valable 15 minutes et ne sert qu’une fois :',
      options.lien,
      '',
      'Si vous n’avez pas demandé ce lien, ignorez cet email : votre compte reste protégé.',
    ].join('\n'),
  };
}
