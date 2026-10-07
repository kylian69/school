import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  ContactEntreprise,
  Entreprise,
  ListeEntreprises,
  ListeOpcos,
  ModificationContact,
  ModificationEntreprise,
  NouveauContact,
  NouvelleEntreprise,
  RechercheEntreprises,
  RechercheSiret,
} from '@scolaly/contracts';
import {
  attribution,
  contactEntreprise,
  enregistrerAudit,
  entreprise,
  personne,
  role,
  type Transaction,
} from '@scolaly/db';
import { controlerSiret, normaliserIdcc, opcoPropose } from '@scolaly/domain';
import { idccOpco, opcos, valueAt } from '@scolaly/referentials';
import { and, asc, count, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { Access } from '../../access/access-resolver.js';
import { AnnuaireEntreprises } from '../../shared/annuaire.js';
import { aujourdhui } from '../../shared/dates.js';

type LigneEntreprise = typeof entreprise.$inferSelect;

const invalide = (champ: string, message: string) =>
  new BadRequestException({
    message: 'Données invalides. Corrigez les champs signalés puis réessayez.',
    details: [`${champ} : ${message}`],
  });

const motif = (texte: string) => `%${texte.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Entreprises, contacts et tuteurs (E-03-01, E-03-02 ; US-03-01 ; RG-03-01 à RG-03-03). */
@Injectable()
export class EntreprisesService {
  constructor(private readonly annuaire: AnnuaireEntreprises) {}

  listerOpcos(): ListeOpcos {
    const table = valueAt(opcos, aujourdhui()).valeur;
    return { opcos: Object.entries(table).map(([code, libelle]) => ({ code, libelle })) };
  }

  /** RG-03-01 : recherche par SIRET, dans l'école puis dans l'annuaire public. */
  async rechercherSiret(tx: Transaction, saisie: string): Promise<RechercheSiret> {
    const siret = this.siretValide(saisie);
    const [existante] = await tx
      .select({ id: entreprise.id })
      .from(entreprise)
      .where(and(eq(entreprise.siret, siret), isNull(entreprise.deletedAt)));
    const resultat = await this.annuaire.rechercher(siret);
    if (resultat.etat !== 'trouve') {
      return { siret, existante: existante?.id ?? null, annuaire: resultat.etat, fiche: null };
    }
    const { fiche } = resultat;
    const idcc = fiche.idcc[0] ?? null;
    return {
      siret,
      existante: existante?.id ?? null,
      annuaire: 'trouve',
      fiche: {
        siren: fiche.siren,
        raisonSociale: fiche.raisonSociale,
        adresse: fiche.adresse,
        codePostal: fiche.codePostal,
        ville: fiche.ville,
        naf: fiche.naf,
        effectif: fiche.effectif,
        ferme: fiche.ferme,
        idcc,
        opcoPropose: opcoPropose(idcc, valueAt(idccOpco, aujourdhui()).valeur),
      },
    };
  }

  async lister(
    tx: Transaction,
    access: Access,
    recherche: RechercheEntreprises,
  ): Promise<ListeEntreprises> {
    const conditions: (SQL | undefined)[] = [isNull(entreprise.deletedAt)];
    if (recherche.q) {
      const m = motif(recherche.q);
      conditions.push(
        or(
          ilike(entreprise.raisonSociale, m),
          ilike(entreprise.siret, m),
          ilike(entreprise.ville, m),
        ),
      );
    }
    if (recherche.opco) conditions.push(eq(entreprise.opco, recherche.opco));
    if (recherche.ville) conditions.push(ilike(entreprise.ville, motif(recherche.ville)));
    const lignes = await tx
      .select()
      .from(entreprise)
      .where(and(...conditions))
      .orderBy(asc(entreprise.raisonSociale))
      .limit(500);
    const tuteurs =
      lignes.length === 0
        ? []
        : await tx
            .select({ entrepriseId: contactEntreprise.entrepriseId, nombre: count() })
            .from(contactEntreprise)
            .where(
              and(
                inArray(
                  contactEntreprise.entrepriseId,
                  lignes.map((l) => l.id),
                ),
                eq(contactEntreprise.type, 'tuteur'),
                isNull(contactEntreprise.deletedAt),
              ),
            )
            .groupBy(contactEntreprise.entrepriseId);
    const modifiable = access.permissions.has('entreprises:gerer');
    return {
      entreprises: lignes.map((l) => ({
        ...this.champs(l),
        modifiable,
        tuteurs: tuteurs.find((t) => t.entrepriseId === l.id)?.nombre ?? 0,
      })),
      creation: modifiable,
    };
  }

  async lire(tx: Transaction, access: Access, id: string): Promise<Entreprise> {
    const ligne = await this.charger(tx, id);
    const contacts = await tx
      .select({ contact: contactEntreprise, personne })
      .from(contactEntreprise)
      .innerJoin(personne, eq(personne.id, contactEntreprise.personneId))
      .where(and(eq(contactEntreprise.entrepriseId, id), isNull(contactEntreprise.deletedAt)))
      .orderBy(asc(personne.nom), asc(personne.prenom));
    return {
      ...this.champs(ligne),
      modifiable: access.permissions.has('entreprises:gerer'),
      contacts: contacts.map(({ contact, personne: p }) => this.contact(contact, p)),
    };
  }

  /** US-03-01 : création par SIRET, pré-remplie par l'annuaire ; sinon saisie manuelle « à vérifier ». */
  async creer(
    tx: Transaction,
    access: Access,
    entree: NouvelleEntreprise,
    adresseIp: string,
  ): Promise<Entreprise> {
    const recherche = await this.rechercherSiret(tx, entree.siret);
    if (recherche.existante) {
      throw new ConflictException({
        message:
          'Cette entreprise existe déjà dans l’école : ouvrez sa fiche plutôt que d’en créer une autre.',
        details: [`existante : ${recherche.existante}`],
      });
    }
    const fiche = recherche.fiche;
    const raisonSociale = entree.raisonSociale?.trim() || fiche?.raisonSociale;
    if (!raisonSociale) {
      throw invalide(
        'raisonSociale',
        'L’annuaire des entreprises ne répond pas pour ce SIRET : saisissez la raison sociale.',
      );
    }
    const idcc = entree.idcc !== undefined ? this.idcc(entree.idcc) : (fiche?.idcc ?? null);
    const opco =
      entree.opco !== undefined && entree.opco !== null
        ? this.opco(entree.opco)
        : opcoPropose(idcc, valueAt(idccOpco, aujourdhui()).valeur);
    const [ligne] = await tx
      .insert(entreprise)
      .values({
        organisationId: access.organisationId,
        siret: recherche.siret,
        siren: fiche?.siren ?? recherche.siret.slice(0, 9),
        raisonSociale,
        adresse: entree.adresse ?? fiche?.adresse ?? null,
        codePostal: entree.codePostal ?? fiche?.codePostal ?? null,
        ville: entree.ville ?? fiche?.ville ?? null,
        naf: fiche?.naf ?? null,
        effectif: fiche?.effectif ?? null,
        idcc,
        opco,
        statut: fiche?.ferme ? 'fermee' : 'active',
        aVerifier: !fiche,
        createdBy: access.userId,
      })
      .returning();
    if (!ligne) throw new Error('Création de l’entreprise impossible.');
    const resultat = await this.lire(tx, access, ligne.id);
    await enregistrerAudit(tx, {
      action: 'entreprise.creer',
      objetType: 'entreprise',
      objetId: ligne.id,
      auteurId: access.userId,
      adresseIp,
      apres: this.champs(ligne),
    });
    return resultat;
  }

  async modifier(
    tx: Transaction,
    access: Access,
    id: string,
    changement: ModificationEntreprise,
    adresseIp: string,
  ): Promise<Entreprise> {
    const avant = await this.charger(tx, id);
    const { idcc, opco, ...colonnes } = changement;
    await tx
      .update(entreprise)
      .set({
        ...colonnes,
        ...(idcc !== undefined ? { idcc: this.idcc(idcc) } : {}),
        ...(opco !== undefined ? { opco: opco === null ? null : this.opco(opco) } : {}),
        updatedBy: access.userId,
      })
      .where(eq(entreprise.id, id));
    const apres = await this.lire(tx, access, id);
    await enregistrerAudit(tx, {
      action: 'entreprise.modifier',
      objetType: 'entreprise',
      objetId: id,
      auteurId: access.userId,
      adresseIp,
      avant: this.champs(avant),
      apres: this.champs(await this.charger(tx, id)),
    });
    return apres;
  }

  /**
   * RG-03-03 : contact d'une fiche existante ou nouvelle. Un tuteur reçoit le rôle « tuteur » de
   * l'école (périmètre « soi ») : il pourra être invité depuis sa fiche ou depuis le contrat.
   */
  async ajouterContact(
    tx: Transaction,
    access: Access,
    entrepriseId: string,
    entree: NouveauContact,
    adresseIp: string,
  ): Promise<ContactEntreprise> {
    await this.charger(tx, entrepriseId);
    let personneId = entree.personneId;
    if (!personneId) {
      if (!entree.personne)
        throw invalide(
          'personne',
          'Choisissez une personne existante ou saisissez nom, prénom et email.',
        );
      const email = entree.personne.email.toLowerCase();
      const [homonyme] = await tx
        .select({ id: personne.id })
        .from(personne)
        .where(and(sql`lower(${personne.email}) = ${email}`, isNull(personne.deletedAt)));
      if (homonyme) {
        throw new ConflictException(
          'Une fiche porte déjà cet email dans l’école : choisissez-la dans la recherche.',
        );
      }
      const [creee] = await tx
        .insert(personne)
        .values({
          organisationId: access.organisationId,
          nom: entree.personne.nom,
          prenom: entree.personne.prenom,
          email,
          createdBy: access.userId,
        })
        .returning({ id: personne.id });
      personneId = creee?.id;
    }
    const [fiche] = personneId
      ? await tx
          .select()
          .from(personne)
          .where(and(eq(personne.id, personneId), isNull(personne.deletedAt)))
      : [];
    if (!fiche) throw invalide('personneId', 'Cette personne n’existe pas dans l’école.');
    const [deja] = await tx
      .select({ id: contactEntreprise.id })
      .from(contactEntreprise)
      .where(
        and(
          eq(contactEntreprise.entrepriseId, entrepriseId),
          eq(contactEntreprise.personneId, fiche.id),
          isNull(contactEntreprise.deletedAt),
        ),
      );
    if (deja) throw new ConflictException('Cette personne est déjà un contact de l’entreprise.');
    const [ligne] = await tx
      .insert(contactEntreprise)
      .values({
        organisationId: access.organisationId,
        entrepriseId,
        personneId: fiche.id,
        type: entree.type,
        fonction: entree.fonction,
        dansEntrepriseDepuis: entree.dansEntrepriseDepuis,
        createdBy: access.userId,
      })
      .returning();
    if (!ligne) throw new Error('Ajout du contact impossible.');
    if (entree.type === 'tuteur') await this.donnerRoleTuteur(tx, access, fiche.id);
    const resultat = this.contact(ligne, fiche);
    await enregistrerAudit(tx, {
      action: 'entreprise.contact.ajouter',
      objetType: 'entreprise',
      objetId: entrepriseId,
      auteurId: access.userId,
      adresseIp,
      apres: resultat,
    });
    return resultat;
  }

  async modifierContact(
    tx: Transaction,
    access: Access,
    id: string,
    changement: ModificationContact,
    adresseIp: string,
  ): Promise<ContactEntreprise> {
    const avant = await this.chargerContact(tx, id);
    const [ligne] = await tx
      .update(contactEntreprise)
      .set({ ...changement, updatedBy: access.userId })
      .where(eq(contactEntreprise.id, id))
      .returning();
    if (!ligne) throw new NotFoundException('Contact introuvable.');
    const [fiche] = await tx.select().from(personne).where(eq(personne.id, ligne.personneId));
    if (!fiche) throw new NotFoundException('Contact introuvable.');
    if (ligne.type === 'tuteur') await this.donnerRoleTuteur(tx, access, fiche.id);
    const resultat = this.contact(ligne, fiche);
    await enregistrerAudit(tx, {
      action: 'entreprise.contact.modifier',
      objetType: 'entreprise',
      objetId: ligne.entrepriseId,
      auteurId: access.userId,
      adresseIp,
      avant,
      apres: resultat,
    });
    return resultat;
  }

  async retirerContact(
    tx: Transaction,
    access: Access,
    id: string,
    adresseIp: string,
  ): Promise<void> {
    const avant = await this.chargerContact(tx, id);
    await tx
      .update(contactEntreprise)
      .set({ deletedAt: new Date(), updatedBy: access.userId })
      .where(eq(contactEntreprise.id, id));
    await enregistrerAudit(tx, {
      action: 'entreprise.contact.retirer',
      objetType: 'entreprise',
      objetId: avant.entrepriseId,
      auteurId: access.userId,
      adresseIp,
      avant,
    });
  }

  async charger(tx: Transaction, id: string): Promise<LigneEntreprise> {
    const [ligne] = await tx
      .select()
      .from(entreprise)
      .where(and(eq(entreprise.id, id), isNull(entreprise.deletedAt)));
    if (!ligne) throw new NotFoundException('Entreprise introuvable.');
    return ligne;
  }

  /** Tuteurs d'une entreprise (contacts de type tuteur). */
  async tuteurs(tx: Transaction, entrepriseId: string): Promise<string[]> {
    const lignes = await tx
      .select({ id: contactEntreprise.personneId })
      .from(contactEntreprise)
      .where(
        and(
          eq(contactEntreprise.entrepriseId, entrepriseId),
          eq(contactEntreprise.type, 'tuteur'),
          isNull(contactEntreprise.deletedAt),
        ),
      );
    return lignes.map((l) => l.id);
  }

  private async chargerContact(tx: Transaction, id: string) {
    const [ligne] = await tx
      .select()
      .from(contactEntreprise)
      .where(and(eq(contactEntreprise.id, id), isNull(contactEntreprise.deletedAt)));
    if (!ligne) throw new NotFoundException('Contact introuvable.');
    return ligne;
  }

  /** Rôle « tuteur » de l'école (périmètre « soi »), s'il ne l'a pas déjà. */
  private async donnerRoleTuteur(tx: Transaction, access: Access, personneId: string) {
    const [tuteur] = await tx
      .select({ id: role.id })
      .from(role)
      .where(and(eq(role.code, 'tuteur'), isNull(role.deletedAt)));
    if (!tuteur) return;
    const existantes = await tx
      .select({ id: attribution.id })
      .from(attribution)
      .where(
        and(
          eq(attribution.personneId, personneId),
          inArray(attribution.roleId, [tuteur.id]),
          isNull(attribution.deletedAt),
          isNull(attribution.fin),
        ),
      );
    if (existantes.length > 0) return;
    await tx.insert(attribution).values({
      organisationId: access.organisationId,
      personneId,
      roleId: tuteur.id,
      perimetreType: 'soi',
      debut: aujourdhui(),
      createdBy: access.userId,
    });
  }

  private siretValide(saisie: string) {
    const siret = saisie.replace(/\s+/g, '');
    const controle = controlerSiret(siret);
    if (controle !== 'valide') {
      throw invalide(
        'siret',
        controle === 'format'
          ? 'Le SIRET compte 14 chiffres.'
          : 'Ce SIRET est invalide : vérifiez sa saisie (clé de contrôle).',
      );
    }
    return siret;
  }

  private idcc(saisie: string | null) {
    if (saisie === null || saisie.trim() === '') return null;
    const idcc = normaliserIdcc(saisie);
    if (!idcc) throw invalide('idcc', 'L’IDCC compte 4 chiffres au plus (par exemple 1486).');
    return idcc;
  }

  private opco(code: string) {
    if (!Object.hasOwn(valueAt(opcos, aujourdhui()).valeur, code)) {
      throw invalide('opco', 'Choisissez un OPCO de la liste.');
    }
    return code;
  }

  private champs(l: LigneEntreprise) {
    return {
      id: l.id,
      siret: l.siret,
      siren: l.siren,
      raisonSociale: l.raisonSociale,
      adresse: l.adresse,
      codePostal: l.codePostal,
      ville: l.ville,
      naf: l.naf,
      effectif: l.effectif,
      idcc: l.idcc,
      opco: l.opco,
      statut: l.statut,
      aVerifier: l.aVerifier,
    };
  }

  private contact(
    c: typeof contactEntreprise.$inferSelect,
    p: typeof personne.$inferSelect,
  ): ContactEntreprise {
    return {
      id: c.id,
      personne: {
        id: p.id,
        nom: p.nomUsage ?? p.nom,
        prenom: p.prenom,
        email: p.email,
        compteEtat: p.compteEtat,
      },
      type: c.type,
      fonction: c.fonction,
      dansEntrepriseDepuis: c.dansEntrepriseDepuis,
    };
  }
}
