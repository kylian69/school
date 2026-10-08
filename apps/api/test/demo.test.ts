import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { SemaineEdt } from '@scolaly/contracts';
import {
  attribution,
  createDatabase,
  personne,
  role,
  seance,
  seanceIntervenant,
} from '@scolaly/db';
import { buildDemoDataset } from '@scolaly/db/demo';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import type { Auth } from '../src/auth/auth.js';
import { seedDemoEmploiDuTemps } from '../src/demo/emploi-du-temps-demo.js';
import { seedDemo } from '../src/demo/seed-demo.js';
import { AUTH } from '../src/shared/tokens.js';
import { signInCookie, startApp, WEB_ORIGIN } from './helpers.js';

const PASSWORD = 'mot de passe de la démonstration';
let app: NestFastifyApplication;

beforeAll(async () => {
  app = await startApp();
});

afterAll(async () => {
  await app.close();
});

describe('Chargement du jeu de démonstration', () => {
  it('crée les données et un compte par rôle et par école, une seule fois', async () => {
    const auth = app.get<Auth>(AUTH);
    const migratorUrl = inject('migratorUrl');
    const premier = await seedDemo({ auth, migratorUrl, password: PASSWORD });
    expect(premier.donneesEcrites).toBe(true);
    expect(premier.comptesCrees).toEqual(buildDemoDataset().comptes.map((c) => c.email));
    expect(premier.comptesCrees).toHaveLength(8);

    const owner = createDatabase(migratorUrl, { max: 1 });
    try {
      const fiches = await owner.db
        .select({ email: personne.email, userId: personne.userId, role: role.code })
        .from(attribution)
        .innerJoin(personne, eq(personne.id, attribution.personneId))
        .innerJoin(role, eq(role.id, attribution.roleId))
        .where(
          inArray(
            attribution.organisationId,
            buildDemoDataset().organisations.map((o) => o.id ?? ''),
          ),
        );
      expect(fiches).toHaveLength(8);
      expect(fiches.every((f) => f.userId !== null)).toBe(true);
      expect(fiches.find((f) => f.email.startsWith('administrateur@egl'))?.role).toBe(
        'administrateur',
      );
    } finally {
      await owner.close();
    }

    const second = await seedDemo({ auth, migratorUrl, password: PASSWORD });
    expect(second).toEqual({ donneesEcrites: false, comptesCrees: [] });
  });

  it('I4.1 emploi du temps publié sur six semaines, sans conflit bloquant', async () => {
    const dataset = buildDemoDataset();
    const owner = createDatabase(inject('migratorUrl'), { max: 1 });
    try {
      const lignes = await owner.db
        .select({ id: seance.id, statut: seance.statut, serieId: seance.serieId })
        .from(seance)
        .where(
          inArray(
            seance.organisationId,
            dataset.organisations.map((o) => o.id ?? ''),
          ),
        );
      expect(lignes.filter((s) => s.serieId !== null).length).toBeGreaterThan(20);
      expect(lignes.filter((s) => s.statut === 'brouillon').length).toBeGreaterThanOrEqual(2);
      const coAnimees = await owner.db
        .select({ seanceId: seanceIntervenant.seanceId })
        .from(seanceIntervenant)
        .where(
          inArray(
            seanceIntervenant.seanceId,
            lignes.map((s) => s.id),
          ),
        );
      const parSeance = new Map<string, number>();
      for (const c of coAnimees) parSeance.set(c.seanceId, (parSeance.get(c.seanceId) ?? 0) + 1);
      expect([...parSeance.values()].some((n) => n > 1)).toBe(true);
      // Un second chargement n'ajoute rien.
      expect(await seedDemoEmploiDuTemps(owner.db, dataset)).toBe(0);
    } finally {
      await owner.close();
    }

    const [administrateur] = dataset.comptes;
    const campus = dataset.etablissements[0]?.id;
    if (!administrateur || !campus) throw new Error('Compte et campus attendus');
    const cookie = await signInCookie(app, administrateur.email, PASSWORD);
    const lundi = new Date();
    lundi.setUTCDate(lundi.getUTCDate() - ((lundi.getUTCDay() + 6) % 7));
    let vues = 0;
    for (let semaine = 0; semaine < 6; semaine++) {
      const debut = new Date(lundi.getTime() + semaine * 7 * 86_400_000).toISOString().slice(0, 10);
      const reponse = await app.inject({
        method: 'GET',
        url: `/api/edt/semaine?etablissementId=${campus}&debut=${debut}`,
        headers: { cookie, origin: WEB_ORIGIN },
      });
      expect(reponse.statusCode).toBe(200);
      const { seances } = reponse.json<SemaineEdt>();
      vues += seances.length;
      for (const s of seances) {
        expect(s.conflits.filter((c) => c.niveau === 'bloquant')).toEqual([]);
      }
    }
    expect(vues).toBeGreaterThan(20);
  });

  it('permet de se connecter avec un compte de démonstration', async () => {
    const [administrateur] = buildDemoDataset().comptes;
    if (!administrateur) throw new Error('Compte attendu');
    expect(await signInCookie(app, administrateur.email, PASSWORD)).toMatch(/session_token=/);
  });
});
