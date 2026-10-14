import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ROLES_PAR_DEFAUT, type ResultatActions } from '@scolaly/contracts';
import {
  attribution,
  auditEvenement,
  createDatabase,
  initialiserRolesParDefaut,
  newId,
  organisation,
  personne,
  role,
} from '@scolaly/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createPasswordAccount, type Auth } from '../src/auth/auth.js';
import { AUTH } from '../src/shared/tokens.js';
import { emailsEnFile, signInCookie, startApp, WEB_ORIGIN } from './helpers.js';

const PASSWORD = 'phrase de passe des tests des actions';
const owner = createDatabase(inject('migratorUrl'), { max: 2 });
let app: NestFastifyApplication;
const ecole = newId();
let admin: string;
let adminId: string;
let direction: string;

async function compte(email: string, code: string) {
  const { userId } = await createPasswordAccount(app.get<Auth>(AUTH), {
    email,
    name: 'Fictif',
    password: PASSWORD,
  });
  const [fiche] = await owner.db
    .insert(personne)
    .values({
      organisationId: ecole,
      nom: 'Compte',
      prenom: 'Noa',
      email,
      userId,
      compteEtat: 'actif',
    })
    .returning();
  const [leRole] = await owner.db
    .select()
    .from(role)
    .where(and(eq(role.organisationId, ecole), eq(role.code, code)));
  await owner.db.insert(attribution).values({
    organisationId: ecole,
    personneId: fiche?.id ?? '',
    roleId: leRole?.id ?? '',
    perimetreType: 'organisation',
    debut: '2026-01-01',
  });
  return fiche?.id ?? '';
}

async function fiche(nom: string, extra: Partial<typeof personne.$inferInsert> = {}) {
  const [ligne] = await owner.db
    .insert(personne)
    .values({
      organisationId: ecole,
      nom,
      prenom: 'Élève',
      email: `${nom.toLowerCase()}@exemple.test`,
      ...extra,
    })
    .returning();
  return ligne?.id ?? '';
}

const requete = (method: 'GET' | 'POST', url: string, cookie = admin, payload?: unknown) =>
  app.inject({
    method,
    url,
    headers: { cookie, origin: WEB_ORIGIN },
    ...(payload ? { payload } : {}),
  });

beforeAll(async () => {
  app = await startApp();
  await owner.db
    .insert(organisation)
    .values({ id: ecole, nom: 'École des actions', nomAffichage: 'EDA' });
  await initialiserRolesParDefaut(owner.db, ecole, ROLES_PAR_DEFAUT);
  adminId = await compte('admin.actions@exemple.test', 'administrateur');
  await compte('direction.actions@exemple.test', 'direction');
  admin = await signInCookie(app, 'admin.actions@exemple.test', PASSWORD);
  direction = await signInCookie(app, 'direction.actions@exemple.test', PASSWORD);
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe('E-01-04 actions en masse', () => {
  let premiere: string;
  let seconde: string;

  it('US-01-06 invite plusieurs personnes ; un refus n’empêche pas les autres', async () => {
    premiere = await fiche('Premiere');
    seconde = await fiche('Seconde');
    const reponse = await requete('POST', '/api/personnes/actions', admin, {
      action: 'inviter',
      personneIds: [premiere, seconde, adminId],
    });
    expect(reponse.statusCode).toBe(200);
    const resultat = reponse.json<ResultatActions>();
    expect(resultat.reussies).toBe(2);
    expect(resultat.echecs).toEqual([
      expect.objectContaining({ personneId: adminId, nom: 'Noa Compte' }),
    ]);
    const envoyes = (await emailsEnFile()).map((e) => e.to);
    expect(envoyes).toEqual(
      expect.arrayContaining(['premiere@exemple.test', 'seconde@exemple.test']),
    );
    const [lue] = await owner.db.select().from(personne).where(eq(personne.id, premiere));
    expect(lue?.compteEtat).toBe('invite');
  });

  it('US-01-12 désactive en masse, jamais le dernier administrateur, puis réactive', async () => {
    const desactivation = (
      await requete('POST', '/api/personnes/actions', admin, {
        action: 'desactiver',
        personneIds: [premiere, adminId],
      })
    ).json<ResultatActions>();
    expect(desactivation.reussies).toBe(1);
    expect(desactivation.echecs[0]?.message).toMatch(/dernier administrateur/);
    const reactivation = (
      await requete('POST', '/api/personnes/actions', admin, {
        action: 'reactiver',
        personneIds: [premiere],
      })
    ).json<ResultatActions>();
    expect(reactivation.reussies).toBe(1);
  });

  it('réserve chaque action à sa permission', async () => {
    const refus = await requete('POST', '/api/personnes/actions', direction, {
      action: 'desactiver',
      personneIds: [seconde],
    });
    expect(refus.statusCode).toBe(403);
  });
});

describe('RG-01-21 export des personnes', () => {
  it('télécharge le CSV jusqu’à 100 personnes, avec la naissance pour l’administration', async () => {
    await fiche('Naissance', { dateNaissance: '2006-03-14', matricule: 'M-1' });
    const reponse = await requete('GET', '/api/personnes/export?q=naissance');
    expect(reponse.statusCode).toBe(200);
    expect(reponse.headers['content-type']).toContain('text/csv');
    expect(reponse.body).toContain('"Date de naissance"');
    expect(reponse.body).toContain('"M-1";"";"Naissance";"";"Élève";"naissance@exemple.test"');
    expect(reponse.body).toContain('"14/03/2006"');
    const [trace] = await owner.db
      .select()
      .from(auditEvenement)
      .where(
        and(
          eq(auditEvenement.organisationId, ecole),
          eq(auditEvenement.action, 'personnes.exporter'),
        ),
      );
    expect(trace?.apres).toMatchObject({ total: 1, filtres: { q: 'naissance' } });

    const sansNaissance = await requete('GET', '/api/personnes/export?q=naissance', direction);
    expect(sansNaissance.body).not.toContain('Date de naissance');
  });

  it('envoie un lien valable 24 h au-delà de 100 personnes', async () => {
    await owner.db.insert(personne).values(
      Array.from({ length: 101 }, (_, n) => ({
        organisationId: ecole,
        nom: `Masse${String(n)}`,
        prenom: 'Élève',
        email: `masse${String(n)}@exemple.test`,
      })),
    );
    const reponse = await requete('GET', '/api/personnes/export?q=masse');
    expect(reponse.statusCode).toBe(202);
    expect(reponse.json<{ total: number }>().total).toBe(101);
    const email = (await emailsEnFile()).find(
      (e) => e.to === 'admin.actions@exemple.test' && e.subject.startsWith('Votre export'),
    );
    expect(email?.text).toMatch(/101 personnes/);

    // ADR 0007 : le lien passe par l'API, pour le seul compte qui a demandé l'export.
    const lien = /https?:\/\/\S+\/api\/fichiers\/telechargement\?jeton=[\w-]+/.exec(
      email?.text ?? '',
    )?.[0];
    expect(lien).toBeDefined();
    const chemin = new URL(lien ?? '').pathname + new URL(lien ?? '').search;
    const fichier = await app.inject({ method: 'GET', url: chemin, headers: { cookie: admin } });
    expect(fichier.statusCode, fichier.body).toBe(200);
    expect(fichier.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(fichier.headers['content-disposition']).toMatch(/filename="personnes\.csv"/);
    expect(fichier.body).toContain('"Masse100"');
    const autreCompte = await app.inject({
      method: 'GET',
      url: chemin,
      headers: { cookie: direction },
    });
    expect(autreCompte.statusCode).toBe(404);

    // RG-01-22 : le téléchargement du lien est tracé, en plus de la demande d'export.
    const traces = await owner.db
      .select()
      .from(auditEvenement)
      .where(
        and(
          eq(auditEvenement.organisationId, ecole),
          eq(auditEvenement.action, 'telechargement.fichier'),
        ),
      );
    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({
      objetType: 'export_personnes',
      apres: { type: 'text/csv; charset=utf-8' },
    });
    expect(traces[0]?.objetId).toBeTruthy();
    expect(traces[0]?.adresseIp).toBeTruthy();
    expect(JSON.stringify(traces)).not.toMatch(/jeton|Masse|personnes\.csv/);
  });
});
