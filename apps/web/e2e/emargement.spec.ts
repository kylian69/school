import { expect, test } from '@playwright/test';
import { expectNoAccessibilityViolations } from './accessibilite';
import { seConnecter } from './session';

test.describe('Module 06 Émargement', () => {
  test.beforeEach(async ({ page }) => {
    await seConnecter(page);
  });

  test('US-06-01 l’intervenant ouvre l’appel : QR rotatif, code de secours et présents en direct', async ({
    page,
  }) => {
    await page.goto('/seances');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mes séances');
    // RG-04-14 : la séance modifiée depuis peu porte le badge.
    await expect(page.getByRole('heading', { name: 'Droit des affaires Modifiée' })).toBeVisible();
    await expectNoAccessibilityViolations(page);
    await page.getByRole('link', { name: 'Ouvrir l’appel' }).click();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Droit des affaires');
    await expect(
      page.getByRole('img', { name: 'QR code d’émargement de la séance Droit des affaires' }),
    ).toBeVisible();
    await expect(page.getByTestId('code')).toHaveText(/^\d{6}$/);
    await expect(page.getByText(/Nouveau code dans \d+ s/)).toBeVisible();
    await expect(page.getByText(/\d \/ 2 présents/)).toBeVisible();
    await expect(page.getByText('Noé Petit')).toBeVisible();
    await expectNoAccessibilityViolations(page);
  });

  test('US-06-02 l’apprenant émarge avec le code à 6 chiffres', async ({ page }) => {
    await page.goto('/emarger');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Émarger');
    await expect(page.getByRole('button', { name: 'Scanner le QR code' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Droit des affaires Modifiée' })).toBeVisible();
    await expectNoAccessibilityViolations(page);

    await page.getByLabel('Code à 6 chiffres').fill('000000');
    await page.getByRole('button', { name: 'Valider le code' }).click();
    await expect(page.getByText(/Ce code n’est pas le bon/)).toBeVisible();

    await page.getByLabel('Code à 6 chiffres').fill('123456');
    await page.getByRole('button', { name: 'Valider le code' }).click();
    await expect(page.getByText('Présence enregistrée')).toBeVisible();
    await expectNoAccessibilityViolations(page);
  });
});
