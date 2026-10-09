import { expect, test } from '@playwright/test';
import { expectNoAccessibilityViolations } from './accessibilite';
import { seConnecter } from './session';

test.describe('US-04-09 Mes connexions : agenda', () => {
  test.beforeEach(async ({ page }) => {
    await seConnecter(page);
  });

  test('RG-04-15 active, régénère puis désactive le flux iCal personnel', async ({ page }) => {
    await page.goto('/mes-connexions');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mes connexions');
    await expectNoAccessibilityViolations(page);

    // L'état de départ dépend des autres projets (fausse API partagée) : premier bouton au choix.
    await page.getByRole('button', { name: /Activer l’abonnement|Régénérer l’adresse/ }).click();
    const adresse = page.getByLabel('Adresse d’abonnement');
    await expect(adresse).toHaveValue(/\/api\/agenda\/.+\.ics$/);
    await expect(page.getByText(/Vous retrouverez cette adresse ici/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copier l’adresse' })).toBeVisible();
    await expectNoAccessibilityViolations(page);

    // US-04-09 : l'adresse est réaffichée à son propriétaire après rechargement (fausse API
    // partagée entre projets : la valeur exacte peut avoir changé entre-temps).
    await page.reload();
    await expect(adresse).toHaveValue(/\/api\/agenda\/.+\.ics$/);
    const premiere = await adresse.inputValue();

    await page.getByRole('button', { name: 'Régénérer l’adresse' }).click();
    await expect(page.getByRole('status')).toHaveText(
      'Nouvelle adresse créée : l’ancienne ne fonctionne plus.',
    );
    await expect(adresse).not.toHaveValue(premiere);

    await page.getByRole('button', { name: 'Désactiver l’abonnement' }).click();
    await expect(page.getByRole('status')).toHaveText(
      'Abonnement désactivé : votre agenda ne reçoit plus vos cours.',
    );
    await expect(adresse).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Activer l’abonnement' })).toBeVisible();
  });
});
