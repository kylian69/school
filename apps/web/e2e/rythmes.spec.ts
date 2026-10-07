import { expect, test } from '@playwright/test';
import { expectNoAccessibilityViolations } from './accessibilite';
import { preparerAlternance } from './preparation-alternance';
import { seConnecter } from './session';

test.describe('Module 03 · rythmes d’alternance', () => {
  test.beforeEach(async ({ page }) => {
    await seConnecter(page);
  });

  test('US-03-04 génère le calendrier d’une promotion, le retouche et ajoute une exception (US-03-05)', async ({
    page,
  }) => {
    const { promotion, nom } = await preparerAlternance(page, '2054');
    await page.goto(`/promotions/${promotion.id}?vue=rythme`);
    await expect(page.getByText(/Aucun calendrier d’alternance/)).toBeVisible();
    await expectNoAccessibilityViolations(page);

    await page
      .getByLabel('Modèle')
      .selectOption({ label: '2 jours école (lundi, mardi) / 3 jours entreprise' });
    await page.getByRole('button', { name: 'Générer le calendrier' }).click();
    await expect(page.getByText(/Généré à partir du modèle/)).toBeVisible();
    await expect(page.getByRole('list', { name: 'Légende et nombre de jours' })).toContainText(
      'École : 105 j',
    );

    // Retouche : le mardi 1er septembre 2054 devient un jour d'examen.
    await page.getByLabel('Type à appliquer aux jours choisis').selectOption('examen');
    await page.getByRole('button', { name: 'mardi 1 septembre 2054 : École' }).click();
    await page.getByRole('button', { name: 'Enregistrer 1 retouche' }).click();
    await expect(
      page.getByRole('button', { name: 'mardi 1 septembre 2054 : Examen' }),
    ).toBeVisible();
    await expectNoAccessibilityViolations(page);

    await page.getByRole('button', { name: 'Nouvelle exception' }).click();
    const exception = page.getByRole('dialog', { name: 'Nouvelle exception' });
    await exception.getByLabel('Apprenant').selectOption({ label: nom });
    await exception.getByLabel('Début').fill('2055-01-04');
    await exception.getByLabel('Fin', { exact: true }).fill('2055-01-31');
    await exception.getByLabel('Motif (facultatif)').fill('Entreprise saisonnière');
    await expect(exception.getByText(/N’y indiquez jamais de donnée de santé/)).toBeVisible();
    await expectNoAccessibilityViolations(page);
    await exception.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText(`${nom} · du 04/01/2055 au 31/01/2055`)).toBeVisible();
  });

  test('RG-03-10 crée un modèle de rythme de l’école', async ({ page }) => {
    const { promotion } = await preparerAlternance(page, '2056');
    await page.goto(`/promotions/${promotion.id}?vue=rythme`);
    await page.getByRole('button', { name: 'Nouveau modèle' }).click();
    const dialogue = page.getByRole('dialog', { name: 'Nouveau modèle' });
    const libelle = `Lundi école ${Math.random().toString(36).slice(2, 6)}`;
    await dialogue.getByLabel('Nom du modèle').fill(libelle);
    await dialogue.getByLabel('Mardi, semaine 1').selectOption('entreprise');
    await expectNoAccessibilityViolations(page);
    await dialogue.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByLabel('Modèle').locator('option', { hasText: libelle })).toHaveCount(1);
  });
});
