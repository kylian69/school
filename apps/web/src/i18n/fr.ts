/**
 * Textes de l'interface, en français (conventions : textes externalisés pour une traduction
 * future). Les erreurs expliquent ce qui s'est passé et la marche à suivre.
 */
export const fr = {
  app: {
    nom: 'Scolaly',
    description: "Gestion d'établissement d'enseignement supérieur",
  },
  coquille: {
    navigation: 'Navigation principale',
    rechercher: 'Rechercher…',
    rechercherRaccourci: 'Rechercher (⌘K ou Ctrl+K)',
    palette: {
      titre: 'Recherche globale',
      placeholder: 'Rechercher une personne, une formation, une séance…',
      vide: 'Aucun résultat. La recherche portera bientôt sur les personnes, les formations et les séances.',
    },
    menu: 'Ouvrir le menu',
    compte: 'Mon compte',
    theme: { titre: 'Thème', clair: 'Clair', sombre: 'Sombre', systeme: 'Système' },
    deconnexion: 'Se déconnecter',
    entrees: { tableauDeBord: 'Tableau de bord' },
  },
  accueil: {
    titre: 'Tableau de bord',
    bonjour: (prenom: string) => `Bonjour ${prenom}.`,
    pret: 'Votre espace Scolaly est prêt.',
    suite:
      'Les modules de votre établissement apparaîtront ici au fur et à mesure de leur activation : structure de l’école, personnes, emplois du temps, émargement, notes.',
  },
  horsLigne: {
    titre: 'Hors ligne',
    message: 'Vous êtes hors ligne. Cette page sera de nouveau disponible dès le retour du réseau.',
    reessayer: 'Réessayer',
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
