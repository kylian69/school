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

  test('RG-04-11 au réimport, propose d’annuler les séances disparues, décochées par défaut, et n’annule que les cochées', async ({
    page,
  }) => {
    const lot = `R${Math.random().toString(36).slice(2, 6)}`;
    const ligne = (jour: string, identifiant: string) =>
      `${jour}/02/2027;08:30;10:30;M1;Promotion;;;TD;${lot}-${identifiant}`;
    const deposer = async (lignes: string[]) => {
      await page.getByLabel(/Fichier CSV, Excel/).setInputFiles({
        name: 'edt.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(
          ['Date;Début;Fin;Module;Groupes;Intervenants;Salle;Type;Identifiant', ...lignes].join(
            '\n',
          ),
        ),
      });
      await page.getByRole('button', { name: 'Vérifier le fichier' }).click();
      await expect(page.getByText(/Le fichier est prêt à être importé/)).toBeVisible();
    };

    await page.goto('/emploi-du-temps/import');
    await deposer([ligne('08', '1'), ligne('09', '2'), ligne('10', '3'), ligne('11', 'APPEL')]);
    await page.getByRole('button', { name: 'Importer', exact: true }).click();
    await expect(page.getByText(/Import terminé/)).toBeVisible();

    await deposer([ligne('08', '1')]);
    await expect(
      page.getByRole('heading', { name: 'Séances importées précédemment, absentes du fichier' }),
    ).toBeVisible();
    const seance2 = page.getByRole('checkbox', { name: /^Annuler 09\/02\/2027/ });
    const seance3 = page.getByRole('checkbox', { name: /^Annuler 10\/02\/2027/ });
    await expect(seance2).not.toBeChecked();
    await expect(seance3).not.toBeChecked();
    await expect(page.getByText('Non annulable : l’appel est fait')).toBeVisible();
    await expectNoAccessibilityViolations(page);

    await page.getByRole('checkbox', { name: 'Tout cocher (2 séance(s) annulable(s))' }).check();
    await expect(seance2).toBeChecked();
    await expect(seance3).toBeChecked();
    await seance3.uncheck();
    await expect(page.getByText(/1 séance\(s\) seront annulées à l’import/)).toBeVisible();

    await page.getByRole('button', { name: 'Importer', exact: true }).click();
    await expect(page.getByText(/Import terminé/)).toBeVisible();
    await expect(page.getByText(/1 séance\(s\) disparue\(s\) annulée\(s\)/)).toBeVisible();
    await expect(page.getByText('Annulée', { exact: true })).toHaveCount(1);
    await expect(page.getByText('Conservée', { exact: true })).toHaveCount(1);
    await expectNoAccessibilityViolations(page);
  });
});
