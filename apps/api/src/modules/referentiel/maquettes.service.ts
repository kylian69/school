import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  RegleParticuliere,
  ReglesValidation,
  type ElementCree,
  type Maquette,
  type ModificationBloc,
  type ModificationCompetence,
  type ModificationModule,
  type ModificationUe,
  type ResultatSimulation,
  type SaisieBloc,
  type SaisieCompetence,
  type SaisieModule,
  type SaisieReglesVersion,
  type SaisieSimulation,
  type SaisieUe,
} from '@scolaly/contracts';
import {
  competence,
  competenceModule,
  enregistrerAudit,
  formation,
  maquetteBloc,
  maquetteModule,
  maquetteUe,
  maquetteVersion,
  maquetteVersionRegle,
  newId,
  type Transaction,
} from '@scolaly/db';
import {
  avertissementsMaquette,
  calculerResultats,
  prochainNumero,
  REGLES_VALIDATION_PAR_DEFAUT,
  totauxMaquette,
  verifierModificationVersion,
  verifierPublication,
  verifierReglesValidation,
  type NatureModification,
  type RefusRegles,
  type RefusVersion,
} from '@scolaly/domain';
import { ectsParSemestre, valueAt } from '@scolaly/referentials';
import { and, asc, count, eq, inArray, isNull, max, ne } from 'drizzle-orm';
import type { Access } from '../../access/access-resolver.js';
import { aujourdhui } from '../../shared/dates.js';
import { BibliothequeService } from './bibliotheque.service.js';
import { copierVersion } from './copie-version.js';
import { resumeVersion } from './formations.service.js';
import { droitsSurFormation, exigerModification } from './perimetre.js';

const MESSAGES_VERSION: Record<RefusVersion, string> = {
  'version-archivee':
    'Cette version est archivée : elle est en lecture seule. Créez une nouvelle version pour faire évoluer la maquette.',
  'nouvelle-version-requise':
    'Cette version est utilisée par une promotion : ses coefficients, ECTS et règles ne changent plus. Seuls les libellés et les volumes horaires restent corrigeables. Créez une nouvelle version pour ce changement.',
};

const MESSAGES_REGLES: Record<RefusRegles, string> = {
  'competences-sans-blocs':
    'Une formation évaluée par compétences seules se valide par blocs : choisissez le mode « Blocs de compétences ».',
  'validation-blocs-sans-competences':
    'La formation n’évalue que des notes : les blocs ne peuvent se valider que par les notes.',
  'validation-blocs-sans-notes':
    'La formation n’évalue que des compétences : les blocs ne peuvent se valider que par les compétences.',
  'eliminatoire-au-dessus-du-seuil':
    'La note éliminatoire doit rester inférieure au seuil de validation.',
};

const invalide = (champ: string, message: string) =>
  new BadRequestException({
    message: 'Données invalides. Corrigez les champs signalés puis réessayez.',
    details: [`${champ} : ${message}`],
  });

type LigneVersion = typeof maquetteVersion.$inferSelect;
type LigneUe = typeof maquetteUe.$inferSelect;
type LigneModule = typeof maquetteModule.$inferSelect;

interface Contexte {
  version: LigneVersion;
  formation: typeof formation.$inferSelect;
  modifiable: boolean;
  publiable: boolean;
}

const heuresDe = (m: LigneModule) => ({
  cm: m.heuresCm,
  td: m.heuresTd,
  tp: m.heuresTp,
  projet: m.heuresProjet,
  elearning: m.heuresElearning,
});

/** Règles d'une version, complétées par les valeurs par défaut si elles sont anciennes. */
const reglesDe = (v: LigneVersion): ReglesValidation =>
  ReglesValidation.parse({
    ...REGLES_VALIDATION_PAR_DEFAUT,
    ...(v.regles && typeof v.regles === 'object' ? v.regles : {}),
  });

/** Éditeur de maquette (E-02-02), règles et simulateur (E-02-03), compétences (E-02-09). */
@Injectable()
export class MaquettesService {
  constructor(private readonly bibliotheque: BibliothequeService) {}

  async lire(tx: Transaction, access: Access, versionId: string): Promise<Maquette> {
    const ctx = await this.contexte(tx, access, versionId);
    return this.construire(tx, ctx);
  }

  // ——— Versions (RG-02-04, RG-02-05) ———

  async publier(tx: Transaction, access: Access, versionId: string, adresseIp: string) {
    const ctx = await this.contexte(tx, access, versionId);
    if (!ctx.publiable) {
      throw new ConflictException(
        'Vous ne pouvez pas publier cette version : la publication est réservée aux responsables de la formation.',
      );
    }
    const [ues] = await tx
      .select({ nombre: count() })
      .from(maquetteUe)
      .where(eq(maquetteUe.versionId, versionId));
    const verdict = verifierPublication(ctx.version.statut, ues?.nombre ?? 0);
    if (!verdict.ok) {
      throw new ConflictException(
        {
          'deja-publiee': 'Cette version est déjà publiée.',
          'version-archivee': MESSAGES_VERSION['version-archivee'],
          'maquette-vide': 'Ajoutez au moins une UE avant de publier la maquette.',
        }[verdict.refus],
      );
    }
    await tx
      .update(maquetteVersion)
      .set({ statut: 'publiee', publieeLe: new Date(), updatedBy: access.userId })
      .where(eq(maquetteVersion.id, versionId));
    await this.auditer(
      tx,
      access,
      ctx,
      'maquette.publier',
      adresseIp,
      {},
      { numero: ctx.version.numero },
    );
    return this.lire(tx, access, versionId);
  }

  /** RG-02-04 : toute modification hors libellés et heures d'une version utilisée passe par ici. */
  async nouvelleVersion(tx: Transaction, access: Access, versionId: string, adresseIp: string) {
    const ctx = await this.contexte(tx, access, versionId);
    exigerModification(ctx);
    const numeros = await tx
      .select({ numero: maquetteVersion.numero })
      .from(maquetteVersion)
      .where(eq(maquetteVersion.formationId, ctx.formation.id));
    const numero = prochainNumero(numeros.map((n) => n.numero));
    const copie = await copierVersion(tx, access, versionId, {
      formationId: ctx.formation.id,
      numero,
    });
    await this.auditer(
      tx,
      access,
      ctx,
      'maquette.nouvelle-version',
      adresseIp,
      {},
      {
        source: ctx.version.numero,
        numero,
        version: copie,
      },
    );
    return this.lire(tx, access, copie);
  }

  async archiver(tx: Transaction, access: Access, versionId: string, adresseIp: string) {
    const ctx = await this.contexte(tx, access, versionId);
    exigerModification(ctx);
    if (ctx.version.statut === 'archivee')
      throw new ConflictException('Cette version est déjà archivée.');
    await tx
      .update(maquetteVersion)
      .set({ statut: 'archivee', updatedBy: access.userId })
      .where(eq(maquetteVersion.id, versionId));
    await this.auditer(
      tx,
      access,
      ctx,
      'maquette.archiver',
      adresseIp,
      { statut: ctx.version.statut },
      {
        statut: 'archivee',
      },
    );
    return this.lire(tx, access, versionId);
  }

  // ——— Règles (RG-02-07 à RG-02-09, RG-02-24 à RG-02-28) ———

  async definirRegles(
    tx: Transaction,
    access: Access,
    versionId: string,
    saisie: SaisieReglesVersion,
    adresseIp: string,
  ): Promise<Maquette> {
    const ctx = await this.modifiable(tx, access, versionId, ['regles']);
    const coherence = verifierReglesValidation(saisie.regles);
    if (!coherence.ok) throw invalide('regles', MESSAGES_REGLES[coherence.refus]);
    await this.verifierCibles(
      tx,
      versionId,
      saisie.reglesParticulieres.map((r) => r.regle),
    );
    const avant = await this.construire(tx, ctx);
    await tx
      .update(maquetteVersion)
      .set({ regles: saisie.regles, updatedBy: access.userId })
      .where(eq(maquetteVersion.id, versionId));
    await tx.delete(maquetteVersionRegle).where(eq(maquetteVersionRegle.versionId, versionId));
    if (saisie.reglesParticulieres.length > 0) {
      await tx.insert(maquetteVersionRegle).values(
        saisie.reglesParticulieres.map((r) => ({
          organisationId: access.organisationId,
          versionId,
          regleId: r.regleId,
          libelle: r.libelle,
          type: r.regle.type,
          parametres: r.regle,
          createdBy: access.userId,
        })),
      );
    }
    const apres = await this.construire(tx, ctx);
    await this.auditer(
      tx,
      access,
      ctx,
      'maquette.regles',
      adresseIp,
      { regles: avant.regles, reglesParticulieres: avant.reglesParticulieres },
      { regles: apres.regles, reglesParticulieres: apres.reglesParticulieres },
    );
    return apres;
  }

  /** RG-02-10 : simulation avec des notes fictives, par le moteur des bulletins. */
  async simuler(
    tx: Transaction,
    access: Access,
    versionId: string,
    saisie: SaisieSimulation,
  ): Promise<ResultatSimulation> {
    const maquette = await this.lire(tx, access, versionId);
    const { niveaux } = await this.bibliotheque.echelle(tx);
    const resultat = calculerResultats({
      maquette: {
        blocs: maquette.blocs,
        ues: maquette.ues,
        modules: maquette.modules,
      },
      annee: saisie.annee,
      competences: maquette.competences,
      echelle: niveaux,
      regles: maquette.regles,
      reglesParticulieres: maquette.reglesParticulieres,
      dossier: {
        option: saisie.option,
        evaluations: saisie.evaluations,
        bonusAccordes: saisie.bonusAccordes,
        pointsJury: saisie.pointsJury,
        niveauxCompetences: saisie.niveauxCompetences,
      },
    });
    return {
      ...resultat,
      explications: resultat.explications.map((e) => ({
        ...e,
        cible: Object.fromEntries(Object.entries(e.cible).map(([k, v]) => [k, v])),
      })),
    };
  }

  // ——— Blocs ———

  async creerBloc(
    tx: Transaction,
    access: Access,
    versionId: string,
    saisie: SaisieBloc,
    ip: string,
  ) {
    const ctx = await this.modifiable(tx, access, versionId, ['structure']);
    const id = newId();
    await tx.insert(maquetteBloc).values({
      id,
      organisationId: access.organisationId,
      versionId,
      code: saisie.code,
      intitule: saisie.intitule,
      ordre: await this.prochainOrdre(tx, maquetteBloc, eq(maquetteBloc.versionId, versionId)),
      createdBy: access.userId,
    });
    await this.auditer(tx, access, ctx, 'maquette.bloc.creer', ip, null, { id, ...saisie });
    return this.cree(tx, ctx, id);
  }

  async modifierBloc(
    tx: Transaction,
    access: Access,
    versionId: string,
    id: string,
    saisie: ModificationBloc,
    ip: string,
  ) {
    const avant = await this.element(tx, maquetteBloc, versionId, id);
    const ctx = await this.modifiable(tx, access, versionId, ['libelle']);
    const { ordre, ...colonnes } = saisie;
    if (Object.keys(colonnes).length > 0) {
      await tx
        .update(maquetteBloc)
        .set({ ...colonnes, updatedBy: access.userId })
        .where(eq(maquetteBloc.id, id));
    }
    if (ordre !== undefined) {
      await this.reordonner(tx, maquetteBloc, eq(maquetteBloc.versionId, versionId), id, ordre);
    }
    await this.auditer(tx, access, ctx, 'maquette.bloc.modifier', ip, avant, saisie);
    return this.construire(tx, ctx);
  }

  /** Un bloc qui porte des compétences ne se supprime pas ; ses UE sont détachées. */
  async supprimerBloc(tx: Transaction, access: Access, versionId: string, id: string, ip: string) {
    const avant = await this.element(tx, maquetteBloc, versionId, id);
    const ctx = await this.modifiable(tx, access, versionId, ['structure']);
    const [porte] = await tx
      .select({ id: competence.id })
      .from(competence)
      .where(eq(competence.blocId, id))
      .limit(1);
    if (porte) {
      throw new ConflictException(
        'Ce bloc porte des compétences : supprimez-les ou rattachez-les à un autre bloc avant de le supprimer.',
      );
    }
    await tx
      .update(maquetteUe)
      .set({ blocId: null, updatedBy: access.userId })
      .where(eq(maquetteUe.blocId, id));
    await tx.delete(maquetteBloc).where(eq(maquetteBloc.id, id));
    await this.auditer(tx, access, ctx, 'maquette.bloc.supprimer', ip, avant, null);
    return this.construire(tx, ctx);
  }

  // ——— UE ———

  async creerUe(tx: Transaction, access: Access, versionId: string, saisie: SaisieUe, ip: string) {
    const ctx = await this.modifiable(tx, access, versionId, ['structure']);
    await this.verifierParent(tx, maquetteBloc, versionId, saisie.blocId, 'blocId');
    this.verifierAnnee(ctx, saisie.annee);
    const id = newId();
    await tx.insert(maquetteUe).values({
      id,
      organisationId: access.organisationId,
      versionId,
      ...saisie,
      option: saisie.option || null,
      ordre: await this.prochainOrdre(tx, maquetteUe, eq(maquetteUe.versionId, versionId)),
      createdBy: access.userId,
    });
    await this.auditer(tx, access, ctx, 'maquette.ue.creer', ip, null, { id, ...saisie });
    return this.cree(tx, ctx, id);
  }

  async modifierUe(
    tx: Transaction,
    access: Access,
    versionId: string,
    id: string,
    saisie: ModificationUe,
    ip: string,
  ) {
    const avant = await this.element(tx, maquetteUe, versionId, id);
    const structure: (keyof ModificationUe)[] = [
      'blocId',
      'annee',
      'semestre',
      'ects',
      'coefficient',
      'option',
    ];
    const change = structure.some(
      (cle) => saisie[cle] !== undefined && saisie[cle] !== avant[cle as keyof LigneUe],
    );
    const ctx = await this.modifiable(tx, access, versionId, change ? ['structure'] : ['libelle']);
    if (saisie.blocId !== undefined)
      await this.verifierParent(tx, maquetteBloc, versionId, saisie.blocId, 'blocId');
    if (saisie.annee !== undefined) this.verifierAnnee(ctx, saisie.annee);
    const { ordre, ...colonnes } = saisie;
    if (Object.keys(colonnes).length > 0) {
      await tx
        .update(maquetteUe)
        .set({
          ...colonnes,
          ...(colonnes.option !== undefined ? { option: colonnes.option || null } : {}),
          updatedBy: access.userId,
        })
        .where(eq(maquetteUe.id, id));
    }
    if (ordre !== undefined) {
      await this.reordonner(tx, maquetteUe, eq(maquetteUe.versionId, versionId), id, ordre);
    }
    await this.auditer(tx, access, ctx, 'maquette.ue.modifier', ip, avant, saisie);
    return this.construire(tx, ctx);
  }

  /** Supprime l'UE et ses modules (leurs rattachements aux compétences suivent). */
  async supprimerUe(tx: Transaction, access: Access, versionId: string, id: string, ip: string) {
    const avant = await this.element(tx, maquetteUe, versionId, id);
    const ctx = await this.modifiable(tx, access, versionId, ['structure']);
    const modules = await tx.select().from(maquetteModule).where(eq(maquetteModule.ueId, id));
    await this.verifierReferences(tx, versionId, [id, ...modules.map((m) => m.id)]);
    await tx.delete(maquetteModule).where(eq(maquetteModule.ueId, id));
    await tx.delete(maquetteUe).where(eq(maquetteUe.id, id));
    await this.auditer(tx, access, ctx, 'maquette.ue.supprimer', ip, { ...avant, modules }, null);
    return this.construire(tx, ctx);
  }

  // ——— Modules ———

  async creerModule(
    tx: Transaction,
    access: Access,
    versionId: string,
    saisie: SaisieModule,
    ip: string,
  ) {
    const ctx = await this.modifiable(tx, access, versionId, ['structure']);
    await this.verifierParent(tx, maquetteUe, versionId, saisie.ueId, 'ueId');
    const id = newId();
    await tx.insert(maquetteModule).values({
      id,
      organisationId: access.organisationId,
      versionId,
      ueId: saisie.ueId,
      code: saisie.code,
      intitule: saisie.intitule,
      coefficient: saisie.coefficient,
      ...this.colonnesHeures(saisie.heures),
      ordre: await this.prochainOrdre(tx, maquetteModule, eq(maquetteModule.ueId, saisie.ueId)),
      createdBy: access.userId,
    });
    await this.auditer(tx, access, ctx, 'maquette.module.creer', ip, null, { id, ...saisie });
    return this.cree(tx, ctx, id);
  }

  async modifierModule(
    tx: Transaction,
    access: Access,
    versionId: string,
    id: string,
    saisie: ModificationModule,
    ip: string,
  ) {
    const avant = await this.element(tx, maquetteModule, versionId, id);
    const natures: NatureModification[] = ['libelle'];
    if (
      (saisie.coefficient !== undefined && saisie.coefficient !== avant.coefficient) ||
      (saisie.ueId !== undefined && saisie.ueId !== avant.ueId)
    ) {
      natures.push('structure');
    }
    if (saisie.heures) natures.push('heures');
    const ctx = await this.modifiable(tx, access, versionId, natures);
    if (saisie.ueId !== undefined)
      await this.verifierParent(tx, maquetteUe, versionId, saisie.ueId, 'ueId');
    const { ordre, heures, ...colonnes } = saisie;
    const changement = { ...colonnes, ...(heures ? this.colonnesHeures(heures) : {}) };
    if (Object.keys(changement).length > 0) {
      await tx
        .update(maquetteModule)
        .set({ ...changement, updatedBy: access.userId })
        .where(eq(maquetteModule.id, id));
    }
    if (ordre !== undefined) {
      const ueId = saisie.ueId ?? avant.ueId;
      await this.reordonner(tx, maquetteModule, eq(maquetteModule.ueId, ueId), id, ordre);
    }
    await this.auditer(tx, access, ctx, 'maquette.module.modifier', ip, avant, saisie);
    return this.construire(tx, ctx);
  }

  async supprimerModule(
    tx: Transaction,
    access: Access,
    versionId: string,
    id: string,
    ip: string,
  ) {
    const avant = await this.element(tx, maquetteModule, versionId, id);
    const ctx = await this.modifiable(tx, access, versionId, ['structure']);
    await this.verifierReferences(tx, versionId, [id]);
    await tx.delete(maquetteModule).where(eq(maquetteModule.id, id));
    await this.auditer(tx, access, ctx, 'maquette.module.supprimer', ip, avant, null);
    return this.construire(tx, ctx);
  }

  // ——— Compétences (RG-02-21, RG-02-23) ———

  async creerCompetence(
    tx: Transaction,
    access: Access,
    versionId: string,
    saisie: SaisieCompetence,
    ip: string,
  ) {
    const ctx = await this.modifiable(tx, access, versionId, ['structure']);
    await this.verifierParent(tx, maquetteBloc, versionId, saisie.blocId, 'blocId');
    await this.verifierModules(tx, versionId, saisie.moduleIds);
    const id = newId();
    await tx.insert(competence).values({
      id,
      organisationId: access.organisationId,
      versionId,
      blocId: saisie.blocId,
      code: saisie.code,
      intitule: saisie.intitule,
      criteres: saisie.criteres,
      ordre: await this.prochainOrdre(tx, competence, eq(competence.blocId, saisie.blocId)),
      createdBy: access.userId,
    });
    await this.ecrireModules(tx, access, id, saisie.moduleIds);
    await this.auditer(tx, access, ctx, 'maquette.competence.creer', ip, null, { id, ...saisie });
    return this.cree(tx, ctx, id);
  }

  async modifierCompetence(
    tx: Transaction,
    access: Access,
    versionId: string,
    id: string,
    saisie: ModificationCompetence,
    ip: string,
  ) {
    const avant = await this.element(tx, competence, versionId, id);
    const structure = saisie.blocId !== undefined || saisie.moduleIds !== undefined;
    const ctx = await this.modifiable(
      tx,
      access,
      versionId,
      structure ? ['structure'] : ['libelle'],
    );
    if (saisie.blocId !== undefined)
      await this.verifierParent(tx, maquetteBloc, versionId, saisie.blocId, 'blocId');
    const { ordre, moduleIds, ...colonnes } = saisie;
    if (moduleIds) {
      await this.verifierModules(tx, versionId, moduleIds);
      await this.ecrireModules(tx, access, id, moduleIds);
    }
    if (Object.keys(colonnes).length > 0) {
      await tx
        .update(competence)
        .set({ ...colonnes, updatedBy: access.userId })
        .where(eq(competence.id, id));
    }
    if (ordre !== undefined) {
      const blocId = saisie.blocId ?? avant.blocId;
      await this.reordonner(tx, competence, eq(competence.blocId, blocId), id, ordre);
    }
    await this.auditer(tx, access, ctx, 'maquette.competence.modifier', ip, avant, saisie);
    return this.construire(tx, ctx);
  }

  async supprimerCompetence(
    tx: Transaction,
    access: Access,
    versionId: string,
    id: string,
    ip: string,
  ) {
    const avant = await this.element(tx, competence, versionId, id);
    const ctx = await this.modifiable(tx, access, versionId, ['structure']);
    await tx.delete(competence).where(eq(competence.id, id));
    await this.auditer(tx, access, ctx, 'maquette.competence.supprimer', ip, avant, null);
    return this.construire(tx, ctx);
  }

  // ——— Outils ———

  private async contexte(tx: Transaction, access: Access, versionId: string): Promise<Contexte> {
    const [ligne] = await tx
      .select({ version: maquetteVersion, formation })
      .from(maquetteVersion)
      .innerJoin(formation, eq(formation.id, maquetteVersion.formationId))
      .where(and(eq(maquetteVersion.id, versionId), isNull(formation.deletedAt)));
    if (!ligne) throw new NotFoundException('Version de maquette introuvable.');
    const droits = await droitsSurFormation(tx, access, ligne.formation.id);
    return { ...ligne, ...droits };
  }

  /** Droits et RG-02-04 : la modification demandée est-elle permise sur cette version ? */
  async modifiable(
    tx: Transaction,
    access: Access,
    versionId: string,
    natures: readonly NatureModification[],
  ): Promise<Contexte & { apresPublication: boolean }> {
    const ctx = await this.contexte(tx, access, versionId);
    exigerModification(ctx);
    const verdict = verifierModificationVersion(
      { statut: ctx.version.statut, utilisee: resumeVersion(ctx.version).utilisee },
      natures,
    );
    if (!verdict.ok) throw new ConflictException(MESSAGES_VERSION[verdict.refus]);
    return { ...ctx, apresPublication: verdict.trace };
  }

  async construire(tx: Transaction, ctx: Contexte): Promise<Maquette> {
    const versionId = ctx.version.id;
    const [version] = await tx
      .select()
      .from(maquetteVersion)
      .where(eq(maquetteVersion.id, versionId));
    if (!version) throw new NotFoundException('Version de maquette introuvable.');
    const blocs = await tx
      .select()
      .from(maquetteBloc)
      .where(eq(maquetteBloc.versionId, versionId))
      .orderBy(asc(maquetteBloc.ordre));
    const ues = await tx
      .select()
      .from(maquetteUe)
      .where(eq(maquetteUe.versionId, versionId))
      .orderBy(asc(maquetteUe.annee), asc(maquetteUe.semestre), asc(maquetteUe.ordre));
    const modules = await tx
      .select()
      .from(maquetteModule)
      .where(eq(maquetteModule.versionId, versionId))
      .orderBy(asc(maquetteModule.ordre));
    const competences = await tx
      .select()
      .from(competence)
      .where(eq(competence.versionId, versionId))
      .orderBy(asc(competence.ordre));
    const liens =
      competences.length === 0
        ? []
        : await tx
            .select()
            .from(competenceModule)
            .where(
              inArray(
                competenceModule.competenceId,
                competences.map((c) => c.id),
              ),
            );
    const regles = await tx
      .select()
      .from(maquetteVersionRegle)
      .where(eq(maquetteVersionRegle.versionId, versionId))
      .orderBy(asc(maquetteVersionRegle.createdAt));
    const versions = await tx
      .select()
      .from(maquetteVersion)
      .where(eq(maquetteVersion.formationId, ctx.formation.id))
      .orderBy(asc(maquetteVersion.numero));

    const arbre = {
      blocs: blocs.map((b) => ({ id: b.id, code: b.code, intitule: b.intitule, ordre: b.ordre })),
      ues: ues.map((u) => ({
        id: u.id,
        blocId: u.blocId,
        code: u.code,
        intitule: u.intitule,
        annee: u.annee,
        semestre: u.semestre,
        ects: u.ects,
        coefficient: u.coefficient,
        option: u.option,
        ordre: u.ordre,
      })),
      modules: modules.map((m) => ({
        id: m.id,
        ueId: m.ueId,
        code: m.code,
        intitule: m.intitule,
        coefficient: m.coefficient,
        heures: heuresDe(m),
        ordre: m.ordre,
      })),
    };
    const totaux = totauxMaquette(arbre);
    const attendu = valueAt(ectsParSemestre, aujourdhui()).valeur;
    return {
      formation: {
        id: ctx.formation.id,
        intitule: ctx.formation.intitule,
        dureeAnnees: ctx.formation.dureeAnnees,
      },
      version: resumeVersion(version),
      versions: versions.map(resumeVersion),
      modifiable: ctx.modifiable && version.statut !== 'archivee',
      publiable: ctx.publiable && version.statut === 'brouillon',
      regles: reglesDe(version),
      reglesParticulieres: regles.map((r) => ({
        id: r.id,
        regleId: r.regleId,
        libelle: r.libelle,
        regle: RegleParticuliere.parse(r.parametres),
      })),
      reglement: { disponible: version.reglementCle !== null },
      ...arbre,
      competences: competences.map((c) => ({
        id: c.id,
        blocId: c.blocId,
        code: c.code,
        intitule: c.intitule,
        criteres: c.criteres,
        moduleIds: liens.filter((l) => l.competenceId === c.id).map((l) => l.moduleId),
        ordre: c.ordre,
      })),
      totaux,
      avertissements: avertissementsMaquette(arbre, attendu, totaux),
    };
  }

  private async cree(tx: Transaction, ctx: Contexte, id: string): Promise<ElementCree> {
    return { id, maquette: await this.construire(tx, ctx) };
  }

  /** Charge un élément de la version (bloc, UE, module, compétence), sinon 404. */
  private async element<
    T extends typeof maquetteBloc | typeof maquetteUe | typeof maquetteModule | typeof competence,
  >(tx: Transaction, table: T, versionId: string, id: string): Promise<T['$inferSelect']> {
    const [ligne] = (await tx
      .select()
      .from(table as typeof maquetteBloc)
      .where(and(eq(table.id, id), eq(table.versionId, versionId)))) as T['$inferSelect'][];
    if (!ligne) throw new NotFoundException('Élément de maquette introuvable.');
    return ligne;
  }

  private async verifierParent(
    tx: Transaction,
    table: typeof maquetteBloc | typeof maquetteUe,
    versionId: string,
    id: string | null,
    champ: string,
  ): Promise<void> {
    if (id === null) return;
    const [ligne] = await tx
      .select({ id: table.id })
      .from(table as typeof maquetteBloc)
      .where(and(eq(table.id, id), eq(table.versionId, versionId)));
    if (!ligne)
      throw invalide(champ, 'Cet élément n’appartient pas à cette version de la maquette.');
  }

  private async verifierModules(tx: Transaction, versionId: string, ids: readonly string[]) {
    if (ids.length === 0) return;
    const trouves = await tx
      .select({ id: maquetteModule.id })
      .from(maquetteModule)
      .where(and(inArray(maquetteModule.id, [...ids]), eq(maquetteModule.versionId, versionId)));
    if (trouves.length !== new Set(ids).size) {
      throw invalide(
        'moduleIds',
        'Un des modules choisis n’appartient pas à cette version de la maquette.',
      );
    }
  }

  /** Les règles particulières qui ciblent une UE ou un module les désignent dans cette version. */
  private async verifierCibles(
    tx: Transaction,
    versionId: string,
    regles: readonly RegleParticuliere[],
  ) {
    if (regles.some((r) => r.type === 'ue_bonus' && !r.source)) {
      throw invalide(
        'reglesParticulieres',
        'Une règle « UE ou module bonus » doit désigner l’UE ou le module bonus de cette maquette.',
      );
    }
    const ids = regles.flatMap((r) => {
      const liste: string[] = [];
      if ((r.type === 'bonus' || r.type === 'ue_bonus') && r.cible.niveau !== 'generale')
        liste.push(r.cible.id);
      if (r.type === 'ue_bonus' && r.source) liste.push(r.source.id);
      return liste;
    });
    if (ids.length === 0) return;
    const ues = await tx
      .select({ id: maquetteUe.id })
      .from(maquetteUe)
      .where(and(eq(maquetteUe.versionId, versionId), inArray(maquetteUe.id, ids)));
    const modules = await tx
      .select({ id: maquetteModule.id })
      .from(maquetteModule)
      .where(and(eq(maquetteModule.versionId, versionId), inArray(maquetteModule.id, ids)));
    const connus = new Set([...ues, ...modules].map((e) => e.id));
    if (ids.some((id) => !connus.has(id))) {
      throw invalide(
        'reglesParticulieres',
        'Une règle cible une UE ou un module qui n’existe pas dans cette version de la maquette.',
      );
    }
  }

  /** Une UE ou un module cité par une règle particulière ne se supprime pas. */
  private async verifierReferences(tx: Transaction, versionId: string, ids: readonly string[]) {
    const regles = await tx
      .select()
      .from(maquetteVersionRegle)
      .where(eq(maquetteVersionRegle.versionId, versionId));
    const cite = regles.find((r) => ids.some((id) => JSON.stringify(r.parametres).includes(id)));
    if (cite) {
      throw new ConflictException(
        `La règle « ${cite.libelle} » cite cet élément : modifiez-la ou retirez-la avant de le supprimer.`,
      );
    }
  }

  private verifierAnnee(ctx: Contexte, annee: number) {
    if (annee > ctx.formation.dureeAnnees) {
      throw invalide(
        'annee',
        `La formation dure ${String(ctx.formation.dureeAnnees)} an(s) : choisissez une année de 1 à ${String(ctx.formation.dureeAnnees)}.`,
      );
    }
  }

  private async ecrireModules(
    tx: Transaction,
    access: Access,
    competenceId: string,
    ids: readonly string[],
  ) {
    await tx.delete(competenceModule).where(eq(competenceModule.competenceId, competenceId));
    const uniques = [...new Set(ids)];
    if (uniques.length === 0) return;
    await tx.insert(competenceModule).values(
      uniques.map((moduleId) => ({
        organisationId: access.organisationId,
        competenceId,
        moduleId,
        createdBy: access.userId,
      })),
    );
  }

  private colonnesHeures(heures: {
    cm: number;
    td: number;
    tp: number;
    projet: number;
    elearning: number;
  }) {
    return {
      heuresCm: heures.cm,
      heuresTd: heures.td,
      heuresTp: heures.tp,
      heuresProjet: heures.projet,
      heuresElearning: heures.elearning,
    };
  }

  private async prochainOrdre(
    tx: Transaction,
    table: typeof maquetteBloc | typeof maquetteUe | typeof maquetteModule | typeof competence,
    condition: ReturnType<typeof eq>,
  ): Promise<number> {
    const [ligne] = await tx
      .select({ ordre: max(table.ordre) })
      .from(table as typeof maquetteBloc)
      .where(condition);
    return (ligne?.ordre ?? -1) + 1;
  }

  /** Place l'élément au rang demandé parmi ses frères et renumérote (glisser-déposer). */
  private async reordonner(
    tx: Transaction,
    table: typeof maquetteBloc | typeof maquetteUe | typeof maquetteModule | typeof competence,
    freres: ReturnType<typeof eq>,
    id: string,
    rang: number,
  ): Promise<void> {
    const lignes = await tx
      .select({ id: table.id })
      .from(table as typeof maquetteBloc)
      .where(and(freres, ne(table.id, id)))
      .orderBy(asc(table.ordre));
    const ordre = lignes.map((l) => l.id);
    ordre.splice(Math.min(rang, ordre.length), 0, id);
    for (const [position, element] of ordre.entries()) {
      await tx
        .update(table as typeof maquetteBloc)
        .set({ ordre: position })
        .where(eq(table.id, element));
    }
  }

  async auditer(
    tx: Transaction,
    access: Access,
    ctx: Contexte & { apresPublication?: boolean },
    action: string,
    adresseIp: string,
    avant: unknown,
    apres: unknown,
  ) {
    await enregistrerAudit(tx, {
      action,
      objetType: 'maquette_version',
      objetId: ctx.version.id,
      auteurId: access.userId,
      adresseIp,
      avant: avant ?? null,
      apres:
        apres === null
          ? null
          : {
              formation: ctx.formation.intitule,
              version: ctx.version.numero,
              ...(ctx.apresPublication ? { correctionApresPublication: true } : {}),
              element: apres,
            },
    });
  }
}
