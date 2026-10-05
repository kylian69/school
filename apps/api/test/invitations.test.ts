import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ROLES_PAR_DEFAUT, type InvitationPublique } from '@scolaly/contracts';
import {
  attribution,
  auditEvenement,
  createDatabase,
  initialiserRolesParDefaut,
  invitation,
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

const PASSWORD = 'mot de passe des tests d’invitation';
const owner = createDatabase(inject('migratorUrl'), { max: 2 });
let app: NestFastifyApplication;
let admin: string;
const ecole = newId();
const autreEcole = newId();

async function fiche(
  organisationId: string,
  prenom: string,
  email: string,
  userId: string | null = null,
) {
  const [ligne] = await owner.db
    .insert(personne)
    .values({
      organisationId,
      nom: 'Fictive',
      prenom,
      email,
      userId,
      compteEtat: userId ? 'actif' : 'cree',
    })
    .returning();
  return ligne?.id ?? '';
}

async function attribuer(organisationId: string, personneId: string, code: string) {
  const [leRole] = await owner.db
    .select()
    .from(role)
    .where(and(eq(role.organisationId, organisationId), eq(role.code, code)));
  await owner.db.insert(attribution).values({
    organisationId,
    personneId,
    roleId: leRole?.id ?? '',
    perimetreType: 'organisation',
    debut: '2026-01-01',
  });
}

const inviter = (personneId: string, cookie = admin) =>
  app.inject({
    method: 'POST',
    url: `/api/comptes/${personneId}/invitation`,
    headers: { cookie, origin: WEB_ORIGIN },
  });

/** Dernier lien d'activation envoyé à une adresse. */
async function lienPour(email: string): Promise<string> {
  const emails = (await emailsEnFile()).filter((e) => e.to === email);
  const jeton = /\/activation\/([^\s]+)/.exec(emails.at(-1)?.text ?? '')?.[1];
  if (!jeton) throw new Error(`Aucun email d'invitation pour ${email}`);
  return jeton;
}

const activer = (jeton: string, payload: Record<string, unknown>) =>
  app.inject({
    method: 'POST',
    url: `/api/invitations/${jeton}/activation`,
    headers: { origin: WEB_ORIGIN },
    payload,
  });

beforeAll(async () => {
  app = await startApp();
  for (const [id, nom] of [
    [ecole, 'École des invitations'],
    [autreEcole, 'Autre école du groupe'],
  ] as const) {
    await owner.db.insert(organisation).values({ id, nom, nomAffichage: nom.slice(0, 3) });
    await initialiserRolesParDefaut(owner.db, id, ROLES_PAR_DEFAUT);
  }
  const { userId } = await createPasswordAccount(app.get<Auth>(AUTH), {
    email: 'admin.invitations@exemple.test',
    name: 'Admin',
    password: PASSWORD,
  });
  await attribuer(
    ecole,
    await fiche(ecole, 'Admin', 'admin.invitations@exemple.test', userId),
    'administrateur',
  );
  admin = await signInCookie(app, 'admin.invitations@exemple.test', PASSWORD);
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe('US-01-06 et RG-01-08 invitations', () => {
  it("envoie l'invitation : compte « invité », email avec un lien, trace d'audit", async () => {
    const lea = await fiche(ecole, 'Léa', 'lea@exemple.test');
    const reponse = await inviter(lea);
    expect(reponse.statusCode).toBe(200);
    expect(reponse.json()).toMatchObject({ etat: 'invite' });
    const [ligne] = await owner.db.select().from(personne).where(eq(personne.id, lea));
    expect(ligne?.compteEtat).toBe('invite');
    const email = (await emailsEnFile()).find((e) => e.to === 'lea@exemple.test');
    expect(email?.subject).toBe('Activez votre compte Scolaly · École des invitations');
    expect(email?.text).toMatch(
      new RegExp(`http://localhost:3001/activation/${ecole}\\.[A-Za-z0-9_-]{43}`),
    );
    const [stockee] = await owner.db
      .select()
      .from(invitation)
      .where(eq(invitation.personneId, lea));
    expect(email?.text).not.toContain(stockee?.jetonEmpreinte ?? 'absent');
    const traces = await owner.db
      .select()
      .from(auditEvenement)
      .where(eq(auditEvenement.objetId, lea));
    expect(traces.map((t) => t.action)).toContain('compte.inviter');
  });

  it('présente une invitation valide, puis active le compte une seule fois', async () => {
    const hugo = await fiche(ecole, 'Hugo', 'hugo@exemple.test');
    await inviter(hugo);
    const jeton = await lienPour('hugo@exemple.test');
    const consultation = (
      await app.inject({ method: 'GET', url: `/api/invitations/${jeton}` })
    ).json<InvitationPublique>();
    expect(consultation).toMatchObject({
      etat: 'valide',
      prenom: 'Hugo',
      ecole: 'École des invitations',
    });

    expect(
      (await activer(jeton, { motDePasse: 'court', conditionsAcceptees: true })).statusCode,
    ).toBe(400);
    const sansConditions = await activer(jeton, {
      motDePasse: PASSWORD,
      conditionsAcceptees: false,
    });
    expect(JSON.stringify(sansConditions.json())).toMatch(/conditions d’utilisation/);

    const activation = await activer(jeton, { motDePasse: PASSWORD, conditionsAcceptees: true });
    expect(activation.json()).toEqual({ email: 'hugo@exemple.test', compteExistant: false });
    expect(await signInCookie(app, 'hugo@exemple.test', PASSWORD)).toMatch(/session_token/);
    const [ligne] = await owner.db.select().from(personne).where(eq(personne.id, hugo));
    expect(ligne).toMatchObject({ compteEtat: 'actif' });
    expect(ligne?.userId).not.toBeNull();
    expect(ligne?.conditionsAccepteesLe).not.toBeNull();

    const deuxieme = await activer(jeton, { motDePasse: PASSWORD, conditionsAcceptees: true });
    expect(deuxieme.statusCode).toBe(410);
    expect(deuxieme.json<{ message: string }>().message).toMatch(/déjà servi/);
  });

  it('un renvoi révoque le lien précédent ; un compte actif ne se réinvite pas', async () => {
    const ines = await fiche(ecole, 'Inès', 'ines@exemple.test');
    await inviter(ines);
    const premier = await lienPour('ines@exemple.test');
    await inviter(ines);
    const consultation = await app.inject({ method: 'GET', url: `/api/invitations/${premier}` });
    expect(consultation.json<InvitationPublique>().etat).toBe('revoquee');
    const second = await lienPour('ines@exemple.test');
    await activer(second, { motDePasse: PASSWORD, conditionsAcceptees: true });
    const encore = await inviter(ines);
    expect(encore.statusCode).toBe(409);
    expect(encore.json<{ message: string }>().message).toMatch(/déjà activé/);
  });

  it('refuse un lien expiré, falsifié ou mal formé', async () => {
    const yanis = await fiche(ecole, 'Yanis', 'yanis@exemple.test');
    await inviter(yanis);
    const jeton = await lienPour('yanis@exemple.test');
    expect(
      (await app.inject({ method: 'GET', url: `/api/invitations/${jeton.slice(0, -4)}AAAA` }))
        .statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'GET', url: '/api/invitations/pas-un-jeton' })).statusCode,
    ).toBe(404);
    await owner.db
      .update(invitation)
      .set({ expireLe: new Date('2026-01-01') })
      .where(eq(invitation.personneId, yanis));
    const expire = await activer(jeton, { motDePasse: PASSWORD, conditionsAcceptees: true });
    expect(expire.statusCode).toBe(410);
    expect(expire.json<{ message: string }>().message).toMatch(/expiré/);
  });

  it('RG-00-26 rattache le compte existant de la même personne, sans changer son mot de passe', async () => {
    const adminAutre = await fiche(autreEcole, 'Admin', 'admin.invitations@exemple.test');
    const { userId } = await createPasswordAccount(app.get<Auth>(AUTH), {
      email: 'admin.autre@exemple.test',
      name: 'Admin Autre',
      password: PASSWORD,
    });
    await attribuer(
      autreEcole,
      await fiche(autreEcole, 'Admin', 'admin.autre@exemple.test', userId),
      'administrateur',
    );
    const cookieAutre = await signInCookie(app, 'admin.autre@exemple.test', PASSWORD);
    await inviter(adminAutre, cookieAutre);
    const jeton = await lienPour('admin.invitations@exemple.test');
    const activation = await activer(jeton, {
      motDePasse: 'un tout autre mot de passe',
      conditionsAcceptees: true,
    });
    expect(activation.json()).toEqual({
      email: 'admin.invitations@exemple.test',
      compteExistant: true,
    });
    expect(await signInCookie(app, 'admin.invitations@exemple.test', PASSWORD)).toMatch(
      /session_token/,
    );
  });

  it("exige le droit d'inviter", async () => {
    const { userId } = await createPasswordAccount(app.get<Auth>(AUTH), {
      email: 'apprenant.invitations@exemple.test',
      name: 'Apprenant',
      password: PASSWORD,
    });
    await attribuer(
      ecole,
      await fiche(ecole, 'Apprenant', 'apprenant.invitations@exemple.test', userId),
      'apprenant',
    );
    const cookie = await signInCookie(app, 'apprenant.invitations@exemple.test', PASSWORD);
    expect((await inviter(await fiche(ecole, 'Zoé', 'zoe@exemple.test'), cookie)).statusCode).toBe(
      403,
    );
  });
});
