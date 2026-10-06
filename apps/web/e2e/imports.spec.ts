import { expect, test } from '@playwright/test';
import { expectNoAccessibilityViolations } from './accessibilite';
import { seConnecter } from './session';

const CSV = [
  'Nom;Prénom;Email;Remarque',
  'Benali;Inès;pas-un-email;',
  'Morel;Léo;leo@exemple.test;',
].join('\r\n');

test.describe('E-01-06 Assistant d’import', () => {
  test('US-01-05 dépose un fichier, voit les erreurs ligne par ligne et ajuste la correspondance', async ({
    page,
  }) => {
    await seConnecter(page);
    await page.goto('/personnes');
    await page.getByRole('link', { name: 'Importer' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Importer des personnes');
    await expectNoAccessibilityViolations(page);

    await page.getByLabel('Fichier CSV ou Excel').setInputFiles({
      name: 'apprenants.csv',
      mimeType: 'application/vnd.ms-excel',
      buffer: Buffer.from(CSV),
    });
    await page.getByRole('button', { name: 'Analyser le fichier' }).click();

    await expect(page.getByText('2 lignes · 1 valides · 1 en erreur')).toBeVisible();
    const ligne = page.getByRole('row').filter({ hasText: 'Adresse email invalide.' });
    await expect(ligne.getByRole('cell').first()).toHaveText('2');
    await expect(
      page.getByText('Rien n’est écrit tant que l’import n’est pas validé.'),
    ).toBeVisible();
    await expectNoAccessibilityViolations(page);

    await page
      .getByRole('combobox', { name: 'Champ pour la colonne « Email »' })
      .selectOption({ label: 'Ne pas importer' });
    await page.getByRole('button', { name: 'Appliquer la correspondance' }).click();
    await expect(page.getByText('Colonnes obligatoires à associer : Email.')).toBeVisible();
  });
});
