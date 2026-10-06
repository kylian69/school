import { expect, test } from '@playwright/test';
import { expectNoAccessibilityViolations } from './accessibilite';

const suffixe = () => Math.random().toString(36).slice(2, 8);

test.describe("Parcours d'activation (module 01)", () => {
  test('active son compte, accepte les conditions et arrive sur son accueil', async ({ page }) => {
    await page.goto(`/activation/valide-${suffixe()}`);
    await expect(
      page.getByText('Bonjour Nora, École de gestion de Lumerac vous invite sur Scolaly.'),
    ).toBeVisible();
    await expectNoAccessibilityViolations(page);

    await page.getByLabel('Choisissez un mot de passe').fill('une phrase de passe fictive');
    await page.getByLabel('Confirmez le mot de passe').fill('une autre phrase de passe');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Activer mon compte' }).click();
    await expect(page.getByRole('alert').filter({ hasText: /ne correspondent pas/ })).toBeVisible();

    await page.getByLabel('Confirmez le mot de passe').fill('une phrase de passe fictive');
    await page.getByRole('checkbox').uncheck();
    await page.getByRole('button', { name: 'Activer mon compte' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: /conditions d’utilisation/ }),
    ).toBeVisible();

    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Activer mon compte' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bonjour Nora.');
  });

  test('explique un lien expiré ou invalide', async ({ page }) => {
    await page.goto(`/activation/expire-${suffixe()}`);
    await expect(page.getByRole('alert').filter({ hasText: /a expiré/ })).toBeVisible();
    await page.goto('/activation/nimporte-quoi');
    await expect(page.getByRole('alert').filter({ hasText: /invalide/ })).toBeVisible();
    await expectNoAccessibilityViolations(page);
  });
});
