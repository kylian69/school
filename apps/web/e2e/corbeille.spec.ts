import { expect, test } from '@playwright/test';
import { expectNoAccessibilityViolations } from './accessibilite';
import { seConnecter } from './session';

test.describe('E-01-10 Corbeille', () => {
  test('US-01-16 supprime une fiche puis la restaure depuis la corbeille', async ({ page }) => {
    const suffixe = Math.random().toString(36).slice(2, 7);
    const nom = `Corbeille${suffixe}`;
    await seConnecter(page);
    await page.goto('/personnes/nouvelle');
    await page.getByLabel('Prénom').fill('Zoé');
    await page.getByLabel('Nom de naissance').fill(nom);
    await page.getByLabel('Email').fill(`zoe.${suffixe}@exemple.test`);
    await page.getByRole('button', { name: 'Créer la fiche' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Zoé ${nom}`);

    await page.getByRole('button', { name: 'Supprimer la fiche' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Supprimer la fiche' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Personnes');

    await page.goto('/parametres/corbeille');
    const element = page.getByRole('listitem').filter({ hasText: `Zoé ${nom}` });
    await expect(element).toContainText('Supprimé le');
    await expect(element).toContainText('Effacement définitif le');
    await expectNoAccessibilityViolations(page);
    await element.getByRole('button', { name: `Restaurer « Zoé ${nom} »` }).click();
    await expect(page.getByRole('status')).toHaveText(`« Zoé ${nom} » est restauré.`);
    await expect(page.getByRole('listitem').filter({ hasText: `Zoé ${nom}` })).toHaveCount(0);
  });
});
