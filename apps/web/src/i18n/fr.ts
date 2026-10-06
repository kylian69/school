/**
 * Textes de l'interface, en français (conventions : textes externalisés pour une traduction
 * future). Les erreurs expliquent ce qui s'est passé et la marche à suivre.
 */
export const fr = {
  app: {
    nom: 'Scolaly',
    description: "Gestion d'établissement d'enseignement supérieur",
  },
  connexion: {
    titre: 'Connexion',
    sousTitre: 'Accédez à votre espace Scolaly.',
    email: 'Adresse email',
    motDePasse: 'Mot de passe',
    valider: 'Se connecter',
    enCours: 'Connexion…',
    erreurs: {
      identifiants:
        'Email ou mot de passe incorrect. Vérifiez votre saisie ; en cas d’oubli, contactez votre établissement.',
      tropDeTentatives: 'Trop de tentatives. Patientez une minute avant de réessayer.',
      reseau: 'Le service est injoignable. Vérifiez votre connexion internet puis réessayez.',
      inattendue: 'Une erreur inattendue est survenue. Réessayez dans quelques instants.',
    },
  },
} as const;
