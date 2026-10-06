import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  DoublonPersonne,
  ListePersonnes,
  ModificationPersonne,
  NouvellePersonne,
  PersonneDetail,
  RecherchePersonnes,
} from '@scolaly/contracts';
import { attribution, enregistrerAudit, personne, role, type Transaction } from '@scolaly/db';
import {
  controlerIne,
  dateNaissancePlausible,
  verifierSuppressionPersonne,
  ecrireCsv,
  motifsDoublon,
  normaliserIdentifiant,
} from '@scolaly/domain';
import {
  and,
  asc,
  count,
  eq,
  exists,
  gt,
  ilike,
  inArray,
  isNull,
  lte,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { Access } from '../../access/access-resolver.js';
import { aujourdhui } from '../../shared/dates.js';
import { attribuerMatricule } from '../../shared/matricule.js';

type LignePersonne = typeof personne.$inferSelect;

/** Champs d'identité tracés et comparés (avant et après, RG-00-12). */
const CHAMPS = [
  'civilite',
  'nom',
  'nomUsage',
  'prenom',
  'email',
  'telephone',
  'adresseLigne1',
  'codePostal',
  'ville',
  'dateNaissance',
  'lieuNaissance',
  'ine',
] as const;

const invalide = (champ: string, message: string) =>
  new BadRequestException({
    message: 'Données invalides. Corrigez les champs signalés puis réessayez.',
    details: [`${champ} : ${message}`],
  });

/** INE normalisé et contrôlé (RG-01-06) ; undefined reste undefined (champ non modifié). */
function ine(saisie: string | null | undefined): string | null | undefined {
  if (saisie === undefined) return undefined;
  const valeur = normaliserIdentifiant(saisie);
  if (valeur !== null && controlerIne(valeur) !== 'valide') {
    throw invalide(
      'ine',
      'L’INE compte 11 caractères, chiffres et lettres, terminés par une lettre.',
    );
  }
  return valeur;
}

/** La date et le lieu de naissance ne sont montrés qu'à la scolarité et à l'administration. */
const voitNaissance = (access: Access) =>
  access.permissions.has('apprenants:inviter') || access.permissions.has('personnel:inviter');

/** Attribution en cours à une date (fin exclue). */
const attributionEnCours = (date: string) =>
  and(
    isNull(attribution.deletedAt),
    lte(attribution.debut, date),
    or(isNull(attribution.fin), gt(attribution.fin, date)),
  );

/** Export limité à la taille d'une école (module 01, section 9 : 20 000 personnes). */
const EXPORT_MAX = 20_000;

const ETATS_COMPTE_LIBELLES = {
  cree: 'Créé',
  invite: 'Invité',
  actif: 'Actif',
  desactive: 'Désactivé',
} as const;

const motif = (texte: string) => `%${texte.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Fiches des personnes de l'école (E-01-04, E-01-05 ; RG-01-06, RG-01-07). */
@Injectable()
export class PersonnesService {
  /**
   * Périmètre de lecture (RG-00-10) : toute l'école avec un périmètre « organisation ». Les
   * périmètres établissement, formation et promotion s'appuieront sur les inscriptions (I3.2) ;
   * d'ici là, ils ne donnent accès qu'à sa propre fiche.
   */
  private perimetre(access: Access): SQL | undefined {
    const perimetres = access.perimetres.get('personnes:lire') ?? [];
    return perimetres.some((p) => p.type === 'organisation')
      ? undefined
      : eq(personne.id, access.personneId);
  }

  /** Filtre de la liste : périmètre, recherche, état du compte, rôle en cours. */
  private filtre(
    tx: Transaction,
    access: Access,
    recherche: Pick<RecherchePersonnes, 'q' | 'etat' | 'role'>,
  ): SQL | undefined {
    const date = aujourdhui();
    const conditions: (SQL | undefined)[] = [isNull(personne.deletedAt), this.perimetre(access)];
    if (recherche.q) {
      const m = motif(recherche.q);
      conditions.push(
        or(
          ilike(personne.nom, m),
          ilike(personne.nomUsage, m),
          ilike(personne.prenom, m),
          ilike(personne.email, m),
        ),
      );
    }
    if (recherche.etat) conditions.push(eq(personne.compteEtat, recherche.etat));
    if (recherche.role) {
      conditions.push(
        exists(
          tx
            .select({ un: sql`1` })
            .from(attribution)
            .where(
              and(
                eq(attribution.personneId, personne.id),
                eq(attribution.roleId, recherche.role),
                attributionEnCours(date),
              ),
            ),
        ),
      );
    }
    return and(...conditions);
  }

  async lister(
    tx: Transaction,
    access: Access,
    recherche: RecherchePersonnes,
  ): Promise<ListePersonnes> {
    const filtre = this.filtre(tx, access, recherche);
    const [{ total } = { total: 0 }] = await tx
      .select({ total: count() })
      .from(personne)
      .where(filtre);
    const lignes = await tx
      .select()
      .from(personne)
      .where(filtre)
      .orderBy(asc(sql`lower(${personne.nom})`), asc(sql`lower(${personne.prenom})`))
      .limit(recherche.parPage)
      .offset((recherche.page - 1) * recherche.parPage);
    const roles = await this.rolesDe(
      tx,
      lignes.map((l) => l.id),
    );
    return {
      personnes: lignes.map((l) => ({
        id: l.id,
        nom: l.nom,
        nomUsage: l.nomUsage,
        prenom: l.prenom,
        email: l.email,
        compteEtat: l.compteEtat,
        roles: roles.get(l.id) ?? [],
      })),
      total,
      page: recherche.page,
      parPage: recherche.parPage,
    };
  }

  /**
   * RG-01-21 : export des personnes du périmètre, selon les filtres de la liste. La date et le
   * lieu de naissance n'y figurent que pour la scolarité et l'administration.
   */
  async exporter(
    tx: Transaction,
    access: Access,
    recherche: Pick<RecherchePersonnes, 'q' | 'etat' | 'role'>,
  ): Promise<{ total: number; contenu: string }> {
    const lignes = await tx
      .select()
      .from(personne)
      .where(this.filtre(tx, access, recherche))
      .orderBy(asc(sql`lower(${personne.nom})`), asc(sql`lower(${personne.prenom})`))
      .limit(EXPORT_MAX);
    const roles = await this.rolesDe(
      tx,
      lignes.map((l) => l.id),
    );
    const naissance = voitNaissance(access);
    const colonnes = [
      'Matricule',
      'Civilité',
      'Nom',
      'Nom d’usage',
      'Prénom',
      'Email',
      'Téléphone',
      'Adresse',
      'Code postal',
      'Ville',
      ...(naissance ? ['Date de naissance', 'Lieu de naissance'] : []),
      'INE',
      'Compte',
      'Rôles',
    ];
    const valeurs = lignes.map((p) => [
      p.matricule ?? '',
      p.civilite === 'madame' ? 'Madame' : p.civilite === 'monsieur' ? 'Monsieur' : '',
      p.nom,
      p.nomUsage ?? '',
      p.prenom,
      p.email,
      p.telephone ?? '',
      p.adresseLigne1 ?? '',
      p.codePostal ?? '',
      p.ville ?? '',
      ...(naissance
        ? [
            p.dateNaissance ? p.dateNaissance.split('-').reverse().join('/') : '',
            p.lieuNaissance ?? '',
          ]
        : []),
      p.ine ?? '',
      ETATS_COMPTE_LIBELLES[p.compteEtat],
      (roles.get(p.id) ?? []).join(', '),
    ]);
    return { total: lignes.length, contenu: ecrireCsv(colonnes, valeurs) };
  }

  async lire(tx: Transaction, access: Access, id: string): Promise<PersonneDetail> {
    return this.detail(tx, access, await this.charger(tx, access, id));
  }

  async creer(
    tx: Transaction,
    access: Access,
    entree: NouvellePersonne,
    adresseIp: string,
  ): Promise<PersonneDetail> {
    this.verifierNaissance(entree.dateNaissance);
    const ineSaisi = ine(entree.ine) ?? null;
    const doublons = await this.doublons(tx, {
      nom: entree.nom,
      prenom: entree.prenom,
      email: entree.email,
      dateNaissance: entree.dateNaissance ?? null,
      ine: ineSaisi,
    });
    // Un email identifie la personne (RG-01-06) : ce doublon-là ne peut pas être ignoré.
    if (
      doublons.some((d) => d.motifs.includes('email') || d.motifs.includes('ine')) ||
      (doublons.length > 0 && !entree.ignorerDoublons)
    ) {
      throw new ConflictException({
        message: doublons.some((d) => d.motifs.includes('email') || d.motifs.includes('ine'))
          ? 'Une fiche porte déjà cet email ou cet INE dans l’école. Ouvrez-la plutôt que d’en créer une seconde.'
          : 'Une fiche de même nom, prénom et date de naissance existe déjà. Vérifiez qu’il ne s’agit pas de la même personne, puis confirmez la création si besoin.',
        doublons,
      });
    }
    const valeurs = Object.fromEntries(
      CHAMPS.map((c) => [c, entree[c] === '' ? null : (entree[c] ?? null)]),
    ) as Pick<LignePersonne, (typeof CHAMPS)[number]>;
    const matricule = entree.matricule
      ? await this.matriculeLibre(tx, entree.matricule)
      : await attribuerMatricule(tx, access.organisationId);
    const [creee] = await tx
      .insert(personne)
      .values({
        ...valeurs,
        ine: ineSaisi,
        matricule,
        email: entree.email.trim(),
        organisationId: access.organisationId,
        createdBy: access.userId,
      })
      .returning();
    if (!creee) throw new Error('Création de la fiche impossible.');
    await enregistrerAudit(tx, {
      action: 'personne.creer',
      objetType: 'personne',
      objetId: creee.id,
      auteurId: access.userId,
      adresseIp,
      apres: this.trace(creee),
    });
    return this.detail(tx, access, creee);
  }

  async modifier(
    tx: Transaction,
    access: Access,
    id: string,
    changement: ModificationPersonne,
    adresseIp: string,
  ): Promise<PersonneDetail> {
    const avant = await this.charger(tx, access, id);
    // Deux personnes modifient la même fiche : la seconde sauvegarde est refusée (section 7).
    if (changement.version !== avant.updatedAt.toISOString()) {
      throw new ConflictException({
        message:
          'Cette fiche vient d’être modifiée par quelqu’un d’autre. Vos changements n’ont pas été enregistrés : comparez avec la version actuelle, puis recommencez.',
        actuelle: await this.detail(tx, access, avant),
      });
    }
    this.verifierNaissance(changement.dateNaissance);
    const ineModifie = ine(changement.ine);
    if (ineModifie && ineModifie !== avant.ine) {
      const [autre] = await tx
        .select({ id: personne.id })
        .from(personne)
        .where(and(eq(personne.ine, ineModifie), isNull(personne.deletedAt), ne(personne.id, id)));
      if (autre) throw invalide('ine', 'Une autre fiche de l’école porte déjà cet INE.');
    }
    if (changement.email && changement.email.toLowerCase() !== avant.email.toLowerCase()) {
      const [autre] = await tx
        .select({ id: personne.id })
        .from(personne)
        .where(
          and(
            sql`lower(${personne.email}) = lower(${changement.email})`,
            isNull(personne.deletedAt),
            ne(personne.id, id),
          ),
        );
      if (autre) throw invalide('email', 'Une autre fiche de l’école porte déjà cet email.');
    }
    const valeurs = Object.fromEntries(
      CHAMPS.filter((c) => changement[c] !== undefined).map((c) => [
        c,
        changement[c] === '' ? null : changement[c],
      ]),
    );
    const [apres] = await tx
      .update(personne)
      .set({
        ...valeurs,
        ...(ineModifie !== undefined ? { ine: ineModifie } : {}),
        updatedBy: access.userId,
      })
      .where(eq(personne.id, id))
      .returning();
    if (!apres) throw new NotFoundException('Personne introuvable dans cette école.');
    await enregistrerAudit(tx, {
      action: 'personne.modifier',
      objetType: 'personne',
      objetId: id,
      auteurId: access.userId,
      adresseIp,
      avant: this.trace(avant),
      apres: this.trace(apres),
    });
    return this.detail(tx, access, apres);
  }

  /**
   * Suppression d'une fiche (US-01-16) : elle part à la corbeille avec ses rôles, supprimés au
   * même instant pour être restaurés avec elle (RG-01-23). Une fiche dont le compte a été activé
   * se désactive plutôt (module 01, section 7).
   */
  async supprimer(tx: Transaction, access: Access, id: string, adresseIp: string): Promise<void> {
    const fiche = await this.charger(tx, access, id);
    if (!verifierSuppressionPersonne(fiche.compteEtat).ok) {
      throw new ConflictException(
        'Cette personne a activé son compte : sa fiche porte un historique. Désactivez son compte plutôt que de supprimer la fiche.',
      );
    }
    const suppression = { deletedAt: new Date(), updatedBy: access.userId };
    await tx
      .update(attribution)
      .set(suppression)
      .where(and(eq(attribution.personneId, id), isNull(attribution.deletedAt)));
    await tx.update(personne).set(suppression).where(eq(personne.id, id));
    await enregistrerAudit(tx, {
      action: 'personne.supprimer',
      objetType: 'personne',
      objetId: id,
      auteurId: access.userId,
      adresseIp,
      avant: this.trace(fiche),
    });
  }

  /** RG-01-07 : fiches de même email, ou de même nom, prénom et date de naissance. */
  private async doublons(
    tx: Transaction,
    candidat: {
      nom: string;
      prenom: string;
      email: string;
      dateNaissance: string | null;
      ine: string | null;
    },
  ): Promise<DoublonPersonne[]> {
    const proches = await tx
      .select()
      .from(personne)
      .where(
        and(
          isNull(personne.deletedAt),
          or(
            sql`lower(${personne.email}) = lower(${candidat.email.trim()})`,
            candidat.dateNaissance ? eq(personne.dateNaissance, candidat.dateNaissance) : undefined,
            candidat.ine ? eq(personne.ine, candidat.ine) : undefined,
          ),
        ),
      );
    return proches.flatMap((p) => {
      const motifs = motifsDoublon(candidat, p);
      return motifs.length > 0
        ? [{ id: p.id, nom: p.nom, prenom: p.prenom, email: p.email, motifs }]
        : [];
    });
  }

  /** Matricule repris d'un autre logiciel : jamais celui d'une autre fiche, même supprimée. */
  private async matriculeLibre(tx: Transaction, matricule: string): Promise<string> {
    const [pris] = await tx
      .select({ id: personne.id })
      .from(personne)
      .where(eq(personne.matricule, matricule));
    if (pris) throw invalide('matricule', 'Ce matricule est déjà attribué dans l’école.');
    return matricule;
  }

  private verifierNaissance(dateNaissance: string | null | undefined) {
    if (dateNaissance && !dateNaissancePlausible(dateNaissance, aujourdhui())) {
      throw invalide(
        'dateNaissance',
        'Date de naissance improbable : vérifiez l’année (ni future, ni avant 1900).',
      );
    }
  }

  private async charger(tx: Transaction, access: Access, id: string): Promise<LignePersonne> {
    const [ligne] = await tx
      .select()
      .from(personne)
      .where(and(eq(personne.id, id), isNull(personne.deletedAt), this.perimetre(access)));
    if (!ligne) throw new NotFoundException('Personne introuvable dans cette école.');
    return ligne;
  }

  private async rolesDe(tx: Transaction, ids: readonly string[]): Promise<Map<string, string[]>> {
    const resultat = new Map<string, string[]>();
    if (ids.length === 0) return resultat;
    const lignes = await tx
      .select({ personneId: attribution.personneId, libelle: role.libelle })
      .from(attribution)
      .innerJoin(role, eq(role.id, attribution.roleId))
      .where(and(inArray(attribution.personneId, [...ids]), attributionEnCours(aujourdhui())))
      .orderBy(asc(role.libelle));
    for (const { personneId, libelle } of lignes) {
      const liste = resultat.get(personneId) ?? [];
      if (!liste.includes(libelle)) liste.push(libelle);
      resultat.set(personneId, liste);
    }
    return resultat;
  }

  private async detail(tx: Transaction, access: Access, p: LignePersonne): Promise<PersonneDetail> {
    const naissanceVisible = voitNaissance(access);
    return {
      id: p.id,
      civilite: p.civilite,
      nom: p.nom,
      nomUsage: p.nomUsage,
      prenom: p.prenom,
      email: p.email,
      telephone: p.telephone,
      adresseLigne1: p.adresseLigne1,
      codePostal: p.codePostal,
      ville: p.ville,
      dateNaissance: naissanceVisible ? p.dateNaissance : null,
      lieuNaissance: naissanceVisible ? p.lieuNaissance : null,
      naissanceVisible,
      matricule: p.matricule,
      ine: p.ine,
      compteEtat: p.compteEtat,
      roles: (await this.rolesDe(tx, [p.id])).get(p.id) ?? [],
      version: p.updatedAt.toISOString(),
    };
  }

  private trace(p: LignePersonne) {
    return Object.fromEntries(CHAMPS.map((c) => [c, p[c]]));
  }
}
