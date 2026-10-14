import { Readable } from 'node:stream';
import type { Permission } from '@scolaly/contracts';
import type { Database } from '@scolaly/db';
import { describe, expect, it } from 'vitest';
import type { Access, AccessResolver } from '../src/access/access-resolver.js';
import { JetonChiffre } from '../src/shared/jeton-chiffre.js';
import type { ObjectStorage } from '../src/shared/storage/object-storage.js';
import { TelechargementsService } from '../src/modules/fichiers/index.js';
import { dispositionPieceJointe } from '../src/modules/fichiers/telechargements.controller.js';
import { testEnv } from './helpers.js';

const organisationId = '0199c6a0-0000-7000-8000-000000000001';
const cle = `organisations/${organisationId}/contrats/0199c6a0-0000-7000-8000-000000000002`;
const contratId = '0199c6a0-0000-7000-8000-000000000002';
const fichier = {
  cle,
  nom: 'contrat Élise Durand.pdf',
  type: 'application/pdf',
  objet: { type: 'contrat', id: contratId },
} as const;
const IP = '203.0.113.7';

const acces = (changement: Partial<Access> = {}): Access => ({
  userId: 'compte-1',
  organisationId,
  personneId: 'fiche-1',
  permissions: new Set<Permission>(['contrats:lire']),
  perimetres: new Map(),
  doubleAuthentificationExigee: false,
  modules: new Set(),
  acces: 'complet',
  ...changement,
});

function service(
  options: {
    resolu?: Access | null;
    doubleAuthentification?: boolean;
    traces?: Record<string, unknown>[];
    auditEnPanne?: boolean;
    flux?: Readable;
  } = {},
) {
  const resolver: AccessResolver = {
    resolve: () => Promise.resolve(options.resolu === undefined ? acces() : options.resolu),
  };
  const storage = {
    lireFlux: (demandee: string) =>
      Promise.resolve(
        demandee === cle
          ? { flux: options.flux ?? Readable.from([Buffer.from('%PDF')]), taille: 4 }
          : null,
      ),
  } as unknown as ObjectStorage;
  // Transaction de l'école : chaque ligne d'audit insérée est relevée dans `traces`.
  const tx = {
    execute: () => Promise.resolve(),
    insert: () => ({
      values: (ligne: Record<string, unknown>) => {
        if (options.auditEnPanne) return Promise.reject(new Error('base indisponible'));
        options.traces?.push(ligne);
        return Promise.resolve();
      },
    }),
  };
  const db = {
    transaction: (travail: (t: typeof tx) => Promise<unknown>) => travail(tx),
    select: () => ({
      from: () => ({
        where: () => Promise.resolve([{ actif: options.doubleAuthentification ?? false }]),
      }),
    }),
  } as unknown as Database;
  return new TelechargementsService(testEnv(), db, storage, resolver);
}

const jetonDe = (adresse: string) => new URL(adresse, 'http://x').searchParams.get('jeton') ?? '';

describe('ADR 0007 téléchargement des fichiers par l’API', () => {
  it('donne une adresse de l’API dont le jeton ne dévoile ni le nom ni la clé', () => {
    const adresse = service().adresse(acces(), fichier, { permissions: ['contrats:lire'] });
    expect(adresse).toMatch(/^\/api\/fichiers\/telechargement\?jeton=[\w-]+$/);
    const brut = Buffer.from(jetonDe(adresse), 'base64url').toString('latin1');
    expect(brut).not.toContain('Durand');
    expect(brut).not.toContain(organisationId);
  });

  it('adresse absolue pour un email, sur l’adresse publique de l’API', () => {
    expect(service().adresseAbsolue(acces(), fichier, { permissions: ['contrats:lire'] })).toMatch(
      /^http:\/\/localhost:\d+\/api\/fichiers\/telechargement\?jeton=/,
    );
  });

  it('refuse une durée hors bornes ou un fichier d’une autre école', () => {
    const s = service();
    expect(() =>
      s.adresse(acces(), fichier, { permissions: ['contrats:lire'], dureeSecondes: 2 * 86400 }),
    ).toThrow(/Durée/);
    expect(() =>
      s.adresse(acces({ organisationId: 'autre' }), fichier, { permissions: ['contrats:lire'] }),
    ).toThrow(/école/);
  });

  it('ouvre le fichier pour le compte à qui l’adresse a été donnée', async () => {
    const s = service();
    const jeton = jetonDe(s.adresse(acces(), fichier, { permissions: ['contrats:lire'] }));
    const ouvert = await s.ouvrir(jeton, 'compte-1', IP);
    expect(ouvert).toMatchObject({ nom: fichier.nom, type: 'application/pdf', taille: 4 });
  });

  it('refuse un autre compte, une session absente ou un jeton altéré', async () => {
    const s = service();
    const jeton = jetonDe(s.adresse(acces(), fichier, { permissions: ['contrats:lire'] }));
    await expect(s.ouvrir(jeton, 'compte-2', IP)).rejects.toMatchObject({ status: 404 });
    await expect(s.ouvrir(jeton, undefined, IP)).rejects.toMatchObject({ status: 404 });
    const milieu = Math.floor(jeton.length / 2);
    const altere = `${jeton.slice(0, milieu)}${jeton[milieu] === 'A' ? 'B' : 'A'}${jeton.slice(milieu + 1)}`;
    await expect(s.ouvrir(altere, 'compte-1', IP)).rejects.toMatchObject({ status: 404 });
  });

  it('refuse une adresse expirée', async () => {
    const jetons = new JetonChiffre(
      testEnv().chiffrement.masterKeys.get(1) ?? Buffer.alloc(0),
      'telechargements',
    );
    const perime = jetons.emettre(
      { c: cle, n: 'a.pdf', t: 'application/pdf', u: 'compte-1', o: organisationId, p: [] },
      Date.now() - 1,
    );
    await expect(service().ouvrir(perime, 'compte-1', IP)).rejects.toMatchObject({ status: 404 });
  });

  it('revérifie les droits à chaque téléchargement', async () => {
    const jeton = jetonDe(service().adresse(acces(), fichier, { permissions: ['contrats:lire'] }));
    await expect(service({ resolu: null }).ouvrir(jeton, 'compte-1', IP)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      service({ resolu: acces({ permissions: new Set() }) }).ouvrir(jeton, 'compte-1', IP),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      service({ resolu: acces({ acces: 'ferme' }) }).ouvrir(jeton, 'compte-1', IP),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      service({ resolu: acces({ doubleAuthentificationExigee: true }) }).ouvrir(
        jeton,
        'compte-1',
        IP,
      ),
    ).rejects.toMatchObject({ response: { code: 'DOUBLE_AUTHENTIFICATION_REQUISE' } });
    await expect(
      service({
        resolu: acces({ doubleAuthentificationExigee: true }),
        doubleAuthentification: true,
      }).ouvrir(jeton, 'compte-1', IP),
    ).resolves.toMatchObject({ nom: fichier.nom });
  });

  it('un objet disparu du stockage est introuvable', async () => {
    const s = service();
    const jeton = jetonDe(
      s.adresse(
        acces(),
        { ...fichier, cle: `${cle}-supprime` },
        { permissions: ['contrats:lire'] },
      ),
    );
    await expect(s.ouvrir(jeton, 'compte-1', IP)).rejects.toMatchObject({ status: 404 });
  });

  it('RG-01-22 trace chaque téléchargement au journal d’audit, sans jeton ni nom de fichier', async () => {
    const traces: Record<string, unknown>[] = [];
    const s = service({ traces });
    const jeton = jetonDe(s.adresse(acces(), fichier, { permissions: ['contrats:lire'] }));
    await s.ouvrir(jeton, 'compte-1', IP);
    await s.ouvrir(jeton, 'compte-1', IP);
    expect(traces).toEqual([
      {
        action: 'telechargement.fichier',
        objetType: 'contrat',
        objetId: contratId,
        auteurId: 'compte-1',
        adresseIp: IP,
        avant: null,
        apres: { type: 'application/pdf' },
      },
      expect.objectContaining({ action: 'telechargement.fichier' }),
    ]);
    const texte = JSON.stringify(traces);
    expect(texte).not.toContain(jeton);
    expect(texte).not.toContain('Durand');
    expect(texte).not.toContain(cle);
  });

  it('un téléchargement refusé (droits, objet disparu) n’est pas tracé', async () => {
    const traces: Record<string, unknown>[] = [];
    const jeton = jetonDe(service().adresse(acces(), fichier, { permissions: ['contrats:lire'] }));
    await expect(
      service({ traces, resolu: null }).ouvrir(jeton, 'compte-1', IP),
    ).rejects.toMatchObject({ status: 403 });
    await expect(service({ traces }).ouvrir(jeton, 'compte-2', IP)).rejects.toMatchObject({
      status: 404,
    });
    expect(traces).toEqual([]);
  });

  it('refuse de remettre le fichier si la trace d’audit ne peut pas être écrite', async () => {
    const flux = Readable.from([Buffer.from('%PDF')]);
    const s = service({ auditEnPanne: true, flux });
    const jeton = jetonDe(s.adresse(acces(), fichier, { permissions: ['contrats:lire'] }));
    await expect(s.ouvrir(jeton, 'compte-1', IP)).rejects.toMatchObject({ status: 503 });
    expect(flux.destroyed).toBe(true);
  });

  it('une adresse donnée avant le suivi des téléchargements est tracée sans objet', async () => {
    const jetons = new JetonChiffre(
      testEnv().chiffrement.masterKeys.get(1) ?? Buffer.alloc(0),
      'telechargements',
    );
    const ancien = jetons.emettre(
      {
        c: cle,
        n: 'a.pdf',
        t: 'application/pdf',
        u: 'compte-1',
        o: organisationId,
        p: ['contrats:lire'],
      },
      Date.now() + 60_000,
    );
    const traces: Record<string, unknown>[] = [];
    await service({ traces }).ouvrir(ancien, 'compte-1', IP);
    expect(traces).toMatchObject([{ objetType: 'fichier', objetId: null }]);
  });

  it('force le téléchargement avec un nom ASCII de repli', () => {
    expect(dispositionPieceJointe('contrat Élise "Durand"/..\\.pdf')).toBe(
      `attachment; filename="contrat Elise _Durand__.._.pdf"; filename*=UTF-8''contrat%20%C3%89lise%20_Durand__.._.pdf`,
    );
  });
});
