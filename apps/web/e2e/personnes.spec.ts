import { expect, test } from '@playwright/test';
import { expectNoAccessibilityViolations } from './accessibilite';
import { seConnecter } from './session';

test.describe('E-01-04 et E-01-05 Personnes', () => {
  test.beforeEach(async ({ page }) => {
    await seConnecter(page);
  });

  test('la liste est accessible depuis la navigation, sans violation d’accessibilité', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile-360', 'Navigation latérale propre au bureau');
    await page
      .getByRole('navigation', { name: 'Navigation principale' })
      .getByRole('link', { name: 'Personnes' })
      .click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Personnes');
    await expect(page.getByRole('link', { name: 'Fictive Camille' })).toBeVisible();
    await expectNoAccessibilityViolations(page);
  });

  test('RG-01-07 crée une fiche, signale un doublon, puis modifie l’identité', async ({ page }) => {
    const suffixe = Math.random().toString(36).slice(2, 7);
    const nom = `Benali${suffixe}`;
    await page.goto('/personnes/nouvelle');
    const remplir = async (email: string) => {
      await page.getByLabel('Prénom').fill('Inès');
      await page.getByLabel('Nom de naissance').fill(nom);
      await page.getByLabel('Email').fill(email);
      await page.getByLabel('Date de naissance').fill('2006-03-14');
    };
    await remplir(`ines.${suffixe}@exemple.test`);
    await expectNoAccessibilityViolations(page);
    await page.getByRole('button', { name: 'Créer la fiche' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Inès ${nom}`);

    // Même nom, même date : la fiche existante est proposée avant toute création.
    await page.goto('/personnes/nouvelle');
    await remplir(`homonyme.${suffixe}@exemple.test`);
    await page.getByRole('button', { name: 'Créer la fiche' }).click();
    await expect(page.getByRole('link', { name: `Ouvrir la fiche de Inès ${nom}` })).toBeVisible();
    await page
      .getByRole('button', { name: 'Ce n’est pas la même personne : créer la fiche' })
      .click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Inès ${nom}`);

    await page.getByRole('button', { name: 'Modifier' }).click();
    await page.getByLabel('Nom d’usage (facultatif)').fill(`Morel${suffixe}`);
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByRole('status')).toHaveText('Fiche enregistrée.');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Inès Morel${suffixe}`);

    await page.goto(`/personnes?q=${nom}`);
    await expect(page.getByText('2 personnes')).toBeVisible();
  });
});
