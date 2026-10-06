import {
  competence,
  competenceModule,
  maquetteBloc,
  maquetteModule,
  maquetteUe,
  maquetteVersion,
  maquetteVersionRegle,
  newId,
  type Transaction,
} from '@scolaly/db';
import { eq, inArray } from 'drizzle-orm';
import type { Access } from '../../access/access-resolver.js';

/**
 * Copie complète d'une version de maquette (RG-02-04 « nouvelle version », RG-02-20 duplication) :
 * blocs, UE, modules, compétences et leurs rattachements, règles et règles particulières. La copie
 * est un brouillon ; le règlement PDF reste celui de la source tant qu'il n'est pas remplacé.
 */
export async function copierVersion(
  tx: Transaction,
  access: Access,
  sourceId: string,
  cible: { formationId: string; numero: number },
): Promise<string> {
  const [source] = await tx.select().from(maquetteVersion).where(eq(maquetteVersion.id, sourceId));
  if (!source) throw new Error('Version source introuvable.');
  const versionId = newId();
  const commun = { organisationId: access.organisationId, versionId, createdBy: access.userId };
  await tx.insert(maquetteVersion).values({
    id: versionId,
    organisationId: access.organisationId,
    formationId: cible.formationId,
    numero: cible.numero,
    statut: 'brouillon',
    regles: source.regles,
    reglementCle: source.reglementCle,
    versionSourceId: source.id,
    createdBy: access.userId,
  });

  const correspondance = new Map<string, string>();
  const nouvel = (ancien: string) => {
    const id = newId();
    correspondance.set(ancien, id);
    return id;
  };
  const vers = (ancien: string) => correspondance.get(ancien) ?? ancien;

  const blocs = await tx.select().from(maquetteBloc).where(eq(maquetteBloc.versionId, sourceId));
  if (blocs.length > 0) {
    await tx.insert(maquetteBloc).values(
      blocs.map((b) => ({
        ...commun,
        id: nouvel(b.id),
        code: b.code,
        intitule: b.intitule,
        ordre: b.ordre,
      })),
    );
  }
  const ues = await tx.select().from(maquetteUe).where(eq(maquetteUe.versionId, sourceId));
  if (ues.length > 0) {
    await tx.insert(maquetteUe).values(
      ues.map((u) => ({
        ...commun,
        id: nouvel(u.id),
        blocId: u.blocId ? vers(u.blocId) : null,
        code: u.code,
        intitule: u.intitule,
        annee: u.annee,
        semestre: u.semestre,
        ects: u.ects,
        coefficient: u.coefficient,
        option: u.option,
        ordre: u.ordre,
      })),
    );
  }
  const modules = await tx
    .select()
    .from(maquetteModule)
    .where(eq(maquetteModule.versionId, sourceId));
  if (modules.length > 0) {
    await tx.insert(maquetteModule).values(
      modules.map((m) => ({
        ...commun,
        id: nouvel(m.id),
        ueId: vers(m.ueId),
        code: m.code,
        intitule: m.intitule,
        coefficient: m.coefficient,
        heuresCm: m.heuresCm,
        heuresTd: m.heuresTd,
        heuresTp: m.heuresTp,
        heuresProjet: m.heuresProjet,
        heuresElearning: m.heuresElearning,
        ordre: m.ordre,
      })),
    );
  }
  const competences = await tx.select().from(competence).where(eq(competence.versionId, sourceId));
  if (competences.length > 0) {
    await tx.insert(competence).values(
      competences.map((c) => ({
        ...commun,
        id: nouvel(c.id),
        blocId: vers(c.blocId),
        code: c.code,
        intitule: c.intitule,
        criteres: c.criteres,
        ordre: c.ordre,
      })),
    );
    const liens = await tx
      .select()
      .from(competenceModule)
      .where(
        inArray(
          competenceModule.competenceId,
          competences.map((c) => c.id),
        ),
      );
    if (liens.length > 0) {
      await tx.insert(competenceModule).values(
        liens.map((l) => ({
          organisationId: access.organisationId,
          competenceId: vers(l.competenceId),
          moduleId: vers(l.moduleId),
          createdBy: access.userId,
        })),
      );
    }
  }
  const regles = await tx
    .select()
    .from(maquetteVersionRegle)
    .where(eq(maquetteVersionRegle.versionId, sourceId));
  if (regles.length > 0) {
    await tx.insert(maquetteVersionRegle).values(
      regles.map((r) => ({
        ...commun,
        regleId: r.regleId,
        libelle: r.libelle,
        type: r.type,
        // Les cibles (UE, modules) désignent désormais les éléments de la copie.
        parametres: remplacerIdentifiants(r.parametres, vers),
      })),
    );
  }
  return versionId;
}

/** Remplace, dans des paramètres jsonb, les identifiants copiés par leurs nouveaux. */
function remplacerIdentifiants(valeur: unknown, vers: (id: string) => string): unknown {
  if (typeof valeur === 'string') return vers(valeur);
  if (Array.isArray(valeur)) return valeur.map((v) => remplacerIdentifiants(v, vers));
  if (valeur && typeof valeur === 'object') {
    return Object.fromEntries(
      Object.entries(valeur).map(([cle, v]) => [cle, remplacerIdentifiants(v, vers)]),
    );
  }
  return valeur;
}
