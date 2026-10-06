import { expect, test } from '@playwright/test';
import { expectNoAccessibilityViolations } from './accessibilite';

test.describe('Page de connexion', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/connexion');
  });

  test('présente le formulaire en français, avec des champs étiquetés', async ({ page }) => {
    await expect(page).toHaveTitle('Connexion · Scolaly');
    await expect(page.getByRole('heading', { level: 1, name: 'Connexion' })).toBeVisible();
    await expect(page.getByLabel('Adresse email')).toHaveAttribute('autocomplete', 'username');
    await expect(page.getByLabel('Mot de passe')).toHaveAttribute('type', 'password');
  });

  test("ACC-01 n'a aucune violation d'accessibilité détectée, en clair comme en sombre", async ({
    page,
  }) => {
    await expectNoAccessibilityViolations(page);
  });

  test('offre des cibles tactiles de 44 px au moins sur mobile', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-360', 'Exigence propre au mobile');
    for (const element of [
      page.getByRole('button', { name: 'Se connecter' }),
      page.getByLabel('Adresse email'),
    ]) {
      const box = await element.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('US-01-08 propose un lien de connexion par email, sans révéler si le compte existe', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Recevoir un lien de connexion par email' }).click();
    await page.getByLabel('Adresse email').fill('inconnu@exemple.test');
    await page.getByRole('button', { name: 'Envoyer le lien' }).click();
    await expect(page.getByRole('status')).toHaveText(/Si un compte existe pour cette adresse/);
    await expectNoAccessibilityViolations(page);
  });

  test('affiche une erreur compréhensible si la connexion échoue', async ({ page }) => {
    await page.route('**/api/auth/sign-in/email', (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }),
    );
    await page.getByLabel('Adresse email').fill('camille@exemple.test');
    await page.getByLabel('Mot de passe').fill('mauvais mot de passe');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: /Email ou mot de passe incorrect/ }),
    ).toBeVisible();
    await expect(page.getByLabel('Adresse email')).toHaveAttribute('aria-invalid', 'true');
  });
});
