import { expect, test } from '@playwright/test';
import { expectNoAccessibilityViolations } from './accessibilite';
import { seConnecter } from './session';

// Un seul parcours, sur ordinateur : les choix de démarrage sont partagés par la fausse API.
test.describe('E-01-01 Liste de démarrage', () => {
  test('US-01-01 l’accueil y mène ; une étape se passe puis se reprend', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile-360', 'Choix partagés : un seul parcours');
    await seConnecter(page);
    await page.getByRole('link', { name: 'Continuer la mise en route' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Votre école est presque prête',
    );
    await expect(
      page.getByRole('navigation', { name: 'Sections des paramètres' }).getByRole('link').first(),
    ).toHaveText('Démarrage');
    await expect(page.getByRole('link', { name: 'Ouvrir « Rôles et permissions »' })).toBeVisible();
    await expectNoAccessibilityViolations(page);

    const roles = page.getByRole('listitem').filter({ hasText: 'Rôles et permissions' });
    await expect(roles.getByText('À faire')).toBeVisible();
    await page.getByRole('button', { name: 'Passer cette étape : Rôles et permissions' }).click();
    await expect(roles.getByText('Passée')).toBeVisible();
    await page.getByRole('button', { name: 'Reprendre : Rôles et permissions' }).click();
    await expect(roles.getByText('À faire')).toBeVisible();
  });
});
