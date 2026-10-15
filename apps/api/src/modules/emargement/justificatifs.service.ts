import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  EVENEMENT_DECISION_JUSTIFICATIF,
  JUSTIFICATIF_TAILLE_MAX,
  LIMITE_FILE_JUSTIFICATIFS,
  type ChargeDecisionJustificatif,
  type DecisionJustificatif,
  type FileJustificatifs,
  type FiltreJustificatifs,
  type Justificatif,
  type JustificatifATraiter,
  type LienDocument,
  type NouveauJustificatif,
  type Permission,
} from '@scolaly/contracts';
import {
  absence,
  ajouterEvenement,
  contexteChiffrement,
  enregistrerAudit,
  inscription,
  justificatif,
  justificatifAbsence,
  newId,
  organisation,
  personne,
  promotion,
  seance,
  type FieldEncryption,
  type Transaction,
} from '@scolaly/db';
import {
  absenceJustifiable,
  deciderJustificatif,
  depotHorsDelai,
  documentModifiable,
  JUSTIFICATIF_DELAI_HEURES,
  statutAbsenceApres,
  type StatutJustificatif,
} from '@scolaly/domain';
import { and, asc, desc, eq, exists, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import type { Access } from '../../access/access-resolver.js';
import { ObjectStorage } from '../../shared/storage/object-storage.js';
import { UploadRejectedError, type UploadService } from '../../shared/storage/uploads.js';
import { FIELD_ENCRYPTION, OBJECT_STORAGE, UPLOADS } from '../../shared/tokens.js';
import { TelechargementsService } from '../fichiers/index.js';
import { couvrePromotion, promotionsCouvertes } from '../scolarite/index.js';

const TRAITER: Permission[] = ['justificatifs:traiter'];
const DEPOSER: Permission[] = ['justificatifs:deposer'];

const invalide = (champ: string, message: string) =>
  new BadRequestException({
    message: 'Données invalides. Corrigez les champs signalés puis réessayez.',
    details: [`${champ} : ${message}`],
  });

const introuvable = () =>
  new NotFoundException(
    'Justificatif introuvable, ou hors de votre périmètre. Rechargez la page puis réessayez.',
  );

const EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

type Ligne = typeof justificatif.$inferSelect;

/**
 * Justificatifs d'absence (I4.4 ; US-06-07, US-06-08, RG-06-19 à RG-06-21) : dépôt par l'apprenant
 * ou par la scolarité pour lui, file de traitement, décision. Le document reste dans le stockage
 * privé, téléchargé par l'API (ADR 0007) par la seule scolarité et pédagogie (RG-06-20) ; la
 * précision et le message sont chiffrés par champ et ne vont jamais au journal d'audit.
 */
@Injectable()
export class JustificatifsService {
  private readonly logger = new Logger('Justificatifs');

  constructor(
    @Inject(FIELD_ENCRYPTION) private readonly chiffrement: FieldEncryption,
    @Inject(UPLOADS) private readonly uploads: UploadService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    private readonly telechargements: TelechargementsService,
  ) {}

  /**
   * US-06-07, RG-06-19 : nouveau justificatif pour des retards et absences de l'apprenant, sans
   * justificatif en cours ni accepté. Le document est joint ensuite (`deposerDocument`).
   */
  async creer(
    tx: Transaction,
    access: Access,
    personneId: string,
    entree: NouveauJustificatif,
    adresseIp: string,
  ): Promise<Justificatif> {
    const ids = [...new Set(entree.absenceIds)];
    const absences = await tx
      .select({ id: absence.id, statut: absence.statut, fin: seance.fin })
      .from(absence)
      .innerJoin(seance, eq(seance.id, absence.seanceId))
      .where(and(inArray(absence.id, ids), eq(absence.personneId, personneId)));
    if (absences.length !== ids.length)
      throw invalide('absenceIds', 'Choisissez des retards ou absences de la liste.');
    const lies = await tx
      .select({ absenceId: justificatifAbsence.absenceId, statut: justificatif.statut })
      .from(justificatifAbsence)
      .innerJoin(justificatif, eq(justificatif.id, justificatifAbsence.justificatifId))
      .where(inArray(justificatifAbsence.absenceId, ids));
    const bloquee = absences.find(
      (a) =>
        !absenceJustifiable(
          a.statut,
          lies.filter((l) => l.absenceId === a.id).map((l) => l.statut),
        ),
    );
    if (bloquee)
      throw new ConflictException(
        'Une de ces absences est déjà justifiée, ou a déjà un justificatif en cours de traitement. ' +
          'Retirez-la de votre sélection.',
      );
    const [ecole] = await tx
      .select({ delai: organisation.justificatifDelaiHeures })
      .from(organisation)
      .where(eq(organisation.id, access.organisationId));
    const maintenant = new Date();
    const horsDelai = depotHorsDelai(
      absences.map((a) => a.fin),
      maintenant,
      ecole?.delai ?? JUSTIFICATIF_DELAI_HEURES,
    );
    const id = newId();
    const precision = entree.precision?.trim() || null;
    await tx.insert(justificatif).values({
      id,
      organisationId: access.organisationId,
      personneId,
      motif: entree.motif,
      precisionChiffre: precision ? this.chiffrer(precision, access, 'precision', id) : null,
      deposeLe: maintenant,
      deposePar: access.personneId,
      horsDelai,
      createdBy: access.userId,
    });
    await tx.insert(justificatifAbsence).values(
      ids.map((absenceId) => ({
        organisationId: access.organisationId,
        justificatifId: id,
        absenceId,
        createdBy: access.userId,
      })),
    );
    // Ni la précision ni le document : seulement leur présence (données de santé possibles).
    await enregistrerAudit(tx, {
      action: 'justificatif.deposer',
      objetType: 'justificatif',
      objetId: id,
      auteurId: access.userId,
      adresseIp,
      apres: {
        personneId,
        motif: entree.motif,
        absences: ids,
        horsDelai,
        parEcole: personneId !== access.personneId,
        precision: precision !== null,
      },
    });
    const [cree] = await this.detailler(tx, access, [await this.ligne(tx, id)]);
    if (!cree) throw introuvable();
    return cree;
  }

  /** Dépôt par la scolarité pour un apprenant de son périmètre (document reçu hors Scolaly). */
  async creerPourApprenant(
    tx: Transaction,
    access: Access,
    personneId: string,
    entree: NouveauJustificatif,
    adresseIp: string,
  ): Promise<Justificatif> {
    if (!(await this.dansPerimetre(tx, access, personneId, DEPOSER)))
      throw invalide('personneId', 'Choisissez un apprenant de votre périmètre.');
    return this.creer(tx, access, personneId, entree, adresseIp);
  }

  /**
   * RG-06-19 : photo ou PDF de 10 Mo au plus, type reconnu par son contenu, analysé par
   * l'antivirus s'il est en place. Ajouté ou remplacé tant que le justificatif n'est pas décidé ;
   * une demande de complément repasse alors « à traiter ».
   */
  async deposerDocument(
    tx: Transaction,
    access: Access,
    id: string,
    contenu: Buffer | undefined,
    adresseIp: string,
    par: 'apprenant' | 'ecole',
  ): Promise<Justificatif> {
    const avant = await this.ligne(tx, id);
    if (
      par === 'apprenant'
        ? avant.personneId !== access.personneId
        : !(await this.dansPerimetre(tx, access, avant.personneId, DEPOSER))
    )
      throw introuvable();
    if (!documentModifiable(avant.statut))
      throw new ConflictException(
        'Ce justificatif a déjà été traité : son document ne change plus. Déposez-en un nouveau si besoin.',
      );
    if (!Buffer.isBuffer(contenu))
      throw invalide('document', 'Joignez une photo (JPEG, PNG) ou un PDF.');
    let fichier;
    try {
      fichier = await this.uploads.store(access.organisationId, 'justificatifs', contenu, {
        maxBytes: JUSTIFICATIF_TAILLE_MAX,
        types: ['pdf', 'jpeg', 'png'],
      });
    } catch (erreur) {
      if (erreur instanceof UploadRejectedError) throw invalide('document', erreur.message);
      throw erreur;
    }
    await tx
      .update(justificatif)
      .set({
        documentCle: fichier.key,
        documentType: fichier.mime,
        documentTaille: fichier.size,
        documentSha256: fichier.sha256,
        statut: 'a-traiter',
        updatedBy: access.userId,
      })
      .where(eq(justificatif.id, id));
    await enregistrerAudit(tx, {
      action: 'justificatif.document',
      objetType: 'justificatif',
      objetId: id,
      auteurId: access.userId,
      adresseIp,
      avant: { statut: avant.statut, document: avant.documentCle !== null },
      apres: {
        statut: 'a-traiter',
        sha256: fichier.sha256,
        taille: fichier.size,
        type: fichier.mime,
      },
    });
    // L'ancien document n'est plus utile : il est retiré du stockage (minimisation).
    if (avant.documentCle)
      await this.storage.delete(avant.documentCle).catch((erreur: unknown) => {
        this.logger.warn(
          `Ancien justificatif non retiré du stockage (${erreur instanceof Error ? erreur.name : 'erreur inconnue'})`,
        );
      });
    const [apres] = await this.detailler(tx, access, [await this.ligne(tx, id)]);
    if (!apres) throw introuvable();
    return apres;
  }

  /** E-06-04 : ses justificatifs, les plus récents d'abord. */
  async miens(tx: Transaction, access: Access): Promise<Justificatif[]> {
    const lignes = await tx
      .select()
      .from(justificatif)
      .where(and(eq(justificatif.personneId, access.personneId), isNull(justificatif.deletedAt)))
      .orderBy(desc(justificatif.deposeLe));
    return this.detailler(tx, access, lignes);
  }

  /** Délai de dépôt de l'école, en heures (RG-06-19). */
  async delaiHeures(tx: Transaction, access: Access): Promise<number> {
    const [ecole] = await tx
      .select({ delai: organisation.justificatifDelaiHeures })
      .from(organisation)
      .where(eq(organisation.id, access.organisationId));
    return ecole?.delai ?? JUSTIFICATIF_DELAI_HEURES;
  }

  /**
   * E-06-06 : file de traitement, dans le périmètre de `justificatifs:traiter` (apprenants inscrits
   * dans une promotion couverte), filtrée par statut (à traiter par défaut), promotion et motif.
   */
  async file(
    tx: Transaction,
    access: Access,
    filtre: FiltreJustificatifs,
  ): Promise<FileJustificatifs> {
    const couvertes = await promotionsCouvertes(tx, access, TRAITER);
    const promotions = (
      await tx
        .select({ id: promotion.id, libelle: promotion.libelle })
        .from(promotion)
        .where(isNull(promotion.deletedAt))
        .orderBy(asc(promotion.libelle))
    ).filter((p) => couvrePromotion(couvertes, p.id));
    const visibles = filtre.promotionId
      ? promotions.filter((p) => p.id === filtre.promotionId)
      : promotions;
    if (visibles.length === 0) return { promotions, justificatifs: [], tronque: false };
    const lignes = await tx
      .select()
      .from(justificatif)
      .where(
        and(
          isNull(justificatif.deletedAt),
          eq(justificatif.statut, filtre.statut ?? 'a-traiter'),
          filtre.motif ? eq(justificatif.motif, filtre.motif) : undefined,
          couvertes === null && !filtre.promotionId
            ? undefined
            : this.inscritDans(
                tx,
                justificatif.personneId,
                visibles.map((p) => p.id),
              ),
        ),
      )
      .orderBy(asc(justificatif.deposeLe))
      .limit(LIMITE_FILE_JUSTIFICATIFS + 1);
    const retenues = lignes.slice(0, LIMITE_FILE_JUSTIFICATIFS);
    const details = await this.detailler(tx, access, retenues);
    const personneIds = [...new Set(retenues.map((l) => l.personneId))];
    const apprenants =
      personneIds.length === 0
        ? []
        : await tx
            .select({
              id: personne.id,
              nom: sql<string>`coalesce(${personne.nomUsage}, ${personne.nom})`,
              prenom: personne.prenom,
            })
            .from(personne)
            .where(inArray(personne.id, personneIds));
    const inscriptions =
      personneIds.length === 0
        ? []
        : await tx
            .select({ personneId: inscription.personneId, promotion: promotion.libelle })
            .from(inscription)
            .innerJoin(promotion, eq(promotion.id, inscription.promotionId))
            .where(
              and(
                inArray(inscription.personneId, personneIds),
                inArray(
                  inscription.promotionId,
                  visibles.map((p) => p.id),
                ),
                isNull(inscription.deletedAt),
              ),
            )
            .orderBy(desc(inscription.dateEntree));
    const justificatifs: JustificatifATraiter[] = details.map((d, i) => {
      const ligne = retenues[i] as Ligne;
      const apprenant = apprenants.find((a) => a.id === ligne.personneId);
      return {
        ...d,
        personneId: ligne.personneId,
        nom: apprenant?.nom ?? '',
        prenom: apprenant?.prenom ?? '',
        promotion: inscriptions.find((x) => x.personneId === ligne.personneId)?.promotion ?? null,
        deposeParEcole: ligne.deposePar !== ligne.personneId,
      };
    });
    return { promotions, justificatifs, tronque: lignes.length > LIMITE_FILE_JUSTIFICATIFS };
  }

  /** US-06-08 : adresse de téléchargement du document, pour la scolarité et la pédagogie seules. */
  async lienDocument(tx: Transaction, access: Access, id: string): Promise<LienDocument> {
    const ligne = await this.ligne(tx, id);
    if (!(await this.dansPerimetre(tx, access, ligne.personneId, TRAITER))) throw introuvable();
    if (!ligne.documentCle || !ligne.documentType)
      throw new NotFoundException('Aucun document n’est joint à ce justificatif.');
    const type = ligne.documentType as 'application/pdf' | 'image/jpeg' | 'image/png';
    return {
      url: this.telechargements.adresse(
        access,
        {
          cle: ligne.documentCle,
          // Aucun nom ni motif dans le nom du fichier (données de santé possibles).
          nom: `justificatif-${id.slice(-8)}.${EXTENSIONS[type] ?? 'pdf'}`,
          type,
          objet: { type: 'justificatif', id },
        },
        { permissions: TRAITER },
      ),
    };
  }

  /**
   * RG-06-21 : accepte (les absences liées passent « justifiées », la feuille signée ne change
   * pas), refuse avec un motif, ou demande un complément. L'apprenant est averti par email.
   */
  async decider(
    tx: Transaction,
    access: Access,
    id: string,
    entree: DecisionJustificatif,
    adresseIp: string,
  ): Promise<JustificatifATraiter> {
    const avant = await this.ligne(tx, id);
    if (!(await this.dansPerimetre(tx, access, avant.personneId, TRAITER))) throw introuvable();
    const message = entree.message?.trim() || null;
    const verdict = deciderJustificatif(avant.statut, entree.decision, message);
    if (!verdict.ok) {
      if (verdict.refus === 'message-requis')
        throw invalide(
          'message',
          entree.decision === 'refuser'
            ? 'Indiquez le motif du refus : il sera montré à l’apprenant.'
            : 'Indiquez le complément attendu : il sera montré à l’apprenant.',
        );
      throw new ConflictException(
        'Ce justificatif a déjà été traité. Rechargez la file pour voir les suivants.',
      );
    }
    const decide = verdict.statut === 'accepte' || verdict.statut === 'refuse';
    await tx
      .update(justificatif)
      .set({
        statut: verdict.statut,
        messageChiffre: message ? this.chiffrer(message, access, 'message', id) : null,
        decideLe: decide ? new Date() : null,
        decidePar: decide ? access.personneId : null,
        updatedBy: access.userId,
      })
      .where(eq(justificatif.id, id));
    const liees = await tx
      .select({ id: absence.id, statut: absence.statut })
      .from(justificatifAbsence)
      .innerJoin(absence, eq(absence.id, justificatifAbsence.absenceId))
      .where(eq(justificatifAbsence.justificatifId, id));
    const statutAbsence = statutAbsenceApres(verdict.statut);
    const changees = liees.filter((a) => a.statut !== statutAbsence);
    if (changees.length > 0)
      await tx
        .update(absence)
        .set({ statut: statutAbsence, updatedBy: access.userId })
        .where(
          inArray(
            absence.id,
            changees.map((a) => a.id),
          ),
        );
    await enregistrerAudit(tx, {
      action: `justificatif.${entree.decision}`,
      objetType: 'justificatif',
      objetId: id,
      auteurId: access.userId,
      adresseIp,
      avant: {
        statut: avant.statut,
        absences: changees.map((a) => ({ id: a.id, statut: a.statut })),
      },
      apres: {
        statut: verdict.statut,
        absences: changees.map((a) => ({ id: a.id, statut: statutAbsence })),
        message: message !== null,
      },
    });
    await ajouterEvenement(tx, EVENEMENT_DECISION_JUSTIFICATIF, {
      justificatifId: id,
    } satisfies ChargeDecisionJustificatif);
    const file = await this.file(tx, access, { statut: verdict.statut });
    const apres = file.justificatifs.find((j) => j.id === id);
    if (!apres) throw introuvable();
    return apres;
  }

  // ——— Outils ———

  private chiffrer(
    valeur: string,
    access: Access,
    champ: 'precision' | 'message',
    id: string,
  ): string {
    return this.chiffrement.encrypt(
      valeur,
      access.organisationId,
      contexteChiffrement(`justificatif.${champ}`, id),
    );
  }

  private dechiffrer(
    valeur: string | null,
    organisationId: string,
    champ: 'precision' | 'message',
    id: string,
  ): string | null {
    if (!valeur) return null;
    try {
      return this.chiffrement.decrypt(
        valeur,
        organisationId,
        contexteChiffrement(`justificatif.${champ}`, id),
      );
    } catch {
      return null;
    }
  }

  private async ligne(tx: Transaction, id: string): Promise<Ligne> {
    const [ligne] = await tx
      .select()
      .from(justificatif)
      .where(and(eq(justificatif.id, id), isNull(justificatif.deletedAt)));
    if (!ligne) throw introuvable();
    return ligne;
  }

  /** L'apprenant est (ou a été) inscrit dans une promotion couverte par l'une des permissions. */
  private async dansPerimetre(
    tx: Transaction,
    access: Access,
    personneId: string,
    permissions: readonly Permission[],
  ): Promise<boolean> {
    if (!permissions.some((p) => access.permissions.has(p))) return false;
    const couvertes = await promotionsCouvertes(tx, access, permissions);
    if (couvertes === null) return true;
    if (couvertes.size === 0) return false;
    const [trouvee] = await tx
      .select({ id: inscription.id })
      .from(inscription)
      .where(
        and(
          eq(inscription.personneId, personneId),
          inArray(inscription.promotionId, [...couvertes]),
          isNull(inscription.deletedAt),
        ),
      )
      .limit(1);
    return trouvee !== undefined;
  }

  private inscritDans(
    tx: Transaction,
    personneId: typeof justificatif.personneId,
    ids: string[],
  ): SQL {
    return exists(
      tx
        .select({ un: sql`1` })
        .from(inscription)
        .where(
          and(
            eq(inscription.personneId, personneId),
            inArray(inscription.promotionId, ids),
            isNull(inscription.deletedAt),
          ),
        ),
    );
  }

  /** Justificatifs présentés, avec leurs retards et absences (même ordre que les lignes). */
  private async detailler(
    tx: Transaction,
    access: Access,
    lignes: readonly Ligne[],
  ): Promise<Justificatif[]> {
    if (lignes.length === 0) return [];
    const absences = await tx
      .select({
        justificatifId: justificatifAbsence.justificatifId,
        id: absence.id,
        libelle: seance.libelle,
        debut: seance.debut,
        fin: seance.fin,
        nature: absence.nature,
        minutes: absence.minutes,
      })
      .from(justificatifAbsence)
      .innerJoin(absence, eq(absence.id, justificatifAbsence.absenceId))
      .innerJoin(seance, eq(seance.id, absence.seanceId))
      .where(
        inArray(
          justificatifAbsence.justificatifId,
          lignes.map((l) => l.id),
        ),
      )
      .orderBy(asc(seance.debut));
    return lignes.map((l) => ({
      id: l.id,
      motif: l.motif,
      precision: this.dechiffrer(l.precisionChiffre, access.organisationId, 'precision', l.id),
      statut: l.statut,
      deposeLe: l.deposeLe.toISOString(),
      horsDelai: l.horsDelai,
      document: l.documentCle !== null,
      message: this.dechiffrer(l.messageChiffre, access.organisationId, 'message', l.id),
      decideLe: l.decideLe?.toISOString() ?? null,
      absences: absences
        .filter((a) => a.justificatifId === l.id)
        .map(({ justificatifId: _j, debut, fin, ...a }) => ({
          ...a,
          debut: debut.toISOString(),
          fin: fin.toISOString(),
        })),
    }));
  }
}

/** Dernier justificatif de chaque absence (le plus récent), pour « Mes absences » et le suivi. */
export async function justificatifsDesAbsences(
  tx: Transaction,
  absenceIds: readonly string[],
): Promise<Map<string, { id: string; statut: StatutJustificatif }>> {
  const resultat = new Map<string, { id: string; statut: StatutJustificatif }>();
  if (absenceIds.length === 0) return resultat;
  const lignes = await tx
    .select({
      absenceId: justificatifAbsence.absenceId,
      id: justificatif.id,
      statut: justificatif.statut,
    })
    .from(justificatifAbsence)
    .innerJoin(justificatif, eq(justificatif.id, justificatifAbsence.justificatifId))
    .where(
      and(inArray(justificatifAbsence.absenceId, [...absenceIds]), isNull(justificatif.deletedAt)),
    )
    .orderBy(desc(justificatif.deposeLe));
  for (const l of lignes)
    if (!resultat.has(l.absenceId)) resultat.set(l.absenceId, { id: l.id, statut: l.statut });
  return resultat;
}
