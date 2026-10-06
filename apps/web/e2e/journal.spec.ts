import { expect, test } from '@playwright/test';
import { expectNoAccessibilityViolations } from './accessibilite';
import { seConnecter } from './session';

test.describe('E-01-08 Journal d’audit', () => {
  test.beforeEach(async ({ page }) => {
    await seConnecter(page);
  });

  test('US-01-13 consulte le journal, ouvre le détail avant et après, puis filtre', async ({
    page,
  }) => {
    await page.goto('/parametres/journal');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Journal d’audit');
    const modification = page.getByRole('listitem').filter({ hasText: 'Modification d’une fiche' });
    await expect(modification).toContainText('Camille Fictive');
    await modification.getByText('Valeurs avant et après').click();
    await expect(modification.getByText('"telephone": "06 00 00 00 01"')).toBeVisible();
    await expectNoAccessibilityViolations(page);

    await page.getByLabel('Type d’action').selectOption({ label: 'Rôles et attributions' });
    await page.getByRole('button', { name: 'Filtrer' }).click();
    await expect(page.getByText('Rôle attribué')).toBeVisible();
    await expect(page.getByText('Modification d’une fiche')).toHaveCount(0);
  });

  test('E-01-05 montre l’historique sur la fiche personne', async ({ page }) => {
    await page.goto('/personnes/01a10000-0000-7000-8000-0000000000c1');
    await expect(page.getByRole('heading', { level: 2, name: 'Historique' })).toBeVisible();
    await expect(page.getByText('Rôle attribué')).toBeVisible();
  });
});
