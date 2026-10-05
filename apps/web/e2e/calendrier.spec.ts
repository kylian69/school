import { expect, test } from '@playwright/test';
import { expectNoAccessibilityViolations } from './accessibilite';
import { seConnecter } from './session';

test.describe('E-01-03 Calendrier de l’année', () => {
  test.beforeEach(async ({ page }) => {
    await seConnecter(page);
  });

  test('US-01-03 crée une année et ses semestres, ajoute les vacances et la démarre', async ({
    page,
  }) => {
    const libelle = `2031-2032 ${Math.random().toString(36).slice(2, 7)}`;
    await page.goto('/parametres/calendrier');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Calendrier de l’année');
    await page.getByRole('button', { name: 'Nouvelle année' }).click();
    const dialogue = page.getByRole('dialog', { name: 'Nouvelle année' });
    await dialogue.getByLabel('Libellé de l’année').fill(libelle);
    await dialogue.getByLabel('Début', { exact: true }).fill('2031-09-01');
    await dialogue.getByLabel('Fin', { exact: true }).fill('2032-08-31');
    const s1 = dialogue.getByRole('group', { name: 'Période 1' });
    await s1.getByLabel(/^Début/).fill('2031-09-01');
    await s1.getByLabel(/^Fin/).fill('2032-01-31');
    const s2 = dialogue.getByRole('group', { name: 'Période 2' });
    await s2.getByLabel(/^Début/).fill('2032-02-01');
    await s2.getByLabel(/^Fin/).fill('2032-07-10');
    await expectNoAccessibilityViolations(page);
    await dialogue.getByRole('button', { name: 'Enregistrer' }).click();

    await expect(page.getByRole('heading', { level: 2, name: libelle })).toBeVisible();
    await expect(page.getByText('En préparation', { exact: true })).toBeVisible();
    // RG-01-04 : les jours fériés sont déjà placés dans la vue annuelle.
    const novembre = page.getByRole('table', { name: 'novembre 2031' });
    await expect(novembre.getByRole('cell', { name: /^1 .*Toussaint/ })).toBeVisible();

    await page.getByRole('button', { name: 'Ajouter une fermeture' }).click();
    const fermeture = page.getByRole('dialog', { name: 'Ajouter une fermeture' });
    await fermeture.getByLabel('Libellé').fill('Vacances de Noël');
    await fermeture.getByLabel('Début').fill('2032-12-19');
    await fermeture.getByLabel('Fin').fill('2033-01-03');
    await fermeture.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(fermeture.getByText(/rester dans l’année scolaire/)).toBeVisible();
    await fermeture.getByLabel('Début').fill('2031-12-19');
    await fermeture.getByLabel('Fin').fill('2032-01-03');
    await fermeture.getByRole('button', { name: 'Enregistrer' }).click();
    const decembre = page.getByRole('table', { name: 'décembre 2031' });
    await expect(decembre.getByRole('cell', { name: /^24 .*Vacances de Noël/ })).toBeVisible();
    await expect(page.getByText('Vacances · du 19/12/2031 au 03/01/2032')).toBeVisible();
    await expectNoAccessibilityViolations(page);

    await page.getByRole('button', { name: 'Démarrer l’année' }).click();
    await expect(page.getByText('En cours', { exact: true })).toBeVisible();
  });
});
