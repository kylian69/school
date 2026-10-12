import { createHmac } from 'node:crypto';
import { expect, test } from '@playwright/test';

const ADMINISTRATEUR = 'administrateur@egl.demo.scolaly.test';
const SCOLARITE = 'scolarite@egl.demo.scolaly.test';
const APPRENANT = 'apprenant@egl.demo.scolaly.test';
const motDePasse = process.env.DEMO_PASSWORD ?? 'demonstration-scolaly';

/** Code TOTP (RFC 6238, SHA-1, 6 chiffres, 30 s) d'un secret en base 32. */
function codeTotp(secretBase32: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secretBase32.replace(/=+$/, '').toUpperCase())
    bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const cle = Buffer.from(bits.match(/.{8}/g)?.map((o) => parseInt(o, 2)) ?? []);
  const compteur = Buffer.alloc(8);
  compteur.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const hmac = createHmac('sha1', cle).update(compteur).digest();
  const decalage = (hmac.at(-1) ?? 0) & 0xf;
  return ((hmac.readUInt32BE(decalage) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}

test.describe('Installation Docker Compose : test de fumée', () => {
  test('sert l’interface en HTTPS avec HSTS et une CSP stricte', async ({ request }) => {
    const response = await request.get('/connexion');
    expect(response.status()).toBe(200);
    expect(response.headers()['strict-transport-security']).toMatch(/max-age=63072000/);
    expect(response.headers()['content-security-policy']).toMatch(/'strict-dynamic'/);
    expect(response.headers()['server']).toBeUndefined();
  });

  test("n'expose pas les routes internes de l'API", async ({ request }) => {
    expect((await request.get('/health')).status()).not.toBe(200);
  });

  test('connexion réelle avec un compte de démonstration, puis déconnexion', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/connexion$/);
    await page.getByLabel('Adresse email').fill(APPRENANT);
    await page.getByLabel('Mot de passe').fill(motDePasse);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Bonjour Apprenant.' })).toBeVisible();
    await expect(page.getByText(APPRENANT)).toBeVisible();

    const cookies = await page.context().cookies();
    const session = cookies.find((c) => c.name.endsWith('session_token'));
    expect(session).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax' });
    expect(session?.name).toBe('__Secure-scolaly.session_token');

    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await expect(page).toHaveURL(/\/connexion$/);
  });

  test('RG-00-13 conduit l’administrateur à mettre en place la double authentification', async ({
    page,
  }) => {
    await page.goto('/connexion');
    await page.getByLabel('Adresse email').fill(ADMINISTRATEUR);
    await page.getByLabel('Mot de passe').fill(motDePasse);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page).toHaveURL(/\/securite$/);
    await expect(page.getByText(/Votre rôle exige la double authentification/)).toBeVisible();
    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await expect(page).toHaveURL(/\/connexion$/);
  });

  test('ADR 0007 télécharge un contrat signé par l’API, sans exposer le stockage', async ({
    request,
    baseURL,
  }) => {
    const origin = new URL(baseURL ?? '').origin;
    const connexion = await request.post('/api/auth/sign-in/email', {
      headers: { origin },
      data: { email: SCOLARITE, password: motDePasse },
    });
    expect(connexion.status(), await connexion.text()).toBe(200);
    expect(
      ((await connexion.json()) as { twoFactorRedirect?: boolean }).twoFactorRedirect,
      'Double authentification déjà active : lancez ce test sur une installation neuve.',
    ).toBeFalsy();
    // La scolarité exige la double authentification (RG-00-13) : mise en place réelle.
    const activation = await request.post('/api/auth/two-factor/enable', {
      headers: { origin },
      data: { password: motDePasse },
    });
    expect(activation.status(), await activation.text()).toBe(200);
    const { totpURI } = (await activation.json()) as { totpURI: string };
    const verification = await request.post('/api/auth/two-factor/verify-totp', {
      headers: { origin },
      data: { code: codeTotp(new URL(totpURI).searchParams.get('secret') ?? '') },
    });
    expect(verification.status(), await verification.text()).toBe(200);

    const liste = await request.get('/api/contrats');
    expect(liste.status(), await liste.text()).toBe(200);
    const [contrat] = ((await liste.json()) as { contrats: { id: string }[] }).contrats;
    expect(contrat, 'Le jeu de démonstration contient des contrats.').toBeDefined();
    const pdf = Buffer.from(`%PDF-1.4\n% contrat de fumée ${String(Date.now())}\n%%EOF\n`);
    const depot = await request.put(`/api/contrats/${contrat?.id ?? ''}/document`, {
      headers: { origin, 'content-type': 'application/pdf' },
      data: pdf,
    });
    expect(depot.status(), await depot.text()).toBe(200);

    const lien = await request.get(`/api/contrats/${contrat?.id ?? ''}/document`);
    expect(lien.status(), await lien.text()).toBe(200);
    const { url } = (await lien.json()) as { url: string };
    expect(url).toMatch(/^\/api\/fichiers\/telechargement\?jeton=/);
    const fichier = await request.get(url);
    expect(fichier.status()).toBe(200);
    expect(fichier.headers()['content-type']).toBe('application/pdf');
    expect(fichier.headers()['content-disposition']).toMatch(/^attachment; filename="contrat /);
    expect(fichier.headers()['cache-control']).toBe('no-store');
    expect((await fichier.body()).equals(pdf)).toBe(true);
  });

  test('refuse un mauvais mot de passe avec un message clair', async ({ page }) => {
    await page.goto('/connexion');
    await page.getByLabel('Adresse email').fill(ADMINISTRATEUR);
    await page.getByLabel('Mot de passe').fill('pas le bon mot de passe');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: /Email ou mot de passe incorrect/ }),
    ).toBeVisible();
  });
});
