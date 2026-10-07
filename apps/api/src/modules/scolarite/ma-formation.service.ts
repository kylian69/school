import { Injectable } from '@nestjs/common';
import type { MaFormation } from '@scolaly/contracts';
import { inscription, promotion, type Transaction } from '@scolaly/db';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { MaquettesService } from '../referentiel/index.js';

/** E-02-07 · Ma formation : maquettes suivies par l'apprenant connecté (US-02-10). */
@Injectable()
export class MaFormationService {
  constructor(private readonly maquettes: MaquettesService) {}

  async lire(tx: Transaction, personneId: string): Promise<MaFormation> {
    const lignes = await tx
      .select({ inscription, promotion })
      .from(inscription)
      .innerJoin(promotion, eq(promotion.id, inscription.promotionId))
      .where(
        and(
          eq(inscription.personneId, personneId),
          inArray(inscription.etat, ['preinscrit', 'inscrit']),
          isNull(inscription.deletedAt),
          isNull(promotion.deletedAt),
        ),
      )
      .orderBy(asc(promotion.dateDebut));
    const formations: MaFormation['formations'] = [];
    for (const { inscription: i, promotion: p } of lignes) {
      formations.push({
        promotion: { id: p.id, libelle: p.libelle, anneeFormation: p.anneeFormation },
        option: i.option,
        maquette: await this.maquettes.lirePourApprenant(tx, p.versionId),
      });
    }
    return { formations };
  }
}
