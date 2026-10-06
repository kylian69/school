import { expect, test } from '@playwright/test';

const ADMINISTRATEUR = 'administrateur@egl.demo.scolaly.test';
const APPRENANT = 'apprenant@egl.demo.scolaly.test';
const motDePasse = process.env.DEMO_PASSWORD ?? 'demonstration-scolaly';

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
