import { expect, test } from '@playwright/test';
import { expectNoAccessibilityViolations } from './accessibilite';
import { preparerAlternance } from './preparation-alternance';
import { seConnecter } from './session';

/** Libellé inconnu propre à chaque exécution : la fausse API mémorise les correspondances. */
const libelle = `Bois avancé ${Math.random().toString(36).slice(2, 6)}`;
const fichier = [
  'Date;Début;Fin;Module;Groupes;Intervenants;Salle;Type;Identifiant',
  '07/12/2026;08:30;10:30;M1;Promotion;;;TD;HP-1',
  `08/12/2026;14:00;16:00;${libelle};Promotion;;;CM;HP-2`,
].join('\n');

test.describe('E-04-03 import de l’emploi du temps', () => {
  test.beforeEach(async ({ page }) => {
    await seConnecter(page);
  });

  test('US-04-04 dépose un fichier, rapproche un libellé inconnu (RG-04-09), vérifie l’aperçu et importe en brouillon (RG-04-10)', async ({
    page,
  }) => {
    await preparerAlternance(page, '2062');
    await page.goto('/emploi-du-temps');
    await page.getByRole('link', { name: 'Importer un emploi du temps' }).click();
    await expect(page.getByRole('heading', { name: 'Importer un emploi du temps' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Télécharger le modèle (CSV)' })).toBeVisible();

    await page.getByLabel(/Fichier CSV, Excel/).setInputFiles({
      name: 'edt.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(fichier),
    });
    await page.getByRole('button', { name: 'Vérifier le fichier' }).click();
    await expect(page.getByRole('heading', { name: 'Libellés à rapprocher' })).toBeVisible();
    await expectNoAccessibilityViolations(page);

    await page.getByRole('button', { name: 'Enregistrer et vérifier de nouveau' }).click();
    await expect(page.getByText('Associez chaque libellé avant d’enregistrer.')).toBeVisible();
    await page
      .getByLabel(`Module « ${libelle} »`, { exact: false })
      .selectOption({ label: 'M1 · Bois' });
    await page.getByRole('button', { name: 'Enregistrer et vérifier de nouveau' }).click();

    await expect(page.getByText(/Le fichier est prêt à être importé/)).toBeVisible();
    await expect(page.getByText(/2 séance\(s\) lue\(s\) : 2 à créer/)).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Création' })).toHaveCount(2);
    await expectNoAccessibilityViolations(page);

    await page.getByRole('button', { name: 'Importer', exact: true }).click();
    await expect(page.getByText(/Import terminé/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Voir dans le planificateur' })).toBeVisible();
  });
});
