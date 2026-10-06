import { expect, test } from '@playwright/test';
import { expectNoAccessibilityViolations } from './accessibilite';
import { seConnecter } from './session';

/** PNG de 1 × 1 pixel, suffisant pour la fausse API. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

/** Archive ZIP vide (fin de répertoire central seule) : la fausse API répond un bilan fixe. */
const ARCHIVE_VIDE = Buffer.concat([Buffer.from([0x50, 0x4b, 0x05, 0x06]), Buffer.alloc(18)]);

test.describe('US-01-20 Photos', () => {
  test.beforeEach(async ({ page }) => {
    await seConnecter(page);
  });

  test('la scolarité dépose la photo d’une fiche, visible en tête de fiche', async ({ page }) => {
    const suffixe = Math.random().toString(36).slice(2, 7);
    await page.goto('/personnes/nouvelle');
    await page.getByLabel('Prénom').fill('Ana');
    await page.getByLabel('Nom de naissance').fill(`Photo${suffixe}`);
    await page.getByLabel('Email').fill(`ana.${suffixe}@exemple.test`);
    await page.getByRole('button', { name: 'Créer la fiche' }).click();
    await expect(page.getByText('Pas encore de photo.')).toBeVisible();

    await page
      .getByLabel('Déposer une photo')
      .setInputFiles({ name: 'ana.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByText('Photo enregistrée.')).toBeVisible();
    await expect(
      page.getByRole('img', { name: `Photo de Ana Photo${suffixe}` }).first(),
    ).toBeVisible();
    await expectNoAccessibilityViolations(page);
  });

  test('RG-01-26 chacun dépose sa photo, en attente de validation', async ({ page }) => {
    await page.goto('/mon-compte');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ma photo');
    await expectNoAccessibilityViolations(page);
    await page
      .getByLabel(/photo/i)
      .first()
      .setInputFiles({ name: 'moi.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByText('Photo envoyée : la scolarité va la valider.')).toBeVisible();
    await expect(
      page.getByText('Votre photo est en attente de validation par la scolarité.'),
    ).toBeVisible();
  });

  test('importe une archive ZIP de photos et signale les fichiers sans correspondance', async ({
    page,
  }) => {
    await page.goto('/personnes');
    await page.getByRole('link', { name: 'Importer des photos' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Importer des photos');
    await expectNoAccessibilityViolations(page);

    await page.getByLabel('Choisir l’archive ZIP').setInputFiles({
      name: 'promo.zip',
      mimeType: 'application/zip',
      buffer: ARCHIVE_VIDE,
    });
    await expect(page.getByText('2 photos associées à leur fiche.')).toBeVisible();
    await expect(page.getByText('INCONNU-42.jpg')).toBeVisible();
    await expect(page.getByText(/abimee.jpg : Seuls les formats/)).toBeVisible();
    await expectNoAccessibilityViolations(page);

    await page.getByLabel('Choisir l’archive ZIP').setInputFiles({
      name: 'faux.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from('pas une archive'),
    });
    await expect(page.getByText(/archive est illisible/)).toBeVisible();
  });
});
