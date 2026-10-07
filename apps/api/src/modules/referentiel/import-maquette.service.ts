import { Injectable } from '@nestjs/common';
import type { ParametresImportMaquette, ResultatImportMaquette } from '@scolaly/contracts';
import {
  competence,
  competenceModule,
  maquetteBloc,
  maquetteModule,
  maquetteUe,
  newId,
  type Transaction,
} from '@scolaly/db';
import {
  lireImportCompetences,
  lireImportMaquette,
  type BlocImporte,
  type TableauLu,
} from '@scolaly/domain';
import { eq, max } from 'drizzle-orm';
import type { Access } from '../../access/access-resolver.js';
import { MaquettesService } from './maquettes.service.js';

type Erreur = ResultatImportMaquette['erreurs'][number];

/**
 * Import d'une maquette (US-02-02) ou d'un référentiel de compétences (RG-02-21) depuis un
 * tableur : tout ou rien. Le contenu s'ajoute à la version, qui doit accepter une modification de
 * structure (RG-02-04). Un aperçu contrôle le fichier sans rien écrire.
 */
@Injectable()
export class ImportMaquetteService {
  constructor(private readonly maquettes: MaquettesService) {}

  async importer(
    tx: Transaction,
    access: Access,
    versionId: string,
    parametres: ParametresImportMaquette,
    tableau: TableauLu,
    adresseIp: string,
  ): Promise<ResultatImportMaquette> {
    const ctx = await this.maquettes.modifiable(tx, access, versionId, ['structure']);
    const existante = await this.maquettes.construire(tx, ctx);
    const resultat: ResultatImportMaquette = {
      apercu: parametres.apercu,
      importe: false,
      blocs: 0,
      ues: 0,
      modules: 0,
      competences: 0,
      erreurs: [],
      avertissements: [],
      maquette: null,
    };
    const blocsExistants = new Map(existante.blocs.map((b) => [b.code, b.id]));
    const nouveauxBlocs = (blocs: readonly BlocImporte[]) =>
      blocs.filter((b) => !blocsExistants.has(b.code));
    const commun = { organisationId: access.organisationId, versionId, createdBy: access.userId };
    const ordreSuivant = async (table: typeof maquetteBloc | typeof maquetteUe) => {
      const [ligne] = await tx
        .select({ ordre: max(table.ordre) })
        .from(table as typeof maquetteBloc)
        .where(eq(table.versionId, versionId));
      return (ligne?.ordre ?? -1) + 1;
    };

    if (parametres.type === 'maquette') {
      const lu = lireImportMaquette(tableau, ctx.formation.dureeAnnees);
      const erreurs: Erreur[] = [...lu.erreurs];
      for (const ue of lu.ues) {
        if (existante.ues.some((u) => u.code === ue.code)) {
          erreurs.push({
            ligne: null,
            message: `L’UE ${ue.code} existe déjà dans cette maquette.`,
          });
        }
      }
      Object.assign(resultat, {
        blocs: nouveauxBlocs(lu.blocs).length,
        ues: lu.ues.length,
        modules: lu.modules.length,
        erreurs,
        avertissements: lu.uesSansModule.map(
          (code) => `L’UE ${code} n’a aucun module : elle sera créée vide.`,
        ),
      });
      if (erreurs.length > 0 || parametres.apercu) return resultat;

      let ordreBloc = await ordreSuivant(maquetteBloc);
      for (const bloc of nouveauxBlocs(lu.blocs)) {
        const id = newId();
        blocsExistants.set(bloc.code, id);
        await tx.insert(maquetteBloc).values({ ...commun, id, ...bloc, ordre: ordreBloc++ });
      }
      let ordreUe = await ordreSuivant(maquetteUe);
      const ues = new Map<string, string>();
      for (const ue of lu.ues) {
        const id = newId();
        ues.set(ue.code, id);
        const { blocCode, ...colonnes } = ue;
        await tx.insert(maquetteUe).values({
          ...commun,
          id,
          ...colonnes,
          blocId: blocCode ? (blocsExistants.get(blocCode) ?? null) : null,
          ordre: ordreUe++,
        });
      }
      const rangs = new Map<string, number>();
      for (const module of lu.modules) {
        const rang = rangs.get(module.ueCode) ?? 0;
        rangs.set(module.ueCode, rang + 1);
        await tx.insert(maquetteModule).values({
          ...commun,
          ueId: ues.get(module.ueCode) ?? '',
          code: module.code,
          intitule: module.intitule,
          coefficient: module.coefficient,
          heuresCm: module.heures.cm,
          heuresTd: module.heures.td,
          heuresTp: module.heures.tp,
          heuresProjet: module.heures.projet,
          heuresElearning: module.heures.elearning,
          ordre: rang,
        });
      }
    } else {
      const lu = lireImportCompetences(tableau);
      const erreurs: Erreur[] = [...lu.erreurs];
      const modulesParCode = new Map<string, string[]>();
      for (const m of existante.modules) {
        modulesParCode.set(m.code, [...(modulesParCode.get(m.code) ?? []), m.id]);
      }
      for (const c of lu.competences) {
        const blocId = blocsExistants.get(c.blocCode);
        if (blocId && existante.competences.some((x) => x.blocId === blocId && x.code === c.code)) {
          erreurs.push({
            ligne: null,
            message: `La compétence ${c.code} existe déjà dans le bloc ${c.blocCode}.`,
          });
        }
        for (const code of c.modules) {
          const trouves = modulesParCode.get(code) ?? [];
          if (trouves.length !== 1) {
            erreurs.push({
              ligne: null,
              message:
                trouves.length === 0
                  ? `Compétence ${c.code} : le module ${code} n’existe pas dans cette maquette.`
                  : `Compétence ${c.code} : plusieurs modules portent le code ${code} ; rattachez-la depuis l’écran.`,
            });
          }
        }
      }
      Object.assign(resultat, {
        blocs: nouveauxBlocs(lu.blocs).length,
        competences: lu.competences.length,
        erreurs,
      });
      if (erreurs.length > 0 || parametres.apercu) return resultat;

      let ordreBloc = await ordreSuivant(maquetteBloc);
      for (const bloc of nouveauxBlocs(lu.blocs)) {
        const id = newId();
        blocsExistants.set(bloc.code, id);
        await tx.insert(maquetteBloc).values({ ...commun, id, ...bloc, ordre: ordreBloc++ });
      }
      const rangs = new Map<string, number>();
      for (const c of lu.competences) {
        const blocId = blocsExistants.get(c.blocCode) ?? '';
        const dejaLa = existante.competences.filter((x) => x.blocId === blocId).length;
        const rang = rangs.get(blocId) ?? dejaLa;
        rangs.set(blocId, rang + 1);
        const id = newId();
        await tx.insert(competence).values({
          ...commun,
          id,
          blocId,
          code: c.code,
          intitule: c.intitule,
          criteres: c.criteres,
          ordre: rang,
        });
        const modules = [...new Set(c.modules.flatMap((code) => modulesParCode.get(code) ?? []))];
        if (modules.length > 0) {
          await tx.insert(competenceModule).values(
            modules.map((moduleId) => ({
              organisationId: access.organisationId,
              competenceId: id,
              moduleId,
              createdBy: access.userId,
            })),
          );
        }
      }
    }

    resultat.importe = true;
    resultat.maquette = await this.maquettes.construire(tx, ctx);
    await this.maquettes.auditer(tx, access, ctx, 'maquette.import', adresseIp, null, {
      type: parametres.type,
      blocs: resultat.blocs,
      ues: resultat.ues,
      modules: resultat.modules,
      competences: resultat.competences,
    });
    return resultat;
  }
}
